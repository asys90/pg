/* Eventos ao vivo (Fase 3 do painel): multiplicador de EXP e de shiny, densidade de selvagens, aviso global e modo manutenção.
 *
 * Estado em public/data/eventos.json (o painel → 🎉 Eventos ao vivo grava pelas rotas /admin/eventos*, com backup):
 *   { nome, expMult, shinyMult, densidade, inicio, fim, manutencao: { ativa, inicio, texto } }
 *   inicio/fim = ISO (opcional): fora da janela os multiplicadores valem 1. Sem arquivo = tudo 1, sem manutenção.
 * O servidor EMPURRA o efetivo pros jogadores online ({t:'evento', …}: ao salvar, ao entrar e quando a janela abre/fecha — o
 * cliente aplica em evento.mjs) e usa o shinyMult na captura (taxaShiny do servidor.mjs).
 * Aviso global = {t:'invasao', texto}: o letreiro passante do topo, que também cai no chat de Sistema.
 * Manutenção: derruba quem não é GM ({t:'saia'}), recusa login e entrada no WS de quem não é GM. Agendada (inicio no futuro):
 * avisa todo mundo a 10, 5 e 1 minuto e liga sozinha na hora. */
import fs from 'node:fs';
import nodePath from 'node:path';

export const PADRAO = { nome: '', expMult: 1, shinyMult: 1, densidade: 1, inicio: null, fim: null, manutencao: { ativa: false, inicio: null, texto: '' } };
const TEXTO_MANUTENCAO = 'O jogo está em manutenção. Volte daqui a pouco!';
const LIMITES = { expMult: [0.1, 10], shinyMult: [1, 100], densidade: [0.25, 3] };
const ms = iso => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? t : null; };

/** Valida o que veio do painel. Devolve { v } ou { erro }. Campo ausente = o padrão. */
export function limparEvento(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { erro: 'Formato inválido.' };
  const v = { nome: String(d.nome ?? '').trim().slice(0, 60) };
  for (const [k, [min, max]] of Object.entries(LIMITES)) {
    const n = d[k] === undefined || d[k] === '' || d[k] === null ? 1 : Number(d[k]);
    if (!Number.isFinite(n) || n < min || n > max) return { erro: `${k}: use um número de ${min} a ${max}.` };
    v[k] = Math.round(n * 100) / 100;
  }
  for (const k of ['inicio', 'fim']) {
    if (d[k] == null || d[k] === '') { v[k] = null; continue; }
    const t = ms(d[k]); if (t == null) return { erro: `${k}: data inválida.` };
    v[k] = new Date(t).toISOString();
  }
  if (v.inicio && v.fim && ms(v.fim) <= ms(v.inicio)) return { erro: 'O fim precisa ser depois do início.' };
  const mt = d.manutencao && typeof d.manutencao === 'object' ? d.manutencao : {};
  const inicioM = mt.inicio == null || mt.inicio === '' ? null : ms(mt.inicio);
  if (mt.inicio && inicioM == null) return { erro: 'Manutenção: data inválida.' };
  v.manutencao = { ativa: mt.ativa === true, inicio: inicioM ? new Date(inicioM).toISOString() : null, texto: String(mt.texto ?? '').trim().slice(0, 200) };
  return { v };
}

