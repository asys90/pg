/* Painel Admin — Pokemon 3D Base (jogo local).
 * Editor de Mapa (zonas de spawn com raio) + Habitats por área. Fala com o servidor dev (porta 5190) nas rotas /admin/*,
 * que só respondem pra conta GM. Reaproveita o token do jogo (localStorage 'conta.token', mesma origem). */

import { instalarDados } from '/admin/dados.mjs';
import { instalarJogadores } from '/admin/jogadores.mjs';
import { instalarEventos } from '/admin/eventos.mjs';   // Fase 3: eventos ao vivo, aviso global, manutenção
import { instalarConteudo } from '/admin/conteudo.mjs'; // Fase 2: telas Missões, Espécies, Evoluções, Learnset
import { criarCamadas } from '/admin/camadas.mjs';
const DICAS = {   // o rodapé do Editor de Mapa muda com a ferramenta
  zonas: 'roda: zoom · arrastar: mover · clique numa área pra editar (arraste o miolo/as bordas) · arraste o centro/borda da zona',
  pontos: 'roda: zoom · arrastar o vazio: mover · clique num ponto pra editar, arraste pra mudar de lugar',
  pincel: 'roda: zoom · clique e arraste: pinta/apaga · Shift+arrastar: mover o mapa',
};

const BASE = location.protocol === 'https:' ? location.origin + '/servidor' : 'http://' + location.hostname + ':5190';
const FLIPX = -1;                                                         // o jogo espelha X (biblioteca sempre espelha); mundo.x = FLIPX * arquivo.x
const $ = id => document.getElementById(id);
const ler = k => { try { return localStorage.getItem(k); } catch { return null; } };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let token = ler('conta.token') || '';
async function api(rota, metodo = 'GET', corpo) {
  const r = await fetch(BASE + rota, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: corpo != null ? JSON.stringify(corpo) : undefined,
  });
  let d = {}; try { d = await r.json(); } catch {}
  return { status: r.status, ok: r.ok, ...d };
}
function toast(msg, erro = false) {
  const el = document.createElement('div'); if (erro) el.className = 'erro'; el.textContent = msg;
  $('toast').appendChild(el); setTimeout(() => el.remove(), 3600);
}

// ── Dados de referência (espécies) ───────────────────────────────────────────
let NOME_DEX = {};      // dex → nome
let GLB_DEX = {};       // dex → glb preferido
let DEX_COM_MODELO = [];// dex ordenados que têm modelo
async function carregarReferencia() {
  try { const p = await fetch('/pokedex.json').then(r => r.json()); for (const s of p.species || []) NOME_DEX[s.n] = s.name; } catch {}
  const m = await api('/admin/modelos');
  const porDex = {};
  for (const { glb, dex } of (m.modelos || [])) { (porDex[dex] ||= []).push(glb); }
  for (const dex of Object.keys(porDex)) {
    const lista = porDex[dex].sort((a, b) => (a.endsWith('_00.glb') ? -1 : 0) - (b.endsWith('_00.glb') ? -1 : 0) || a.length - b.length);
    GLB_DEX[dex] = lista[0];
  }
  DEX_COM_MODELO = Object.keys(GLB_DEX).map(Number).sort((a, b) => a - b);
  const dl = $('dl-especies');
  dl.innerHTML = DEX_COM_MODELO.map(d => `<option value="${String(d).padStart(4, '0')} ${esc(NOME_DEX[d] || '')}">`).join('');
}
const nomeDe = dex => NOME_DEX[dex] || ('Nº ' + dex);
/** Resolve o que o usuário digitou no campo de espécie: "0019", "19", "Rattata", "0019 Rattata". */
function resolverEspecie(txt) {
  txt = String(txt || '').trim();
  let dex = null;
  const mnum = txt.match(/^0*(\d+)/); if (mnum) dex = +mnum[1];
  if (!dex) { const low = txt.toLowerCase(); dex = DEX_COM_MODELO.find(d => (NOME_DEX[d] || '').toLowerCase() === low); }
  if (!dex || !GLB_DEX[dex]) return null;
  return { dex, glb: GLB_DEX[dex], nome: nomeDe(dex), peso: 100 };
}

// ── Estado ───────────────────────────────────────────────────────────────────
let eu = null;
let mapas = [];
let mapaAtual = 'kanto';
let dadosMapa = null;     // { caixas, grama, agua, nomes, areas }
let zonas = [];           // todas as zonas (todos os mapas)
let zonaSel = null;
let sujoZonas = false;
let habitats = { areas: {}, generico: [] };
let sujoHab = false;
const cam = { x: 0, z: 0, esc: 3 };
let enquadrado = false;   // o mapa só enquadra quando o canvas tem tamanho de verdade (evita o fit num canvas 0/minúsculo no boot)
let jogadorPos = null;    // { x, z, mapa } quando o jogo responde
// Áreas (caixas do mapa): o nome que o JOGO mostra vem 1º do data/cenas.json e só depois do `nomes` do mapa (nomeAreaCena)
let caixaSel = null;      // caixa selecionada (objeto de dadosMapa.caixas)
let sujoAreas = false, tilesMudados = false;
const nomesMudados = new Set();   // ids de área renomeados/criados (só esses vão pro servidor)
let areasOriginais = new Set();   // ids que já existiam no arquivo (o ID dessas não muda: habitats/níveis apontam pra ele)
let nomesCena = {};       // id → nome no cenas.json
let idsUsados = new Set();// todo id de área de todas as cenas (id novo não pode herdar habitat de área de outro mapa)
let desenhandoArea = false, rascunho = null;
let foto = null;          // fundo "minimapa" do mapa atual ({ img, x0, z0, esc, w, h, fonte, mapa })
const nomeArea = a => nomesCena[a] || dadosMapa?.nomes?.[a] || ('Área ' + a);

const CORES = ['#ff5d5d', '#4da3ff', '#3ecf8e', '#ffcf3a', '#c678dd', '#ff9d4d', '#56d4dd', '#f06292'];
const corZona = z => CORES[(z.__i ?? 0) % CORES.length];

// ── Boot ─────────────────────────────────────────────────────────────────────
async function iniciar() {
  const quem = await api('/admin/eu');
  if (quem.status === 401 || !token) { mostrarLogin(); return; }
  if (!quem.gm) { mostrarLogin('A conta "' + (quem.usuario || '') + '" não é GM.'); return; }
  eu = quem;
  $('login').hidden = true; $('app').hidden = false;
  $('eu-nome').textContent = quem.nome || quem.usuario;
  await carregarReferencia();
  await carregarTudo();
  ligarUI();
  if (!dadosInstalado){ dadosInstalado = true; instalarDados({ api, toast, avisarJogo }); instalarJogadores({ api, toast, canal, resolverEspecie }); instalarEventos({ api, toast }); instalarConteudo({ api, toast, avisarJogo }); }
}
let dadosInstalado = false;
function mostrarLogin(msg = '') {
  $('app').hidden = true; $('login').hidden = false;
  $('l-msg').textContent = msg;
}
$('f-login').addEventListener('submit', async e => {
  e.preventDefault();
  $('l-msg').textContent = '';
  const r = await api('/conta/entrar', 'POST', { usuario: $('l-usuario').value, senha: $('l-senha').value });
  if (!r.ok) { $('l-msg').textContent = r.erro || 'Falha no login.'; return; }
  if (!r.gm) { $('l-msg').textContent = 'Essa conta não é GM.'; return; }
  token = r.token; try { localStorage.setItem('conta.token', token); } catch {}
  iniciar();
});
$('b-sair').addEventListener('click', () => { location.href = '/'; });

