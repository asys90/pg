/* Painel admin — "Arquivos de dados" (editor genérico guiado por esquema) e "Histórico / Desfazer". Fase 0.
 * Tabela e formulário saem de admin/esquemas.mjs — os mesmos esquemas que o servidor usa pra validar, então o erro aparece no
 * campo antes de salvar e o servidor recusa o mesmo que a tela recusa. Registrar um arquivo novo = escrever um esquema. */
import { ESQUEMAS, validarCampo, validarColecao } from '/admin/esquemas.mjs';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const copia = v => JSON.parse(JSON.stringify(v));
const MAX_LINHAS = 300;
const tamanho = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
const fmt = (c, v) => v === undefined || v === null ? '' : c.resumo ? String(c.resumo(v)) : c.tipo === 'bool' ? (v ? '✓' : '') : c.tipo === 'opcao' ? String(c.opcoes.find(o => String(o.v) === String(v))?.rotulo ?? v)
  : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? '{…}' : String(v);
/* Prévia por esquema (esq.previa = caminho de um módulo com mostrar(caixa, registro) e atualizar(registro)): ex. o modelo 3D
   da skin. Carrega uma vez só; erro na prévia nunca derruba o editor. */
const previas = new Map();
const previaDe = caminho => { if (!previas.has(caminho)) previas.set(caminho, import(caminho).catch(e => { console.warn('prévia:', e); previas.delete(caminho); return null; })); return previas.get(caminho); };
/* NOMES DOS ITENS (esq.usaItens): campo com `item: true` mostra o nome ao lado do número e sugere da lista (datalist); as
   colunas calculadas (esq.colunas) recebem `ctx.item(id)`. Carrega o menus_dados.json do jogo uma vez, quando precisa. */
let itensJogo = null;
async function carregarItens() {
  if (itensJogo) return itensJogo;
  itensJogo = (await fetch('/data/menus_dados.json').then(r => r.json()).catch(() => ({}))).itens || {};
  const dl = document.createElement('datalist'); dl.id = 'dl-d-itens';
  dl.innerHTML = Object.entries(itensJogo).map(([id, i]) => `<option value="${id}" label="${esc(i.n)}">`).join('');
  document.body.append(dl);
  return itensJogo;
}
const nomeItem = id => id == null || id === '' ? '' : itensJogo?.[id]?.n || '(item ' + id + ' não existe)';
const ctxColuna = { item: nomeItem };
/** Colunas da tabela: as calculadas do esquema (esq.colunas = [{ rotulo, valor(registro, ctx) }]) ou os campos marcados `col`. */
const colunasDe = e => e.colunas || e.campos.filter(c => c.col).map(c => ({ rotulo: c.rotulo, valor: r => fmt(c, r?.[c.k]) }));

