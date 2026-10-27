/* Lodo do Grimer e do Muk — port do shader Pokemon/ChouniUV do jogo (臭泥 = Grimer).
 *
 * A "pele" externa dos dois (material `pmXXXX_00_BetoMask.tga`, 6 primitivas) NÃO é opaca:
 * no jogo é uma camada translúcida de lodo escorrendo por cima do corpo, e os olhos e a
 * boca ficam por baixo dela, visíveis pelos buracos da máscara. O export (UnityGLTF) deixa
 * esse material opaco e o olho some atrás — foi o "olho do Grimer não aparece".
 *
 * Fragment original (bundle ae06cee…, GLSL em scratchpad/shaders/Pokemon_ChouniUV_glsl.txt):
 *   uvB   = uv0*2 + (0, 0.1*_Time.y)                  // lodo escorre em V
 *   s     = 1 - texture(_Beto, uvB).r
 *   rgb   = _Color0.rgb * s + luz (difusa wrap + reflexo do cubemap × fresnel)
 *   m     = 1 - texture(_BetoMask, uv0).r
 *   alpha = s * m * _Color0.a                         // ≤ 0,43; zero onde a máscara é branca
 *   Blend SrcAlpha OneMinusSrcAlpha · ZWrite Off · Queue Transparent · Cull Back
 * Sem cubemap aqui: o reflexo vira um fresnel cinza.
 *
 * Texturas em cenario/lodo/ — só existem na PASTA DA ESPÉCIE do dump (PmEud/pm0088, pm0089);
 * glTF v = 1 − v do Unity, por isso o escorrer aqui é −0,1·t.
 *
 *   Lodo.aplicarLodo(corpo, 'pm0088_00');   // depois de clonar o GLB (como Fogo.aplicarFogo)
 *   Lodo.atualizarLodo(dt);                 // no laço
 */
import * as THREE from 'three';

const BASE = new URL('./cenario/lodo/', import.meta.url);
/* _Color0 e texturas de cada material *_BetoMask.tga.mat do dump. */
const RECEITAS = {
  pm0088: { beto: 'pm0089_00_Beto1.tga', mask: 'pm0088_00_BetoMask.tga', cor: [0.18490271, 0.06581523, 0.2735849, 0.43137255] },   // Grimer
  pm0089: { beto: 'pm0089_00_Beto1.tga', mask: 'pm0089_00_BetoMask.tga', cor: [0.10206581, 0.06292275, 0.13207549, 0.43137255] },  // Muk
};
export const EH_LODO = /BetoMask/i;

const VS = `
#include <common>
#include <skinning_pars_vertex>
varying vec2 vUv;
varying vec3 vN;
varying vec3 vP;
void main(){
  vUv = uv;
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vN = normalize(normalMatrix * objectNormal);
  vP = mvPosition.xyz;
}`;
const FS = `
uniform sampler2D beto;
uniform sampler2D mask;
uniform vec4 cor;
uniform float tempo;
uniform vec3 luzDir;
uniform vec3 luzCor;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vP;
void main(){
  vec2 uvB = vUv * 2.0 + vec2(0.0, -0.1 * tempo);
  float s = 1.0 - texture2D(beto, uvB).r;
  vec3 N = normalize(vN);
  vec3 V = normalize(-vP);
  float ndl = clamp(dot(N, normalize(luzDir)), 0.0, 1.0);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 4.0);
  // original: 0.22·luz/(max(dot(L,H),0.32)·2.5) + reflexo·0.72·0.22 — sem cubemap o reflexo vira fresnel cinza
  vec3 luz = luzCor * (0.09 * ndl) + vec3(0.04 + 0.14 * fres);
  vec3 rgb = cor.rgb * s + luz;
  float m = 1.0 - texture2D(mask, vUv).r;
  gl_FragColor = vec4(rgb, s * m * cor.a);
}`;

const texturas = new Map(), materiais = new Map();
function textura(nome){
  if (!texturas.has(nome)){
    const t = new THREE.TextureLoader().load(new URL(nome + '.png', BASE).href);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;   // projeto em Gamma: textura crua
    t.flipY = false;                                                              // UV do GLB (origem no topo)
    texturas.set(nome, t);
  }
  return texturas.get(nome);
}
function materialLodo(chave){
  if (materiais.has(chave)) return materiais.get(chave);
  const r = RECEITAS[chave];
  const m = new THREE.ShaderMaterial({
    name: 'lodo:' + chave,
    uniforms: {
      beto: { value: textura(r.beto) }, mask: { value: textura(r.mask) },
      cor: { value: new THREE.Vector4(...r.cor) }, tempo: { value: Math.random() * 10 },
      luzDir: { value: new THREE.Vector3(0.3, 0.8, 0.5) }, luzCor: { value: new THREE.Vector3(1, 1, 1) },
    },
    vertexShader: VS, fragmentShader: FS,
    transparent: true, depthWrite: false, side: THREE.FrontSide,
  });
  m.userData.lodo = true;
  materiais.set(chave, m);
  return m;
}
/** Troca os materiais *_BetoMask.tga do corpo pelo lodo translúcido. Devolve quantos trocou. */
export function aplicarLodo(corpo, modelo = ''){
  const chave = (modelo.match(/pm\d{4}/) || [''])[0];
  if (!RECEITAS[chave]) return 0;
  let n = 0;
  corpo.traverse(o => {
    if (!o.isMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    ms.forEach((mt, i) => {
      if (!EH_LODO.test(mt?.name || '')) return;
      const novo = materialLodo(chave);
      if (Array.isArray(o.material)) o.material[i] = novo; else o.material = novo;
      o.castShadow = false; o.renderOrder = 5;          // depois do corpo e dos olhos (fila Transparent do jogo)
      n++;
    });
  });
  return n;
}
/** Anda o tempo do lodo (chamar no laço). */
export function atualizarLodo(dt){ for (const m of materiais.values()) m.uniforms.tempo.value += dt; }
