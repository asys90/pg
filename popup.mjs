import { t as tr, tHtml } from './i18n.mjs';   // IDIOMA (11/09): tr() traduz texto pt pro idioma do jogador
/* Pop-ups do Figma da Amanda (campo `popups` do ui/hud_layout.json, gerado por tools/layout_figma_para_hud.mjs).
 *
 * Diferente das peças do HUD, que se penduram em nós que o jogo já tem (hud.mjs, LIGACOES), um pop-up é DESENHADO
 * INTEIRO a partir da árvore: a janela Pokémon são 128 nós que não existiam. Este módulo só sabe desenhar e avisar;
 * quem conhece as regras do jogo é quem chama (menus.mjs), escrevendo nas áreas pelo id do Figma:
 *
 *   const p = Popup.montar(layout.popups.pokemon, { acao, aba, item, fechar });
 *   Popup.texto(p, 'ficha-nome', 'Pikachu');      Popup.imagem(p, 'pokemon', './ui/mon/pm0025.png', item);
 *   Popup.barra(p, 'vida', 0.7, '#2FAE47', item); Popup.badge(p, 'ficha-tipo', 'eletrico', 'Electric');
 *   Popup.abrir(p);  Popup.fechar(p);
 *
 * Tags que o Figma manda (LEIA-ME): [abre:icone/x] no grupo principal, [aba:x] nas abas, [fecha:x] no X e
 * [acao:x] nos botões. A tabela das 18 cores de tipo vem no próprio pop-up (`tipos`), e `refs` traz a arte
 * alternativa de um cartão (item do time selecionado, golpe vazio).
 * A maquete é 1223×830 numa tela de 1920×900: em tela menor a janela inteira ENCOLHE junto (uma escala só), então
 * nenhuma coordenada do Figma precisa mudar. */
import * as Hud from './hud.mjs';

