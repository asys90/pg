/* Prévia das Mochilas (esquema mochilas, Fase 3): veste a mochila num treinador no MESMO palco da tela de criação
 * (personagem.mjs criarPalco + vestirMochila, a mesma função do jogo: religa a malha aos ossos do treinador e pinta pelo
 * npc_tintas.json) e diz se o modelo da mochila existe nesta cópia (cenario/pc/<glb>.glb). Arrastar gira. */
import { criarPalco, vestirMochila, tirarMochila } from '/personagem.mjs';
import { recurso } from '/admin/recursos.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let raiz = null, P = null, reg = null, treinador = null, it = null, vestida = null, montando = null;
let skins = null;
const skinsDe = () => (skins ||= fetch('/data/skins_treinador.json').then(r => r.json()).catch(() => []));

function montarRaiz() {
  raiz = document.createElement('div'); raiz.className = 'previa-skin';
  raiz.innerHTML = `<div class="palco"></div><div class="previa-info"></div>
    <div class="previa-cores"><label class="cor">Treinador <select class="pm-treinador"><option value="menino">Herói</option><option value="menina">Heroína</option></select></label></div>`;
  P = criarPalco(raiz, () => ({}));
  raiz.appendChild(P.canvas);
  const palco = raiz.querySelector('.palco');
  let x0 = 0;
  palco.addEventListener('pointerdown', ev => { if (!it?.pronto) return; it.arrasto = ev.pointerId; x0 = ev.clientX; try { palco.setPointerCapture(ev.pointerId); } catch {} });
  palco.addEventListener('pointermove', ev => { if (!it || it.arrasto !== ev.pointerId) return; it.giro += (ev.clientX - x0) * 0.012; x0 = ev.clientX; });
  const solta = ev => { if (it && it.arrasto === ev.pointerId) it.arrasto = null; };
  palco.addEventListener('pointerup', solta); palco.addEventListener('pointercancel', solta);
  raiz.querySelector('.pm-treinador').onchange = () => atualizar(reg, true);
}
const info = (html, aviso = false) => { const el = raiz.querySelector('.previa-info'); el.innerHTML = html; el.classList.toggle('aviso', aviso); };

export function mostrar(caixa, r) {
  if (!raiz) montarRaiz();
  caixa.prepend(raiz);
  atualizar(r);
}

/** Um treinador desta cópia pro sexo pedido (o 1º da lista que tem o .glb; os 2 heróis de sempre vêm primeiro). */
async function prefabDe(sexo) {
  const [lista, { modelos = [] }] = await Promise.all([skinsDe(), recurso('modelos?pasta=pc')]);
  const ok = s => s.sexo === sexo && modelos.includes(s.prefab);
  return (lista.find(s => ok(s) && s.inicial) || lista.find(ok))?.prefab || (sexo === 'menina' ? 'Girl_002' : 'Boy_002');
}

export async function atualizar(r, forcar = false) {
  if (!raiz) return;
  reg = r;
  const sel = raiz.querySelector('.pm-treinador');
  if (!forcar && (r?.sexo === 1 || r?.sexo === 2)) sel.value = r.sexo === 2 ? 'menina' : 'menino';
  const prefab = await prefabDe(sel.value);
  if (reg !== r) return;
  const palco = raiz.querySelector('.palco');
  if (treinador !== prefab) {                                             // troca o treinador (a mochila é vestida de novo abaixo)
    if (treinador) P.descartar(treinador);
    treinador = prefab; it = null; vestida = null; palco.dataset.id = prefab; palco.classList.remove('pronto');
    info('carregando ' + esc(prefab) + '…');
    try { montando = P.montar({ id: prefab, glb: prefab, nome: prefab }); it = await montando; }
    catch { if (treinador === prefab) info(`⚠ Não deu pra abrir o treinador <code>cenario/pc/${esc(prefab)}.glb</code>.`, true); return; }
    if (treinador !== prefab || !it?.pronto) return;
    P.selecionar(prefab); palco.classList.add('pronto');
  }
  if (!it?.pronto) return;
  const glb = String(reg?.glb || '').trim();
  if (glb === vestida) return;
  vestida = glb;
  const { modelos = [] } = await recurso('modelos?pasta=pc');
  if (!glb) { tirarMochila(it.obj); info('Sem modelo — preencha "Modelo (glb)".', true); return; }
  if (!modelos.includes(glb)) { tirarMochila(it.obj); info(`⚠ O modelo <code>cenario/pc/${esc(glb)}.glb</code> não existe nesta cópia — no jogo esta mochila não aparece (o treinador fica com a da roupa).`, true); return; }
  info('vestindo ' + esc(glb) + '…');
  const m = await vestirMochila(it.obj, glb).catch(() => null);
  if (vestida !== glb) return;
  info(m ? `<b>${esc(reg?.nome || glb)}</b> vestida em ${esc(treinador)} (arraste pra girar). Cores de fábrica: tela Cores de NPC.`
    : `⚠ <code>${esc(glb)}.glb</code> abriu, mas não encaixou no esqueleto do treinador (ver o console).`, !m);
}