async function carregarTudo() {
  const [lm, lz, lh] = await Promise.all([api('/admin/mapas'), api('/admin/zonas'), api('/admin/habitats')]);
  await carregarCenas();
  mapas = lm.mapas || ['kanto'];
  zonas = (lz.zonas || []).map((z, i) => ({ ...z, __i: i }));
  habitats = { areas: lh.areas || {}, generico: lh.generico || [] };
  $('m-mapa').innerHTML = mapas.map(m => `<option${m === mapaAtual ? ' selected' : ''}>${esc(m)}</option>`).join('');
  if (!mapas.includes(mapaAtual)) mapaAtual = mapas[0];
  await trocarMapa(mapaAtual);
  renderHabitats();
}

// ╔═══════════════════════════════ EDITOR DE MAPA ═══════════════════════════════╗
const tela = $('m-tela'), cv = $('m-canvas'), ctx = cv.getContext('2d');
const camadas = { minimapa: true, caixas: true, grama: true, agua: true, piso: true, zonas: true, npcs: false, treinadores: false };
let Camadas = null;   // admin/camadas.mjs (pontos e pincel) — criado no ligarUI, depois do login

async function carregarCenas() {
  nomesCena = {}; idsUsados = new Set();
  const ce = await fetch('/data/cenas.json?t=' + Date.now()).then(r => r.ok ? r.json() : null).catch(() => null);
  for (const c of ce?.cenas || []) for (const a of c.areas || []) { idsUsados.add(+a.id); if (!(a.id in nomesCena)) nomesCena[a.id] = a.nome; }
}
async function trocarMapa(nome, semPerguntar = false) {
  if (!semPerguntar && (sujoAreas || Camadas?.sujo()) && nome !== mapaAtual && !confirm('Este mapa tem alterações não salvas (áreas/camadas). Trocar de mapa e descartar?')) { $('m-mapa').value = mapaAtual; return; }
  Camadas?.reset();
  mapaAtual = nome;
  $('m-mapa').value = nome;
  dadosMapa = null; foto = null; caixaSel = null; sujoAreas = false; tilesMudados = false; nomesMudados.clear(); atualizarSujoMapa(); abrirEditorArea(); desenhar();
  try { dadosMapa = await fetch('/data/' + nome + '.json?t=' + Date.now()).then(r => r.ok ? r.json() : null); } catch {}
  areasOriginais = new Set((dadosMapa?.areas || []).map(Number));
  for (const a of areasOriginais) idsUsados.add(a);
  ajustarCanvas();
  if (cv.clientWidth > 50) { fitMapa(); enquadrado = true; } else enquadrado = false;   // sem tamanho ainda: enquadra quando crescer (ResizeObserver)
  renderListaZonas(); renderListaAreas(); Camadas?.atualizarContagem();
  desenhar();
  carregarFoto(nome);
}
async function carregarFoto(nome) {
  if (!dadosMapa) return;
  $('m-foto').textContent = 'fundo: gerando a foto de cima…';
  const { fotoDoMapa } = await import('/admin/foto_mapa.mjs');   // o Three só carrega quando precisa
  const f = await fotoDoMapa(nome, dadosMapa);
  if (nome !== mapaAtual) return;                                   // trocou de mapa no meio
  foto = f ? { ...f, mapa: nome } : null;
  $('m-foto').textContent = f ? 'fundo: ' + f.fonte : 'fundo: sem cenário pra fotografar';
  desenhar();
}
function zonasDoMapa() { return zonas.filter(z => z.mapa === mapaAtual); }

function fitMapa() {
  const cxs = (dadosMapa?.caixas || []).map(c => ({ x: FLIPX * c.x, z: c.z, sx: c.sx, sz: c.sz }));
  if (!cxs.length) { cam.x = 0; cam.z = 0; cam.esc = 3; return; }
  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (const c of cxs) { minx = Math.min(minx, c.x - c.sx / 2); maxx = Math.max(maxx, c.x + c.sx / 2); minz = Math.min(minz, c.z - c.sz / 2); maxz = Math.max(maxz, c.z + c.sz / 2); }
  cam.x = (minx + maxx) / 2; cam.z = (minz + maxz) / 2;
  const W = cv.clientWidth || 800, H = cv.clientHeight || 600;
  cam.esc = Math.min(W / (maxx - minx + 20), H / (maxz - minz + 20));
}
function ajustarCanvas() {
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, cv.clientWidth * dpr); cv.height = Math.max(1, cv.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const W = () => cv.clientWidth, H = () => cv.clientHeight;
const w2t = (wx, wz) => [(wx - cam.x) * cam.esc + W() / 2, (wz - cam.z) * cam.esc + H() / 2];
const t2w = (px, py) => [(px - W() / 2) / cam.esc + cam.x, (py - H() / 2) / cam.esc + cam.z];

function desenhar() {
  if (!cv.clientWidth) return;
  ctx.clearRect(0, 0, W(), H());
  ctx.fillStyle = '#0a0d12'; ctx.fillRect(0, 0, W(), H());
  if (!dadosMapa) { ctx.fillStyle = '#8b93a7'; ctx.font = '14px system-ui'; ctx.fillText('carregando mapa…', 16, 28); return; }

  // fundo: a foto de cima do mapa (a mesma do minimapa do jogo, ou gerada do GLB)
  const comFoto = camadas.minimapa && foto && foto.mapa === mapaAtual;
  if (comFoto) {
    const [px, py] = w2t(foto.x0, foto.z0);
    ctx.imageSmoothingEnabled = cam.esc < foto.esc * 2;
    ctx.drawImage(foto.img, px, py, foto.w / foto.esc * cam.esc, foto.h / foto.esc * cam.esc);
    ctx.imageSmoothingEnabled = true;
  }
  // caixas de área
  if (camadas.caixas) {
    for (const c of dadosMapa.caixas || []) {
      const r = rectTela(c), sel = c === caixaSel, mesmaArea = caixaSel && c.a === caixaSel.a;
      ctx.fillStyle = sel ? 'rgba(255,207,58,.10)' : comFoto ? 'rgba(10,13,18,.10)' : 'rgba(80,100,140,.07)';
      ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
      ctx.lineWidth = sel ? 2 : 1; ctx.strokeStyle = sel ? '#ffcf3a' : mesmaArea ? 'rgba(255,207,58,.6)' : comFoto ? 'rgba(235,240,255,.55)' : 'rgba(120,140,180,.35)';
      ctx.setLineDash(!areasOriginais.has(c.a) ? [6, 4] : []); ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); ctx.setLineDash([]);
    }
    if (cam.esc > 0.9) for (const c of dadosMapa.caixas || []) {   // rótulos por cima de todas as caixas (pílula escura: legível em cima da foto)
      const r = rectTela(c), txt = nomeArea(c.a), sel = c === caixaSel;
      ctx.font = (sel ? 'bold ' : '') + '11px system-ui';
      const tw = ctx.measureText(txt).width + 10, cx = (r.x0 + r.x1) / 2;
      if (tw > r.x1 - r.x0 + 30 && !sel) continue;
      ctx.fillStyle = sel ? 'rgba(255,207,58,.92)' : 'rgba(10,13,18,.72)';
      ctx.beginPath(); ctx.roundRect(cx - tw / 2, r.y0 + 3, tw, 16, 8); ctx.fill();
      ctx.fillStyle = sel ? '#1a1405' : '#e6ebf5'; ctx.textAlign = 'center'; ctx.fillText(txt, cx, r.y0 + 15); ctx.textAlign = 'left';
    }
    if (caixaSel) { const r = rectTela(caixaSel); ctx.fillStyle = '#ffcf3a'; for (const [x, y] of alcas(r)) ctx.fillRect(x - 4, y - 4, 8, 8); }
  }
  if (rascunho) {
    const [ax, ay] = w2t(rascunho.x0, rascunho.z0), [bx, by] = w2t(rascunho.x1, rascunho.z1);
    ctx.fillStyle = 'rgba(255,207,58,.12)'; ctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
    ctx.strokeStyle = '#ffcf3a'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)); ctx.setLineDash([]);
    ctx.fillStyle = '#ffcf3a'; ctx.font = '12px system-ui';
    ctx.fillText(`${Math.abs(rascunho.x1 - rascunho.x0).toFixed(1)} × ${Math.abs(rascunho.z1 - rascunho.z0).toFixed(1)} m`, Math.max(ax, bx) + 6, Math.max(ay, by) + 14);
  }
  // grama e água (tiles pequenos)
  const tile = Math.max(1.2, cam.esc * 0.9);
  if (camadas.grama) { ctx.fillStyle = 'rgba(80,200,100,.5)'; for (const t of dadosMapa.grama || []) { const [px, py] = w2t(FLIPX * t.x, t.z); ctx.fillRect(px - tile / 2, py - tile / 2, tile, tile); } }
  if (camadas.agua) { ctx.fillStyle = 'rgba(70,150,255,.5)'; for (const t of dadosMapa.agua || []) { const [px, py] = w2t(FLIPX * t.x, t.z); ctx.fillRect(px - tile / 2, py - tile / 2, tile, tile); } }

  // zonas
  if (camadas.zonas) for (const z of zonasDoMapa()) {
    const [px, py] = w2t(z.x, z.z), r = z.raio * cam.esc, cor = corZona(z), sel = z === zonaSel;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = cor + (z.ativa === false ? '14' : '28'); ctx.fill();
    ctx.lineWidth = sel ? 2.5 : 1.5; ctx.strokeStyle = cor + (z.ativa === false ? '66' : 'ff'); ctx.setLineDash(z.ativa === false ? [5, 4] : []); ctx.stroke(); ctx.setLineDash([]);
    // centro
    ctx.beginPath(); ctx.arc(px, py, sel ? 6 : 4, 0, Math.PI * 2); ctx.fillStyle = cor; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    // punho do raio (à direita)
    if (sel) { ctx.beginPath(); ctx.arc(px + r, py, 5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = cor; ctx.lineWidth = 2; ctx.stroke(); }
    if (cam.esc > 1) { ctx.fillStyle = '#fff'; ctx.font = (sel ? 'bold ' : '') + '12px system-ui'; ctx.textAlign = 'center'; ctx.fillText(z.nome, px, py - r - 6); ctx.textAlign = 'left'; }
  }
  Camadas?.desenhar(ctx);   // piso de caverna, pontos (NPCs/portas/treinadores) e o pincel
  // jogador
  if (jogadorPos && jogadorPos.mapa === mapaAtual) {
    const [px, py] = w2t(jogadorPos.x, jogadorPos.z);
    ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fillStyle = '#ffcf3a'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ffcf3a'; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('você', px, py - 9); ctx.textAlign = 'left';
  }
}

