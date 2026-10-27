/* Painel admin — Fase 2: telas próprias de conteúdo (Missões, Evoluções, Espécies, Learnset). Os outros módulos da Fase 2
 * (Insígnias, Curvas de EXP, Iniciais, Montarias, Golpes, Ginásios) são esquemas do editor genérico ("Arquivos de dados").
 * Cada tela lê e grava pelas MESMAS rotas e esquemas do editor genérico (/admin/dados/<esquema>, admin/esquemas_f2.mjs): a tela
 * valida antes com o mesmo validarColecao que o servidor usa, e o servidor guarda backup de cada gravação (Histórico / Desfazer).
 * A tela de cada aba só é montada no primeiro clique (os arquivos de espécie somam ~1,5 MB). */
import { ESQUEMAS, validarColecao } from '/admin/esquemas.mjs';

export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const copia = v => JSON.parse(JSON.stringify(v));
export const pad = n => String(n).padStart(4, '0');

const TELAS = {
  missoes:   () => import('/admin/conteudo_missoes.mjs'),
  evolucoes: () => import('/admin/conteudo_evolucoes.mjs'),
  especies:  () => import('/admin/conteudo_especies.mjs'),
  learnset:  () => import('/admin/conteudo_learnset.mjs'),
};

/* ── Referências (só leitura, cache): nomes de espécie/item/área/NPC, golpes ─────────────────────────────────────────────── */
const cacheRef = new Map();
const baixar = (url, padrao) => { if (!cacheRef.has(url)) cacheRef.set(url, fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now()).then(r => r.ok ? r.json() : padrao).catch(() => padrao)); return cacheRef.get(url); };
export const ref = {
  /** dex → { nome, tipos } (pokedex.json: a 1ª entrada de cada nº é a forma base) */
  async especies() {
    const p = await baixar('/pokedex.json', { species: [] }), m = new Map();
    for (const s of p.species || []) if (s.n > 0 && !m.has(s.n)) m.set(s.n, { nome: s.name, tipos: s.types || [] });
    return m;
  },
  async itens() { return (await baixar('/data/menus_dados.json', {})).itens || {}; },
  async areas() {
    const c = await baixar('/data/cenas.json', {}), areas = {}, cenas = {};
    for (const ce of c.cenas || []) { cenas[ce.id] = ce.nome; for (const a of ce.areas || []) if (!(a.id in areas)) areas[a.id] = a.nome; }
    return { areas, cenas };
  },
  async npcs() { return await baixar('/data/npcs_glb.json', {}); },
  async dexExtra() { return await baixar('/data/dex_extra.json', { especies: {}, golpes: {} }); },
  async golpes() { return await baixar('/data/golpes.json', {}); },
  async elenco() { return await baixar('/data/elenco.json', []); },
  esquecer(url) { cacheRef.delete(url); },
};
/** <datalist id> com as opções [valor, rótulo] (uma vez por id). */
export function datalist(id, pares) {
  let dl = document.getElementById(id);
  if (!dl) { dl = document.createElement('datalist'); dl.id = id; document.body.append(dl); }
  dl.innerHTML = pares.map(([v, r]) => `<option value="${esc(v)}"${r != null ? ` label="${esc(r)}"` : ''}>`).join('');
  return id;
}

/* ── Campos de formulário ─────────────────────────────────────────────────────────────────────────────────────────────────
   campo({ rotulo, tipo, valor, aoMudar, ... }) → <label>. aoMudar(valor) devolve uma mensagem de erro (fica vermelho e não
   grava) ou nada. valor vazio chega como null. Tipos: texto · area · num · opcao (opcoes [[v, rótulo]]) · bool · nums (lista
   de inteiros "1, 2, 3") · linhas (lista de textos, uma por linha). */
