/* Painel admin — tela Espécies (Fase 2). Junta por nº da dex o que estava espalhado em vários arquivos e grava em cada um só o que
 * mudou, cada um pelo seu esquema (esquemas_f2.mjs):
 *   altura real ........ alturas.json (+ dex_extra.a)    → tamanho no campo (régua proporcional) e a ficha da Pokédex
 *   % de machos ........ sexos.json (+ dex_extra.m/f)    → sorteio do sexo (conhecimento.mjs) e a ficha
 *   ajuste de tamanho .. especies.json { escala }         → AJUSTE_PROPORCIONAL do index.html (o Gastly 0,7 veio do código)
 *   descrição .......... idioma/dex_pt.json               → o texto da ficha em português (i18n.descricaoDex)
 *   EXP ................ exp.json → especies { c, b, a } → curva, EXP base e amizade base (evolucao.mjs)
 *   modelos ............ elenco.json (nome, forma) e tamanhos.json (MapSize do modo de tamanho "jogo")
 * O nome OFICIAL da espécie (pokedex.json) não muda aqui: o jogo usa ele como chave (dano, cadeia de evolução, elenco). */
import { esc, copia, campo, gravar, ler, ref, pad } from '/admin/conteudo.mjs';
import { TIPOS, CURVAS } from '/admin/esquemas_f2.mjs';

const ARQS = ['especies', 'alturas', 'sexos', 'tamanhos', 'descricoes_pt', 'dex_extra', 'elenco', 'exp_especies'];
/** A régua do index.html (alturaProporcional): h = 1,3 · real^0,55, entre 0,55 m e 3,2 m (selvagem) / 1,8 m (seguidor). */
const regua = (real, teto) => Math.min(teto, Math.max(0.55, 1.3 * Math.pow(real, 0.55)));
/** A chave do tamanhos.json de um modelo (chaveTamanho do index.html): pm0017_00 → pm0017; forma com chave própria → pm0487_11. */
const chaveTamanho = (glb, T) => { const m = String(glb).match(/^(pm\d{4})(?:_(\d\d))?/); if (!m) return null; return m[2] && m[2] !== '00' && T[m[1] + '_' + m[2]] != null ? m[1] + '_' + m[2] : m[1]; };
const fmt = n => Number(n).toLocaleString('pt-BR');