const MODO_IMG = { ajustar: 'contain', preencher: 'cover' };
/** Cor da maquete com opacidade (rodada 22: `opacidade` no preenchimento, `bordaOpacidade` na borda): #RRGGBB + 0..1 → rgba. */
export function comAlfa(hex, op){
  if (!hex) return 'transparent';
  if (op == null || op >= 1 || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + Math.max(0, +op).toFixed(3) + ')';
}
/* Escala global dos pop-ups no PC (pedido da Amanda na rodada 22: os painéis foram desenhados grandes, ~1500×780 em 1920×900;
   um fator único mantém as proporções). ?popup_escala=0.9 muda na hora e fica salvo; no celular é sempre 1 (a maquete deitada
   já é do tamanho da tela). Telas de fora do jogo (semMargem) não usam. */
export function escalaPopup(){
  if (document.body.classList.contains('mobile')) return 1;
  const q = new URLSearchParams(location.search).get('popup_escala');
  if (q != null && +q > 0.3 && +q <= 1){ try { localStorage.setItem('popup.escala', String(+q)); } catch {} return +q; }
  const t = Hud.tamanhoUI(); if (t !== 'normal') return Hud.TAMANHOS[t].popup;   // Configurações → tamanho da interface (05/09): pequena 0,75 · grande 1
  try { const v = +localStorage.getItem('popup.escala'); if (v > 0.3 && v <= 1) return v; } catch {}
  return 0.85;
}
export function definirEscalaPopup(f){ try { localStorage.setItem('popup.escala', String(f)); } catch {} document.querySelectorAll('.pf').forEach(escalar); }

/* O pop-up é dono do próprio CSS: são poucas regras e assim ele não depende de nada do menus.css. Tudo dentro dele é
   posicionado em absoluto pelas coordenadas do Figma; só os botões e os itens da lista recebem clique. */
const CSS = `
.pf{transform-origin:50% 50%;color:#fff;font:12px/1.05 "Nunito Sans",system-ui,sans-serif;user-select:none}
.pf *{box-sizing:border-box}
.pf .pf-grupo,.pf .pf-img,.pf .pf-var,.pf .pf-ret,.pf .pf-fill,.pf .pf-txt,.pf .pf-rotulo{position:absolute;pointer-events:none}
.pf [data-tag],.pf [data-fig^="item-"],.pf [data-fig^="slot-poke-"]{pointer-events:auto}
.pf [data-fig^="item-"],.pf [data-fig^="slot-poke-"]{cursor:pointer}
.pf [data-tag="acao"]:not([data-fig^="conteudo-"]):active,.pf [data-tag="aba"]:not([data-fig^="conteudo-"]):active,.pf [data-tag="fecha"]:active{transform:scale(.98)}   /* os blocos conteudo-<aba> também levam a tag aba: sem o :not o painel inteiro "afundava" a cada clique (Jaime, 11/09) */
.pf [data-fig^="ajuste-"]:active{transform:none}
.pf [data-fig^="ajuste-"]{touch-action:none}
.pf [data-fig^="item-"]:hover,.pf [data-fig^="slot-poke-"]:hover{filter:brightness(1.08)}
.pf-fundo{position:fixed;inset:0;z-index:59;background:#0006}
.pf .pf-rola-propria{scrollbar-width:none}
.pf .pf-rola-propria::-webkit-scrollbar{display:none;width:0;height:0}
.pf .pf-sb{position:absolute;pointer-events:auto;touch-action:none;cursor:default;border:0 solid transparent}
.pf .pf-sb>div{position:absolute;left:0;top:0;pointer-events:auto;cursor:grab;border:0 solid transparent}
.pf .pf-sb>div:active{cursor:grabbing}
.pf [data-folga]>*:not([data-espaco]){translate:var(--pf-folga) var(--pf-folga)}
`;
function estilo(){
  if (document.getElementById('pf-css')) return;
  const s = document.createElement('style'); s.id = 'pf-css'; s.textContent = CSS; document.head.appendChild(s);
}
const caixa = (el, f) => Object.assign(el.style, { position: 'absolute', left: f.x + 'px', top: f.y + 'px', width: f.w + 'px', height: f.h + 'px', boxSizing: 'border-box', margin: '0' });

/** Desenha um nó da árvore dentro de `pai`. */
function desenhar(f, pai, i, pop){
  const el = document.createElement(f.tipo === 'txt' || f.tipo === 'rotulo' ? 'span' : 'div');
  el.dataset.fig = f.nome;
  caixa(el, f);
  el.style.zIndex = String((i + 1) * 10);
  if (f.oculto) el.style.display = 'none';
  const arte = (img, pad) => { Object.assign(el.style, { backgroundImage: 'url(' + img + ')', backgroundRepeat: 'no-repeat' }); Hud.fundoComFolga(el, pad); };   // v2: PNG com folga em volta da caixa
  if (f.sobre) el.dataset.sobre = f.sobre;
  if (f.corAba) el.dataset.corAba = '1';                                  // rodada 29: rótulo [cor:aba] — trocarAba pinta ativa/inativa                                // v2: imagem de ESTADO (marca de selecionado/aba ativa): quem preenche a célula não a liga; a ref do estado liga (estadoRef)
  if (f.tipo === 'grupo'){
    el.className = 'pf-grupo';
    if (f.img){ arte(f.img, f.imgPad); el.dataset.arte = f.img; }
    (f.filhos || []).forEach((g, k) => desenhar(g, el, k, pop));
  } else if (f.tipo === 'img'){
    el.className = 'pf-img'; arte(f.img); el.dataset.arte = f.img;
  } else if (f.tipo === 'imgvar'){                                       // só a CAIXA onde a imagem entra: nada de fundo (rodada 6)
    el.className = 'pf-var'; { el.dataset.var = f.id; if (f.exemplo) el.dataset.exemplo = f.exemplo; if (f.exemploPad) el.dataset.exemploPad = String(f.exemploPad); }   /* exemplo = a arte que a maquete usa (cadeado, bolinha); exemploPad (v2, 17/09) = folga do PNG em volta (menus.mjs arteExemplo) */
    el.style.backgroundColor = 'transparent'; el.style.border = '0';
    el.style.backgroundRepeat = 'no-repeat'; el.style.backgroundPosition = 'center';
    el.style.backgroundSize = MODO_IMG[f.regra] || 'contain';             // `ajustar` = inteira dentro da caixa, nunca maior
    /* RECORTE DA ÁREA (rodada 31, 18/09 — teste da Amanda no site): `recorta: true` = o que passar da caixa é cortado (inclusive o que o jogo
       pendura dentro: visor 3D, marcas) e `raio` = raio dos cantos do recorte (o mapa do pop-up vem com 8 px no PC e 5 no celular). O fundo
       já é cortado pela caixa; o overflow e o raio valem pro fundo E pros filhos. */
    if (f.recorta) el.style.overflow = 'hidden';
    if (f.raio) el.style.borderRadius = f.raio + 'px';
  } else if (f.tipo === 'ret'){
    el.className = 'pf-ret'; el.style.backgroundColor = comAlfa(f.cor, f.op); el.style.borderRadius = (f.raio || 0) + 'px';
    if (f.borda) el.style.border = (f.bordaPx || 1) + 'px solid ' + comAlfa(f.borda, f.bordaOp);
    if (/^badge-tipo$/.test(f.nome)) el.dataset.badge = '1';
  } else if (f.tipo === 'fill'){
    el.className = 'pf-fill'; el.dataset.fill = f.id; el.__figW = f.wMax != null ? f.wMax : f.w;
    el.style.backgroundColor = f.cor || '#2FAE47'; el.style.borderRadius = (f.h / 2) + 'px';
    /* FORMA (18/09, teste da Amanda no site — "a verde não preenche a forma vazada"): desde a rodada 30 a caixa do fill é o 100 % e a barra da
       maquete é um paralelogramo (`forma` + `inclinacaoPx` do conversor). O hud.mjs já recortava por clip-path; aqui a barra saía como pílula de
       raio h/2, que deixava o canto inclinado vazio e arredondava a ponta além do raio da forma. A fração continua sendo a largura (Hud.fill). */
    if (f.forma === 'paralelogramo'){ const inc = f.inclinacaoPx || 0; el.style.borderRadius = '0'; el.style.clipPath = 'polygon(' + inc + 'px 0, 100% 0, calc(100% - ' + inc + 'px) 100%, 0 100%)'; }
  } else if (f.tipo === 'txt'){
    el.className = 'pf-txt'; el.dataset.txt = f.id; Hud.estiloTexto(el, f); el.style.zIndex = String((i + 1) * 10);
    el.dataset.display = el.style.display || 'flex';                    // quem esconde/mostra a célula devolve ESTE display (o `-webkit-box` do quebrar:N não é flex)
    if (f.exemplo) el.dataset.exemplo = f.exemplo;                        // rótulos fixos (título, nome da aba) vêm do exemplo da maquete (Popup.rotulo)
    if (/^btn-/.test(f.id || '') && f.exemplo) el.textContent = tr(f.exemplo);   // v2: o texto do botão (Usar/Descartar) já nasce escrito; Popup.botao troca quando quiser
  } else if (f.tipo === 'rotulo'){
    el.className = 'pf-rotulo'; el.textContent = tr(f.texto || ''); Hud.estiloTexto(el, f); el.style.zIndex = String((i + 1) * 10);
    /* Rótulo de DUAS LINHAS: a Amanda escreve a quebra na maquete e o HTML a engolia — o aviso do diálogo de apagar
       saía numa linha só e era cortado no meio (10/09). Só quem tem quebra vira `pre-line`. */
    if (/\r|\n/.test(f.texto || '')) el.style.whiteSpace = 'pre-line';
  }
  if (f.tag) ligarTag(el, f, pop);
  pai.appendChild(el);
  if (f.tag === 'rola' && !String(f.tagVal || '').startsWith('h')) barraPropria(el, f, pai, pop);   // rodada 30 (18/09): barra de rolagem da maquete no lugar da nativa (irmã da lista; rodada 31: na faixa livre à direita dela)
  if (f.tag === 'rola') folgaDaLista(el, f);                             // 18/09 (rodada 31): o anel de selecionado das células da borda não é mais cortado pela lista
  return el;
}

/* ===== BARRA DE ROLAGEM PRÓPRIA (rodada 30, 18/09). A Amanda entregou `scrollbar [rola:vertical]` (trilho + `polegar [proporcional]`) nas
   *-atalhos-refs porque a barra nativa ficava na frente do texto nas Missões. O conversor põe a definição em _figma.scrollbar.{pc,deitado}
   (tools/layout_v2_para_hud.mjs); aqui toda lista [rola:vertical] ganha um trilho irmão, encostado na borda direita da área que rola, com o
   polegar de altura = visível/total × trilho (mínimo 24 px) que anda com a rolagem. Some quando não há o que rolar; atualiza no `scroll`,
   quando o tamanho da lista muda (ResizeObserver: abrir o pop-up, trocar de aba) e quando o conteúdo muda (MutationObserver nos filhos —
   celulas/clonarSerie/alturaRolagem mexem em style e em nós), sempre debounced num timeout só. Arrastar o polegar e clicar no trilho rolam.
   Sem definição (HUD antigo, hud_layout.json sem _figma.scrollbar) nada muda: a nativa continua. A bancada, que não passa pelo
   Hud.aplicar, entrega a definição por usarScrollbar(). */
let SB_FIXA = null;
export function usarScrollbar(d){ SB_FIXA = d || null; }
const sbDef = () => SB_FIXA || Hud.layoutAtual()?._figma?.scrollbar?.[document.body.classList.contains('mobile') ? 'deitado' : 'pc'] || null;
/** A arte é uma pílula com folga em volta (PNG 2×): border-image com as pontas fixas e o miolo esticado — assim o polegar curto e o trilho
    comprido não deformam as pontas arredondadas (background 100% esticava). Fatia = folga + raio, em % da imagem (não depende da escala do PNG). */
function pintarPilula(n, a){
  const pad = a.imgPad || 0, r = Math.min(a.w, a.h) / 2;
  const sy = ((pad + r) / (a.h + 2 * pad) * 100).toFixed(3) + '%', sx = '50%';
  n.style.borderImage = 'url(' + a.img + ') ' + sy + ' ' + sx + ' ' + sy + ' ' + sx + ' fill / ' + (pad + r) + 'px ' + (pad + a.w / 2) + 'px / ' + pad + 'px stretch';
}
/* FAIXA DA BARRA (18/09, teste local da Amanda com a rodada 31 — "a scrollbar das Missões ainda come a lateral direita da lista"): a rodada 31
   encurtou a lista-capitulos 16 px no PC (10 no celular) pra barra morar numa faixa FORA das linhas, dentro da moldura; o trilho, encostado por
   dentro da borda direita da lista, continuava por cima delas. Agora ele vai pra faixa livre à direita da caixa da lista, centrado entre ela e o
   que vem depois: o vizinho da direita no mesmo grupo (a coluna do detalhe na Mochila do PC, as categorias no celular) ou, sem vizinho, a
   margem do pai espelhada da esquerda (a moldura: nas Missões o conteúdo vai de x 64 a 1336 num pop-up de 1400). Lista que ocupa o grupo
   inteiro (Pokédex: pagina-lista > lista-especies) olha a faixa do grupo. Longe de verdade o trilho não vai: no máximo a largura dele da lista.
   Sem faixa onde o trilho caiba (lista encostada na moldura: Social, Mapa), fica como antes. Devolve o x do trilho nas coordenadas do pai da
   lista, ou null. */
function caminhoAte(def, alvo){                                          // [raiz, …, pai] do nó alvo na árvore do pop-up (ou de um extra)
  const anda = (n, cam) => { for (const f of n.filhos || []){ if (f === alvo) return [...cam, n]; const r = anda(f, [...cam, n]); if (r) return r; } return null; };
  if (!def) return null;
  const r = anda(def, []); if (r) return r;
  for (const ex of Object.values(def.extras || {})){ const r2 = anda(ex, []); if (r2) return r2; }
  return null;
}
function faixaDaBarra(pop, f, w, pad){
  const cam = caminhoAte(pop?.__def, f); if (!cam) return null;
  const caixa = s => s.tipo === 'img' ? { x: s.x + pad, y: s.y + pad, w: s.w - 2 * pad, h: s.h - 2 * pad } : { x: s.x, y: s.y, w: s.w, h: s.h };   // folha img do v2 = caixa do nó alargada pela folga do PNG
  let no = f, ox = 0;                                                    // ox = onde começa o pai da lista, nas coordenadas do grupo da vez
  for (let k = cam.length - 1; k >= 0; k--){
    const P = cam[k], b = caixa(no), dir = b.x + b.w;
    const irmaos = (P.filhos || []).filter(s => s !== no && !s.oculto && !s.sobre).map(caixa).filter(c => c.w > 0 && c.h > 0);
    const vizinhos = irmaos.filter(c => c.x >= dir - 0.5 && c.y < b.y + b.h && c.y + c.h > b.y);
    const lim = vizinhos.length ? Math.min(...vizinhos.map(c => c.x)) : (P.w || 0) - Math.max(0, Math.min(b.x, ...irmaos.map(c => c.x)));
    const faixa = lim - dir;
    if (faixa >= w + 2) return dir + Math.min((faixa - w) / 2, w) - ox;
    if (k === 0 || P.img || P.tag || Math.abs(dir - (P.w || 0)) > 1) return null;   // encostada na moldura (ou num grupo com arte/tag): sem faixa
    ox += P.x || 0; no = P;
  }
  return null;
}
/* FOLGA DO ANEL NA LISTA QUE ROLA (18/09, teste local da Amanda com a rodada 31 — "a borda dourada da Mochila sai cortada: no 1º item a
   esquerda e o topo, no 2º o topo"). A marca de selecionado/ativa (marca-selecionado, marca-ativa) é um anel desenhado POR FORA da célula: a
   folha já vem na caixa alargada pela folga do PNG e é desenhada certa (medido: o traço passa 2 a 2,5 px da célula no PC, 1,5 no celular,
   igual dos quatro lados). Quem corta é a própria lista — um contêiner que rola recorta tudo o que passa da caixa dele, e a 1ª linha, a 1ª coluna e a
   última coluna encostam nela (nas Missões e na Pokédex a linha vai de borda a borda). A lista cresce m px pra cada lado (o quanto o anel mais
   largo de dentro dela passa da célula, medido no PNG) por padding com margem negativa — o left/top/width/height da lista continuam os da maquete
   (o chat do Social lê a caixa dela) — e os filhos posicionados andam m px pra dentro (CSS [data-folga]): as células ficam exatamente onde a
   maquete manda e o anel cabe. Medido: m = 2 na Mochila do PC, 3 nas Missões/Pokédex/Social do PC, 2 no celular. */
function folgaDaLista(el, f){
  const marcas = [];
  const anda = (ns, pai) => { for (const g of ns || []){ if (g.tipo === 'img' && g.img && (g.sobre || /^marca-/.test(g.nome || ''))) marcas.push({ g, pai }); if (g.filhos) anda(g.filhos, g); } };
  anda(f.filhos, f);
  if (!marcas.length) return;
  Promise.all(marcas.map(({ g, pai }) => Hud.medirAlfa(g.img, { lado: 0, min: 8 }).then(a => a ? Math.max(0, -(g.x + g.w * a.x0), -(g.y + g.h * a.y0), g.x + g.w * a.x1 - (pai.w || 0), g.y + g.h * a.y1 - (pai.h || 0)) : 0)))
    .then(vs => {
      const m = Math.min(16, Math.ceil(Math.max(0, ...vs) - 0.05)); if (!(m > 0)) return;
      Object.assign(el.style, { boxSizing: 'content-box', padding: m + 'px', margin: (-m) + 'px' });   /* caixa de borda = a da maquete + m de cada lado */
      el.style.setProperty('--pf-folga', m + 'px'); el.dataset.folga = String(m);
      atualizarRolagem(el);
    });
}
function barraPropria(el, f, pai, pop){
  const d = sbDef(); if (!d || !d.img || !d.polegar?.img) return;
  const sb = document.createElement('div'); sb.className = 'pf-sb';
  const xf = faixaDaBarra(pop, f, d.w, d.imgPad || 0);                   // rodada 31: na faixa livre à direita da lista; sem faixa, por dentro da borda como antes
  Object.assign(sb.style, { left: (xf != null ? xf : f.x + f.w - d.w) + 'px', top: f.y + 'px', width: d.w + 'px', height: f.h + 'px', zIndex: String((+el.style.zIndex || 0) + 1), display: 'none' });
  pintarPilula(sb, d);
  const pol = document.createElement('div');
  Object.assign(pol.style, { width: d.polegar.w + 'px', height: d.polegar.h + 'px', left: ((d.w - d.polegar.w) / 2) + 'px' });
  pintarPilula(pol, d.polegar);
  sb.appendChild(pol); pai.appendChild(sb);
  const trH = f.h, minP = Math.min(24, trH / 3);
  const atualizar = () => {
    const cH = el.clientHeight, sH = el.scrollHeight;
    if (!cH || sH <= cH + 1){ sb.style.display = 'none'; return; }        // nada pra rolar (ou a lista está escondida): sem barra
    const pH = Math.max(minP, Math.round(trH * cH / sH));
    const y = Math.round((trH - pH) * (el.scrollTop / (sH - cH)));
    pol.style.height = pH + 'px'; pol.style.top = Math.max(0, Math.min(trH - pH, y)) + 'px';
    sb.style.display = 'block';
  };
  let t = 0; const agendar = () => { if (t) return; t = setTimeout(() => { t = 0; atualizar(); }, 0); };
  sb.__atualizar = atualizar; el.__sb = sb;
  el.addEventListener('scroll', atualizar, { passive: true });
  if (typeof ResizeObserver === 'function') new ResizeObserver(agendar).observe(el);   // abrir o pop-up / trocar de aba: a lista ganha tamanho
  if (typeof MutationObserver === 'function') new MutationObserver(agendar).observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });   // o conteúdo mudou (células, espaçador, linhas escondidas)
  sb.addEventListener('wheel', ev => { el.scrollTop += ev.deltaY; }, { passive: true });   // roda do mouse em cima do trilho rola a lista
  let y0 = 0, s0 = 0, ponteiro = null;
  const passo = ev => {
    if (ponteiro == null || ev.pointerId !== ponteiro) return;
    const rt = sb.getBoundingClientRect(), rp = pol.getBoundingClientRect(), livre = rt.height - rp.height;   // rects já escalados: a escala do pop-up não entra na conta
    if (livre > 0) el.scrollTop = s0 + (ev.clientY - y0) * (el.scrollHeight - el.clientHeight) / livre;
  };
  const fim = ev => { if (ponteiro == null || ev.pointerId !== ponteiro) return; ponteiro = null; try { sb.releasePointerCapture(ev.pointerId); } catch {} };
  sb.addEventListener('pointerdown', ev => {
    ev.stopPropagation(); ev.preventDefault();
    if (ev.target !== pol){                                                // clique no trilho: o polegar vai pra onde o dedo está, e dali já arrasta
      const rt = sb.getBoundingClientRect(), rp = pol.getBoundingClientRect(), livre = rt.height - rp.height;
      if (livre > 0) el.scrollTop = (ev.clientY - rt.top - rp.height / 2) / livre * (el.scrollHeight - el.clientHeight);
    }
    y0 = ev.clientY; s0 = el.scrollTop; ponteiro = ev.pointerId;
    try { sb.setPointerCapture(ev.pointerId); } catch {}
  });
  sb.addEventListener('pointermove', passo); sb.addEventListener('pointerup', fim); sb.addEventListener('pointercancel', fim);
  sb.addEventListener('click', ev => ev.stopPropagation());
  agendar();
}
/** Recalcula a barra própria de uma lista (ou de todas as do pop-up) — os observadores já fazem isso sozinhos; é pra quem quer na hora. */
export function atualizarRolagem(el){
  if (!el) return;
  if (el.__sb) el.__sb.__atualizar?.(); else for (const s of el.querySelectorAll?.('.pf-sb') || []) s.__atualizar?.();
}

