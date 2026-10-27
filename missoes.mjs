import { t as tr } from './i18n.mjs';   // IDIOMA (11/09, etapa 2): o tracker traduz
/* Motor de missões (caps 1–20 de Kanto): a cadeia principal é linear, cada missão tem passos que o jogo
   consegue verificar sozinho. O index.html manda EVENTOS (falou com NPC, chegou numa área, capturou,
   derrotou, subiu de nível, escolheu o inicial, curou, insígnia) e o motor avança, paga a recompensa
   e devolve o texto do tracker. Dados: data/missoes.json (gerado por tools/missoes_kanto.mjs).

   Tipos de passo:
     falar    { cfg | cfgs }              — conversar com o NPC (fala extra da missão em `fala`)
     ir       { area }                    — chegar na área (id do mapa)
     capturar { n, dex? }                 — capturar n Pokémon (opcional: só dos dex listados)
     derrotar { n, treinador?|selvagem, area?, cfg? } — vencer n treinadores (ou selvagens)
     entregar { cfg, item, n? }           — levar item pro NPC (consome)
     item     { item, n? }                — ter o item na mochila
     nivel    { lv }                      — algum Pokémon do time no nível
     inicial  {}                          — escolher o inicial na mesa do Oak
     curar    { cena?, cfg? }             — curar o time com a Joy (com `cena`, só no Centro daquela cena)
     insignia { n }                       — ter n insígnias (ginásios: quando existirem)
   Estado em localStorage `missoes`: { atual, passo, prog, feitas }. */
let ctx = null, dados = null, estado = null;
const LS = 'missoes';

export async function instalar(c){
  ctx = c;
  if (pendente){ ctx.gravarLS(LS, pendente); pendente = null; }           // o servidor falou antes do instalar: o estado dele vale
  dados = await fetch('./data/missoes.json').then(r => r.json()).catch(e => { console.warn('missoes.json:', e); return { capitulos: [] }; });
  estado = ctx.lerLS(LS, null);
  if (estado){                                                            // estado antigo/malformado (sem feitas/prog): completa em vez de quebrar ("reading 'includes'")
    estado.feitas = Array.isArray(estado.feitas) ? estado.feitas : [];
    estado.prog = estado.prog && typeof estado.prog === 'object' ? estado.prog : {};
    estado.passo = Number.isInteger(estado.passo) ? estado.passo : 0;
    if (estado.atual !== null && !porId(estado.atual)){ estado.atual = primeiraMissao()?.id ?? null; estado.passo = 0; }
    gravar();
  }
  if (!estado){
    estado = { atual: primeiraMissao()?.id || null, passo: 0, prog: {}, feitas: [] };
    // quem já jogava antes do motor: inicial escolhido = capítulo 1 já começou; não perde nada, só reconta os passos
    gravar();
  }
  checarImediatos();
  return true;
}
const todas = () => (dados?.capitulos || []).flatMap(c => c.missoes.map(m => ({ ...m, capitulo: c.id, capNome: c.nome })));
const primeiraMissao = () => todas()[0] || null;
const porId = id => todas().find(m => m.id === id) || null;
const proxima = id => { const l = todas(); const i = l.findIndex(m => m.id === id); return i >= 0 ? (l[i + 1] || null) : null; };
const gravar = () => ctx.gravarLS(LS, estado);

export function ativa(){ return estado?.atual ? porId(estado.atual) : null; }
export function passoAtual(){ const m = ativa(); return m ? (m.passos[estado.passo] || null) : null; }
export function estadoDe(id){ if (estado.feitas.includes(id)) return 'feita'; if (estado.atual === id) return 'ativa'; return 'travada'; }
export function progresso(){ return estado.prog[estado.atual + ':' + estado.passo] || 0; }
export function indicePasso(){ return estado?.passo ?? 0; }
export function pronto(){ return !!dados; }
export function capitulos(){ return (dados?.capitulos || []).map(c => ({ ...c, missoes: c.missoes.map(m => ({ ...m, estado: estadoDe(m.id) })) })); }
export function reiniciar(){ estado = { atual: primeiraMissao()?.id || null, passo: 0, prog: {}, feitas: [] }; gravar(); ctx.pintar?.(); }

