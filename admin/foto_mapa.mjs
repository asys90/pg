/* Fundo do Editor de Mapa: a "foto de cima" do mapa, como o minimapa do jogo.
 *  • Mapa com foto ASSADA do jogo (ui/minimapa_<mapa>.jpg + .json com a régua x0/z0/esc em coords do MUNDO — hoje só Kanto,
 *    feita pelo tools/minimapa_foto.py): usa ela, é a mesma imagem que o minimapa do HUD recorta.
 *  • Os outros: monta o cenário do GLB com a mesma regra do jogo/editor 3D (biblioteca = prefabs "lib" transladados pelos
 *    areaEnv+ambiente+objetos do JSON, mundo.x = −arquivo.x; montado = os nós do GLB) e fotografa UMA vez com câmera
 *    ortográfica de cima (norte pra cima = −z, como o minimapa). Fica em cache na sessão; a GPU é liberada depois.
 * Devolve { img, x0, z0, esc, w, h, fonte } — esc = pixels por metro; (x0, z0) = canto de cima/esquerda no mundo. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MAX_PX = 4096, PX_POR_M = 4, MARGEM = 12;
const cache = new Map();
const chaveNome = n => n.toLowerCase().replace(/^lib:?/, '').replace(/\s/g, '_').replace(/[\[\]\.:/]/g, '');

/** `dados` = o JSON do mapa (caixas e as 3 listas do cenário). Promessa com a foto, ou null se não deu. */
export function fotoDoMapa(nome, dados) {
  if (!cache.has(nome)) cache.set(nome, carregar(nome, dados).catch(e => { console.warn('[foto do mapa] ' + nome + ':', e); cache.delete(nome); return null; }));
  return cache.get(nome);
}
export const esquecerFoto = nome => cache.delete(nome);   // depois de salvar o cenário, a próxima foto sai nova

async function carregar(nome, dados) {
  const regua = await fetch('/ui/minimapa_' + nome + '.json').then(r => r.ok ? r.json() : null).catch(() => null);
  if (regua?.esc > 0) {
    const img = new Image(); img.src = '/ui/minimapa_' + nome + '.jpg'; await img.decode();
    return { img, x0: regua.x0, z0: regua.z0, esc: regua.esc, w: img.naturalWidth, h: img.naturalHeight, fonte: 'foto do jogo' };
  }
  return fotografar(nome, dados);
}

async function fotografar(nome, dados) {
  const g = await new GLTFLoader().loadAsync('/cenario/' + nome + '.glb');
  g.scene.updateMatrixWorld(true);
  const raiz = g.scene.getObjectByName('Mapa') || g.scene;
  const amostra = raiz.children.slice(0, 10).map(n => n.name || '');
  const biblioteca = amostra.filter(n => /^lib/i.test(n)).length > amostra.length / 2;   // o GLTFLoader tira o ":" de "lib:..."
  const cena = new THREE.Scene(), caixaCena = new THREE.Box3();
  if (biblioteca) {
    const partes = new Map();
    for (const prefab of raiz.children) {
      const l = []; prefab.traverse(o => { if (o.isMesh && !o.isSkinnedMesh) l.push({ geo: o.geometry, mat: o.material, local: o.matrixWorld.clone() }); });
      if (l.length) partes.set(chaveNome(prefab.name), l);
    }
    const grupos = new Map(), T = new THREE.Matrix4();
    for (const o of [...(dados?.areaEnv || []), ...(dados?.ambiente || []), ...(dados?.objetos || [])]) {
      const l = partes.get(chaveNome(String(o.n || ''))); if (!l) continue;
      T.makeTranslation(-(+o.x || 0), +o.y || 0, +o.z || 0);
      for (const p of l) {
        const k = p.geo.uuid + '|' + (Array.isArray(p.mat) ? p.mat.map(m => m.uuid).join() : p.mat.uuid);
        let gr = grupos.get(k); if (!gr) grupos.set(k, gr = { geo: p.geo, mat: p.mat, ms: [] });
        gr.ms.push(new THREE.Matrix4().multiplyMatrices(T, p.local));
      }
    }
    for (const gr of grupos.values()) {
      const im = new THREE.InstancedMesh(gr.geo, gr.mat, gr.ms.length);
      gr.ms.forEach((m, i) => im.setMatrixAt(i, m)); im.frustumCulled = false; im.computeBoundingBox();
      caixaCena.union(im.boundingBox); cena.add(im);
    }
  } else { cena.add(g.scene); caixaCena.setFromObject(g.scene); }
  if (caixaCena.isEmpty()) throw new Error('cenário vazio');

  // Enquadra pelas caixas das áreas (o mapa "de verdade"); sem caixas, pelo cenário. Pisos/água planos de ~1000 m ficariam enormes.
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const c of dados?.caixas || []) if (c.sx > 0 && c.sz > 0) { const cx = -c.x; x0 = Math.min(x0, cx - c.sx / 2); x1 = Math.max(x1, cx + c.sx / 2); z0 = Math.min(z0, c.z - c.sz / 2); z1 = Math.max(z1, c.z + c.sz / 2); }
  if (!(x1 > x0)) { x0 = caixaCena.min.x; x1 = caixaCena.max.x; z0 = caixaCena.min.z; z1 = caixaCena.max.z; }
  x0 -= MARGEM; x1 += MARGEM; z0 -= MARGEM; z1 += MARGEM;
  const largM = x1 - x0, altM = z1 - z0, esc = Math.min(PX_POR_M, MAX_PX / Math.max(largM, altM));
  const W = Math.max(16, Math.round(largM * esc)), H = Math.max(16, Math.round(altM * esc));

  const ren = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  try {
    ren.setPixelRatio(1); ren.setSize(W, H, false); ren.outputColorSpace = THREE.SRGBColorSpace; ren.setClearColor(0x000000, 0);
    cena.add(new THREE.HemisphereLight(0xffffff, 0x5a606c, 2.2));
    const sol = new THREE.DirectionalLight(0xffffff, 1.8); sol.position.set(60, 140, 40); cena.add(sol);
    const cam = new THREE.OrthographicCamera(-largM / 2, largM / 2, altM / 2, -altM / 2, 0.1, caixaCena.max.y - caixaCena.min.y + 400);
    cam.position.set((x0 + x1) / 2, caixaCena.max.y + 50, (z0 + z1) / 2); cam.up.set(0, 0, -1); cam.lookAt((x0 + x1) / 2, caixaCena.min.y, (z0 + z1) / 2);
    ren.render(cena, cam);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    cv.getContext('2d').drawImage(ren.domElement, 0, 0);
    return { img: cv, x0, z0, esc, w: W, h: H, fonte: 'gerada do GLB' };
  } finally {
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      o.geometry?.dispose();
      for (const m of [].concat(o.material || [])) { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose(); }
    });
    ren.dispose(); ren.forceContextLoss();
  }
}