/** Botões e abas do Figma ([aba:x], [fecha:x], [acao:x]). O módulo só avisa; quem decide é quem montou. */
function ligarTag(el, f, pop){
  el.dataset.tag = f.tag; el.dataset.tagval = f.tagVal || '';
  if (f.tag === 'rola'){                                                 // [rola:vertical] rola a grade; [rola:horizontal] (rodada 23) rola a fila de cores
    const h = String(f.tagVal || '').startsWith('h');
    Object.assign(el.style, { overflowX: h ? 'auto' : 'hidden', overflowY: h ? 'hidden' : 'auto', pointerEvents: 'auto' });
    if (sbDef()) el.classList.add('pf-rola-propria');                    // rodada 30 (18/09): com a barra da maquete, a nativa some (na horizontal só some; a própria é só vertical)
    return;
  }
  if (f.tag === 'digita'){                                               // [digita]: campo de busca de verdade por cima da arte
    const cx = (f.filhos || []).find(c => c.tipo === 'txt') || { x: 8, y: 0, w: f.w - 16, h: f.h, tamanho: 12, cor: '#fff', fonte: 'Nunito Sans', peso: 700 };
    const inp = document.createElement('input');
    inp.type = /senha/i.test(f.nome || '') ? 'password' : (/e-?mail/i.test(f.nome || '') ? 'email' : 'search'); inp.dataset.busca = '1'; inp.placeholder = tr(cx.exemplo || 'buscar');   // idioma: o placeholder é o exemplo da maquete
    if (cx.id) inp.dataset.txt = cx.id;                                  // o campo OCUPA a área de texto da maquete (o conferidor mede ele)
    Object.assign(inp.style, { position: 'absolute', left: cx.x + 'px', top: cx.y + 'px', width: cx.w + 'px', height: cx.h + 'px', zIndex: '40',   // acima do fundo do campo (a tela de login tem um `ret` irmão com z 10, que escondia o que se digitava — 06/09)
      background: 'none', border: '0', outline: 'none', padding: '0', margin: '0', pointerEvents: 'auto',
      color: cx.cor || '#fff', fontFamily: '"' + (cx.fonte || 'Nunito Sans') + '", system-ui, sans-serif',
      fontWeight: String(cx.peso || 700), fontSize: (cx.tamanho || 12) + 'px' });
    inp.addEventListener('input', () => pop.__cb.digita?.(inp.value, inp));   // o 2º argumento diz QUAL campo (o Social tem busca, mensagem e nome do convite)
    inp.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Escape'){ inp.blur(); fechar(pop); } });   // não deixa o jogo receber as teclas; Esc fecha o pop-up mesmo com o campo focado
    for (const outro of el.querySelectorAll('input[data-busca]')) if (outro !== inp) outro.remove();   // o texto de dentro também vinha com [digita]: fica um campo só
    el.appendChild(inp);
    el.style.pointerEvents = 'auto';
    for (const c of el.querySelectorAll('span[data-txt]')){ c.dataset.txtOculto = c.dataset.txt; delete c.dataset.txt; c.style.display = 'none'; }   // o placeholder é do campo
    return;
  }
  if (f.tag === 'recolhe'){ el.style.pointerEvents = 'auto'; el.style.cursor = 'pointer'; return; }   // [recolhe:x] (capítulo das Missões): só marca; o clique SOBE pra quem montou
  if (f.tag === 'escolhe'){ el.style.pointerEvents = 'auto'; el.style.cursor = 'pointer'; el.addEventListener('click', ev => { ev.stopPropagation(); pop.__cb.escolhe?.(f.tagVal, el); }); return; }   // [escolhe:x] (opções do pop-up do inicial, rodada 29 — 18/09): avisa quem montou com o valor e o nó clicado
  if (!['fecha', 'aba', 'acao', 'abre'].includes(f.tag)) return;       // outras tags não são botão
  el.style.pointerEvents = 'auto'; el.style.cursor = 'pointer';
  el.addEventListener('click', ev => {
    ev.stopPropagation();
    if (f.tag === 'fecha'){                                              // X de um diálogo fecha só o diálogo; X do pop-up fecha tudo
      const ex = pop.querySelector('.pf-extra[data-fig="' + f.tagVal + '"]');
      if (ex && ex.contains(el)) mostrarExtra(pop, f.tagVal, false); else fechar(pop);
    }
    else if (f.tag === 'abre'){                                          // [abre:x]: diálogo/tela; quem montou decide, senão alterna o extra com esse nome
      const tratou = pop.__cb.abre?.(f.tagVal, el);
      if (!tratou && pop.querySelector('.pf-extra[data-fig="' + f.tagVal + '"]')) mostrarExtra(pop, f.tagVal);
    }
    else if (f.tag === 'aba') trocarAba(pop, f.tagVal);
    else if (f.tag === 'acao'){ if (el.dataset.desligado !== '1') pop.__cb.acao?.(f.tagVal, el); }
  });
}

