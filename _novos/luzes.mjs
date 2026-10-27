/*! Poke Fable Online — pokefableonline.com — © 2026 TELIS E PRADO SERVIÇOS DIGITAIS LTDA. Todos os direitos reservados. Proibido copiar, redistribuir, hospedar cópia ou fazer engenharia reversa (Termos de Uso). */
export const VERSAO=1;export const PADRAO={ganho:2.4,aditivo:0.1,achata:0.35,halo:1,tamanhoHalo:2.2,tremor:0.06,porta:1,postes:1,alcance:0.8,faixa:3,aproxima:0.5};const BRILHO_ACENDE=0.9,BRILHO_NOITE=0.66;export function fatorNoite(a){const b=a&&Number.isFinite(a.brilho)?a.brilho:1;return Math.max(0,Math.min(1,(BRILHO_ACENDE-b)/(BRILHO_ACENDE-BRILHO_NOITE)))}const TIPOS_REMENDAVEIS=new Set(["MeshStandardMaterial","MeshPhysicalMaterial","MeshBasicMaterial","MeshLambertMaterial","MeshPhongMaterial","MeshToonMaterial","MeshMatcapMaterial"]);function glslVertice(a){return a.replace("#include <common>","#include <common>\nvarying vec3 vLzPos;").replace("#include <project_vertex>",`#include <project_vertex>
	vec4 lzW = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		lzW = batchingMatrix * lzW;
	#endif
	#ifdef USE_INSTANCING
		lzW = instanceMatrix * lzW;
	#endif
	vLzPos = ( modelMatrix * lzW ).xyz;`)}function glslFragmento(a,b){return a.replace("#include <common>",`#include <common>
varying vec3 vLzPos;
uniform vec4 uLzPos[ ${b} ];
uniform vec4 uLzCor[ ${b} ];
uniform int uLzN;
uniform float uLzGanho;
uniform float uLzAditivo;
uniform float uLzAchata;`).replace("#include <opaque_fragment>",`#include <opaque_fragment>
	if ( uLzGanho > 0.001 && uLzN > 0 ) {
		vec3 lzSoma = vec3( 0.0 );
		for ( int i = 0; i < ${b}; i ++ ) {
			if ( i >= uLzN ) break;
			vec4 p = uLzPos[ i ];
			vec3 d = vLzPos - p.xyz;
			d.y *= uLzAchata;
			float k = clamp( 1.0 - length( d ) / p.w, 0.0, 1.0 );
			lzSoma += uLzCor[ i ].rgb * ( k * k * ( 3.0 - 2.0 * k ) );
		}
		gl_FragColor.rgb = gl_FragColor.rgb * ( 1.0 + lzSoma * uLzGanho ) + lzSoma * uLzAditivo;
	}`)}export class Luzes{constructor({THREE:a,cena:b,max:d=16,...c}){this.THREE=a;this.cena=b;this.max=d;this.p={...PADRAO,...c};this.fontes=[];this.remendados=new WeakSet;this.nRemendados=0;this.nFalhas=0;this.U={uLzPos:{value:new Float32Array(d*4)},uLzCor:{value:new Float32Array(d*4)},uLzN:{value:0},uLzGanho:{value:0},uLzAditivo:{value:0},uLzAchata:{value:this.p.achata}};this.noite=0;this.t=0;this.escolhidas=[];this._criarHalos()}remendar(a){let b=0;a.traverse(o=>{if(!o.isMesh||o.isSprite||o.userData?.semLuzes)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){if(!m||this.remendados.has(m)||!TIPOS_REMENDAVEIS.has(m.type))continue;this.remendados.add(m);try{this._remendarMaterial(m);b++}catch(e){this.nFalhas++}}});this.nRemendados+=b;return b}_remendarMaterial(m){const U=this.U,a=this.max;const b=Object.prototype.hasOwnProperty.call(m,"onBeforeCompile")?m.onBeforeCompile:null;const c=typeof m.customProgramCacheKey==="function"?m.customProgramCacheKey():"";m.onBeforeCompile=(c,d)=>{if(b)b.call(m,c,d);Object.assign(c.uniforms,U);c.vertexShader=glslVertice(c.vertexShader);c.fragmentShader=glslFragmento(c.fragmentShader,a)};m.customProgramCacheKey=()=>c+"|luzes"+VERSAO+"."+a;m.needsUpdate=true}_criarHalos(){const T=this.THREE;this.UH={uT:{value:0},uBrilho:{value:0},uTam:{value:this.p.tamanhoHalo},uTremor:{value:this.p.tremor},uAproxima:{value:this.p.aproxima},uNevoa:{value:new T.Vector2(1e8,2e8)}};const a=new T.ShaderMaterial({uniforms:this.UH,transparent:true,depthWrite:false,blending:T.AdditiveBlending,fog:false,toneMapped:false,vertexShader:`
attribute vec2 canto;
attribute vec4 lzDados;   // x = tamanho (m; < 0 = o padrão), y = semente, z = tremor (< 0 = o padrão)
attribute vec3 lzCor;
uniform float uT, uTam, uTremor, uAproxima;
uniform vec2 uNevoa;
varying vec2 vC;
varying vec3 vCor;
varying float vNevoa;
void main(){
	float tr = lzDados.z < 0.0 ? uTremor : lzDados.z;
	float onda = 1.0 + tr * ( sin( uT * 7.3 + lzDados.y * 2.1 ) * 0.6 + sin( uT * 13.7 + lzDados.y ) * 0.4 );
	float tam = ( lzDados.x < 0.0 ? uTam : lzDados.x ) * ( 0.85 + 0.15 * onda );
	vec4 mv = modelViewMatrix * vec4( position, 1.0 );
	mv.xyz -= normalize( mv.xyz ) * uAproxima;
	mv.xy += canto * tam * 0.5;
	gl_Position = projectionMatrix * mv;
	vC = canto;
	vCor = lzCor;
	vNevoa = 1.0 - smoothstep( uNevoa.x, uNevoa.y, -mv.z );
}`,fragmentShader:`
uniform float uBrilho;
varying vec2 vC;
varying vec3 vCor;
varying float vNevoa;
void main(){
	float a = pow( max( 0.0, 1.0 - length( vC ) ), 2.2 ) * vNevoa;
	if ( a < 0.002 ) discard;
	gl_FragColor = vec4( vCor * uBrilho, a );
	#include <colorspace_fragment>
}`});const b=new T.Mesh(new T.BufferGeometry(),a);b.name="luzes-halos";b.userData.semLuzes=true;b.visible=false;b.renderOrder=5;b.frustumCulled=false;b.castShadow=b.receiveShadow=false;b.matrixAutoUpdate=false;b.raycast=()=>{};b.onBeforeRender=()=>{const f=this.cena.fog;if(f&&Number.isFinite(f.far))this.UH.uNevoa.value.set(f.near,f.far);else this.UH.uNevoa.value.set(1e8,2e8)};this.grupoHalos=b;this.halosTodos={malha:b,contagem:0};this.cena.add(b)}_montarHalos(){const T=this.THREE,a=this.fontes.filter(f=>f&&f.tipo!=="porta"),n=a.length;const c=new Float32Array(n*12),d=new Float32Array(n*8),e=new Float32Array(n*16),h=new Float32Array(n*12);const j=new(n*4>65535?Uint32Array:Uint16Array)(n*6),l=new T.Color;const o=[-1,-1,1,-1,1,1,-1,1];a.forEach((f,i)=>{l.set(f.cor||"#ffd49a");const s=semente(f);for(let k=0;k<4;k++){const v=i*4+k;c[v*3]=f.x;c[v*3+1]=f.y;c[v*3+2]=f.z;d[v*2]=o[k*2];d[v*2+1]=o[k*2+1];e[v*4]=f.halo??-1;e[v*4+1]=s;e[v*4+2]=f.tremor??-1;e[v*4+3]=0;h[v*3]=l.r;h[v*3+1]=l.g;h[v*3+2]=l.b}j.set([i*4,i*4+1,i*4+2,i*4,i*4+2,i*4+3],i*6)});const g=new T.BufferGeometry;g.setAttribute("position",new T.BufferAttribute(c,3));g.setAttribute("canto",new T.BufferAttribute(d,2));g.setAttribute("lzDados",new T.BufferAttribute(e,4));g.setAttribute("lzCor",new T.BufferAttribute(h,3));g.setIndex(new T.BufferAttribute(j,1));const m=this.halosTodos.malha;m.geometry.dispose();m.geometry=g;this.halosTodos.contagem=n;this._halosDe=this.fontes;this._halosN=this.fontes.length}atualizar({alvo:c,noite:e=this.noite,dt:h=0.016}={}){this.noite=e;this.t+=h;const U=this.U,p=this.p,j=this.max;U.uLzAchata.value=p.achata;U.uLzGanho.value=e*p.ganho;U.uLzAditivo.value=e*(p.aditivo||0);const k=this.fontes.filter(f=>(f.tipo==="porta"?p.porta:p.postes)>0).map(f=>({f,d:c?(f.x-c.x)**2+(f.z-c.z)**2:0})).sort((a,b)=>a.d-b.d);const l=k.slice(0,j).map(x=>x.f);const m=c&&k.length>j&&p.faixa>0?Math.sqrt(k[j].d):Infinity;this.escolhidas=l;const P=U.uLzPos.value,C=U.uLzCor.value,n=this._cor||(this._cor=new this.THREE.Color);l.forEach((f,i)=>{const a=f.tremor??p.tremor,s=semente(f),c=a?1+a*(Math.sin(this.t*7.3+s*2.1)*0.6+Math.sin(this.t*13.7+s)*0.4):1;const e=m===Infinity?1:Math.min(1,Math.max(0,(m-Math.sqrt(k[i].d))/p.faixa));const h=(f.forca??1)*(f.tipo==="porta"?p.porta:p.postes)*c*e;n.set(f.cor||"#ffd49a");P[i*4]=f.x;P[i*4+1]=f.y;P[i*4+2]=f.z;P[i*4+3]=(f.raio||7)*(p.alcance||1);C[i*4]=n.r*h;C[i*4+1]=n.g*h;C[i*4+2]=n.b*h;C[i*4+3]=1});U.uLzN.value=e>0.001?l.length:0;if(this.fontes!==this._halosDe||this.fontes.length!==this._halosN)this._montarHalos();const o=this.UH,q=this.halosTodos.malha;q.visible=this.halosTodos.contagem>0&&p.halo>0&&p.postes>0&&e>0.02;o.uT.value=this.t;o.uBrilho.value=Math.min(1,e)*p.halo;o.uTam.value=p.tamanhoHalo;o.uTremor.value=p.tremor;o.uAproxima.value=p.aproxima??0}descartar(){this.cena.remove(this.halosTodos.malha);this.halosTodos.malha.geometry.dispose();this.halosTodos.malha.material.dispose();this.fontes=[];this.U.uLzN.value=0}}function semente(f){const s=Math.sin(f.x*12.9898+f.z*78.233)*43758.5453;return(s-Math.floor(s))*6.2832}export function proporPostes({caixa:e,ehRua:f,livre:g,portas:h=[],espaco:k=11,distPorta:l=2.2,jaTem:m=[]}){const n=new Map,o=(i,j)=>i+","+j;const q=Math.floor(e.x0),r=Math.floor(e.z0),s=Math.ceil(e.x1),t=Math.ceil(e.z1);for(let i=q;i<s;i++)for(let j=r;j<t;j++){const cx=i+0.5,cz=j+0.5;n.set(o(i,j),{anda:!!g(cx,cz),rua:!!f(cx,cz)})}const u=(i,j)=>n.get(o(i,j));const w=[[1,0],[-1,0],[0,1],[0,-1]],y=[...w,[1,1],[1,-1],[-1,1],[-1,-1]];const _=[],$=[];for(let i=q+1;i<s-1;i++)for(let j=r+1;j<t-1;j++){const c=u(i,j);if(!c.anda)continue;const fa=y.filter(([a,b])=>u(i+a,j+b)?.anda).length;if(fa<6)continue;if(!c.rua&&w.some(([a,b])=>{const v=u(i+a,j+b);return v&&v.rua&&v.anda}))_.push({x:i+0.5,z:j+0.5});else if(c.rua&&w.some(([a,b])=>{const v=u(i+a,j+b);return v&&(!v.anda||!v.rua)}))$.push({x:i+0.5,z:j+0.5})}const aa=[...m.map(p=>({...p,fixo:true}))];const ba=(x,z,d)=>aa.every(p=>(p.x-x)**2+(p.z-z)**2>=d*d);const ca=(x,z)=>h.every(p=>(p.x-x)**2+(p.z-z)**2>=l*l);const da={centro:0,loja:1,ginasio:2};for(const pt of h.filter(p=>p.tipo in da).sort((a,b)=>da[a.tipo]-da[b.tipo])){const c=[..._,...$].filter(b=>{const d=Math.hypot(b.x-pt.x,b.z-pt.z);return d>=2.5&&d<=5}).sort((a,b)=>Math.hypot(a.x-pt.x,a.z-pt.z)-Math.hypot(b.x-pt.x,b.z-pt.z))[0];if(c&&ba(c.x,c.z,k*0.45)&&ca(c.x,c.z))aa.push({x:c.x,z:c.z,motivo:"porta:"+pt.tipo})}const cx=(e.x0+e.x1)/2,cz=(e.z0+e.z1)/2,ea=(a,b)=>Math.hypot(b.x-cx,b.z-cz)-Math.hypot(a.x-cx,a.z-cz);for(const[ga,ha]of[[_,"rua"],[$,"calcada"]])for(const b of ga.sort(ea))if(ba(b.x,b.z,k)&&ca(b.x,b.z))aa.push({x:b.x,z:b.z,motivo:ha});return aa.filter(p=>!p.fixo)}export function corDeRua(r,g,b){const a=Math.max(r,g,b),c=Math.min(r,g,b),v=a/255,s=a?(a-c)/a:0;let h=0;if(a!==c){const d=a-c;h=a===r?(g-b)/d%6:a===g?(b-r)/d+2:(r-g)/d+4;h*=60;if(h<0)h+=360}if(h>=15&&h<=50&&s>=0.15&&s<=0.7&&v>=0.3&&v<=0.9)return true;return s<0.16&&v>=0.45&&v<=0.92}export function ladoDeFora(x,z,b,r=1.5){let c=0,d=0,n=0;for(let k=0;k<16;k++){const a=k/16*Math.PI*2,e=Math.cos(a),f=Math.sin(a);if(b(x+e*r,z+f*r)){c+=e;d+=f;n++}}const l=Math.hypot(c,d);return n&&l>0.01?{dx:c/l,dz:d/l}:null}