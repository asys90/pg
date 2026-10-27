/**
 * Shaders dos efeitos de golpe — port dos shaders REAIS do jogo.
 *
 * O GLSL veio compilado do bundle de shaders do cliente (GLES3, legível), mesmo
 * caminho da chama do Charmander (`fogo.mjs`). Cada entrada aqui é a fórmula do
 * fragment do jogo reescrita em cima do que o nosso vértice entrega: `vUv` (já com
 * o quadro da folha de sprite), `vCor` (cor da partícula = `vs_COLOR0` do Unity),
 * `vN`/`vP` (normal e posição no espaço da câmera) e `tempo` (= `_Time.y`).
 *
 * Os valores dos materiais (cores, floats, texturas, ST) vêm de
 * `particulas/materiais.json`, gerado por `tools/efeitos_materiais.py` a partir
 * dos .mat do dump. O projeto do jogo é espaço de cor GAMMA: texturas e cores
 * entram cruas (NoColorSpace), sem conversão sRGB.
 *
 * O que NÃO é fiel (sem como ser sem o resto do pipeline do Unity):
 *  - "soft particles" (AlphaLerp, AlphaPower, AddSoft) leem a textura de
 *    profundidade da câmera pra esmaecer perto do chão: aqui o fator é 1.
 *  - AlphaBlendMask/AlphaBlendPowerMask somam um reflexo do cubemap da cena e um
 *    especular da luz direcional: aqui esse termo é 0.
 *  - Standard, Pokemon/Hand e outros de superfície ficam com o caminho antigo.
 */
import * as THREE from 'three';

// Blend do Unity (enum) -> three.js
const FATOR = {
  0: THREE.ZeroFactor, 1: THREE.OneFactor, 2: THREE.DstColorFactor, 3: THREE.SrcColorFactor,
  4: THREE.OneMinusDstColorFactor, 5: THREE.SrcAlphaFactor, 6: THREE.OneMinusSrcColorFactor,
  7: THREE.DstAlphaFactor, 8: THREE.OneMinusDstAlphaFactor, 9: THREE.SrcAlphaSaturateFactor, 10: THREE.OneMinusSrcAlphaFactor,
};
const LADO = { 0: THREE.DoubleSide, 1: THREE.BackSide, 2: THREE.FrontSide };   // Cull Off / Front / Back

/* Tabela: src/dst = Blend, cull, zw = ZWrite, tex = samplers (cada um ganha `_ST`),
   unif = uniformes com valor padrão (vec4 se array), glsl = corpo que produz `o`. */
const S = {};
S['Legacy Shaders/Particles/Additive'] = { src: 5, dst: 1, cull: 0, zw: 0, tex: ['_MainTex'], unif: { _TintColor: [0.5, 0.5, 0.5, 0.5] }, glsl: `
  vec4 T = texture2D(_MainTex, UV(_MainTex_ST));
  vec4 o = 2.0 * C * _TintColor * T; o.a = clamp(o.a, 0.0, 1.0);` };
// no Alpha Blended a tinta entra no VÉRTICE (vs_COLOR0 = in_COLOR0 * _TintColor); no Additive, no fragment — dá no mesmo
S['Legacy Shaders/Particles/Alpha Blended'] = { src: 5, dst: 10, cull: 0, zw: 0, tex: ['_MainTex'], unif: { _TintColor: [0.5, 0.5, 0.5, 0.5] }, glsl: `
  vec4 T = texture2D(_MainTex, UV(_MainTex_ST));
  vec4 o = 2.0 * C * _TintColor * T; o.a = clamp(o.a, 0.0, 1.0);` };
// Mobile/Particles/*: função fixa `texture * primary` — sem tinta e sem o ×2
S['Mobile/Particles/Additive'] = { src: 5, dst: 1, cull: 0, zw: 0, tex: ['_MainTex'], unif: {}, glsl: `
  vec4 o = texture2D(_MainTex, UV(_MainTex_ST)) * clamp(C, 0.0, 1.0);` };
