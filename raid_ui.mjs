/* RAID AO VIVO — a interface (arte da Amanda, rodada 26 — 14/09/2026).
 *
 * Contrato (especificação única da raid):
 *   import * as RaidUI from './raid_ui.mjs';
 *   RaidUI.instalar({ Hud, Popup, Menus, I18n, ao: { entrar(){}, sair(){} } });   // 1× no boot, depois do HUD montado
 *   RaidUI.estado(snap);     // {t:'raid', id, fase, nome, dex, n, vagas, nomes, eu, contagemMs, fimMs, …} ou {fase:'nenhuma'}; idempotente
 *   RaidUI.chefe(info);      // {nome, lv, hp, maxHp} → barra de vida do chefe no topo; null esconde
 *   RaidUI.aviso(texto);     // faixa grande no meio da tela por ~4 s
 *   RaidUI.modoArena(bool);  // na arena: sem botão nem placa da fila
 *
 * O que aparece:
 *   - btn-raid (HUD): com a raid anunciada ou em contagem, fora da arena. Pisca trocando btn-raid.png ↔ btn-raid-aceso.png a cada
 *     500 ms (tag [pisca] — as duas artes têm o mesmo enquadramento). Clique → Menus.abrir('raid').
 *   - banner-raid (pop-up do menus.mjs): Mew à esquerda, nome, descrição de 3 linhas, 10 vagas (check verde nas ocupadas), "n/10" e
 *     o botão Entrar na fila / Sair da fila. Acompanha o estado ao vivo enquanto aberto.
 *   - fila-raid (HUD, perto do minimapa): só pra quem está na fila e com o banner fechado — "n/10" + "esperando jogadores", ou, em
 *     contagem, a referência [estado:cheia] da maquete (contagem dourada) com "Começa em Ns" contado aqui a partir do `contagemMs`.
 *   - barra do chefe (sem arte da Amanda: CSS no estilo do #raid-topo do clipe ?raid=1) e o aviso central.
 *
 * Os nós são nossos (nada estático no index.html). btn-raid e fila-raid são posicionados pelo `Hud.posicionar` com os registros que o
 * conversor põe em `popups.<pc|deitado>.raid.hud` (âncora + tamanho + árvore do Figma, na escala da HUD) e refeitos no resize. Sem
 * esse bloco (layout salvo antigo, arquivo sem a raid) tudo cai numa versão simples em CSS — nunca quebra.
 *
 * POSIÇÃO: o btn-raid fica EXATAMENTE onde a Amanda desenhou, por cima do chat no PC e do joystick no celular deitado (z-index). Não
 * mover na mão: a sobreposição está no docs/figma-desvios.md pra rodada 27.
 * Textos em pt passam pelo I18n.t (sem I18n, texto cru). */

let H = null, P = null, M = null, I = null, AO = {};
let menus = null;                                                         // o que o menus.mjs devolve do ligarRaid: { aberto, repintar, fechar }
let snap = { fase: 'nenhuma', n: 0, vagas: 10, eu: false }, chegouEm = 0;
let CFG = { chefeNome: 'Mew', vagas: 10 };                                 // Fase 3 do painel: data/raid.json (o raid.mjs passa no instalar)
let arena = false, bannerAberto = false, pendenteAte = 0;
let noBtn = null, noFila = null, noChefe = null, noAviso = null;
let tPisca = 0, piscaAceso = false, tRelogio = 0, tAviso = 0, tAviso2 = 0, tResize = 0, chavePos = '';
let reserva = null, buscandoReserva = false;                               // ui/hud_layout.json do arquivo, quando o layout do jogo não tem a raid
let precarregou = false;

const FILA = new Set(['anunciada', 'contagem']);                           // fases em que dá pra entrar/sair da fila
const ARTE = { btn: './ui/figma/icone/btn-raid.png', aceso: './ui/figma/icone/btn-raid-aceso.png', placa: './ui/figma/backgrounds/placa-fila-raid.png',
               check: './ui/figma/icone/check-verde.png', banner: './ui/figma/backgrounds/banner-raid.png' };
const agora = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
/** Tradução: I18n.t se houver; sem ele, o texto cru (com {x} preenchido). */
const T = (s, vars = null) => {
  try { if (I?.t) return I.t(s, vars); } catch {}
  return vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
};
const temDom = () => typeof document !== 'undefined' && !!document.body;

