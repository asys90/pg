/**
 * Chamas dos Pokémon (Charmander, Charmeleon, Magmar, Ponyta, Rapidash, Moltres…).
 *
 * Port EXATO dos shaders do cliente — GLSL (GLES3) extraído do bundle de shaders do jogo
 * (`clean_bundles/ae06cee0….bundle`, shaders `PokemonFire`, `PokemonFireOut`, `PokemonFireOut146`):
 *
 *   fres = 1 - dot(N, V);  k = max(1 - K * fres^_Wide, 0)          // K = 4.55 (núcleo) / 1.88 (casca)
 *   PokemonFire (núcleo, Cull Off):
 *     rgb = lerp(_OutColor, _CoreColor, tex(_Mask) * k)
 *     a   = saturate(tex(_Main, uv + t*xy) + tex(_Noise, uv + t*zw))
 *   PokemonFireOut / …146 (casca, Cull Back / Off; fila 3001 = depois do núcleo):
 *     a   = k * (tex(_Main, uv + t*xy) + tex(_Noise, uv + t*zw) + tex(_Mask))
 *     rgb = lerp(_OutColor, _CoreColor, tex(_Mask)) * _Scale
 *   Os três: Blend SrcAlpha OneMinusSrcAlpha (alfa NORMAL, não aditivo), ZWrite Off; projeto em
 *   espaço de cor Gamma (texturas e cores cruas). Valores por material vêm dos .mat do dump
 *   (`PmEud/pm0004/Materials/*.mat` etc.). O `_Scale` multiplica a COR (estoura pra amarelo na
 *   base, onde a máscara é branca), não a UV.
 *
 * Convenção de UV: o GLB está na convenção glTF (v = 1 - v_unity) e as texturas são carregadas
 * com flipY=false — o mesmo texel que o Unity amostra; só a velocidade de rolagem em v troca de sinal.
 *
 * Charmeleon (pm0005) e Magmar (pm0126) usam os MESMOS materiais do Charmander (no bundle o
 * renderer aponta pra um arquivo externo; o export trocou por `Default_Material`) — por isso a
 * malha é reconhecida também pelo NOME (`FireCoreA_…`, `FireStenA_…`), não só pelo material.
 *
 *   import * as Fogo from './fogo.mjs';
 *   Fogo.aplicarFogo(corpo, 'pm0004_00');   // depois de clonar o GLB
 *   Fogo.atualizarFogo(dt);                 // no laço
 */
import * as THREE from 'three';

const BASE = new URL('./cenario/fogo/', import.meta.url);