S['Mobile/Particles/Alpha Blended'] = { src: 5, dst: 10, cull: 0, zw: 0, tex: ['_MainTex'], unif: {}, glsl: `
  vec4 o = texture2D(_MainTex, UV(_MainTex_ST)) * clamp(C, 0.0, 1.0);` };
S['Effect/AddTop'] = { src: 1, dst: 1, cull: 0, zw: 0, tex: ['_MainTex'], unif: { _MainColor: [0.502, 0.502, 0.502, 0.502] }, glsl: `
  vec4 T = texture2D(_MainTex, UV(_MainTex_ST));
  vec4 o = clamp(2.0 * vec4(T.rgb * T.a * _MainColor.rgb * _MainColor.a * C.rgb * C.a, T.a * T.a * _MainColor.a * _MainColor.a * C.a * C.a), 0.0, 1.0);` };
S['Effect/AlphaTop'] = { src: 5, dst: 10, cull: 0, zw: 0, tex: ['_MainTex'], unif: { _MainColor: [0.502, 0.502, 0.502, 0.502] }, glsl: `
  vec4 T = texture2D(_MainTex, UV(_MainTex_ST));
  vec4 o = clamp(2.0 * vec4(T.rgb * T.a * _MainColor.rgb * C.rgb * C.a, T.a * T.a * _MainColor.a * C.a * C.a), 0.0, 1.0);` };
S['Effect/AddSoft'] = { ...S['Effect/AddTop'] };   // = AddTop × fator de profundidade (aqui 1)
S['AddG'] = { src: 1, dst: 1, cull: 0, zw: 0, tex: ['_MainTex'], unif: {}, glsl: `
  vec4 T = texture2D(_MainTex, UV(_MainTex_ST));
  vec4 o = vec4(T.rgb * C.rgb * T.a * C.a, T.a * C.a);` };
S['AlphaG'] = { src: 5, dst: 10, cull: 0, zw: 0, tex: ['_MainTex'], unif: {}, glsl: `
  vec4 T = texture2D(_MainTex, UV(_MainTex_ST));
  vec4 o = vec4(T.rgb * C.rgb * T.a, T.a * C.a);` };
S['Effect/AddMask'] = { src: 1, dst: 1, cull: 0, zw: 0, tex: ['_ParticleTexture', '_Mask'], unif: { _MainColor: [0.502, 0.502, 0.502, 0.502], _U: 0, _V: 0 }, glsl: `
  vec4 P = texture2D(_ParticleTexture, UV(_ParticleTexture_ST) + tempo * vec2(_U, _V));
  vec4 K = texture2D(_Mask, UV(_Mask_ST));
  vec4 o = vec4(2.0 * P.rgb * C.rgb * (P.a * K.a * K.rgb * C.a) * _MainColor.rgb * _MainColor.a, K.a * K.r * P.a * C.a * _MainColor.a);` };
S['Effect/AddPower'] = { src: 1, dst: 1, cull: 0, zw: 0, tex: ['_ParticleTexture'], unif: { _MainColor: [0.502, 0.502, 0.502, 0.502], _Color: [0.502, 0.502, 0.502, 0.502], _U: 0, _V: 0, _Float1: 1, _Float2: 2 }, glsl: `
  vec4 P = texture2D(_ParticleTexture, UV(_ParticleTexture_ST) + tempo * vec2(_U, _V));
  vec3 b = P.a * P.rgb;
  vec4 o = vec4((2.0 * b * _MainColor.rgb + pow(max(b, 1e-6), vec3(_Float1)) * _Color.rgb * _Float2) * C.rgb * C.a, P.a * C.a);` };
S['Effect/AlphaPower'] = { src: 5, dst: 10, cull: 0, zw: 0, tex: ['_ParticleTexture'], unif: { _MainColor: [0.502, 0.502, 0.502, 0.502], _Color: [0.502, 0.502, 0.502, 0.502], _U: 0, _V: 0, _Float1: 1, _Float2: 2 }, glsl: `
  vec4 P = texture2D(_ParticleTexture, UV(_ParticleTexture_ST) + tempo * vec2(_U, _V));
  vec4 o = vec4((2.0 * P.rgb * _MainColor.rgb + pow(max(P.rgb, vec3(1e-6)), vec3(_Float1)) * _Color.rgb * _Float2) * C.rgb, P.a * C.a * _MainColor.a);` };