// interação do canvas
let arraste = null;  // { tipo:'pan'|'centro'|'raio'|'mover'|'borda'|'nova', ... }
let colocando = false;
const snap = v => Math.round(v * 2) / 2;   // áreas andam de 0,5 em 0,5 m (as do jogo são inteiras ou ,5)
/** Retângulo da caixa na tela. Caixa em coords de arquivo (x espelhado); a tela é o mundo. */
function rectTela(c) { const [px, py] = w2t(FLIPX * c.x, c.z), w = c.sx * cam.esc / 2, h = c.sz * cam.esc / 2; return { x0: px - w, y0: py - h, x1: px + w, y1: py + h }; }
function rectMundo(c) { const x = FLIPX * c.x; return { x0: x - c.sx / 2, x1: x + c.sx / 2, z0: c.z - c.sz / 2, z1: c.z + c.sz / 2 }; }
function porRectMundo(c, r) { c.sx = +(r.x1 - r.x0).toFixed(2); c.sz = +(r.z1 - r.z0).toFixed(2); c.x = +(FLIPX * (r.x0 + r.x1) / 2).toFixed(2); c.z = +((r.z0 + r.z1) / 2).toFixed(2); }
const alcas = r => { const mx = (r.x0 + r.x1) / 2, my = (r.y0 + r.y1) / 2; return [[r.x0, r.y0], [mx, r.y0], [r.x1, r.y0], [r.x1, my], [r.x1, r.y1], [mx, r.y1], [r.x0, r.y1], [r.x0, my]]; };
/** Alça/borda/miolo da caixa SELECIONADA sob o cursor. nx/ny: −1 borda esquerda/de cima, 1 direita/de baixo. */
function alvoCaixa(px, py) {
  if (!caixaSel || !camadas.caixas) return null;
  const r = rectTela(caixaSel), T = 7;
  if (px < r.x0 - T || px > r.x1 + T || py < r.y0 - T || py > r.y1 + T) return null;
  const nx = Math.abs(px - r.x0) <= T ? -1 : Math.abs(px - r.x1) <= T ? 1 : 0, ny = Math.abs(py - r.y0) <= T ? -1 : Math.abs(py - r.y1) <= T ? 1 : 0;
  if (nx || ny) return { tipo: 'borda', nx, ny };
  return { tipo: 'mover' };
}
/** A caixa MENOR sob o ponto (a mais específica, quando uma área fica dentro de outra). */
/** Área (id) da caixa MENOR que contém o ponto do mundo — pra ponto/tile novo; não depende da camada "caixas" estar visível. */
function areaEm(wx, wz) {
  let melhor = null;
  for (const c of dadosMapa?.caixas || []) { const r = rectMundo(c); if (wx >= r.x0 && wx <= r.x1 && wz >= r.z0 && wz <= r.z1 && (!melhor || c.sx * c.sz < melhor.sx * melhor.sz)) melhor = c; }
  return melhor ? melhor.a : null;
}
function caixaNoPonto(px, py) {
  if (!camadas.caixas) return null;
  let melhor = null;
  for (const c of dadosMapa?.caixas || []) { const r = rectTela(c); if (px >= r.x0 && px <= r.x1 && py >= r.y0 && py <= r.y1 && (!melhor || c.sx * c.sz < melhor.sx * melhor.sz)) melhor = c; }
  return melhor;
}
const CURSOR_BORDA = { '-1,-1': 'nwse-resize', '1,1': 'nwse-resize', '1,-1': 'nesw-resize', '-1,1': 'nesw-resize', '-1,0': 'ew-resize', '1,0': 'ew-resize', '0,-1': 'ns-resize', '0,1': 'ns-resize' };
function pontoZona(px, py) {   // qual elemento está sob o cursor
  for (const z of zonasDoMapa()) {
    const [zx, zy] = w2t(z.x, z.z), r = z.raio * cam.esc;
    if (z === zonaSel && Math.hypot(px - (zx + r), py - zy) <= 8) return { z, tipo: 'raio' };
  }
  for (const z of zonasDoMapa()) { const [zx, zy] = w2t(z.x, z.z); if (Math.hypot(px - zx, py - zy) <= 9) return { z, tipo: 'centro' }; }
  return null;
}
tela.addEventListener('mousedown', e => {
  const rect = cv.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top;
  if (e.button !== 0) return;
  if (colocando) {
    const [wx, wz] = t2w(px, py);
    criarZona(wx, wz); colocando = false; tela.classList.remove('colocando'); $('m-nova').classList.remove('on');
    return;
  }
  if (desenhandoArea) {
    const [wx, wz] = t2w(px, py);
    rascunho = { x0: snap(wx), z0: snap(wz), x1: snap(wx), z1: snap(wz) }; arraste = { tipo: 'nova' };
    return;
  }
  if (Camadas?.mousedown(px, py, e)) return;   // ferramenta Pontos/Pincel: o clique é dela
  const alvo = pontoZona(px, py);
  if (alvo) { selecionarZona(alvo.z); arraste = { tipo: alvo.tipo }; return; }
  const ac = alvoCaixa(px, py);
  if (ac) {
    const [wx, wz] = t2w(px, py);
    arraste = { ...ac, wx, wz, r0: rectMundo(caixaSel), sx: e.clientX, sy: e.clientY, mexeu: false };
    return;
  }
  arraste = { tipo: 'pan', sx: e.clientX, sy: e.clientY, cx: cam.x, cz: cam.z, px, py }; tela.classList.add('arrastando');
});
window.addEventListener('mousemove', e => {
  const rect = cv.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top;
  const dentro = px >= 0 && py >= 0 && px <= rect.width && py <= rect.height;
  if (dentro) { const [wx, wz] = t2w(px, py); $('m-leitura').textContent = `x ${wx.toFixed(1)}   z ${wz.toFixed(1)}`; }
  if (!arraste && Camadas?.mousemove(px, py, e)) return;
  if (!arraste) {   // cursor diz o que o arraste vai fazer
    if (dentro) { const ac = colocando || desenhandoArea || pontoZona(px, py) ? null : alvoCaixa(px, py); tela.style.cursor = !ac ? '' : ac.tipo === 'mover' ? 'move' : CURSOR_BORDA[ac.nx + ',' + ac.ny]; }
    return;
  }
  if (arraste.tipo === 'pan') { cam.x = arraste.cx - (e.clientX - arraste.sx) / cam.esc; cam.z = arraste.cz - (e.clientY - arraste.sy) / cam.esc; desenhar(); }
  else if (arraste.tipo === 'centro' && zonaSel) { const [wx, wz] = t2w(px, py); zonaSel.x = +wx.toFixed(2); zonaSel.z = +wz.toFixed(2); marcarSujo(); atualizarCamposZona(); desenhar(); }
  else if (arraste.tipo === 'raio' && zonaSel) { const [wx, wz] = t2w(px, py); zonaSel.raio = +Math.max(1, Math.hypot(wx - zonaSel.x, wz - zonaSel.z)).toFixed(1); marcarSujo(); atualizarCamposZona(); desenhar(); }
  else if (arraste.tipo === 'nova') { const [wx, wz] = t2w(px, py); rascunho.x1 = snap(wx); rascunho.z1 = snap(wz); desenhar(); }
  else if ((arraste.tipo === 'mover' || arraste.tipo === 'borda') && caixaSel) {
    if (!arraste.mexeu && Math.hypot(e.clientX - arraste.sx, e.clientY - arraste.sy) < 3) return;   // clique não mexe na caixa
    arraste.mexeu = true;
    const [wx, wz] = t2w(px, py), r = { ...arraste.r0 };
    if (arraste.tipo === 'mover') { const dx = snap(wx - arraste.wx), dz = snap(wz - arraste.wz); r.x0 += dx; r.x1 += dx; r.z0 += dz; r.z1 += dz; }
    else {
      if (arraste.nx < 0) r.x0 = Math.min(snap(wx), r.x1 - 1); if (arraste.nx > 0) r.x1 = Math.max(snap(wx), r.x0 + 1);
      if (arraste.ny < 0) r.z0 = Math.min(snap(wz), r.z1 - 1); if (arraste.ny > 0) r.z1 = Math.max(snap(wz), r.z0 + 1);
    }
    porRectMundo(caixaSel, r); marcarSujoAreas(); atualizarCamposArea(); desenhar();
  }
});
window.addEventListener('mouseup', e => {
  if (!arraste && Camadas?.mouseup(e)) return;
  const a = arraste; arraste = null;
  if (!a) return;
  if (a.tipo === 'pan') {
    tela.classList.remove('arrastando');
    if (Math.hypot(e.clientX - a.sx, e.clientY - a.sy) < 4) {                    // clique (sem arrastar): selecionar a área — ou, nas camadas, soltar o ponto
      if (Camadas && Camadas.ferramenta() !== 'zonas') Camadas.cliqueVazio(); else selecionarCaixa(caixaNoPonto(a.px, a.py));
    }
  } else if (a.tipo === 'nova') {
    const r = rascunho; rascunho = null; sairDoModoArea();
    const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1), z0 = Math.min(r.z0, r.z1), z1 = Math.max(r.z0, r.z1);
    if (x1 - x0 < 2 || z1 - z0 < 2) { toast('Área pequena demais — arraste um retângulo de pelo menos 2 × 2 m.', true); desenhar(); return; }
    criarArea({ x0, x1, z0, z1 });
  }
});
window.addEventListener('keydown', e => { if (e.key === 'Escape' && (desenhandoArea || rascunho)) { rascunho = null; arraste = null; sairDoModoArea(); desenhar(); } });
tela.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = cv.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top;
  const [wx, wz] = t2w(px, py);
  cam.esc = Math.min(40, Math.max(0.3, cam.esc * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
  const [nx, ny] = w2t(wx, wz); cam.x += (nx - px) / cam.esc; cam.z += (ny - py) / cam.esc;
  desenhar();
}, { passive: false });

