/*! Poke Fable Online — pokefableonline.com — © 2026 TELIS E PRADO SERVIÇOS DIGITAIS LTDA. Todos os direitos reservados. Proibido copiar, redistribuir, hospedar cópia ou fazer engenharia reversa (Termos de Uso). */
import*as THREE from"three";const BASE=new URL("./cenario/lodo/",import.meta.url);const RECEITAS={pm0088:{beto:"pm0089_00_Beto1.tga",mask:"pm0088_00_BetoMask.tga",cor:[0.18490271,0.06581523,0.2735849,0.43137255]},pm0089:{beto:"pm0089_00_Beto1.tga",mask:"pm0089_00_BetoMask.tga",cor:[0.10206581,0.06292275,0.13207549,0.43137255]}};export const EH_LODO=/BetoMask/i;const VS=`
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
}`;const FS=`
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
}`;const texturas=new Map,materiais=new Map;function textura(a){if(!texturas.has(a)){const t=new THREE.TextureLoader().load(new URL(a+".png",BASE).href);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.NoColorSpace;t.flipY=false;texturas.set(a,t)}return texturas.get(a)}function materialLodo(a){if(materiais.has(a))return materiais.get(a);const r=RECEITAS[a];const m=new THREE.ShaderMaterial({name:"lodo:"+a,uniforms:{beto:{value:textura(r.beto)},mask:{value:textura(r.mask)},cor:{value:new THREE.Vector4(...r.cor)},tempo:{value:Math.random()*10},luzDir:{value:new THREE.Vector3(0.3,0.8,0.5)},luzCor:{value:new THREE.Vector3(1,1,1)}},vertexShader:VS,fragmentShader:FS,transparent:true,depthWrite:false,side:THREE.FrontSide});m.userData.lodo=true;materiais.set(a,m);return m}export function aplicarLodo(a,b=""){const c=(b.match(/pm\d{4}/)||[""])[0];if(!RECEITAS[c])return 0;let n=0;a.traverse(o=>{if(!o.isMesh)return;const a=Array.isArray(o.material)?o.material:[o.material];a.forEach((a,i)=>{if(!EH_LODO.test(a?.name||""))return;const b=materialLodo(c);if(Array.isArray(o.material))o.material[i]=b;else o.material=b;o.castShadow=false;o.renderOrder=5;n++})});return n}export function atualizarLodo(a){for(const m of materiais.values())m.uniforms.tempo.value+=a}