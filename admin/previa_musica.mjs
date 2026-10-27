/* Prévia das Músicas por área (esquema musicas, Fase 3): uma tabela amigável por cima dos campos JSON — cada área/interior com
 * o nome que o jogador vê (data/cenas.json), a faixa num seletor (só as que existem em som/, lista do servidor) e ▶ pra ouvir.
 * Mudar aqui escreve no campo JSON do formulário (que valida e marca "não salvo"); mudar o JSON à mão redesenha a tabela. */
import { recurso, escreverCampo, nomesDeLugares } from '/admin/recursos.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let raiz = null, caixa = null, reg = null, assinatura = '', tocando = null;
const audio = new Audio(); audio.volume = 0.6;
audio.addEventListener('ended', () => { tocando = null; marcarTocando(); });
const CSS = `.previa-musica h4{margin:12px 0 6px;font-size:12px;color:var(--fraco);text-transform:uppercase;letter-spacing:.06em}
.previa-musica table{width:100%;border-collapse:collapse;font-size:12px}.previa-musica td{padding:3px 4px;border-bottom:1px solid #222838}
.previa-musica select{width:100%}.previa-musica .falta{color:var(--erro)}.previa-musica button{padding:2px 8px}
.previa-musica .rolar{max-height:280px;overflow:auto;border:1px solid var(--borda);border-radius:8px}`;

export function mostrar(cx, r) {
  if (!raiz) {
    raiz = document.createElement('div'); raiz.className = 'previa-musica';
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    raiz.addEventListener('change', aoMudar); raiz.addEventListener('click', aoClicar);
  }
  caixa = cx; cx.prepend(raiz); assinatura = '';
  atualizar(r);
}
export async function atualizar(r) {
  reg = r;
  const s = JSON.stringify([r?.areas, r?.cenas, r?.padrao, r?.batalha, r?.login]);
  if (s === assinatura) return;                                           // a mudança veio daqui mesmo: a tabela já está certa
  assinatura = s;
  const [{ faixas = [] }, lugares] = await Promise.all([recurso('faixas'), nomesDeLugares()]);
  if (reg !== r) return;
  const opcoes = sel => {
    const lista = sel && !faixas.includes(sel) ? [sel, ...faixas] : faixas;
    return lista.map(f => `<option value="${esc(f)}"${f === sel ? ' selected' : ''}>${esc(f)}${faixas.includes(f) ? '' : ' (não existe)'}</option>`).join('');
  };
  const linha = (grupo, id, nome, f) => `<tr data-g="${grupo}" data-id="${esc(id)}"><td style="width:42%">${esc(nome)} <span class="fraco">${esc(id)}</span></td>
    <td><select>${opcoes(f)}</select></td><td style="white-space:nowrap"><button type="button" class="tocar" data-f="${esc(f)}">▶</button>${grupo === 'areas' || grupo === 'cenas' ? '<button type="button" class="tirar perigo" title="Tirar (usa a padrão)">✕</button>' : ''}</td></tr>`;
  const faltando = [...Object.values(r?.areas || {}), ...Object.values(r?.cenas || {}), ...Object.values(r?.padrao || {}), ...Object.values(r?.batalha || {}), r?.login].filter(f => f && !faixas.includes(f));
  const semFaixa = (grupo, nomes) => Object.entries(nomes).filter(([id]) => /^\d+$/.test(id) && !(id in (r?.[grupo] || {})));
  raiz.innerHTML = `
    ${faltando.length ? `<div class="previa-info aviso">⚠ ${new Set(faltando).size} faixa(s) citadas não existem em som/ (${esc([...new Set(faltando)].join(', '))}) — no jogo essas ficam em silêncio.</div>` : ''}
    <h4>Padrão e batalhas</h4>
    <table>${['area', 'interior'].map(k => linha('padrao', k, k === 'area' ? 'Área sem faixa própria' : 'Interior sem faixa própria', r?.padrao?.[k])).join('')}
      ${['treinador', 'ginasio', 'elite'].map(k => linha('batalha', k, 'Batalha: ' + { treinador: 'treinador', ginasio: 'ginásio', elite: 'Elite Four' }[k], r?.batalha?.[k])).join('')}
      ${linha('login', 'login', 'Tela de login', r?.login)}</table>
    <h4>Áreas de Kanto (${Object.keys(r?.areas || {}).length})</h4>
    <div class="rolar"><table>${Object.entries(r?.areas || {}).map(([id, f]) => linha('areas', id, lugares.areas[id] || 'Área ' + id, f)).join('')}</table></div>
    <div class="add-esp"><select class="add" data-g="areas"><option value="">+ faixa pra outra área…</option>${semFaixa('areas', lugares.areas).map(([id, n]) => `<option value="${id}">${esc(n)} (${id})</option>`).join('')}</select></div>
    <h4>Interiores (${Object.keys(r?.cenas || {}).length})</h4>
    <div class="rolar"><table>${Object.entries(r?.cenas || {}).map(([id, f]) => linha('cenas', id, lugares.cenas[id] || 'Cena ' + id, f)).join('')}</table></div>
    <div class="add-esp"><select class="add" data-g="cenas"><option value="">+ faixa pra outro interior…</option>${semFaixa('cenas', lugares.cenas).map(([id, n]) => `<option value="${id}">${esc(n)} (${id})</option>`).join('')}</select></div>
    <div class="fraco" style="font-size:11px;margin-top:6px">${faixas.length} faixas em som/. Mudanças aqui vão pros campos abaixo — depois é só Salvar.</div>`;
  marcarTocando();
}

function escrever(grupo, mexer) {
  if (grupo === 'login') { escreverCampo(caixa, 'login', mexer(reg?.login)); return; }
  const novo = { ...(reg?.[grupo] || {}) }; mexer(novo);
  escreverCampo(caixa, grupo, novo);
}
function aoMudar(ev) {
  const el = ev.target;
  if (el.classList.contains('add')) {
    const id = el.value; if (!id) return;
    escrever(el.dataset.g, o => { o[id] = (el.dataset.g === 'areas' ? reg?.padrao?.area : reg?.padrao?.interior) || 'bg/sound_road1'; });
    assinatura = ''; atualizar(reg); return;
  }
  const tr = el.closest('tr[data-g]'); if (!tr || el.tagName !== 'SELECT') return;
  const { g, id } = tr.dataset, f = el.value;
  if (g === 'login') escrever('login', () => f); else escrever(g, o => { o[id] = f; });
  assinatura = JSON.stringify([reg?.areas, reg?.cenas, reg?.padrao, reg?.batalha, reg?.login]);   // a tabela já mostra isto
  tr.querySelector('.tocar').dataset.f = f;
}
function aoClicar(ev) {
  const b = ev.target.closest('button'); if (!b) return;
  const tr = b.closest('tr[data-g]');
  if (b.classList.contains('tirar') && tr) { escrever(tr.dataset.g, o => { delete o[tr.dataset.id]; }); assinatura = ''; atualizar(reg); return; }
  if (b.classList.contains('tocar')) {
    const f = b.dataset.f;
    if (tocando === f) { audio.pause(); tocando = null; }
    else { audio.src = '/som/' + f + '.ogg'; audio.play().then(() => { tocando = f; marcarTocando(); }).catch(() => { tocando = null; marcarTocando(); b.textContent = '⚠'; }); }
    marcarTocando();
  }
}
function marcarTocando() { for (const b of raiz?.querySelectorAll('button.tocar') || []) b.textContent = b.dataset.f && b.dataset.f === tocando ? '■' : '▶'; }
