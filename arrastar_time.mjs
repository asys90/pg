/* ARRASTAR O TIME (refeito 26/10: o arquivo não veio junto com a build).
   O index instala o acesso ao jogo (`instalar`), e cada lista arrastável se liga com `ligar` — a grade do HUD e as duas
   colunas Time/Caixa da janela Pokémon. Arrastar dentro de uma lista reordena; de uma pra outra move; com o time cheio,
   quem vem da caixa TROCA com a casa onde soltou. `aplicar` é o mesmo caminho dos botões ↑ ↓ → caixa / Trazer.
   Mouse: começa ao andar uns pixels. Toque: segurar o dedo (senão é rolagem). Botões com `data-arr-nao` não pegam. */

const TIME_MAX = 6;
const SEGURAR_MS = 350;                                                   // toque: quanto tempo segurar pra pegar
const ANDAR_PX = 6;                                                       // mouse: quanto andar pra virar arrasto
const ROLAR_PX = 36;                                                      // perto da borda da lista rolável, ela rola

let cfg = null;
const grupos = new Map();                                                 // grupo → Set de { el, opts }
let ativo = null;                                                         // o arrasto em andamento

/** Liga o arrasto ao jogo: time(), caixa(), emCampo(e), motivo(), gravar(time, caixa), avisar(texto), som(id). */
export function instalar(c){ cfg = c; }
export const ligado = () => !!cfg;

const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
const avisar = t => { try { cfg?.avisar?.(t); } catch {} };

/** Move o item `i` da lista `de` pra posição `j` da lista `para` ('time' | 'caixa'). Grava e devolve true se mudou algo. */
export function aplicar(de, i, para, j){
  if (!cfg) return false;
  const motivo = cfg.motivo?.(); if (motivo){ avisar(motivo); return false; }
  const time = [...(cfg.time() || [])], caixa = [...(cfg.caixa() || [])];
  const L = { time, caixa }, orig = L[de], dest = L[para];
  if (!orig || !dest || !(i >= 0 && i < orig.length)) return false;
  const e = orig[i];
  if (de === para){
    j = limitar(j, 0, orig.length - 1);
    if (j === i) return false;
    orig.splice(i, 1); orig.splice(j, 0, e);
  } else if (de === 'time'){
    if (time.length <= 1){ avisar('é o seu único Pokémon'); return false; }
    if (cfg.emCampo?.(e)){ avisar('troque de parceiro antes de guardar quem está em campo'); return false; }
    time.splice(i, 1); caixa.splice(limitar(j, 0, caixa.length), 0, e);
  } else if (time.length >= TIME_MAX){                                    // caixa → time cheio: troca com a casa de destino
    const k = limitar(j, 0, time.length - 1), sai = time[k];
    if (cfg.emCampo?.(sai)){ avisar('troque de parceiro antes de guardar quem está em campo'); return false; }
    time[k] = e; caixa.splice(i, 1, sai);
  } else {
    caixa.splice(i, 1); time.splice(limitar(j, 0, time.length), 0, e);
  }
  cfg.gravar(time, caixa);
  try { cfg.som?.('ui/sound_click'); } catch {}
  return true;
}

