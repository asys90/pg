/* Prévia do treinador NPC (esquema `treinadores`): o modelo 3D do NPC no MESMO palco da tela de criação (personagem.mjs
 * criarPalco: Idle, gira sozinho, arrastar gira) e o time com nome e ícone de cada Pokémon (ui/mon/pmNNNN.png).
 * O palco busca em cenario/pc/; o NPC fica em cenario/npc/, então o glb vai como '../npc/<modelo>' (a URL se resolve sozinha).
 * A tinta de fábrica de alguns NPCs é por modelo (`<glb>:<material>` no npc_tintas.json): reaplica com o nome do GLB. */
import { criarPalco } from '/personagem.mjs';
import * as Tinta from '/tinta.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let P = null, raiz = null, atual = null, nomes = null;
const montagens = new Map();
const montar = s => { if (!montagens.has(s.id)) montagens.set(s.id, P.montar(s).finally(() => montagens.delete(s.id))); return montagens.get(s.id); };
const soltar = id => { const pr = montagens.get(id); if (pr) pr.catch(() => {}).then(() => { if (atual !== id) P.descartar(id); }); else P.descartar(id); };
/* nº → nome da forma BASE: o pokedex.json traz as formas com o mesmo nº depois da base (19 = Rattata, depois Rattata-Alola) */
const nomesDex = () => (nomes ||= fetch('/pokedex.json').then(r => r.json()).then(p => { const m = {}; for (const s of p.species || []) if (!(s.n in m)) m[s.n] = s.name; return m; }).catch(() => ({})));

function montarRaiz() {
  raiz = document.createElement('div'); raiz.className = 'previa-skin';
  raiz.innerHTML = '<div class="palco"></div><div class="previa-info"></div><div class="previa-time"></div>';
  P = criarPalco(raiz, () => ({}));
  raiz.appendChild(P.canvas);
  const palco = raiz.querySelector('.palco');
  let x0 = 0;
  palco.addEventListener('pointerdown', ev => { const it = P.itens.get(atual); if (!it?.pronto) return; it.arrasto = ev.pointerId; x0 = ev.clientX; try { palco.setPointerCapture(ev.pointerId); } catch {} });
  palco.addEventListener('pointermove', ev => { const it = P.itens.get(atual); if (!it || it.arrasto !== ev.pointerId) return; it.giro += (ev.clientX - x0) * 0.012; x0 = ev.clientX; });
  const solta = ev => { const it = P.itens.get(atual); if (it && it.arrasto === ev.pointerId) it.arrasto = null; };
  palco.addEventListener('pointerup', solta); palco.addEventListener('pointercancel', solta);
}

export function mostrar(caixa, r) {
  if (!raiz) montarRaiz();
  caixa.prepend(raiz);
  atualizar(r);
}
export async function atualizar(r) {
  if (!raiz) return;
  renderTime(r?.time);
  const glb = String(r?.glb || '').trim();
  if (glb === atual) return;
  if (atual) soltar(atual);
  atual = glb;
  const palco = raiz.querySelector('.palco'), info = raiz.querySelector('.previa-info');
  palco.dataset.id = glb; palco.classList.remove('pronto'); info.classList.remove('aviso');
  if (!glb) { info.textContent = 'Sem modelo.'; return; }
  info.textContent = 'carregando ' + glb + '…';
  let it;
  const caminho = glb.includes('/') ? glb : 'npc/' + glb;              // NPCs (npcs_glb) já vêm com a pasta: npc/… ou mon/…
  try { it = await montar({ id: glb, glb: '../' + caminho, nome: glb }); }
  catch { if (atual === glb) { P.descartar(glb); info.classList.add('aviso'); info.innerHTML = `⚠ Modelo não encontrado: <code>cenario/${esc(caminho)}.glb</code>. No jogo ele não aparece.`; } return; }
  if (atual !== glb || !it?.pronto) return;
  await Tinta.aplicarTinta(it.obj, glb);
  P.selecionar(glb); palco.classList.add('pronto');
  info.textContent = 'Modelo ' + glb + ' (arraste pra girar).';
}
async function renderTime(time) {
  const el = raiz.querySelector('.previa-time');
  if (time === undefined) { el.innerHTML = ''; return; }                // NPC comum (sem time): nada aqui
  if (!Array.isArray(time) || !time.length) { el.innerHTML = '<span class="fraco">Sem time.</span>'; return; }
  const n = await nomesDex();
  el.innerHTML = time.map(p => `<span class="pt-mon"><img src="/ui/mon/pm${String(p?.dex).padStart(4, '0')}.png" alt="" onerror="this.style.visibility='hidden'"><b>${esc(n[p?.dex] || '#' + p?.dex)}</b> <span class="fraco">Nv ${esc(p?.lv)}</span></span>`).join('');
}
