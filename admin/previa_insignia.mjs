/* Prévia da insígnia (esquema `insignias`, Fase 2): o ícone ui/icones/<ícone>.png — o mesmo que o Treinador do jogo mostra —, o nome
 * e quais ginásios dão esta insígnia (ginasios.json → insignia.id). */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let raiz = null, ginasios = null;
const carregarGinasios = () => (ginasios ||= fetch('/data/ginasios.json?t=' + Date.now()).then(r => r.ok ? r.json() : {}).catch(() => ({})));

export function mostrar(caixa, r) {
  if (!raiz) { raiz = document.createElement('div'); raiz.style.cssText = 'display:flex;gap:12px;align-items:center;margin-bottom:10px'; }
  caixa.prepend(raiz);
  atualizar(r);
}
export async function atualizar(r) {
  if (!raiz) return;
  raiz.innerHTML = `<div style="width:64px;height:64px;display:grid;place-items:center;background:#0f131b;border:1px solid var(--borda);border-radius:8px">${r?.i ? `<img src="/ui/icones/${esc(r.i)}.png" alt="" style="max-width:56px;max-height:56px">` : '<span class="fraco">—</span>'}</div>
    <div><b>${esc(r?.n || '(sem nome)')}</b><div class="fraco gins">${r?.gen ? 'geração ' + esc(r.gen) : ''}</div></div>`;
  const img = raiz.querySelector('img');
  if (img) img.onerror = () => { img.replaceWith(Object.assign(document.createElement('span'), { className: 'fraco', textContent: 'sem arquivo', title: 'ui/icones/' + r.i + '.png não existe (o jogo também fica sem o ícone)' })); };
  const g = Object.values(await carregarGinasios()).filter(x => x?.insignia?.id === r?.id);
  const el = raiz.querySelector('.gins');
  if (el) el.textContent = (r?.gen ? 'geração ' + r.gen + ' · ' : '') + (g.length ? 'dada por: ' + g.map(x => x.nome).join(', ') : 'nenhum ginásio dá esta insígnia');
}