/* ---------------------------------------------------------------- avanço */
function concluirPasso(){
  const m = ativa(); if (!m) return;
  const p = m.passos[estado.passo];
  ctx.aviso?.('✔ ' + (p?.texto || 'passo concluído'));
  estado.passo++;
  if (estado.passo >= m.passos.length) concluirMissao(m);
  else { gravar(); checarImediatos(); }
  ctx.pintar?.();
}
function concluirMissao(m){
  estado.feitas.push(m.id);
  const prox = proxima(m.id);
  estado.atual = prox ? prox.id : null; estado.passo = 0;
  gravar();
  ctx.recompensa?.(m.recompensa || {}, m);
  ctx.aviso?.('🏁 Missão concluída: ' + m.nome, { destaque: true });
  if (prox) ctx.aviso?.('📜 Nova missão: ' + prox.nome);
  else ctx.aviso?.('Você concluiu tudo o que existe por enquanto — mais capítulos vêm com as próximas versões.');
  checarImediatos();
}
/** Passos que já podem estar satisfeitos na hora em que ficam ativos (área atual, nível, inicial, item, insígnia). */
function checarImediatos(){
  for (let guarda = 0; guarda < 20; guarda++){
    const p = passoAtual(); if (!p) return;
    let ok = false;
    if (p.tipo === 'ir') ok = ctx.areaAtual?.() === p.area;
    else if (p.tipo === 'nivel') ok = (ctx.maiorNivel?.() || 0) >= p.lv;
    else if (p.tipo === 'inicial') ok = !!ctx.lerLS('inicial', null);
    else if (p.tipo === 'item') ok = (ctx.lerLS('itens', {})[p.item] || 0) >= (p.n || 1);
    else if (p.tipo === 'insignia') ok = (ctx.insignias?.() || 0) >= p.n;
    if (!ok) return;
    concluirPasso();
  }
}
/** Evento do jogo → avança o passo se casar. Devolve true quando algo mudou. */
/* PASSO 5: com conta, quem confere os passos é o SERVIDOR (`servidor/missao.mjs`). Ele manda o estado inteiro e o jogo só
   mostra; sem conta, o motor daqui continua sendo o dono. */
let doServidor = false;
let pendente = null;                                                      // 26/10: o servidor local manda a `missao` junto do bemvindo, antes do instalar
export function aplicarDoServidor(novo){
  if (!novo || typeof novo !== 'object') return false;
  doServidor = true;
  estado = { atual: novo.atual ?? null, passo: novo.passo || 0, prog: novo.prog || {}, feitas: Array.isArray(novo.feitas) ? novo.feitas : [] };
  if (!ctx){ pendente = estado; return true; }
  gravar();
  ctx.pintar?.();                                                         // o rastreador da HUD mostra o passo novo
  return true;
}
export const servidorNoComando = () => doServidor;
/** Com conta, o servidor manda desde o boot (12/09): antes o motor daqui avançava e pagava sozinho até chegar a 1ª mensagem `missao`. */
export function assumirServidor(){ doServidor = true; }
/* Com conta, estes eventos só existem no aparelho: o servidor local precisa ouvir `missao_<tipo>` (27/10 — antes só o falar
   chegava e os passos derrotar/curar/nível/insígnia nunca avançavam). Área tem aviso próprio no index (número + reconexão);
   captura e inicial o servidor já conta na posse; falar o index manda. */