// ── CRUD de zonas ─────────────────────────────────────────────────────────────
function novaZonaBase(x, z) {
  return { id: 'z' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), mapa: mapaAtual, nome: 'Zona ' + (zonasDoMapa().length + 1),
    x: +x.toFixed(2), z: +z.toFixed(2), raio: 12, especies: [], lvMin: 3, lvMax: 6, max: 4, intervalo: 8, shiny: 0, ativa: true, __i: zonas.length };
}
function criarZona(x, z) { const nz = novaZonaBase(x, z); zonas.push(nz); marcarSujo(); renderListaZonas(); selecionarZona(nz); desenhar(); }
function selecionarZona(z) { zonaSel = z; if (z && caixaSel) { caixaSel = null; abrirEditorArea(); renderListaAreas(); } renderListaZonas(); abrirEditorZona(); desenhar(); }
function marcarSujo() { sujoZonas = true; atualizarSujoMapa(); }
function atualizarSujoMapa() { $('m-sujo').hidden = !(sujoZonas || sujoAreas || Camadas?.sujo()); }

// ── Áreas: caixas com nome ────────────────────────────────────────────────────
function marcarSujoAreas() { sujoAreas = true; atualizarSujoMapa(); }
function selecionarCaixa(c) {
  caixaSel = c || null;
  if (c && zonaSel) { zonaSel = null; abrirEditorZona(); renderListaZonas(); }
  abrirEditorArea(); renderListaAreas(); desenhar();
}
function renderListaAreas() {
  const cxs = dadosMapa?.caixas || [];
  $('a-qtd').textContent = '(' + new Set(cxs.map(c => c.a)).size + ')';
  const filtro = ($('a-filtro').value || '').toLowerCase();
  const itens = cxs.map(c => ({ c, nome: nomeArea(c.a) })).filter(o => !filtro || o.nome.toLowerCase().includes(filtro) || String(o.c.a).includes(filtro))
    .sort((p, q) => p.nome.localeCompare(q.nome, undefined, { numeric: true }) || p.c.a - q.c.a);
  const nCaixas = {}; for (const c of cxs) nCaixas[c.a] = (nCaixas[c.a] || 0) + 1;
  $('a-lista').innerHTML = itens.map(({ c, nome }) => `<button data-i="${cxs.indexOf(c)}" class="${c === caixaSel ? 'atual' : ''}">
    <span style="flex:1">${esc(nome)}${areasOriginais.has(c.a) ? '' : ' <span class="novo">nova</span>'}</span>
    <span class="fraco">${c.a}${nCaixas[c.a] > 1 ? ' · ' + nCaixas[c.a] + ' caixas' : ''}</span></button>`).join('') || '<span class="fraco">Nenhuma área.</span>';
  for (const b of $('a-lista').querySelectorAll('button')) b.onclick = () => { const c = cxs[+b.dataset.i]; selecionarCaixa(c); centrarEm(c); };
}
function centrarEm(c) {
  cam.x = FLIPX * c.x; cam.z = c.z;
  const W0 = cv.clientWidth || 800, H0 = cv.clientHeight || 600;
  if (c.sx * cam.esc > W0 * 0.9 || c.sz * cam.esc > H0 * 0.9) cam.esc = Math.min(W0 / (c.sx * 1.4), H0 / (c.sz * 1.4));
  desenhar();
}
function abrirEditorArea() {
  $('a-edit').hidden = !caixaSel;
  if (caixaSel) atualizarCamposArea();
}
function atualizarCamposArea() {
  const c = caixaSel; if (!c) return;
  const nova = !areasOriginais.has(c.a), irmas = dadosMapa.caixas.filter(k => k.a === c.a).length;
  $('a-titulo').textContent = nomeArea(c.a);
  if (document.activeElement !== $('a-nome')) $('a-nome').value = nomeArea(c.a);
  if (document.activeElement !== $('a-id')) $('a-id').value = c.a;
  $('a-id').disabled = !nova;
  $('a-id-ajuda').textContent = nova ? 'Área nova: dá pra escolher o ID antes de salvar.' : 'ID fixo (habitats, nível dos selvagens e a Pokédex apontam pra ele).';
  for (const [id, v] of [['a-x', FLIPX * c.x], ['a-z', c.z], ['a-sx', c.sx], ['a-sz', c.sz]]) if (document.activeElement !== $(id)) $(id).value = +v.toFixed(2);
  const fora = tilesDentro(c);
  $('a-info').innerHTML = (irmas > 1 ? `Esta área tem <b>${irmas} caixas</b> (formato em L etc.). ` : '') +
    `Dentro desta caixa: <b>${fora.dentro}</b> tiles de grama/água` + (fora.grama.length + fora.agua.length ? `, <b>${fora.grama.length + fora.agua.length}</b> deles ainda de outra área.` : '.');
  $('a-puxar').disabled = !(fora.grama.length + fora.agua.length);
  $('a-del').textContent = irmas > 1 ? 'Excluir esta caixa' : 'Excluir área';
}
/** Tiles de grama/água dentro da caixa; grama/agua = índices dos que são de OUTRA área (o spawn agrupa pelo tile.a). */
function tilesDentro(c) {
  const r = { x0: c.x - c.sx / 2, x1: c.x + c.sx / 2, z0: c.z - c.sz / 2, z1: c.z + c.sz / 2 }, out = { dentro: 0, grama: [], agua: [] };
  for (const k of ['grama', 'agua']) (dadosMapa?.[k] || []).forEach((t, i) => {
    if (t.x < r.x0 || t.x > r.x1 || t.z < r.z0 || t.z > r.z1) return;
    out.dentro++; if (t.a !== c.a) out[k].push(i);
  });
  return out;
}
function proximoIdArea() {
  const doMapa = (dadosMapa?.caixas || []).map(c => c.a), usados = new Set([...idsUsados, ...doMapa]);
  let id = Math.max(1000, ...doMapa) + 1;
  while (usados.has(id)) id++;
  return id;
}
function entrarModoArea() {
  if (!camadas.caixas) { camadas.caixas = true; const i = $('m-camadas').querySelector('[data-cam="caixas"]'); if (i) i.checked = true; }
  colocando = false; tela.classList.remove('colocando'); $('m-nova').classList.remove('on');
  desenhandoArea = true; tela.classList.add('colocando'); tela.style.cursor = ''; $('m-nova-area').classList.add('on');
  toast('Arraste um retângulo no mapa pra criar a área (Esc cancela).');
}
function sairDoModoArea() { desenhandoArea = false; tela.classList.remove('colocando'); $('m-nova-area').classList.remove('on'); }
function criarArea(r) {
  const id = proximoIdArea(), c = { a: id, x: 0, y: 0, z: 0, sx: 1, sy: 60, sz: 1 };
  porRectMundo(c, r);
  dadosMapa.caixas.push(c); (dadosMapa.areas ||= []).push(id); (dadosMapa.nomes ||= {})[id] = 'Nova área ' + id;
  nomesMudados.add(id); idsUsados.add(id);
  marcarSujoAreas(); selecionarCaixa(c);
  $('a-nome').focus(); $('a-nome').select();
}
function adicionarCaixa() {   // outra caixa na MESMA área (pra área que não é retângulo)
  const c0 = caixaSel; if (!c0) return;
  const c = { ...c0, x: +(c0.x + FLIPX * (c0.sx / 2 + 4)).toFixed(2), sx: Math.min(c0.sx, 20), sz: Math.min(c0.sz, 20) };
  dadosMapa.caixas.push(c); marcarSujoAreas(); selecionarCaixa(c);
  toast('Caixa adicionada à área "' + nomeArea(c.a) + '". Arraste e redimensione.');
}
function excluirCaixa() {
  const c = caixaSel; if (!c) return;
  const irmas = dadosMapa.caixas.filter(k => k.a === c.a).length;
  const msg = irmas > 1 ? `Excluir esta caixa da área "${nomeArea(c.a)}"? (as outras ${irmas - 1} ficam)`
    : `Excluir a área "${nomeArea(c.a)}" (${c.a})?\nO jogo deixa de mostrar o nome dela; habitats e tiles de grama continuam com o ID.`;
  if (!confirm(msg)) return;
  dadosMapa.caixas.splice(dadosMapa.caixas.indexOf(c), 1);
  if (irmas === 1 && !areasOriginais.has(c.a)) { dadosMapa.areas = (dadosMapa.areas || []).filter(a => a !== c.a); delete dadosMapa.nomes[c.a]; nomesMudados.delete(c.a); }
  caixaSel = null; marcarSujoAreas(); abrirEditorArea(); renderListaAreas(); desenhar();
}
function puxarTiles() {
  const c = caixaSel; if (!c) return;
  const t = tilesDentro(c), n = t.grama.length + t.agua.length;
  if (!n || !confirm(`Passar ${n} tile(s) de grama/água de dentro desta caixa pra área "${nomeArea(c.a)}"?\nOs Pokémon desses tiles passam a vir do habitat desta área.`)) return;
  for (const i of t.grama) dadosMapa.grama[i].a = c.a;
  for (const i of t.agua) dadosMapa.agua[i].a = c.a;
  tilesMudados = true; marcarSujoAreas(); atualizarCamposArea();
  toast(n + ' tile(s) agora são de "' + nomeArea(c.a) + '". Cadastre as espécies em Habitats por Área.');
}
function trocarIdArea(novo) {
  const c = caixaSel; if (!c || areasOriginais.has(c.a)) return;
  if (!Number.isInteger(novo) || novo < 1 || novo > 99999999) { toast('ID precisa ser um número inteiro.', true); return false; }
  if (novo === c.a) return true;
  if ((dadosMapa.caixas || []).some(k => k.a === novo)) { toast('Já existe uma área ' + novo + ' neste mapa.', true); return false; }
  if (idsUsados.has(novo) && !confirm('O ID ' + novo + ' já é usado por uma área de outro mapa (ela tem habitat/nível próprios). Usar mesmo assim?')) return false;
  const velho = c.a, nome = dadosMapa.nomes[velho];
  for (const k of dadosMapa.caixas) if (k.a === velho) k.a = novo;
  for (const lista of [dadosMapa.grama || [], dadosMapa.agua || []]) for (const t of lista) if (t.a === velho) { t.a = novo; tilesMudados = true; }
  dadosMapa.areas = (dadosMapa.areas || []).map(a => a === velho ? novo : a);
  delete dadosMapa.nomes[velho]; dadosMapa.nomes[novo] = nome; nomesMudados.delete(velho); nomesMudados.add(novo); idsUsados.add(novo);
  marcarSujoAreas(); renderListaAreas(); desenhar();
  return true;
}
async function salvarAreas() {
  const nomes = {}; for (const a of nomesMudados) if (dadosMapa.nomes?.[a]) nomes[a] = dadosMapa.nomes[a];
  const corpo = { mapa: mapaAtual, caixas: dadosMapa.caixas, nomes };
  if (tilesMudados) corpo.tilesArea = { grama: (dadosMapa.grama || []).map(t => t.a), agua: (dadosMapa.agua || []).map(t => t.a) };
  const r = await api('/admin/mapa-areas', 'POST', corpo);
  if (!r.ok) { toast(r.erro || 'Falha ao salvar as áreas.', true); return false; }
  for (const a of nomesMudados) nomesCena[a] = dadosMapa.nomes[a];   // o servidor gravou o nome nos dois lugares
  areasOriginais = new Set(dadosMapa.caixas.map(c => c.a));
  sujoAreas = false; tilesMudados = false; nomesMudados.clear(); atualizarSujoMapa();
  toast(`Áreas salvas: ${r.areas} áreas, ${r.caixas} caixas` + (r.novas ? ` · ${r.novas} nova(s)` : '') + (r.removidas ? ` · ${r.removidas} removida(s)` : '') + '.');
  avisarJogo(mapaAtual, true);
  renderListaAreas(); atualizarCamposArea(); renderHabitats(); desenhar();
  return true;
}
async function salvarMapa() {
  if (!sujoZonas && !sujoAreas && !Camadas?.sujo()) { toast('Nada pra salvar.'); return; }
  /* camadas ANTES das áreas: o "Puxar grama" das áreas manda os tiles por posição na lista, e o pincel muda a lista — gravando
     a lista nova primeiro, as posições que as áreas mandam batem com o arquivo */
  if (Camadas?.sujo() && !await Camadas.salvar()) return;
  if (sujoAreas) await salvarAreas();
  if (sujoZonas) await salvarZonas();
}

