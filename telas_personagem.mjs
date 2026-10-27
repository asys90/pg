import { t as tr, tHtml } from './i18n.mjs';   // IDIOMA (11/09): tr() traduz texto pt pro idioma do jogador
/* TELAS DO TREINADOR desenhadas no Figma da Amanda (rodada 23, 09/09): escolher o modelo e personalizar as cores.
 *
 * Fluxo: login → `personagem` (5 modelos por sexo) → `personalizar` (cores + nome) → jogo. São telas de FORA do jogo,
 * tela cheia, montadas pelo popup.mjs a partir do bloco `telas` do ui/hud_layout.json — quem chama é o telas.mjs.
 *
 * O que é DA MAQUETE e o que é DO JOGO:
 *   - moldura, fundo, cartas, botões e a caixa de cada cor vêm do layout (nada é desenhado na mão aqui);
 *   - `img/personagem [do-jogo]` é só uma CAIXA: dentro dela entra um `.palco` e o modelo 3D é desenhado ali pelo
 *     `criarPalco` do personagem.mjs — UM canvas WebGL só, com scissor por caixa (o jeito que a tela antiga já usava);
 *   - `gradiente-cor` e `barra-matiz [do-jogo]` do seletor são canvas nossos.
 *
 * As LINHAS DE COR são dinâmicas, como ela pediu: quantidade e nomes saem de `Personagem.ROTULOS[tinta]` — Herói e
 * Heroína têm 5 (pele, cabelo, roupa, tom, olhos), a Misty tem 2 (cabelo, olhos) e as roupas de visual fixo têm 0. A
 * maquete desenha 5 linhas de exemplo: as que sobram somem.
 */
import * as Popup from './popup.mjs';
import * as Personagem from './personagem.mjs';

const OURO = '#F8C237';
let palco = null;                       // um só, vivo entre as duas telas (recarregar os GLBs a cada troca seria caro)
let estado = null;                      // { sexo, skinId, coresPor, nome, aoPronto }
let ocupado = false;

/* ------------------------------------------------------------------ estado do fluxo */
export function iniciar(ctx){
  const salvo = Personagem.ler();
  const skin = Personagem.skinDe(salvo);
  const coresPor = {};
  for (const t of Object.keys(Personagem.PADRAO)) coresPor[t] = Personagem.coresDe(t, salvo);
  let nome = '';
  try { nome = String(localStorage.getItem('conta.usuario') || '').trim(); } catch {}
  estado = { sexo: skin.sexo, skinId: skin.id, coresPor, nome, aoPronto: ctx?.aoPronto || null };
}
/** Fecha o palco 3D: o fluxo acabou (ou foi cancelado). */
export function encerrar(){ try { palco?.fechar(); } catch {} palco = null; estado = null; ocupado = false; }
export const estadoAtual = () => estado;

/* Quem aparece aqui o painel admin decide (Skins de treinador → "Aparece na criação"): as fixas do personagem.mjs + as do
   guarda-roupa marcadas. Pode passar das 5 cartas da maquete — aí a tela pagina (setas, arrastar pro lado, "1 / 3"). */
const listaDoSexo = sexo => Personagem.skinsDaCriacao?.(sexo) || Personagem.SKINS.filter(s => s.sexo === sexo);
const skinAtual = () => Personagem.skinPorId?.(estado.skinId) || Personagem.SKINS.find(s => s.id === estado.skinId) || listaDoSexo(estado.sexo)[0];
const canaisDe = skin => (skin.tinta ? Object.keys(Personagem.ROTULOS[skin.tinta] || {}) : []);
/** Escreve num rótulo fixo da maquete (os `rotulo` não têm data-txt, ao contrário dos `txt/`). */
const rotuloTexto = (pop, fig, t) => { const el = pop.querySelector('[data-fig="' + fig + '"]'); if (el) el.textContent = t; return el; };