// tipo: 'core' = PokemonFire, 'out' = PokemonFireOut (cull back), 'out146' = PokemonFireOut146 (cull off)
// vel = _XYMainZWNoise do .mat (xy rola o _Main, zw rola o _Noise; convenção de UV do Unity)
const CORE_0004  = { tipo: 'core',   main: 'pm0004_FireCoreA1',    mask: 'pm0004_FireCoreA2',        noise: 'pm0004_FireStenAMask', core: [1, 0.3974, 0], fora: [1, 0.2352, 0], vel: [0, -2.5, 0, -0.5],  wide: 1.55 };
const OUT_0004   = { tipo: 'out',    main: 'pm0004_FireStenA1',    mask: 'pm0004_FireStenAMask',     noise: 'pm0004_FireStenA2',    core: [1, 0.4447, 0], fora: [1, 0, 0],      vel: [0, -1.5, 0, -0.5],  wide: 3.5,  scale: 1.86 };
const CORE_0077  = { tipo: 'core',   main: 'pm0077_00_FireCore1',  mask: 'pm0077_00_FireStenMask',   noise: 'pm0077_00_FireCore2',  core: [1, 0.4847, 0], fora: [1, 0.1743, 0], vel: [0, 2.5, 0, 0.5],    wide: 1 };
const OUT_0077   = { tipo: 'out',    main: 'pm0077_00_FireSten1',  mask: 'pm0077_00_FireStenMask',   noise: 'pm0077_00_FireSten2',  core: [1, 0.5560, 0], fora: [1, 0.0684, 0], vel: [-0.5, -1.5, 0, -1], wide: 3,    scale: 1.5 };
const CORE_0146  = { tipo: 'core',   main: 'pm0146_00_FireCoreA1', mask: 'pm0146_00_FireStenABCMask', noise: 'pm0146_00_FireCoreA1', core: [1, 0.6427, 0], fora: [1, 0.0671, 0], vel: [0.3, 0, 0.2, 0],    wide: 1 };
const OUT_0146_1 = { tipo: 'out146', main: 'pm0077_00_FireSten1',  mask: 'pm0077_00_FireStenMask',   noise: 'pm0077_00_FireSten2',  core: [1, 0.4447, 0], fora: [1, 0.4431, 0], vel: [-0.5, -1.5, 0, -1], wide: 1.31, scale: 1.5 };
const OUT_0146_2 = { ...OUT_0146_1, core: [1, 0.5560, 0], fora: [1, 0.5569, 0], wide: 1.12 };
/* Mega Charizard X: mesmas texturas do Charmander, chama AZUL (FireCoreA1.tgabule / FireStenA1.tgablue.mat da pasta pm0004). */
const CORE_AZUL  = { ...CORE_0004, core: [0.0, 0.6851, 1.0], fora: [0.0, 0.2918, 1.0], vel: [0.0, -2.5, 0.0, -0.5], wide: 1.55 };
const OUT_AZUL   = { ...OUT_0004,  core: [0.0, 0.2209, 1.0], fora: [0.0, 0.6385, 1.0], vel: [0.0, -1.5, 0.0, -0.5], wide: 0.94, scale: 1.86 };