function renderListaZonas() {
  const lista = zonasDoMapa();
  $('m-qtd').textContent = '(' + lista.length + ')';
  $('m-ajuda').hidden = lista.length > 0;
  $('m-lista').innerHTML = lista.map(z => `<button data-id="${z.id}" class="${z === zonaSel ? 'atual' : ''}">
    <span class="bola" style="background:${corZona(z)}"></span>
    <span style="flex:1">${esc(z.nome)}</span>
    <span class="fraco">${z.especies.length} esp · r${z.raio}</span>${z.ativa === false ? ' <span class="fraco">(off)</span>' : ''}</button>`).join('');
  for (const b of $('m-lista').querySelectorAll('button')) b.onclick = () => selecionarZona(lista.find(z => z.id === b.dataset.id));
}
function abrirEditorZona() {
  $('m-edit').hidden = !zonaSel;
  if (!zonaSel) return;
  atualizarCamposZona();
  renderEspeciesZona();
}
function atualizarCamposZona() {
  const z = zonaSel; if (!z) return;
  $('e-cor').style.background = corZona(z);
  $('e-titulo').textContent = z.nome || 'Zona';
  $('e-nome').value = z.nome; $('e-raio').value = z.raio; $('e-raio-r').value = Math.min(80, z.raio);
  $('e-max').value = z.max; $('e-intervalo').value = z.intervalo; $('e-lvmin').value = z.lvMin; $('e-lvmax').value = z.lvMax;
  $('e-shiny').value = +(z.shiny * 100).toFixed(2); $('e-ativa').checked = z.ativa !== false;
  $('e-pos').textContent = `centro: x ${z.x}  z ${z.z}  ·  mapa ${z.mapa}`;
}
function renderEspeciesZona() {
  const z = zonaSel;
  $('e-especies').innerHTML = tabelaEspecies(z.especies, false);
  ligarTabelaEspecies($('e-especies'), z.especies, () => { renderListaZonas(); marcarSujo(); });
}
// campos do editor
function campoZona(id, prop, transform = v => v) {
  $(id).addEventListener('input', () => { if (!zonaSel) return; zonaSel[prop] = transform($(id).value); marcarSujo(); if (prop === 'nome') { $('e-titulo').textContent = zonaSel.nome; renderListaZonas(); } if (prop === 'raio' || prop === 'ativa') renderListaZonas(); desenhar(); });
}