S['Effect/AddTopPower'] = { src: 1, dst: 1, cull: 0, zw: 0, tex: ['_MainTex'], unif: { _MainColor: [0.502, 0.502, 0.502, 0.502], _Power: 1, _Tine: 1 }, glsl: `
  vec4 T = texture2D(_MainTex, UV(_MainTex_ST));
  vec4 v = 2.0 * vec4(C.rgb * T.a * T.rgb * _MainColor.rgb * C.a, T.a * T.a * _MainColor.a * C.a * C.a);
  vec4 o = min(pow(max(v, vec4(1e-6)), vec4(_Power)), vec4(1.0)) * _Tine;` };
S['Effect/AlphaLerp'] = { src: 5, dst: 10, cull: 0, zw: 0, tex: ['_MainTex'], unif: { _MainColor: [1, 1, 1, 1], _DepthColor: [0, 0, 0, 1] }, glsl: `
  vec4 T = texture2D(_MainTex, UV(_MainTex_ST));
  vec4 o = vec4(clamp(mix(_DepthColor.rgb, _MainColor.rgb, T.r) * C.rgb, 0.0, 1.0), T.a * C.a * _MainColor.a);` };
S['Effect/AlphaLerpTop'] = { ...S['Effect/AlphaLerp'] };
S['Add(Base)'] = { src: 1, dst: 1, cull: 2, zw: 1, tex: ['_MainTex'], unif: {}, glsl: `
  vec4 o = texture2D(_MainTex, UV(_MainTex_ST));` };
S['FresnelAdd'] = { src: 1, dst: 1, cull: 2, zw: 0, tex: ['_MainTex'], unif: { _MainColor: [1, 1, 1, 1], _FresnelColor: [1, 1, 1, 1], _Scale: 1, _Power: 5 }, glsl: `
  vec3 V = normalize(-vP);
  float fr = clamp(pow(max(1.0 - dot(normalize(vN), V), 0.0), _Power) * _Scale, 0.0, 1.0);
  vec4 T = texture2D(_MainTex, UV(_MainTex_ST));
  vec4 o = vec4(C.rgb * _MainColor.rgb * T.rgb + fr * _FresnelColor.rgb, T.a * _MainColor.a * C.a + fr);` };
S['Effect/AddBlendMaskNoise'] = { src: 1, dst: 1, cull: 2, zw: 1, tex: ['_MainTex1', '_Mask'], unif: { _MainColor: [1, 1, 1, 1], _U: 0, _V: 0, _U1: 0, _V1: 0, _Noise: 0 }, glsl: `
  vec2 K = texture2D(_Mask, UV(_Mask_ST) + tempo * vec2(_U1, _V1)).xy;
  vec4 T = texture2D(_MainTex1, UV(_MainTex1_ST) + tempo * vec2(_U, _V) + K * _Noise);
  vec4 o = T * C * _MainColor;` };
S['Effect/AlphaBlendMaskNoise'] = { ...S['Effect/AddBlendMaskNoise'], src: 5, dst: 10 };
S['Effect/AddDistortMask'] = { src: 1, dst: 1, cull: 0, zw: 0, tex: ['_ParticleTexture', '_ParticleTexture1', '_Mask'], unif: { _MainColor: [0.502, 0.502, 0.502, 0.502], _U: 0, _V: 0, _NU: 0, _NV: 0, _NoisePower: 0 }, glsl: `
  vec2 N = texture2D(_ParticleTexture1, UV(_ParticleTexture1_ST) + tempo * vec2(_NU, _NV)).xy;
  vec4 P = texture2D(_ParticleTexture, UV(_ParticleTexture_ST) + tempo * vec2(_U, _V) + N * _NoisePower);
  vec4 K = texture2D(_Mask, UV(_Mask_ST));
  vec4 o = vec4(2.0 * P.rgb * C.rgb * (K.a * P.a * K.rgb * C.a) * _MainColor.rgb * _MainColor.a, P.a * K.a * C.a);` };
