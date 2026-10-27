/* Moderação (Fase 3 do painel). Os comandos de GM do chat e a tela Jogadores → Moderação do painel passam pelas MESMAS funções
 * daqui, então dão o mesmo resultado: o mesmo campo na conta (banidoAte/banMotivo/mudoAte/posGm), o mesmo aviso pro jogador e
 * a mesma linha no admin_log.jsonl (o "Histórico do painel" da ficha mostra também o que veio do chat).
 *
 * Chat (chat.mjs → index.html `moderar` → {t:'mod_<op>', …}; o rede.mjs mostra a resposta {t:'mod', op, …} no chat de Sistema):
 *   /online · /ver nome · /aviso texto · /mudo nome min [motivo] (0 = tira) · /kick nome [motivo] · /banir nome horas [motivo]
 *   (-1 = pra sempre) · /perdoar nome · /tp nome cidade | /tp nome x z · /ir nome · /puxar nome
 *   `nome` = o usuário da conta ou o nome do personagem. Também aceita o formato antigo {t:'mod', op}.
 *
 * Levar (tp/puxar/ir): grava `posGm` = { mapa, x, z } na conta e manda {t:'volta', mapa} pra quem está online — o cliente
 * recarrega a cena e nasce no ponto (o login e o GET /save entregam `pos`). Offline: nasce lá na próxima entrada. O `posGm`
 * some quando a conta entra no mapa dele (servidor.mjs, `entrar`). x/z são do MUNDO (os do jogador e do Editor de Mapa). */
import fs from 'node:fs';
import nodePath from 'node:path';

const MAX_MIN = 525600;                                                      // 1 ano: acima disso é "pra sempre" (-1)
/* Ponto de chegada em Kanto na frente do Centro Pokémon de cada cidade (portas.json: a porta de saída do Centro, 61409xx → 711xx01);
   Pallet não tem Centro: na porta do laboratório. As coordenadas saem do kanto.json (npcs[].cfg). */
export const CIDADES = { pallet: 7110103, viridian: 7110201, pewter: 7110301, cerulean: 7110401, vermilion: 7110501,
  lavender: 7110601, celadon: 7110701, saffron: 7110801, fuchsia: 7110901, cinnabar: 7111001 };
