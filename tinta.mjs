/* Tinta dos NPCs (shader Pokemon/Player2 do jogo de origem).
 *
 * As texturas `*_col` dos personagens são quase brancas de propósito: a cor vem do MATERIAL,
 * por máscara RGB. Do GLSL decodificado (scratchpad/shaders/Pokemon_Player2_glsl.txt):
 *
 *   tex  = _MainTex.rgb;  m = _RGBMask.rgb (sem máscara: branco = 1,1,1)
 *   cor  = tex·_ColorR·m.r + tex·_ColorG·m.g + tex·_ColorB·m.b + tex·_ColorBlack·(1 − m.r − m.g − m.b)
 *   (_IsMask ≠ 0 → cor = tex, sem tinta)
 *
 * Em vez de um ShaderMaterial, a tinta é ASSADA na textura num canvas quando o modelo carrega —
 * o MeshStandardMaterial do GLB continua o mesmo (luz, sombra, skinning), só troca o `map`.
 * Os parâmetros por material estão em data/npc_tintas.json (gerado dos .mat do dump) e as
 * máscaras em cenario/npc/mask/.
 */
import * as THREE from 'three';

let TINTAS = null;
const mascaras = new Map();
const carregarImagem = url => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('máscara ' + url)); im.src = url; });
const mascara = nome => { if (!mascaras.has(nome)) mascaras.set(nome, carregarImagem('./cenario/npc/mask/' + nome)); return mascaras.get(nome); };

async function tabela(){
  if (!TINTAS) TINTAS = await fetch('./data/npc_tintas.json').then(r => r.json()).catch(() => ({}));
  return TINTAS;
}

/* A textura CRUA fica num WeakMap DO MÓDULO, nunca em `mat.userData` (19/09, frente de desempenho).
   `Material.copy` — que é o que o `.clone()` usa — serializa o userData inteiro com `JSON.stringify`, e uma
   textura ali dentro cai no `Texture.toJSON` → `ImageUtils.getDataURL` → `canvas.toDataURL`. Como cada NPC clona
   os materiais do seu GLB (`montarPersonagem`) e os materiais do GLB já estavam tingidos, entrar num mapa travava
   350–830 ms só nisso, em quadros de até 800 ms.
   A chave é a textura ASSADA, não o material: o clone raso compartilha o `map`, então continua achando a origem
   sem precisar que nada seja copiado junto. */
const cruaDe = new WeakMap();                                          // textura assada → textura crua de origem
/* A assada que NÓS fizemos PRA ESTE material — e a única que ele pode descartar (19/09, revisão).
   O `map` de um material clonado é a assada do GLB em CACHE, dividida com o original e com todos os outros
   clones daquele arquivo (`montarPersonagem` só clona o material, nunca a textura). Descartar `mat.map` na
   repintura, como era antes, apagava da GPU a textura de TODO MUNDO: medido, 6 descartes da mesma textura em
   3 trocas de personagem. Só some a que este material ganhou numa pintura anterior — que é o que o cuidado
   de 10/09 (leque de cor arrastado) precisa. */
const assadaDe = new WeakMap();                                        // material → a assada que fizemos pra ele
/** A textura crua deste material (a própria, se ele nunca foi tingido). */
const origemDe = mat => (mat.map && cruaDe.get(mat.map)) || mat.map;

