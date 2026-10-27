import { t as tr, tHtml } from './i18n.mjs';   // IDIOMA (11/09): tr() traduz texto pt pro idioma do jogador
/* Layout da HUD montado pelo jogador (no editor de HUD).
 *
 * Cada PEÇA da interface (ficha do parceiro, golpes, bola, alvo, missão, fala, joystick,
 * botões de câmera, menu, painel de fundo) pode ser solta da barra e presa a um canto da
 * tela: { ax: 'left'|'right', x, ay: 'top'|'bottom', y, s (escala), r (giro), kit (peça do kit),
 * oculto, w/h (qualquer peça), img (dataURL), nota } + ESTILO (etapa 1 do editor visual, 01/09; todos
 * opcionais — sem valor o CSS do jogo manda): fs (fonte px), ff (família), fw (peso), cor, fundo, pad
 * (padding: número = px ou texto CSS), raio (px), op (0–1), al (left|center|right), z (z-index),
 * ajuste ('encolher'|'cresce'|'cortar' — modo do texto, aplicado na etapa 4), fsMin (px), trava (editor).
 * Os textos internos das peças compostas leem var(--p-fs)/var(--p-cor)/... com fallback = valor de hoje.
 * Há um layout por PRESET: 'pc', 'celular_pe',
 * 'celular_deitado'. Sem layout salvo, a HUD fica como o CSS manda (barra no rodapé).
 *
 * Fonte do layout: localStorage 'hud.layout' (o editor salva aí; mesma origem do jogo) ou,
 * se vazio, ./ui/hud_layout.json (o padrão distribuído — exporte do editor e ponha lá).
 * Pacote NOVO da Amanda (o `_figma.geradoEm` do arquivo mudou) passa na frente do layout salvo, que fica guardado
 * em 'hud.layout.antigo' (Configurações traz de volta): senão quem usou o editor nunca mais via a arte nova.
 */
export const PECAS = ['f-parceiro', 'skills', 'bola-btn', 'atalhos', 'f-alvo', 'missao', 'fala', 'joy', 'cam-btns', 'menu-btn', 'chat-btn', 'menu-icones', 'time-hud', 'chat', 'minimapa', 'painel-fundo', 'atalhos-v2', 'alerta-raid'];
export const PECAS_V2 = ['atalhos-v2', 'alerta-raid'];                   // rodada 29: só existem na maquete v2 — o `aplicar` cria o <div> quando o layout traz a peça
export const NOMES = { 'f-parceiro': 'parceiro (nome, nível, HP)', skills: 'golpes 1–4', 'bola-btn': 'bola (F)', atalhos: 'atalhos 5–9 (poções, bolas, montarias)', 'f-alvo': 'alvo (segue o inimigo)', missao: 'missão', fala: 'caixa de fala (segue o NPC)', joy: 'joystick (celular)', 'cam-btns': 'câmera ↺ ↻ (celular)', 'menu-btn': 'menu ☰ (grade completa)', 'chat-btn': 'botão do chat (celular)', 'menu-icones': 'botões de menu (ícones)', chat: 'chat (Local/Global/Trade/Help)', 'time-hud': 'time (6 Pokémon, troca rápida)', minimapa: 'minimapa (câmera de cima)', 'painel-fundo': 'painel de fundo (decorativo)', 'atalhos-v2': 'atalhos Eventos/Loja (v2)', 'alerta-raid': 'card da raid ao vivo (v2)' };
export const JANELAS = ['pokemon', 'mochila', 'missoes', 'mapa', 'pokedex', 'treinador', 'loja', 'social', 'batalha', 'config'];
export const NOMES_JANELAS = { pokemon: 'Pokémon', mochila: 'Mochila', missoes: 'Missões', mapa: 'Mapa', pokedex: 'Pokédex', treinador: 'Treinador', loja: 'Loja', social: 'Social', batalha: 'Batalha', config: 'Config' };
export const PRESETS = { pc: { nome: 'PC', w: 1920, h: 900 }, celular_pe: { nome: 'celular em pé', w: 390, h: 844 }, celular_deitado: { nome: 'celular deitado', w: 844, h: 390 } };
const CHAVE = 'hud.layout';
const CHAVE_GUARDADO = 'hud.layout.antigo';                              // layout do editor posto de lado quando chega uma maquete nova
let trocouPor = null;                                                    // { de, para } quando isso aconteceu neste boot (o index avisa no chat)
let carimboArquivo = null;                                               // `_figma.geradoEm` do ui/hud_layout.json desta carga (carimba o layout restaurado)
let ESCALA = 1;                                                          // escala da maquete do Figma: encolhe em janela menor que a tela do preset, cresce até TETO_ESCALA em tela maior (aplicar)
export const escalaAtual = () => ESCALA;
export const TETO_ESCALA = 1.25;                                         // até onde a interface cresce em tela maior que a maquete (2K, ultrawide, tablet); acima disso as peças só se afastam pros cantos (05/09)
/* Tamanho da interface (Configurações, 05/09): fator do jogador por cima da escala automática. A HUD nunca passa do que cabe
   na tela (a maquete do PC já ocupa a largura toda em 1920×900: "grande" só cresce a HUD em tela maior; "pequena" vale em
   todas). Janelas: fator do pop-up no PC (popup.mjs). LS `hud.tamanho` (sobrevive ao "Apagar progresso"); `?tamanho=x` vale
   pra sessão e grava, menos na sandbox `figmateste` (que não toca no localStorage). */
export const TAMANHOS = { pequena: { hud: 0.85, popup: 0.75, nome: 'pequena' }, normal: { hud: 1, popup: 0.85, nome: 'normal' }, grande: { hud: 1.15, popup: 1, nome: 'grande' } };
const SANDBOX_LS = /[?&]figmateste=1(&|$)/.test(location.search);
let TAMANHO = (() => {
  try { const q = new URLSearchParams(location.search).get('tamanho'); if (q && TAMANHOS[q]){ if (!SANDBOX_LS) localStorage.setItem('hud.tamanho', q); return q; } } catch {}
  try { if (!SANDBOX_LS){ const v = localStorage.getItem('hud.tamanho'); if (v && TAMANHOS[v]) return v; } } catch {}
  return 'normal';
})();
export const tamanhoUI = () => TAMANHO;
/** Troca o tamanho (pequena | normal | grande), guarda e remonta a HUD na hora. */
export function definirTamanho(t){
  if (!TAMANHOS[t]) return false;
  TAMANHO = t; if (!SANDBOX_LS) try { localStorage.setItem('hud.tamanho', t); } catch {}
  const [l, r] = aplicar.__ultimo || []; if (l?._figma && r) aplicar(l, presetAtual(), r);
  return true;
}

