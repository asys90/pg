/* Painel admin — tela Missões (Fase 2). Edita data/missoes.json → capitulos (esquema `missoes` do esquemas_f2.mjs), a fonte que o
 * jogo (missoes.mjs) e o servidor (MISSOES, relido quando o arquivo muda) usam. Capítulo → missões → passos e recompensa.
 * O save do jogador guarda o id da missão atual e o NÚMERO do passo: mexer na ordem dos passos de uma missão em andamento muda o
 * passo em que a pessoa está (o servidor só corrige quando a missão some ou o passo passa do fim). */
import { esc, copia, campo, poe, gravar, ler, ref, datalist } from '/admin/conteudo.mjs';
import { TIPOS_PASSO } from '/admin/esquemas_f2.mjs';

/** Que campos cada tipo de passo usa (além de texto e onde) — os mesmos que o missoes.mjs confere. */
const CAMPOS_PASSO = {
  falar: ['cfg', 'fala'], entregar: ['cfg', 'item', 'n', 'fala'], item: ['item', 'n'], ir: ['area'], capturar: ['n', 'dex'],
  derrotar: ['selvagem', 'n', 'area', 'cfg', 'dex'], nivel: ['lv'], inicial: [], curar: ['cena', 'cfg'], insignia: ['n'],
};
const PADRAO_PASSO = { capturar: { n: 1 }, derrotar: { selvagem: true, n: 1 }, nivel: { lv: 10 }, insignia: { n: 1 } };