S['Effect/AlphaBlendMask'] = { src: 5, dst: 10, cull: 0, zw: 0, tex: ['_MainTex1', '_Mask'], unif: { _MainColor: [1, 1, 1, 1], _U: 0, _V: 0 }, glsl: `
  vec4 T = texture2D(_MainTex1, UV(_MainTex1_ST) + tempo * vec2(_U, _V));
  float K = texture2D(_Mask, UV(_Mask_ST)).r;
  vec4 o = vec4(T.rgb * C.rgb * _MainColor.rgb, T.a * K * C.a * _MainColor.a);` };
S['Effect/AlphaBlendPowerMask'] = { src: 5, dst: 10, cull: 0, zw: 0, tex: ['_MainTex1', '_Mask'], unif: { _MainColor: [1, 1, 1, 1], _U: 0, _V: 0, _Power: 1, _Mult: 1 }, glsl: `
  vec4 T = texture2D(_MainTex1, UV(_MainTex1_ST) + tempo * vec2(_U, _V));
  float K = texture2D(_Mask, UV(_Mask_ST)).r;
  vec4 o = vec4(pow(max(T.rgb, vec3(1e-6)), vec3(_Power * 10.0)) * _Mult + T.rgb * C.rgb * _MainColor.rgb * _MainColor.a * C.rgb, T.a * K * C.a * C.a);` };
S['Pokemon/AddFlipMask'] = { src: 1, dst: 1, cull: 0, zw: 0, tex: ['_MainTex'], unif: { _Color: [1, 1, 1, 1], _FlipBookZSpeedWStartFrame: [1, 1, 1, 0] }, glsl: `
  vec4 T = texture2D(_MainTex, quadro(UV(_MainTex_ST), _FlipBookZSpeedWStartFrame));
  vec4 o = vec4(T.a * T.rgb * _Color.rgb * C.rgb, 0.0);` };
S['Pokemon/AlphaFlipMask'] = { src: 5, dst: 10, cull: 2, zw: 0, tex: ['_MainTex', '_FlipMask'], unif: { _Color: [1, 1, 1, 1], _FlipBookZSpeedWStartFrame: [1, 1, 1, 0], _MainTexUVMove: [0, 0, 1, 1] }, glsl: `
  vec3 F = texture2D(_FlipMask, quadro(vUv, _FlipBookZSpeedWStartFrame)).rgb;
  vec3 T = texture2D(_MainTex, vUv * _MainTexUVMove.zw + tempo * _MainTexUVMove.xy).rgb;
  vec4 o = vec4((F + T) * _Color.rgb * C.rgb, F.r * C.a);` };
S['Pokemon/BuffTubiao'] = { src: 1, dst: 0, cull: 2, zw: 1, tex: ['_MainTex'], unif: {}, glsl: `
  vec4 o = texture2D(_MainTex, UV(_MainTex_ST));` };
S['Effect/ProDarkColor'] = { src: 5, dst: 10, cull: 2, zw: 0, tex: [], unif: { _Color: [0, 0, 0, 1] }, glsl: `
  vec4 o = _Color;` };
// o export do dump nomeia os shaders sem o prefixo do grupo
for (const k of Object.keys(S)) if (k.includes('/')) S[k.split('/').pop()] ??= S[k];
S['Particles/Additive'] = S['Legacy Shaders/Particles/Additive'];
S['Particles/Alpha Blended'] = S['Legacy Shaders/Particles/Alpha Blended'];

export const tabela = nome => S[nome] || null;
export const conhece = nome => !!S[nome];

const VS = `
#ifdef INSTANCIADO
attribute vec4 aCor;
attribute vec4 aUV;      // xy = deslocamento do quadro da folha, zw = tamanho do quadro
#endif
varying vec2 vUv; varying vec4 vCor; varying vec3 vN; varying vec3 vP;
void main(){
  #ifdef INSTANCIADO
  vUv = uv * aUV.zw + aUV.xy; vCor = aCor;
  vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  #else
  vUv = uv; vCor = vec4(1.0);
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  #endif
  vP = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const CABECA = `