const AVISAR_SERVIDOR = new Set(['selvagem', 'treinador', 'cura', 'nivel', 'insignia']);
export function evento(ev){
  if (AVISAR_SERVIDOR.has(ev?.tipo)) ctx?.avisarServidor?.(ev);
  if (doServidor) return false;                                           // o servidor é quem marca; o cliente só avisa (index: missao_falar)
  const p = passoAtual(); if (!p || !ev) return false;
  const chave = estado.atual + ':' + estado.passo;
  const conta = (n) => { estado.prog[chave] = (estado.prog[chave] || 0) + 1; gravar(); ctx.pintar?.(); if (estado.prog[chave] >= n){ concluirPasso(); return true; } return true; };
  const cfgOk = (alvo, cfg) => alvo == null || cfg == null ? false : (Array.isArray(alvo) ? alvo.map(String).includes(String(cfg)) : String(alvo) === String(cfg));
  switch (p.tipo){
    case 'falar':
      if (ev.tipo === 'falar' && cfgOk(p.cfgs || p.cfg, ev.cfg)){ concluirPasso(); return true; }
      return false;
    case 'entregar':
      if (ev.tipo === 'falar' && cfgOk(p.cfg, ev.cfg)){
        const it = ctx.lerLS('itens', {}); const n = p.n || 1;
        if ((it[p.item] || 0) < n){ ctx.aviso?.('Você ainda não tem ' + (ctx.nomeItem?.(p.item) || 'o item') + ' ×' + n + '.'); return false; }
        if (!ctx.usarItem?.(p.item, n)){ it[p.item] -= n; if (it[p.item] <= 0) delete it[p.item]; ctx.gravarLS('itens', it); }   // com conta quem tira o item é o SERVIDOR (senão o portão devolvia)
        concluirPasso(); return true;
      }
      return false;
    case 'ir':
      if (ev.tipo === 'area' && ev.area === p.area){ concluirPasso(); return true; }
      return false;
    case 'capturar':
      if (ev.tipo === 'captura' && (!p.dex || p.dex.includes(ev.dex))) return conta(p.n || 1);
      return false;
    case 'derrotar':
      if (p.selvagem){ if (ev.tipo === 'selvagem' && (!p.dex || p.dex.includes(ev.dex)) && (!p.area || ev.area === p.area)) return conta(p.n || 1); return false; }
      if (ev.tipo === 'treinador' && (!p.cfg || cfgOk(p.cfg, ev.cfg)) && (!p.area || ev.area === p.area)) return conta(p.n || 1);
      return false;
    case 'nivel':
      if (ev.tipo === 'nivel' && ev.lv >= p.lv){ concluirPasso(); return true; }
      return false;
    case 'inicial':
      if (ev.tipo === 'inicial'){ concluirPasso(); return true; }
      return false;
    /* CENA DO PASSO (20/09, chaospider: "fui até o centro pokémon de Viridian e falando com a Joy lá, consegui finalizar a
       missão... tanto por não finalizar corretamente na Liga quanto por concluir em outro local que não deveria"): o passo
       'curar' da missão 1501 pede a Joy DA LIGA ÍNDIGO, e qualquer Centro fechava. Passo com `cena` só conta naquela cena. */
    case 'curar':
      if (ev.tipo === 'cura' && (!p.cfg || cfgOk(p.cfg, ev.cfg)) && (!p.cena || String(p.cena) === String(ev.cena))){ concluirPasso(); return true; }
      return false;
    case 'item':
      if (ev.tipo === 'item'){ checarImediatos(); return true; }
      return false;
    case 'insignia':
      if (ev.tipo === 'insignia'){ checarImediatos(); return true; }
      return false;
  }
  return false;
}
/** Fala extra quando o passo atual aponta pra esse NPC (a linha da missão vem antes da ação). */
export function falaPara(cfg){
  const p = passoAtual(); if (!p || !p.fala) return null;
  const alvo = p.cfgs || p.cfg; if (alvo == null) return null;
  const ok = Array.isArray(alvo) ? alvo.map(String).includes(String(cfg)) : String(alvo) === String(cfg);
  return ok ? (Array.isArray(p.fala) ? p.fala : [p.fala]) : null;
}
/** HTML curto pro tracker da HUD. */
export function textoTracker(){
  const m = ativa(); if (!m) return null;
  const p = passoAtual(); if (!p) return '<div class="missao-header"><b>' + esc(tr(m.nome)) + '</b></div>';
  const n = p.n || 0, prog = progresso();
  const cont = n > 1 || (n === 1 && (p.tipo === 'capturar' || p.tipo === 'derrotar')) ? ' <span class="prog">' + Math.min(prog, n) + '/' + n + '</span>' : '';
  const onde = p.onde ? '<small class="onde"> · ' + esc(tr(p.onde)) + '</small>' : '';
  /* Nós fixos (b / span.passo / small.onde / small.rec): a HUD do Figma liga cada um a uma área da maquete; no CSS antigo
     o `.passo::before` põe o " · " de volta. A recompensa vem de `m.recompensa` quando a missão tem. */
  const rec = textoRecompensa(m);
  /* Dois blocos pro Figma ter onde encostar (missao-header/missao-corpo da maquete). Sem Figma o hud.css os
     deixa `display:contents` e o texto continua corrido como antes. */
  /* small.etapa (17/09, auditoria dos placeholders): objetivo atual / total, pra área txt/progresso da faixa do v2 (a maquete mostrava "3/5"); fora do Figma o hud.css esconde */
  return '<div class="missao-header"><b>' + esc(tr(m.nome)) + '</b><small class="etapa">' + (estado.passo + 1) + '/' + m.passos.length + '</small></div><div class="missao-corpo"><span class="passo">' + esc(tr(p.texto)) + cont + '</span>' + onde + (rec ? '<small class="rec">' + esc(tr('Recompensa:')) + ' ' + esc(rec) + '</small>' : '') + '</div>';
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** "500 moedas · Pokébola ×5 · 120 XP" a partir do que a missão dá (campos como vierem: moedas/dinheiro, exp, itens {id: n} ou [{nome, n}]). */
function textoRecompensa(m){
  const r = m?.recompensa || m?.recompensas || m?.premio; if (!r) return '';
  const partes = [];
  const moedas = r.moedas ?? r.dinheiro ?? r.money; if (moedas) partes.push(moedas + ' ' + tr('moedas'));
  const exp = r.exp ?? r.xp; if (exp) partes.push(exp + ' XP');
  const nomeDe = id => ctx?.nomeItem?.(id) || ('item ' + id);           // nome de verdade (index: ITENS_NOME) em vez de "item 2002"
  const itens = r.itens || r.items; if (Array.isArray(itens)) for (const it of itens) partes.push(tr(it.nome || nomeDe(it.id)) + (it.n > 1 ? ' ×' + it.n : ''));   // idioma: nome do item
  else if (itens && typeof itens === 'object') for (const [id, n] of Object.entries(itens)) partes.push(tr(nomeDe(id)) + (n > 1 ? ' ×' + n : ''));
  return partes.join(' · ');
}