/* ------------------------------------------------------------------ palco 3D dentro das caixas da maquete */
function palcoEm(pop){
  if (!palco){
    palco = Personagem.criarPalco(pop, t => estado.coresPor[t]);
    /* O canvas cobre a tela inteira, mas só pinta dentro das caixas (scissor) e não recebe clique: pode ficar por cima
       da arte sem atrapalhar. Abaixo dos diálogos (`.pf-extra`, z 900), que têm de aparecer na frente do modelo. */
    Object.assign(palco.canvas.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none', zIndex: '500' });
    pop.appendChild(palco.canvas);
    estiloPalco();
  } else palco.usar(pop);
  return palco;
}
/** Um "carregando…" discreto na caixa do modelo enquanto o GLB não chega (o palco põe `.pronto` quando chega). */
function estiloPalco(){
  if (document.getElementById('telas-palco-css')) return;
  const st = document.createElement('style'); st.id = 'telas-palco-css';
  st.textContent = '.pf .palco:not(.pronto)::after{content:"…";position:absolute;inset:0;display:grid;place-items:center;color:#8c9ab7;font-size:26px}';
  document.head.appendChild(st);
}
/** Põe a caixa do modelo 3D dentro de um `img/personagem [do-jogo]` (a caixa continua sendo a da maquete). */
function caixaDoModelo(dentro, id){
  const area = dentro.querySelector('[data-var="personagem"]');
  if (!area) return null;
  area.innerHTML = '';
  area.style.position = 'absolute';
  const d = document.createElement('div');
  d.className = 'palco'; d.dataset.id = id;
  Object.assign(d.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
  area.appendChild(d);
  return d;
}

/* ================================================================== TELA 1: escolher o treinador */
/** As duas cópias `personagem [estado:normal|selecionado]` viram as cores das cartas. */
function estilosDaCarta(def){
  const refs = (def?.filhos || []).filter(f => f.nome === 'personagem' && (f.filhos || []).some(c => c.nome === 'bg-card'));
  const ler = r => {
    const bg = (r.filhos || []).find(c => c.nome === 'bg-card') || {};
    const nm = (r.filhos || []).find(c => c.nome === 'txt/personagem-nome') || {};
    return { fundo: bg.cor || '#0B1220', borda: bg.borda || '#B8C2D9', bordaPx: bg.bordaPx || 1, nome: nm.cor || '#FFFFFF' };
  };
  const a = refs[0] ? ler(refs[0]) : null, b = refs[1] ? ler(refs[1]) : null;
  const ehOuro = x => x && String(x.borda).toUpperCase() === OURO;
  if (ehOuro(b)) return { selecionado: b, normal: a || b };
  if (ehOuro(a)) return { selecionado: a, normal: b || a };
  return { selecionado: { fundo: '#16233C', borda: OURO, bordaPx: 1.5, nome: OURO }, normal: { fundo: '#0B1220', borda: '#B8C2D9', bordaPx: 0.75, nome: '#FFFFFF' } };
}
function pintarCarta(carta, e){
  const bg = carta.querySelector('[data-fig="bg-card"]');
  if (bg){ bg.style.backgroundColor = e.fundo; bg.style.border = e.bordaPx + 'px solid ' + e.borda; }
  const nm = carta.querySelector('[data-txt="personagem-nome"]');
  if (nm) nm.style.color = e.nome;
}
/** Setas ‹ › nas laterais da fileira de cartas, "1 / 3" embaixo e arrastar pro lado (celular). Medido pelas próprias cartas
    (left/top/width/height em px da maquete, que o popup.mjs escala junto), então serve no PC e no celular deitado.
    `mudar(±1)` troca de página. Devolve { mostrar(pagina, paginas), arrastou() }. */
function criarPaginas(cartas, mudar){
  const fileira = cartas[0]?.parentElement;
  const nada = { mostrar(){}, arrastou: () => false };
  if (!fileira) return nada;
  for (const el of fileira.querySelectorAll(':scope > .pf-pagina')) el.remove();   // tela montada de novo (voltou da personalização)
  const px = (el, k) => parseFloat(el.style[k]) || 0;
  const c0 = cartas[0], cN = cartas[cartas.length - 1];
  const x0 = px(c0, 'left'), y0 = px(c0, 'top'), h = px(c0, 'height') || 251, x1 = px(cN, 'left') + (px(cN, 'width') || 200);
  const a = Math.round(h * 0.17), folga = Math.round(a * 0.3);
  const seta = (txt, x, n) => {
    const b = document.createElement('div');
    b.className = 'pf-pagina'; b.textContent = txt; b.setAttribute('role', 'button'); b.setAttribute('aria-label', n < 0 ? 'página anterior' : 'próxima página');
    Object.assign(b.style, { position: 'absolute', left: x + 'px', top: (y0 + h / 2 - a / 2) + 'px', width: a + 'px', height: a + 'px', borderRadius: '50%',
      border: Math.max(1, a * 0.05) + 'px solid ' + OURO, background: '#0B1220', color: OURO, display: 'none', placeItems: 'center',
      font: '900 ' + Math.round(a * 0.62) + 'px/1 "Nunito Sans", system-ui, sans-serif', cursor: 'pointer', zIndex: '600', userSelect: 'none', pointerEvents: 'auto' });
    b.onclick = ev => { ev.stopPropagation(); mudar(n); };
    fileira.appendChild(b);
    return b;
  };
  /* metade em cima da borda da carta: fora dela não cabe — a margem da maquete até a moldura é estreita (a seta encostava no ouro) */
  const ant = seta('‹', x0 - Math.round(a * 0.65), -1), prox = seta('›', x1 - Math.round(a * 0.35), +1);
  const ind = document.createElement('div'); ind.className = 'pf-pagina';
  Object.assign(ind.style, { position: 'absolute', left: x0 + 'px', width: (x1 - x0) + 'px', top: (y0 + h + folga) + 'px', textAlign: 'center', color: '#B8C2D9',
    font: '800 ' + Math.max(8, Math.round(a * 0.4)) + 'px/1.2 "Nunito Sans", system-ui, sans-serif', display: 'none', pointerEvents: 'none', zIndex: '600' });
  fileira.appendChild(ind);
  // arrastar a fileira pro lado troca de página (no toque não há seta "grande"); o clique que vem junto do soltar é ignorado
  let xIni = null, arrasteEm = 0;
  fileira.addEventListener('pointerdown', ev => { xIni = ev.clientX; });
  fileira.addEventListener('pointerup', ev => {
    if (xIni == null || ant.style.display === 'none') { xIni = null; return; }
    const dx = ev.clientX - xIni; xIni = null;
    if (Math.abs(dx) > 40){ arrasteEm = performance.now(); mudar(dx < 0 ? +1 : -1); }
  });
  return {
    mostrar(pagina, paginas){
      const varias = paginas > 1;
      for (const b of [ant, prox]) b.style.display = varias ? 'grid' : 'none';
      ind.style.display = varias ? 'block' : 'none';
      ant.style.opacity = pagina > 0 ? '1' : '0.3'; ant.style.pointerEvents = pagina > 0 ? 'auto' : 'none';
      prox.style.opacity = pagina < paginas - 1 ? '1' : '0.3'; prox.style.pointerEvents = pagina < paginas - 1 ? 'auto' : 'none';
      ind.textContent = (pagina + 1) + ' / ' + paginas;
    },
    arrastou: () => performance.now() - arrasteEm < 400,
  };
}
function montarEscolha(pop, def, ctx){
  const est = estilosDaCarta(def);
  for (const r of pop.querySelectorAll(':scope > [data-fig="personagem"]')) r.style.display = 'none';   // cópias de referência não são carta
  const P = palcoEm(pop);
  const cartas = [];
  for (let i = 1; i <= 8; i++){ const c = pop.querySelector('[data-fig="personagem-' + i + '"]'); if (c) cartas.push(c); }

  /* PÁGINAS (27/10): a maquete tem `cartas.length` vagas (5); a lista pode ser maior. Só a página à vista monta modelo 3D —
     cada carta é um rig com textura, e 15 vivos de uma vez pesariam no celular. */
  const N = Math.max(1, cartas.length);
  let pagina = -1;                                                       // -1 = "a página da skin escolhida" (abrir e trocar de aba)
  const nav = criarPaginas(cartas, n => { pagina += n; pintar(); });
  const pintar = () => {
    const lista = listaDoSexo(estado.sexo);
    if (!lista.some(s => s.id === estado.skinId)) estado.skinId = lista[0].id;
    const paginas = Math.ceil(lista.length / N);
    if (pagina < 0) pagina = Math.floor(lista.findIndex(s => s.id === estado.skinId) / N);
    pagina = Math.min(Math.max(0, pagina), paginas - 1);
    const vistas = lista.slice(pagina * N, pagina * N + N);
    /* Solta os modelos que saíram de vista (aba ou página): sem isto os do outro sexo ficavam vivos junto (10/09). O
       escolhido nunca sai — a tela de personalizar continua com ele. */
    const ficam = new Set(vistas.map(x => x.id).concat(estado.skinId));
    for (const id of [...P.itens.keys()]) if (!ficam.has(id)) P.descartar(id);
    cartas.forEach((carta, i) => {
      const s = vistas[i];
      if (!s){ carta.style.display = 'none'; return; }
      carta.style.display = ''; carta.style.pointerEvents = 'auto'; carta.style.cursor = 'pointer';
      Popup.texto(pop, 'personagem-nome', s.nome, carta);
      Popup.texto(pop, 'personagem-desc', s.desc, carta);
      pintarCarta(carta, s.id === estado.skinId ? est.selecionado : est.normal);
      if (caixaDoModelo(carta, s.id)) P.montar(s).catch(e => console.warn('modelo do treinador', s.id, e));
      carta.onclick = () => {
        if (nav.arrastou()) return;                                      // soltar um arraste de página não escolhe a carta
        if (estado.skinId === s.id) return;
        estado.skinId = s.id;
        cartas.forEach((k, j) => { const t = vistas[j]; if (t) pintarCarta(k, t.id === estado.skinId ? est.selecionado : est.normal); });
        P.selecionar(s.id);
      };
    });
    nav.mostrar(pagina, paginas);
    P.selecionar(estado.skinId);
  };
  pintar();
  for (const a of pop.querySelectorAll('[data-tag="aba"]')) Popup.rotulo(pop, 'aba', a);   // "Menino"/"Menina" são rótulos fixos da maquete
  /* Qual arte é a ATIVA: aqui o nome do arquivo diz (`aba-ativa.png` / `aba-inativa.png`), então não se adivinha. O
     `trocarAba` só adivinha quando `pop.__arteAba` está vazio — preenchendo antes, ele usa o que a maquete disse. */
  const abas = [...pop.querySelectorAll('[data-tag="aba"]')];
  const artes = abas.map(a => a.dataset.arte || '');
  const inativa = artes.find(a => /inativa/.test(a)) || artes[0];
  const ativa = artes.find(a => a && a !== inativa) || artes[1] || inativa;
  const corDe = arte => abas.find(a => a.dataset.arte === arte)?.querySelector('[data-txt]')?.style.color;
  pop.__arteAba = { ativa, inativa, corAtiva: corDe(ativa) || '#1A1A1A', corInativa: corDe(inativa) || '#F8C237' };
  Popup.trocarAba(pop, estado.sexo);
  return {
    aba: sexo => { if ((sexo === 'menino' || sexo === 'menina') && sexo !== estado.sexo){ estado.sexo = sexo; pagina = -1; pintar(); } },
    acao: () => {},
    abre: () => false,
  };
}

/* ================================================================== TELA 2: personalizar */
function montarPersonalizar(pop, def, ctx){
  for (const r of pop.querySelectorAll(':scope > [data-fig="cor"]')) r.style.display = 'none';   // referências soltas de cor
  const P = palcoEm(pop);
  const skin = skinAtual(), tinta = skin.tinta || null, canais = canaisDe(skin);

  /* prévia grande: o mesmo palco, numa caixa maior, arrastável pra girar */
  const previa = pop.querySelector('[data-fig="previa-personagem"]');
  if (previa){
    const caixa = caixaDoModelo(previa, skin.id);
    Popup.texto(pop, 'modelo-nome', skin.nome, previa);
    P.montar(skin).then(() => P.selecionar(skin.id)).catch(e => console.warn('modelo do treinador', e));
    if (caixa){ caixa.style.pointerEvents = 'auto'; caixa.style.touchAction = 'pan-y'; P.arrastavel(caixa, skin.id); }
  }

  const corDe = canal => estado.coresPor[tinta]?.[canal] || Personagem.PADRAO[tinta]?.[canal] || '#ffffff';
  const linhas = [];
  for (let i = 1; i <= 12; i++){ const l = pop.querySelector('[data-fig="linha-cor-' + i + '"]'); if (l) linhas.push(l); }
  const pintarLinha = (linha, canal) => {
    const b = linha.querySelector('[data-fig="cor-atual"]'); if (b) b.style.backgroundColor = corDe(canal);
    for (const bola of linha.querySelectorAll('[data-fig^="cor-"]')){
      if (bola === b) continue;
      bola.style.border = String(bola.dataset.cor || '').toLowerCase() === String(corDe(canal)).toLowerCase() ? '2px solid ' + OURO : '';
    }
  };
  const repintar = () => { if (tinta) P.repintar(skin.id, tinta, estado.coresPor[tinta]); };

  linhas.forEach((linha, i) => {
    const canal = canais[i];
    if (!canal){ linha.style.display = 'none'; return; }
    linha.style.display = ''; linha.dataset.canal = canal;
    Popup.texto(pop, 'item-rotulo', Personagem.ROTULOS[tinta][canal], linha);
    /* PRESETS: a maquete desenha 9 bolinhas por linha, mas a quantidade é do CANAL (pele 6 … cabelo 10). Faltando, clono a
       última; sobrando, escondo. E o espaçamento se ajusta pra caber na caixa em vez de rolar: com 10 cores no espaço de 9
       aparecia a barra de rolagem POR CIMA das bolinhas (a caixa tem 24 px de altura) e não dava pra ver as cores — foi o
       que o Jaime viu em 10/09. Só se nem apertando couber é que a fila rola, e aí sem barra à vista (roda do mouse e arrasto). */
    const lista = linha.querySelector('[data-fig="lista-cores"]');
    const cores = Personagem.PRESETS[canal] || [];
    if (lista){
      const bolas = [...lista.querySelectorAll('[data-fig^="cor-"]')];
      const passoMaquete = bolas.length > 1 ? (parseFloat(bolas[1].style.left) - parseFloat(bolas[0].style.left)) : 32;
      while (bolas.length && bolas.length < cores.length){
        const novo = bolas[bolas.length - 1].cloneNode(true);
        novo.dataset.fig = 'cor-' + (bolas.length + 1);
        lista.appendChild(novo); bolas.push(novo);
      }
      const largura = parseFloat(lista.style.width) || 280;
      const diam = parseFloat(bolas[0]?.style.width) || 24;
      const cabe = cores.length > 1 ? (largura - diam) / (cores.length - 1) : passoMaquete;
      const passo = Math.min(passoMaquete, Math.max(diam + 2, cabe));      // aperta até 2 px de respiro; abaixo disso, rola
      const rola = passo * (cores.length - 1) + diam > largura + 0.5;
      Object.assign(lista.style, { overflowX: rola ? 'auto' : 'visible', overflowY: 'hidden', scrollbarWidth: 'none' });
      if (rola && !lista.__roda){                                          // [rola:horizontal] sem barra: roda do mouse anda de lado
        lista.__roda = true;
        lista.addEventListener('wheel', ev => { if (!ev.deltaY) return; ev.preventDefault(); lista.scrollLeft += ev.deltaY; }, { passive: false });
      }
      bolas.forEach((b, k) => {
        const cor = cores[k];
        if (!cor){ b.style.display = 'none'; return; }
        b.style.display = ''; b.style.left = Math.round(k * passo) + 'px';
        b.style.backgroundColor = cor; b.dataset.cor = cor;
        b.style.pointerEvents = 'auto'; b.style.cursor = 'pointer';
        b.dataset.tag = 'acao'; b.dataset.tagval = 'escolher-cor';         // os clones nascem sem o ouvinte do popup
        b.onclick = ev => { ev.stopPropagation(); pop.__cb.acao?.('escolher-cor', b); };
      });
    }
    pintarLinha(linha, canal);
  });

  /* conjunto de visual fixo: some com as cores e diz por quê (esse caso não existe na maquete) */
  if (!canais.length){
    for (const f of ['bg-cores', 'btn-aleatorio', 'btn-padrao']){ const el = pop.querySelector('[data-fig="' + f + '"]'); if (el) el.style.display = 'none'; }
    rotuloTexto(pop, 'dica-tela', 'este conjunto tem visual fixo — escolha só o nome');
  }

  /* nome */
  const campo = pop.querySelector('[data-fig="campo-nome"] input');
  if (campo){
    campo.type = 'text'; campo.value = estado.nome || ''; campo.maxLength = 16;
    campo.autocomplete = 'off'; campo.spellcheck = false; campo.placeholder = 'nome do personagem';
    campo.addEventListener('input', () => { estado.nome = campo.value; });
    campo.addEventListener('keydown', ev => { if (ev.key === 'Enter'){ ev.preventDefault(); comecar(pop, ctx, C); } });
  }
  const C = { pop, ctx, skin, tinta, canais, linhas, pintarLinha, repintar, corDe,
              aviso: t => rotuloTexto(pop, 'nota-nome', t) };
  prepararSeletor(pop, C);
  return {
    aba: () => {},
    acao: (a, el) => acaoPersonalizar(a, el, C),
    abre: (alvo, el) => { if (alvo !== 'seletor-cor') return false; abrirSeletor(C, el); return true; },   // sempre consome: sem linha de cor (visual fixo) o diálogo não abre vazio
    fechou: () => cancelarSeletor(C),
  };
}
function acaoPersonalizar(a, el, C){
  if (a === 'escolher-cor'){
    const linha = el.closest('[data-fig^="linha-cor-"]'), canal = linha?.dataset.canal;
    if (!canal || !C.tinta) return;
    estado.coresPor[C.tinta][canal] = el.dataset.cor;
    C.pintarLinha(linha, canal); C.repintar();
    return;
  }
  if (a === 'aleatorio' || a === 'padrao'){
    if (!C.tinta) return;
    for (const canal of C.canais){
      if (a === 'padrao'){ estado.coresPor[C.tinta][canal] = Personagem.PADRAO[C.tinta][canal]; continue; }
      const lista = Personagem.PRESETS[canal] || [];
      if (lista.length) estado.coresPor[C.tinta][canal] = lista[Math.floor(Math.random() * lista.length)];
    }
    C.linhas.forEach((l, i) => { if (C.canais[i]) C.pintarLinha(l, C.canais[i]); });
    C.repintar(); return;
  }
  if (a === 'comecar'){ comecar(C.pop, C.ctx, C); return; }
  if (a === 'confirmar-cor'){ Popup.mostrarExtra(C.pop, 'seletor-cor', false); return; }   // OK: a cor já foi aplicada ao vivo
}
/* ------------------------------------------------------------------ terminar: reserva o nome e devolve o personagem */
async function comecar(pop, ctx, C){
  if (ocupado) return;
  const skin = skinAtual();
  const nome = String(estado.nome || '').replace(/\s+/g, ' ').trim().slice(0, 16);
  if (nome.length < 3){ C.aviso(tr('o nome precisa de pelo menos 3 letras')); return; }
  ocupado = true; C.aviso(tr('conferindo o nome…'));
  let r = { ok: true, nome };
  try { if (ctx?.conta?.trocarNome) r = await ctx.conta.trocarNome(nome); } catch (e){ r = { ok: false, erro: String(e?.message || e) }; }
  ocupado = false;
  if (!r?.ok){ C.aviso(tr(r?.erro || 'esse nome não deu — tente outro')); return; }
  const p = { tipo: skin.id };
  if (skin.tinta) p.cores = { ...estado.coresPor[skin.tinta] };
  Personagem.gravar(p);
  const pronto = estado.aoPronto;
  encerrar();
  pronto?.({ ...p, nome: r.nome || nome });
}

/* ================================================================== o seletor de cor (RGB) */
const hsv2rgb = (h, s, v) => { const f = n => { const k = (n + h * 6) % 6; return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)))); }; return [f(5), f(3), f(1)]; };
const hex = ([r, g, b]) => '#' + [r, g, b].map(x => Math.max(0, Math.min(255, x | 0)).toString(16).padStart(2, '0')).join('');
function rgb2hsv(r, g, b){
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; if (d) h = (mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? ((b - r) / d + 2) : ((r - g) / d + 4)) / 6;
  return { h, s: mx ? d / mx : 0, v: mx };
}
function telaCanvas(caixa){
  const c = document.createElement('canvas');
  c.width = Math.round(parseFloat(caixa.style.width) || 100); c.height = Math.round(parseFloat(caixa.style.height) || 20);
  Object.assign(c.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', borderRadius: caixa.style.borderRadius || '0', pointerEvents: 'none' });
  caixa.style.pointerEvents = 'auto'; caixa.style.cursor = 'crosshair';
  caixa.appendChild(c);
  return c.getContext('2d');
}
function arrastar(caixa, pegar){
  caixa.addEventListener('pointerdown', ev => { try { caixa.setPointerCapture(ev.pointerId); } catch {} caixa.__on = ev.pointerId; pegar(ev); });
  caixa.addEventListener('pointermove', ev => { if (caixa.__on === ev.pointerId) pegar(ev); });
  const solta = () => { caixa.__on = null; };
  caixa.addEventListener('pointerup', solta); caixa.addEventListener('pointercancel', solta);
}
/** Transforma o `dialogo-seletor-cor` num diálogo de verdade: o popup.mjs já sabe abrir e fechar `.pf-extra`. */
function prepararSeletor(pop, C){
  /* Depois de preparado o nó muda de nome (`dialogo-seletor-cor` → `seletor-cor`, que é o que os botões apontam):
     procurar pelos dois, senão a segunda chamada não acha nada e o diálogo nunca abre. */
  const d = pop.querySelector(':scope > [data-fig="dialogo-seletor-cor"]') || pop.querySelector(':scope > [data-fig="seletor-cor"]');
  if (!d || d.__pronto) return d;
  d.__pronto = true; d.classList.add('pf-extra'); d.dataset.fig = 'seletor-cor';
  Object.assign(d.style, { display: 'none', zIndex: '900', pointerEvents: 'auto' });
  d.__sel = { h: 0, s: 1, v: 1, canal: null, linha: null, antes: '#ffffff' };
  const grad = d.querySelector('[data-fig="gradiente-cor"]'), matiz = d.querySelector('[data-fig="barra-matiz"]');
  if (grad){
    const cx = telaCanvas(grad);
    d.__pintarGrad = () => {
      const { width: w, height: h } = cx.canvas;
      const base = cx.createLinearGradient(0, 0, w, 0); base.addColorStop(0, '#fff'); base.addColorStop(1, hex(hsv2rgb(d.__sel.h, 1, 1)));
      cx.fillStyle = base; cx.fillRect(0, 0, w, h);
      const esc = cx.createLinearGradient(0, 0, 0, h); esc.addColorStop(0, 'rgba(0,0,0,0)'); esc.addColorStop(1, '#000');
      cx.fillStyle = esc; cx.fillRect(0, 0, w, h);
    };
    arrastar(grad, ev => {
      const r = grad.getBoundingClientRect();
      d.__sel.s = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      d.__sel.v = 1 - Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
      d.__aplicar?.();
    });
  }
  if (matiz){
    const cx = telaCanvas(matiz);
    const { width: w, height: h } = cx.canvas;
    const g = cx.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, hex(hsv2rgb(i / 6, 1, 1)));
    cx.fillStyle = g; cx.fillRect(0, 0, w, h);
    arrastar(matiz, ev => {
      const r = matiz.getBoundingClientRect();
      d.__sel.h = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      d.__pintarGrad?.(); d.__aplicar?.();
    });
  }
  return d;
}
function abrirSeletor(C, el){
  const pop = C.pop, d = prepararSeletor(pop, C); if (!d) return false;
  const linha = el.closest('[data-fig^="linha-cor-"]'), canal = linha?.dataset.canal;
  if (!canal || !C.tinta) return false;
  const cor = String(C.corDe(canal));
  Object.assign(d.__sel, rgb2hsv(parseInt(cor.slice(1, 3), 16), parseInt(cor.slice(3, 5), 16), parseInt(cor.slice(5, 7), 16)), { canal, linha, antes: cor });
  const campos = [...d.querySelectorAll('input')], previa = d.querySelector('[data-fig="cor-atual-previa"]');
  const aplicar = h => { if (previa) previa.style.backgroundColor = h; estado.coresPor[C.tinta][canal] = h; C.pintarLinha(linha, canal); C.repintar(); };
  d.__aplicar = () => {
    const v = hsv2rgb(d.__sel.h, d.__sel.s, d.__sel.v);
    campos.forEach((c, i) => { c.value = String(v[i] ?? ''); });
    aplicar(hex(v));
  };
  campos.forEach((c, i) => {
    c.type = 'text'; c.maxLength = 3; c.style.textAlign = 'center';
    c.oninput = () => {
      const v = [0, 1, 2].map(k => Math.max(0, Math.min(255, parseInt(campos[k].value, 10) || 0)));
      Object.assign(d.__sel, rgb2hsv(v[0], v[1], v[2]));
      d.__pintarGrad?.(); aplicar(hex(v));
    };
  });
  Popup.texto(pop, 'seletor-titulo', 'cor — ' + (Personagem.ROTULOS[C.tinta]?.[canal] || canal), d);
  d.__pintarGrad?.(); d.__aplicar();
  Popup.mostrarExtra(pop, 'seletor-cor', true);
  return true;
}
/** Cancelar: devolve a cor que estava antes (quem esconde o diálogo é o popup.mjs). */
function cancelarSeletor(C){
  const d = C.pop.querySelector('.pf-extra[data-fig="seletor-cor"]');
  if (!d?.__sel?.canal || !C.tinta) return;
  estado.coresPor[C.tinta][d.__sel.canal] = d.__sel.antes;
  C.pintarLinha(d.__sel.linha, d.__sel.canal); C.repintar();
}

/* ================================================================== o que o telas.mjs chama */
/** Monta a tela e devolve o punhado de ganchos que o telas.mjs liga no popup: { aba, acao, abre, fechou }. */
export function montar(nome, pop, def, ctx){
  if (!estado) iniciar(ctx);
  if (ctx?.aoPronto) estado.aoPronto = ctx.aoPronto;
  Popup.imagem(pop, 'fundo', './ui/figma/backgrounds/fundo-personagem.png');
  if (nome === 'personagem') return montarEscolha(pop, def, ctx);
  if (nome === 'personalizar') return montarPersonalizar(pop, def, ctx);
  return null;
}