// ── Tabela de espécies (compartilhada entre zona e habitat) ───────────────────
function tabelaEspecies(lista, comAgua) {
  const linhas = lista.map((e, i) => `<tr data-i="${i}">
    <td>${esc(e.nome || nomeDe(e.dex))} <span class="fraco">${String(e.dex).padStart(4, '0')}</span>${GLB_DEX[e.dex] ? '' : ' <span class="sem-modelo">sem modelo</span>'}</td>
    <td><input type="number" class="peso" min="1" max="1000" value="${e.peso || 100}"></td>
    <td class="pct">${pct(lista, i)}</td>
    ${comAgua ? `<td><label class="chk"><input type="checkbox" class="agua" ${e.agua ? 'checked' : ''}></label></td>` : ''}
    <td><button class="rem perigo" title="Remover">✕</button></td></tr>`).join('');
  return `<table class="esp"><thead><tr><th>Espécie</th><th>Peso</th><th>%</th>${comAgua ? '<th>Água</th>' : ''}<th></th></tr></thead><tbody>${linhas}</tbody></table>
    <div class="add-esp"><input type="text" list="dl-especies" class="add-input" placeholder="adicionar espécie (nome ou nº)…"><button class="add-btn">Adicionar</button></div>`;
}
function pct(lista, i) { const soma = lista.reduce((a, e) => a + (e.peso || 100), 0) || 1; return Math.round((lista[i].peso || 100) / soma * 100) + '%'; }
function ligarTabelaEspecies(cont, lista, aoMudar) {
  const refazer = () => { const comAgua = !!cont.querySelector('.agua') || cont.dataset.agua === '1'; cont.innerHTML = tabelaEspecies(lista, comAgua); ligarTabelaEspecies(cont, lista, aoMudar); aoMudar?.(); };
  cont.querySelectorAll('tr[data-i]').forEach(tr => {
    const i = +tr.dataset.i;
    tr.querySelector('.peso')?.addEventListener('input', e => { lista[i].peso = Math.min(1000, Math.max(1, +e.target.value || 100)); tr.parentElement.parentElement.querySelectorAll('.pct').forEach((c, j) => c.textContent = pct(lista, j)); aoMudar?.(); });
    tr.querySelector('.agua')?.addEventListener('change', e => { if (e.target.checked) lista[i].agua = 1; else delete lista[i].agua; aoMudar?.(); });
    tr.querySelector('.rem')?.addEventListener('click', () => { lista.splice(i, 1); refazer(); });
  });
  const input = cont.querySelector('.add-input'), btn = cont.querySelector('.add-btn');
  const add = () => { const e = resolverEspecie(input.value); if (!e) { toast('Espécie não encontrada ou sem modelo.', true); return; } if (lista.some(x => x.dex === e.dex)) { toast('Essa espécie já está na lista.', true); return; } lista.push(e); input.value = ''; refazer(); };
  btn?.addEventListener('click', add);
  input?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
}