uniform float tempo;
varying vec2 vUv; varying vec4 vCor; varying vec3 vN; varying vec3 vP;
#define UV(st) (vUv * st.xy + st.zw)
// folha de sprite dos shaders FlipMask: F = (colunas, linhas, velocidade, quadro inicial)
vec2 quadro(vec2 uv, vec4 F){
  float total = F.x * F.y;
  float idx = mod(floor(tempo * F.z + F.w + 0.5), total);
  float col = mod(idx, F.x), lin = floor(idx / F.x);
  return uv / F.xy + vec2(col, F.y - 1.0 - lin) / F.xy;
}
`;
function fragmento(def){
  let s = CABECA;
  for (const t of def.tex) s += `uniform sampler2D ${t}; uniform vec4 ${t}_ST;\n`;
  for (const [k, v] of Object.entries(def.unif)) s += `uniform ${Array.isArray(v) ? 'vec4' : 'float'} ${k};\n`;
  s += `void main(){\n  vec4 C = vCor;\n${def.glsl}\n  gl_FragColor = o;\n}`;
  return s;
}

/* ---- texturas: cache próprio, cruas (projeto em Gamma), repetindo (rolagem) */
const cacheTex = new Map();
let _branca = null;
function branca(){
  if (!_branca){
    _branca = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    _branca.needsUpdate = true;
  }
  return _branca;
}
/** Carrega as texturas de um registro; `base` = pasta (particulas/tex), `ver` = ?v= do cache. */
export function carregarTexturas(rec, base, ver = ''){
  const def = tabela(rec.shader);
  if (!def) return Promise.resolve(null);
  const pend = def.tex.map(slot => {
    const arq = rec.tex?.[slot]?.arq;
    if (!arq) return Promise.resolve([slot, branca()]);          // slot vazio no material = textura "white" do Unity
    if (!cacheTex.has(arq)){
      cacheTex.set(arq, new THREE.TextureLoader().loadAsync(`${base}/${arq}${ver}`).then(t => {
        t.colorSpace = THREE.NoColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        return t;
      }).catch(() => null));
    }
    return cacheTex.get(arq).then(t => [slot, t]);
  });
  return Promise.all(pend).then(pares => {
    if (pares.some(p => !p[1])) return null;                      // faltou arquivo: cai no caminho antigo
    return Object.fromEntries(pares);
  });
}

/** Material three.js com o shader do jogo. `texs` = resultado de carregarTexturas. Devolve null se não conhece o shader. */
export function criarMaterial(rec, texs, { instanciado = true } = {}){
  const def = tabela(rec.shader);
  if (!def || !texs) return null;
  const uniforms = { tempo: { value: Math.random() * 100 } };
  for (const slot of def.tex){
    uniforms[slot] = { value: texs[slot] };
    uniforms[slot + '_ST'] = { value: new THREE.Vector4(...(rec.tex?.[slot]?.st || [1, 1, 0, 0])) };
  }
  for (const [k, d] of Object.entries(def.unif)){
    const v = rec.c?.[k] ?? rec.f?.[k] ?? d;
    uniforms[k] = { value: Array.isArray(v) ? new THREE.Vector4(...v) : v };
  }
  const opaco = def.src === 1 && def.dst === 0;
  const mat = new THREE.ShaderMaterial({
    defines: instanciado ? { INSTANCIADO: '' } : {},
    vertexShader: VS, fragmentShader: fragmento(def), uniforms,
    transparent: !opaco, depthWrite: !!def.zw, depthTest: true, side: LADO[def.cull] ?? THREE.DoubleSide,
    blending: opaco ? THREE.NoBlending : THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: FATOR[def.src], blendDst: FATOR[def.dst], blendSrcAlpha: FATOR[def.src], blendDstAlpha: FATOR[def.dst],
  });
  mat.name = 'jogo:' + rec.shader;
  mat.userData.doJogo = true;
  return mat;
}
/** Fila de render do Unity -> renderOrder (3000 = transparente padrão). */
export const ordem = rec => ((rec?.fila ?? -1) > 0 ? rec.fila : 3000) - 3000;