/* ------------------------------------------------------------------ a mão na tela */
function vivos(grupo){
  const s = grupos.get(grupo); if (!s) return [];
  for (const r of s) if (!r.el.isConnected) s.delete(r);                  // a janela repinta (innerHTML novo): os velhos saem
  return [...s];
}
function indiceDe(reg, item){
  if (item.dataset.arrI != null) return +item.dataset.arrI;
  return [...reg.el.querySelectorAll(reg.opts.seletor)].indexOf(item);
}
/** O índice na lista de verdade agora (a lista pode ter mudado desde a pintura: confere pelo uid do item pintado). */
function indiceReal(reg, item){
  const i = indiceDe(reg, item), pint = item.__arrItem;
  if (pint?.uid == null || !cfg) return i;
  const lst = (reg.opts.lista === 'time' ? cfg.time() : cfg.caixa()) || [];
  if (String(lst[i]?.uid) === String(pint.uid)) return i;
  return lst.findIndex(x => String(x?.uid) === String(pint.uid));
}
/** Onde o dedo está: { reg, item } (item null = no vazio da lista → vai pro fim). */
function alvoEm(x, y, grupo){
  const sob = document.elementFromPoint(x, y); if (!sob) return null;
  for (const reg of vivos(grupo)){
    if (!reg.el.contains(sob)) continue;
    const item = sob.closest(reg.opts.seletor);
    return { reg, item: item && reg.el.contains(item) && !item.dataset.arrFixo ? item : null };
  }
  return null;
}
function marcar(alvo){
  if (ativo.marcado && ativo.marcado !== alvo?.item) ativo.marcado.style.outline = ativo.marcadoOutline || '';
  if (alvo?.item && alvo.item !== ativo.item && ativo.marcado !== alvo.item){
    ativo.marcadoOutline = alvo.item.style.outline;
    alvo.item.style.outline = '2px dashed #ffd23a';
  }
  ativo.marcado = alvo?.item && alvo.item !== ativo.item ? alvo.item : null;
}
function comecar(){
  const { item } = ativo;
  const motivo = cfg?.motivo?.(); if (motivo){ avisar(motivo); soltar(false); return; }
  const r = item.getBoundingClientRect();
  const g = item.cloneNode(true);
  Object.assign(g.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px',
    margin: '0', pointerEvents: 'none', opacity: '.85', zIndex: '99999', transform: 'scale(1.04)', boxShadow: '0 6px 18px rgba(0,0,0,.45)' });
  document.body.appendChild(g);
  ativo.fantasma = g; ativo.dx = ativo.x0 - r.left; ativo.dy = ativo.y0 - r.top;
  ativo.opacidade = item.style.opacity; item.style.opacity = '.35';
  ativo.arrastando = true;
  document.body.style.userSelect = 'none';
  try { navigator.vibrate?.(15); } catch {}
}
function mover(x, y){
  const a = ativo;
  a.fantasma.style.left = (x - a.dx) + 'px'; a.fantasma.style.top = (y - a.dy) + 'px';
  const alvo = alvoEm(x, y, a.reg.opts.grupo); marcar(alvo);
  const rol = (alvo?.reg || a.reg).opts.rolavel;                          // perto da borda, a lista rola
  if (rol){
    const r = rol.getBoundingClientRect();
    if (y < r.top + ROLAR_PX) rol.scrollTop -= 8; else if (y > r.bottom - ROLAR_PX) rol.scrollTop += 8;
  }
}
function soltar(aplicou, x, y){
  const a = ativo; ativo = null;
  if (!a) return;
  clearTimeout(a.timer);
  if (!a.arrastando) return;
  a.fantasma?.remove();
  a.item.style.opacity = a.opacidade || '';
  if (a.marcado) a.marcado.style.outline = a.marcadoOutline || '';
  document.body.style.userSelect = '';
  /* O clique que vem logo depois de soltar não é um clique (senão a casa do HUD trocava de parceiro). */
  const engole = ev => { ev.stopPropagation(); ev.preventDefault(); };
  addEventListener('click', engole, true); setTimeout(() => removeEventListener('click', engole, true), 0);
  if (!aplicou) return;
  const alvo = alvoEm(x, y, a.reg.opts.grupo); if (!alvo) return;
  const de = a.reg.opts.lista, i = indiceReal(a.reg, a.item);
  const para = alvo.reg.opts.lista;
  let j;
  if (alvo.item) j = indiceReal(alvo.reg, alvo.item);
  else j = ((para === 'time' ? cfg.time() : cfg.caixa()) || []).length;   // no vazio: vai pro fim
  if (i < 0 || j < 0) return;
  if (aplicar(de, i, para, j)){
    try { a.reg.opts.aoFim?.(); } catch (e) { console.warn('arrastar: aoFim', e); }
    if (alvo.reg !== a.reg && alvo.reg.opts.aoFim !== a.reg.opts.aoFim) try { alvo.reg.opts.aoFim?.(); } catch {}
  }
}

addEventListener('pointermove', ev => {
  const a = ativo; if (!a || ev.pointerId !== a.id) return;
  const d = Math.hypot(ev.clientX - a.x0, ev.clientY - a.y0);
  if (!a.arrastando){
    if (a.toque){ if (d > 10) soltar(false); return; }                    // o dedo andou antes de segurar: é rolagem
    if (d < ANDAR_PX) return;
    comecar(); if (!ativo) return;
  }
  ev.preventDefault();
  mover(ev.clientX, ev.clientY);
}, { passive: false });
addEventListener('pointerup', ev => { if (ativo && ev.pointerId === ativo.id) soltar(true, ev.clientX, ev.clientY); });
addEventListener('pointercancel', ev => { if (ativo && ev.pointerId === ativo.id) soltar(false); });
addEventListener('touchmove', ev => { if (ativo?.arrastando) ev.preventDefault(); }, { passive: false });   // segurou: a tela não rola
addEventListener('contextmenu', ev => { if (ativo) ev.preventDefault(); }, true);                        // segurar o dedo não abre menu
addEventListener('keydown', ev => { if (ev.key === 'Escape' && ativo) soltar(false); });

/** Liga uma lista: { lista: 'time'|'caixa', grupo, seletor, rolavel?, aoFim? }. As listas do mesmo grupo trocam entre si. */
export function ligar(el, opts = {}){
  if (!el || !opts.lista || !opts.seletor) return;
  const grupo = opts.grupo || opts.lista;
  if (!grupos.has(grupo)) grupos.set(grupo, new Set());
  if (el.__arrReg){ el.__arrReg.opts = { ...opts, grupo }; return; }      // o HUD religa o mesmo elemento: só troca as opções
  const reg = { el, opts: { ...opts, grupo } };
  el.__arrReg = reg;
  grupos.get(grupo).add(reg);
  el.addEventListener('pointerdown', ev => {
    if (!cfg || ativo) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (ev.target.closest('[data-arr-nao], input, select, textarea')) return;
    const item = ev.target.closest(reg.opts.seletor);
    if (!item || !el.contains(item) || item.dataset.arrFixo) return;
    const toque = ev.pointerType !== 'mouse';
    ativo = { reg, item, id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, toque, arrastando: false };
    if (toque) ativo.timer = setTimeout(() => { if (ativo?.item === item && !ativo.arrastando){ comecar(); if (ativo) mover(ativo.x0, ativo.y0); } }, SEGURAR_MS);
  });
}