// ── Botões do editor de mapa ──────────────────────────────────────────────────
function ligarUI() {
  $('m-mapa').addEventListener('change', e => trocarMapa(e.target.value));
  $('m-nova').addEventListener('click', () => { colocando = !colocando; tela.classList.toggle('colocando', colocando); $('m-nova').classList.toggle('on', colocando); if (colocando) toast('Clique no mapa pra colocar o centro da zona.'); });
  $('m-aqui').addEventListener('click', () => pedirPos(pos => { if (pos.mapa !== mapaAtual) trocarMapa(pos.mapa).then(() => criarZona(pos.x, pos.z)); else criarZona(pos.x, pos.z); }));
  $('m-eu').addEventListener('click', () => pedirPos(pos => { if (pos.mapa !== mapaAtual) trocarMapa(pos.mapa); cam.x = pos.x; cam.z = pos.z; desenhar(); }));
  $('m-salvar').addEventListener('click', salvarMapa);
  $('m-recarregar').addEventListener('click', async () => {
    if ((sujoZonas || sujoAreas || Camadas?.sujo()) && !confirm('Descartar as alterações não salvas (zonas, áreas e camadas)?')) return;
    Camadas?.reset();
    const lz = await api('/admin/zonas'); zonas = (lz.zonas || []).map((z, i) => ({ ...z, __i: i })); zonaSel = null; sujoZonas = false; $('m-edit').hidden = true; renderListaZonas();
    sujoAreas = false; await carregarCenas(); const cam0 = { ...cam }; await trocarMapa(mapaAtual); Object.assign(cam, cam0); desenhar();   // relê o mapa sem perder o enquadramento
  });
  $('m-nova-area').addEventListener('click', () => { if (desenhandoArea) { sairDoModoArea(); return; } entrarModoArea(); });
  // camadas do mapa (Fase 1): pontos e pincel — avisarJogo/canal ficam no fim do arquivo, por isso o embrulho em função
  Camadas = criarCamadas({ $, esc, api, toast, FLIPX, cam, w2t, t2w, camadas, nomeArea, areaEm, tela,
    avisarJogo: (...a) => avisarJogo(...a), canal: { postMessage: m => canal.postMessage(m) },
    redesenhar: desenhar, dados: () => dadosMapa, mapa: () => mapaAtual, mapas: () => mapas, trocarMapa, aoMudar: atualizarSujoMapa,
    ligarCamada: k => { camadas[k] = true; const i = $('m-camadas').querySelector(`[data-cam="${k}"]`); if (i) i.checked = true; desenhar(); } });
  $('m-ferramenta').addEventListener('change', e => { Camadas.usarFerramenta(e.target.value); $('m-dica').textContent = DICAS[e.target.value]; });
  $('a-filtro').addEventListener('input', renderListaAreas);
  $('a-nome').addEventListener('input', e => {
    const c = caixaSel; if (!c) return;
    const v = e.target.value.slice(0, 60); if (!v.trim()) return;
    dadosMapa.nomes[c.a] = v; if (c.a in nomesCena) nomesCena[c.a] = v; nomesMudados.add(c.a);
    $('a-titulo').textContent = v; marcarSujoAreas(); renderListaAreas(); desenhar();
  });
  $('a-id').addEventListener('change', e => { if (trocarIdArea(Math.round(+e.target.value)) === false) e.target.value = caixaSel?.a ?? ''; atualizarCamposArea(); });
  for (const id of ['a-x', 'a-z', 'a-sx', 'a-sz']) $(id).addEventListener('input', () => {
    const c = caixaSel; if (!c) return;
    const x = +$('a-x').value, z = +$('a-z').value, sx = +$('a-sx').value, sz = +$('a-sz').value;
    if (![x, z, sx, sz].every(Number.isFinite) || sx < 1 || sz < 1) return;
    porRectMundo(c, { x0: x - sx / 2, x1: x + sx / 2, z0: z - sz / 2, z1: z + sz / 2 }); marcarSujoAreas(); atualizarCamposArea(); desenhar();
  });
  $('a-centro').addEventListener('click', () => { if (caixaSel) centrarEm(caixaSel); });
  $('a-tp').addEventListener('click', () => { if (caixaSel) { canal.postMessage({ t: 'tp', x: FLIPX * caixaSel.x, z: caixaSel.z, mapa: mapaAtual }); toast('Pedido enviado ao jogo (se estiver aberto).'); } });
  $('a-dup').addEventListener('click', adicionarCaixa);
  $('a-del').addEventListener('click', excluirCaixa);
  $('a-puxar').addEventListener('click', puxarTiles);
  // camadas
  $('m-camadas').innerHTML = Object.keys(camadas).map(k => `<label class="chk"><input type="checkbox" data-cam="${k}"${camadas[k] ? ' checked' : ''}> ${k}</label>`).join('');
  $('m-camadas').querySelectorAll('input').forEach(i => i.addEventListener('change', () => { camadas[i.dataset.cam] = i.checked; desenhar(); }));
  // campos da zona
  campoZona('e-nome', 'nome', v => v.slice(0, 60));
  campoZona('e-max', 'max', v => Math.min(30, Math.max(1, +v || 1)));
  campoZona('e-intervalo', 'intervalo', v => Math.min(600, Math.max(1, +v || 8)));
  campoZona('e-lvmin', 'lvMin', v => Math.min(100, Math.max(1, +v || 1)));
  campoZona('e-lvmax', 'lvMax', v => Math.min(100, Math.max(1, +v || 1)));
  campoZona('e-shiny', 'shiny', v => Math.min(1, Math.max(0, (+v || 0) / 100)));
  $('e-raio').addEventListener('input', e => { if (!zonaSel) return; zonaSel.raio = Math.min(200, Math.max(1, +e.target.value || 10)); $('e-raio-r').value = Math.min(80, zonaSel.raio); marcarSujo(); renderListaZonas(); desenhar(); });
  $('e-raio-r').addEventListener('input', e => { if (!zonaSel) return; zonaSel.raio = +e.target.value; $('e-raio').value = zonaSel.raio; marcarSujo(); renderListaZonas(); desenhar(); });
  $('e-ativa').addEventListener('change', e => { if (!zonaSel) return; zonaSel.ativa = e.target.checked; marcarSujo(); renderListaZonas(); desenhar(); });
  $('e-centro').addEventListener('click', () => { if (zonaSel) { cam.x = zonaSel.x; cam.z = zonaSel.z; desenhar(); } });
  $('e-tp').addEventListener('click', () => { if (zonaSel) canal.postMessage({ t: 'tp', x: zonaSel.x, z: zonaSel.z, mapa: zonaSel.mapa }); toast('Pedido enviado ao jogo (se estiver aberto).'); });
  $('e-dup').addEventListener('click', () => { if (!zonaSel) return; const c = JSON.parse(JSON.stringify(zonaSel)); c.id = 'z' + Date.now().toString(36); c.nome += ' (cópia)'; c.x += 3; c.__i = zonas.length; c.especies = JSON.parse(JSON.stringify(zonaSel.especies)); zonas.push(c); marcarSujo(); renderListaZonas(); selecionarZona(c); desenhar(); });
  $('e-del').addEventListener('click', () => { if (!zonaSel) return; if (!confirm('Excluir a zona "' + zonaSel.nome + '"?')) return; zonas = zonas.filter(z => z !== zonaSel); zonaSel = null; marcarSujo(); $('m-edit').hidden = true; renderListaZonas(); desenhar(); });
  // navegação de vistas
  for (const b of document.querySelectorAll('#lado button')) b.addEventListener('click', () => trocarVista(b.dataset.vista, b));
  // habitats
  $('h-busca').addEventListener('input', renderHabitats);
  $('h-salvar').addEventListener('click', salvarHabitats);
  $('h-nivel-ok').addEventListener('click', salvarNivel);
  // redimensiona
  new ResizeObserver(() => { ajustarCanvas(); if (!enquadrado && cv.clientWidth > 50 && dadosMapa) { fitMapa(); enquadrado = true; } desenhar(); }).observe(tela);
  window.addEventListener('beforeunload', e => { if (sujoZonas || sujoHab || sujoAreas) { e.preventDefault(); e.returnValue = ''; } });
}
function trocarVista(nome, btn) {
  for (const b of document.querySelectorAll('#lado button')) b.classList.toggle('atual', b === btn);
  for (const s of document.querySelectorAll('.vista')) s.hidden = s.id !== 'v-' + nome;
  if (nome === 'mapa') { ajustarCanvas(); desenhar(); }
}