export function campo({ rotulo, tipo = 'texto', valor, aoMudar, opcoes = [], ajuda, lista, min, max, step, max_len, classe, dica, vazio = '(vazio)' }) {
  const lab = document.createElement('label'); if (classe) lab.className = classe;
  let w;
  if (tipo === 'bool') { lab.classList.add('chk'); w = document.createElement('input'); w.type = 'checkbox'; w.checked = !!valor; lab.append(w, ' ' + rotulo); }
  else {
    lab.append(rotulo);
    if (tipo === 'opcao') { w = document.createElement('select'); w.innerHTML = `<option value="">${esc(vazio)}</option>` + opcoes.map(([v, r]) => `<option value="${esc(v)}"${String(v) === String(valor ?? '') ? ' selected' : ''}>${esc(r ?? v)}</option>`).join(''); }
    else if (tipo === 'area' || tipo === 'linhas') { w = document.createElement('textarea'); w.rows = tipo === 'linhas' ? 3 : 4; w.value = tipo === 'linhas' ? (Array.isArray(valor) ? valor.join('\n') : valor ?? '') : valor ?? ''; }
    else {
      w = document.createElement('input'); w.type = tipo === 'num' ? 'number' : 'text';
      if (tipo === 'num') { if (min != null) w.min = min; if (max != null) w.max = max; w.step = step ?? 'any'; }
      w.value = tipo === 'nums' ? (Array.isArray(valor) ? valor.join(', ') : valor ?? '') : valor ?? '';
      if (lista) w.setAttribute('list', lista);
    }
    if (max_len) w.maxLength = max_len;
    lab.append(w);
  }
  if (dica) { const d = document.createElement('span'); d.className = 'dica-campo'; lab.append(d); lab.dica = t => { d.textContent = t || ''; }; lab.dica(typeof dica === 'function' ? dica(valor) : dica); }
  if (ajuda) { const a = document.createElement('span'); a.className = 'ajuda'; a.textContent = ajuda; lab.append(a); }
  const err = document.createElement('span'); err.className = 'erro-campo'; lab.append(err);
  const ler = () => {
    if (tipo === 'bool') return w.checked;
    const s = w.value.trim();
    if (s === '') return null;
    if (tipo === 'num') { const n = Number(s); return Number.isFinite(n) ? n : NaN; }
    if (tipo === 'nums') { const l = s.split(/[,;\s]+/).filter(Boolean).map(Number); return l.some(n => !Number.isInteger(n)) ? NaN : l; }
    if (tipo === 'linhas') return w.value.split('\n').map(x => x.trim()).filter(Boolean);
    if (tipo === 'opcao') { const o = opcoes.find(([v]) => String(v) === w.value); return o ? o[0] : w.value; }
    return tipo === 'area' ? w.value : s;
  };
  w.addEventListener(tipo === 'bool' || tipo === 'opcao' ? 'change' : 'input', () => {
    const v = ler();
    const m = Number.isNaN(v) || (Array.isArray(v) && v.some(Number.isNaN)) ? (tipo === 'nums' ? 'números inteiros separados por vírgula' : 'precisa ser um número')
      : (tipo === 'num' && v != null && ((min != null && v < min) || (max != null && v > max))) ? (min != null && max != null ? `de ${min} a ${max}` : min != null ? `mínimo ${min}` : `máximo ${max}`) : aoMudar?.(v);
    err.textContent = m || ''; w.classList.toggle('invalido', !!m);
    if (lab.dica && typeof dica === 'function' && !m) lab.dica(dica(v));
  });
  lab.entrada = w;
  return lab;
}
/** Põe/tira a chave k do objeto (null/'' = tira). */
export const poe = (o, k, v) => { if (v == null || v === '' || (Array.isArray(v) && !v.length)) delete o[k]; else o[k] = v; };

/* ── Gravar: valida com o esquema (o mesmo do servidor) e manda; devolve true se tudo foi ── */
export async function gravar(api, toast, nome, dados) {
  const esq = ESQUEMAS[nome], v = validarColecao(esq, dados);
  if (!v.ok) { toast(`${esq.titulo}: ${v.erro}`, true); return false; }
  const r = await api('/admin/dados/' + nome, 'POST', { dados: v.v });
  if (!r.ok) { toast(`${esq.titulo}: ${r.erro || 'falha ao salvar'}`, true); return false; }
  return true;
}
export async function ler(api, toast, nome) {
  const r = await api('/admin/dados/' + nome);
  if (!r.ok) { toast(`${ESQUEMAS[nome]?.titulo || nome}: ${r.erro || 'falha ao carregar'}`, true); return null; }
  return r.dados;
}

