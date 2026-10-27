import { t as tr, tHtml } from './i18n.mjs';   // IDIOMA (11/09): tr() traduz texto pt pro idioma do jogador
import * as Conta from './conta.mjs';                                     // cargos (09/09): [STAFF]/[MOD] e a cor de cada um
/* Chat do jogo, no modelo do PRO: uma caixa no canto com abas.
 *   Local  — fala com quem está na sua área; mostra TAMBÉM os outros canais, com etiqueta [G] [T] [H] [S]
 *   Global — todo mundo · Trade — comércio · Help — ajuda (cada aba só com o seu canal)
 *   Sistema — eventos do jogo (área, capturas, inicial…), aparece no Local
 * Comandos na caixa: /g texto (global), /t (trade), /h (help), /l (local), /w nome texto (mensagem direta a um amigo), /ranking,
 * /trocar nome (convite de troca de Pokémon), /preso (relato obrigatório e volta pro último Centro). GM: /online, /aviso texto, /mudo nome min, /kick nome, /banir nome horas,
 * /perdoar nome, /ver nome. Staff: /chaves, /alfa, /relatos, /raid (raid ao vivo). Enter foca a caixa.
 * Com o servidor (servidor/servidor.mjs) as mensagens vão pros outros (rede.mjs); sem ele só você vê. Histórico (200 msgs) em localStorage 'chat'. Mesmo módulo alimenta a
 * peça #chat da HUD e a aba Chat da janela Social (Chat.montar num contêiner qualquer).
 */