/** Monta o pop-up escondido e devolve o elemento. `cb`: { acao, aba, item, fechar, abrir }. */
export function montar(def, cb = {}, raizDOM = document.body){
  if (!def) return null;
  estilo();
  const pop = document.createElement('div');
  pop.className = 'pf'; pop.id = 'pf-' + (def.nome || 'popup');
  pop.dataset.fig = def.nome;
  pop.__def = def; pop.__cb = cb; pop.__tipos = def.tipos || {}; pop.__refs = def.refs || {};
  Object.assign(pop.style, { position: 'fixed', left: '50%', top: '50%', width: def.w + 'px', height: def.h + 'px',
    boxSizing: 'border-box', display: 'none', zIndex: '60' });
  if (def.img){ Object.assign(pop.style, { backgroundImage: 'url(' + def.img + ')', backgroundRepeat: 'no-repeat' }); Hud.fundoComFolga(pop, def.imgPad); }
  Hud.marcarSobreBarra(def);                                             /* 18/09: número em cima da barra (txt/vida da lista e da ficha) com a linha de base do Figma */
  (def.filhos || []).forEach((f, i) => desenhar(f, pop, i, pop));
  for (const [nome, ex] of Object.entries(def.extras || {})){            // peças soltas ([passa:x]): a dica do item
    const d = document.createElement('div');
    d.className = 'pf-extra'; d.dataset.fig = nome; d.dataset.alvo = ex.alvo || '';
    if (ex.abrePor) d.dataset.abrePor = ex.abrePor; if (ex.aba) d.dataset.abaDe = ex.aba; if (ex.segue) d.dataset.segue = ex.segue;   // diálogo / conteúdo de aba / selo que o jogo posiciona
    Object.assign(d.style, { position: 'absolute', left: '0', top: '0', width: ex.w + 'px', height: ex.h + 'px', display: 'none', zIndex: '900', pointerEvents: 'none' });
    if (ex.img){ Object.assign(d.style, { backgroundImage: 'url(' + ex.img + ')', backgroundRepeat: 'no-repeat' }); Hud.fundoComFolga(d, ex.imgPad); }
    (ex.filhos || []).forEach((f, i) => desenhar(f, d, i, pop));
    pop.appendChild(d);
  }
  raizDOM.appendChild(pop);
  // cada item da lista avisa quando é escolhido (a arte de selecionado vem de `refs`)
  // a lista do time chama-se `item-time-N` na página do PC e `slot-poke-N` na do celular (cabeça + tecla, como a HUD)
  pop.__prefItem = pop.querySelector('[data-fig="item-time-1"]') ? 'item-time' : (pop.querySelector('[data-fig="slot-poke-1"]') ? 'slot-poke' : 'item-time');
  for (const item of pop.querySelectorAll('[data-fig^="item-time-"],[data-fig^="slot-poke-"]')){
    if (!/-\d+$/.test(item.dataset.fig)) continue;
    item.style.pointerEvents = 'auto'; item.style.cursor = 'pointer';
    item.addEventListener('click', () => { const n = +item.dataset.fig.split('-').pop(); selecionar(pop, n, pop.__prefItem, pop.__prefItem); cb.item?.(n - 1, item); });
  }
  escalar(pop);
  if (!montar.__resize){ montar.__resize = true; addEventListener('resize', () => document.querySelectorAll('.pf').forEach(escalar)); }
  return pop;
}

/** A janela inteira encolhe junto quando a tela é menor que a maquete (as coordenadas do Figma continuam valendo). */
function escalar(pop){
  const d = pop.__def || {};
  // 05/09: em tela maior que a maquete o pop-up cresce JUNTO com a HUD (Hud.escalaAtual, até 1,25); em tela menor continua só cabendo (antes parava em 1 e ficava pequeno no 2K e no tablet)
  const s = d.semMargem ? Math.min(innerWidth / (d.w || 1), innerHeight / (d.h || 1)) : Math.min(Math.max(1, Hud.escalaAtual()), (innerWidth - 24) / (d.w || 1), (innerHeight - 24) / (d.h || 1)) * escalaPopup();   // tela de fora do jogo: ocupa tudo; pop-up: cabe na tela × fator global
  pop.__escala = s;
  pop.style.transform = 'translate(-50%, -50%) scale(' + s.toFixed(4) + ')';
}

addEventListener('wheel', ev => {                                        // rolar dentro do pop-up não pode virar zoom da câmera
  if (ev.target?.closest?.('.pf, #janela, #chat')) ev.stopImmediatePropagation();   // 13/09 (l.neto): rolar o Pokémart (janela antiga) e o chat também dava zoom na câmera
}, { capture: true, passive: true });
/** Dica que aparece ao passar o mouse/segurar o dedo numa célula ([passa:x]). `dados` = { titulo, descricao }. */
export function dica(pop, nome, alvoEl, dados){
  const d = pop?.querySelector('[data-fig="' + nome + '"]'); if (!d) return null;
  if (!alvoEl || !dados){ d.style.display = 'none'; return d; }
  texto(pop, 'tooltip-titulo', dados.titulo || '', d);
  texto(pop, 'tooltip-descricao', dados.descricao || '', d);
  d.style.visibility = 'hidden'; d.style.display = 'block';            // medir com display:none dava 0×0 e a dica nascia em cima da célula
  /* A dica existe pra ler a descrição INTEIRA: a caixa da maquete (4 linhas) cresce quando o texto pede, e o fundo junto. */
  const desc = d.querySelector('[data-txt="tooltip-descricao"]');
  if (desc){
    if (!d.dataset.h0) d.dataset.h0 = String(d.offsetHeight || parseFloat(d.style.height) || 0);
    Object.assign(desc.style, { display: 'block', webkitLineClamp: '', lineHeight: '', height: 'auto', overflow: 'visible' });
    const h = Math.max(+d.dataset.h0, desc.offsetTop + desc.scrollHeight + 8);
    d.style.height = h + 'px';
    const bg = d.querySelector(':scope > .pf-ret'); if (bg) bg.style.height = h + 'px';
  }
  const rp = pop.getBoundingClientRect(), ra = alvoEl.getBoundingClientRect();
  const k = (pop.__escala || 1);
  let x = (ra.left - rp.left) / k + (ra.width / k) / 2 - d.offsetWidth / 2;
  let y = (ra.top - rp.top) / k - d.offsetHeight - 6;
  if (y < 4) y = (ra.top - rp.top) / k + ra.height / k + 6;              // não cabe em cima: vai embaixo
  x = Math.max(4, Math.min(x, (pop.offsetWidth || 0) - d.offsetWidth - 4));
  d.style.left = Math.round(x) + 'px'; d.style.top = Math.round(y) + 'px'; d.style.visibility = '';
  return d;
}
/** Peça solta do pop-up (diálogo [abre:], conteúdo [aba:], selo [segue:], dica [passa:]). */
export function extra(pop, nome){ return pop?.querySelector('.pf-extra[data-fig="' + nome + '"]') || null; }
/** Mostra/esconde uma peça solta. Sem `pos`, o diálogo abre no meio do pop-up; `pos` = {x,y} nas coordenadas da maquete. */
export function mostrarExtra(pop, nome, on = null, pos = null){
  const d = extra(pop, nome); if (!d) return null;
  const mostrar = on == null ? d.style.display === 'none' : !!on;
  if (!mostrar){ d.style.display = 'none'; return d; }
  const w = parseFloat(d.style.width) || 0, h = parseFloat(d.style.height) || 0;
  const x = pos ? pos.x : ((parseFloat(pop.style.width) || 0) - w) / 2, y = pos ? pos.y : ((parseFloat(pop.style.height) || 0) - h) / 2;
  Object.assign(d.style, { left: Math.round(x) + 'px', top: Math.round(y) + 'px', display: 'block', pointerEvents: d.dataset.segue ? 'none' : 'auto', zIndex: d.dataset.abrePor ? '950' : '900' });
  return d;
}
/** Aplica uma referência de estado VETORIAL a uma célula: arte da célula (se a referência tiver), cor/borda dos `ret`
    de mesmo nome, cor dos `txt` de mesmo id, e as imagens de exemplo dos `img/` (bolinha, cadeado). */