const CSS = `
.f2 { display: grid; grid-template-columns: 300px 1fr; height: 100%; }
.f2 .col-esq { background: var(--painel); border-right: 1px solid var(--borda); display: grid; grid-template-rows: auto 1fr; min-height: 0; }
.f2 .col-esq .topo { padding: 10px; display: grid; gap: 8px; border-bottom: 1px solid var(--borda); }
.f2 .lista { overflow: auto; padding: 6px; display: grid; gap: 2px; align-content: start; }
.f2 .lista button { display: flex; gap: 8px; justify-content: space-between; align-items: center; text-align: left; background: none; border: 1px solid transparent; padding: 5px 8px; }
.f2 .lista button:hover { background: var(--painel2); }
.f2 .lista button.atual { border-color: var(--azul); background: #23304a; }
.f2 .lista button .n { color: var(--fraco); font-size: 11px; font-variant-numeric: tabular-nums; }
.f2 .lista button.mudou b::after { content: ' ●'; color: var(--acento); }
.f2 .lista button.vazio { opacity: .55; }
.f2 .lista .cap { margin-top: 6px; font-weight: 600; }
.f2 .lista .mis { padding-left: 20px; font-size: 13px; }
.f2 .col-dir { overflow: auto; padding: 16px; display: grid; gap: 14px; align-content: start; }
.f2 .barra-topo { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; position: sticky; top: -16px; z-index: 3; background: var(--bg); padding: 6px 0; }
.f2 .barra-topo h2 { margin: 0 auto 0 0; font-size: 18px; }
.f2 .grade-campos { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px 12px; }
.f2 .grade-campos label, .f2 .form-reg label { display: grid; gap: 4px; font-size: 12px; color: var(--fraco); align-content: start; }
.f2 .grade-campos label.chk { display: flex; color: var(--texto); align-self: end; }
.f2 .grade-campos .larga { grid-column: 1 / -1; }
.f2 textarea { background: #0f131b; border: 1px solid var(--borda); border-radius: 6px; padding: 6px 8px; color: var(--texto); font: 13px/1.45 system-ui, "Segoe UI", sans-serif; resize: vertical; width: 100%; }
.f2 .ajuda { font-size: 11px; color: var(--fraco); }
.f2 .dica-campo { font-size: 11px; color: var(--azul); }
.f2 .erro-campo { font-size: 12px; color: var(--erro); }
.f2 .invalido { border-color: var(--erro) !important; }
.f2 .cartao { background: var(--painel2); border: 1px solid var(--borda); border-radius: 10px; padding: 12px; display: grid; gap: 10px; }
.f2 .cartao > .cab { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.f2 .cartao > .cab b { margin-right: auto; }
.f2 .cartao > .cab button { padding: 3px 8px; }
.f2 .aviso { color: #ffb35c; font-size: 12px; }
.f2 .pilula { display: inline-block; font-size: 11px; padding: 1px 6px; border-radius: 4px; background: #2b3550; margin-right: 4px; }
.f2 table.esp td label { display: grid; gap: 2px; }
.f2 table.esp td input[type=text], .f2 table.esp td input[type=number] { width: 100%; min-width: 80px; }
.f2 .mini { font-size: 12px; color: var(--fraco); }
`;

/** Registra as 4 telas: cada botão #lado [data-vista] monta a sua na primeira vez. ctx = { api, toast, avisarJogo }. */
export function instalarConteudo(ctx) {
  if (!document.getElementById('css-f2')) { const s = document.createElement('style'); s.id = 'css-f2'; s.textContent = CSS; document.head.append(s); }
  const sujas = new Set();
  const ctxTela = { ...ctx, marcarSujo: (tela, sujo) => { if (sujo) sujas.add(tela); else sujas.delete(tela); } };
  for (const [tela, carregar] of Object.entries(TELAS)) {
    const sec = document.getElementById('v-' + tela); if (!sec) continue;
    let montada = false;
    for (const b of document.querySelectorAll(`#lado button[data-vista="${tela}"]`)) b.addEventListener('click', async () => {
      if (montada) return; montada = true;
      sec.classList.add('f2'); sec.innerHTML = '<div class="caixa fraco" style="margin:16px">carregando…</div>';
      try { (await carregar()).montar(sec, { ...ctxTela, tela }); }
      catch (e) { console.error(e); montada = false; sec.innerHTML = `<div class="caixa" style="margin:16px">Falha ao abrir: ${esc(e.message)}</div>`; }
    });
  }
  addEventListener('beforeunload', e => { if (sujas.size) { e.preventDefault(); e.returnValue = ''; } });
}