export const CANAIS = {
  local:   { nome: 'Local',   cor: '#e6ecff', tag: '' },
  global:  { nome: 'Global',  cor: '#ffe07a', tag: 'G' },
  trade:   { nome: 'Trade',   cor: '#8ef58e', tag: 'T' },
  help:    { nome: 'Help',    cor: '#7fd7ff', tag: 'H' },
  sistema: { nome: 'Sistema', cor: '#9aa5c0', tag: 'S' },
  pm:      { nome: 'Sussurro', cor: '#f0a6ff', tag: 'W' },   // mensagem direta entre amigos (fase 2b): aparece no Local com [W]; /w nome texto
};
export const ABAS = ['local', 'global', 'trade', 'help'];
let ctx = null, msgs = [];
const montagens = new Set();
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function instalar(c){
  ctx = c;
  const cedo = msgs.slice();                                              // 12/09: o que o boot já publicou (avisos, "[erro] …") ficava de fora quando o histórico do aparelho entrava
  msgs = (ctx.lerLS('chat', []) || []).concat(cedo).slice(-200);
  if (!msgs.length) sistema('Chat: Local (seu mapa + tudo), Global, Trade, Help. Comandos: /g /t /h /l. Com o servidor no ar, os outros jogadores leem.');
}
function guardar(){ ctx?.gravarLS('chat', msgs.slice(-200)); }
export function publicar(canal, txt, de = ctx?.nome || 'Você', cargo = undefined){
  if (!CANAIS[canal]) canal = 'local';
  /* CARGOS (09/09): [STAFF]/[MOD] na frente do nome, na cor do cargo. Quem fala aqui do lado de cá sou eu — o cargo vem do
     servidor (Conta); dos outros, vem junto da mensagem. */
  const q = cargo === undefined ? Conta.meuCargoAtual?.() : cargo;
  msgs.push({ c: canal, de, cg: q || null, txt: String(txt).slice(0, 240), t: Date.now(), a: canal === 'local' ? (ctx?.area?.() ?? null) : null });
  if (msgs.length > 300) msgs.splice(0, msgs.length - 300);
  guardar();
  for (const m of [...montagens]){ if (!m.el.isConnected){ montagens.delete(m); continue; } m.atualizar(canal); }
}
export const sistema = txt => publicar('sistema', tr(txt), 'Sistema', null);   // idioma (11/09): toda mensagem de sistema passa pelo dicionário
/** Envia o texto da caixa: a aba manda o canal, /g /t /h /l sobrepõem. Devolve o canal ou null. */
export function enviar(aba, texto){
  let canal = ABAS.includes(aba) ? aba : 'local', t = String(texto || '').trim();
  const w = t.match(/^\/w\s+(\S+)\s+(.*)$/i);                            // /w nome texto → mensagem direta (Social)
  if (w){ ctx?.dm?.(w[1], w[2].trim()); return 'pm'; }
  if (/^\/ranking\b/i.test(t)){ ctx?.ranking?.(); return 'sistema'; }   // /ranking → top de colecionadores (menus.mjs mostrarRanking)
  if (/^\/(preso|stuck)\b/i.test(t)){ ctx?.preso?.(); return 'sistema'; }   // /preso (15/09, alfa): abre o diálogo "Estou preso" (relato obrigatório → último Centro); /stuck pros testers em inglês
  /* MODERAÇÃO (08/09): comandos de GM. O servidor recusa quem não tem a marca — aqui é só o atalho de digitação. */
  /* ALPHA KEYS (11/09): atalhos de staff. /chaves [N] [nota] gera (ou lista, sem N) · /alfa on|off fecha/abre o cadastro. */
  /* RAID AO VIVO (14/09): /raid anunciar | comecar | cancelar | hp N | dano F | shiny N | premio mew|sem-mew | status (o servidor confere o cargo staff). */
  const st = t.match(/^\/(chaves|keys?|alfa|alpha|relatos|raid)\b\s*(.*)$/i);     // /alpha e /keys valem também (é assim que o Jaime chama)
  if (st){ const op = /^k/i.test(st[1]) ? 'chaves' : /^al/i.test(st[1]) ? 'alfa' : st[1].toLowerCase(); ctx?.staff?.(op, st[2].trim()); return 'sistema'; }
  const mod = t.match(/^\/(online|aviso|mudo|kick|banir|perdoar|ver|tp|ir|puxar)\b\s*(.*)$/i);   // /tp nome cidade (13/09): leva uma conta presa pra frente do Centro da cidade; /ir nome e /puxar nome (14/09)
  if (mod){ ctx?.moderar?.(mod[1].toLowerCase(), mod[2].trim()); return 'sistema'; }
  const tr = t.match(/^\/trocar\s+(.+)$/i);                              // /trocar nome → convite de troca pra quem está por perto (troca.mjs)
  if (tr){ ctx?.trocar?.(tr[1].trim()); return 'sistema'; }
  const m = t.match(/^\/(g|t|h|l)\s+(.*)$/i);
  if (m){ canal = { g: 'global', t: 'trade', h: 'help', l: 'local' }[m[1].toLowerCase()]; t = m[2].trim(); }
  if (!t) return null;
  publicar(canal, t);
  ctx?.rede?.(canal, t);                                                 // com servidor no ar, os outros recebem (rede.mjs)
  return canal;
}
export const mensagens = () => msgs;
export function limpar(){ msgs = []; guardar(); for (const m of montagens) m.atualizar(); }
/** Monta o chat dentro de `el`. compacto = peça da HUD (botão de recolher). */
export function montar(el, { compacto = false, aba: abaInicial = 'local' } = {}){
  if (el.__chat){ montagens.add(el.__chat); el.__chat.atualizar(); return el.__chat; }
  let aba = abaInicial; const naoLidas = { local: 0, global: 0, trade: 0, help: 0 };
  el.classList.add('chat-caixa');
  el.innerHTML = `<div class="abas">${ABAS.map(a => `<button type="button" data-aba="${a}" class="${a === aba ? 'on' : ''}">${tr(CANAIS[a].nome)}<i hidden></i></button>`).join('')}${compacto ? '<button type="button" class="min" title="recolher / abrir">–</button>' : ''}</div><div class="msgs"></div><form autocomplete="off"><span class="canal"></span><input maxlength="240" placeholder="${tr('Enter pra falar… /g /t /h /l')}"><button type="submit">${tr('Enviar')}</button></form>`;
  const msgsEl = el.querySelector('.msgs'), form = el.querySelector('form'), input = el.querySelector('input'), canalEl = el.querySelector('.canal');
  const visiveis = () => msgs.filter(m => aba === 'local' ? (m.c !== 'local' || m.a == null || ctx?.area == null || m.a === ctx.area()) : m.c === aba);
  const hora = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const linha = m => { const C = CANAIS[m.c] || CANAIS.local; const tag = aba === 'local' && C.tag ? `<span class="tag" style="color:${C.cor}">[${C.tag}]</span> ` : ''; const cg = Conta.cargoDe?.(m.cg); const eti = cg ? `<b style="color:${cg.cor}">[${cg.tag}]</b> ` : ''; return m.c === 'sistema' ? `<div class="m sis" style="color:${C.cor}">${tag}<em>${esc(m.txt)}</em></div>` : `<div class="m"><span class="h">${hora(m.t)}</span> ${tag}${eti}<b style="color:${cg ? cg.cor : C.cor}">${esc(m.de)}:</b> ${esc(m.txt)}</div>`; };
  const render = () => {
    const noFim = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 30;
    msgsEl.innerHTML = visiveis().slice(-150).map(linha).join('');
    if (noFim || true) msgsEl.scrollTop = msgsEl.scrollHeight;
    canalEl.textContent = tr(CANAIS[aba].nome); canalEl.style.color = CANAIS[aba].cor;
    el.querySelectorAll('[data-aba]').forEach(b => { b.classList.toggle('on', b.dataset.aba === aba); const i = b.querySelector('i'); const n = naoLidas[b.dataset.aba]; i.hidden = !n; i.textContent = n > 9 ? '9+' : n; });
  };
  el.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => { aba = b.dataset.aba; naoLidas[aba] = 0; render(); input.focus(); });
  el.querySelector('.min')?.addEventListener('click', () => {
    el.classList.toggle('fechado'); if (!el.classList.contains('fechado')) render();
    if (el.id === 'chat' && el.dataset.dock === '1'){ try { localStorage.setItem('chat.dock', JSON.stringify(el.classList.contains('fechado') ? 'recolhido' : 'visivel')); } catch {} }   // chat ancorado do celular: lembra o recolhido entre as trocas de área
  });
  if (el.id === 'chat' && compacto){                                     // redimensionar (Jaime, 31/08): grip ◢ ao lado do –; tamanho por jogador em LS chat.tam; duplo clique = padrão
    const tam = ctx?.lerLS?.('chat.tam', null);
    if (tam?.w) el.style.setProperty('--chat-w', tam.w + 'px');       // var CSS: o Hud.aplicar limpa width/height inline, mas não mexe em custom properties
    if (tam?.h) el.style.setProperty('--chat-h', tam.h + 'px');
    const grip = document.createElement('button'); grip.type = 'button'; grip.className = 'dim'; grip.title = 'arraste: tamanho do chat · duplo clique: padrão'; grip.textContent = '◢';
    el.querySelector('.abas').appendChild(grip);
    let d0 = null;
    grip.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); d0 = { x: ev.clientX, y: ev.clientY, w: el.offsetWidth, h: el.offsetHeight }; grip.setPointerCapture(ev.pointerId); });
    grip.addEventListener('pointermove', ev => {
      if (!d0) return;
      const w = Math.max(240, Math.min(760, d0.w + (ev.clientX - d0.x)));
      const h = Math.max(120, Math.min(520, d0.h - (ev.clientY - d0.y)));
      el.style.setProperty('--chat-w', w + 'px'); el.style.setProperty('--chat-h', h + 'px');
    });
    const soltou = () => { if (!d0) return; d0 = null; ctx?.gravarLS?.('chat.tam', { w: el.offsetWidth, h: el.offsetHeight }); };
    grip.addEventListener('pointerup', soltou); grip.addEventListener('pointercancel', soltou);
    grip.addEventListener('dblclick', () => { el.style.removeProperty('--chat-w'); el.style.removeProperty('--chat-h'); try { localStorage.removeItem('chat.tam'); } catch {} });
  }
  form.onsubmit = ev => { ev.preventDefault(); const c = enviar(aba, input.value); if (c){ input.value = ''; } };
  input.addEventListener('keydown', ev => { if (ev.code === 'Escape'){ input.blur(); ev.preventDefault(); } ev.stopPropagation(); });
  input.addEventListener('keyup', ev => ev.stopPropagation());
  const montagem = { el, get aba(){ return aba; }, focar(){ el.classList.remove('fechado'); render(); input.focus(); }, atualizar(canal){ if (canal && canal !== aba && !(aba === 'local' && canal !== 'local')) naoLidas[canal] = (naoLidas[canal] || 0) + 1; if (canal && aba !== 'local' && canal !== aba && ABAS.includes(canal)) naoLidas[canal] = (naoLidas[canal] || 0) + 1; render(); } };
  el.__chat = montagem; montagens.add(montagem); render();
  return montagem;
}
/** Foca a caixa da HUD (Enter no jogo). */
export function focar(){ for (const m of montagens) if (m.el.isConnected && m.el.id === 'chat'){ m.focar(); return true; } return false; }
export const digitando = () => { const a = document.activeElement; return !!a && a.tagName === 'INPUT' && !!a.closest('.chat-caixa'); };
