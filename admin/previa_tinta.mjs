/* Prévia das Cores de NPC (esquema npc_tintas, Fase 3). Três partes:
 *  • seletores de cor dos 4 canais — escrevem no campo JSON do formulário (o formulário valida e marca "não salvo");
 *  • o "mapa" da máscara: a máscara PNG pintada com as 4 cores, como o jogo faz numa textura branca (funciona sem modelo);
 *  • o modelo 3D, quando algum .glb desta cópia usa o material (índice do servidor, /admin/recursos/materiais), no mesmo palco
 *    da tela de criação, com a cor editada aplicada na hora (Tinta.pintar com o registro em edição; o resto, de fábrica).
 * O ID do registro (= nome do material, ou "<modelo>:<material>") vem da linha selecionada da tabela. */
import { criarPalco } from '/personagem.mjs';
import * as Tinta from '/tinta.mjs';
import { recurso, escreverCampo } from '/admin/recursos.mjs';
import { corHex } from '/admin/esquemas_f3.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CANAIS = [['ColorR', 'R'], ['ColorG', 'G'], ['ColorB', 'B'], ['ColorBlack', 'Preto']];
const hexRgb = h => [1, 3, 5].map(i => +(parseInt(h.slice(i, i + 2), 16) / 255).toFixed(4));
const idSelecionado = () => document.querySelector('#d-corpo tbody tr.atual')?.dataset.id || '';
let raiz = null, caixa = null, P = null, reg = null, alvo = null;   // alvo = { id, mat, modelo, it }
let pintando = null, pendente = false;
const imagens = new Map();
const imagem = url => { if (!imagens.has(url)) imagens.set(url, new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = falha; i.src = url; }).catch(() => null)); return imagens.get(url); };

function montarRaiz() {
  raiz = document.createElement('div'); raiz.className = 'previa-skin previa-tinta';
  raiz.innerHTML = `<div class="palco" hidden></div><div class="previa-info"></div>
    <div class="previa-cores">${CANAIS.map(([k, n]) => `<label class="cor"><input type="color" data-k="${k}"><span>${n}</span></label>`).join('')}</div>
    <div style="display:flex;gap:10px;align-items:center;margin-top:8px"><canvas class="pt-mapa" width="112" height="112" style="border-radius:8px;background:#0f131b;flex:none"></canvas>
    <div class="fraco pt-mapa-info" style="font-size:12px"></div></div>`;
  P = criarPalco(raiz, () => ({}));
  raiz.appendChild(P.canvas);
  const palco = raiz.querySelector('.palco');
  let x0 = 0;                                                             // arrastar gira (como na prévia da skin)
  palco.addEventListener('pointerdown', ev => { const it = alvo?.it; if (!it?.pronto) return; it.arrasto = ev.pointerId; x0 = ev.clientX; try { palco.setPointerCapture(ev.pointerId); } catch {} });
  palco.addEventListener('pointermove', ev => { const it = alvo?.it; if (!it || it.arrasto !== ev.pointerId) return; it.giro += (ev.clientX - x0) * 0.012; x0 = ev.clientX; });
  const solta = ev => { const it = alvo?.it; if (it && it.arrasto === ev.pointerId) it.arrasto = null; };
  palco.addEventListener('pointerup', solta); palco.addEventListener('pointercancel', solta);
  for (const i of raiz.querySelectorAll('input[type=color]')) i.addEventListener('input', () => {
    const a = Array.isArray(reg?.[i.dataset.k]) && reg[i.dataset.k].length === 4 ? reg[i.dataset.k][3] : 0;   // o 4º número (alfa do shader) fica como estava
    escreverCampo(caixa, i.dataset.k, JSON.stringify([...hexRgb(i.value), a]));
  });
}
const info = (html, aviso = false) => { const el = raiz.querySelector('.previa-info'); el.innerHTML = html; el.classList.toggle('aviso', aviso); };

export function mostrar(cx, r) {
  if (!raiz) montarRaiz();
  caixa = cx; cx.prepend(raiz);
  atualizar(r);
}

export async function atualizar(r) {
  if (!raiz) return;
  reg = r;
  for (const i of raiz.querySelectorAll('input[type=color]')) if (document.activeElement !== i) i.value = corHex(r?.[i.dataset.k]) || '#000000';
  desenharMapa(r);
  const id = idSelecionado();
  if (alvo?.id !== id) await trocarModelo(id);
  else repintar();
}