/** Receitas por NOME DE MATERIAL do GLB (= nome do .mat do jogo). */
export const FOGO = {
  'FireCoreA1.tga': CORE_0004, 'FireStenA1.tga': OUT_0004,                                   // Charmander e quem compartilha (Charmeleon, Magmar)
  'pm0077_00_FireCoreA1.tga': CORE_0077, 'pm0077_00_FireStenA1.tga': OUT_0077,               // Ponyta, Rapidash
  'pm0146_00_FireCoreA1.tga': CORE_0146, 'pm0146_00_FireStenA1.tga 1': OUT_0146_1, 'pm0146_00_FireStenA1.tga 2': OUT_0146_2,   // Moltres
  'FireCoreA1.tgabule': CORE_AZUL, 'FireStenA1.tgablue': OUT_AZUL,                          // Mega Charizard X (chama azul)
};
/** Receitas por modelo (quando o nome do material do GLB não basta). */
export const FOGO_MODELO = { pm0004: { 'FireCoreA1.tga': CORE_0004, 'FireStenA1.tga': OUT_0004 } };
FOGO_MODELO.pm0005 = FOGO_MODELO.pm0006 = FOGO_MODELO.pm0126 = FOGO_MODELO.pm0004;
/** Material de chama do jogo? (nome do material do GLB) */
export const EH_FOGO = /Fire(Core|Sten)/i;
/** Malha de chama pelo NOME do nó (GLBs cujo export perdeu o material: Charmeleon). */
export const EH_MALHA_FOGO = /^Fire(Core|Sten)([A-Z])?/;

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
  vN = normalize(normalMatrix * objectNormal);   // normal e posição no espaço da câmera (dot(N,V) é o mesmo)
  vP = mvPosition.xyz;
}`;
const FS = `
uniform sampler2D tMain, tMask, tNoise;
uniform float tempo, wide, scale, kFres, tipo;
uniform vec4 vel;
uniform vec3 core, fora;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vP;
void main(){
  vec3 V = normalize(-vP);
  float fres = max(1.0 - dot(normalize(vN), V), 0.0);
  float k = max(1.0 - kFres * pow(fres, wide), 0.0);       // 1 de frente pra câmera, 0 de raspão
  float m = texture2D(tMain,  vUv + vel.xy * tempo).r;
  float n = texture2D(tNoise, vUv + vel.zw * tempo).r;
  float mk = texture2D(tMask, vUv).r;
  vec4 o;
  if (tipo < 0.5){                                          // PokemonFire (núcleo)
    o.rgb = mix(fora, core, mk * k);
    o.a = clamp(m + n, 0.0, 1.0);
  } else {                                                  // PokemonFireOut / 146 (casca)
    o.a = k * (m + n + mk);
    o.rgb = mix(fora, core, mk) * scale;
  }
  gl_FragColor = clamp(o, 0.0, 1.0);                       // o framebuffer de 8 bits do jogo também satura
}`;

const texturas = new Map(), materiais = new Map();
function textura(nome){
  if (!texturas.has(nome)){
    const t = new THREE.TextureLoader().load(new URL(nome + '.tga.png', BASE).href);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;   // projeto em Gamma: textura crua
    t.flipY = false;   // UVs do GLB são glTF (origem no topo): sem flip o texel bate com o do Unity
    texturas.set(nome, t);
  }
  return texturas.get(nome);
}
/** Receita para (nome do material, modelo): a do modelo, senão a global, senão a do Charmander. */
export function receitaFogo(nome, modelo = ''){
  const m = (modelo.match(/pm\d{4}/) || [''])[0];
  return FOGO_MODELO[m]?.[nome] || FOGO[nome] || (/Sten/i.test(nome) ? OUT_0004 : CORE_0004);
}
/** Material de chama para o nome de material do GLB (uma instância por modelo+nome, compartilhada entre clones). */
export function materialFogo(nome, modelo = ''){
  const chave = (modelo.match(/pm\d{4}/) || [''])[0] + '|' + nome;
  if (materiais.has(chave)) return materiais.get(chave);
  const r = receitaFogo(nome, modelo);
  const casca = r.tipo !== 'core';
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
    blending: THREE.NormalBlending,                              // SrcAlpha / OneMinusSrcAlpha, como no jogo
    side: r.tipo === 'out' ? THREE.FrontSide : THREE.DoubleSide, // PokemonFireOut faz Cull Back; os outros Cull Off
    uniforms: {
      tMain: { value: textura(r.main) }, tMask: { value: textura(r.mask) }, tNoise: { value: textura(r.noise) },
      tempo: { value: Math.random() * 10 }, wide: { value: r.wide ?? 1 }, scale: { value: r.scale ?? 1 },
      kFres: { value: casca ? 1.88 : 4.55 }, tipo: { value: casca ? 1 : 0 },
      vel: { value: new THREE.Vector4(r.vel[0], -r.vel[1], r.vel[2], -r.vel[3]) },   // v do glTF cresce pro outro lado
      core: { value: new THREE.Color(...r.core) }, fora: { value: new THREE.Color(...r.fora) },
    },
  });
  mat.name = 'fogo:' + chave;
  materiais.set(chave, mat);
  return mat;
}
/** Nos corpos: toda malha com material de chama do jogo (ou nó chamado Fire…) ganha o shader.
 *  `modelo` = nome/caminho do GLB (pm0004_00…) pra escolher a receita da espécie. Devolve quantas trocou. */
export function aplicarFogo(corpo, modelo = ''){
  let n = 0;
  corpo.traverse(o => {
    if (!o.isMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    const nomeNo = (o.name || '').match(EH_MALHA_FOGO);   // Charmeleon: material perdido no export, nó "FireCoreA_OptMesh…"
    ms.forEach((mt, i) => {
      let nome = mt?.name || '';
      if (!EH_FOGO.test(nome)){
        if (!nomeNo) return;
        nome = 'Fire' + nomeNo[1] + (nomeNo[2] || 'A') + '1.tga';   // → FireCoreA1.tga / FireStenA1.tga
      }
      const novo = materialFogo(nome, modelo);
      if (Array.isArray(o.material)) o.material[i] = novo; else o.material = novo;
      o.castShadow = false; n++;
      if (nomeNo) o.renderOrder = /Sten/i.test(nome) ? 2 : 1;      // casca depois do núcleo (fila 3001 do jogo); nas malhas mescladas a ordem dos grupos já faz isso
    });
  });
  return n;
}
/** Anda o tempo das chamas (chamar no laço). */
export function atualizarFogo(dt){ for (const m of materiais.values()) m.uniforms.tempo.value += dt; }