async function salvarZonas() {
  const r = await api('/admin/zonas', 'POST', { zonas: zonas.map(({ __i, ...z }) => z) });
  if (!r.ok) { toast(r.erro || 'Falha ao salvar.', true); return; }
  sujoZonas = false; atualizarSujoMapa();
  toast('Zonas salvas (' + r.total + ')' + (r.descartadas ? ' · ' + r.descartadas + ' descartada(s)' : '') + '.');
  avisarJogo('zonas_spawn');
}

// ╔═══════════════════════════════ HABITATS ═════════════════════════════════════╗
let areaSel = null;
function listaAreas() {
  // as áreas com habitat + TODAS as do mapa aberto (área nova aparece aqui pra ganhar espécies); nome = o que o jogo mostra
  const ids = new Set([...Object.keys(habitats.areas), ...(dadosMapa?.areas || []).map(String)]);
  const arr = [...ids].map(id => ({ id, nome: nomeArea(id), qtd: (habitats.areas[id] || []).length }));
  arr.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  return arr;
}
function renderHabitats() {
  const filtro = ($('h-busca').value || '').toLowerCase();
  const arr = [{ id: '__gen', nome: '★ Genérico (qualquer grama)', qtd: habitats.generico.length }, ...listaAreas()]
    .filter(a => !filtro || a.nome.toLowerCase().includes(filtro) || a.id.includes(filtro));
  $('h-areas').innerHTML = arr.map(a => `<button data-id="${a.id}" class="${a.id === areaSel ? 'atual' : ''}"><span>${esc(a.nome)}</span><span class="fraco">${a.qtd}</span></button>`).join('');
  for (const b of $('h-areas').querySelectorAll('button')) b.onclick = () => selecionarArea(b.dataset.id);
}
/* NÍVEL POR ÁREA (Fase 1): faixa de nível com que os selvagens da área nascem — config_jogo.nivelArea (o jogo junta com a
   tabela NIVEL_AREA do código; área fora dela nasce em 3–6). Lê fresco a cada área (outra tela pode ter salvo o config). */
async function mostrarNivel(id) {
  $('h-nivel').hidden = !id; if (!id) return;
  $('h-lvmin').value = $('h-lvmax').value = ''; $('h-nivel-info').textContent = 'carregando…';
  const r = await api('/admin/dados/config_jogo');
  if (areaSel !== id) return;
  const f = r.dados?.nivelArea?.[id];
  if (f) { $('h-lvmin').value = f[0]; $('h-lvmax').value = f[1]; }
  $('h-nivel-info').textContent = f ? '' : 'sem faixa: nasce no nível 3 a 6';
}
async function salvarNivel() {
  const id = areaSel; if (!id || id === '__gen') return;
  const a = $('h-lvmin').value.trim(), b = $('h-lvmax').value.trim();
  const r = await api('/admin/dados/config_jogo');
  if (!r.ok) { toast(r.erro || 'Falha ao ler a configuração.', true); return; }
  const cfg = r.dados || {}, nivel = { ...(cfg.nivelArea || {}) };
  if (a === '' && b === '') delete nivel[id];
  else {
    const min = Number(a), max = Number(b);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 100 || min > max) { toast('Use dois níveis inteiros de 1 a 100, mínimo ≤ máximo.', true); return; }
    nivel[id] = [min, max];
  }
  const s = await api('/admin/dados/config_jogo', 'POST', { dados: { ...cfg, nivelArea: nivel } });
  if (!s.ok) { toast(s.erro || 'Falha ao salvar o nível.', true); return; }
  toast('Nível da área ' + id + (nivel[id] ? ': ' + nivel[id].join(' a ') : ' voltou ao padrão') + '.');
  avisarJogo('config_jogo'); mostrarNivel(id);
}
function selecionarArea(id) {
  areaSel = id; renderHabitats();
  const gen = id === '__gen';
  const lista = gen ? habitats.generico : (habitats.areas[id] ||= []);
  const nome = gen ? 'Genérico' : nomeArea(id);
  $('h-titulo').textContent = nome + (gen ? '' : '  —  ' + id);
  mostrarNivel(gen ? null : id);
  const cont = $('h-especies'); cont.dataset.agua = '1';
  cont.innerHTML = tabelaEspecies(lista, true);
  ligarTabelaEspecies(cont, lista, () => { sujoHab = true; $('h-sujo').hidden = false; renderHabitats(); });
}
async function salvarHabitats() {
  const r = await api('/admin/habitats', 'POST', { areas: habitats.areas, generico: habitats.generico });
  if (!r.ok) { toast(r.erro || 'Falha ao salvar.', true); return; }
  sujoHab = false; $('h-sujo').hidden = true;
  toast('Habitats salvos (' + r.areas + ' áreas).');
  avisarJogo('habitats');
}

// ── Comunicação com a aba do jogo (BroadcastChannel) ──────────────────────────
const canal = new BroadcastChannel('p3d-admin');
/** Avisa a aba do jogo que um arquivo de dados mudou (salvar ou restaurar). O jogo decide se aplica na hora ou pede F5. */
const avisarJogo = (arquivo, cenario = false) => canal.postMessage({ t: 'dados-mudaram', arquivo, cenario });
let pedidoPos = null;
canal.addEventListener('message', ev => {
  const m = ev.data || {};
  if (m.t === 'pos') { jogadorPos = { x: m.x, z: m.z, mapa: m.mapa }; desenhar(); if (pedidoPos) { pedidoPos(jogadorPos); pedidoPos = null; } }
});
function pedirPos(cb) {
  pedidoPos = cb; canal.postMessage({ t: 'onde' });
  setTimeout(() => { if (pedidoPos) { pedidoPos = null; toast('O jogo não respondeu. Abra-o em outra aba (localhost:5300).', true); } }, 1200);
}

iniciar();
