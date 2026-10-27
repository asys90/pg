/* Prévia da Raid (esquema raid, Fase 3): o chefe em 3D (cenario/mon/<modelo>.glb, no palco da tela de criação — arrastar gira)
 * com nome e nível, e a arena pelo nome que o jogador vê (data/cenas.json). Campo vazio = o valor original (Mew, 4120009). */
import { criarPalco } from '/personagem.mjs';
import { nomesDeLugares, recurso } from '/admin/recursos.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PADRAO = { arena: '4120009', chefeNome: 'Mew', chefeGlb: 'pm0151_00', chefeNivel: 70, vagas: 10 };   // o mesmo do raid.mjs
let raiz = null, P = null, atual = null, it = null;

function montarRaiz() {
  raiz = document.createElement('div'); raiz.className = 'previa-skin';
  raiz.innerHTML = '<div class="palco"></div><div class="previa-info"></div>';
  P = criarPalco(raiz, () => ({}));
  raiz.appendChild(P.canvas);
  const palco = raiz.querySelector('.palco');
  let x0 = 0;
  palco.addEventListener('pointerdown', ev => { if (!it?.pronto) return; it.arrasto = ev.pointerId; x0 = ev.clientX; try { palco.setPointerCapture(ev.pointerId); } catch {} });
  palco.addEventListener('pointermove', ev => { if (!it || it.arrasto !== ev.pointerId) return; it.giro += (ev.clientX - x0) * 0.012; x0 = ev.clientX; });
  const solta = ev => { if (it && it.arrasto === ev.pointerId) it.arrasto = null; };
  palco.addEventListener('pointerup', solta); palco.addEventListener('pointercancel', solta);
}

export function mostrar(caixa, r) {
  if (!raiz) montarRaiz();
  caixa.prepend(raiz);
  atualizar(r);
}
export async function atualizar(r) {
  if (!raiz) return;
  const v = k => (r?.[k] ?? '') === '' ? PADRAO[k] : r[k];
  const [lugares, { modelos = [] }] = await Promise.all([nomesDeLugares(), recurso('modelos?pasta=mon')]);
  const arena = String(v('arena')), nomeArena = lugares.cenas[arena];
  const glb = String(v('chefeGlb'));
  const el = raiz.querySelector('.previa-info');
  const avisos = [!nomeArena ? `⚠ A cena <b>${esc(arena)}</b> não existe no cenas.json — a fila leva pra lugar nenhum.` : '',
    !modelos.includes(glb) ? `⚠ O modelo <code>cenario/mon/${esc(glb)}.glb</code> não existe nesta cópia.` : ''].filter(Boolean);
  el.innerHTML = `<b>${esc(v('chefeNome'))}</b> Nv ${esc(v('chefeNivel'))} · arena <b>${esc(nomeArena || arena)}</b> (${esc(arena)}) · ${esc(v('vagas'))} vagas` + (avisos.length ? '<br>' + avisos.join('<br>') : '');
  el.classList.toggle('aviso', avisos.length > 0);
  if (glb === atual) return;
  if (atual) P.descartar(atual);
  atual = glb; it = null;
  const palco = raiz.querySelector('.palco'); palco.dataset.id = glb; palco.classList.remove('pronto');
  if (!modelos.includes(glb)) return;
  try { it = await P.montar({ id: glb, glb: '../mon/' + glb, nome: glb }); } catch { return; }   // o palco busca em cenario/pc/
  if (atual !== glb || !it?.pronto) return;
  P.selecionar(glb); palco.classList.add('pronto');
}