export async function montar(sec, { api, toast, avisarJogo, marcarSujo, tela }) {
  const [itens, { areas, cenas }, npcs] = await Promise.all([ref.itens(), ref.areas(), ref.npcs()]);
  datalist('dl-f2-itens', Object.entries(itens).map(([id, i]) => [id, i.n]));
  datalist('dl-f2-areas', Object.entries(areas).map(([id, n]) => [id, n]));
  datalist('dl-f2-npcs', Object.entries(npcs).map(([id, n]) => [id, n.nome]));
  const nomeItem = id => id == null ? '' : itens[id]?.n || `⚠ o item ${id} não existe`;
  const nomeNpc = v => (Array.isArray(v) ? v : v == null ? [] : [v]).map(c => npcs[c]?.nome || `NPC ${c}`).join(', ');

  let caps = [], orig = '[]', sel = null, filtro = '';                      // sel = { c } (capítulo) ou { c, m } (missão)
  const comBolas = new WeakSet();                                           // missões em que o GM abriu a tabela "bolsa de bolas"
  sec.innerHTML = `
    <div class="col-esq"><div class="topo"><input type="search" class="busca" placeholder="filtrar missões…">
      <div class="acoes"><button data-a="cap">＋ Capítulo</button><button data-a="mis">＋ Missão</button></div></div><div class="lista"></div></div>
    <div class="col-dir"><div class="barra-topo"><h2>Missões</h2><span class="sujo" hidden>● não salvo</span><button data-a="descartar">Descartar</button><button class="prim" data-a="salvar">Salvar</button></div>
      <div class="fraco">A história em capítulos: cada missão tem passos (o jogo confere sozinho) e uma recompensa paga no fim. Arquivo
        <code>public/data/missoes.json</code> — o mesmo que o jogo e o servidor leem (o servidor relê quando muda; o jogo, no F5).
        O save guarda o <b>id</b> da missão e o <b>número</b> do passo: trocar o id ou a ordem dos passos de uma missão que alguém está fazendo muda o progresso dele.</div>
      <div class="editor"></div></div>`;
  const $ = s => sec.querySelector(s), lista = $('.lista'), editor = $('.editor');
  const marcar = () => { const s = JSON.stringify(caps) !== orig; $('.sujo').hidden = !s; marcarSujo(tela, s); };
  const mudou = () => { marcar(); renderLista(); };

  async function carregar() {
    const d = await ler(api, toast, 'missoes'); if (!d) return;
    caps = copia(d); orig = JSON.stringify(caps); sel = caps.length ? { c: 0 } : null;
    marcar(); renderLista(); renderEditor();
  }

  // ── Lista (capítulos e missões) ──────────────────────────────────────────────────────────────────────────────────────────
  function renderLista() {
    const f = filtro, linhas = [];
    caps.forEach((c, ci) => {
      const ms = c.missoes.map((m, mi) => ({ m, mi })).filter(({ m }) => !f || `${m.id} ${m.nome} ${m.des || ''}`.toLowerCase().includes(f));
      if (f && !ms.length && !`${c.id} ${c.nome}`.toLowerCase().includes(f)) return;
      linhas.push(`<button class="cap ${sel && sel.c === ci && sel.m == null ? 'atual' : ''}" data-c="${ci}"><b>Cap. ${esc(c.id)} — ${esc(c.nome)}</b><span class="n">${c.missoes.length}</span></button>`);
      for (const { m, mi } of ms) linhas.push(`<button class="mis ${sel && sel.c === ci && sel.m === mi ? 'atual' : ''}" data-c="${ci}" data-m="${mi}"><span>${esc(m.nome)}</span><span class="n">${esc(m.id)} · ${m.passos.length}p</span></button>`);
    });
    lista.innerHTML = linhas.join('') || '<div class="fraco" style="padding:8px">Nada encontrado.</div>';
    for (const b of lista.querySelectorAll('button')) b.onclick = () => { sel = { c: +b.dataset.c, ...(b.dataset.m != null ? { m: +b.dataset.m } : {}) }; renderLista(); renderEditor(); };
  }

  // ── Editor ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const grade = () => { const g = document.createElement('div'); g.className = 'grade-campos'; return g; };
  const cartao = (titulo, botoes = []) => {
    const c = document.createElement('div'); c.className = 'cartao';
    const cab = document.createElement('div'); cab.className = 'cab'; cab.innerHTML = `<b>${titulo}</b>`;
    for (const [rot, fn, cls] of botoes) { const b = document.createElement('button'); b.textContent = rot; if (cls) b.className = cls; b.onclick = fn; cab.append(b); }
    c.append(cab); return c;
  };
  const mover = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return false; [arr[i], arr[j]] = [arr[j], arr[i]]; return true; };

  function renderEditor() {
    editor.innerHTML = '';
    if (!sel || !caps[sel.c]) { editor.innerHTML = '<div class="caixa fraco">Escolha um capítulo ou uma missão à esquerda.</div>'; return; }
    const c = caps[sel.c];
    if (sel.m == null) {                                                    // ── capítulo
      const k = cartao(`Capítulo ${esc(c.id)}`, [
        ['↑', () => { if (mover(caps, sel.c, -1)) { sel.c--; mudou(); renderEditor(); } }],
        ['↓', () => { if (mover(caps, sel.c, 1)) { sel.c++; mudou(); renderEditor(); } }],
        ['Excluir capítulo', () => { if (!confirm(`Excluir o capítulo "${c.nome}"${c.missoes.length ? ` e as ${c.missoes.length} missões dele` : ''}?`)) return; caps.splice(sel.c, 1); sel = caps.length ? { c: Math.max(0, sel.c - 1) } : null; mudou(); renderEditor(); }, 'perigo'],
      ]);
      const g = grade();
      g.append(
        campo({ rotulo: 'ID do capítulo', tipo: 'num', valor: c.id, min: 1, max: 99999, step: 1, aoMudar: v => { if (!Number.isInteger(v)) return 'número inteiro'; if (caps.some((x, i) => i !== sel.c && x.id === v)) return 'já existe outro capítulo com esse id'; c.id = v; mudou(); } }),
        campo({ rotulo: 'Nome', valor: c.nome, max_len: 80, classe: 'larga', aoMudar: v => { if (!v) return 'obrigatório'; c.nome = v; mudou(); } }));
      k.append(g);
      const info = document.createElement('div'); info.className = 'mini';
      info.textContent = `${c.missoes.length} missão(ões). O capítulo é o grupo que o jogador vê em Missões (J); a ordem dos capítulos e das missões é a ordem da história.`;
      k.append(info);
      editor.append(k);
      return;
    }
    const m = c.missoes[sel.m]; if (!m) { sel = { c: sel.c }; renderEditor(); return; }
    // ── missão
    const km = cartao(`Missão ${esc(m.id)}`, [
      ['↑', () => { if (mover(c.missoes, sel.m, -1)) { sel.m--; mudou(); renderEditor(); } }],
      ['↓', () => { if (mover(c.missoes, sel.m, 1)) { sel.m++; mudou(); renderEditor(); } }],
      ['Duplicar', () => { const n = copia(m); n.id = proximoIdMissao(c); n.nome += ' (cópia)'; c.missoes.splice(sel.m + 1, 0, n); sel.m++; mudou(); renderEditor(); }],
      ['Excluir', () => { if (!confirm(`Excluir a missão "${m.nome}"?`)) return; c.missoes.splice(sel.m, 1); sel = c.missoes.length ? { c: sel.c, m: Math.max(0, sel.m - 1) } : { c: sel.c }; mudou(); renderEditor(); }, 'perigo'],
    ]);
    const g = grade();
    g.append(
      campo({ rotulo: 'ID da missão', tipo: 'num', valor: m.id, min: 1, step: 1, ajuda: 'Único no jogo inteiro (o save guarda).', aoMudar: v => {
        if (!Number.isInteger(v)) return 'número inteiro';
        if (caps.some(x => x.missoes.some(y => y !== m && y.id === v))) return 'já existe outra missão com esse id';
        m.id = v; mudou(); } }),
      campo({ rotulo: 'Capítulo', tipo: 'opcao', valor: c.id, opcoes: caps.map(x => [x.id, `Cap. ${x.id} — ${x.nome}`]), vazio: '—', aoMudar: v => {
        const ci = caps.findIndex(x => x.id === v); if (ci < 0 || ci === sel.c) return;
        c.missoes.splice(sel.m, 1); caps[ci].missoes.push(m); sel = { c: ci, m: caps[ci].missoes.length - 1 }; mudou(); renderEditor(); } }),
      campo({ rotulo: 'Nome', valor: m.nome, max_len: 100, classe: 'larga', aoMudar: v => { if (!v) return 'obrigatório'; m.nome = v; mudou(); } }),
      campo({ rotulo: 'Descrição (aparece em Missões)', tipo: 'area', valor: m.des, max_len: 400, classe: 'larga', aoMudar: v => { poe(m, 'des', v?.trim() ? v : null); mudou(); } }));
    km.append(g);
    editor.append(km, cartaoRecompensa(m));
    // ── passos
    const kp = cartao(`Passos (${m.passos.length})`, [['＋ Passo', () => { m.passos.push({ tipo: 'falar', texto: 'Fale com …' }); mudou(); renderEditor(); }]]);
    const aviso = document.createElement('div'); aviso.className = 'mini';
    aviso.textContent = 'Em ordem: o jogo mostra um passo de cada vez no rastreador e só passa pro próximo quando este acontece.';
    kp.append(aviso);
    m.passos.forEach((p, i) => kp.append(cartaoPasso(m, p, i)));
    editor.append(kp);
  }

  function cartaoRecompensa(m) {
    const r = m.recompensa || {};
    const atualizar = () => { if (Object.keys(r).length) m.recompensa = r; else delete m.recompensa; mudou(); };
    const k = cartao('Recompensa');
    const g = grade();
    g.append(
      campo({ rotulo: 'Moedas', tipo: 'num', valor: r.dinheiro, min: 0, step: 1, aoMudar: v => { if (v != null && !Number.isInteger(v)) return 'inteiro'; poe(r, 'dinheiro', v || null); atualizar(); } }),
      campo({ rotulo: 'EXP', tipo: 'num', valor: r.exp, min: 0, step: 1, aoMudar: v => { if (v != null && !Number.isInteger(v)) return 'inteiro'; poe(r, 'exp', v || null); atualizar(); } }));
    k.append(g);
    for (const [chave, titulo] of [['itens', 'Itens'], ['bolas', 'Pokébolas (bolsa de bolas)']]) {
      if (chave === 'bolas' && !r.bolas && !comBolas.has(m)) {              // as missões de hoje dão bola como item; a bolsa de bolas só aparece se pedir
        const b = document.createElement('button'); b.textContent = '＋ Pokébolas na bolsa de bolas'; b.className = 'mini'; b.style.justifySelf = 'start';
        b.onclick = () => { comBolas.add(m); renderEditor(); }; k.append(b); continue;
      }
      const t = document.createElement('table'); t.className = 'esp';
      t.innerHTML = `<thead><tr><th>${titulo}: item</th><th>Qtd</th><th></th></tr></thead><tbody></tbody>`;
      const tb = t.querySelector('tbody');
      const pares = Object.entries(r[chave] || {});                        // o registro só muda quando mexe aqui (um {} vazio que já existia fica)
      const regravar = () => { const novo = {}; for (const [id, n] of pares) if (id && n) novo[id] = n; if (Object.keys(novo).length) r[chave] = novo; else delete r[chave]; atualizar(); };
      pares.forEach((par, i) => {
        const tr = document.createElement('tr');
        const td1 = document.createElement('td'), td2 = document.createElement('td'), td3 = document.createElement('td');
        td1.append(campo({ rotulo: '', tipo: 'num', valor: par[0], lista: 'dl-f2-itens', step: 1, dica: v => nomeItem(v), aoMudar: v => {
          if (v == null || !Number.isInteger(v) || v < 1) return 'id do item';
          if (pares.some((x, j) => j !== i && String(x[0]) === String(v))) return 'item repetido';
          par[0] = String(v); regravar(); } }));
        td2.append(campo({ rotulo: '', tipo: 'num', valor: par[1], min: 1, max: 999999, step: 1, aoMudar: v => { if (!Number.isInteger(v) || v < 1) return '≥ 1'; par[1] = v; regravar(); } }));
        const x = document.createElement('button'); x.textContent = '✕'; x.className = 'perigo'; x.onclick = () => { pares.splice(i, 1); regravar(); renderEditor(); }; td3.append(x);
        tr.append(td1, td2, td3); tb.append(tr);
      });
      const add = document.createElement('button'); add.textContent = '＋ ' + (chave === 'itens' ? 'Item' : 'Pokébola'); add.style.justifySelf = 'start';
      add.onclick = () => {
        const id = prompt('Id do item (veja a lista em Arquivos de dados → Itens):', chave === 'bolas' ? '1001' : '')?.trim(); if (!id || !/^\d{1,9}$/.test(id)) return;
        if (pares.some(p => p[0] === id)) { toast('Esse item já está na recompensa.', true); return; }
        if (!itens[id]) toast(`Atenção: o item ${id} não existe em Itens.`, true);
        pares.push([id, 1]); regravar(); renderEditor(); };
      k.append(t, add);
    }
    const ok = document.createElement('div'); ok.className = 'mini';
    ok.textContent = 'O servidor paga uma vez só, quando a missão está em "feitas" (o jogo pede no fim da missão).';
    k.append(ok);
    return k;
  }

  function cartaoPasso(m, p, i) {
    const k = cartao(`Passo ${i + 1}`, [
      ['↑', () => { if (mover(m.passos, i, -1)) { mudou(); renderEditor(); } }],
      ['↓', () => { if (mover(m.passos, i, 1)) { mudou(); renderEditor(); } }],
      ['✕', () => { if (m.passos.length <= 1) { toast('A missão precisa de pelo menos um passo.', true); return; } m.passos.splice(i, 1); mudou(); renderEditor(); }, 'perigo'],
    ]);
    const g = grade();
    g.append(campo({ rotulo: 'Tipo', tipo: 'opcao', valor: p.tipo, opcoes: Object.entries(TIPOS_PASSO), vazio: '—', aoMudar: v => {
      if (!v) return 'escolha o tipo';
      const fica = new Set(['tipo', 'texto', 'onde', ...CAMPOS_PASSO[v]]);
      for (const key of Object.keys(p)) if (!fica.has(key) && (Object.values(CAMPOS_PASSO).flat().includes(key) || key === 'treinador' || key === 'cfgs')) delete p[key];
      p.tipo = v; Object.assign(p, Object.fromEntries(Object.entries(PADRAO_PASSO[v] || {}).filter(([kk]) => p[kk] == null)));
      mudou(); renderEditor(); } }));
    const usa = new Set(CAMPOS_PASSO[p.tipo] || []);
    if (usa.has('selvagem')) g.append(campo({ rotulo: 'Derrotar', tipo: 'opcao', valor: p.selvagem ? 's' : 't', opcoes: [['s', 'Pokémon selvagens'], ['t', 'Treinadores']], vazio: '—', aoMudar: v => {
      if (v === 's') { p.selvagem = true; delete p.treinador; } else { p.treinador = true; delete p.selvagem; }
      mudou(); renderEditor(); } }));
    if (usa.has('cfg')) {
      const valor = p.cfgs || p.cfg;
      g.append(campo({ rotulo: p.tipo === 'derrotar' ? 'Treinador(es) (cfg)' : p.tipo === 'curar' ? 'Enfermeira (cfg)' : 'NPC (cfg)', tipo: 'nums', valor: Array.isArray(valor) ? valor : valor != null ? [valor] : null, lista: 'dl-f2-npcs',
        ajuda: p.tipo === 'derrotar' ? 'Vazio = qualquer treinador. Vários = qualquer um deles.' : p.tipo === 'curar' ? 'Vazio = qualquer Joy.' : 'Vários separados por vírgula = qualquer um deles.',
        dica: v => v?.length ? nomeNpc(v) : '', aoMudar: v => {
          delete p.cfgs;
          if (p.tipo !== 'derrotar' && p.tipo !== 'curar' && !v) return 'diga com qual NPC';
          poe(p, 'cfg', v ? (v.length === 1 ? v[0] : v) : null); mudou(); } }));
    }
    if (usa.has('item')) g.append(campo({ rotulo: 'Item', tipo: 'num', valor: p.item, step: 1, lista: 'dl-f2-itens', dica: nomeItem, aoMudar: v => { if (!Number.isInteger(v)) return 'id do item'; p.item = v; mudou(); } }));
    if (usa.has('n')) g.append(campo({ rotulo: p.tipo === 'insignia' ? 'Nº de insígnias' : 'Quantidade', tipo: 'num', valor: p.n, min: 1, max: 9999, step: 1, aoMudar: v => {
      if (p.tipo === 'insignia' && !v) return 'obrigatório'; if (v != null && !Number.isInteger(v)) return 'inteiro'; poe(p, 'n', v); mudou(); } }));
    if (usa.has('area')) g.append(campo({ rotulo: 'Área', tipo: 'num', valor: p.area, step: 1, lista: 'dl-f2-areas', ajuda: p.tipo === 'derrotar' ? 'Vazio = em qualquer lugar.' : '',
      dica: v => v == null ? '' : areas[v] || '⚠ área desconhecida', aoMudar: v => { if (p.tipo === 'ir' && v == null) return 'diga qual área'; if (v != null && !Number.isInteger(v)) return 'inteiro'; poe(p, 'area', v); mudou(); } }));
    if (usa.has('dex')) g.append(campo({ rotulo: 'Só estas espécies (nº)', tipo: 'nums', valor: p.dex, ajuda: 'Vazio = qualquer uma.', aoMudar: v => { poe(p, 'dex', v); mudou(); } }));
    if (usa.has('lv')) g.append(campo({ rotulo: 'Nível', tipo: 'num', valor: p.lv, min: 1, max: 100, step: 1, aoMudar: v => { if (!Number.isInteger(v)) return 'de 1 a 100'; p.lv = v; mudou(); } }));
    if (usa.has('cena')) g.append(campo({ rotulo: 'Só no Centro da cena', tipo: 'num', valor: p.cena, step: 1, ajuda: 'Vazio = qualquer Centro.', dica: v => v == null ? '' : cenas[v] || '⚠ cena desconhecida',
      aoMudar: v => { poe(p, 'cena', v); mudou(); } }));
    g.append(
      campo({ rotulo: 'Texto no rastreador *', valor: p.texto, max_len: 200, classe: 'larga', aoMudar: v => { if (!v) return 'obrigatório — é o que o jogador lê'; p.texto = v; mudou(); } }),
      campo({ rotulo: 'Onde (dica, opcional)', valor: p.onde, max_len: 120, classe: 'larga', aoMudar: v => { poe(p, 'onde', v); mudou(); } }));
    if (usa.has('fala')) g.append(campo({ rotulo: 'Fala do NPC neste passo (uma por linha)', tipo: 'linhas', valor: p.fala, classe: 'larga', aoMudar: v => { if (v && v.length > 12) return 'até 12 linhas'; poe(p, 'fala', v); mudou(); } }));
    if (p.tipo === 'item' || p.tipo === 'entregar') { const a = document.createElement('div'); a.className = 'aviso larga'; a.textContent = 'Com conta, o servidor local ainda não confere este tipo (o "entregar" conta como falar, sem tirar o item).'; g.append(a); }
    k.append(g);
    return k;
  }

  // ── Ações ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const todosIds = () => caps.flatMap(x => x.missoes.map(y => y.id));
  function proximoIdMissao(c) {
    const usados = new Set(todosIds());
    let id = Math.max(c.id * 100, ...c.missoes.map(x => x.id)) + 1;
    while (usados.has(id)) id++;
    return id;
  }
  $('.busca').oninput = e => { filtro = e.target.value.trim().toLowerCase(); renderLista(); };
  sec.querySelector('[data-a="cap"]').onclick = () => {
    const id = Math.max(0, ...caps.map(x => x.id)) + 1;
    caps.push({ id, nome: 'Capítulo novo', missoes: [] }); sel = { c: caps.length - 1 }; mudou(); renderEditor();
  };
  sec.querySelector('[data-a="mis"]').onclick = () => {
    if (!caps.length) { toast('Crie um capítulo antes.', true); return; }
    const ci = sel?.c ?? caps.length - 1, c = caps[ci];
    c.missoes.push({ id: proximoIdMissao(c), nome: 'Missão nova', des: '', passos: [{ tipo: 'falar', texto: 'Fale com …' }] });
    sel = { c: ci, m: c.missoes.length - 1 }; mudou(); renderEditor();
  };
  sec.querySelector('[data-a="descartar"]').onclick = () => { if (JSON.stringify(caps) === orig || confirm('Descartar as alterações?')) carregar(); };
  sec.querySelector('[data-a="salvar"]').onclick = async () => {
    if (sec.querySelector('.editor .invalido')) { toast('Corrija os campos em vermelho antes de salvar.', true); return; }
    for (const c of caps) for (const m of c.missoes) if (m.des === '') delete m.des;
    if (!await gravar(api, toast, 'missoes', caps)) return;
    orig = JSON.stringify(caps); marcar();
    toast(`Missões salvas (${caps.length} capítulos, ${todosIds().length} missões). O servidor já usa; o jogo aberto, depois do F5.`);
    avisarJogo('missoes');
  };
  await carregar();
}