export function estadoRef(pop, el, ref, estado){
  const R = pop?.__refs?.[ref]; const d = R?.[estado]; if (!d || !el) return null;
  if (d.img) el.style.backgroundImage = 'url(' + d.img + ')'; else if (Object.values(R).some(x => x.img)) el.style.backgroundImage = 'none';
  /* IMAGEM FIXA QUE SÓ UM ESTADO TEM (rodada 26): o check verde da `vaga [estado:ocupada]` não existe na `vaga [estado:vazia]`, e
     as vagas 8–10 da maquete nem têm o nó. Imagem que o estado pede e a célula não tem é CRIADA; imagem que OUTRO estado da mesma
     referência tem e este não tem é ESCONDIDA. Imagem presente em todos os estados (o soquete da insígnia) não é tocada. */
  const SEP = '\u0001';                                                  // separador do caminho (nome de nó do Figma pode ter `/`)
  const imgsDe = (filhos, cam = '', out = new Set()) => { for (const f of filhos || []){ if (f.tipo === 'img') out.add(cam + f.nome); if (f.filhos) imgsDe(f.filhos, cam + f.nome + SEP, out); } return out; };
  const minhas = imgsDe(d.filhos), soDeOutro = new Set(), soMinhas = new Set();
  for (const [e2, d2] of Object.entries(R)){
    if (e2 === estado) continue;
    const delas = imgsDe(d2.filhos);
    for (const k of delas) if (!minhas.has(k)) soDeOutro.add(k);
    for (const k of minhas) if (!delas.has(k)) soMinhas.add(k);
  }
  const anda = (filhos, pai, cam) => {
    (filhos || []).forEach((f, i) => {
      let alvo = pai.querySelector(':scope > [data-fig="' + (f.nome || '') + '"], :scope > [data-txt="' + (f.id || '') + '"], :scope > [data-var="' + (f.id || '') + '"]');
      if (!alvo && f.tipo === 'img' && f.img && soMinhas.has(cam + f.nome) && pop?.nodeType === 1){
        alvo = desenhar(f, pai, i, pop);                                   // a célula não tinha: nasce aqui (só num pop-up de verdade)
        /* 18/09 (raid): célula que na maquete é só a ARTE (as vagas 8–10 do banner da raid) vem como folha img com a caixa alargada pela
           folga do PNG; o filho criado aqui é relativo à célula de verdade, então anda a folga pra dentro — senão o ✔ saía torto. */
        if (pai === el && el.classList.contains('pf-img') && d.imgPad){ alvo.style.left = (f.x + d.imgPad) + 'px'; alvo.style.top = (f.y + d.imgPad) + 'px'; }
      }
      if (!alvo) return;
      if (f.tipo === 'ret'){ if (f.cor) alvo.style.backgroundColor = comAlfa(f.cor, f.op); alvo.style.border = f.borda ? (f.bordaPx || 1) + 'px solid ' + comAlfa(f.borda, f.bordaOp) : '0'; }
      else if (f.tipo === 'txt' || f.tipo === 'rotulo'){ if (f.cor) alvo.style.color = f.cor; }
      else if (f.tipo === 'imgvar' && f.exemplo && alvo.dataset.var){ alvo.style.backgroundImage = 'url(' + f.exemplo + ')'; if (f.exemploPad) Hud.fundoComFolga(alvo, f.exemploPad); alvo.style.display = 'block'; }   // exemploPad (v2, 17/09): o ícone de estado da referência (conquista ✓ ○) tem folga de 16 px no PNG
      else if (f.tipo === 'img' && soMinhas.has(cam + f.nome)) alvo.style.display = '';
      if (f.filhos) anda(f.filhos, alvo, cam + f.nome + SEP);
    });
  };
  anda(d.filhos, el, '');
  for (const k of soDeOutro){                                              // o que só os outros estados têm some
    let no = el;
    for (const nome of k.split(SEP)){ no = no?.querySelector(':scope > [data-fig="' + nome + '"]'); if (!no) break; }
    if (no && no !== el) no.style.display = 'none';
  }
  el.dataset.estado = estado;
  return d;
}
export function aberto(pop){ return !!pop && pop.style.display !== 'none'; }
export function abrir(pop){ if (!pop) return; escalar(pop); pop.style.display = 'block'; atualizarRolagem(pop); pop.__cb.abrir?.(); }   // rodada 30: barra de rolagem própria já certa no 1º quadro
export function fechar(pop){ if (!pop) return; pop.style.display = 'none'; pop.__cb.fechar?.(); }
export function alternar(pop){ aberto(pop) ? fechar(pop) : abrir(pop); }

/* Acha um nó por id do Figma, opcionalmente dentro de um item da lista. O TIPO importa: `vida` existe duas vezes no
   mesmo cartão (a barra `fill/vida` e o número `txt/vida`), e uma busca solta pegava a primeira das duas. */
function noDe(pop, attr, id, dentro){
  const raiz = dentro || pop; if (!raiz) return null;
  return raiz.querySelector('[' + attr + '="' + id + '"]');
}
export function no(pop, id, dentro = null){
  const raiz = dentro || pop; if (!raiz) return null;
  return raiz.querySelector('[data-txt="' + id + '"],[data-var="' + id + '"],[data-fill="' + id + '"],[data-fig="' + id + '"]');
}
export function item(pop, i, prefixo = 'item-time'){ return pop?.querySelector('[data-fig="' + prefixo + '-' + (i + 1) + '"]'); }
export function grupo(pop, nome){ return pop?.querySelector('[data-fig="' + nome + '"]'); }

export function texto(pop, id, s, dentro = null){
  s = tr(s);                                                               // idioma (11/09): valor em pt vira o do jogador; número e nome passam direto
  const el = noDe(pop, 'data-txt', id, dentro); if (!el) return null;
  const v = s == null ? '' : String(s);
  /* Texto com QUEBRA escrita (rodada 26: a descrição da raid `[quebrar:3]` vem em 3 frases separadas por \n): o `white-space:normal`
     do flex centrado engolia o \n e saíam 2 linhas. Só quem já quebra linha (normal) vira `pre-line`, e só enquanto houver \n. */
  if (/\r|\n/.test(v)){ if (el.style.whiteSpace === 'normal'){ el.style.whiteSpace = 'pre-line'; el.dataset.preLinha = '1'; } }
  else if (el.dataset.preLinha){ el.style.whiteSpace = 'normal'; delete el.dataset.preLinha; }
  if (el.textContent !== v){
    el.textContent = v; Hud.encolher(el);
    if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => Hud.encolher(el));   // a Nunito chega depois do 1º texto: mede de novo
  }
  return el;
}
/** Rótulo fixo da maquete (título do pop-up, nome da aba): escreve o `exemplo` que a Amanda deixou no texto. */
export function rotulo(pop, id, dentro = null){
  const el = noDe(pop, 'data-txt', id, dentro); if (!el) return null;
  return texto(pop, id, tr(el.dataset.exemplo || ''), dentro);
}
export function imagem(pop, id, url, dentro = null){
  const el = noDe(pop, 'data-var', id, dentro); if (!el) return null;
  const v = url ? 'url(' + url + ')' : 'none';
  if (el.style.backgroundImage !== v) el.style.backgroundImage = v;
  return el;
}
/** EXEMPLOS DA MAQUETE (rodada 30, 18/09): o que já tem texto/imagem do jogo fica; o resto ganha o exemplo do layout (txt, imgvar com a
    folga `exemploPad`, fill a 70%). Veio da bancada dos pop-ups pra servir também ao modo prévia do adm (`Menus.previa`). */