/** avisarJogo(arquivo, cenario?) — avisa a aba do jogo (BroadcastChannel) que um arquivo mudou. */
export function instalarDados({ api, toast, avisarJogo }) {
  let nomeAtual = null, esq = null, dados = null, sel = null, sujo = false, filtro = '';

  // ── Lista de arquivos ────────────────────────────────────────────────────────
  function renderLista() {
    // Fase 2: esquema com `tela` é editado numa tela própria — aparece uma vez (o marcado `naLista`) e o clique leva pra ela
    $('d-lista').innerHTML = Object.entries(ESQUEMAS).filter(([, e]) => !e.tela || e.naLista).map(([nome, e]) =>
      `<button data-nome="${nome}" class="${nome === nomeAtual ? 'atual' : ''}"><b>${esc(e.titulo)}${e.tela ? ' ↗' : ''}</b><small>${esc(e.descricao || e.arquivo + '.json')}</small></button>`).join('');
    for (const b of $('d-lista').querySelectorAll('button')) b.onclick = () => { const t = ESQUEMAS[b.dataset.nome].tela; if (t) document.querySelector(`#lado button[data-vista="${t}"]`)?.click(); else abrir(b.dataset.nome); };
  }
  async function abrir(nome) {
    if (sujo && !confirm('Há alterações não salvas. Descartar?')) return;
    const [r] = await Promise.all([api('/admin/dados/' + nome), ESQUEMAS[nome]?.usaItens ? carregarItens() : null]);
    if (!r.ok) { toast(r.erro || 'Falha ao carregar.', true); return; }
    nomeAtual = nome; esq = ESQUEMAS[nome]; dados = copia(r.dados); sel = null; sujo = false; filtro = '';
    renderLista(); render();
  }
  const marcar = () => { sujo = true; const s = $('d-sujo'); if (s) s.hidden = false; };
  const ids = () => esq.forma === 'mapa' ? Object.keys(dados) : dados.map((_, i) => i);
  const reg = id => dados[id];

  // ── Editor ───────────────────────────────────────────────────────────────────
  function render() {
    const total = esq.forma === 'objeto' ? '' : `<span class="fraco" id="d-total"></span>`;
    $('d-edit').innerHTML = `
      <div class="topo-edit"><h2>${esc(esq.titulo)}</h2>${total}
        <span class="sujo" id="d-sujo" ${sujo ? '' : 'hidden'}>● não salvo</span>
        <button id="d-descartar">Descartar</button><button class="prim" id="d-salvar">Salvar</button></div>
      <div class="fraco">${esc(esq.descricao || '')} Arquivo: <code>public/data/${esc(esq.arquivo)}.json${esq.caminho ? ' → ' + esc(esq.caminho) : ''}</code>.
        ${esq.recarga === 'vivo' ? 'O jogo aplica na hora.' : 'Depois de salvar, recarregue o jogo (Ctrl+Shift+R).'}</div>
      <div id="d-corpo"></div>`;
    $('d-salvar').onclick = salvar;
    $('d-descartar').onclick = () => { if (!sujo || confirm('Descartar as alterações?')) { sujo = false; abrir(nomeAtual); } };
    if (esq.forma === 'objeto') {
      const caixa = document.createElement('div'); caixa.className = 'caixa'; $('d-corpo').append(caixa);
      const prev = esq.previa ? previaDe(esq.previa) : null;                      // Fase 3: prévia também no arquivo-objeto (músicas, raid)
      formulario(caixa, dados, () => prev?.then(m => m?.atualizar(dados)));
      prev?.then(m => { if (m && caixa.isConnected) m.mostrar(caixa, dados); });
    }
    else renderTabela();
  }

  function renderTabela() {
    const cols = colunasDe(esq), cel = (c, id) => { try { return String(c.valor(reg(id), ctxColuna) ?? ''); } catch { return ''; } };
    $('d-total').textContent = ids().length + ' registro(s)';
    const lista = ids().filter(id => {
      if (!filtro) return true;
      return [esq.forma === 'mapa' ? id : '', ...cols.map(c => cel(c, id))].join(' ').toLowerCase().includes(filtro);
    });
    const corpo = $('d-corpo'), rolagem = corpo.querySelector('.rolagem')?.scrollTop || 0;   // clicar numa linha refaz a tabela: sem isto ela voltava pro topo
    corpo.innerHTML = `
      <div class="topo-edit"><input type="search" id="d-busca" placeholder="filtrar…" value="${esc(filtro)}" style="flex:1"><button id="d-novo">＋ Novo</button></div>
      <div class="grade">
        <div class="rolagem"><table class="dados"><thead><tr>${esq.forma === 'mapa' ? '<th>ID</th>' : ''}${cols.map(c => `<th>${esc(c.rotulo)}</th>`).join('')}</tr></thead>
          <tbody>${lista.slice(0, MAX_LINHAS).map(id => `<tr data-id="${esc(id)}" class="${String(id) === String(sel) ? 'atual' : ''}">${esq.forma === 'mapa' ? `<td>${esc(id)}</td>` : ''}${cols.map(c => `<td>${esc(cel(c, id))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <div class="caixa" id="d-form">${sel == null ? '<span class="fraco">Clique numa linha pra editar.</span>' : ''}</div>
      </div>
      ${lista.length > MAX_LINHAS ? `<div class="fraco">Mostrando ${MAX_LINHAS} de ${lista.length} — use o filtro.</div>` : ''}`;
    corpo.querySelector('.rolagem').scrollTop = rolagem;
    const busca = $('d-busca');
    busca.oninput = () => { filtro = busca.value.toLowerCase(); renderTabela(); const b = $('d-busca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); };
    $('d-novo').onclick = novo;
    for (const tr of corpo.querySelectorAll('tbody tr')) tr.onclick = () => { sel = esq.forma === 'mapa' ? tr.dataset.id : +tr.dataset.id; renderTabela(); };
    if (sel != null && reg(sel)) {
      const f = $('d-form');
      f.innerHTML = `<div class="topo-edit"><h3 style="margin:0;margin-right:auto">${esq.forma === 'mapa' ? 'ID ' + esc(sel) : 'Linha ' + (sel + 1)}</h3><button id="d-dup">Duplicar</button><button class="perigo" id="d-del">Excluir</button></div>`;
      const caixa = document.createElement('div'); f.append(caixa);
      const r = reg(sel), prev = esq.previa ? previaDe(esq.previa) : null;
      (esq.registroLista ? formularioLista : formulario)(caixa, r, () => { atualizarLinha(sel); prev?.then(m => m?.atualizar(r)); });
      prev?.then(m => { if (m && caixa.isConnected) m.mostrar(caixa, r); });
      $('d-dup').onclick = duplicar; $('d-del').onclick = excluir;
    }
  }
  function atualizarLinha(id) {   // só a linha da tabela (refazer tudo tiraria o foco do campo que está sendo digitado)
    const tr = [...($('d-corpo')?.querySelectorAll('tbody tr') || [])].find(t => t.dataset.id === String(id)); if (!tr) return;
    const cols = colunasDe(esq), off = esq.forma === 'mapa' ? 1 : 0, r = reg(id);
    cols.forEach((c, i) => { if (tr.children[i + off]) { let t = ''; try { t = String(c.valor(r, ctxColuna) ?? ''); } catch {} tr.children[i + off].textContent = t; } });
  }

  /* Registro que é uma LISTA (esq.registroLista, ex.: uma loja = lista de produtos): uma linha por elemento e uma coluna por
     campo; cada célula valida na hora, como no formulário normal. Campo `item: true` mostra o nome do item embaixo. */
  function formularioLista(cont, lista, aoMudar) {
    const celula = (c, v) => {
      let w;
      if (c.tipo === 'bool') { w = document.createElement('input'); w.type = 'checkbox'; w.checked = !!v; }
      else if (c.tipo === 'opcao') { w = document.createElement('select'); w.innerHTML = c.opcoes.map(o => `<option value="${esc(o.v)}"${String(o.v) === String(v) ? ' selected' : ''}>${esc(o.rotulo ?? o.v)}</option>`).join(''); }
      else {
        w = document.createElement('input'); w.type = c.tipo === 'num' ? 'number' : 'text'; w.value = v ?? '';
        if (c.tipo === 'num') { if (c.min != null) w.min = c.min; if (c.max != null) w.max = c.max; w.step = c.int ? '1' : 'any'; }
        if (c.item) w.setAttribute('list', 'dl-d-itens');
      }
      return w;
    };
    const pintar = () => {
      cont.innerHTML = `<div class="rolagem" style="max-height:52vh"><table class="esp d-sublista"><thead><tr><th>#</th>${esq.campos.map(c => `<th title="${esc(c.ajuda || '')}">${esc(c.rotulo)}${c.obrigatorio ? ' *' : ''}</th>`).join('')}<th></th></tr></thead><tbody></tbody></table></div>
        <div class="acoes" style="margin-top:8px"><button class="d-add">＋ Linha</button><span class="fraco" style="font-size:12px">${lista.length} item(ns)${esq.ajudaLista ? ' · ' + esc(esq.ajudaLista) : ''}</span></div>`;
      const tb = cont.querySelector('tbody');
      lista.forEach((el, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="fraco">${i + 1}</td>`;
        for (const c of esq.campos) {
          const td = document.createElement('td'), w = celula(c, el[c.k]), nome = document.createElement('div');
          nome.className = 'ajuda'; if (c.item) nome.textContent = nomeItem(el[c.k]);
          td.append(w, nome); tr.append(td);
          w.addEventListener(c.tipo === 'bool' || c.tipo === 'opcao' ? 'change' : 'input', () => {
            const bruto = c.tipo === 'bool' ? w.checked : w.value;
            if (bruto === '') { if (c.obrigatorio) { w.classList.add('invalido'); w.title = 'obrigatório'; return; } delete el[c.k]; }
            else { const r = validarCampo(c, bruto); if (!r.ok) { w.classList.add('invalido'); w.title = r.erro; return; } el[c.k] = r.v; }
            w.classList.remove('invalido'); w.title = '';
            if (c.item) nome.textContent = nomeItem(el[c.k]);
            marcar(); aoMudar?.();
          });
        }
        const acoes = document.createElement('td'); acoes.style.whiteSpace = 'nowrap';
        acoes.innerHTML = '<button title="Subir">↑</button><button title="Descer">↓</button><button class="perigo" title="Tirar">✕</button>';
        const [sobe, desce, tira] = acoes.querySelectorAll('button');
        sobe.onclick = () => { if (i > 0) { [lista[i - 1], lista[i]] = [lista[i], lista[i - 1]]; marcar(); aoMudar?.(); pintar(); } };
        desce.onclick = () => { if (i < lista.length - 1) { [lista[i + 1], lista[i]] = [lista[i], lista[i + 1]]; marcar(); aoMudar?.(); pintar(); } };
        tira.onclick = () => { lista.splice(i, 1); marcar(); aoMudar?.(); pintar(); };
        tr.append(acoes); tb.append(tr);
      });
      cont.querySelector('.d-add').onclick = () => {
        const el = {}; for (const c of esq.campos) if (c.padrao !== undefined) el[c.k] = c.padrao;
        lista.push(el); marcar(); aoMudar?.(); pintar();
        const ult = cont.querySelector('tbody tr:last-child input'); ult?.focus(); cont.querySelector('.rolagem').scrollTop = 1e9;
      };
    };
    pintar();
  }

  // Um campo por item do esquema. O valor só entra no registro se passar na validação; inválido fica vermelho e trava o salvar.
  function formulario(cont, r, aoMudar) {
    cont.classList.add('form-reg');
    for (const c of esq.campos) {
      const lab = document.createElement('label'), v = r[c.k];
      lab.dataset.k = c.k;                                                          // Fase 3: a prévia acha o campo (ex.: seletor de cor → JSON da tinta)
      let w;
      if (c.tipo === 'bool') { lab.className = 'chk'; w = document.createElement('input'); w.type = 'checkbox'; w.checked = !!v; lab.append(w, ' ' + c.rotulo); }
      else {
        lab.append(c.rotulo + (c.obrigatorio ? ' *' : ''));
        if (c.tipo === 'opcao') {
          w = document.createElement('select');
          w.innerHTML = '<option value="">(vazio)</option>' + c.opcoes.map(o => `<option value="${esc(o.v)}"${String(o.v) === String(v) ? ' selected' : ''}>${esc(o.rotulo ?? o.v)}</option>`).join('');
        } else if (c.tipo === 'json' || c.tipo === 'linhas' || (c.tipo === 'texto' && c.area)) {   // texto com `area` = descrição longa
          w = document.createElement('textarea');
          if (c.tipo === 'texto' && c.max) w.maxLength = c.max;
          w.value = v === undefined ? '' : c.tipo === 'linhas' ? (Array.isArray(v) ? v.join('\n') : '') : c.tipo === 'json' ? JSON.stringify(v, null, 1) : v;
          w.rows = c.tipo === 'json' ? 6 : 3;
        } else {
          w = document.createElement('input');
          w.type = c.tipo === 'num' ? 'number' : 'text';
          if (c.tipo === 'num') { if (c.min != null) w.min = c.min; if (c.max != null) w.max = c.max; w.step = c.int ? '1' : 'any'; }
          if (c.tipo === 'texto' && c.max) w.maxLength = c.max;
          w.value = v === undefined ? '' : c.tipo === 'numeros' ? (Array.isArray(v) ? v.join(', ') : '') : v;
        }
        lab.append(w);
      }
      if (c.ajuda) { const a = document.createElement('span'); a.className = 'ajuda'; a.textContent = c.ajuda; lab.append(a); }
      const err = document.createElement('span'); err.className = 'erro-campo'; lab.append(err);
      const ruim = m => { err.textContent = m; w.classList.add('invalido'); };
      const aplicar = () => {
        let bruto;
        if (c.tipo === 'bool') bruto = w.checked;
        else if (c.tipo === 'linhas') bruto = w.value.trim() === '' ? '' : w.value.split('\n').map(s => s.trim()).filter(Boolean);
        else if (c.tipo === 'json') { if (w.value.trim() === '') bruto = ''; else { try { bruto = JSON.parse(w.value); } catch { ruim('JSON inválido'); return; } } }
        else bruto = w.value;
        if (bruto === '') {
          if (c.obrigatorio) { ruim('obrigatório'); return; }
          delete r[c.k];
        } else {
          const res = validarCampo(c, bruto);
          if (!res.ok) { ruim(res.erro); return; }
          r[c.k] = res.v;
        }
        err.textContent = ''; w.classList.remove('invalido'); marcar(); aoMudar?.();
      };
      w.addEventListener(c.tipo === 'bool' || c.tipo === 'opcao' ? 'change' : 'input', aplicar);
      cont.append(lab);
    }
  }

  // ── Operações na coleção ─────────────────────────────────────────────────────
  const proximoId = () => { const ns = dados.map(r => +r[esq.id]).filter(Number.isFinite); return ns.length ? Math.max(...ns) + 1 : 1; };
  function novo() {
    if (esq.forma === 'mapa') {
      const id = prompt('ID do novo registro (' + (esq.idAjuda || 'letras, números, _ ou -') + '):'); if (!id) return;
      if (!(esq.idValido || /^[\w-]{1,40}$/).test(id)) { toast('ID inválido' + (esq.idAjuda ? ': ' + esq.idAjuda : '') + '.', true); return; }
      if (dados[id]) { toast('Esse ID já existe.', true); return; }
      dados[id] = esq.registroLista ? [] : {}; sel = id;
    } else {
      const r = {}; if (esq.id) r[esq.id] = proximoId();
      dados.push(r); sel = dados.length - 1;
    }
    filtro = ''; marcar(); renderTabela();
  }
  function duplicar() {
    if (sel == null) return;
    const c = copia(reg(sel));
    if (esq.forma === 'mapa') {
      const id = prompt('ID da cópia:', sel + '_copia'); if (!id) return;
      if (!(esq.idValido || /^[\w-]{1,40}$/).test(id) || dados[id]) { toast('ID inválido ou já existe' + (esq.idAjuda ? ' (' + esq.idAjuda + ')' : '') + '.', true); return; }
      dados[id] = c; sel = id;
    } else {
      if (esq.id) c[esq.id] = proximoId();
      dados.splice(sel + 1, 0, c); sel += 1;
    }
    marcar(); renderTabela();
  }
  function excluir() {
    if (sel == null || !confirm('Excluir este registro?')) return;
    if (esq.forma === 'mapa') delete dados[sel]; else dados.splice(sel, 1);
    sel = null; marcar(); renderTabela();
  }
  async function salvar() {
    if (document.querySelector('#d-edit .invalido')) { toast('Corrija os campos em vermelho antes de salvar.', true); return; }
    const v = validarColecao(esq, dados);
    if (!v.ok) { toast(v.erro, true); return; }
    const r = await api('/admin/dados/' + nomeAtual, 'POST', { dados });
    if (!r.ok) { toast(r.erro || 'Falha ao salvar.', true); return; }
    sujo = false; const s = $('d-sujo'); if (s) s.hidden = true;
    toast(`${esq.titulo}: salvo (${r.total} registro(s)).`);
    avisarJogo(esq.arquivo);
  }

  // ── Histórico / Desfazer ─────────────────────────────────────────────────────
  async function renderHistorico() {
    const cont = $('v-historico');
    cont.innerHTML = '<div class="caixa fraco">carregando…</div>';
    const r = await api('/admin/backups');
    if (!r.ok) { cont.innerHTML = `<div class="caixa">${esc(r.erro || 'Falha ao listar.')}</div>`; return; }
    const chaves = Object.keys(r.arquivos).sort();
    cont.innerHTML = `
      <div class="topo-edit"><h2>Histórico / Desfazer</h2><button id="h-atualizar">Atualizar</button></div>
      <div class="fraco">Cada vez que o painel salva, a versão anterior fica guardada aqui (30 por arquivo; 8 por GLB de cenário).
        Restaurar volta o arquivo àquela versão, e a versão atual também é guardada — dá pra desfazer o desfazer.</div>
      ${chaves.length ? '' : '<div class="caixa fraco">Nenhum backup ainda.</div>'}
      ${chaves.map(k => `<div class="caixa" data-arquivo="${esc(k)}"><h3>${esc(k)} <span class="fraco">(${r.arquivos[k].length})</span></h3>
        <table class="dados backups"><thead><tr><th>Versão de</th><th>Tamanho</th><th></th></tr></thead><tbody>
        ${r.arquivos[k].map(b => `<tr><td>${esc(new Date(b.data).toLocaleString('pt-BR'))}</td><td>${tamanho(b.bytes)}</td><td><button data-nome="${esc(b.nome)}" data-quando="${esc(new Date(b.data).toLocaleString('pt-BR'))}">Restaurar</button></td></tr>`).join('')}
        </tbody></table></div>`).join('')}`;
    $('h-atualizar').onclick = renderHistorico;
    for (const b of cont.querySelectorAll('button[data-nome]')) b.onclick = () => restaurar(b.dataset.nome, b.closest('[data-arquivo]').dataset.arquivo, b.dataset.quando);
  }
  async function restaurar(nome, arquivo, quando) {
    if (!confirm(`Restaurar ${arquivo} para a versão de ${quando}?\nA versão atual vai pro histórico (dá pra voltar).`)) return;
    const r = await api('/admin/backups/restaurar', 'POST', { nome });
    if (!r.ok) { toast(r.erro || 'Falha ao restaurar.', true); return; }
    toast(`${arquivo} restaurado.` + (['zonas_spawn', 'habitats'].includes(r.arquivo) ? ' Recarregue esta página pra ver nas telas de Mapa/Habitats.' : ''));
    avisarJogo(r.arquivo, r.tipo === 'glb');
    if (nomeAtual && ESQUEMAS[nomeAtual]?.arquivo === r.arquivo) { sujo = false; abrir(nomeAtual); }
    renderHistorico();
  }

  for (const b of document.querySelectorAll('#lado button[data-vista="historico"]')) b.addEventListener('click', renderHistorico);
  addEventListener('beforeunload', e => { if (sujo) { e.preventDefault(); e.returnValue = ''; } });
  renderLista();
}