const APELIDOS = { celeste: 'cerulean', lavanda: 'lavender', carmim: 'vermilion', cinzenta: 'pewter', verde: 'viridian', azaleia: 'celadon', acafrao: 'saffron', fucsia: 'fuchsia', canela: 'cinnabar' };
const semAcento = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** h = helpers do servidor.mjs (os mesmos que a tela Jogadores usa). `avisar(gm, texto)` vem do servidor_eventos.mjs. */
export function criarModeracao(h) {
  const { contas, sessoes, socketsDe, banidoAteDe, derrubar, logAdmin, enviar, salvarContasJa, conexoes, dadosPub, avisar } = h;
  const hora = ms => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const quando = ms => ms === -1 ? 'para sempre' : 'até ' + new Date(ms).toLocaleString('pt-BR');

  // ── Pontos das cidades (kanto.json é grande: lê na 1ª vez que alguém usa /tp cidade) ──
  let pontos = null;
  function cidade(txt) {
    let k = semAcento(txt).replace(/^(cidade|ilha)\s+(de\s+)?/, '');
    k = APELIDOS[k] || k;
    if (!CIDADES[k]) return null;
    if (!pontos) {
      pontos = {};
      try {
        const kanto = JSON.parse(fs.readFileSync(nodePath.join(dadosPub, 'kanto.json'), 'utf8'));
        const porCfg = new Map((kanto.npcs || []).map(n => [+n.cfg, n]));
        for (const [nome, cfg] of Object.entries(CIDADES)) {
          const n = porCfg.get(cfg); if (!n) continue;
          pontos[nome] = { mapa: 'kanto', x: +(-n.x).toFixed(2), z: +(+n.z).toFixed(2), nome: kanto.nomes?.[n.a] || nome };   // arquivo → mundo: x espelhado (FLIPX = -1)
        }
      } catch (e) { console.warn('moderação: kanto.json:', e.message); }
    }
    return pontos[k] || null;
  }
  const listaCidades = () => Object.keys(CIDADES).join(', ');

  /** Conta pelo usuário (login) ou pelo nome do personagem. */
  function acharConta(txt) {
    const q = String(txt || '').trim(); if (!q) return null;
    if (contas[q.toLowerCase()]) return q.toLowerCase();
    const low = q.toLowerCase();
    return Object.keys(contas).find(u => String(contas[u]?.save?.nome || '').toLowerCase() === low) || null;
  }
  /** Onde a conta está agora (online) — { mapa, x, z } do mundo. */
  function ondeEsta(u) {
    const w = socketsDe(u).find(x => x._info);
    return w ? { mapa: String(w._mapa), x: +(+w._info.x || 0).toFixed(2), z: +(+w._info.z || 0).toFixed(2) } : null;
  }

  // ── Ações (painel e chat) — não gravam: quem chama salva (o painel com pronto(), o chat com salvarContasJa) ──
  function banir(g, u, minutos, motivo) {
    const c = contas[u];
    if (!(minutos === -1 || (minutos >= 1 && minutos <= MAX_MIN))) return { erro: 'Tempo de banimento inválido.' };
    c.banidoAte = minutos === -1 ? -1 : Date.now() + minutos * 60000; c.banMotivo = motivo;
    if (c.token) { sessoes.delete(c.token); c.token = null; }                 // a sessão cai: o próximo login esbarra no banimento
    derrubar(u, 'Sua conta foi suspensa ' + quando(c.banidoAte) + '.' + (motivo ? ' Motivo: ' + motivo : ''));
    logAdmin(g, u, 'banir', { depois: { banidoAte: c.banidoAte, motivo } });
    return { ate: c.banidoAte };
  }
  function perdoar(g, u) {
    const c = contas[u];
    logAdmin(g, u, 'perdoar', { antes: { banidoAte: c.banidoAte || 0 } });
    delete c.banidoAte; delete c.banMotivo;
    return {};
  }
  function silenciar(g, u, minutos, motivo) {
    const c = contas[u];
    if (!(minutos >= 1 && minutos <= MAX_MIN)) return { erro: 'Tempo de silêncio inválido.' };
    c.mudoAte = Date.now() + minutos * 60000;
    for (const w of socketsDe(u)) enviar(w, { t: 'sistema', texto: '🔇 Você foi silenciado até ' + hora(c.mudoAte) + '.' + (motivo ? ' Motivo: ' + motivo : '') });
    logAdmin(g, u, 'silenciar', { depois: { mudoAte: c.mudoAte, motivo } });
    return { minutos };
  }
  function desmutar(g, u) {
    delete contas[u].mudoAte;
    for (const w of socketsDe(u)) enviar(w, { t: 'sistema', texto: '🔊 Você pode falar no chat de novo.' });
    logAdmin(g, u, 'tirar silêncio', {});
    return {};
  }
  function desconectar(g, u, motivo) {
    const n = derrubar(u, 'Você foi desconectado por um GM.' + (motivo ? ' Motivo: ' + motivo : ''));
    logAdmin(g, u, 'desconectar', { depois: { conexoes: n } });
    return { derrubou: n };
  }
  function recado(g, u, texto) {
    texto = String(texto || '').trim().slice(0, 240);
    if (!texto) return { erro: 'Escreva o recado.' };
    const n = socketsDe(u).length;
    if (!n) return { erro: 'O jogador não está online.' };
    for (const w of socketsDe(u)) enviar(w, { t: 'sistema', texto: '📩 GM: ' + texto });
    logAdmin(g, u, 'recado', { depois: { texto } });
    return {};
  }
  /** Leva a conta pra `dest` = { mapa, x, z, nome }. Online: a cena recarrega agora; offline: nasce lá ao entrar. */
  function levar(g, u, dest, acao = 'levar') {
    const pos = { mapa: String(dest.mapa), x: +dest.x, z: +dest.z, giro: 0 };
    if (!/^[\w-]{1,40}$/.test(pos.mapa) || !Number.isFinite(pos.x) || !Number.isFinite(pos.z) || Math.abs(pos.x) > 100000 || Math.abs(pos.z) > 100000) return { erro: 'Destino inválido.' };
    contas[u].posGm = pos;
    const ws = socketsDe(u);
    for (const w of ws) enviar(w, { t: 'volta', mapa: pos.mapa, texto: '🧭 Um GM levou você' + (dest.nome ? ' para ' + dest.nome : '') + '…' });
    logAdmin(g, u, acao, { depois: { ...pos, nome: dest.nome || null } });
    return { ...pos, nome: dest.nome || null, derrubou: ws.length };
  }
  /** Destino do /tp e do painel: cidade (texto) ou x/z (no mapa onde a conta está, ou Kanto). */
  function destino(u, d) {
    if (d.cidade != null && String(d.cidade).trim()) {
      const p = cidade(d.cidade);
      return p || { erro: `Cidade desconhecida: ${d.cidade} (use ${listaCidades()}).` };
    }
    const x = Number(d.x), z = Number(d.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return { erro: 'Faltou a cidade ou x e z.' };
    const mapa = String(d.mapa || ondeEsta(u)?.mapa || contas[u]?.posGm?.mapa || 'kanto');
    return { mapa, x, z, nome: null };
  }

  /** Painel → /admin/jogador/moderar. `d` = { acao, minutos, motivo, texto, cidade | x z mapa }. */
  function moderar(g, u, acao, d = {}) {
    const minutos = Math.round(+d.minutos || 0), motivo = String(d.motivo || '').slice(0, 120);
    if (acao === 'banir') return banir(g, u, minutos, motivo);
    if (acao === 'perdoar') return perdoar(g, u);
    if (acao === 'mudo') return silenciar(g, u, minutos, motivo);
    if (acao === 'desmutar') return desmutar(g, u);
    if (acao === 'desconectar') return desconectar(g, u, motivo);
    if (acao === 'recado') return recado(g, u, d.texto);
    if (acao === 'levar') { const dest = destino(u, d); return dest.erro ? dest : levar(g, u, dest); }
    return { erro: 'Ação desconhecida.' };
  }

  // ── Chat: {t:'mod_<op>'} (ou {t:'mod', op}) ─────────────────────────────────────────────────────────────────────────
  function comando(ws, m) {
    const g = sessoes.get(ws._info?.token) || null;
    if (!contas[g]?.gm) { enviar(ws, { t: 'mod_erro', erro: 'Sem permissão' }); return; }
    const op = m.t === 'mod' ? String(m.op || '') : String(m.t).slice(4);
    const ok = (o = {}) => enviar(ws, { t: 'mod', op, ...o });
    const erro = e => enviar(ws, { t: 'mod_erro', erro: String(e).replace(/\.$/, '') });   // o rede.mjs põe o ponto

    if (op === 'online') {
      const lista = [...conexoes.values()].filter(w => w._info).map(w => {
        const c = contas[w._usuario];
        return { nome: w._info.nome || w._usuario, conta: c ? w._usuario : null, gm: !!c?.gm, mudo: c?.mudoAte > Date.now(), mapa: w._mapa, area: w._info.area || null };
      });
      ok({ lista }); return;
    }
    if (op === 'aviso') {
      const r = avisar(g, m.texto);
      if (r.erro) erro(r.erro); else ok({ n: r.n });
      return;
    }
    const u = acharConta(m.usuario);
    if (!u) { erro(m.usuario ? 'Conta "' + String(m.usuario).slice(0, 30) + '" não encontrada' : 'Faltou o nome'); return; }
    const c = contas[u];
    if (u === g && ['mudo', 'kick', 'banir', 'perdoar'].includes(op)) { erro('Isso não pode ser feito na sua própria conta'); return; }
    const fim = r => { if (r.erro) { erro(r.erro); return; } salvarContasJa(); ok({ usuario: u, ...r }); };

    if (op === 'ver') {
      const ban = banidoAteDe(c);
      ok({ usuario: u, gm: !!c.gm, banidoAte: ban, mudoAte: c.mudoAte > Date.now() ? c.mudoAte : 0, motivo: ban ? c.banMotivo || '' : '' });
    } else if (op === 'mudo') {
      const min = Math.round(+m.minutos);
      if (min === 0) { desmutar(g, u); salvarContasJa(); enviar(ws, { t: 'sistema', texto: '🔊 ' + u + ' pode falar de novo.' }); return; }
      fim(silenciar(g, u, Number.isFinite(min) ? min : 10, String(m.motivo || '').slice(0, 120)));
    } else if (op === 'kick') fim(desconectar(g, u, String(m.motivo || '').slice(0, 120)));
    else if (op === 'banir') {
      const horas = +m.horas;
      fim(banir(g, u, horas === -1 ? -1 : Math.round((Number.isFinite(horas) && horas > 0 ? horas : 24) * 60), String(m.motivo || '').slice(0, 120)));
    } else if (op === 'perdoar') fim(perdoar(g, u));
    else if (op === 'tp') {
      const txt = String(m.destino || '').trim(), xz = txt.match(/^(-?\d+(?:\.\d+)?)[\s,;]+(-?\d+(?:\.\d+)?)$/);
      const dest = destino(u, xz ? { x: xz[1], z: xz[2] } : { cidade: txt });
      fim(dest.erro ? dest : levar(g, u, dest, 'tp (chat)'));
    } else if (op === 'puxar') {
      const eu = ondeEsta(g);
      if (!eu) { erro('Não achei a sua posição (entre no mapa primeiro)'); return; }
      fim(levar(g, u, { ...eu, nome: 'perto de ' + (contas[g]?.save?.nome || g) }, 'puxar (chat)'));
    } else if (op === 'ir') {
      const ele = ondeEsta(u);
      if (!ele) { erro(u + ' não está online'); return; }
      logAdmin(g, u, 'ir até (chat)', { depois: ele });
      if (String(ele.mapa) === String(ws._mapa)) { ok({ usuario: u, ...ele, mesmoMapa: true }); return; }
      contas[g].posGm = { ...ele, giro: 0 }; salvarContasJa();                    // outro mapa: a minha cena recarrega lá
      ok({ usuario: u, ...ele, mesmoMapa: false });
      enviar(ws, { t: 'volta', mapa: ele.mapa, texto: '🧭 Indo até ' + u + '…' });
    } else erro('Comando desconhecido: /' + op);
  }

  /** `entrar` no WS: a conta chegou no mapa do posGm → ele já foi usado (senão ela nasceria ali pra sempre). */
  function aoEntrar(ws, u) {
    const p = contas[u]?.posGm;
    if (p && String(p.mapa) === String(ws._mapa)) { delete contas[u].posGm; salvarContasJa(); }
  }

  return { moderar, comando, aoEntrar, acharConta, cidade };
}