const CSS = `
#raid-btn,#raid-fila{user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation;cursor:pointer}
#raid-btn[hidden],#raid-fila[hidden],#raid-chefe[hidden],#raid-aviso[hidden]{display:none!important}
body.cinematica #raid-btn,body.cinematica #raid-fila{display:none!important}
#raid-btn:active{filter:brightness(1.15)}
body.mobile #raid-fila{pointer-events:none;cursor:default}   /* deitado: a placa desenhada cai em cima do golpe 1 — o toque atravessa pro golpe (quem abre o banner é o botão) */
#raid-btn.raid-simples{position:fixed;left:16px;bottom:250px;width:72px;height:72px;z-index:35}
#raid-btn.raid-simples>[data-var="btn"]{position:absolute;inset:0;background:center/contain no-repeat}
#raid-fila.raid-simples{position:fixed;right:16px;top:280px;height:44px;display:flex;align-items:center;gap:8px;padding:0 12px 0 6px;border:1px solid #F8C23799;border-radius:12px;background:#0f1726e6;box-shadow:0 6px 14px #0008;z-index:34;font:700 13px/1 "Nunito Sans",system-ui,sans-serif;color:#B8C2D9;white-space:nowrap}
#raid-fila.raid-simples>[data-var="fundo"]{display:none}
#raid-fila.raid-simples>[data-fig="txt-icone"]{width:32px;height:32px;border-radius:50%;background:#b3261e;color:#F8C237;display:flex;align-items:center;justify-content:center;font:800 20px/1 "Baloo 2",system-ui,sans-serif}
#raid-fila.raid-simples>[data-fig="txt/fila"]{color:#F8C237;font-weight:900;font-size:15px}
#raid-fila.raid-simples.cheia>[data-fig="txt/contagem"]{color:#F8C237}
body.mobile #raid-btn.raid-simples{left:12px;bottom:170px;width:52px;height:52px}
body.mobile #raid-fila.raid-simples{right:10px;top:150px;height:32px;font-size:10px;padding:0 8px 0 4px;gap:5px}
body.mobile #raid-fila.raid-simples>[data-fig="txt-icone"]{width:22px;height:22px;font-size:14px}
#raid-chefe{position:fixed;left:50%;top:16px;transform:translateX(-50%);width:min(680px,86vw);z-index:40;pointer-events:none;font-family:"Nunito Sans",system-ui,sans-serif}
#raid-chefe .rc-nome{display:flex;align-items:baseline;gap:10px;color:#fff;text-shadow:0 2px 6px #000}
#raid-chefe .rc-nome b{font-size:22px;letter-spacing:.4px}#raid-chefe .rc-nome span{font-size:13px;color:#ffd23a}
#raid-chefe .rc-barra{margin-top:6px;height:16px;border-radius:9px;border:1px solid #000c;background:#141824cc;overflow:hidden;box-shadow:0 4px 14px #0009}
#raid-chefe .rc-hp{height:100%;width:100%;border-radius:8px;background:linear-gradient(90deg,#a55bff,#6e8dff);transition:width .25s}
#raid-chefe .rc-sub{margin-top:4px;font-size:12px;color:#cfe0ff;text-shadow:0 1px 4px #000;display:flex;justify-content:space-between}
body.mobile #raid-chefe{top:6px;left:37%;width:min(380px,45vw)}   /* deitado: entre o time (esquerda) e o ☰ + minimapa (direita) — centrado, o ☰ cobria a porcentagem */
body.mobile #raid-chefe .rc-nome b{font-size:15px}body.mobile #raid-chefe .rc-nome span{font-size:10px}
body.mobile #raid-chefe .rc-barra{height:10px;margin-top:3px}body.mobile #raid-chefe .rc-sub{font-size:9px;margin-top:2px}
body.raid-chefe #missao{visibility:hidden}
#raid-aviso{position:fixed;left:50%;top:36%;transform:translate(-50%,-50%);z-index:58;pointer-events:none;box-sizing:border-box;max-width:min(900px,92vw);padding:14px 30px;border-radius:14px;
  background:linear-gradient(180deg,#1b1330ee,#0d1322ee);border:2px solid #F8C237;box-shadow:0 10px 30px #000b;color:#F8C237;
  font:800 30px/1.2 "Baloo 2",system-ui,sans-serif;text-align:center;white-space:pre-line;text-shadow:0 2px 6px #000;opacity:0;transition:opacity .3s}
#raid-aviso.on{opacity:1}
body.mobile #raid-aviso{font-size:17px;padding:8px 16px;top:32%}
.raid-simples-banner{display:flex;flex-direction:column;align-items:center;gap:10px;padding:8px;text-align:center}
.raid-simples-banner h3{margin:0;color:#F8C237;font:800 24px/1.1 "Baloo 2",system-ui,sans-serif}
.raid-simples-banner .rs-desc{margin:0;white-space:pre-line;color:#E6EBF5;font-weight:700}
.raid-simples-banner .rs-vagas{display:grid;grid-template-columns:repeat(5,34px);gap:8px}
.raid-simples-banner .rs-vagas i{width:34px;height:34px;border-radius:50%;border:2px solid #56627d;background:#141b2b;display:flex;align-items:center;justify-content:center;font-style:normal;color:#39d353;font-weight:900}
.raid-simples-banner .rs-vagas i.on{border-color:#39d353}
.raid-simples-banner .rs-n{color:#F8C237;font-weight:900;font-size:18px}
`;
const PISCA_V2 = '\n#alerta-raid.raid-pisca{animation:raidPiscaV2 1.2s ease-in-out infinite}@keyframes raidPiscaV2{0%,100%{filter:brightness(1)}50%{filter:brightness(1.35)}}';   // rodada 29: [pisca] do card
const TIPO_POR_DEX = { 150: 'psiquico', 151: 'psiquico', 249: 'psiquico', 250: 'fogo', 144: 'gelo', 145: 'eletrico', 146: 'fogo', 243: 'eletrico', 244: 'fogo', 245: 'agua', 251: 'psiquico' };   // o servidor manda dex, não tipo
function estilo(){
  if (!temDom() || document.getElementById('raid-ui-css')) return;
  const s = document.createElement('style'); s.id = 'raid-ui-css'; s.textContent = CSS + PISCA_V2; document.head.appendChild(s);
}
function criar(id){
  let el = document.getElementById(id);
  if (!el){ el = document.createElement('div'); el.id = id; document.body.appendChild(el); }
  el.hidden = true;
  return el;
}