export function encherExemplo(pop){
  const anda = (filhos, pai) => { for (const f of filhos || []){
    const el = pai.querySelector(':scope > [data-fig="' + (f.nome || '') + '"], :scope > [data-txt="' + (f.id || '') + '"], :scope > [data-var="' + (f.id || '') + '"]');
    if (!el) continue;
    if (f.tipo === 'txt' && f.exemplo && !el.textContent) el.textContent = f.exemplo;
    if (f.tipo === 'imgvar' && f.exemplo && !el.style.backgroundImage){ el.style.backgroundImage = 'url(' + f.exemplo + ')'; el.style.backgroundSize = 'contain'; el.style.backgroundRepeat = 'no-repeat'; el.style.backgroundPosition = 'center'; el.style.display = 'block'; if (f.exemploPad) Hud.fundoComFolga(el, f.exemploPad); }
    if (f.tipo === 'fill' && el.dataset && !el.dataset.k) Hud.fill(el, 0.7);
    anda(f.filhos, el); } };
  anda(pop.__def.filhos, pop);
  for (const ex of pop.querySelectorAll('.pf-extra')){ const d = (pop.__def.extras || {})[ex.dataset.fig]; if (d) anda(d.filhos, ex); }
}
/* ===================================================== controles da rodada 24 (10/09)
   Vocabulário novo do contrato da Amanda. Ficam aqui, e não na janela de Configurações, porque ela disse que valem
   "daqui pra frente" — qualquer tela pode usar. */

/** Onde o grupo está: aceita o nome (`ajuste-volume`) ou o próprio elemento. */
function grupoDe(pop, nome, dentro){
  return typeof nome === 'string' ? ((dentro || pop)?.querySelector('[data-fig="' + nome + '"]') || null) : (nome || null);
}
/** DESLIZANTE: desenha o valor `k` (0 a 1) e escreve o texto ao lado. O 100% é a largura do TRILHO — o `wMax` do
    `fill/valor` vem da maquete já em 60%, então usá-lo daria um valor errado. */
/* TRILHO DO DESLIZANTE. No layout antigo o grupo tem um `trilho` (e a `bolinha`); no v2 (rodada 27+) o trilho está PINTADO no PNG do grupo e
   a maquete manda só o `fill/valor` (a caixa dele É o 100 %, LEIA-ME) e a bolinha como `camada-1` (pedaço fixo por cima do fill). Sem isto o
   Popup.ajuste devolvia null (nada desenhado, `txt/valor` vazio) e o arrasto, sem fração, soltava com k = 0: qualquer toque num volume
   ZERAVA o som e o "Tamanho da interface" caía pra "pequena" (teste da Amanda no site, 18/09). A largura do fill é a da MAQUETE (`__figW`),
   não a do momento (o Hud.fill encolhe o nó). */
function trilhoDe(g){
  const tr = g.querySelector(':scope > [data-fig="trilho"]') || g.querySelector(':scope > [data-fill="valor"]'); if (!tr) return null;
  const x = parseFloat(tr.style.left) || 0, w = (tr.dataset.fill != null ? tr.__figW : 0) || parseFloat(tr.style.width) || 1;
  return { el: tr, x, w };
}
export function ajuste(pop, nome, k, texto = null, dentro = null){
  const g = grupoDe(pop, nome, dentro); if (!g) return null;
  const tr = trilhoDe(g); if (!tr) return null;
  const fl = g.querySelector(':scope > [data-fill="valor"]'), bo = g.querySelector(':scope > [data-fig="bolinha"]') || g.querySelector(':scope > [data-fig^="camada-"]');
  const trX = tr.x, trW = tr.w;
  k = Math.max(0, Math.min(1, +k || 0));
  if (fl){ fl.__figW = trW; Hud.fill(fl, k); }
  if (bo) bo.style.left = (trX + k * trW - (parseFloat(bo.style.width) || 0) / 2) + 'px';
  if (texto != null) texto_valor(pop, texto, g);
  g.dataset.k = String(k);
  return g;
}
const texto_valor = (pop, t, dentro) => texto(pop, 'valor', t, dentro);
/** Quanto vale o deslizante agora (0 a 1). */
export const ajusteDe = g => Math.max(0, Math.min(1, parseFloat(g?.dataset?.k) || 0));
/** Liga o arrasto de TODOS os deslizantes do pop-up (inclusive os que estão dentro de blocos de aba).
    `mover(id, k, grupo)` a cada passo e `soltar(id, k, grupo)` quando o dedo levanta — quem recarrega a cena só ouve o
    `soltar`. O clique seguinte ao arrasto é engolido, senão o `[acao:<id>]` do próprio grupo dispararia junto. */
export function ligarAjustes(pop, { mover = null, soltar = null } = {}){
  if (!pop || pop.__ajustes) return; pop.__ajustes = true;
  const fracao = (g, ev) => {
    const tr = trilhoDe(g); if (!tr) return null;
    const rg = g.getBoundingClientRect(), esc = rg.width / (parseFloat(g.style.width) || 1); if (!esc) return null;   // 18/09: o trilho do v2 é o fill, cuja largura atual é k × 100 % — mede pelo grupo (rect já escalado) + coordenadas da maquete
    const x0 = rg.left + tr.x * esc, w = tr.w * esc; if (!w) return null;
    return Math.max(0, Math.min(1, (ev.clientX - x0) / w));
  };
  let alvo = null, ponteiro = null;
  const passo = ev => {
    if (!alvo || ev.pointerId !== ponteiro) return;
    const k = fracao(alvo, ev); if (k == null) return;
    alvo.__arrastou = true;
    mover?.(alvo.dataset.tagval || alvo.dataset.fig, k, alvo);
  };
  const fim = ev => {
    if (!alvo || (ev && ev.pointerId !== ponteiro)) return;
    const g = alvo; alvo = null; ponteiro = null;
    if (g.dataset.k == null) return;                                       // 18/09: sem valor desenhado (trilho não achado) não há o que soltar — antes saía k = 0 e zerava o volume
    soltar?.(g.dataset.tagval || g.dataset.fig, ajusteDe(g), g);
    setTimeout(() => { g.__arrastou = false; }, 0);                        // o `click` vem logo depois do pointerup
  };
  pop.addEventListener('pointerdown', ev => {
    const g = ev.target.closest?.('[data-fig^="ajuste-"]');
    if (!g || g.dataset.desligado === '1' || !pop.contains(g)) return;
    alvo = g; ponteiro = ev.pointerId; g.__arrastou = false;
    try { g.setPointerCapture(ev.pointerId); } catch {}
    passo(ev);
  });
  pop.addEventListener('pointermove', passo);
  pop.addEventListener('pointerup', fim); pop.addEventListener('pointercancel', fim);
  addEventListener('pointermove', passo); addEventListener('pointerup', fim);   // reserva: o dedo pode sair do pop-up
  pop.addEventListener('click', ev => {                                     // engole o clique do arrasto
    const g = ev.target.closest?.('[data-fig^="ajuste-"]');
    if (g && g.__arrastou){ ev.stopPropagation(); ev.preventDefault(); }
  }, true);
}

/** CHAVE liga/desliga. A cor da pílula e do knob vêm das referências `toggle [estado:…]`; a POSIÇÃO do knob sai do DELTA
    da referência (knob.x − bg.x), nunca do x absoluto — no deitado a referência é mais estreita que o grupo. */
export function toggle(pop, nome, ligado, dentro = null){
  const g = grupoDe(pop, nome, dentro); if (!g) return null;
  const d = estadoRef(pop, g, 'toggle', ligado ? 'ligado' : 'desligado');
  const bg = g.querySelector(':scope > [data-fig="bg-toggle"]'), kn = g.querySelector(':scope > [data-fig="knob"]');
  const rb = (d?.filhos || []).find(f => f.nome === 'bg-toggle'), rk = (d?.filhos || []).find(f => f.nome === 'knob');
  if (bg && kn && rb && rk) kn.style.left = ((parseFloat(bg.style.left) || 0) + (rk.x - rb.x)) + 'px';
  g.dataset.ligado = ligado ? '1' : '0';
  return g;
}
export const toggleDe = g => g?.dataset?.ligado === '1';

/** SELETOR de opções: só escreve o rótulo do valor; quem cicla é quem montou (as setas mandam `anterior`/`proximo`). */
export function seletor(pop, nome, rotuloValor, dentro = null){
  const g = grupoDe(pop, nome, dentro); if (!g) return null;
  if (rotuloValor != null) texto_valor(pop, rotuloValor, g);
  return g;
}
/** De qual seletor veio a seta que foi clicada (`seletor-qualidade` → "qualidade"). */
export const seletorDe = el => el?.closest?.('[data-fig^="seletor-"]')?.dataset?.tagval || null;

/** Desliga um controle inteiro sem mentir: apaga, tira o cursor e põe a dica no `title`. Marca TODOS os nós com
    `data-tag` do grupo (o seletor tem três: o grupo e as duas setas). */
export function desligarGrupo(pop, nome, ligado, dica = '', dentro = null){
  const g = grupoDe(pop, nome, dentro); if (!g) return null;
  g.style.opacity = ligado ? '1' : '0.45';
  g.style.cursor = ligado ? '' : 'default';
  if (dica) g.title = ligado ? '' : tr(dica);
  for (const el of [g, ...g.querySelectorAll('[data-tag]')]) el.dataset.desligado = ligado ? '0' : '1';
  return g;
}

