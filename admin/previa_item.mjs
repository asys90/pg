/* Prévia do item (esquema `itens`): o ícone (ui/itens/<ícone>.png, o mesmo que a Bolsa e a loja do jogo usam) e o cartão com
 * nome, tipo, valor e a descrição — o jogo escreve <br> dentro das descrições, então a prévia quebra a linha igual. */
import { ESQUEMAS } from '/admin/esquemas.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tipoDe = t => ESQUEMAS.itens.campos.find(c => c.k === 't')?.opcoes.find(o => o.v === t)?.rotulo || '';
let raiz = null;

export function mostrar(caixa, r) {
  if (!raiz) { raiz = document.createElement('div'); raiz.className = 'previa-item'; }
  caixa.prepend(raiz);
  atualizar(r);
}
export function atualizar(r) {
  if (!raiz) return;
  const desc = esc(r?.d || '').replace(/&lt;br\s*\/?&gt;/gi, '<br>').replace(/\n/g, '<br>');
  const valor = (r?.v || []).map(([m, p]) => `${p} (moeda ${m})`).join(' ou ');
  raiz.innerHTML = `<div class="pi-icone">${r?.i ? `<img src="/ui/itens/${esc(r.i)}.png" alt="">` : ''}<span class="pi-sem" ${r?.i ? 'hidden' : ''}>sem ícone</span></div>
    <div class="pi-texto"><b>${esc(r?.n || '(sem nome)')}</b><div class="fraco">${esc(tipoDe(r?.t))}${r?.q != null ? ' · qualidade ' + r.q : ''}${valor ? ' · ' + esc(valor) : ''}</div>
    <div class="pi-desc">${desc || '<span class="fraco">sem descrição</span>'}</div></div>`;
  const img = raiz.querySelector('img');
  if (img) img.onerror = () => { img.remove(); const s = raiz.querySelector('.pi-sem'); s.hidden = false; s.textContent = 'ícone não encontrado: ui/itens/' + r.i + '.png'; };
}