/* ============================================================ instalação */
export function instalar({ Hud = null, Popup = null, Menus = null, I18n = null, ao = null, cfg = null } = {}){
  if (cfg) { CFG = { ...CFG, ...cfg }; if (snap.fase === 'nenhuma') snap.vagas = CFG.vagas; }
  H = Hud || H; P = Popup || P; M = Menus || M; I = I18n || I; AO = ao || AO || {};
  if (!temDom()) return;
  estilo();
  if (!noBtn){
    noBtn = criar('raid-btn'); noBtn.setAttribute('role', 'button');
    noBtn.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); abrirBanner(); });
  }
  if (!noFila){
    noFila = criar('raid-fila');
    noFila.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); abrirBanner(); });   // tocar na placa também reabre o banner
  }
  noBtn.setAttribute('aria-label', T('Raid ao vivo'));
  try { menus = M?.ligarRaid?.({ encher: encherBanner, acao: acaoBanner, simples: bannerSimples, mudou: bannerMudou, def: () => defRaid() }) || null; } catch (e){ console.warn('raid_ui:', e); menus = null; }
  if (!instalar.__ouvindo){
    instalar.__ouvindo = true;
    const agendar = () => { clearTimeout(tResize); tResize = setTimeout(() => { posicionar(true); atualizarHud(); }, 260); };   // depois do resize do hud.mjs (150 ms), que atualiza a escala
    addEventListener('resize', agendar); addEventListener('orientationchange', agendar);
  }
  posicionar(true);
  atualizarHud();
}