export function barra(pop, id, k, cor, dentro = null){
  const el = noDe(pop, 'data-fill', id, dentro); if (!el) return null;
  Hud.fill(el, k, cor); return el;
}
/** Pílula do tipo: pinta o retângulo irmão com a cor da tabela do Figma e escreve o rótulo. */
export function badge(pop, idTexto, tipo, rotulo, dentro = null){
  const el = noDe(pop, 'data-txt', idTexto, dentro); if (!el) return null;
  const cores = pop.__tipos?.[tipo] || null;
  const ret = el.parentElement?.querySelector('[data-badge="1"]');
  const mostrar = !!rotulo;
  if (ret) ret.style.display = mostrar ? 'block' : 'none';
  el.style.display = mostrar ? 'flex' : 'none';                          // `flex` de volta, não '': era o que tirava a centralização vertical do texto da pílula
  if (!mostrar) return el;
  if (ret && cores) ret.style.backgroundColor = cores.fundo;
  if (cores) el.style.color = cores.texto;
  texto(pop, idTexto, rotulo, dentro);
  return el;
}
/** Liga/desliga um botão de ação (desligado = 50 %, como a Amanda pede). */
export function botao(pop, acao, ligado, rotulo){
  const el = pop?.querySelector('[data-tag="acao"][data-tagval="' + acao + '"]');
  if (!el) return null;
  el.dataset.desligado = ligado ? '0' : '1';
  el.style.opacity = ligado ? '1' : '0.5';
  el.style.cursor = ligado ? 'pointer' : 'default';
  if (rotulo != null){ rotulo = tr(rotulo); const t = el.querySelector('[data-txt], .pf-rotulo'); if (t && t.textContent !== rotulo){ t.textContent = rotulo; Hud.encolher(t); } }
  return el;
}
/** Garante N cópias de um molde dentro de um grupo, nomeadas `<base>-1..N`. Quem posiciona é quem chamou (as linhas
    da lista de capítulos têm altura variável). Devolve as cópias em ordem. */