export function presetAtual(mobile = document.body.classList.contains('mobile')){
  if (!mobile) return 'pc';
  return innerHeight >= innerWidth ? 'celular_pe' : 'celular_deitado';
}
export function carregarLocal(){ try { return JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch { return null; } }
export function salvarLocal(layout){ try { localStorage.setItem(CHAVE, JSON.stringify(layout)); return true; } catch { return false; } }
export function apagarLocal(){ try { localStorage.removeItem(CHAVE); } catch {} }
export async function carregarPadrao(){ try { const r = await fetch('./ui/hud_layout.json', { cache: 'no-store' }); const j = r.ok ? await r.json() : null; if (j?._figma?.geradoEm) carimboArquivo = j._figma.geradoEm; return j; } catch { return null; } }
/** Layout salvo no editor, senão o padrão distribuído, senão null (CSS puro).
    MAQUETE NOVA: se o `_figma.geradoEm` do arquivo é diferente do que o layout salvo traz, o arquivo passa na frente e o layout
    do jogador vai pra `hud.layout.antigo` (Configurações: "↺ usar o meu de novo"). Arquivo sem carimbo, ou carimbo igual: o
    layout salvo manda, como sempre. */
/** ?hud=v2 (rodada 27 da Amanda, 16/09): o visual novo pra TESTE, gerado pelo tools/layout_v2_para_hud.mjs em ui/hud_layout_v2.json
    (o layout de sempre com o HUD do PC/celular e a Mochila trocados). Sem o arquivo, cai no padrão. */
const MAQUETE = (() => { try { return new URLSearchParams(location.search).has('maquete'); } catch { return false; } })();   // rodada 29: `&maquete=1` mostra as peças v2 de situação
export async function carregarV2(){ try { const r = await fetch('./ui/hud_layout_v2.json', { cache: 'no-store' }); const j = r.ok ? await r.json() : null; return j || carregarPadrao(); } catch { return carregarPadrao(); } }
export async function carregar(){
  const salvo = carregarLocal(); if (!salvo) return await carregarPadrao();
  const arq = await carregarPadrao(); if (!arq) return salvo;
  const gArq = arq._figma?.geradoEm || null, gSalvo = salvo._figma?.geradoEm || null;
  if (!gArq || gArq === gSalvo) return salvo;
  try { localStorage.setItem(CHAVE_GUARDADO, JSON.stringify(salvo)); localStorage.removeItem(CHAVE); } catch {}
  trocouPor = { de: gSalvo, para: gArq };
  return arq;
}
/** { de, para } se a maquete nova entrou no lugar do layout salvo neste boot; null se não. */
export const trocouMaquete = () => trocouPor;
export const temGuardado = () => { try { return !!localStorage.getItem(CHAVE_GUARDADO); } catch { return false; } };
/** Configurações: devolve o layout guardado pro lugar (vale na próxima carga da página). */
export function restaurarGuardado(){
  try {
    const v = localStorage.getItem(CHAVE_GUARDADO); if (!v) return false;
    const L = JSON.parse(v);
    if (carimboArquivo) (L._figma = L._figma || {}).geradoEm = carimboArquivo;   // "eu quero o MEU": passa a valer até a PRÓXIMA maquete (sem o carimbo novo o jogo o tirava de novo no boot seguinte)
    localStorage.setItem(CHAVE, JSON.stringify(L)); localStorage.removeItem(CHAVE_GUARDADO); trocouPor = null; return true;
  } catch { return false; }
}

/** Limpa o posicionamento solto de uma peça (volta ao fluxo do CSS). */
export const ESTILO = ['fs', 'ff', 'fw', 'cor', 'fundo', 'pad', 'raio', 'op', 'al', 'z', 'ajuste', 'fsMin', 'trava'];
const INLINE = ['fontSize', 'fontFamily', 'fontWeight', 'color', 'backgroundColor', 'padding', 'borderRadius', 'opacity', 'textAlign', 'zIndex'];
const VARS = ['--p-fs', '--p-ff', '--p-fw', '--p-cor', '--p-fundo'];
export function limpar(e){
  if (!e) return;
  desmontarFigma(e);
  e.classList.remove('peca-solta', 'kit', 'peca-segue', 'fig-recolhida'); e.__segue = null;
  for (const k of ['position', 'left', 'right', 'top', 'bottom', 'transform', 'transformOrigin', 'width', 'height', 'maxWidth', 'maxHeight', 'display', 'visibility', 'backgroundImage', 'backgroundSize', ...INLINE]) e.style[k] = '';
  for (const v of VARS) e.style.removeProperty(v);
}
/** Estilo do registro → inline na peça + variáveis --p-* (os filhos das peças compostas leem as variáveis). */
export function aplicarEstilo(e, p){
  const px = v => (v == null || v === '') ? '' : (typeof v === 'number' ? v + 'px' : String(v));
  const setVar = (nome, val) => { if (val == null || val === '') e.style.removeProperty(nome); else e.style.setProperty(nome, val); };
  e.style.fontSize = px(p.fs); setVar('--p-fs', px(p.fs));
  e.style.fontFamily = p.ff || ''; setVar('--p-ff', p.ff || '');
  e.style.fontWeight = p.fw ? String(p.fw) : ''; setVar('--p-fw', p.fw ? String(p.fw) : '');
  e.style.color = p.cor || ''; setVar('--p-cor', p.cor || '');
  e.style.backgroundColor = p.fundo || ''; setVar('--p-fundo', p.fundo || '');
  e.style.padding = px(p.pad);
  e.style.borderRadius = px(p.raio);
  e.style.opacity = (p.op != null && p.op !== '' && +p.op < 1) ? String(p.op) : '';
  e.style.textAlign = p.al || '';
  e.style.zIndex = (p.z != null && p.z !== '') ? String(p.z) : '';
}
/** Só a posição (left/right/top/bottom + origem do transform) de uma peça pelo registro p, na escala k. Usada pelo posicionar
    e pelo arrasto ao vivo (ligarArrasto), que não pode remontar a peça a cada movimento. */
function ancorar(e, p, k){
  if (p.ax === 'center'){                                                // âncora "centro" (comAncoraCentro): presa ao meio da tela, deslocada de p.dx px da maquete
    e.style.left = 'calc(50% + ' + ((p.dx || 0) * k) + 'px)'; e.style.right = 'auto';
    e.style.transformOrigin = 'center ' + (p.ay === 'bottom' ? 'bottom' : 'top');
  } else {
    e.style.left = p.ax === 'right' ? 'auto' : (p.x || 0) * k + 'px';
    e.style.right = p.ax === 'right' ? (p.x || 0) * k + 'px' : 'auto';
    e.style.transformOrigin = (p.ax === 'right' ? 'right' : 'left') + ' ' + (p.ay === 'bottom' ? 'bottom' : 'top');
  }
  e.style.top = p.ay === 'bottom' ? 'auto' : (p.y || 0) * k + 'px';
  e.style.bottom = p.ay === 'bottom' ? (p.y || 0) * k + 'px' : 'auto';
}
/** Fundo de arte com FOLGA (v2, rodada 27): o PNG tem `pad` px de sobra em volta da caixa (brilho/sombra) — desenha maior e deslocado. */
export function fundoComFolga(e, pad){
  if (pad){ e.style.backgroundSize = 'calc(100% + ' + (2 * pad) + 'px) calc(100% + ' + (2 * pad) + 'px)'; e.style.backgroundPosition = (-pad) + 'px ' + (-pad) + 'px'; }
  else { e.style.backgroundSize = '100% 100%'; e.style.backgroundPosition = ''; }
  e.style.backgroundRepeat = 'no-repeat';
}
/* CAIXA DE ALFA DE UM PNG (18/09): onde a arte tem pixel de verdade, em frações do quadro (0 a 1), medida uma vez por arquivo numa miniatura de
   lado px de largura (0 = tamanho natural, até 2048: o anel de seleção tem 2 px de traço e encolher a imagem o engordava) e limiar de alfa
   min. Serve à bolinha de tipo (encaixarBolinha: a esfera ocupa uma fração diferente do quadro em cada tipo) e ao anel de seleção das listas
   que rolam (popup.mjs folgaDaLista: quanto o traço passa da célula). Sem canvas (falha) devolve null. */
const ALFAS = new Map();
export function medirAlfa(src, { lado = 96, min = 40 } = {}){
  const chave = src + '|' + lado + '|' + min;
  if (!ALFAS.has(chave)) ALFAS.set(chave, new Promise(ok => {
    const im = new Image();
    im.onload = () => { try {
      const nw = im.naturalWidth || 1, nh = im.naturalHeight || 1, W = Math.max(1, Math.round(lado > 0 ? lado : Math.min(2048, nw))), H = Math.max(1, Math.round(W * nh / nw));
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data; let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > min){ if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      ok(x1 < 0 ? null : { x0: x0 / W, y0: y0 / H, x1: (x1 + 1) / W, y1: (y1 + 1) / H });
    } catch { ok(null); } };
    im.onerror = () => ok(null); im.src = src;
  }));
  return ALFAS.get(chave);
}
/* BOLINHA DE TIPO NO TAMANHO DO SLOT (18/09, teste da Amanda no site — "bolinhas de tamanhos diferentes"; saiu do menus.mjs no mesmo dia pra servir
   também à barra de skills do HUD, teste local dela com a rodada 31): na maquete o img/tipo é o quadro do PNG de exemplo dela, com folga negativa e
   um tamanho em cada lugar (27, 33, 42 px nos pop-ups; 33,7 e 37,5 px em slots vizinhos da barra de skills do PC), e os nossos ícones
   ui/figma/tipo/*.png têm a esfera numa fração diferente do quadro (Normal 68 %, Planta 78 %): com contain naquela caixa cada bolinha saía de
   um tamanho. A caixa do ícone passa a ser a do slot-tipo (o pai — ou um irmão de mesma caixa) e a esfera é medida uma vez por PNG (largura =
   diâmetro, a sombra fica embaixo) pra encher o slot exatamente; até a medida chegar fica contain no slot. Sem canvas fica o contain. O
   montarFigma devolve o ícone à caixa da maquete a cada remontagem: ele chama de novo com o que ficou em __bolinha.
   19/09 (Jaime: "por que as bolinhas estão serrilhadas?"): a bolinha deixou de ser FUNDO do CSS e virou um <img> dentro da caixa. O Chrome
   reduz fundo de CSS sem fazer a média da área: o PNG de 692 px vira 17 px na lista do time (~30×) e cada pixel da tela saía de um ponto só da
   arte — borda em degrau e o desenho branco em bloquinhos, na placa de vídeo e no software, com ou sem scale(). O <img> na mesma geometria
   sai liso, igual à redução Lanczos (sondas scratch/sondas/serrilhado*.mjs e serr_bancada.*). Quem chama continua pondo o fundo (Popup.imagem,
   pintarBarra); aqui ele é apagado e o <img> (.bolinha-img, reaproveitado entre trocas de tipo e remontagens) mostra a arte. */
const medirEsfera = src => medirAlfa(src).then(a => a && { x: a.x0, y: a.y0, d: a.x1 - a.x0 });
export function encaixarBolinha(el, slot, src){
  const w = parseFloat(slot?.style.width) || 0, h = parseFloat(slot?.style.height) || 0; if (!el || !w || !h || !src) return;
  const dentro = slot === el.parentElement;
  el.__bolinha = { slot, src };
  Object.assign(el.style, { left: (dentro ? 0 : parseFloat(slot.style.left) || 0) + 'px', top: (dentro ? 0 : parseFloat(slot.style.top) || 0) + 'px', width: w + 'px', height: h + 'px', backgroundImage: 'none', overflow: 'hidden' });
  let im = el.querySelector(':scope > img.bolinha-img');
  if (!im){
    im = document.createElement('img'); im.className = 'bolinha-img'; im.alt = ''; im.draggable = false; im.decoding = 'async';
    Object.assign(im.style, { position: 'absolute', margin: '0', padding: '0', border: '0', maxWidth: 'none', maxHeight: 'none', pointerEvents: 'none' });
    el.appendChild(im);
  }
  if (im.getAttribute('src') !== src) im.src = src;
  Object.assign(im.style, { left: '0px', top: '0px', width: '100%', height: '100%', objectFit: 'contain' });   /* até a medida chegar (ou sem canvas): contain no slot */
  medirEsfera(src).then(m => {
    if (!m || el.__bolinha?.src !== src) return;                        /* trocou de tipo enquanto media */
    Object.assign(im.style, { width: (w / m.d).toFixed(2) + 'px', height: 'auto', objectFit: 'fill', left: (-(m.x / m.d) * w).toFixed(2) + 'px', top: (-(m.y / m.d) * h).toFixed(2) + 'px' });
  });
}
/** Posiciona uma peça pelo registro p. `abs` = dentro de um palco (editor), senão fixo na tela. */
export function posicionar(e, p, abs = false){
  if (!e) return;
  if (!p){ limpar(e); return; }
  const k = abs ? 1 : ESCALA; e.__escala = (p.s || 1) * k;
  e.classList.add('peca-solta'); e.classList.toggle('kit', !!p.kit);
  e.__segue = (!abs && p.segue) ? p.segue : null;                        // [segue:npc|inimigo]: quem posiciona é o jogo (Hud.seguir)
  e.classList.toggle('peca-segue', !!e.__segue);
  e.style.position = abs ? 'absolute' : 'fixed';
  if (e.__segue){
    e.style.right = 'auto'; e.style.bottom = 'auto';
    if (!e.style.left){ e.style.left = '-9999px'; e.style.top = '-9999px'; }   // até o 1º quadro do jogo
    e.style.transformOrigin = '50% 100%';                                // o bico do balão é a origem
  } else ancorar(e, p, k);
  e.style.transform = (e.__segue ? 'translate(-50%,-100%) ' : p.ax === 'center' ? 'translateX(-50%) ' : '') + 'scale(' + ((p.s || 1) * k) + ')' + (p.r ? ' rotate(' + p.r + 'deg)' : '');   // r = giro em graus (editor)
  e.style.width = p.w ? p.w + 'px' : ''; e.style.height = p.h ? p.h + 'px' : '';   // qualquer peça; vazio = tamanho do CSS
  e.style.maxWidth = p.w ? 'none' : ''; e.style.maxHeight = p.h ? 'none' : '';       // largura/altura do editor vencem o max-width/max-height do CSS
  aplicarEstilo(e, p);
  if (p.img){ e.style.backgroundImage = 'url(' + p.img + ')'; fundoComFolga(e, p.imgPad); }
  else if (p.figma){ e.style.backgroundImage = 'none'; e.style.backgroundSize = ''; e.style.backgroundPosition = ''; }   // peça sem `imagem` no Figma NÃO tem fundo (nem o do CSS)
  else { e.style.backgroundImage = ''; e.style.backgroundSize = ''; }   // arte importada no editor (painel de fundo)
  if (e.id === 'painel-fundo') e.hidden = !!p.oculto;
  else { e.__oculto = !!(p.oculto && (e.id !== 'menu-btn' || p.forcarOculto) && !(p.maquete && MAQUETE)); e.style.display = e.__oculto ? 'none' : ''; }   // __oculto: o remontar não pode trazer de volta (f-alvo desligado)   // o ☰ só some quando a maquete do PC manda (forcarOculto): num layout do editor ele fica, senão o celular fica sem Menu   // + `&maquete=1` (rodada 29): mostra as peças v2 de situação (card da raid)
  if (p.abrePor && !abs){                                                // painel `[abre:botão]`: só aparece quando o botão pede (DEPOIS da linha acima, que zerava o display)
    e.dataset.abrePor = p.abrePor;
    if (e.dataset.aberta !== '1') e.style.display = 'none';
  } else delete e.dataset.abrePor;
  if (p.abre && !abs){ e.dataset.abre = p.abre; e.hidden = false; ligarAbre(e); }   // botão `btn-x [abre:painel]`: existe porque a maquete o pôs
  else delete e.dataset.abre;
  if (p.dock){ e.dataset.dock = '1'; e.classList.add('dock'); e.hidden = false; }   // peça ancorada (chat do celular): o botão só esconde/mostra, nunca move pro meio
  const dockEstado = p.dock ? lerDock() : null;                            // o que o jogador escolheu da última vez (a troca de área recarrega a página)
  if (dockEstado === 'escondido'){ e.style.display = 'none'; e.dataset.aberta = '0'; } else if (p.dock){ e.dataset.aberta = '1'; }
  else { delete e.dataset.dock; e.classList.remove('dock'); }
  const usaMontar = !!p.figma && !p.doJogo;                              // peça `do-jogo` (chat, joystick): só posição, não vira .fig (o `display:block` do montar quebrava a coluna do chat); as outras montam mesmo sem filhos (o minimapa usa `interno`/`estiloDentro`)
  if (usaMontar) montarFigma(e, p.figma, abs); else desmontarFigma(e);      // árvore do Figma da Amanda (filhos da peça)
  if (p.dock && !abs){                                                   // chat ancorado: expandido, a não ser que o jogador o tenha recolhido (–) ou escondido (💬) da última vez
    if (dockEstado === 'recolhido'){ if (!e.classList.contains('fechado')) e.querySelector('.min')?.click(); }
    else if (dockEstado !== 'escondido' && e.classList.contains('fechado')) e.querySelector('.min')?.click();
  }
}
/** Botão da maquete que abre um painel (`btn-menu [abre:menu-icones]`, `btn-chat [abre:chat]`): o clique alterna o painel no
    meio da tela e NÃO chega ao que o jogo faria (o ☰ abriria a grade). Sem maquete (`data-abre` some) o botão volta ao normal.
    Escolher um ícone do menu fecha o painel. */
function ligarAbre(e){
  if (e.__ligouAbre) return; e.__ligouAbre = true;
  e.addEventListener('click', ev => {
    const id = e.dataset.abre; if (!id) return;
    ev.stopImmediatePropagation(); ev.preventDefault();
    const alvo = document.getElementById(id); if (!alvo) return;
    const aberta = alternarPeca(alvo);
    if (aberta && id === 'chat' && alvo.classList.contains('fechado')) alvo.querySelector('.min')?.click();   // o chat do celular nasce recolhido (só as abas): abrir pelo botão é abrir de verdade, com o campo de digitar
    if (aberta && id === 'menu-icones' && !alvo.__fechaAoEscolher){
      alvo.__fechaAoEscolher = true;
      alvo.addEventListener('click', ev2 => { if (ev2.target?.closest?.('button') && alvo.dataset.aberta === '1') alternarPeca(alvo); });
    }
  }, true);
}
/** Estado do chat ancorado entre recarregamentos: escondido (💬) | recolhido (–) | visivel. */
export function lerDock(){ try { const v = JSON.parse(localStorage.getItem('chat.dock') || 'null'); return typeof v === 'string' ? v : null; } catch { return null; } }
export function gravarDock(v){ try { localStorage.setItem('chat.dock', JSON.stringify(v)); } catch {} }
/** Peça com tag [abre:botão] (celular): abre no meio da tela e fecha. Devolve se ficou aberta. */
export function alternarPeca(e){
  if (!e) return false;
  if (e.dataset.dock === '1'){                                            // ancorada: só esconde/mostra no lugar, e lembra (LS chat.dock)
    const mostrar = e.style.display === 'none';
    e.style.display = mostrar ? '' : 'none'; e.dataset.aberta = mostrar ? '1' : '0';
    gravarDock(mostrar ? (e.classList.contains('fechado') ? 'recolhido' : 'visivel') : 'escondido');
    return mostrar;
  }
  const aberta = e.dataset.aberta !== '1';
  e.dataset.aberta = aberta ? '1' : '0';
  e.style.display = aberta ? '' : 'none';
  if (aberta && e.__figmaP?.v2){                                         // v2 (rodada 28): o painel abre ONDE a maquete manda (colado no ☰), só sobe na pilha
    if (e.__zAntes == null) e.__zAntes = e.style.zIndex || '';
    e.style.zIndex = '45';
  } else if (aberta){                                                    // no meio da tela: a posição do layout é só maquete (fica fora do frame)
    if (e.__zAntes == null) e.__zAntes = e.style.zIndex || '';
    Object.assign(e.style, { left: '50%', right: 'auto', top: '50%', bottom: 'auto', zIndex: '45',
      transform: 'translate(-50%, -50%) scale(' + (e.__escala || 1) + ')' });
  } else if (e.__zAntes != null){ e.style.zIndex = e.__zAntes; e.__zAntes = null; }
  return aberta;
}
/** Peça com tag [segue:*]: o jogo dá o ponto EM PIXELS DE TELA (a base da peça, centralizada). x nulo = esconde. */
export function seguir(e, x, y){
  if (!e || !e.__segue) return;
  if (x == null){ e.style.visibility = 'hidden'; return; }
  e.style.visibility = ''; e.style.left = Math.round(x) + 'px'; e.style.top = Math.round(y) + 'px';
}

/* ============================================================ Figma (tools/layout_figma_para_hud.mjs) ============
 * `p.figma.filhos` é a árvore da peça no Figma da Amanda: grupo (slot) → imagens fixas (`img`), áreas de texto (`txt`,
 * com fonte/peso/tamanho/cor/alinhamento e regra) e imagens trocáveis (`imgvar`). Cada grupo/texto é LIGADO ao nó que o
 * jogo já tem (LIGACOES); o que não tem nó vira <span data-fig> (imagens sempre; textos só no editor, com o exemplo da
 * maquete). Tudo no tamanho do layout, nunca do PNG. */
const LIGACOES = {
  // grupo/folha/folhaGrupo: nome no Figma → seletor do nó do jogo que VIRA aquele pedaço (folha* = a imagem do Figma é o
  // próprio botão do jogo); txt/imgvar/fill: id da área → seletor dentro dele; txtPorGrupo: mapa de texto por grupo
  // ANINHADO (o mesmo id `lvl` aparece no slot e dentro do card de vida); esconder: nós do jogo que a maquete não tem.
  /* `esconder` lista o que é CONDICIONAL: some primeiro e a ligação traz de volta o que a maquete tiver (no
     celular não há tecla nos golpes nem card de vida no time, e o que sobrava do CSS antigo aparecia solto). */
  skills: { grupo: n => { const m = n.match(/slot-skill-(\d)$/); return m ? '#sk' + m[1] : null; }, txt: { 'tecla': 'b', 'skill-nome': 'em', 'pp': 'small' }, esconder: ['s', 'b', 'em', 'small', 'i'] },   // `i` = barra de recarga antiga (CSS): cobria a caixa inteira do botão, maior que a moldura; a maquete tem o estado [cooldown]
  atalhos: { grupo: n => { const m = n.match(/slot-item-(\d)$/); return m ? '.atalho[data-i="' + (m[1] - 1) + '"]' : null; },
             imgvar: { 'item': 'i' }, txt: { 'tecla': 'b', 'qtd': 'small' }, esconder: ['.atalho', 'em', 'b', 'small'],   // slot sem par na maquete some (o celular tem 4, o jogo 5)
             estiloGrupo: { border: '0', borderRadius: '0', padding: '0', boxShadow: 'none', backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center', gap: '0' },   // alignItems (rodada 28): o "+" do slot vazio fica no meio
             estiloRaizJogo: { pointerEvents: 'none' }, estiloDentro: { '.atalho': { pointerEvents: 'auto' } } },   // 17/09 (Syvel, celular): a caixa 114×180 dos atalhos cobria a metade esquerda da Pokébola e engolia o toque. 18/09 (marcelo98m, "botão da Pokébola mais pro canto"): era estiloRaizV2 — só valia no visual novo; no layout PADRÃO do celular (hud_layout.json) a mesma caixa (114×179, âncora right 116,6) cobre 70 % da bola (72 px, right 94,6) e só a coluna da direita respondia (elementFromPoint: 85 % do círculo caía no #atalhos). Vale nos dois layouts; os slots (.atalho) continuam clicáveis. Revisão 18/09: `estiloRaizJogo` = só no jogo — no editor (palco `abs`) a peça continua agarrável pelo miolo
  'bola-btn': { txt: { 'tecla': 'b', 'qtd-ball': 'small' }, imgvar: { 'pokebola': '#bola-icone' }, centrar: { 'pokebola': 'slot-skill-ball' },   // a bola fica no centro do anel (no celular a maquete a deixou 23 px abaixo)
                folha: { 'btn-troca-ball': '#bola-tipo' }, recorteV2: { 'btn-troca-ball': 12 }, esconder: ['em', 'b', 'small', '#bola-tipo'],
                /* recorteV2 (18/09, marcelo98m: "botão da Pokébola fora da imagem, mais pro canto"): no v2 a arte do ⇄ vem com 16 px de margem
                   transparente (caixa 50×50 no celular, ícone de 18 px) e a caixa INTEIRA recebia o toque — cobria 32 % do círculo da bola
                   (quadrante inferior direito) e tocar ali TROCAVA a bola ("Pokébola ×10") em vez de jogar. O clip-path recorta o hit-test
                   junto com o desenho: sobra 26×26 em volta do ícone. Só nas peças v2 — no layout v1 o ⇄ tem 28×28 sem margem. */   // o ⇄ só aparece se a maquete tiver o btn-troca-ball (o celular v3 não tem)
                estiloRaiz: { border: '0', borderRadius: '0', margin: '0', boxShadow: 'none', backgroundColor: 'transparent', overflow: 'visible' },
                estiloDentro: { '#bola-tipo': { border: '0', background: 'none', color: 'transparent', fontSize: '0', boxShadow: 'none', pointerEvents: 'auto' } } },
  'time-hud': { grupo: n => { const m = n.match(/slot-poke-(\d)$/); return m ? '.tcel:nth-child(' + m[1] + ')' : (n === 'card-vida' ? '.tcard' : null); },
                folhaGrupo: n => /^slot-pokemon-\d$/.test(n) ? '.tslot' : (n === 'barra-vida-trilho' ? 'i.tc-trilho' : null),
                txt: { 'tecla': '.tslot > b.tk', 'lvl': '.tcard b.tc-lvn', 'pokemon-nome': '.tcard b.tc-nome', 'vida': '.tcard small.tc-hp' },   // celular v3: nível (só o número) e barrinha direto no slot
                txtPorGrupo: { 'card-vida': { 'pokemon-nome': 'b.tc-nome', 'lvl': 'small.tc-lv', 'lvln': 'b.tc-lvn', 'vida': 'small.tc-hp' } },   // lvln (v2 celular, rodada 28): só o número no badge
                imgvar: { 'pokemon': '.tslot > img' }, fill: { 'vida': 'i.tc-trilho > b.tc-fill' }, esconder: ['.tslot > i', '.tslot > small', '.tslot > u', '.tslot > em', '.tslot > b.tk', '.tcard', '.tcard > *'],   // '.tcard > *': o que a maquete não liga fica escondido (v2 do celular só liga nível e barra; o nome vazava por cima do slot)   // a tecla só aparece se a maquete tiver txt/tecla (o celular v3 mostra o nível no lugar)   // u/em = cortina de recarga e véu KO antigos: a maquete tem os dela (fx/escurecer)
                estiloDentro: { '.tslot': { border: '0', borderRadius: '0', background: 'none', boxShadow: 'none', overflow: 'visible', padding: '0', zIndex: '4' },
                                '.tcard': { border: '0', background: 'none', boxShadow: 'none' } } },
  missao: { grupo: n => n === 'missao-header' ? '.missao-header' : (n === 'missao-corpo' ? '.missao-corpo' : null),
            txtPorGrupo: { 'missao-header': { 'titulo-missao': 'b', 'progresso': 'small.etapa' }, 'missao-corpo': { 'info-missao': 'span.passo', 'recompensa': 'small.rec' } },   // progresso (17/09): "3/4" = objetivo atual / objetivos da missão (a caixa txt/progresso do v2 ficava vazia)
            folha: { 'btn-toggle': '#missao-toggle' }, esconder: ['.missao-header', '.missao-corpo', 'small.onde', 'small.etapa'], capa: 15,   // celular: a arte do cabeçalho (fundo da peça) volta por CIMA do corpo aberto, abaixo do botão (11/09)   // a maquete traz de volta o que ela tem (no celular só o corpo, recolhido)
            colar: { 'img/icone-missao': 'titulo-missao' },   // 18/09 (rodada 31): o ícone anda colado ao começo do título (colarAoTexto)
            semPar: { '.missao-header': { x: 60, y: 48, w: 150, h: 18, fs: 8, cor: '#FFFFFF', al: 'center' } },   // banner v3 do celular (232×116): a faixa escura fica em y 46–66; o título centrado a 8 px, como na captura dela   // celular: a página não tem `missao-header`; o nome da missão entra na barra da placa (pedido do Jaime, 04/09)
            estiloRaiz: { border: '0', boxShadow: 'none', backgroundColor: 'transparent', textAlign: 'left', whiteSpace: 'normal', padding: '0' },
            estiloDentro: { '#missao-toggle': { border: '0', background: 'none', padding: '0', cursor: 'pointer', pointerEvents: 'auto', transition: 'transform .15s' } } },
  fala: { txt: { 'npc-nome': 'b.fala-nome', 'npc-fala': 'span.fala-txt', 'fala': 'span.fala-txt', 'npc-dica': 'small.fala-dica' },   // v2 celular chama o texto de txt/fala
          estiloRaiz: { border: '0', boxShadow: 'none', backgroundColor: 'transparent', padding: '0', color: 'inherit', textShadow: 'none', maxWidth: 'none' } },   // nunca `background` (atalho): apagaria a arte do balão
  'f-alvo': { txt: { 'inimigo-nome': 'b.alvo-nome', 'inimigo-lvl': 'span.alvo-lv', 'inimigo-estado': 'span.alvo-estado' },
              folhaGrupo: n => n === 'barra-vida-trilho' ? 'i.alvo-trilho' : null, fill: { 'vida': 'i.alvo-trilho > b.alvo-fill' },
              estiloRaiz: { border: '0', backgroundColor: 'transparent', boxShadow: 'none', padding: '0', minWidth: '0', pointerEvents: 'none' } },   // só informa: não pode roubar o toque do que estiver embaixo (menu aberto no meio da tela)
  'menu-btn': { estiloRaizV2: { backgroundColor: 'transparent', border: '0', boxShadow: 'none', borderRadius: '0', padding: '0', color: 'transparent', fontSize: '0' } },   // v2 (rodada 28): o ☰ é a arte da maquete — sem o botão redondo antigo por trás (nunca `background`: apagaria a arte)
  /* 18/09 (Jaime: "o ponto vermelho do minimapa não está onde deveria"): saiu o `'#mm-dot': { y: 104 }` do `interno`. O 104 era o centro da
     PEÇA (janela em y 9 + 95); desde 13/09 o ponto mora DENTRO da janela, centrado pelo CSS (top 50 % e margem −5 px), e esta regra o
     empurrava pra y 104 da janela e zerava a margem: 14 px abaixo do jogador no HUD da maquete, 30 px no v2 (janela de 158 px). */
  minimapa: { imgvar: { 'mapa': '#mm-janela' }, soCaixa: ['mapa'], txt: { 'local': '#mm-area' },   // v2: `img/mapa [do-jogo]` = a janela do jogo no lugar da área; `txt/local` = nome da área
              base: { w: 252.8, h: 208 }, interno: { '#mm-janela': { x: 9, y: 9, w: 235, h: 190 }, '#mm-area': { x: 0, y: 210, w: 253, h: 18, fs: 12, minH: 12 } }, estiloDentro: { '#mm-janela': { border: '0', outline: 'none', boxShadow: 'none', borderRadius: '9px' } }, estiloRaiz: { pointerEvents: 'none' } },   // base = peça do PC; no celular (126×104) tudo escala e o nome da área some
  'atalhos-v2': { desenharSemNo: true, exemploNoTxt: true, cliques: { 'atalho-eventos': 'eventos', 'atalho-loja': 'loja' } },   // rodada 29: Eventos/Loja → hud:abrir (menus.mjs abre o banner "Em breve" enquanto não existem)
  'alerta-raid': { desenharSemNo: true, exemploNoTxt: true },            // rodada 29: card da raid — raid_ui.mjs vai preencher; fora de raid fica oculto
  'menu-icones': { grupo: n => { const m = n.match(/^btn-([a-z]+)$/); return m ? 'button[data-j="' + ({ configuracoes: 'config' }[m[1]] || m[1]) + '"]' : null; }, desenharSemNo: true, cliques: { 'btn-mercado': 'mercado', 'btn-guilda': 'guilda', 'btn-calendario': 'eventos', 'btn-fliperama': 'fliperama' },   // v2: cada ícone é um grupo btn-x; o que o jogo não tem (mercado, guilda, calendário, fliperama) fica desenhado, parado
                   folhaGrupo: n => { const m = n.match(/ui\/icone\/(\w+)$/); const j = m && ({ configuracoes: 'config' }[m[1]] || m[1]); return j ? 'button[data-j="' + j + '"]' : null; }, esconder: ['i', 'b'],
                   estiloGrupo: { border: '0', borderRadius: '0', padding: '0', boxShadow: 'none', minWidth: '0', minHeight: '0' } },
};
const MODO_IMG = { ajustar: 'contain', preencher: 'cover' };
export function estiloTexto(el, f){   // usado também pelo popup.mjs: as regras de texto moram num lugar só
  Object.assign(el.style, { position: 'absolute', left: f.x + 'px', top: f.y + 'px', width: f.w + 'px', height: f.h + 'px', right: 'auto', bottom: 'auto', margin: '0', padding: '0', border: '0', borderRadius: '0', background: 'none', textShadow: 'none', maxWidth: 'none', boxSizing: 'border-box', overflow: 'hidden', lineHeight: '1.05', fontStyle: 'normal', textDecoration: 'none', wordBreak: 'normal', overflowWrap: 'normal' });
  el.style.fontFamily = f.fonte ? '"' + f.fonte + '", system-ui, sans-serif' : ''; el.style.fontWeight = f.peso ? String(f.peso) : ''; el.style.fontSize = (f.tamanho || 12) + 'px'; el.style.color = f.cor || '';
  /* v2 (rodada 27): `contorno` = borda escura no número da vida (senão some no verde/amarelo) — 8 sombras de `contornoPx`; `alturaLinha` = entrelinha em px */
  el.style.textShadow = f.contorno ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].map(([a, b]) => (a * (f.contornoPx || 1)) + 'px ' + (b * (f.contornoPx || 1)) + 'px 0 ' + f.contorno).join(',') : 'none';
  if (f.alturaLinha) el.style.lineHeight = f.alturaLinha + 'px';
  el.style.display = 'flex'; el.style.textAlign = f.al || 'left';
  el.style.alignItems = f.alV === 'top' ? 'flex-start' : f.alV === 'bottom' ? 'flex-end' : 'center';
  el.style.justifyContent = f.al === 'center' ? 'center' : f.al === 'right' ? 'flex-end' : 'flex-start';
  const r = f.regra || 'fixo';
  el.style.whiteSpace = (r === 'fixo' || r === 'reticencias' || /^max:/.test(r)) ? 'nowrap' : 'normal';
  el.style.textOverflow = r === 'reticencias' ? 'ellipsis' : '';
  /* `quebrar:N` = até N linhas na MESMA caixa, respeitando o alinhamento vertical da maquete. Não dá pra usar
     -webkit-line-clamp: ele exige display:-webkit-box, que ignora o align-items e prende o texto no topo (o título
     da missão ficou colado em cima). Fica flex (que centra) + teto de N linhas; o excesso é cortado pela caixa. */
  /* `quebrar:N`: até N linhas. Com o texto colado no TOPO dá pra usar o line-clamp do navegador, que corta com
     reticências (é o que a Amanda pede). Com o texto CENTRADO não dá: o line-clamp exige um modo de caixa que ignora
     o alinhamento vertical (foi o que deixou o título da missão colado em cima) — aí fica flex e a caixa corta. */
  if (/^quebrar:/.test(r)){
    el.style.whiteSpace = 'normal'; el.dataset.linhas = r.split(':')[1] || '2';
    if (f.alV === 'top' || f.cortar){ el.style.display = '-webkit-box'; el.style.webkitBoxOrient = 'vertical'; el.style.webkitLineClamp = el.dataset.linhas; el.style.textOverflow = 'ellipsis';
      el.style.webkitBoxPack = f.alV === 'top' ? 'start' : f.alV === 'bottom' ? 'end' : 'center';   // v2 (`cortar`, rodada 28): o box antigo centra pelo -webkit-box-pack — o flex não cortava (a descrição do item vazava por cima e por baixo)
      el.style.lineHeight = (f.cortar && f.alturaLinha ? f.alturaLinha : f.h / (+el.dataset.linhas || 2)) + 'px'; }   // N linhas ocupam a caixa inteira: uma 3ª linha nunca aparece pela metade (a descrição do item mostrava meia linha)
  } else delete el.dataset.linhas;
  if (f.cortar && (r === 'reticencias' || /^max:/.test(r))){              // v2: uma linha que termina em "…" — text-overflow não vale em flex (a recompensa do PC mostrava meio "5")
    el.style.display = 'block'; el.style.lineHeight = f.h + 'px'; el.style.textOverflow = 'ellipsis'; el.style.whiteSpace = 'nowrap';
  }
  el.dataset.regra = r; el.dataset.fs = String(f.tamanho || 12);
  if (SOBRE_BARRA.has(f)) sobreBarra(el, f);
  else if (el.dataset.sobreBarra){ delete el.dataset.sobreBarra; el.__sobreBarra = null; el.style.transform = ''; el.style.translate = ''; }
}
/* NÚMERO SOBRE A BARRA (18/09, Amanda no PR #2: "o número da vida encosta no topo da barra só em alguns, dependendo do número — cara do
   encolher-pra-caber"). Não é o encolher: o txt/vida é `max:N` e nunca muda de fonte nem de caixa (medido com 4, 5, 7 e 9 caracteres: mesma
   fonte, mesma caixa, mesma linha no layout). São arredondamentos do navegador que o Figma não faz:
   1) o Chrome arredonda a ascendente/descendente da fonte pro px inteiro e joga pra cima a meia entrelinha que sobra: a linha de base cai
      até 0,6 px ACIMA da do Figma nas fichas e 0,8 px no layout padrão (flex com entrelinha 1,05);
   2) a linha de base do texto é desenhada no px INTEIRO do espaço da peça/pop-up (o que tem o transform): nó em y 64,5 (lista do padrão)
      sai meio px abaixo; e o fundo da barra também vai pro px inteiro (no v2 recortado pela forma: a barra da ficha desce 0,2 px);
   3) no pop-up (escala 0,85) e no HUD escalado pela tela, a letra ainda é presa na grade de pixels da TELA e a barra (borda suave) não:
      cada linha da lista cai de um jeito (na lista do v2 em 1920×900, umas linhas com o número no meio e outras ~0,6 px acima).
   Só pro texto de UMA linha centrado EM CIMA de uma barra `fill/*` irmã (hoje o txt/vida do HUD do time, da lista e da ficha, v2 e padrão):
   o nó vira bloco com entrelinha inteira (linha de base inteira) e a caixa vai pro px inteiro do espaço da peça/pop-up; o `translate` (que
   o navegador aplica sem arredondar) devolve a fração e leva a linha de base à do Figma (meio da caixa + (asc − desc)/2 da fonte, medida no
   DOM por uma marca na linha de base — vale em qualquer motor) mais o que a barra desceu no desenho; e uma inclinação imperceptível (0,1°:
   0,03 px na ponta de um número de 30 px) tira a letra da grade de pixels da tela. Medido na tinta × a barra desenhada, em px da tela:
   ±0,5 px no PC 1920×900 e 1920×1080, 1536×864 (dpr 1,25), 1366×657 e no celular 844×390 (dpr 2), v2 e padrão (revisão 18/09). */
const SOBRE_BARRA = new WeakMap();                                       /* nó txt da maquete → { fx, fy: fração da posição no espaço da peça; db: quanto a barra desce } */
const UMA_LINHA = r => !r || r === 'fixo' || r === 'reticencias' || /^max:/.test(r);
const fracao = v => v - Math.floor(v + 1e-6);
/** Onde o navegador desenha a barra `fill/*` (fundo no px inteiro; a forma inclinada do v2 recorta na posição exata): o quanto o meio dela
    desce em relação ao layout, em px da caixa. `y` = topo da barra no espaço da peça/pop-up. */
function descidaDaBarra(b, y){
  const T = y, B = y + (+b.h || 0), rt = Math.round(T), rb = Math.round(B), forma = b.forma === 'paralelogramo';
  return ((forma ? Math.max(rt, T) : rt) + (forma ? Math.min(rb, B) : rb)) / 2 - (T + B) / 2;
}
/** Marca, na árvore de uma peça ou pop-up (a raiz é quem tem o transform), os textos de uma linha centrados em cima de uma barra `fill/*`
    irmã, com a fração da posição acumulada e a descida da barra (o estiloTexto os acerta). */
export function marcarSobreBarra(no){
  const anda = (n, ax, ay) => {
    if (!n || typeof n !== 'object') return;
    const fs = Array.isArray(n.filhos) ? n.filhos : null;
    if (!fs) return;
    const barras = fs.filter(g => g && g.tipo === 'fill');
    if (barras.length) for (const t of fs){
      if (!t || t.tipo !== 'txt' || !UMA_LINHA(t.regra) || (t.alV && t.alV !== 'center')) continue;
      const cy = t.y + t.h / 2;
      const b = barras.find(b => Math.min(t.x + t.w, b.x + b.w) > Math.max(t.x, b.x) && cy >= b.y && cy <= b.y + b.h);
      if (b) SOBRE_BARRA.set(t, { fx: fracao(ax + t.x), fy: fracao(ay + t.y), db: descidaDaBarra(b, ay + b.y) });
    }
    for (const g of fs) if (g && Array.isArray(g.filhos)) anda(g, ax + (+g.x || 0), ay + (+g.y || 0));
  };
  anda(no, 0, 0);
  if (no && no.extras && typeof no.extras === 'object') Object.values(no.extras).forEach(ex => anda(ex, 0, 0));   /* peça solta: o jogo a põe em px inteiro */
}
const BASE_LAYOUT = new Map(), METRICA = new Map();                      /* estilo → linha de base do layout (px da caixa); fonte → asc/desc por 1000 */
let ctxMedida = null;
/** Linha de base que o navegador dá a uma caixa com este estilo (px a partir do topo), medida numa sonda fora da tela por uma marca de
    altura 0 alinhada na linha de base — a caixa de verdade pode estar escondida ou ainda fora do documento (o pop-up monta antes de abrir). */
function baseDoLayout(el){
  const s = el.style, chave = [s.fontFamily, s.fontWeight, s.fontSize, s.lineHeight].join('|');
  if (BASE_LAYOUT.has(chave)) return BASE_LAYOUT.get(chave);
  if (!document.body) return null;
  const p = document.createElement('span'), m = document.createElement('span');
  p.style.cssText = s.cssText;
  /* display: sempre o bloco do sobreBarra — a célula vazia da lista esconde o número (display none) e a sonda não mediria nada */
  Object.assign(p.style, { position: 'absolute', left: '-10000px', top: '0', display: 'block', visibility: 'hidden', transform: 'none', translate: 'none', pointerEvents: 'none', textShadow: 'none' });
  m.style.cssText = 'display:inline-block;width:0;height:0;margin:0;padding:0;border:0;vertical-align:baseline';
  p.textContent = '0'; p.appendChild(m);
  document.body.appendChild(p);
  let b = null;
  try { b = m.getBoundingClientRect().top - p.getBoundingClientRect().top; } catch { b = null; }
  p.remove();
  if (b != null && isFinite(b)) BASE_LAYOUT.set(chave, b);
  return b;
}
/** Ascendente e descendente da fonte por 1000 (sem arredondar: as que o Figma usa). */
function metricaDaFonte(familia, peso){
  const chave = peso + '|' + familia;
  if (METRICA.has(chave)) return METRICA.get(chave);
  let r = null;
  try {
    ctxMedida = ctxMedida || document.createElement('canvas').getContext('2d');
    ctxMedida.font = (peso || '400') + ' 1000px ' + familia;
    const m = ctxMedida.measureText('0');
    if (m.fontBoundingBoxAscent > 0 && m.fontBoundingBoxDescent >= 0) r = { a: m.fontBoundingBoxAscent, d: m.fontBoundingBoxDescent };
  } catch { r = null; }
  if (r) METRICA.set(chave, r);
  return r;
}
function sobreBarra(el, f){
  const fr = SOBRE_BARRA.get(f) || { fx: 0, fy: 0, db: 0 };
  el.dataset.sobreBarra = '1'; el.__sobreBarra = f;
  /* bloco com entrelinha inteira: a linha de base do layout cai em px inteiro (no flex com entrelinha 1,05 ela ficava em 8,8 e o
     navegador desenhava em 9); a caixa no px inteiro do espaço da peça — a fração volta pelo translate */
  Object.assign(el.style, { display: 'block', lineHeight: Math.max(1, Math.round(f.h)) + 'px', left: (f.x - fr.fx) + 'px', top: (f.y - fr.fy) + 'px', transform: 'skewY(0.1deg)' });
  acertarBase(el, f);
}
/** Só o translate (não mexe no display: quem esconde a célula vazia continua mandando). */
function acertarBase(el, f){
  const fr = SOBRE_BARRA.get(f) || { fx: 0, fy: 0, db: 0 };
  const fs = parseFloat(el.style.fontSize) || f.tamanho || 12, b = baseDoLayout(el), mt = metricaDaFonte(el.style.fontFamily || 'sans-serif', el.style.fontWeight);
  let d = 0;
  if (b != null && mt){
    d = f.h / 2 + (mt.a - mt.d) / 2000 * fs - b;                         /* linha de base do Figma − a do layout (px da caixa, + = descer) */
    if (!(Math.abs(d) < 4)) d = 0;                                       /* medida esquisita (fonte ainda não chegou, caixa sem altura): não mexe */
  }
  el.style.translate = (+fr.fx.toFixed(3)) + 'px ' + (+(fr.fy + d + (fr.db || 0)).toFixed(3)) + 'px';
}
/* A Nunito chega depois do 1º desenho (e o CSS do Google às vezes depois da 1ª medida): a cada lote de fonte carregada, mede de novo. */
if (typeof document !== 'undefined' && document.fonts?.addEventListener) document.fonts.addEventListener('loadingdone', () => {
  BASE_LAYOUT.clear(); METRICA.clear();
  for (const e of document.querySelectorAll('[data-sobre-barra]')) if (e.__sobreBarra) acertarBase(e, e.__sobreBarra);
});
/** Regra `encolher`: diminui a fonte (até 7 px) até o texto caber na caixa, quebrando só entre palavras. Chamar quando o texto muda.
    18/09 (rodada 32, título da missão com a "trava" do contador): (1) com a entrelinha da maquete (`alturaLinha`, px) cabendo na caixa, a
    sobra VERTICAL não conta o que a área da própria fonte passa da caixa numa linha só — o Baloo 2 a 14 px ocupa 21 px numa caixa de 20 com
    entrelinha 20, e todo título encolhia pra 13 mesmo cabendo; só conta quando o texto quebrou em mais linhas que a caixa comporta. Sem
    entrelinha da maquete (layout antigo, `hud=padrao`, caixas justas de 1,03–1,06× a fonte) segue a conta de sempre: lá a folga cortava o
    acento ("Arco-Íris" das insígnias) — revisão de 18/09. (2) Nem na fonte mínima coube e a caixa só tem altura pra UMA linha: fica uma
    linha com reticências dentro da caixa, em vez de duas linhas cortadas ao meio (o título de 80 letras). Caixa de várias linhas segue como era. */
export function encolher(el){
  if (!el || el.dataset.regra !== 'encolher') return;
  const base = +el.dataset.fs || 12, min = 7;
  if (el.dataset.umaLinha != null){ Object.assign(el.style, { display: el.dataset.umaLinha, whiteSpace: el.dataset.wsBase || 'normal', textOverflow: '', lineHeight: el.dataset.lhBase || '' }); delete el.dataset.umaLinha; delete el.dataset.lhBase; delete el.dataset.wsBase; }
  let fs = base; el.style.fontSize = fs + 'px';
  const lh = /px$/.test(el.style.lineHeight) ? parseFloat(el.style.lineHeight) : 0;   /* entrelinha da maquete (alturaLinha); 0 = a do CSS (1,05) */
  const folga = () => { if (!lh || lh > el.clientHeight + 0.5) return 0.5; const ws = el.style.whiteSpace; el.style.whiteSpace = 'nowrap'; const h = el.scrollHeight; el.style.whiteSpace = ws; return Math.max(0.5, h - el.clientHeight + 0.5); };
  const sobra = () => el.scrollWidth > el.clientWidth + 0.5 || el.scrollHeight > el.clientHeight + folga();
  for (let i = 0; i < 10 && fs > min && sobra(); i++){ fs -= 1; el.style.fontSize = fs + 'px'; }
  if (el.clientHeight > 0 && sobra() && el.clientHeight < 2 * (parseFloat(getComputedStyle(el).lineHeight) || fs * 1.05)){
    el.dataset.umaLinha = el.style.display || ''; el.dataset.lhBase = el.style.lineHeight || ''; el.dataset.wsBase = el.style.whiteSpace || '';
    Object.assign(el.style, { display: 'block', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', lineHeight: el.clientHeight + 'px' });
  }
}
/** Barra proporcional (nó `fill/` do Figma): k = 0..1 e, se quiser, a cor da faixa. Fora do Figma cai em %, que é o
    que o CSS antigo já espera — por isso o jogo pode chamar sempre. */
export function fill(el, k, cor){
  if (!el) return;
  k = Math.max(0, Math.min(1, +k || 0));
  el.__k = k; if (cor) el.__cor = cor;
  el.style.width = el.__figW != null ? (el.__figW * k) + 'px' : (k * 100) + '%';
  if (cor) el.style.backgroundColor = cor;
}
/** Acha um nó do Figma dentro de uma peça montada (criado por nós ou nó do jogo já ligado). */
export function fig(raiz, nome){ return raiz?.querySelector('[data-fig="' + nome + '"],[data-figlig="' + nome + '"]') || null; }

/* ---- tag [recolhe:peça]: o botão esconde o grupo irmão e gira 180°; o estado fica no localStorage por peça ---- */
const RECOLHIDO = 'hud.recolhido';
function recolhidoDe(e){ try { return JSON.parse(localStorage.getItem(RECOLHIDO) || '{}')[e.id] || {}; } catch { return {}; } }
export function recolher(e, nome, on){
  let todos = {}; try { todos = JSON.parse(localStorage.getItem(RECOLHIDO) || '{}'); } catch {}
  todos[e.id] = { ...(todos[e.id] || {}), [nome]: !!on };
  try { localStorage.setItem(RECOLHIDO, JSON.stringify(todos)); } catch {}
  for (const b of e.querySelectorAll('[data-tag="recolhe"]')) aplicarRecolhe(e, b);
}
/** Está recolhido? O que o jogador escolheu (LS) ou, sem escolha, o que a maquete diz (grupo `oculto` nasce recolhido). */
function estaRecolhido(e, nome){
  const rec = recolhidoDe(e) || {};
  if (nome in rec) return !!rec[nome];
  const alvo = e.querySelector('[data-fig="' + nome + '"],[data-figlig="' + nome + '"]') || e.querySelector('.' + nome);
  return !!(alvo && alvo.dataset.oculto === '1');
}
function aplicarRecolhe(e, botao){
  const nome = botao.dataset.tagval;
  const alvo = e.querySelector('[data-fig="' + nome + '"],[data-figlig="' + nome + '"]') || e.querySelector('.' + nome);
  const on = estaRecolhido(e, nome);
  if (alvo) alvo.style.display = on ? 'none' : '';
  const ref = e.__figmaP?.refs?.recolhida, cab = e.querySelector('[data-fig="missao-header"], [data-figlig="missao-header"]');
  if (ref && cab){                                                       // v2 (rodada 27, PC): recolhida, o cabeçalho troca de arte (a faixa curta da ref), e volta ao abrir
    if (!cab.dataset.arteBase){ cab.dataset.arteBase = cab.style.backgroundImage; cab.dataset.hBase = cab.style.height; }
    cab.style.backgroundImage = on ? 'url(' + ref.img + ')' : cab.dataset.arteBase;
    cab.style.height = on ? ref.h + 'px' : cab.dataset.hBase;
  }
  const semArte = !!(cab && e.__figmaP?.cabecalhoSemArteAoAbrir);
  if (semArte){                                                          // v2 (rodada 28, celular): aberta, a faixa some (a arte aberta é o corpo); os textos e a seta ficam
    if (!cab.dataset.arteBase) cab.dataset.arteBase = cab.style.backgroundImage;
    cab.style.backgroundImage = on ? cab.dataset.arteBase : 'none';
  }
  if (cab) for (const c of cab.querySelectorAll('[data-fig^="camada"]')){   // a seta é a camada desenhada: vira pra cima quando o painel está do outro lado do padrão (PC recolhido, celular aberto)
    c.style.transform = (semArte ? !on : on) ? 'rotate(180deg)' : ''; c.style.transformOrigin = '50% 50%';
  }
  botao.style.transform = (on && !cab) ? 'rotate(180deg)' : '';         // no v2 a seta está desenhada na arte; o botão é invisível
  botao.style.transformOrigin = '50% 50%';
  e.classList.toggle('fig-recolhida', on);
  if (e.id === 'missao') ajustarCorpoMissao(e);
  encolherPeca(e, on);
}
/* HITBOX DA PEÇA RECOLHIDA (14/09, l.neto "Hitbox da caixa de missões"): recolhida, a peça continuava com a altura cheia da maquete
   pro mouse — arrastava e engolia o clique (F, andar) na área do corpo escondido. Recolhida, a altura vira a do que ficou visível
   (cabeçalho + botão); aberta, volta à altura da maquete. Guarda a última altura recolhida pra não confundir com um remonte. */
function encolherPeca(e, on){
  if (!on){ if (e.dataset.alturaCheia != null){ e.style.height = e.dataset.alturaCheia; delete e.dataset.alturaCheia; delete e.dataset.alturaRecolhida; } return; }
  if (e.style.height !== e.dataset.alturaRecolhida) e.dataset.alturaCheia = e.style.height || '';
  const r = e.getBoundingClientRect(); const k = (r.height && e.offsetHeight) ? r.height / e.offsetHeight : 1; let fundo = 0;
  for (const el of e.querySelectorAll('*')){ if (!(el.offsetWidth || el.offsetHeight)) continue; const b = el.getBoundingClientRect(); if (!b.height) continue; fundo = Math.max(fundo, (b.bottom - r.top) / k); }
  if (fundo > 8 && fundo < (e.offsetHeight || Infinity) - 1){ e.style.height = Math.ceil(fundo) + 'px'; e.dataset.alturaRecolhida = e.style.height; }
}
/* O CORPO ABERTO DA MISSÃO NÃO ENTRA NO CHAT (celular, 11/09). Na maquete deitada o corpo (descrição + recompensa) mede
   ~267×200 e pende abaixo da peça de 232×116; o chat do celular começa a ~55% da altura da tela, e a recompensa ficava por
   cima da linha das abas Local/Global (10 a 13 px conforme o aparelho — o Jaime viu). Encolhe o corpo o mínimo pra ele
   terminar 6 px acima do chat (nunca abaixo de 0,7×) e refaz a conta quando o chat abre/fecha/muda ou a janela muda. */
export function ajustarCorpoMissao(e = document.getElementById('missao')){
  const corpo = e?.querySelector('.missao-corpo'); if (!corpo) return;
  corpo.style.transform = ''; corpo.style.transformOrigin = 'top center';
  if (!document.body.classList.contains('mobile') || corpo.style.display === 'none') return;
  const chat = document.getElementById('chat'); if (!chat) return;
  const c = chat.getBoundingClientRect(), r = corpo.getBoundingClientRect();
  if (!c.width || !r.height || getComputedStyle(chat).display === 'none') return;
  if (r.right <= c.left || r.left >= c.right || r.bottom <= c.top - 6) return;   // não se tocam: fica como a maquete manda
  const k = Math.max(0.7, Math.min(1, (c.top - 6 - r.top) / r.height));
  if (k < 0.995) corpo.style.transform = 'scale(' + k.toFixed(3) + ')';
  if (!ajustarCorpoMissao.__obs && 'ResizeObserver' in window){       // o chat do celular abre/fecha pelo botão: refaz na hora
    ajustarCorpoMissao.__obs = new ResizeObserver(() => ajustarCorpoMissao());
    ajustarCorpoMissao.__obs.observe(chat);
  }
}
/** Liga as tags de botão que vêm do Figma ([recolhe:x] e [troca:img/y]) num nó já desenhado. */
function ligarTag(peca, el, f, ligado){
  if (!f.tag) return;
  el.dataset.tag = f.tag; el.dataset.tagval = f.tagVal || '';
  el.style.pointerEvents = 'auto'; el.style.cursor = 'pointer';
  if (f.tag === 'recolhe'){
    if (!el.__ligado){ el.__ligado = true; el.addEventListener('click', ev => { ev.stopPropagation(); recolher(peca, el.dataset.tagval, !estaRecolhido(peca, el.dataset.tagval)); }); }
    aplicarRecolhe(peca, el);
  } else if (f.tag === 'acao-seta'){                                     // v2: recolhe/abre o menu de ícones do PC pra direita (fica só a abinha da borda)
    if (!el.__ligado){ el.__ligado = true; el.addEventListener('click', ev => { ev.stopPropagation(); recolherMenu(peca, peca.dataset.menuRecolhido !== '1'); }); }
  } else if (f.tag === 'troca' && !ligado){                              // sem nó do jogo por trás: avisa quem estiver ouvindo
    if (!el.__ligado){ el.__ligado = true; el.addEventListener('click', ev => { ev.stopPropagation(); peca.dispatchEvent(new CustomEvent('hud:troca', { bubbles: true, detail: { alvo: el.dataset.tagval } })); }); }
  }
}

/** v2: o dock de ícones do PC desliza pra direita até sobrar só a abinha (24 px); de novo, volta. Reaplicar o layout (resize) desfaz. */
function recolherMenu(e, on){
  const w = parseFloat(e.style.width) || 0, k = e.__escala || 1;
  if (on && e.dataset.menuRecolhido !== '1'){ e.dataset.rightBase = e.style.right; e.style.right = ((parseFloat(e.style.right) || 0) - (w - 24) * k) + 'px'; }
  else if (!on && e.dataset.rightBase != null) e.style.right = e.dataset.rightBase;
  e.dataset.menuRecolhido = on ? '1' : '0';
}
/** Remonta a árvore do Figma numa peça já posicionada (o jogo chama quando recria o miolo de um botão). */
export function remontar(e){ if (e && e.__figmaP) montarFigma(e, e.__figmaP, !!e.__figmaAbs); }
function montarFigma(e, F, abs){
  const lig = LIGACOES[e.id] || {};
  e.classList.add('fig'); e.__fig = true; e.__figmaP = F; e.__figmaAbs = abs;
  const fechada = !!e.dataset.abrePor && e.dataset.aberta !== '1';    // painel [abre:botão] fechado: continua escondido (o `block` daqui o trazia de volta, fora da tela)
  Object.assign(e.style, { padding: '0', display: (fechada || e.__oculto) ? 'none' : 'block', boxSizing: 'border-box', gap: '0', overflow: 'visible' });
  if (lig.estiloRaiz) Object.assign(e.style, lig.estiloRaiz);
  if (lig.estiloRaizV2 && F.v2) Object.assign(e.style, lig.estiloRaizV2);   // só no v2 (o ☰ do layout antigo do celular não tem arte própria: apagar o botão o faria sumir)
  if (lig.estiloRaizJogo && !abs) Object.assign(e.style, lig.estiloRaizJogo);   // 18/09: só no jogo, nunca no palco do editor (pointer-events:none na raiz dos atalhos deixaria a peça sem como ser agarrada no editor de HUD)
  const q = (pai, sel) => sel ? pai.querySelector(/[ >]/.test(sel) ? ':scope ' + sel : ':scope > ' + sel) : null;
  /* Acha o nó do jogo de uma área e o traz pra DENTRO do elemento do grupo do Figma. A caixa (x/y) do layout é
     relativa ao grupo; se o nó ficar num avô diferente (o <img> mora no botão, a barra mora no trilho), o
     offsetParent é outro e tudo sai deslocado. Três redes: no pai, na peça inteira, e pelo carimbo (já movido). */
  const achar = (pai, sel, nome) => {
    // SÓ dentro do próprio grupo: com 6 slots iguais, procurar na peça inteira faz um slot roubar o nó do outro.
    const el = q(pai, sel) || pai.querySelector('[data-figlig="' + nome + '"]');
    if (el && el.parentElement !== pai) pai.appendChild(el);       // já achado antes e movido: o carimbo reencontra
    return el;
  };
  const caixa = (el, f) => Object.assign(el.style, { position: 'absolute', left: f.x + 'px', top: f.y + 'px', width: f.w + 'px', height: f.h + 'px' });
  /* Nós do jogo sem correspondente no Figma (janela do minimapa): as caixas são as do PC (`base`) e escalam com a peça —
     no celular a peça tem metade do tamanho e a janela transbordava por cima dos golpes. */
  const sx = lig.base ? (parseFloat(e.style.width) || lig.base.w) / lig.base.w : 1, sy = lig.base ? (parseFloat(e.style.height) || lig.base.h) / lig.base.h : 1;
  for (const [sel, box] of Object.entries(lig.interno || {})){
    const el = e.querySelector(sel); if (!el) continue;
    if (box.w != null) caixa(el, { x: box.x * sx, y: box.y * sy, w: box.w * sx, h: box.h * sy }); else if (box.y != null) el.style.top = (box.y * sy) + 'px';
    el.style.margin = '0';
    if (box.fs) el.style.fontSize = (box.fs * Math.min(sx, sy)) + 'px';
    if (box.minH && box.h * sy < box.minH) el.style.display = 'none'; else if (box.minH) el.style.display = '';
  }
  for (const [sel, st] of Object.entries(lig.estiloDentro || {})) for (const el of e.querySelectorAll(sel)) Object.assign(el.style, st);
  for (const sel of (lig.esconder || [])) for (const h of e.querySelectorAll(sel)) h.style.display = 'none';
  const vivos = new Set();
  const recolhiveis = new Set();                                        // grupos `oculto` que um [recolhe:x] da peça abre: desenha e nasce recolhido
  (function achaTags(ns){ for (const f of ns || []){ if (f.tag === 'recolhe' && f.tagVal) recolhiveis.add(f.tagVal); achaTags(f.filhos); } })(F.filhos);
  const desenhar = (pai, filhos, ligTxt) => {
    (filhos || []).forEach((f, i) => {
      if (f.oculto && !(f.tipo === 'grupo' && recolhiveis.has(f.nome))) return;
      const z = String((i + 1) * 10);            // passo de 10: o fx/escurecer de um estado entra no meio da pilha
      if (f.tipo === 'grupo'){
        const sel = lig.grupo?.(f.nome); let el = sel ? pai.querySelector(sel) : null;
        if (!el && sel && !abs && !lig.desenharSemNo) return;             // mapeado mas ausente = não existe agora (slot vazio do time): sem maquete no jogo (`desenharSemNo`: v2 desenha a arte parada)
        if (el){ el.classList.add('fig-slot'); el.dataset.figlig = f.nome; }
        else { el = pai.querySelector('[data-fig="' + f.nome + '"]'); if (!el){ el = document.createElement('div'); el.dataset.fig = f.nome; pai.appendChild(el); } el.className = 'fig-grupo'; }
        if (f.oculto) el.dataset.oculto = '1'; else delete el.dataset.oculto;
        vivos.add(el);
        Object.assign(el.style, { position: 'absolute', left: f.x + 'px', top: f.y + 'px', width: f.w + 'px', height: f.h + 'px', margin: '0', padding: '0', border: '0', background: 'none', boxShadow: 'none', textShadow: 'none', zIndex: z, overflow: 'visible', display: 'block', maxWidth: 'none' });
        if (lig.estiloGrupo) Object.assign(el.style, lig.estiloGrupo);
        if (f.img){ Object.assign(el.style, { backgroundImage: 'url(' + f.img + ')', backgroundColor: 'transparent' }); fundoComFolga(el, f.imgPad); }   // grupo com arte própria (moldura do slot de item, card de vida)
        for (const [sel, st] of Object.entries(lig.estiloDentro || {})) for (const d of el.querySelectorAll(sel)) Object.assign(d.style, st);
        for (const s of (lig.esconder || [])) for (const h of el.querySelectorAll(s)) h.style.display = 'none';
        desenhar(el, f.filhos, lig.txtPorGrupo?.[f.nome] || lig.txt);
        montarFx(el, F.estados?.[f.nome.replace(/-\d+$/, '')], vivos);
        return;
      }
      if (f.tipo === 'txt'){
        const sel = ligTxt?.[f.id]; let el = sel ? achar(pai, sel, f.nome) : null;
        if (el) el.dataset.figlig = f.nome;
        else { el = pai.querySelector('[data-fig="' + f.nome + '"]'); if (!el){ el = document.createElement('span'); el.dataset.fig = f.nome; el.textContent = (abs || lig.exemploNoTxt) ? tr(f.exemplo || '') : ''; pai.appendChild(el); } el.className = 'fig-txt'; }
        vivos.add(el); estiloTexto(el, f); el.style.zIndex = z; encolher(el); return;
      }
      if (f.tipo === 'fill'){                                                  // barra proporcional: o jogo dá a fração (Hud.fill)
        const sel = lig.fill?.[f.id]; let el = sel ? achar(pai, sel, f.nome) : null;
        if (el) el.dataset.figlig = f.nome;
        else { el = pai.querySelector('[data-fig="' + f.nome + '"]'); if (!el){ el = document.createElement('span'); el.dataset.fig = f.nome; pai.appendChild(el); } el.className = 'fig-fill'; }
        vivos.add(el);
        el.__figW = f.wMax != null ? f.wMax : f.w;
        const k = el.__k != null ? el.__k : (el.__figW ? f.w / el.__figW : 1);
        Object.assign(el.style, { position: 'absolute', left: f.x + 'px', top: f.y + 'px', width: (el.__figW * k) + 'px', height: f.h + 'px', margin: '0', padding: '0', border: '0', borderRadius: (f.h / 2) + 'px', zIndex: z, pointerEvents: 'none', display: 'block', maxWidth: 'none', backgroundImage: 'none', backgroundColor: el.__cor || f.cor || '' });
        if (f.forma === 'paralelogramo'){ const i = f.inclinacaoPx || 0; el.style.borderRadius = '0'; el.style.clipPath = 'polygon(' + i + 'px 0, 100% 0, calc(100% - ' + i + 'px) 100%, 0 100%)'; } else el.style.clipPath = '';   // v2: a barra é inclinada; a caixa é o 100 %
        return;
      }
      if (f.tipo === 'img' && (lig.folha || lig.folhaGrupo)){                   // a imagem do Figma É um nó do jogo (botão do atalho, ícone do menu, ⇄ da bola)
        const sel = lig.folha?.[f.nome] || lig.folhaGrupo?.(f.nome), el = sel ? pai.querySelector(sel) : null;
        if (el){ el.classList.add('fig-slot'); el.dataset.figlig = f.nome; vivos.add(el); caixa(el, f); el.style.clipPath = (F.v2 && lig.recorteV2?.[f.nome] != null) ? 'inset(' + lig.recorteV2[f.nome] + 'px)' : ''; Object.assign(el.style, { display: '', margin: '0', zIndex: z, backgroundImage: 'url(' + f.img + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundColor: 'transparent', maxWidth: 'none', maxHeight: 'none' }, lig.estiloGrupo || {}); for (const s of (lig.esconder || [])) for (const h of el.querySelectorAll(s)) h.style.display = 'none'; ligarTag(e, el, f, true); return; }
      }
      if (f.tipo === 'imgvar' && lig.imgvar?.[f.id]){                             // imagem trocável que já existe no jogo (<img> do slot, <div> com background do ícone)
        const el = achar(pai, lig.imgvar[f.id], f.nome);
        if (el){
          el.dataset.figlig = f.nome; vivos.add(el); caixa(el, f);
          Object.assign(el.style, { margin: '0', padding: '0', zIndex: z, display: 'block', pointerEvents: 'none', maxWidth: 'none', maxHeight: 'none' });
          if (f.raio) el.style.borderRadius = f.raio + 'px';
          if (lig.soCaixa?.includes(f.id)) return;                        // v2 `img/mapa [do-jogo]`: a janela do minimapa desenha o próprio conteúdo — só a caixa
          if (el.tagName === 'IMG') el.style.objectFit = MODO_IMG[f.regra] || 'contain';
          else Object.assign(el.style, { backgroundSize: MODO_IMG[f.regra] || 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' });
          return;
        }
      }
      if (f.tipo === 'clique'){                                                // v2: área invisível que só carrega a ação (a seta está desenhada na arte da peça)
        const sel = lig.folha?.[f.nome]; let el = sel ? (pai.querySelector(sel) || e.querySelector(sel)) : null;   // o botão do jogo pode morar fora do grupo (o #missao-toggle fica na peça, não no cabeçalho): traz pra dentro
        if (el && el.parentElement !== pai) pai.appendChild(el);
        if (el){ el.classList.add('fig-slot'); el.dataset.figlig = f.nome; caixa(el, f); Object.assign(el.style, { display: 'block', margin: '0', padding: '0', zIndex: z, opacity: '0', border: '0', background: 'none', fontSize: '0', pointerEvents: 'auto' }); }
        else { el = pai.querySelector('[data-fig="' + f.nome + '"]'); if (!el){ el = document.createElement('span'); el.dataset.fig = f.nome; pai.appendChild(el); } el.className = 'fig-clique'; Object.assign(el.style, { position: 'absolute', left: f.x + 'px', top: f.y + 'px', width: f.w + 'px', height: f.h + 'px', zIndex: z, background: 'none', border: '0', margin: '0', padding: '0', pointerEvents: 'auto', cursor: 'pointer' }); }
        vivos.add(el); ligarTag(e, el, f, !!sel); return;
      }
      if (f.tipo === 'img' || f.tipo === 'imgvar'){
        /* 17/09 (auditoria dos placeholders): duas sobreposições com o MESMO nome no mesmo slot (`fx/escurecer` do desmaiado e do cooldown, time do PC)
           caíam no mesmo nó e a segunda trocava o estado da primeira: o slot do Pokémon desmaiado nunca escurecia no v2. O estado entra na busca. */
        let el = pai.querySelector('[data-fig="' + f.nome + '"]' + (f.sobre ? '[data-fx="' + f.sobre + '"]' : ':not([data-fx])'));
        if (!el){ el = document.createElement('span'); el.dataset.fig = f.nome; pai.appendChild(el); }
        el.className = f.tipo === 'img' ? 'fig-img' : 'fig-var'; if (f.tipo === 'imgvar') el.dataset.var = f.id;
        vivos.add(el);
        Object.assign(el.style, { position: 'absolute', left: f.x + 'px', top: f.y + 'px', width: f.w + 'px', height: f.h + 'px', zIndex: z, pointerEvents: 'none',
          border: '0', borderRadius: '0', backgroundColor: 'transparent', boxShadow: 'none', margin: '0', padding: '0', font: 'inherit', color: 'inherit',   // o CSS do jogo pinta span de dentro de botão (era o anel vermelho na bola)
          backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundSize: f.tipo === 'img' ? '100% 100%' : (MODO_IMG[f.regra] || 'contain') });
        if (f.tipo === 'img') el.style.backgroundImage = 'url(' + f.img + ')';
        else if (abs && f.exemplo && !el.style.backgroundImage) el.style.backgroundImage = 'url(' + f.exemplo + ')';   // editor: mostra o exemplo da maquete
        if (f.raio) el.style.borderRadius = f.raio + 'px';
        if (f.tipo === 'imgvar' && el.__bolinha) encaixarBolinha(el, el.__bolinha.slot, el.__bolinha.src);   // 18/09: a remontagem devolveu o ícone de tipo à caixa da maquete — volta pra caixa do slot-tipo
        if (f.sobre){ el.dataset.fx = f.sobre; el.classList.add('fig-sobre'); if (el.dataset.k == null) el.style.display = 'none'; else aplicarEstado(el, +el.dataset.k); }   // v2: imagem por cima SÓ no estado (Hud.estado liga; cooldown desce pelo clip)
        else if (el.dataset.fx){ delete el.dataset.fx; el.classList.remove('fig-sobre'); }
        ligarTag(e, el, f, false);
      }
    });
  };
  marcarSobreBarra(F);                                                   /* 18/09: número em cima da barra (txt/vida) com a linha de base do Figma */
  desenhar(e, F.filhos, lig.txt);
  for (const [id, ref] of Object.entries(lig.centrar || {})){             // imagem variável centrada na moldura que a envolve (Pokébola no anel): a maquete do celular veio deslocada
    const el = e.querySelector('[data-figlig="img/' + id + '"], [data-fig="img/' + id + '"]'), m = e.querySelector('[data-fig="' + ref + '"]');
    if (!el || !m) continue;
    const n = k => parseFloat(k) || 0;
    el.style.left = (n(m.style.left) + (n(m.style.width) - n(el.style.width)) / 2) + 'px';
    el.style.top = (n(m.style.top) + (n(m.style.height) - n(el.style.height)) / 2) + 'px';
  }
  for (const [nomeImg, idTxt] of Object.entries(lig.colar || {})) colarAoTexto(e, F, nomeImg, idTxt);   // 18/09: ícone colado ao título (missão)
  /* CAPA (11/09): a arte de fundo da peça desenhada de novo POR CIMA dos filhos. No celular o cabeçalho da missão (ícone +
     faixa) é o fundo da peça e o corpo aberto é um filho: sem isto a moldura do corpo cobria o ícone. Só quando a peça tem
     arte de fundo (no PC o cabeçalho é um grupo e não precisa). */
  let capa = e.querySelector(':scope > .fig-capa');
  const arteFundo = /^url\(/.test(e.style.backgroundImage) ? e.style.backgroundImage : (capa?.style.backgroundImage || '');
  if (lig.capa != null && arteFundo){
    if (!capa){ capa = document.createElement('div'); capa.className = 'fig-capa'; e.appendChild(capa); }
    Object.assign(capa.style, { position: 'absolute', inset: '0', backgroundImage: arteFundo, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', pointerEvents: 'none', zIndex: String(lig.capa) });
    e.style.backgroundImage = 'none';                                     // a arte mora na capa agora (duplicada, a borda macia do ícone escurecia)
  } else if (capa) capa.remove();
  for (const [sel, box] of Object.entries(lig.semPar || {})){             // nó do jogo que a maquete NÃO tem: entra num lugar combinado, com o tamanho da peça
    const el = e.querySelector(sel); if (!el || el.dataset.figlig) continue;
    Object.assign(el.style, { display: 'block', position: 'absolute', left: box.x + 'px', top: box.y + 'px', width: box.w + 'px', height: box.h + 'px',
      fontSize: box.fs + 'px', lineHeight: box.h + 'px', color: box.cor || '#fff', fontWeight: '700', margin: '0', padding: '0',
      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', textAlign: box.al || 'left', zIndex: '30', pointerEvents: 'none' });
  }
  montarFx(e, F.estados?.[F.nome], vivos);                              // a peça inteira pode ter estado (a Pokébola)
  for (const el of e.querySelectorAll('[data-fig]')) if (!vivos.has(el)) el.remove();
  for (const b of e.querySelectorAll('[data-tag="recolhe"]')) aplicarRecolhe(e, b);   // de novo, com TUDO desenhado: o toggle vem antes do corpo na árvore e decidia sem ele (a missão do celular nascia aberta)
  if (F.v2 && lig.cliques) for (const [nome, janela] of Object.entries(lig.cliques)){   // rodada 29: grupo desenhado sem nó do jogo vira botão — o menus.mjs escuta hud:abrir
    const el = e.querySelector('[data-fig="' + nome + '"]'); if (!el || el.__cliqueHud) continue;
    el.__cliqueHud = true; Object.assign(el.style, { pointerEvents: 'auto', cursor: 'pointer' });
    el.addEventListener('click', ev => { ev.stopPropagation(); document.dispatchEvent(new CustomEvent('hud:abrir', { detail: janela })); });
  }
  if (F.v2 && F.refsFilhos) for (const [nome, refs] of Object.entries(F.refsFilhos)){   // rodada 29: sem novidade/promoção, o atalho usa a arte da ref e esconde badge/selo (o brilho [gira] já nasce escondido)
    const est = refs['sem-novidade'] ? 'sem-novidade' : refs['sem-promo'] ? 'sem-promo' : null; if (!est) continue;
    const g = e.querySelector('[data-fig="' + nome + '"]'); if (!g) continue;
    /* 18/09 (Amanda, PR #2/#3: "ícone do atalho Eventos deslocado à esquerda no botão; a Loja está certa"): a arte da ref é SÓ a placa (68×74 + a
       folga no PC) e o grupo do HUD é maior (72,4×78,4: o badge-novidades sobra à direita e em cima; na Loja o selo-promo sobra só em cima). Pintada
       com o tamanho do grupo, a placa esticava 4,4 px pra direita e pra cima e o emblema ficava 2,2 px à esquerda do meio dela. Agora a arte vai no
       tamanho DELA, no lugar em que a placa fica dentro do grupo (`x`/`y` que o conversor mede pelos filhos em comum; layout sem eles: embaixo à
       esquerda, que é onde o badge e o selo deixam a placa). Com novidade/promoção a arte do grupo (placa + badge) continua a de sempre. */
    const r = refs[est];
    if (r.img && r.w && r.h){
      const pad = r.imgPad || 0, x = r.x != null ? r.x : 0, y = r.y != null ? r.y : (parseFloat(g.style.height) || r.h) - r.h;
      Object.assign(g.style, { backgroundImage: 'url(' + r.img + ')', backgroundSize: (r.w + 2 * pad) + 'px ' + (r.h + 2 * pad) + 'px', backgroundPosition: (x - pad) + 'px ' + (y - pad) + 'px', backgroundRepeat: 'no-repeat' });
    } else if (r.img) g.style.backgroundImage = 'url(' + r.img + ')';
    for (const b of g.querySelectorAll('[data-fig="badge-novidades"],[data-fig="selo-promo"]')) b.style.display = 'none';
  }
}
/* ÍCONE COLADO AO TÍTULO (18/09, teste local da Amanda com a rodada 31 — "ícone da missão do topo longe do título e os dois descentralizados"):
   na maquete img/icone-missao + txt/titulo-missao são UM bloco — o ícone a 11,9 px (PC; 5,1 no celular) do começo do título, e o título de
   exemplo enche a caixa dele (230 px no PC, texto centrado). O jogo desenhava cada um na caixa fixa da maquete: um título mais curto ia pro meio
   da caixa e o ícone ficava lá atrás (66 px de vão com "O Início da Jornada"). Agora o ícone anda com o começo do texto, na distância da
   maquete; como o título continua centrado na caixa dele, o conjunto fica centrado no mesmo ponto em que a maquete o pôs (o meio da faixa antes
   do "3/5": x 195 de 460 no PC, 85 de 200 no celular). Título que não cabe: o encolher o põe na caixa inteira e o ícone volta ao lugar da
   maquete. Refeito a cada montagem da peça e quando a fonte do título termina de chegar (a largura muda). */
function colarAoTexto(e, F, nomeImg, idTxt){
  const achaGrupo = ns => { for (const g of ns || []){ if ((g.filhos || []).some(x => x.nome === nomeImg) && g.filhos.some(x => x.tipo === 'txt' && x.id === idTxt)) return g; const r = achaGrupo(g.filhos); if (r) return r; } return null; };
  const gd = (F.filhos || []).some(x => x.nome === nomeImg) ? F : achaGrupo(F.filhos); if (!gd) return;
  const fi = gd.filhos.find(x => x.nome === nomeImg), ft = gd.filhos.find(x => x.tipo === 'txt' && x.id === idTxt); if (!fi || !ft) return;
  const g = gd === F ? e : e.querySelector('[data-figlig="' + gd.nome + '"],[data-fig="' + gd.nome + '"]'); if (!g) return;
  const ic = g.querySelector(':scope > [data-fig="' + nomeImg + '"]'), tx = g.querySelector(':scope > [data-figlig="' + ft.nome + '"],:scope > [data-fig="' + ft.nome + '"]');
  if (!ic || !tx) return;
  let x0 = ft.x;                                                          // começo do texto; sem medida (peça escondida, título vazio) fica o da maquete
  const rt = tx.getBoundingClientRect(), k = tx.offsetWidth ? rt.width / tx.offsetWidth : 0;
  if (k > 0 && tx.textContent.trim()){
    const rg = document.createRange(); rg.selectNodeContents(tx); const rr = rg.getBoundingClientRect();
    if (rr.width > 0) x0 = ft.x + Math.max(0, (rr.left - rt.left) / k); // passou da caixa (não coube): o começo visível é a borda dela
  }
  ic.style.left = (fi.x + (x0 - ft.x)) + 'px';
  if (document.fonts && document.fonts.status !== 'loaded' && !e.__colarFonte){
    e.__colarFonte = true;
    document.fonts.ready.then(() => { e.__colarFonte = false; if (e.__figmaP === F){ encolher(tx); colarAoTexto(e, F, nomeImg, idTxt); } });
  }
}
/* ===== Estados (`fx/escurecer` das cópias de referência): a sombra é o PNG da própria arte pintado de preto com
   máscara CSS — pega o contorno exato (moldura dourada inclusa) e não vaza pra fora dele. Nasce escondida; quem liga
   é o jogo, por `Hud.estado(elemento, nome, k)`. Em `cooldown`, k é o que FALTA: 1 = escuro inteiro, 0 = limpo, e a
   sombra é cortada por cima, então ela desce e a peça vai clareando. */
function montarFx(raiz, defs, vivos){
  if (!raiz || !defs) return;
  for (const [estado, d] of Object.entries(defs)){
    for (const fx of d.fx || []){
      const dono = fx.caminho ? (raiz.querySelector('[data-fig="' + fx.caminho + '"],[data-figlig="' + fx.caminho + '"]') || null) : raiz;
      if (!dono) continue;
      const chave = 'fx:' + estado + ':' + fx.caminho + ':' + fx.id;
      let el = dono.querySelector(':scope > [data-fig="' + chave + '"]');
      if (!el){ el = document.createElement('span'); el.dataset.fig = chave; dono.appendChild(el); }
      el.className = 'fig-fx'; el.dataset.fx = estado;
      vivos?.add(el);
      Object.assign(el.style, { position: 'absolute', left: fx.x + 'px', top: fx.y + 'px', width: fx.w + 'px', height: fx.h + 'px',
        zIndex: String(fx.z), pointerEvents: 'none', margin: '0', padding: '0', border: '0', backgroundColor: fx.cor || '#000',
        opacity: String(fx.op != null ? fx.op : 0.55), backgroundImage: 'none' });
      if (fx.img){ el.style.webkitMaskImage = 'url(' + fx.img + ')'; el.style.maskImage = 'url(' + fx.img + ')';
                   el.style.webkitMaskSize = '100% 100%'; el.style.maskSize = '100% 100%';
                   el.style.webkitMaskRepeat = 'no-repeat'; el.style.maskRepeat = 'no-repeat'; }
      if (el.dataset.k == null) el.style.display = 'none';
      else aplicarEstado(el, +el.dataset.k);
    }
    for (const [id, op] of Object.entries(d.imgs || {})){                  // `img/pokemon` a 0,6 no desmaiado
      const alvo = raiz.querySelector('[data-fig="img/' + id + '"],[data-figlig="img/' + id + '"]');
      if (alvo && !alvo.dataset.opBase) alvo.dataset.opBase = String(op);
    }
  }
}
function aplicarEstado(el, k){
  el.dataset.k = String(k);
  if (!(k > 0)){ el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.clipPath = k >= 1 ? '' : 'inset(' + ((1 - k) * 100).toFixed(1) + '% 0 0 0)';
}
/** Liga/desliga um estado do Figma numa peça ou num slot. k = quanto falta (1 = cheio, 0 = nada). */
export function estado(raiz, nome, k){
  if (!raiz) return;
  for (const el of raiz.querySelectorAll('[data-fx="' + nome + '"]')) aplicarEstado(el, k);
  if (nome === 'desmaiado') for (const el of raiz.querySelectorAll('[data-op-base]')) el.style.opacity = k > 0 ? el.dataset.opBase : '';
}
function desmontarFigma(e){
  if (!e || !e.__fig) return;
  e.__fig = false; e.__figmaP = null; e.classList.remove('fig');
  for (const el of e.querySelectorAll('[data-fig]')) el.remove();
  for (const el of e.querySelectorAll('.fig-slot, .fig-slot *, [data-figlig]')){
    el.classList.remove('fig-slot'); el.removeAttribute('style');
    for (const k of ['regra', 'fs', 'figlig', 'tag', 'tagval']) delete el.dataset[k];
    el.__figW = undefined; el.__k = undefined; el.__cor = undefined;
  }
}
/* Peça nova num layout salvo antes dela existir: com a barra "solta" (display:contents) uma peça sem registro cairia no fluxo do
   documento, no canto da tela. Até o jogador reposicionar no editor (que dá a posição padrão), ela entra aqui. */
const FALLBACK = { atalhos: { ax: 'right', x: 12, ay: 'bottom', y: 100, s: 1 } };
/* Decisões do Jaime que a maquete ainda não tem (04/09, depois do teste no iPhone): valem POR CIMA do registro do layout.
   Chat do celular: ancorado logo acima do botão 💬, transparente e sempre expandido — o botão só esconde/mostra (`dock`). */
const SOBRE = { celular_deitado: { chat: { ax: 'left', x: 160, ay: 'bottom', y: 62, s: 1, w: 320, h: 120, dock: true, abrePor: null },
                                  'chat-btn': { ax: 'left', x: 160, ay: 'bottom', y: 10, s: 1, w: 44, h: 44, abre: 'chat' } } };
/* Status do inimigo da maquete (`f-alvo`, segue o alvo) DESLIGADO por enquanto (Jaime, 06/09): ficava em cima do rótulo antigo do
   selvagem (nome/nível/HP), que ele prefere. `?alvoFigma=1` religa; `figmateste` (conferidor) mantém pra medir. */
const ALVO_FIGMA = /[?&](alvoFigma|figmateste)=1(&|$)/.test(location.search);
if (!ALVO_FIGMA) for (const pr of ['pc', 'celular_deitado']) (SOBRE[pr] = SOBRE[pr] || {})['f-alvo'] = { oculto: true };   // a página v3 da Amanda tirou o chat do celular; o Jaime quer o chat ancorado + o botão
/** Imagens livres do layout (img-1, img-2… criadas no editor): cria/posiciona/apaga os divs .hud-img. */
export function aplicarImagens(L, raiz = document){
  const quer = new Set(Object.keys(L || {}).filter(k => k.startsWith('img-')));
  for (const el of [...raiz.querySelectorAll('.hud-img')]) if (!quer.has(el.id)) el.remove();
  for (const id of quer){
    let el = raiz.getElementById(id);
    if (!el){ el = raiz.createElement ? raiz.createElement('div') : document.createElement('div'); el.id = id; el.className = 'hud-img'; (raiz.body || raiz).appendChild(el); }
    posicionar(el, L[id], false);
  }
}
/** Âncora "centro" (05/09): numa maquete do Figma, peça cujo centro cai entre 30% e 70% da largura da maquete fica presa ao
    MEIO da tela (barra de golpes, Pokébola, atalhos, placa da missão). Com âncora só nos cantos, a barra de baixo abria um vão
    no meio em monitor 2K/ultrawide. Peças de SOBRE (chat do celular), `[abre:]`, `[segue:]`, ocultas e congeladas ficam como estão. */
function comAncoraCentro(reg, el, T){
  if (!reg || !T || !el || reg.oculto || reg.segue || reg.abre || reg.abrePor || reg.dock || reg.congelada) return reg;
  const w = reg.w || el.offsetWidth || 0; if (!w) return reg;
  const x0 = reg.ax === 'right' ? T.w - (reg.x || 0) - w : (reg.x || 0);
  const cx = Math.round((x0 + w / 2) / T.w * 100);                       // % da largura da maquete (arredondado: o ☰ do celular está em 70,02% e fica na direita, junto do minimapa)
  if (cx <= 30 || cx >= 70) return reg;
  return { ...reg, ax: 'center', dx: x0 + w / 2 - T.w / 2 };
}
/* ===== Peças que o JOGADOR pode arrastar (05/09, pedido do Jaime: com zoom alto o painel de missão atrapalha). Mouse ou
   dedo (Pointer Events); tocar sem mover continua sendo clique (a seta de recolher). O deslocamento fica em px da MAQUETE
   (escala junto com a HUD), por preset (a maquete do PC não é a do celular), em LS `hud.mover` (sobrevive ao "Apagar
   progresso"; na sandbox `figmateste` fica só na memória). A peça não sai da tela. Configurações → "↺ lugar padrão". */
export const MOVIVEIS = ['missao'];
let MOVER_MEM = null;
export function lerMover(){
  if (MOVER_MEM) return MOVER_MEM;
  if (!SANDBOX_LS) try { MOVER_MEM = JSON.parse(localStorage.getItem('hud.mover') || 'null'); } catch {}
  if (!MOVER_MEM || typeof MOVER_MEM !== 'object') MOVER_MEM = {};
  return MOVER_MEM;
}
function gravarMover(M){ MOVER_MEM = M; if (!SANDBOX_LS) try { localStorage.setItem('hud.mover', JSON.stringify(M)); } catch {} }
/** Volta todas as peças arrastadas pro lugar da maquete. */
export function zerarMover(){ gravarMover({}); const [l, r] = aplicar.__ultimo || []; if (l && r) aplicar(l, presetAtual(), r); }
function comDeslocamento(reg, off){
  if (!reg || !off || (!off.x && !off.y)) return reg;
  const r = { ...reg };
  if (r.ax === 'center') r.dx = (r.dx || 0) + off.x; else if (r.ax === 'right') r.x = (r.x || 0) - off.x; else r.x = (r.x || 0) + off.x;
  if (r.ay === 'bottom') r.y = (r.y || 0) - off.y; else r.y = (r.y || 0) + off.y;
  return r;
}
function ligarArrasto(el, id, preset){
  el.__preset = preset; el.classList.add('movivel'); el.style.touchAction = 'none';
  if (el.__arrasto) return; el.__arrasto = true;
  let ini = null;
  el.addEventListener('pointerdown', ev => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (ev.target.closest('input, textarea, select')) return;
    const off = (lerMover()[el.__preset] || {})[id] || { x: 0, y: 0 };
    ini = { px: ev.clientX, py: ev.clientY, off, atual: off, moveu: false, pid: ev.pointerId };
  });
  el.addEventListener('pointermove', ev => {
    if (!ini || ev.pointerId !== ini.pid) return;
    const dx = ev.clientX - ini.px, dy = ev.clientY - ini.py;
    if (!ini.moveu){ if (Math.hypot(dx, dy) < 6) return; ini.moveu = true; el.classList.add('arrastando'); try { el.setPointerCapture(ev.pointerId); } catch {} }   // só prende o ponteiro quando vira arrasto, senão o toque na seta deixaria de ser clique
    const k = ESCALA || 1, base = el.__regBase; if (!base) return;
    const off = { x: ini.off.x + dx / k, y: ini.off.y + dy / k };
    ancorar(el, comDeslocamento(base, off), k);
    const r = el.getBoundingClientRect(); let cx = 0, cy = 0;                  // não sai da tela
    if (r.left < 0) cx = -r.left; else if (r.right > innerWidth) cx = innerWidth - r.right;
    if (r.top < 0) cy = -r.top; else if (r.bottom > innerHeight) cy = innerHeight - r.bottom;
    if (cx || cy){ off.x += cx / k; off.y += cy / k; ancorar(el, comDeslocamento(base, off), k); }
    ini.atual = off; ev.preventDefault();
  });
  const fim = ev => {
    if (!ini || ev.pointerId !== ini.pid) return;
    const { moveu, atual } = ini; ini = null;
    if (!moveu) return;                                                  // toque sem mover: clique normal
    el.classList.remove('arrastando'); try { el.releasePointerCapture(ev.pointerId); } catch {}
    const M = lerMover(); (M[el.__preset] = M[el.__preset] || {})[id] = { x: Math.round(atual.x), y: Math.round(atual.y) }; gravarMover(M);
    const bloqueia = e2 => { e2.stopPropagation(); e2.preventDefault(); };   // o clique que fecha o arrasto não vale (não recolhe nem abre nada)
    el.addEventListener('click', bloqueia, { capture: true, once: true });
    setTimeout(() => el.removeEventListener('click', bloqueia, { capture: true }), 300);
  };
  el.addEventListener('pointerup', fim); el.addEventListener('pointercancel', fim);
}
/** Aplica o layout do preset no documento do jogo. Devolve true se havia layout. */
/* Maquete do Figma (layout com `_figma`): desenhada pra tela do preset (1920×900 no PC, 844×390 deitado). Em janela menor a HUD
   inteira encolhe na proporção, como o pop-up faz — com px fixos a Pokébola e os atalhos entravam na barra de golpes a 1500 px.
   Em tela MAIOR que a maquete ela cresce até TETO_ESCALA (1,25) e as peças do meio (comAncoraCentro) ficam presas ao centro;
   o que sobra de tela vai pras bordas. Layouts do editor (sem `_figma`) continuam em px, como sempre. */
export function escalaPara(layout, preset, raiz = document){
  const T = PRESETS[preset];
  if (!(layout?._figma && raiz === document && T)) return 1;
  const cabe = Math.min(innerWidth / T.w, innerHeight / T.h);           // até onde a maquete cabe na tela
  const auto = Math.min(TETO_ESCALA, cabe);                              // escala automática: encolhe, cresce até 1,25
  return Math.min(auto * TAMANHOS[TAMANHO].hud, cabe);                   // × tamanho escolhido nas Configurações, sem passar do que cabe
}
export function aplicar(layout, preset = presetAtual(), raiz = document){
  const L = layout?.[preset];
  const barra = raiz.getElementById('barra');
  ESCALA = escalaPara(layout, preset, raiz);
  aplicar.__ultimo = [layout, raiz];
  if (!aplicar.__resize && raiz === document){                           // a janela mudou de tamanho: reaplica só se a escala (ou o preset) mudar
    aplicar.__resize = true; let t = 0;
    addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => {
      const [l, r] = aplicar.__ultimo || []; if (!l?._figma) return;
      if (document.body.classList.contains('mobile') && innerHeight > innerWidth) return;   // celular em pé: a tela "vire o celular" cobre; não remonta (não há maquete em pé)
      const pr = presetAtual(); if (escalaPara(l, pr, r) !== ESCALA || pr !== aplicar.__preset) aplicar(l, pr, r);
      ajustarCorpoMissao();                                               // a janela mudou: o corpo da missão pode ter entrado (ou saído) do chat
    }, 150); });
  }
  aplicar.__preset = preset;
  /* O chat ainda não tem peça na maquete do PC: fica onde o CSS o põe, mas mais estreito — com 380 px entrava 89 px na barra de golpes. */
  const FB = layout?._figma
    ? { ...FALLBACK,
        'f-parceiro': { ax: 'left', x: 0, ay: 'top', y: 0, s: 1, oculto: true },          // o slot 1 do time já mostra o parceiro; o rótulo antigo ficava solto atrás do chat / embaixo do joystick
        ...(preset === 'pc' ? { chat: { ax: 'left', x: 12, ay: 'bottom', y: 12, s: 1, w: 286 },
                                'menu-btn': { ax: 'right', x: 12, ay: 'top', y: 12, s: 1, oculto: true, forcarOculto: true } } : {}),   // ☰ não existe na maquete do PC: os ícones e o Esc abrem tudo (pedido do Jaime, 04/09)
        ...(preset === 'celular_deitado' ? { 'cam-btns': { ax: 'left', x: 367, ay: 'bottom', y: 8, s: 1 } } : {}) }   // ↺↻ não estão na maquete: rodapé central, longe da Pokébola
    : FALLBACK;
  if (!L){ barra?.classList.remove('solto'); for (const id of PECAS) limpar(raiz.getElementById(id)); aplicarImagens(null, raiz); return false; }
  for (const id of PECAS_V2) if (L[id] && raiz.getElementById && !raiz.getElementById(id)){ const d = document.createElement('div'); d.id = id; (raiz.body || document.body).appendChild(d); }   // rodada 29: peças que só a maquete v2 tem
  /* Peça SEM registro no layout (ex.: o arquivo do Figma só tem a barra de skills): congela onde o CSS a deixou, medido ANTES
     de soltar a barra — senão ela cai no fluxo do documento e vai parar no canto superior esquerdo (a Pokébola e a barra
     prata sumiram assim em 02/09). Medido uma vez por peça; o registro fica no canto mais perto, como no editor. */
  aplicar.__congeladas = aplicar.__congeladas || {};
  if (!barra?.classList.contains('solto')) for (const id of PECAS){
    if (L[id] || FB[id] || aplicar.__congeladas[id]) continue;
    const e = raiz.getElementById(id); if (!e || e.hidden) continue;
    const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0) aplicar.__congeladas[id] = registroDe(r, innerWidth, innerHeight, { congelada: true });
  }
  barra?.classList.add('solto');
  const SB = SOBRE[preset] || {};
  const T = (layout?._figma && raiz === document) ? PRESETS[preset] : null;   // maquete do Figma na tela de verdade: vale a âncora "centro"
  const M = lerMover()[preset] || {};                                    // peças que o jogador arrastou (px da maquete)
  for (const id of PECAS){
    const el = raiz.getElementById(id);
    if (SB[id]){ posicionar(el, { ...(L[id] || {}), ...SB[id] }, false); continue; }   // decisão do jogo (chat do celular): âncora como está
    const reg = comAncoraCentro(L[id] || FB[id] || aplicar.__congeladas[id], el, T);
    const movivel = !!(el && reg && raiz === document && MOVIVEIS.includes(id));
    posicionar(el, movivel ? comDeslocamento(reg, M[id]) : reg, false);
    if (movivel){ el.__regBase = reg; ligarArrasto(el, id, preset); }
  }
  aplicarImagens(L, raiz);
  return true;
}
/** O layout que o último `aplicar` usou (rodada 26: o raid_ui.mjs lê dele os registros `popups.<ori>.raid.hud`). */
export const layoutAtual = () => aplicar.__ultimo?.[0] || null;
/** Registro de peça a partir de um retângulo no palco (w×h): prende ao canto mais perto. */
export function registroDe(rect, palcoW, palcoH, extra = {}){
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const ax = cx < palcoW / 2 ? 'left' : 'right', ay = cy < palcoH / 2 ? 'top' : 'bottom';
  return { ax, x: Math.round(ax === 'left' ? rect.left : palcoW - rect.right), ay, y: Math.round(ay === 'top' ? rect.top : palcoH - rect.bottom), s: 1, ...extra };
}