/** Acha um modelo desta cópia que usa o material e monta no palco. */
async function trocarModelo(id) {
  const velho = alvo; alvo = { id, mat: id.includes(':') ? id.slice(id.indexOf(':') + 1) : id, modelo: null, it: null };
  if (velho?.modelo && velho.modelo !== alvo.modelo) P.descartar(velho.modelo);
  const palco = raiz.querySelector('.palco'); palco.hidden = true; palco.classList.remove('pronto');
  if (!id) { info('Selecione um material na tabela.'); return; }
  const prefixo = id.includes(':') ? id.slice(0, id.indexOf(':')) : null;
  const { materiais = {} } = await recurso('materiais');
  if (alvo.id !== id) return;
  const lista = (materiais[alvo.mat] || []).filter(m => !prefixo || m.endsWith('/' + prefixo));
  if (!lista.length) { info(`Nenhum modelo desta cópia usa o material <b>${esc(alvo.mat)}</b> — confira as cores no mapa da máscara abaixo.`); return; }
  alvo.modelo = lista[0];
  palco.hidden = false; palco.dataset.id = alvo.modelo;
  info('carregando ' + esc(alvo.modelo) + '…');
  const glb = alvo.modelo.startsWith('pc/') ? alvo.modelo.slice(3) : '../' + alvo.modelo;   // o palco busca em cenario/pc/
  let it;
  try { it = await P.montar({ id: alvo.modelo, glb, nome: alvo.modelo }); }
  catch { if (alvo.id === id) { palco.hidden = true; info(`⚠ Não deu pra abrir <code>cenario/${esc(alvo.modelo)}.glb</code>.`, true); } return; }
  if (alvo.id !== id || !it?.pronto) return;
  alvo.it = it;
  await Tinta.aplicarTinta(it.obj, alvo.modelo.split('/')[1]);           // as outras partes com a cor de fábrica (inclusive as "<modelo>:<material>")
  P.selecionar(alvo.modelo); palco.classList.add('pronto');
  info(`Modelo <b>${esc(alvo.modelo)}</b>${lista.length > 1 ? ` (o material também aparece em ${lista.length - 1} outro${lista.length > 2 ? 's' : ''}: ${esc(lista.slice(1, 4).join(', '))}${lista.length > 4 ? '…' : ''})` : ''} — a parte deste material está com a cor em edição. Arraste pra girar.`);
  repintar();
}
function repintar() {
  const it = alvo?.it; if (!it?.pronto || !reg) return;
  if (pintando) { pendente = true; return; }
  const receita = reg.isMask ? {} : { [alvo.mat]: reg };                  // "não pinta": a textura fica crua
  pintando = Tinta.pintar(it.obj, receita).catch(e => console.warn('prévia tinta:', e)).finally(() => { pintando = null; if (pendente) { pendente = false; repintar(); } });
}

/** A máscara pintada com as 4 cores sobre branco (a fórmula do tinta.mjs). Sem máscara: o canal R é o tom da peça inteira. */
async function desenharMapa(r) {
  const cv = raiz.querySelector('.pt-mapa'), c = cv.getContext('2d'), txt = raiz.querySelector('.pt-mapa-info');
  const cor = k => (Array.isArray(r?.[k]) ? r[k] : [0, 0, 0]).map(n => Math.max(0, n));
  const R = Array.isArray(r?.ColorR) ? r.ColorR : [1, 1, 1], G = cor('ColorG'), B = cor('ColorB'), K = cor('ColorBlack');
  c.clearRect(0, 0, cv.width, cv.height);
  if (r?.isMask) { txt.textContent = 'Não pinta: a textura do modelo já vem colorida.'; return; }
  if (!r?.mask) { c.fillStyle = corHex(R); c.fillRect(0, 0, cv.width, cv.height); txt.textContent = 'Sem máscara: a peça inteira fica no tom do canal R.'; return; }
  const { mascaras = [] } = await recurso('mascaras');
  const img = mascaras.includes(r.mask) ? await imagem('/cenario/npc/mask/' + encodeURIComponent(r.mask)) : null;
  if (reg !== r) return;
  if (!img) { txt.innerHTML = `⚠ A máscara <code>${esc(r.mask)}</code> não existe nesta cópia (cenario/npc/mask) — no jogo a peça fica só no tom do canal R.`; c.fillStyle = corHex(R); c.fillRect(0, 0, cv.width, cv.height); return; }
  c.drawImage(img, 0, 0, cv.width, cv.height);
  const px = c.getImageData(0, 0, cv.width, cv.height), d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    const mr = d[i] / 255, mg = d[i + 1] / 255, mb = d[i + 2] / 255, m0 = Math.max(0, 1 - mr - mg - mb);
    for (let ch = 0; ch < 3; ch++) d[i + ch] = Math.max(0, Math.min(255, Math.round(255 * (R[ch] * mr + G[ch] * mg + B[ch] * mb + K[ch] * m0))));
    d[i + 3] = 255;
  }
  c.putImageData(px, 0, 0);
  txt.innerHTML = `Mapa da máscara <code>${esc(r.mask)}</code> com as cores acima: onde a máscara é vermelha pinta R, verde G, azul B, e o resto (preto) a cor Preto.`;
}