/** h = { dadosPub, conexoes, contas, sessoes, enviar, derrubar, logAdmin, gravarComBackup } (servidor.mjs). */
export function criarEventos(h) {
  const { dadosPub, conexoes, contas, sessoes, enviar, derrubar, logAdmin, gravarComBackup } = h;
  const ARQ = nodePath.join(dadosPub, 'eventos.json');
  let cache = { mtime: -1, v: PADRAO };
  function ler() {                                                        // relê só quando o arquivo muda (o painel ou alguém à mão)
    try {
      const mt = fs.statSync(ARQ).mtimeMs;
      if (mt !== cache.mtime) { const r = limparEvento(JSON.parse(fs.readFileSync(ARQ, 'utf8'))); cache = { mtime: mt, v: r.v || PADRAO }; }
    } catch { cache = { mtime: -1, v: PADRAO }; }
    return cache.v;
  }
  /** O que vale AGORA (fora da janela inicio/fim: tudo 1). */
  function efetivo(agora = Date.now()) {
    const e = ler(), ini = ms(e.inicio), fim = ms(e.fim);
    const vale = (ini == null || agora >= ini) && (fim == null || agora < fim);
    return vale ? { nome: e.nome, expMult: e.expMult, shinyMult: e.shinyMult, densidade: e.densidade, fim: e.fim }
      : { nome: '', expMult: 1, shinyMult: 1, densidade: 1, fim: null, proximo: ini != null && agora < ini ? e.inicio : null };
  }
  const manutencaoAgora = (agora = Date.now()) => { const m = ler().manutencao; return !!m?.ativa && (ms(m.inicio) == null || agora >= ms(m.inicio)); };
  const textoManutencao = () => ler().manutencao?.texto || TEXTO_MANUTENCAO;
  const ehGm = u => !!contas[u]?.gm;
  const msgEvento = (e = efetivo()) => ({ t: 'evento', nome: e.nome, expMult: e.expMult, shinyMult: e.shinyMult, densidade: e.densidade, fim: e.fim });
  const todos = obj => { let n = 0; for (const w of conexoes.values()) if (w._info) { enviar(w, obj); n++; } return n; };

  function avisar(g, texto) {
    texto = String(texto || '').trim().slice(0, 200);
    if (!texto) return { erro: 'Escreva o aviso.' };
    const n = todos({ t: 'invasao', texto });
    logAdmin(g, '*', 'aviso global', { depois: { texto, jogadores: n } });
    return { n };
  }
  /** Derruba todo mundo que não é GM (manutenção). */
  function derrubarTodos() {
    let n = 0;
    for (const w of [...conexoes.values()]) {
      if (ehGm(w._usuario)) continue;
      if (contas[w._usuario]) n += derrubar(w._usuario, textoManutencao());
      else { enviar(w, { t: 'saia', texto: textoManutencao() }); setTimeout(() => { try { w.close(); } catch {} }, 300); n++; }   // visitante (sem conta)
    }
    return n;
  }

  // ── Relógio: empurra quando a janela do evento abre/fecha; liga a manutenção agendada (com aviso a 10, 5 e 1 min) ──
  let ultimo = JSON.stringify(msgEvento()), manutAntes = manutencaoAgora(), avisados = new Set();
  function tique() {
    const agora = Date.now(), e = efetivo(agora), s = JSON.stringify(msgEvento(e));
    if (s !== ultimo) {
      const antes = JSON.parse(ultimo); ultimo = s; todos(msgEvento(e));
      if (antes.expMult !== 1 || antes.shinyMult !== 1 || antes.densidade !== 1) { if (e.expMult === 1 && e.shinyMult === 1 && e.densidade === 1) todos({ t: 'sistema', texto: '🎉 O evento' + (antes.nome ? ' "' + antes.nome + '"' : '') + ' acabou. Obrigado por jogar!' }); }
    }
    const m = ler().manutencao, ini = ms(m?.inicio);
    if (m?.ativa && ini != null && agora < ini) {
      const falta = Math.ceil((ini - agora) / 60000), k = [1, 5, 10].find(k => falta <= k);
      if (k && !avisados.has(ini + ':' + k)) {                            // a menor faixa que já chegou; marca as maiores junto (agendou a 3 min: avisa 1× só, não 3)
        for (const j of [1, 5, 10]) if (j >= k) avisados.add(ini + ':' + j);
        todos({ t: 'invasao', texto: `Manutenção em ${falta} minuto${falta > 1 ? 's' : ''}. Termine a batalha e guarde o progresso.` });
      }
    }
    const agoraManut = manutencaoAgora(agora);
    if (agoraManut && !manutAntes) { const n = derrubarTodos(); console.log(`[eventos] manutenção ligada (${n} desconectado(s))`); }
    manutAntes = agoraManut;
  }
  setInterval(tique, 15000).unref?.();

  /** Chamado no `entrar` do WS. Devolve true se a entrada foi recusada (manutenção). */
  function aoEntrar(ws, u) {
    if (manutencaoAgora() && !ehGm(u)) { enviar(ws, { t: 'saia', texto: textoManutencao() }); setTimeout(() => { try { ws.close(); } catch {} }, 300); return true; }
    const e = efetivo();
    if (e.nome || e.expMult !== 1 || e.shinyMult !== 1 || e.densidade !== 1) enviar(ws, msgEvento(e));
    return false;
  }
  /** Login: texto do erro se a conta não pode entrar agora (manutenção), senão null. */
  const bloqueiaLogin = c => (manutencaoAgora() && !c?.gm) ? textoManutencao() : null;

  /** Rotas do painel (só GM; o servidor.mjs já conferiu). Devolve true se tratou. */
  function rota(rota, metodo, d, g, json) {
    if (rota === '/admin/eventos' && metodo === 'GET') {
      const online = [...conexoes.values()].filter(w => w._info).length;
      json(200, { ok: true, dados: ler(), efetivo: efetivo(), manutencaoAgora: manutencaoAgora(), online }); return true;
    }
    if (rota === '/admin/eventos' && metodo === 'POST') {
      const r = limparEvento(d.dados);
      if (r.erro) { json(400, { erro: r.erro }); return true; }
      const antes = ler();
      gravarComBackup(ARQ, r.v); cache.mtime = -1;
      if (!r.v.manutencao.ativa || ms(r.v.manutencao.inicio) !== ms(antes.manutencao?.inicio)) avisados = new Set();
      logAdmin(g, '*', 'eventos', { antes, depois: r.v });
      const e = efetivo(); ultimo = JSON.stringify(msgEvento(e));
      const n = todos(msgEvento(e));                                       // aplica na hora em quem está online
      if (e.nome && (e.expMult !== 1 || e.shinyMult !== 1 || e.densidade !== 1) && d.anunciar) todos({ t: 'invasao', texto: '🎉 Evento: ' + e.nome + textoMult(e) });
      let derrubou = 0;
      const agoraManut = manutencaoAgora();
      if (agoraManut && !manutAntes) derrubou = derrubarTodos();
      manutAntes = agoraManut;
      console.log(`[admin] ${g} salvou eventos (EXP ×${e.expMult}, shiny ×${e.shinyMult}, densidade ×${e.densidade}${agoraManut ? ', MANUTENÇÃO' : ''})`);
      json(200, { ok: true, dados: ler(), efetivo: e, manutencaoAgora: agoraManut, jogadores: n, derrubou }); return true;
    }
    if (rota === '/admin/eventos/aviso' && metodo === 'POST') {
      const r = avisar(g, d.texto);
      if (r.erro) json(400, { erro: r.erro }); else json(200, { ok: true, jogadores: r.n });
      return true;
    }
    return false;
  }
  const textoMult = e => [e.expMult !== 1 ? `EXP ×${e.expMult}` : '', e.shinyMult !== 1 ? `shiny ×${e.shinyMult}` : '', e.densidade !== 1 ? `selvagens ×${e.densidade}` : ''].filter(Boolean).map(s => ' · ' + s).join('');

  return { efetivo, shinyMult: () => efetivo().shinyMult, avisar, aoEntrar, bloqueiaLogin, rota };
}
