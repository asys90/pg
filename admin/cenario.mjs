/* Editor de Cenário 3D — Pokemon 3D Base (jogo local). Suporta os DOIS modos de mapa:
 *  • BIBLIOTECA (kanto e +71 mapas): o GLB tem os prefabs na origem ("lib:<nome>"); o cenário são os `objetos` do JSON
 *    ({n,x,y,z}, 42k no kanto). Edito os objetos e re-instancio os prefabs nas posições (igual ao `instanciarBiblioteca` do
 *    jogo). Salva em /admin/mapa-objetos (JSON).
 *  • MONTADO (só pallet_rota1): o GLB já tem as peças posicionadas (os nós). Edito os nós. Salva o GLB (/admin/mapa-glb).
 * Render otimizado com InstancedMesh por tipo (1 draw call por tipo), pra aguentar os 42k do kanto. Só conta GM. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const BASE = location.protocol === 'https:' ? location.origin + '/servidor' : 'http://' + location.hostname + ':5190';
const $ = id => document.getElementById(id);
let token = localStorage.getItem('conta.token') || '';
const api = async (rota, metodo = 'GET', corpo) => {
  const r = await fetch(BASE + rota, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: corpo != null ? JSON.stringify(corpo) : undefined });
  let d = {}; try { d = await r.json(); } catch {} return { status: r.status, ok: r.ok, ...d };
};
const toast = (m, erro = false) => { const e = document.createElement('div'); if (erro) e.className = 'erro'; e.textContent = m; $('toast').appendChild(e); setTimeout(() => e.remove(), 4500); };
const chaveNome = n => n.toLowerCase().replace(/^lib:?/, '').replace(/\s/g, '_').replace(/[\[\]\.:/]/g, '');

const quem = await api('/admin/eu');
if (!quem.ok || !quem.gm) { location.href = '/admin'; throw new Error('precisa ser GM'); }

// ── Three ──────────────────────────────────────────────────────────────────────
const tela = $('tela');
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0a0d12');
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 9000); camera.position.set(40, 40, 40);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
tela.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f4a, 1.15));
const sol = new THREE.DirectionalLight(0xffffff, 1.5); sol.position.set(80, 140, 50); scene.add(sol);
const grade = new THREE.GridHelper(1400, 700, 0x3a4660, 0x1c2433); grade.position.y = -0.02; scene.add(grade);
const raizInst = new THREE.Group(); scene.add(raizInst);
const proxy = new THREE.Object3D(); scene.add(proxy);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true; orbit.maxPolarAngle = Math.PI * 0.49;
const transform = new TransformControls(camera, renderer.domElement);
transform.addEventListener('dragging-changed', e => { orbit.enabled = !e.value; });
transform.addEventListener('objectChange', () => {
  if (!selPeca) return;
  let x = proxy.position.x * fx, y = proxy.position.y, z = proxy.position.z;   // de world pra coords de edição (bib: flipX)
  if (snap) { x = Math.round(x * 2) / 2; y = Math.round(y * 2) / 2; z = Math.round(z * 2) / 2; proxy.position.set(x * fx, y, z); }
  setPos(selPeca, x, y, z); atualizarInst(selPeca); realcar(selPeca); marcarSujo(); atualizarCamposSel();
});
scene.add(transform.getHelper());

function resize() { const w = tela.clientWidth, h = tela.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h || 1; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(tela); resize();

// ── Estado ───────────────────────────────────────────────────────────────────
let modo = 'biblioteca';    // 'biblioteca' | 'montado'
let fx = -1;                // bib: flipX=-1 (mundo.x = -arquivo.x); montado: 1 (nó já em world)
let sceneGLB = null, mapaNode = null;
let partes = new Map();     // bib: chaveNome(prefab) → [{geo, mat, local}]
let nomeDoPrefab = new Map();
let pecas = [];             // lista unificada: { pos:Vector3, nome, mats:[{geo,mat,local}], inst:[{im,i}], obj?, node? }
let tipos = [];             // paleta: { id, nome, criar(pos)→peça }
let instGrupos = [];
let selPeca = null, boxHelper = null;
let sujo = false, mapaAtual = null, ferramenta = 'sel', addTipo = null, snap = false;
const raycaster = new THREE.Raycaster();
const planoChao = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _m4 = new THREE.Matrix4(), _T = new THREE.Matrix4();
const marcarSujo = () => { sujo = true; $('sujo').hidden = false; };
const matrizDe = (peca, local) => _m4.multiplyMatrices(_T.makeTranslation(fx * peca.pos.x, peca.pos.y, peca.pos.z), local);
function setPos(peca, x, y, z) {
  peca.pos.set(x, y, z);
  if (peca.obj) { peca.obj.x = x; peca.obj.y = y; peca.obj.z = z; }
  if (peca.node) peca.node.position.set(x, y, z);
}

(function loop() { requestAnimationFrame(loop); orbit.update(); renderer.render(scene, camera); })();

// ── Carregar ──────────────────────────────────────────────────────────────────
const loader = new GLTFLoader();
async function listarMapas() {
  const r = await api('/admin/mapas-glb');
  const mapas = r.mapas || [];
  $('sel-mapa').innerHTML = mapas.map(m => `<option>${m}</option>`).join('');
  if (!mapas.length) { $('carregando').textContent = 'Nenhum mapa com GLB local.'; return; }
  await carregarMapa(mapas.includes('pallet_rota1') ? 'pallet_rota1' : mapas[0]);
}
async function carregarMapa(nome) {
  $('carregando').hidden = false; $('carregando').textContent = 'carregando ' + nome + '…';
  mapaAtual = nome; $('sel-mapa').value = nome; deselecionar();
  for (const g of instGrupos) { raizInst.remove(g); g.dispose?.(); }
  instGrupos = []; pecas = []; partes = new Map(); nomeDoPrefab = new Map(); sceneGLB = null; mapaNode = null;
  let g;
  try { g = await loader.loadAsync('/cenario/' + nome + '.glb'); }
  catch (e) { $('carregando').textContent = 'não consegui carregar o GLB de ' + nome; return; }
  sceneGLB = g.scene; sceneGLB.updateMatrixWorld(true);
  mapaNode = g.scene.getObjectByName('Mapa') || g.scene;
  // o GLTFLoader tira o ":" dos nomes, então "lib:floor" chega como "libfloor": detecta biblioteca pela maioria dos nós começar com "lib"
  const amostra = mapaNode.children.slice(0, 10).map(n => n.name || '');
  modo = amostra.filter(nm => /^lib/i.test(nm)).length > amostra.length / 2 ? 'biblioteca' : 'montado';
  fx = modo === 'biblioteca' ? -1 : 1;
  if (modo === 'biblioteca') await montarBiblioteca(nome); else montarMontado();
  rebuildInstancias(); enquadrar(); renderPaleta();
  sujo = false; $('sujo').hidden = true; $('carregando').hidden = true; atualizarHud();
}

async function montarBiblioteca(nome) {
  for (const prefab of mapaNode.children) {   // prefabs "lib:..." na origem
    const lista = [];
    prefab.traverse(o => { if (o.isMesh && !o.isSkinnedMesh) lista.push({ geo: o.geometry, mat: o.material, local: o.matrixWorld.clone() }); });
    if (lista.length) { const k = chaveNome(prefab.name); partes.set(k, lista); nomeDoPrefab.set(k, prefab.name.replace(/^lib:?/i, '')); }
  }
  const r = await api('/admin/mapa-objetos?mapa=' + encodeURIComponent(nome));
  // o cenário vem de 3 listas (o jogo monta na ordem areaEnv→ambiente→objetos): chão, água/céu, props
  const listas = { areaEnv: r.areaEnv || [], ambiente: r.ambiente || [], objetos: r.objetos || [] };
  for (const nomeL of ['areaEnv', 'ambiente', 'objetos']) for (const o of listas[nomeL]) {
    const obj = { ...o, n: o.n, x: +o.x || 0, y: +o.y || 0, z: +o.z || 0 };
    const k = chaveNome(obj.n); if (!nomeDoPrefab.has(k)) nomeDoPrefab.set(k, obj.n);
    pecas.push({ pos: new THREE.Vector3(obj.x, obj.y, obj.z), nome: obj.n, mats: partes.get(k) || [], inst: [], obj, lista: nomeL });
  }
  tipos = [...partes.keys()].sort().map(k => ({ id: k, nome: nomeDoPrefab.get(k) || k, criar: pos => criarBib(k, pos) }));
}
function montarMontado() {
  const vistosTipo = new Map();
  for (const node of mapaNode.children) {
    node.updateMatrixWorld(true);
    const mats = []; let geo0 = null;
    node.traverse(o => { if (o.isMesh && !o.isSkinnedMesh) { if (!geo0) geo0 = o.geometry; mats.push({ geo: o.geometry, mat: o.material, local: new THREE.Matrix4().copy(node.matrixWorld).invert().multiply(o.matrixWorld) }); } });
    pecas.push({ pos: node.position.clone(), nome: node.name, mats, inst: [], node });
    if (geo0 && !vistosTipo.has(geo0.uuid)) vistosTipo.set(geo0.uuid, node);
  }
  tipos = [...vistosTipo.entries()].map(([id, node]) => ({ id, nome: node.name, criar: pos => criarMont(node, pos) })).sort((a, b) => a.nome.localeCompare(b.nome));
}

function rebuildInstancias() {
  for (const im of instGrupos) { raizInst.remove(im); im.dispose?.(); }
  instGrupos = [];
  for (const p of pecas) p.inst = [];
  const grupos = new Map();   // geo.uuid+'|'+matKey → { geo, mat, membros:[{peca, local}] }
  for (const peca of pecas) for (const m of peca.mats) {
    const matKey = Array.isArray(m.mat) ? m.mat.map(x => x.uuid).join(',') : m.mat.uuid;
    const chave = m.geo.uuid + '|' + matKey;
    let gr = grupos.get(chave); if (!gr) { gr = { geo: m.geo, mat: m.mat, membros: [] }; grupos.set(chave, gr); }
    gr.membros.push({ peca, local: m.local });
  }
  for (const gr of grupos.values()) {
    const im = new THREE.InstancedMesh(gr.geo, gr.mat, gr.membros.length);
    im.frustumCulled = false; im.userData.membros = gr.membros;
    gr.membros.forEach((mb, i) => { im.setMatrixAt(i, matrizDe(mb.peca, mb.local)); mb.peca.inst.push({ im, i }); });
    im.instanceMatrix.needsUpdate = true; raizInst.add(im); instGrupos.push(im);
  }
}
function atualizarInst(peca) {
  for (const { im, i } of peca.inst) { im.setMatrixAt(i, matrizDe(peca, im.userData.membros[i].local)); im.instanceMatrix.needsUpdate = true; }
}

// ── Seleção ──────────────────────────────────────────────────────────────────
function selecionar(peca) {
  if (!peca) return;
  selPeca = peca; proxy.position.set(fx * peca.pos.x, peca.pos.y, peca.pos.z); transform.attach(proxy); transform.setMode('translate'); realcar(peca);
  $('sem-sel').hidden = true; $('com-sel').hidden = false; atualizarCamposSel();
}
function deselecionar() { selPeca = null; transform.detach(); realcar(null); if ($('sem-sel')) { $('sem-sel').hidden = false; $('com-sel').hidden = true; } }
function realcar(peca) {
  if (boxHelper) { scene.remove(boxHelper); boxHelper.geometry.dispose(); boxHelper = null; }
  if (!peca || !peca.inst.length) return;
  const box = new THREE.Box3(), b = new THREE.Box3();
  for (const { im, i } of peca.inst) { if (!im.geometry.boundingBox) im.geometry.computeBoundingBox(); b.copy(im.geometry.boundingBox).applyMatrix4(matrizDe(peca, im.userData.membros[i].local)); box.union(b); }
  if (!box.isEmpty()) { boxHelper = new THREE.Box3Helper(box, 0xffcf3a); scene.add(boxHelper); }
}
function atualizarCamposSel() {
  if (!selPeca) return; const p = selPeca.pos;
  $('s-nome').textContent = selPeca.nome || '(sem nome)';
  $('s-x').value = +p.x.toFixed(3); $('s-y').value = +p.y.toFixed(3); $('s-z').value = +p.z.toFixed(3);
}

let down = null;
renderer.domElement.addEventListener('pointerdown', ev => { if (ev.button === 0) down = { x: ev.clientX, y: ev.clientY }; });
renderer.domElement.addEventListener('pointerup', ev => {
  if (ev.button !== 0 || !down) return;
  const moveu = Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5; down = null;
  if (moveu || transform.dragging || !mapaNode) return;
  const rect = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera({ x: ((ev.clientX - rect.left) / rect.width) * 2 - 1, y: -((ev.clientY - rect.top) / rect.height) * 2 + 1 }, camera);
  if (ferramenta === 'add' && addTipo) {
    const pt = new THREE.Vector3();
    const hit = raycaster.intersectObjects(instGrupos, false)[0];
    if (hit) pt.copy(hit.point); else if (!raycaster.ray.intersectPlane(planoChao, pt)) return;
    addTipo.criar(pt); return;
  }
  const hit = raycaster.intersectObjects(instGrupos, false)[0];
  if (hit) selecionar(hit.object.userData.membros[hit.instanceId].peca); else deselecionar();
});

// ── Operações ──────────────────────────────────────────────────────────────────
function criarBib(chave, ponto) {   // ponto é world; obj guarda coords de arquivo (x = fx*world.x). Peça nova entra em `objetos` (props)
  const obj = { n: nomeDoPrefab.get(chave) || chave, x: +(fx * ponto.x).toFixed(3), y: +ponto.y.toFixed(3), z: +ponto.z.toFixed(3) };
  const peca = { pos: new THREE.Vector3(obj.x, obj.y, obj.z), nome: obj.n, mats: partes.get(chave) || [], inst: [], obj, lista: 'objetos' };
  pecas.push(peca); rebuildInstancias(); marcarSujo(); selecionar(peca); atualizarHud();
}
function criarMont(nodeExemplo, ponto) {
  const node = nodeExemplo.clone(true); node.position.copy(ponto); mapaNode.add(node); node.updateMatrixWorld(true);
  const mats = []; node.traverse(o => { if (o.isMesh && !o.isSkinnedMesh) mats.push({ geo: o.geometry, mat: o.material, local: new THREE.Matrix4().copy(node.matrixWorld).invert().multiply(o.matrixWorld) }); });
  const peca = { pos: node.position.clone(), nome: node.name, mats, inst: [], node };
  pecas.push(peca); rebuildInstancias(); marcarSujo(); selecionar(peca); atualizarHud();
}
function duplicar() {
  if (!selPeca) return;
  const p = selPeca.pos;
  if (selPeca.obj) criarBib(chaveNome(selPeca.obj.n), new THREE.Vector3(fx * (p.x + 1.5 * fx), p.y, p.z));
  else criarMont(selPeca.node, new THREE.Vector3(p.x + 1.5, p.y, p.z));
}
function deletar() {
  if (!selPeca) return;
  const p = selPeca;
  if (p.node) mapaNode.remove(p.node);
  pecas.splice(pecas.indexOf(p), 1); deselecionar(); rebuildInstancias(); marcarSujo(); atualizarHud();   // bib: a peça sai de `pecas`; as listas são refeitas no salvar
}
function enquadrar() {
  const box = new THREE.Box3(), tmp = new THREE.Vector3();
  for (const p of pecas) box.expandByPoint(tmp.set(fx * p.pos.x, p.pos.y, p.pos.z));
  if (box.isEmpty()) { camera.position.set(40, 40, 40); orbit.target.set(0, 0, 0); orbit.update(); return; }
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()), r = Math.max(s.x, s.z, 10);
  orbit.target.copy(c); camera.position.set(c.x, c.y + r * 0.8, c.z + r * 0.9); orbit.update();
}
function atualizarHud() { $('hud').innerHTML = `<b>${pecas.length}</b> peças · <b>${instGrupos.length}</b> tipos · <b>${modo}</b> · mapa <b>${mapaAtual}</b>`; }

// ── Paleta ────────────────────────────────────────────────────────────────────
function renderPaleta() {
  const filtro = ($('pal-busca').value || '').toLowerCase();
  $('pal-qtd').textContent = '(' + tipos.length + ')';
  const vis = tipos.filter(t => !filtro || t.nome.toLowerCase().includes(filtro));
  $('paleta').innerHTML = vis.map(t => `<button data-id="${t.id}" class="${addTipo && t.id === addTipo.id ? 'on' : ''}" title="${t.nome}">${t.nome}</button>`).join('');
  for (const b of $('paleta').querySelectorAll('button')) b.onclick = () => { addTipo = tipos.find(t => t.id === b.dataset.id); usarFerramenta('add'); };
}
function usarFerramenta(f) {
  ferramenta = f;
  $('t-sel').classList.toggle('on', f === 'sel'); $('t-add').classList.toggle('on', f === 'add');
  $('add-dica').hidden = !(f === 'add' && addTipo);
  if (f === 'add' && addTipo) $('add-nome').textContent = addTipo.nome;
  if (f === 'sel') addTipo = null;
  renderPaleta();
}

// ── Salvar ────────────────────────────────────────────────────────────────────
const exporter = new GLTFExporter();
const canal = new BroadcastChannel('p3d-admin');                  // a aba do jogo avisa "recarregue" se estiver neste mapa
const avisarJogo = () => canal.postMessage({ t: 'dados-mudaram', arquivo: mapaAtual, cenario: true });
async function salvar() {
  $('b-salvar').disabled = true; $('b-salvar').textContent = 'salvando…';
  try {
    if (modo === 'biblioteca') {
      const listas = { objetos: [], ambiente: [], areaEnv: [] };   // refaz as 3 listas a partir das peças atuais
      for (const p of pecas) if (p.obj) listas[p.lista || 'objetos'].push(p.obj);
      const r = await api('/admin/mapa-objetos', 'POST', { mapa: mapaAtual, ...listas });
      if (!r.ok) { toast(r.erro || 'Falha ao salvar.', true); return; }
      sujo = false; $('sujo').hidden = true; toast('Cenário salvo (' + r.total + ' peças). Dê Ctrl+Shift+R no jogo.'); avisarJogo();
    } else {
      transform.detach();
      const buf = await new Promise((res, rej) => exporter.parse(sceneGLB, res, rej, { binary: true, onlyVisible: false }));
      const r = await fetch(BASE + '/admin/mapa-glb?mapa=' + encodeURIComponent(mapaAtual), { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' }, body: buf });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast(d.erro || 'Falha ao salvar o GLB.', true); return; }
      sujo = false; $('sujo').hidden = true; toast('Cenário salvo (' + (d.bytes / 1048576).toFixed(1) + ' MB). Ctrl+Shift+R no jogo.'); avisarJogo();
    }
  } catch (e) { toast('Erro ao salvar: ' + e.message, true); }
  finally { $('b-salvar').disabled = false; $('b-salvar').textContent = 'Salvar cenário'; if (selPeca && modo === 'montado') transform.attach(proxy); }
}

// ── Ligações ──────────────────────────────────────────────────────────────────
$('t-sel').onclick = () => usarFerramenta('sel');
$('t-add').onclick = () => { if (!addTipo) toast('Escolha uma peça na paleta primeiro.'); usarFerramenta('add'); };
$('t-foco').onclick = enquadrar;
$('t-snap').onchange = e => { snap = e.target.checked; };
$('s-var').onclick = () => toast('A rotação está na própria peça: use a paleta pra colocar a variante que quiser.');
$('s-dup').onclick = duplicar;
$('s-del').onclick = deletar;
for (const k of ['x', 'y', 'z']) $('s-' + k).addEventListener('input', () => { if (!selPeca) return; const p = selPeca.pos; setPos(selPeca, k === 'x' ? (+$('s-x').value || 0) : p.x, k === 'y' ? (+$('s-y').value || 0) : p.y, k === 'z' ? (+$('s-z').value || 0) : p.z); proxy.position.set(fx * selPeca.pos.x, selPeca.pos.y, selPeca.pos.z); atualizarInst(selPeca); realcar(selPeca); marcarSujo(); });
$('pal-busca').addEventListener('input', renderPaleta);
$('b-salvar').onclick = salvar;
$('b-recarregar').onclick = async () => { if (sujo && !confirm('Descartar as alterações não salvas?')) return; await carregarMapa(mapaAtual); };
$('sel-mapa').onchange = async e => { if (sujo && !confirm('Trocar de mapa descarta o não salvo. Continuar?')) { e.target.value = mapaAtual; return; } await carregarMapa(e.target.value); };
addEventListener('keydown', e => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.key === 'Delete' || e.key === 'Backspace') deletar();
  else if (e.key === 'Escape') { usarFerramenta('sel'); deselecionar(); }
  else if (e.key === 'f' || e.key === 'F') enquadrar();
  else if (e.key === 'd' || e.key === 'D') duplicar();
});
addEventListener('beforeunload', e => { if (sujo) { e.preventDefault(); e.returnValue = ''; } });

listarMapas();