export function clonarSerie(pop, paiNome, molde, n, base = null){
  const pai = grupo(pop, paiNome); if (!pai) return [];
  let zero = pai.querySelector(':scope > [data-fig="' + molde + '"]') || grupo(pop, molde);   // o molde pode estar dentro de outro grupo
  if (!zero) return [];
  if (zero.parentElement !== pai) pai.appendChild(zero);            // traz o molde pro pai certo (a linha da missão vem de dentro do grupo do capítulo)
  const nome = base || molde.replace(/-?\d+$/, '');
  const achar = i => pai.querySelector(':scope > [data-fig="' + nome + '-' + i + '"]');
  if (!achar(1)) zero.dataset.fig = nome + '-1';                         // o molde VIRA o primeiro (senão fica órfão e vazio na tela)
  const fora = [];
  for (let i = 1; i <= n; i++){
    let el = achar(i);
    if (!el){ el = zero.cloneNode(true); el.dataset.fig = nome + '-' + i; pai.appendChild(el); }
    el.style.display = 'block';
    fora.push(el);
  }
  for (let i = n + 1; ; i++){ const el = achar(i); if (!el) break; el.style.display = 'none'; }
  return fora;
}
/** Altura total de um grupo que rola (o espaçador que faz a barra de rolagem existir). */
export function alturaRolagem(pop, grupoNome, altura){
  const g = grupo(pop, grupoNome); if (!g) return;
  let e = g.querySelector(':scope > [data-espaco]');
  if (!e){ e = document.createElement('div'); e.dataset.espaco = '1'; e.style.position = 'relative'; e.style.pointerEvents = 'none'; g.appendChild(e); }
  e.style.height = Math.max(0, altura) + 'px';
}
/** Garante N células numa lista, clonando a 1ª e seguindo o passo da grade da maquete. Devolve as células. */
export function celulas(pop, grupo0, n, prefixo = 'item'){
  const g = grupo(pop, grupo0); if (!g) return [];
  const todas = () => [...g.querySelectorAll(':scope > [data-fig^="' + prefixo + '-"]')].filter(c => /^-\d+$/.test(c.dataset.fig.slice(prefixo.length)));   // só as células numeradas (conversa-log não é célula)
  let lista = todas();
  if (!lista.length) return [];
  const base = lista[0];
  /* Molde = a célula com MAIS nós (a maquete deixa linhas de exemplo mais pobres, tipo a "?????" da Pokédex sem pílulas):
     as originais mais pobres recebem o miolo do molde uma vez, senão a 1ª linha da lista nunca mostraria os tipos. */
  if (!g.__molde){
    const molde = lista.reduce((a, b) => b.querySelectorAll('*').length > a.querySelectorAll('*').length ? b : a, lista[0]);
    const px = (el, k) => parseFloat(el.style[k]) || 0;
    for (const c of lista) if (c !== molde && c.querySelectorAll('*').length < molde.querySelectorAll('*').length){
      /* CÉLULA QUE ERA SÓ A ARTE (18/09, teste local da Amanda com a rodada 31): as vagas vazias da maquete (item-16 a item-32 da Mochila do PC)
         vêm como folha img, com a caixa ALARGADA pela folga do PNG (100×100 em vez de 68×68, 16 px de cada lado). Com o miolo do molde dentro,
         ícone, quantidade e marca de selecionado saíam 16 px pra cima e pra esquerda da arte a partir do 16º item. A célula volta pra caixa do
         molde (no meio da caixa alargada) e o fundo passa a ser desenhado como o do molde (com a folga). */
      const dw = (px(c, 'width') - px(molde, 'width')) / 2, dh = (px(c, 'height') - px(molde, 'height')) / 2;
      if (c.classList.contains('pf-img') && dw > 0 && dh > 0){
        Object.assign(c.style, { left: (px(c, 'left') + dw) + 'px', top: (px(c, 'top') + dh) + 'px', width: molde.style.width, height: molde.style.height, backgroundSize: molde.style.backgroundSize, backgroundPosition: molde.style.backgroundPosition });
        c.className = molde.className;
      }
      c.innerHTML = molde.innerHTML; c.style.backgroundImage = molde.style.backgroundImage; if (molde.dataset.arte) c.dataset.arte = molde.dataset.arte;
    }
    g.__molde = molde;
  }
  if (!g.__passo){                                                       // passo da grade, lido das 2 primeiras linhas
    /* 18/09 (rodada 32, conferindo a faixa da scrollbar do Social): as colunas saem da caixa da maquete (style.top), não do offsetTop. O Social
       esconde as células enquanto a lista de amigos carrega e a 1ª chamada chegava com todas escondidas: offsetTop 0 em todas = uma linha só de
       9 colunas, passo vertical 0 — do 10º amigo em diante a célula nascia em cima da 1ª e a lista nunca rolava (sem barra). */
    const topo = e => parseFloat(e.style.top) || 0, p2 = lista[1], colunas = lista.filter(e => Math.abs(topo(e) - topo(base)) < 0.5).length || 1;
    g.__cols = colunas;
    g.__dx = p2 ? (parseFloat(p2.style.left) - parseFloat(base.style.left)) || 0 : 0;
    const primeiraDaLinha2 = lista[colunas];
    g.__dy = primeiraDaLinha2 ? (parseFloat(primeiraDaLinha2.style.top) - parseFloat(base.style.top)) || 0 : 0;
    g.__passo = true;
  }
  for (let i = lista.length; i < n; i++){
    const c = (g.__molde || base).cloneNode(true);
    c.dataset.fig = prefixo + '-' + (i + 1);
    c.style.left = (parseFloat(base.style.left) + (i % g.__cols) * g.__dx) + 'px';
    c.style.top = (parseFloat(base.style.top) + Math.floor(i / g.__cols) * g.__dy) + 'px';
    c.dataset.sel = '0';
    g.appendChild(c);
  }
  lista = todas();
  lista.forEach((c, i) => { c.style.display = i < n ? 'block' : 'none'; });
  const linhas = Math.ceil(Math.max(n, 1) / (g.__cols || 1));
  g.__alturaTotal = parseFloat(base.style.top) + linhas * (g.__dy || parseFloat(base.style.height) || base.offsetHeight);   /* 18/09: a altura da maquete vale também com a célula escondida (offsetHeight 0) */
  let espaco = g.querySelector(':scope > [data-espaco]');
  if (!espaco){ espaco = document.createElement('div'); espaco.dataset.espaco = '1'; espaco.style.position = 'relative'; espaco.style.pointerEvents = 'none'; g.appendChild(espaco); }
  espaco.style.height = g.__alturaTotal + 'px';
  return lista.slice(0, n);
}
/** Slot vazio da lista: fica só o cartão, sem barra, sem pílula e sem texto (pedido da rodada 6). */
export function itemVazio(pop, i, vazio, prefixo = 'item-time'){
  const it = item(pop, i, prefixo); if (!it) return null;
  for (const f of it.children){
    if (/^slot-pokemon-|^slot-tecla$/.test(f.dataset.fig || '') || f.dataset.txt === 'tecla') continue;   // celular: a moldura e a tecla ficam mesmo no slot vazio (como na HUD)
    f.style.display = vazio ? 'none' : (f.dataset.txt ? (f.dataset.display || 'flex') : 'block');
  }
  it.dataset.vazio = vazio ? '1' : '0';
  return it;
}
/** Item da lista escolhido: troca a arte pela referência `[estado:selecionado]`. */
export function selecionar(pop, n, prefixo = 'item-time', ref = 'item-time'){
  const sel = pop.__refs?.[ref]?.selecionado?.img;
  for (const it of pop.querySelectorAll('[data-fig^="' + prefixo + '-"]')){
    const eu = it.dataset.fig === prefixo + '-' + n;
    it.dataset.sel = eu ? '1' : '0';
    const arte = eu && sel ? sel : it.dataset.arte;
    if (arte) it.style.backgroundImage = 'url(' + arte + ')';
    if (pop.__refs?.[ref]?.normal) estadoRef(pop, it, ref, eu ? 'selecionado' : 'normal');   // v2: a seleção é uma MARCA por cima (ref [estado:selecionado] × normal), não outra arte
    for (const m of it.querySelectorAll(':scope > [data-sobre="selecionado"]')) m.style.display = eu ? 'block' : 'none';   // rodada 29: marca-selecionado / marcaAtiva de item, sem depender de ref
  }
}
/** Cartão de golpe vazio: troca a arte pela referência `[estado:vazio]` e limpa os textos. */
export function golpeVazio(pop, i, vazio){
  const g = grupo(pop, 'golpe-' + (i + 1)); if (!g) return null;
  const alt = pop.__refs?.golpe?.vazio?.img;
  const arte = vazio && alt ? alt : g.dataset.arte;
  if (arte) g.style.backgroundImage = 'url(' + arte + ')';
  if (vazio){ texto(pop, 'golpe-nome', '', g); texto(pop, 'golpe-info', '', g); badge(pop, 'golpe-tipo', null, null, g); }
  return g;
}
/** Aba ativa: troca a arte das duas (ativa/inativa vêm da própria maquete) e avisa quem montou. */
export function trocarAba(pop, nome){
  /* `conteudo-<aba>` também vem marcado `[aba:x]`, mas é o CONTEÚDO da aba, não o botão: sem separar, o bloco inteiro
     ganhava a arte da pílula esticada por cima de tudo (rodada 24). Aqui ele só aparece/some conforme a aba ativa. */
  const conteudos = [...pop.querySelectorAll('[data-tag="aba"][data-fig^="conteudo-"]')];
  for (const c of conteudos) c.style.display = (c.dataset.tagval === nome) ? '' : 'none';
  const abas = [...pop.querySelectorAll('[data-tag="aba"]')].filter(a => !conteudos.includes(a));
  const ativa = abas.find(a => a.dataset.tagval === nome) || abas[0];
  if (!ativa) return;
  if (pop.__def?.v2){                                                    // v2 (rodada 27): cada aba tem a própria arte (com o ícone); ativa = a MARCA por baixo (ref cat [estado:ativa])
    const base = (abas[0]?.dataset.fig || '').split('-')[0];
    for (const a of abas){ const eh = a === ativa; a.dataset.aba = eh ? 'ativa' : 'inativa'; if (pop.__refs?.[base]) estadoRef(pop, a, base, eh ? 'ativa' : 'normal');
      for (const m of a.querySelectorAll(':scope > [data-sobre="ativa"]')) m.style.display = eh ? 'block' : 'none';   // rodada 29: `marcaAtiva` (dourado entre o fundo e o ícone)
      for (const t of a.querySelectorAll('[data-cor-aba]')) t.style.color = eh ? '#1D2B45' : '#EAF6FB'; }
    if (!pop.__cb.aba) abaSolta(pop, nome);                              // 18/09: ninguém decide a aba (modo prévia do adm): o módulo mostra o bloco solto dela
    if (pop.__aba !== nome){ pop.__aba = nome; pop.__cb.aba?.(nome); }
    return;
  }
  if (!pop.__arteAba){
    /* Arte de cada estado: a INATIVA é a mais comum entre os botões (5 categorias normais contra 1 dourada) e a
       ATIVA vem da referência `[estado:ativa]` do pacote quando existe. Serve pra 2 abas e pra 6 categorias. */
    const conta = {};
    for (const a of abas) if (a.dataset.arte) conta[a.dataset.arte] = (conta[a.dataset.arte] || 0) + 1;
    const ordenadas = Object.entries(conta).sort((x, y) => y[1] - x[1]).map(x => x[0]);
    const base = (abas[0]?.dataset.fig || '').split('-')[0];
    /* Empate (2 abas, uma arte cada, sem referência): a maquete desenha a 1ª aba ATIVA, então a arte dela é a ativa.
       Sem isto as duas invertiam no primeiro clique (Principal cinza, Secundárias dourada). */
    const arte0 = abas[0]?.dataset.arte, menor = Math.min(...Object.values(conta));
    /* Quando a arte se chama `…-ativa.png` / `…-inativa.png` (rodada 23), o nome já diz qual é qual — melhor que qualquer
       adivinhação: na tela do treinador a maquete desenha a SEGUNDA aba ativa, e o desempate por posição errava. */
    const porNome = ordenadas.find(a => /(^|[-_/])ativa/.test(a.replace(/.*\//, '')) && !/inativa/.test(a));
    const ativaArte = porNome || pop.__refs?.[base]?.ativa?.img || (arte0 && conta[arte0] === menor ? arte0 : ordenadas[ordenadas.length - 1]) || ordenadas[0];
    pop.__arteAba = { ativa: ativaArte, inativa: ordenadas.find(a => a !== ativaArte) || ordenadas[0] };
    /* Cores do texto: as da própria maquete (a aba desenhada ativa dá a cor ativa, outra dá a inativa). Antes era fixo
       escuro-no-dourado, e a Pokédex tem aba ativa escura com texto dourado. */
    const txtDaAba = a => a?.querySelector('[data-txt], .pf-rotulo');   // a aba pode ter texto do jogo (`txt/`) ou rótulo fixo da maquete
    const tAtiva = txtDaAba(abas.find(a => a.dataset.arte === ativaArte)), tIn = txtDaAba(abas.find(a => a.dataset.arte !== ativaArte));
    pop.__arteAba.corAtiva = tAtiva?.style.color || '#1A1A1A'; pop.__arteAba.corInativa = tIn?.style.color || '#F2C23D';
  }
  for (const a of abas){
    const eh = a === ativa;
    a.dataset.aba = eh ? 'ativa' : 'inativa';
    const arte = eh ? pop.__arteAba.ativa : pop.__arteAba.inativa;
    if (arte) a.style.backgroundImage = 'url(' + arte + ')';
    const t = a.querySelector('[data-txt], .pf-rotulo');               // sem isto, a aba que SAI de ativa ficava com texto escuro em pílula escura (rodada 24)
    if (t) t.style.color = eh ? pop.__arteAba.corAtiva : pop.__arteAba.corInativa;
  }
  if (pop.__aba !== nome){ pop.__aba = nome; pop.__cb.aba?.(nome); }
}
/* BLOCO SOLTO DA ABA (18/09, rodada 32 — Amanda: "Eventos: a aba Agenda não aparece e não dá pra trocar de aba na prévia"). O conteúdo das abas que
   não são a 1ª vem como ref `conteudo-<aba> [aba:<aba>]` e o conversor o põe nos `extras`, com a caixa do conteúdo da 1ª aba (x/y). A Config e o Social
   posicionam os blocos deles no `cb.aba`; quem monta sem `cb.aba` (modo prévia: Eventos, Calendário, Mercado, Guilda) fica com este — o bloco da aba
   ativa aparece NA caixa do conteúdo, 1:1, e os das outras somem (o `conteudo-<1ª aba>` da árvore o trocarAba já esconde). Só v2: no layout antigo o
   x/y dos extras é o lugar deles na folha da maquete. Exportado pra bancada dos pop-ups. */
export function abaSolta(pop, nome){
  if (!pop?.__def?.v2) return;
  /* Só com a caixa do conteúdo da 1ª aba na árvore (Eventos, Calendário, Mercado, Guilda, Config): é dela que vem o x/y do extra. Sem ela o conversor
     põe o bloco no meio do pop-up — no Social (quem posiciona é o menus.mjs, no campo de busca) o `conteudo-mensagens` caía em 64,110,5, POR CIMA das
     abas, e na bancada não dava mais pra clicar Chat/Amigos (revisão, 18/09). Aí fica como antes: quem montou decide. */
  if (!(pop.__def.filhos || []).some(f => /^conteudo-/.test(f.nome || ''))) return;
  for (const d of pop.querySelectorAll(':scope > .pf-extra[data-aba-de]')){
    const ex = pop.__def.extras?.[d.dataset.fig];
    if (d.dataset.abaDe !== nome || !ex || ex.x == null || ex.y == null){ mostrarExtra(pop, d.dataset.fig, false); continue; }
    mostrarExtra(pop, d.dataset.fig, true, { x: ex.x, y: ex.y });
    Object.assign(d.style, { left: ex.x + 'px', top: ex.y + 'px' });      // o mostrarExtra arredonda: o bloco fica na caixa exata do conteúdo (celular 30,3 × 86,9)
  }
}
export function abaAtual(pop){ return pop?.__aba || null; }