/* ============================================================ API */
/** Snapshot do servidor ({t:'raid',…}); idempotente — pode chegar repetido, fora de ordem com a reconexão, ou `{fase:'nenhuma'}`. */
export function estado(s){
  const novo = (s && typeof s === 'object') ? { ...s } : { fase: 'nenhuma' };
  if (!novo.fase) novo.fase = 'nenhuma';
  novo.vagas = +novo.vagas > 0 ? Math.floor(+novo.vagas) : CFG.vagas;
  novo.n = Number.isFinite(+novo.n) && novo.n !== null && novo.n !== '' ? Math.max(0, Math.floor(+novo.n)) : (Array.isArray(novo.nomes) ? novo.nomes.length : 0);
  novo.eu = !!novo.eu;
  snap = novo; chegouEm = agora();
  pendenteAte = 0;                                                         // a resposta chegou: o botão do banner volta
  atualizarHud();
  if (bannerAberto){ if (!FILA.has(snap.fase) || arena) menus?.fechar?.(); else menus?.repintar?.(); }   // a raid começou/acabou com o banner aberto: fecha
  return snap;
}
/** Barra de vida do chefe no topo. `null` esconde. */
export function chefe(info){
  if (!temDom()) return;
  estilo();
  if (!noChefe){
    noChefe = criar('raid-chefe');
    noChefe.innerHTML = '<div class="rc-nome"><b></b><span></span></div><div class="rc-barra"><div class="rc-hp"></div></div><div class="rc-sub"><span class="rc-num"></span><span class="rc-pct"></span></div>';
  }
  if (!info){ noChefe.hidden = true; document.body.classList.remove('raid-chefe'); return; }
  const maxHp = Math.max(1, Math.round(+info.maxHp || +info.hp || 1));
  const hp = Math.max(0, Math.min(maxHp, Math.round(+info.hp || 0)));
  const k = hp / maxHp;
  noChefe.querySelector('.rc-nome b').textContent = String(info.nome || snap.nome || CFG.chefeNome);   // nome de Pokémon não traduz
  noChefe.querySelector('.rc-nome span').textContent = '★ RAID' + (info.lv ? ' · Lv ' + info.lv : '');
  const barra = noChefe.querySelector('.rc-hp');
  barra.style.width = (k * 100).toFixed(1) + '%';
  barra.style.background = k <= 0.2 ? 'linear-gradient(90deg,#ff5a5a,#ff9a6e)' : '';
  noChefe.querySelector('.rc-num').textContent = hp.toLocaleString('pt-BR') + ' / ' + maxHp.toLocaleString('pt-BR');
  noChefe.querySelector('.rc-pct').textContent = (hp > 0 ? Math.max(1, Math.ceil(k * 100)) : 0) + '%';
  noChefe.hidden = false;
  document.body.classList.add('raid-chefe');                               // a placa da missão (topo) sai do caminho enquanto a barra existe
}
/** Faixa grande no meio da tela por ~4 s (ex.: "A raid começa!", "Mew derrotado! Prêmio: …"). */
export function aviso(texto, ms = 4000){
  if (!temDom() || texto == null || texto === '') return;
  estilo();
  if (!noAviso) noAviso = criar('raid-aviso');
  noAviso.textContent = T(String(texto));
  noAviso.hidden = false;
  void noAviso.offsetWidth;                                                // reinicia a transição quando um aviso chega em cima do outro
  noAviso.classList.add('on');
  clearTimeout(tAviso); clearTimeout(tAviso2);
  tAviso = setTimeout(() => { noAviso.classList.remove('on'); tAviso2 = setTimeout(() => { noAviso.hidden = true; }, 350); }, Math.max(800, +ms || 4000));
}
/** Na arena (modo raid) o botão e a placa somem e o banner fecha. */
export function modoArena(on){
  arena = !!on;
  if (temDom()) document.body.classList.toggle('raid-arena', arena);
  atualizarHud();
  if (arena && bannerAberto) menus?.fechar?.();
}
/** Pra depuração/bancada: o que o módulo acha que está valendo. */
export function atual(){ return { ...snap, arena, bannerAberto, segundos: segundosFaltando() }; }

/* ============================================================ HUD: botão e placa */
const oriAtual = () => (temDom() && document.body.classList.contains('mobile') ? 'deitado' : 'pc');   // celular (deitado; em pé a tela "vire o celular" cobre)
/** Pop-up `raid` do layout em uso (ou do arquivo, se o layout do jogo for um salvo antigo sem ele). */
function defRaid(ori = oriAtual()){
  let L = null; try { L = H?.layoutAtual?.() || null; } catch {}
  const d = L?.popups?.[ori]?.raid || reserva?.popups?.[ori]?.raid || null;
  if (!d && !reserva && !buscandoReserva && H?.carregarPadrao){
    buscandoReserva = true;
    Promise.resolve(H.carregarPadrao()).then(j => { reserva = j || {}; posicionar(true); atualizarHud(); }).catch(() => { reserva = {}; });
  }
  return d;
}
function escalaHud(){ try { return +H?.escalaAtual?.() || 1; } catch { return 1; } }
/** Monta/reposiciona as duas peças. Barato quando nada mudou (chave = orientação + escala + tamanho da tela). */
function posicionar(forcar = false){
  if (!noBtn || !noFila) return;
  const ori = oriAtual(), d = defRaid(ori);
  const chave = ori + '|' + escalaHud() + '|' + (d ? 'fig' : 'simples') + '|' + innerWidth + 'x' + innerHeight;
  if (!forcar && chave === chavePos) return;
  chavePos = chave;
  montarPeca(noBtn, d?.hud?.['btn-raid'], 35, 'btn');
  grudarNoMinimapa();
  montarPeca(noFila, d?.hud?.['fila-raid'], 34, 'fila');
  noFila.dataset.estado = '';                                              // força a referência de estado na próxima pintura
  pintarBtn(); pintarFila();
}
/* 15/09 (Jaime: "coloca o pisca lá do lado do mapa, porque fica em cima do chat"): o btn-raid sai do canto esquerdo de baixo (onde a maquete da
   Amanda pôs, em cima das abas do chat no PC e do joystick no deitado) e fica colado à ESQUERDA do minimapa, alinhado ao topo da janela do mapa.
   Não mexe no layout (que é da Amanda): desloca o nó já posicionado com a propriedade CSS `translate`. Sem minimapa, fica onde a maquete manda.
   Refeito no posicionar e a cada tique do pisca (o minimapa só aparece depois do 1º quadro e muda de tamanho no celular). */
