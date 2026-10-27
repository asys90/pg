/* Painel admin — tela Learnset (Fase 2). Edita data/learnset.json → learnset ({ dex: [["golpe", nível], …] }, esquema `learnset`):
 * que golpe cada espécie aprende e em que nível. Os golpes são os de data/golpes.json (Arquivos de dados → Golpes: poder, PP,
 * efeito…). O jogo (individuo.mjs) dá ao Pokémon os 4 últimos golpes até o nível dele e ensina o do nível quando ele sobe. */
import { esc, copia, campo, gravar, ler, ref, datalist, pad } from '/admin/conteudo.mjs';
import { TIPOS } from '/admin/esquemas_f2.mjs';

const CAT = { fisico: 'físico', especial: 'especial', status: 'status' };

export async function montar(sec, { api, toast, avisarJogo, marcarSujo, tela }) {
  const [especies, golpes] = await Promise.all([ref.especies(), ref.golpes()]);
  datalist('dl-f2-golpes', Object.entries(golpes).map(([id, g]) => [id, g.nome + (g.nomePt ? ' · ' + g.nomePt : '')]));
  const nomeSp = n => especies.get(+n)?.nome || `Nº ${n}`;
  const maxDex = Math.max(...especies.keys());
  const descGolpe = id => { const g = golpes[id]; return g ? `${g.nomePt || g.nome} · ${TIPOS[g.tipo] || g.tipo} · ${CAT[g.cat] || g.cat} · poder ${g.poder || '—'} · PP ${g.pp ?? '20'}` : '⚠ golpe desconhecido (crie em Arquivos de dados → Golpes)'; };

  let learn = {}, orig = '{}', sel = null, filtro = '', soCom = true;
  sec.innerHTML = `
    <div class="col-esq"><div class="topo"><input type="search" class="busca" placeholder="buscar espécie (nome ou nº)…">
      <label class="chk"><input type="checkbox" class="soCom" checked> só quem tem learnset</label></div><div class="lista"></div></div>
    <div class="col-dir"><div class="barra-topo"><h2>Learnset</h2><span class="sujo" hidden>● não salvo</span><button data-a="descartar">Descartar</button><button class="prim" data-a="salvar">Salvar</button></div>
      <div class="fraco">Que golpe cada espécie aprende e em que nível. O Pokémon nasce com os <b>4 últimos</b> golpes até o nível dele (mínimo 2) e aprende o do nível
        quando sobe. Só entram golpes da tabela de golpes (os que têm efeito 3D — <b>Arquivos de dados → Golpes</b>, onde ficam poder, PP e efeito).
        Arquivo <code>public/data/learnset.json</code>, lido no boot do jogo (F5 depois de salvar).</div>
      <div class="editor"></div></div>`;
  const $ = s => sec.querySelector(s), lista = $('.lista'), editor = $('.editor');
  const marcar = () => { const s = JSON.stringify(learn) !== orig; $('.sujo').hidden = !s; marcarSujo(tela, s); };

  async function carregar() {
    const d = await ler(api, toast, 'learnset'); if (!d) return;
    learn = copia(d); orig = JSON.stringify(learn); marcar(); renderLista(); renderEditor();
  }
  function renderLista() {
    const out = [];
    for (let n = 1; n <= maxDex; n++) {
      const l = learn[n], nome = nomeSp(n);
      if (filtro ? !`${n} ${pad(n)} ${nome}`.toLowerCase().includes(filtro) : soCom && !l?.length && String(sel) !== String(n)) continue;
      out.push(`<button data-dex="${n}" class="${String(sel) === String(n) ? 'atual' : ''} ${l?.length ? '' : 'vazio'}"><span><span class="n">${pad(n)}</span> ${esc(nome)}</span><span class="n">${l?.length || ''}</span></button>`);
      if (out.length > 1100) break;
    }
    lista.innerHTML = out.join('') || '<div class="fraco" style="padding:8px">Nada encontrado.</div>';
    for (const b of lista.querySelectorAll('button')) b.onclick = () => { sel = b.dataset.dex; renderLista(); renderEditor(); };
  }
  function renderEditor() {
    editor.innerHTML = '';
    if (sel == null) { editor.innerHTML = '<div class="caixa fraco">Escolha uma espécie à esquerda.</div>'; return; }
    const l = learn[sel] || [];
    const k = document.createElement('div'); k.className = 'cartao';
    k.innerHTML = `<div class="cab"><b>${pad(sel)} ${esc(nomeSp(sel))}</b><button data-b="add">＋ Golpe</button><button data-b="copiar">Copiar de outra espécie…</button><button data-b="ordenar">Ordenar por nível</button></div>
      <table class="esp"><thead><tr><th style="width:42%">Golpe</th><th style="width:90px">Nível</th><th></th><th></th></tr></thead><tbody></tbody></table>
      <div class="mini">Na mesma ordem do arquivo (o jogo usa a ordem quando dois golpes têm o mesmo nível). Salvar ordena por nível.</div>`;
    const tb = k.querySelector('tbody');
    const mudou = () => { if (!l.length) delete learn[sel]; else learn[sel] = l; marcar(); renderLista(); };
    l.forEach((par, i) => {
      const tr = document.createElement('tr'), td = () => document.createElement('td');
      const [t1, t2, t3, t4] = [td(), td(), td(), td()];
      const info = document.createElement('span'); info.className = 'mini'; info.textContent = descGolpe(par[0]);
      t1.append(campo({ rotulo: '', valor: par[0], lista: 'dl-f2-golpes', aoMudar: v => {
        if (!v || !/^[a-z0-9]{1,40}$/.test(v)) return 'id do golpe (minúsculas, ex.: thunderbolt)';
        if (!golpes[v]) { info.textContent = descGolpe(v); return 'não existe na tabela de golpes'; }
        par[0] = v; info.textContent = descGolpe(v); mudou(); } }));
      t2.append(campo({ rotulo: '', tipo: 'num', valor: par[1], min: 1, max: 120, step: 1, aoMudar: v => { if (!Number.isInteger(v)) return '1 a 120'; par[1] = v; mudou(); } }));
      t3.append(info);
      const x = document.createElement('button'); x.textContent = '✕'; x.className = 'perigo'; x.onclick = () => { l.splice(i, 1); mudou(); renderEditor(); }; t4.append(x);
      tr.append(t1, t2, t3, t4); tb.append(tr);
    });
    k.querySelector('[data-b="add"]').onclick = () => { l.push(['tackle', Math.min(100, (l.at(-1)?.[1] || 0) + 1 || 1)]); learn[sel] = l; mudou(); renderEditor(); tb.closest('.cartao')?.querySelector('tbody tr:last-child input')?.focus(); };
    k.querySelector('[data-b="ordenar"]').onclick = () => { l.sort((a, b) => a[1] - b[1]); mudou(); renderEditor(); };
    k.querySelector('[data-b="copiar"]').onclick = () => {
      const txt = prompt('Copiar o learnset de qual espécie? (nº da dex)'); if (!txt) return;
      const de = learn[+txt]; if (!de?.length) { toast('Essa espécie não tem learnset.', true); return; }
      if (l.length && !confirm(`Trocar os ${l.length} golpes de ${nomeSp(sel)} pelos ${de.length} de ${nomeSp(txt)}?`)) return;
      learn[sel] = copia(de); marcar(); renderLista(); renderEditor();
    };
    editor.append(k);
    if (!l.length) { const v = document.createElement('div'); v.className = 'caixa fraco'; v.textContent = 'Sem learnset: o Pokémon nasce com o golpe padrão da espécie (Tackle, se não houver).'; editor.append(v); }
  }
  $('.busca').oninput = e => { filtro = e.target.value.trim().toLowerCase(); renderLista(); };
  $('.soCom').onchange = e => { soCom = e.target.checked; renderLista(); };
  sec.querySelector('[data-a="descartar"]').onclick = () => { if (JSON.stringify(learn) === orig || confirm('Descartar as alterações?')) carregar(); };
  sec.querySelector('[data-a="salvar"]').onclick = async () => {
    if (sec.querySelector('.editor .invalido')) { toast('Corrija os campos em vermelho antes de salvar.', true); return; }
    const ruins = Object.entries(learn).flatMap(([d, l]) => l.filter(([g]) => !golpes[g]).map(([g]) => `${nomeSp(d)}: ${g}`));
    if (ruins.length) { toast('Golpe que não existe na tabela: ' + ruins.slice(0, 4).join(', '), true); return; }
    for (const l of Object.values(learn)) l.sort((a, b) => a[1] - b[1]);
    if (!await gravar(api, toast, 'learnset', learn)) return;
    orig = JSON.stringify(learn); marcar(); renderEditor();
    toast(`Learnset salvo (${Object.keys(learn).length} espécies). F5 no jogo pra valer.`);
    avisarJogo('learnset');
  };
  await carregar();
}