async function tingir(mat, t){
  // repintar parte sempre da textura crua (senão a tinta acumula)
  const orig = origemDe(mat), img = orig?.image;
  if (!img || !img.width) return;
  const w = img.width, h = img.height;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.drawImage(img, 0, 0, w, h);
  const px = c.getImageData(0, 0, w, h), d = px.data;
  let mk = null;
  if (t.mask){
    try {
      const mi = await mascara(t.mask);
      const cm = document.createElement('canvas'); cm.width = w; cm.height = h;
      const cc = cm.getContext('2d', { willReadFrequently: true }); cc.drawImage(mi, 0, 0, w, h);
      mk = cc.getImageData(0, 0, w, h).data;
    } catch (e){ console.warn('tinta:', e.message); }
  }
  const R = t.ColorR || [1, 1, 1], G = t.ColorG || [0, 0, 0], B = t.ColorB || [0, 0, 0], K = t.ColorBlack || [0, 0, 0];
  /* Textura ASSADA (cor já pintada, ex.: cabelo laranja da Misty) não aceita tinta por multiplicação. `neutralizar: ['G']`
     troca, na região do canal, a cor pela luminância × ganho (cinza claro com o sombreado) antes de multiplicar — é o que
     deixa recolorir um cabelo pintado como se fosse uma textura `_col`. */
  const neu = t.neutralizar || [], ganho = t.ganho || 1.6, nI = ['R', 'G', 'B'].map(c => neu.includes(c));
  for (let i = 0; i < d.length; i += 4){
    const mr = mk ? mk[i] / 255 : 1, mg = mk ? mk[i + 1] / 255 : 0, mb = mk ? mk[i + 2] / 255 : 0, m0 = mk ? 1 - mr - mg - mb : 0;   // sem máscara: só ColorR (tom base) — a fórmula cheia com máscara "branca" dá peso −2 no ColorBlack e pintava o rosto da Joy de vermelho
    if (mk && neu.length){
      const w = (nI[0] ? mr : 0) + (nI[1] ? mg : 0) + (nI[2] ? mb : 0);
      if (w > 0){ const lum = Math.min(255, (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * ganho); const k = Math.min(1, w); for (let ch = 0; ch < 3; ch++) d[i + ch] = d[i + ch] * (1 - k) + lum * k; }
    }
    for (let ch = 0; ch < 3; ch++){
      const f = R[ch] * mr + G[ch] * mg + B[ch] * mb + K[ch] * m0;
      d[i + ch] = Math.max(0, Math.min(255, Math.round(d[i + ch] * f)));
    }
  }
  c.putImageData(px, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = orig.flipY; tex.wrapS = orig.wrapS; tex.wrapT = orig.wrapT;
  tex.minFilter = orig.minFilter; tex.magFilter = orig.magFilter; tex.needsUpdate = true;
  /* Descarta a assada ANTERIOR DESTE material (nunca a crua, nunca a do GLB em cache): sem isto cada repintura
     deixava uma textura de 1024² órfã na GPU, e arrastar o seletor de cor por alguns segundos comia dezenas de
     MB (10/09). */
  const velha = assadaDe.get(mat);
  cruaDe.set(tex, orig); assadaDe.set(mat, tex);
  mat.map = tex; mat.needsUpdate = true;
  if (velha && velha !== orig && velha !== tex) velha.dispose();
}

/** Pinta com uma receita explícita { [nome da textura ou do material]: { ColorR, ColorG, ColorB, ColorBlack, mask } } —
    repinta quantas vezes quiser (criador de personagem: pele/roupa/cabelo/olhos ao vivo). Devolve quantos materiais pintou. */
export async function pintar(corpo, receitas){
  const pend = [];
  corpo.traverse(o => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]){
      if (!m) continue;
      const src = origemDe(m);
      const t = receitas[src?.name] || receitas[m.name]; if (!t) continue;
      m.userData.tingido = true; pend.push(tingir(m, t));
    }
  });
  await Promise.all(pend);
  return pend.length;
}
/** Aplica a tinta em todos os materiais conhecidos do corpo (idempotente). */
/** `glb` (opcional): nome do arquivo sem extensão. NPCs genéricos (NPC1004 = Brock…) têm materiais chamados só `body`/`face`,
    então a tabela pode trazer a tinta por GLB na chave `<glb>:<material>` (tools/tintas_npc.py) — ela vence a chave pelo nome. */
export async function aplicarTinta(corpo, glb = ''){
  const T = await tabela(); const pend = [];
  corpo.traverse(o => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]){
      const t = (glb && T[glb + ':' + m?.name]) || T[m?.name]; if (!t || m.userData.tingido) continue;
      if (t.isMask) { m.userData.tingido = true; continue; }
      m.userData.tingido = true; pend.push(tingir(m, t));
    }
  });
  await Promise.all(pend);
  return pend.length;
}