export async function montar(sec, { api, toast, avisarJogo, marcarSujo, tela }) {
  const [especies, modelosR] = await Promise.all([ref.especies(), api('/admin/modelos')]);
  const nomeSp = n => especies.get(+n)?.nome || `Nº ${n}`;
  const maxDex = Math.max(...especies.keys());
  const glbsDe = {}; for (const { glb, dex } of modelosR.modelos || []) (glbsDe[dex] ||= []).push(String(glb).replace(/\.glb$/, ''));

  const D = {}, O = {};                                                      // D = em edição, O = como está no disco (texto)
  let curvas = {}, sel = null, filtro = '';
  sec.innerHTML = `
    <div class="col-esq"><div class="topo"><input type="search" class="busca" placeholder="buscar espécie (nome ou nº)…">
      <label class="chk"><input type="checkbox" class="soMud"> só as alteradas</label></div><div class="lista"></div></div>
    <div class="col-dir"><div class="barra-topo"><h2>Espécies</h2><span class="sujo" hidden>● não salvo</span><button data-a="descartar">Descartar</button><button class="prim" data-a="salvar">Salvar</button></div>
      <div class="fraco">Altura, sexo, tamanho no campo, descrição da Pokédex, EXP e os modelos 3D de cada espécie. Cada valor fica no arquivo que o jogo já lê
        (alturas, sexos, especies, idioma/dex_pt, exp, elenco, tamanhos) — salvar grava só os que mudaram, com backup no Histórico. O jogo lê no boot: F5 depois de salvar.</div>
      <div class="editor"></div></div>`;
  const $ = s => sec.querySelector(s), lista = $('.lista'), editor = $('.editor');
  const sujos = () => ARQS.filter(a => JSON.stringify(D[a]) !== O[a]);
  const marcar = () => { const s = sujos().length > 0; $('.sujo').hidden = !s; marcarSujo(tela, s); };
  let origP = {};                                                           // cópia parseada do disco, pra marcar a espécie alterada na lista
  const daEspecie = (src, n) => {
    const els = (src.elenco || []).filter(e => e.n === n), ks = new Set(els.map(e => chaveTamanho(e.glb, src.tamanhos || {})).filter(Boolean));
    return JSON.stringify([src.especies?.[n], src.alturas?.[n], src.sexos?.[n], src.descricoes_pt?.[n], src.exp_especies?.[n], els, [...ks].map(k => src.tamanhos?.[k])]);
  };
  const mudouDex = n => daEspecie(D, n) !== daEspecie(origP, n);

  async function carregar() {
    const [rs, cv] = await Promise.all([Promise.all(ARQS.map(a => ler(api, toast, a))), ler(api, toast, 'exp_curvas')]);
    if (rs.some(r => r == null)) return;
    ARQS.forEach((a, i) => { D[a] = copia(rs[i]); O[a] = JSON.stringify(rs[i]); });
    origP = Object.fromEntries(ARQS.map(a => [a, JSON.parse(O[a])]));
    curvas = cv || {};
    marcar(); renderLista(); renderEditor();
  }

  // ── Lista ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
  function renderLista() {
    const so = $('.soMud').checked, out = [];
    for (let n = 1; n <= maxDex; n++) {
      const nome = nomeSp(n);
      if (filtro && !`${n} ${pad(n)} ${nome}`.toLowerCase().includes(filtro)) continue;
      const mud = mudouDex(n);
      if (so && !mud) continue;
      out.push(`<button data-dex="${n}" class="${String(sel) === String(n) ? 'atual' : ''} ${mud ? 'mudou' : ''}"><span><span class="n">${pad(n)}</span> <b>${esc(nome)}</b></span><span class="n">${(especies.get(n)?.tipos || []).map(t => TIPOS[t] || t).join('/')}</span></button>`);
    }
    lista.innerHTML = out.join('') || '<div class="fraco" style="padding:8px">Nada encontrado.</div>';
    for (const b of lista.querySelectorAll('button')) b.onclick = () => { sel = +b.dataset.dex; renderLista(); renderEditor(); };
  }
  const atualizarLinha = () => { const b = lista.querySelector(`button[data-dex="${sel}"]`); if (b) b.classList.toggle('mudou', mudouDex(sel)); marcar(); };

  // ── Editor ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const cartao = (titulo, botoes = []) => {
    const c = document.createElement('div'); c.className = 'cartao';
    const cab = document.createElement('div'); cab.className = 'cab'; cab.innerHTML = `<b>${titulo}</b>`;
    for (const [rot, fn, cls] of botoes) { const b = document.createElement('button'); b.textContent = rot; if (cls) b.className = cls; b.onclick = fn; cab.append(b); }
    c.append(cab); return c;
  };
  const grade = () => { const g = document.createElement('div'); g.className = 'grade-campos'; return g; };

  function renderEditor() {
    editor.innerHTML = '';
    if (sel == null) { editor.innerHTML = '<div class="caixa fraco">Escolha uma espécie à esquerda.</div>'; return; }
    const n = sel, k = String(n), sp = especies.get(n);
    const X = D.dex_extra[k];                                               // ficha extra (pode faltar pra espécie nova)
    // ── espécie
    const ke = cartao(`${pad(n)} ${esc(nomeSp(n))} ${(sp?.tipos || []).map(t => `<span class="pilula">${esc(TIPOS[t] || t)}</span>`).join('')}`);
    const g = grade();
    const aj = () => D.especies[k]?.escala ?? 1;
    const m2 = x => x.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    const dicaAltura = real => real > 0 ? `no campo: ~${m2(regua(real, 3.2) * aj())} m selvagem · ${m2(regua(real, 1.8) * aj())} m seguindo o treinador` : '';
    const wAlt = campo({ rotulo: 'Altura real (m)', tipo: 'num', valor: D.alturas[k], min: 0.01, max: 200, ajuda: 'A da Pokédex. O tamanho no campo sai dela (régua proporcional, o modo padrão).', dica: dicaAltura,
      aoMudar: v => { if (v == null) return 'obrigatório (sem altura o jogo usa o tamanho do modelo)'; D.alturas[k] = v; if (X) X.a = v; atualizarLinha(); } });
    const wAj = campo({ rotulo: 'Ajuste de tamanho no campo (×)', tipo: 'num', valor: D.especies[k]?.escala, min: 0.1, max: 5, ajuda: 'Multiplica o tamanho da régua. Vazio = 1 (sem ajuste). Ex.: Gastly 0,7 (a nuvem não entra na medida).',
      aoMudar: v => {
        if (v == null || v === 1) { if (D.especies[k]) { delete D.especies[k].escala; if (!Object.keys(D.especies[k]).length) delete D.especies[k]; } }
        else (D.especies[k] ||= {}).escala = v;
        wAlt.dica(dicaAltura(D.alturas[k])); atualizarLinha(); } });
    const sexoTxt = m => m == null ? '' : m < 0 ? 'sem gênero' : `♂ ${m}% · ♀ ${100 - m}%`;
    g.append(wAlt, wAj,
      campo({ rotulo: '% de machos', tipo: 'num', valor: D.sexos[k], min: -1, max: 100, ajuda: '-1 = sem gênero · 50 = metade · 87,5 = 7 em cada 8 (iniciais) · 0 = só fêmeas.', dica: sexoTxt,
        aoMudar: v => { if (v == null) return 'obrigatório'; if (v < 0 && v !== -1) return 'use -1 pra sem gênero'; D.sexos[k] = v; if (X) { X.m = v; X.f = v < 0 ? -1 : 100 - v; } atualizarLinha(); } }),
      campo({ rotulo: 'Descrição da Pokédex (português)', tipo: 'area', valor: D.descricoes_pt[k], classe: 'larga', max_len: 6000,
        ajuda: 'O texto da ficha (jogo em português; o inglês fica em idioma/dex_en.json). Aparece a partir do nível 2 de conhecimento da espécie.',
        aoMudar: v => { if (v == null || !v.trim()) delete D.descricoes_pt[k]; else D.descricoes_pt[k] = v; atualizarLinha(); } }));
    ke.append(g);
    const nota = document.createElement('div'); nota.className = 'mini';
    nota.textContent = 'O nome oficial vem do pokedex.json e é chave no jogo (dano, cadeia de evolução, captura) — não muda aqui. O nome de cada modelo está em Modelos.';
    ke.append(nota);
    editor.append(ke);

    // ── EXP
    const kx = cartao('EXP e amizade');
    const E = D.exp_especies[k] || {}, Ee = () => (D.exp_especies[k] ||= Object.assign(E, { c: E.c || 'medium', b: E.b || 60, a: E.a ?? 70 }));   // espécie sem EXP ganha os padrões do jogo ao mexer
    const gx = grade();
    gx.append(
      campo({ rotulo: 'Curva de EXP', tipo: 'opcao', valor: E.c, opcoes: Object.entries(CURVAS), vazio: '—', dica: c => curvas[c] ? `Lv 100 = ${fmt(curvas[c][100])} EXP` : '',
        ajuda: 'As curvas ficam em Arquivos de dados → Curvas de EXP.', aoMudar: v => { if (!v) return 'obrigatório'; Ee().c = v; atualizarLinha(); } }),
      campo({ rotulo: 'EXP base (ao ser derrotado)', tipo: 'num', valor: E.b, min: 1, max: 1000, step: 1, ajuda: 'Entra na fórmula da Gen 5+: quanto maior, mais EXP dá.', aoMudar: v => { if (!Number.isInteger(v)) return 'inteiro de 1 a 1000'; Ee().b = v; atualizarLinha(); } }),
      campo({ rotulo: 'Amizade base', tipo: 'num', valor: E.a, min: 0, max: 255, step: 1, ajuda: 'Com quanto nasce (70 é o comum; evolui por amizade com 160).', aoMudar: v => { if (!Number.isInteger(v)) return 'inteiro de 0 a 255'; Ee().a = v; atualizarLinha(); } }));
    kx.append(gx);
    editor.append(kx);

    // ── modelos (elenco + tamanhos do modo "jogo")
    const els = D.elenco.filter(e => e.n === n);
    const livres = (glbsDe[n] || []).filter(gl => !D.elenco.some(e => e.glb === gl));
    const km = cartao(`Modelos 3D (${els.length})`, livres.length ? [['＋ Modelo', () => {
      const gl = prompt('Qual modelo? Disponíveis desta espécie:\n' + livres.join(', '), livres[0]); if (!gl) return;
      if (!livres.includes(gl.trim())) { toast('Esse modelo não existe em cenario/mon (ou já está no elenco).', true); return; }
      const i = D.elenco.findLastIndex(e => e.n <= n);
      D.elenco.splice(i + 1, 0, { n, nome: nomeSp(n), glb: gl.trim(), altura: 0 }); atualizarLinha(); renderEditor(); }]] : []);
    if (!els.length) { const v = document.createElement('div'); v.className = 'mini'; v.textContent = 'Sem modelo no elenco: a espécie não aparece no jogo (nem como evolução).'; km.append(v); }
    else {
      const t = document.createElement('table'); t.className = 'esp';
      t.innerHTML = '<thead><tr><th>Modelo</th><th>Nome</th><th>Forma</th><th title="MapSize do jogo original — só no modo de tamanho &quot;jogo&quot;">Tamanho (modo jogo)</th><th></th></tr></thead><tbody></tbody>';
      const tb = t.querySelector('tbody');
      for (const e of els) {
        const tr = document.createElement('tr'), td = () => document.createElement('td');
        const [t1, t2, t3, t4, t5] = [td(), td(), td(), td(), td()];
        t1.innerHTML = `<code>${esc(e.glb)}</code><div class="mini">altura do modelo ${e.altura ? e.altura + ' m' : '—'}</div>`;
        t2.append(campo({ rotulo: '', valor: e.nome, max_len: 40, aoMudar: v => { if (!v) return 'obrigatório'; e.nome = v; atualizarLinha(); } }));
        t3.append(campo({ rotulo: '', valor: e.nota, max_len: 40, aoMudar: v => { if (v) e.nota = v; else delete e.nota; atualizarLinha(); } }));
        const kt = chaveTamanho(e.glb, D.tamanhos);
        t4.append(campo({ rotulo: '', tipo: 'num', valor: D.tamanhos[kt], min: 0.01, max: 50, dica: () => kt ? 'chave ' + kt + (kt.includes('_') ? '' : ' (vale pra todas as formas sem chave própria)') : '',
          aoMudar: v => { if (!kt) return 'modelo sem chave'; if (v == null) delete D.tamanhos[kt]; else D.tamanhos[kt] = v; atualizarLinha(); } }));
        const x = document.createElement('button'); x.textContent = '✕'; x.className = 'perigo'; x.title = 'Tirar do elenco';
        x.onclick = () => { if (!confirm(`Tirar ${e.glb} do elenco? (o arquivo .glb continua; o jogo deixa de usar este modelo)`)) return; D.elenco.splice(D.elenco.indexOf(e), 1); atualizarLinha(); renderEditor(); };
        t5.append(x);
        tr.append(t1, t2, t3, t4, t5); tb.append(tr);
      }
      km.append(t);
      const v = document.createElement('div'); v.className = 'mini';
      v.textContent = 'O nome e a forma aparecem nas listas de modelos (seguidor, evolução). O tamanho do modo "jogo" só vale com ?tamanhos=jogo — no modo padrão quem manda é a altura real e o ajuste.';
      km.append(v);
    }
    editor.append(km);
  }

  // ── Ações ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
  $('.busca').oninput = e => { filtro = e.target.value.trim().toLowerCase(); renderLista(); };
  $('.soMud').onchange = renderLista;
  sec.querySelector('[data-a="descartar"]').onclick = () => { if (!sujos().length || confirm('Descartar as alterações?')) carregar(); };
  sec.querySelector('[data-a="salvar"]').onclick = async () => {
    if (sec.querySelector('.editor .invalido')) { toast('Corrija os campos em vermelho antes de salvar.', true); return; }
    const lista2 = sujos(); if (!lista2.length) { toast('Nada mudou.'); return; }
    const feitos = [];
    for (const a of lista2) {
      if (!await gravar(api, toast, a, D[a])) { if (feitos.length) toast('Gravados antes do erro: ' + feitos.join(', '), true); break; }
      O[a] = JSON.stringify(D[a]); feitos.push(a);
      avisarJogo(a === 'descricoes_pt' ? 'dex_pt' : a === 'exp_especies' ? 'exp' : a === 'dex_extra' ? 'dex_extra' : a);
    }
    origP = Object.fromEntries(ARQS.map(a => [a, JSON.parse(O[a])]));
    marcar(); renderLista();
    if (feitos.length === lista2.length) toast(`Espécies salvas (${feitos.join(', ')}). F5 no jogo pra valer.`);
  };
  await carregar();
}
