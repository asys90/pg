/*! Poke Fable Online — pokefableonline.com — © 2026 TELIS E PRADO SERVIÇOS DIGITAIS LTDA. Todos os direitos reservados. Proibido copiar, redistribuir, hospedar cópia ou fazer engenharia reversa (Termos de Uso). */
import*as THREE from"three";const BASE=new URL("./cenario/fogo/",import.meta.url);const CORE_0004={tipo:"core",main:"pm0004_FireCoreA1",mask:"pm0004_FireCoreA2",noise:"pm0004_FireStenAMask",core:[1,0.3974,0],fora:[1,0.2352,0],vel:[0,-2.5,0,-0.5],wide:1.55};const OUT_0004={tipo:"out",main:"pm0004_FireStenA1",mask:"pm0004_FireStenAMask",noise:"pm0004_FireStenA2",core:[1,0.4447,0],fora:[1,0,0],vel:[0,-1.5,0,-0.5],wide:3.5,scale:1.86};const CORE_0077={tipo:"core",main:"pm0077_00_FireCore1",mask:"pm0077_00_FireStenMask",noise:"pm0077_00_FireCore2",core:[1,0.4847,0],fora:[1,0.1743,0],vel:[0,2.5,0,0.5],wide:1};const OUT_0077={tipo:"out",main:"pm0077_00_FireSten1",mask:"pm0077_00_FireStenMask",noise:"pm0077_00_FireSten2",core:[1,0.556,0],fora:[1,0.0684,0],vel:[-0.5,-1.5,0,-1],wide:3,scale:1.5};const CORE_0146={tipo:"core",main:"pm0146_00_FireCoreA1",mask:"pm0146_00_FireStenABCMask",noise:"pm0146_00_FireCoreA1",core:[1,0.6427,0],fora:[1,0.0671,0],vel:[0.3,0,0.2,0],wide:1};const OUT_0146_1={tipo:"out146",main:"pm0077_00_FireSten1",mask:"pm0077_00_FireStenMask",noise:"pm0077_00_FireSten2",core:[1,0.4447,0],fora:[1,0.4431,0],vel:[-0.5,-1.5,0,-1],wide:1.31,scale:1.5};const OUT_0146_2={...OUT_0146_1,core:[1,0.556,0],fora:[1,0.5569,0],wide:1.12};const CORE_AZUL={...CORE_0004,core:[0,0.6851,1],fora:[0,0.2918,1],vel:[0,-2.5,0,-0.5],wide:1.55};const OUT_AZUL={...OUT_0004,core:[0,0.2209,1],fora:[0,0.6385,1],vel:[0,-1.5,0,-0.5],wide:0.94,scale:1.86};export const FOGO={"FireCoreA1.tga":CORE_0004,"FireStenA1.tga":OUT_0004,"pm0077_00_FireCoreA1.tga":CORE_0077,"pm0077_00_FireStenA1.tga":OUT_0077,"pm0146_00_FireCoreA1.tga":CORE_0146,"pm0146_00_FireStenA1.tga 1":OUT_0146_1,"pm0146_00_FireStenA1.tga 2":OUT_0146_2,"FireCoreA1.tgabule":CORE_AZUL,"FireStenA1.tgablue":OUT_AZUL};const CORE_0077_S={...CORE_0077,core:[0,0.7764706,1],fora:[0,0.4759736,1]};const OUT_0077_S={...OUT_0077,core:[0,0.77702427,1],fora:[0,0.34482718,1],wide:2};export const FOGO_SHINY={"pm0077_00_FireCoreA1.tga":CORE_0077_S,"pm0077_00_FireStenA1.tga":OUT_0077_S};export const FOGO_SHINY_MODELO={};export const FOGO_MODELO={pm0004:{"FireCoreA1.tga":CORE_0004,"FireStenA1.tga":OUT_0004}};FOGO_MODELO.pm0005=FOGO_MODELO.pm0006=FOGO_MODELO.pm0126=FOGO_MODELO.pm0004;export const EH_FOGO=/Fire(Core|Sten)/i;export const EH_MALHA_FOGO=/^Fire(Core|Sten)([A-Z])?/;const VS=`
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
}`;const FS=`
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
}`;const texturas=new Map,materiais=new Map;function textura(a){if(!texturas.has(a)){const t=new THREE.TextureLoader().load(new URL(a+".tga.png",BASE).href);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.NoColorSpace;t.flipY=false;texturas.set(a,t)}return texturas.get(a)}export function receitaFogo(a,b="",c=false){const m=(b.match(/pm\d{4}/)||[""])[0];if(c&&FOGO_SHINY[a])return FOGO_SHINY_MODELO[m]?.[a]||FOGO_SHINY[a];return FOGO_MODELO[m]?.[a]||FOGO[a]||(/Sten/i.test(a)?OUT_0004:CORE_0004)}export function materialFogo(a,b="",c=false){c=!!(c&&FOGO_SHINY[a]);const d=(b.match(/pm\d{4}/)||[""])[0]+"|"+a+(c?"|shiny":"");if(materiais.has(d))return materiais.get(d);const r=receitaFogo(a,b,c);const e=r.tipo!=="core";const f=new THREE.ShaderMaterial({vertexShader:VS,fragmentShader:FS,transparent:true,depthWrite:false,blending:THREE.NormalBlending,side:r.tipo==="out"?THREE.FrontSide:THREE.DoubleSide,uniforms:{tMain:{value:textura(r.main)},tMask:{value:textura(r.mask)},tNoise:{value:textura(r.noise)},tempo:{value:Math.random()*10},wide:{value:r.wide??1},scale:{value:r.scale??1},kFres:{value:e?1.88:4.55},tipo:{value:e?1:0},vel:{value:new THREE.Vector4(r.vel[0],-r.vel[1],r.vel[2],-r.vel[3])},core:{value:new THREE.Color(...r.core)},fora:{value:new THREE.Color(...r.fora)}}});f.name="fogo:"+d;f.userData.fogoNome=a;f.userData.fogoModelo=b;f.userData.fogoShiny=c;materiais.set(d,f);return f}export function aplicarFogo(a,b=""){let n=0;a.traverse(o=>{if(!o.isMesh)return;const a=Array.isArray(o.material)?o.material:[o.material];const c=(o.name||"").match(EH_MALHA_FOGO);a.forEach((a,i)=>{let d=a?.name||"";if(!EH_FOGO.test(d)){if(!c)return;d="Fire"+c[1]+(c[2]||"A")+"1.tga"}const e=materialFogo(d,b);if(Array.isArray(o.material))o.material[i]=e;else o.material=e;o.castShadow=false;n++;if(c)o.renderOrder=/Sten/i.test(d)?2:1})});return n}export function shinyFogo(a,b=true){let n=0;a?.traverse?.(o=>{if(!o.isMesh)return;const a=Array.isArray(o.material)?o.material:[o.material];a.forEach((a,i)=>{const u=a?.userData;if(!u?.fogoNome)return;const c=!!(b&&FOGO_SHINY[u.fogoNome]);if(!!u.fogoShiny===c)return;const d=materialFogo(u.fogoNome,u.fogoModelo||"",c);if(Array.isArray(o.material))o.material[i]=d;else o.material=d;n++})});return n}export function atualizarFogo(a){for(const m of materiais.values())m.uniforms.tempo.value+=a}