function grudarNoMinimapa(){
  if (!noBtn || noBtn.hidden) return;
  const mm = document.getElementById('mm-janela') || document.getElementById('minimapa');
  const rm = mm?.getBoundingClientRect?.();
  noBtn.style.translate = '';
  if (!rm || !(rm.width > 0) || getComputedStyle(document.getElementById('minimapa') || mm).opacity === '0') return;
  const rb = noBtn.getBoundingClientRect(); if (!(rb.width > 0)) return;
  const gap = 8; let x = rm.left - rb.width - gap; const y = rm.top;
  const menu = document.getElementById('menu-btn')?.getBoundingClientRect?.();   // celular deitado: o ☰ mora colado à esquerda do minimapa — o botão vai pra esquerda dele
  if (menu && menu.width > 0 && x < menu.right && x + rb.width > menu.left && y < menu.bottom && y + rb.height > menu.top) x = menu.left - rb.width - gap;
  noBtn.style.translate = Math.round(x - rb.left) + 'px ' + Math.round(y - rb.top) + 'px';
}
function montarPeca(el, reg, z, qual){
  if (reg && H?.posicionar){
    if (el.__modo !== 'fig'){ el.innerHTML = ''; el.className = ''; el.removeAttribute('style'); }
    el.__modo = 'fig'; el.__reg = reg;
    H.posicionar(el, { ...reg, z }, false);                                  // âncora + tamanho + árvore do Figma (img/ e txt/ viram spans data-fig)
    el.style.zIndex = String(z);
    (reg.figma?.filhos || []).forEach((f, i) => {
      if (f.tipo === 'rotulo') rotulo(el, f, i);                             // o hud.mjs não desenha rótulo fixo (o "!" da placa)
      else if (f.tipo === 'imgvar' && f.exemplo){                            // área img/ sem ligação: a arte é a da maquete
        const v = el.querySelector(':scope > [data-var="' + f.id + '"]');
        if (v && !v.style.backgroundImage) v.style.backgroundImage = 'url(' + f.exemplo + ')';
      }
    });
    return;
  }
  if (el.__modo !== 'simples'){                                             // sem registro do Figma: versão simples em CSS
    try { H?.limpar?.(el); } catch {}
    el.removeAttribute('style'); el.className = 'raid-simples';
    el.innerHTML = qual === 'btn' ? '<span data-var="btn"></span>' : '<span data-var="fundo"></span><span data-fig="txt-icone">!</span><span data-fig="txt/fila"></span><span data-fig="txt/contagem"></span>';
    el.__modo = 'simples'; el.__reg = null;
  }
}
function rotulo(el, f, i){
  let r = el.querySelector(':scope > [data-fig="' + f.nome + '"]');
  if (!r){ r = document.createElement('span'); r.dataset.fig = f.nome; el.appendChild(r); }
  r.className = 'fig-txt';
  H.estiloTexto?.(r, f);
  Object.assign(r.style, { zIndex: String((i + 1) * 10), pointerEvents: 'none' });
  if (/\r|\n/.test(f.texto || '')) r.style.whiteSpace = 'pre-line';
  const s = T(f.texto || '');
  if (r.textContent !== s) r.textContent = s;
}
const noDe = (el, nome) => el?.querySelector('[data-fig="' + nome + '"]') || null;
function escrever(el, s){
  if (!el) return;
  s = s == null ? '' : String(s);
  if (el.textContent !== s){ el.textContent = s; try { H?.encolher?.(el); } catch {} }
}
/** Escreve o texto longo; se não couber na caixa (placa do celular), o curto. */
function escreverCabe(el, longo, curto){
  if (!el) return;
  escrever(el, longo);
  if (curto && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) escrever(el, curto);
}
function precarregar(){
  if (precarregou || typeof Image === 'undefined') return;
  precarregou = true;
  for (const src of [ARTE.btn, ARTE.aceso, ARTE.placa, ARTE.check, ARTE.banner]){ const im = new Image(); im.src = src; }   // a troca do pisca não "some" no 1º acender
}
function arteBtn(aceso){
  const d = defRaid();
  if (aceso) return d?.refs?.['btn-raid']?.aceso?.filhos?.find(f => f.id === 'btn')?.exemplo || ARTE.aceso;
  return noBtn?.__reg?.figma?.filhos?.find(f => f.id === 'btn')?.exemplo || ARTE.btn;
}
function pintarBtn(){
  const v = noBtn?.querySelector(':scope > [data-var="btn"]'); if (!v) return;
  const url = 'url("' + arteBtn(piscaAceso) + '")';
  if (v.style.backgroundImage !== url) v.style.backgroundImage = url;
}
function segundosFaltando(){
  if (snap.fase !== 'contagem') return 0;
  return Math.max(0, Math.ceil(((+snap.contagemMs || 0) - (agora() - chegouEm)) / 1000));
}
function pintarFila(){
  if (!noFila) return;
  const cheia = snap.fase === 'contagem';
  const estadoQuer = cheia ? 'cheia' : (noFila.__reg?.estadoBase || 'aguardando');
  if (noFila.dataset.estado !== estadoQuer){
    const d = defRaid();
    if (noFila.__modo === 'fig' && d?.refs?.['fila-raid'] && P?.estadoRef) P.estadoRef({ __refs: d.refs }, noFila, 'fila-raid', estadoQuer);   // contagem dourada da referência [estado:cheia]
    noFila.classList.toggle('cheia', cheia);
    noFila.dataset.estado = estadoQuer;
  }
  escrever(noDe(noFila, 'txt/fila'), Math.min(snap.n, snap.vagas) + '/' + snap.vagas);
  const cont = noDe(noFila, 'txt/contagem');
  if (cheia) escrever(cont, T('Começa em ' + segundosFaltando() + 's'));
  else escreverCabe(cont, T('esperando jogadores'), T('esperando…'));
}
/* ===== v2 (rodada 29): o card `alerta-raid` da maquete substitui o botão "!" e a placa da fila. O hud.mjs desenha a peça (oculta); aqui ela
   ganha vida: arte por TIPO do chefe (ref `alerta-raid [tipo:x]`), "AO VIVO"/"NA FILA", n/vagas, contagem, retrato do chefe e o pisca. */
function alertaV2(){ const el = temDom() ? document.getElementById('alerta-raid') : null; return (el && el.__figmaP?.v2) ? el : null; }
function mmss(s){ s = Math.max(0, Math.floor(+s || 0)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
function pintarAlerta(el){
  const F = el.__figmaP || {}, tipo = String(snap.tipo || TIPO_POR_DEX[+snap.dex] || 'psiquico');
  const ref = F.refs?.['tipo:' + tipo] || F.refs?.['tipo:psiquico'];
  if (ref?.img && el.dataset.tipoArte !== tipo){ el.style.backgroundImage = 'url(' + ref.img + ')'; el.dataset.tipoArte = tipo; }
  const cheia = snap.fase === 'contagem';
  escrever(noDe(el, 'txt/raid-nome'), 'Raid: ' + String(snap.nome || CFG.chefeNome));
  escrever(noDe(el, 'txt/raid-estado'), snap.eu ? T('NA FILA') : T('AO VIVO'));
  escrever(noDe(el, 'txt/raid-fila'), Math.min(snap.n, snap.vagas) + '/' + snap.vagas);
  escrever(noDe(el, 'txt/raid-tempo'), cheia ? mmss(segundosFaltando()) : '');
  const boss = el.querySelector('[data-var="boss"]');
  if (boss && snap.dex){ const url = 'url(./ui/mon/pm' + String(snap.dex).padStart(4, '0') + '.png)'; if (boss.style.backgroundImage !== url){ Object.assign(boss.style, { backgroundImage: url, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', display: 'block' }); } }
  if (!el.__ligadoRaid){ el.__ligadoRaid = true; el.style.pointerEvents = 'auto'; el.style.cursor = 'pointer'; el.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); abrirBanner(); }); }
}
/** Decide o que o HUD mostra a partir do snapshot + arena + banner. */
function atualizarHud(){
  const v2 = alertaV2();
  if (v2){                                                                 // rodada 29: com o visual novo, só o card
    const ver = FILA.has(snap.fase) && !arena;
    v2.__oculto = !ver; v2.style.display = ver ? '' : 'none'; v2.classList.toggle('raid-pisca', ver);
    if (noBtn) noBtn.hidden = true; if (noFila) noFila.hidden = true;
    if (ver){ pintarAlerta(v2); if (!tRelogio) tRelogio = setInterval(() => pintarAlerta(v2), 500); }
    else if (tRelogio){ clearInterval(tRelogio); tRelogio = 0; }
    return;
  }
  if (!noBtn || !noFila) return;
  const ativa = FILA.has(snap.fase);
  const verBtn = ativa && !arena;
  const verFila = verBtn && snap.eu && !bannerAberto;
  if (verBtn){ precarregar(); posicionar(false); }
  noBtn.hidden = !verBtn;
  if (verBtn) grudarNoMinimapa();
  noFila.hidden = !verFila;
  if (verBtn && !tPisca) tPisca = setInterval(() => { piscaAceso = !piscaAceso; pintarBtn(); posicionar(false); grudarNoMinimapa(); }, 500);   // [pisca]; o posicionar pega a troca de "tamanho da interface" sem resize
  else if (!verBtn && tPisca){ clearInterval(tPisca); tPisca = 0; piscaAceso = false; pintarBtn(); }
  const relogio = verFila && snap.fase === 'contagem';
  if (relogio && !tRelogio) tRelogio = setInterval(() => pintarFila(), 250);
  else if (!relogio && tRelogio){ clearInterval(tRelogio); tRelogio = 0; }
  if (verFila) pintarFila();
}

/* ============================================================ banner (pop-up do menus.mjs) */
function abrirBanner(){
  if (!FILA.has(snap.fase) || arena) return;
  if (menus?.aberto?.()){ menus.fechar?.(); return; }                      // o botão alterna
  try { Promise.resolve(M?.abrir?.('raid')).catch(e => console.warn('raid_ui:', e)); } catch (e){ console.warn('raid_ui:', e); }
}
function bannerMudou(aberto){
  bannerAberto = !!aberto;
  atualizarHud();
}
const tituloDe = nome => 'Raid ao vivo: ' + nome + '!';
const descricaoDe = nome => 'O ' + nome + ' apareceu em Kanto!\nChance de SHINY aumentada.\nRecompensas raras pro grupo.';
/** Situação do botão do banner: rótulo (pt) e se está ligado. */
function botaoBanner(){
  const n = Math.min(snap.n, snap.vagas), cheia = n >= snap.vagas;
  const rotuloPt = snap.eu ? 'Sair da fila' : (cheia ? 'Fila cheia' : 'Entrar na fila');
  const ligado = FILA.has(snap.fase) && !arena && (snap.eu || !cheia) && agora() >= pendenteAte;
  return { rotuloPt, ligado };
}
/* BANNER DA RODADA 30 (18/09, Jaime: "pq o banner da raid tá quebrado?"): o `banner-raid` novo da Amanda usa outros nomes — arte
   `img/raid-arte [do-jogo]`, pílula `txt/raid-estado`, `txt/raid-descricao`, `txt/raid-fila`, grupo `contagem` (`txt/raid-contagem`), 10
   vagas com a ref `vaga [estado:ocupada]` e o botão com a ref `btn-entrar [estado:na-fila]`. O código ainda enchia os do banner antigo
   (`fundo`, `descricao`, `vagas`): no site só o título aparecia — sem a arte do Mew, sem texto, sem a fila. As 10 bolinhas são o MÍNIMO
   pra começar (acendem até 10) e o texto é a lotação (n/30), como a Amanda desenhou. */
const descricaoV2 = nome => 'O ' + nome + ' apareceu em Kanto! Chance de SHINY aumentada e recompensas raras pro grupo que vencer.';
let tBanner = 0;
function encherBannerV2(pop){
  const nome = String(snap.nome || CFG.chefeNome), vagas = snap.vagas, n = Math.min(snap.n, vagas);
  const arte = pop.querySelector('[data-var="raid-arte"]');
  const url = (!snap.dex || +snap.dex === 151) ? (arte?.dataset.exemplo || ARTE.banner) : './ui/mon/pm' + String(snap.dex).padStart(4, '0') + '.png';   // a arte da maquete é o Mew; outro chefe: o retrato dele
  if (arte && P.imagem(pop, 'raid-arte', url) && url === arte.dataset.exemplo && +arte.dataset.exemploPad) H?.fundoComFolga?.(arte, +arte.dataset.exemploPad);
  P.texto(pop, 'raid-estado', snap.eu ? 'NA FILA' : 'RAID AO VIVO');
  P.texto(pop, 'raid-nome', tituloDe(nome));
  P.texto(pop, 'raid-descricao', descricaoV2(nome));
  P.texto(pop, 'raid-fila', n + '/' + vagas);
  const acesas = Math.min(n, 10);
  for (let i = 1; i <= 10; i++){ const v = P.grupo(pop, 'vaga-' + i); if (v) P.estadoRef(pop, v, 'vaga', i <= acesas ? 'ocupada' : 'vazia'); }
  const cont = P.grupo(pop, 'contagem'), contando = snap.fase === 'contagem';
  if (cont) cont.style.display = contando ? '' : 'none';                  // "a fila fecha em" só existe na contagem de 30 s (antes dela a luta começa na hora marcada)
  if (contando) P.texto(pop, 'raid-contagem', mmss(segundosFaltando()));
  if (contando && !tBanner) tBanner = setInterval(() => { if (!bannerAberto || snap.fase !== 'contagem'){ clearInterval(tBanner); tBanner = 0; return; } P.texto(pop, 'raid-contagem', mmss(segundosFaltando())); }, 500);
  const b = botaoBanner();
  const btn = P.grupo(pop, 'btn-entrar');
  if (btn && pop.__refs?.['btn-entrar']?.['na-fila']){
    if (snap.eu) P.estadoRef(pop, btn, 'btn-entrar', 'na-fila');         // verde depois que entrou
    else if (btn.dataset.estado === 'na-fila'){ btn.style.backgroundImage = btn.dataset.arte ? 'url(' + btn.dataset.arte + ')' : ''; delete btn.dataset.estado; }   // saiu da fila: volta a arte amarela
  }
  P.botao(pop, 'entrar-fila', b.ligado, b.rotuloPt);
}
/** Enche o pop-up do Figma (chamado pelo render do menus.mjs). */
function encherBanner(pop){
  if (!pop || !P) return;
  if (pop.querySelector('[data-var="raid-arte"]')) return encherBannerV2(pop);   // rodada 30 (v2); o antigo segue abaixo
  const nome = String(snap.nome || CFG.chefeNome), vagas = snap.vagas, n = Math.min(snap.n, vagas);
  const fundo = pop.querySelector('[data-var="fundo"]');
  P.imagem(pop, 'fundo', fundo?.dataset.exemplo || ARTE.banner);         // a área img/fundo é só a caixa: a arte (Mew à esquerda) entra aqui
  P.texto(pop, 'raid-nome', tituloDe(nome));
  P.texto(pop, 'descricao', descricaoDe(nome));
  P.texto(pop, 'vagas', n + '/' + vagas);
  for (let i = 1; i <= 30; i++){
    const v = P.grupo(pop, 'vaga-' + i); if (!v) break;
    v.style.display = i <= vagas ? '' : 'none';
    P.estadoRef(pop, v, 'vaga', i <= n ? 'ocupada' : 'vazia');             // check verde nas ocupadas (a referência cria o nó nas vagas 8–10)
  }
  const b = botaoBanner();
  P.botao(pop, 'entrar-fila', b.ligado, b.rotuloPt);
}
/** Botão do banner: entra ou sai conforme o snapshot. O botão fica apagado até o servidor responder (ou 2,5 s). */
function acaoBanner(){
  const b = botaoBanner(); if (!b.ligado) return;
  const sair = snap.eu;
  pendenteAte = agora() + 2500;
  try { if (sair) AO.sair?.(); else AO.entrar?.(); } catch (e){ console.warn('raid_ui:', e); }
  menus?.repintar?.();
  setTimeout(() => { if (agora() >= pendenteAte) menus?.repintar?.(); }, 2600);
}
/** Reserva sem maquete (celular em pé, ?popup=0, layout sem a raid): a janela antiga do menus.mjs. */
function bannerSimples(corpo){
  if (!corpo || !temDom()) return false;
  estilo();
  const nome = String(snap.nome || CFG.chefeNome), vagas = snap.vagas, n = Math.min(snap.n, vagas);
  const w = document.createElement('div'); w.className = 'raid-simples-banner';
  const h = document.createElement('h3'); h.textContent = T(tituloDe(nome)); w.appendChild(h);
  const p = document.createElement('p'); p.className = 'rs-desc'; p.textContent = T(descricaoDe(nome)); w.appendChild(p);
  const vg = document.createElement('div'); vg.className = 'rs-vagas';
  for (let i = 1; i <= vagas; i++){ const c = document.createElement('i'); if (i <= n){ c.className = 'on'; c.textContent = '✓'; } vg.appendChild(c); }
  w.appendChild(vg);
  const nn = document.createElement('div'); nn.className = 'rs-n'; nn.textContent = n + '/' + vagas; w.appendChild(nn);
  const ac = document.createElement('div'); ac.className = 'acoes';
  const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'btn ouro';
  const b = botaoBanner(); bt.textContent = T(b.rotuloPt); bt.disabled = !b.ligado; bt.onclick = () => acaoBanner();
  ac.appendChild(bt); w.appendChild(ac);
  if (!FILA.has(snap.fase)){ nn.textContent = T('Nenhuma raid anunciada agora.'); vg.hidden = true; ac.hidden = true; }
  corpo.innerHTML = ''; corpo.appendChild(w);
  return true;
}
