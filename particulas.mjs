/**
 * Partícula de verdade em 3D, reconstruída a partir do ParticleSystem do jogo.
 *
 * O flipbook (efeitos assados) é barato e fiel de frente, mas achata o volume —
 * num mundo aberto com câmera livre isso aparece na hora. Aqui cada sistema do
 * efeito original vira um `InstancedMesh` de quads, com os mesmos números que o
 * Unity usava: vida, velocidade, tamanho, gradiente de cor, forma de emissão,
 * rajadas e modo de render.
 *
 * Os parâmetros saem de `unity_skill/Assets/Editor/ExtrairParticulas.cs`, que lê
 * pela API do editor e AMOSTRA as curvas em 12 pontos — o YAML de um
 * ParticleSystem tem curva em quatro formatos diferentes, e amostrar resolve
 * todos de uma vez.
 *
 * `simulationSpace` decide se a partícula acompanha o emissor (Local) ou fica
 * onde nasceu (World). No acervo inteiro World é só 5%, mas nas fases `Fly` —
 * os projéteis que viajam — é a MAIORIA dos sistemas: são os rastros que devem
 * ficar para trás enquanto a bola de fogo avança. Sem isso o rastro gruda no
 * projétil e o golpe perde a sensação de velocidade.
 *
 * `renderMode: Mesh` (74 dos 199 sistemas) desenha uma MALHA 3D por partícula em
 * vez de um quad — anel de onda de choque, cilindro de feixe, pedra, base de
 * fogo. A textura desses é de superfície, cheia: num quad viraria um quadrado
 * opaco. Por isso a malha é exportada junto (9 únicas, 157 KB) e usada como
 * geometria da instância.
 */
import * as THREE from 'three';

const BASE = './particulas';
/* O `?v=` da página chega até aqui pela URL do próprio módulo, e é repassado a
   todo fetch. Sem isso o navegador servia o JSON antigo do cache — o efeito
   vinha SEM o campo `malhas` e eu passei meia hora consertando um shader que
   nunca era chamado. */
const VER = new URL(import.meta.url).search;
// o mesmo `?v=` vai pro módulo dos shaders, senão o navegador serve a versão velha do cache
const Shaders = await import('./efeito_shaders.mjs' + VER);
/* Shaders do JOGO (efeito_shaders.mjs) quando o material real do sistema é conhecido
   (particulas/materiais.json). `?shaders=0` na página desliga, pra comparar com a
   aproximação antiga. */
let usarJogo = !/[?&]shaders=0/.test(location.search);
export function usarShadersDoJogo(v){ usarJogo = !!v; }
let _materiais = null;
function materiais(){
  return _materiais ||= fetch(`${BASE}/materiais.json${VER}`).then(r => r.ok ? r.json() : {}).catch(() => ({}));
}

/* ------------------------------------------------------------- material */
/* Shader próprio em vez de MeshBasicMaterial: preciso de cor E alfa por
   partícula, e o `instanceColor` do three.js só carrega RGB. */
const VERT = /* glsl */`
attribute vec4 aCor;
attribute vec4 aUV;      // xy = deslocamento do quadro, zw = tamanho do quadro
varying vec2 vUv;
varying vec4 vCor;
varying vec3 vN;
void main(){
  vUv = uv * aUV.zw + aUV.xy; vCor = aCor;
  // a normal tem de passar pela matriz da INSTÂNCIA, senão toda pedra recebe a
  // mesma luz por mais que gire
  vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const FRAG = /* glsl */`
uniform sampler2D mapa;
uniform float temMapa;
uniform float luz;                     // 1 = malha sólida, recebe sombreado
uniform vec4 st;                       // escala.xy, deslocamento.zw
varying vec2 vUv;
varying vec4 vCor;
varying vec3 vN;
void main(){
  /* Partícula em modo Mesh sem textura é MATÉRIA, não brilho: são as pedras que
     caem no Earthquake. Sem sombreado elas saem como silhuetas chapadas — foi o
     "sem cor" que apareceu. Cinza-pedra e substituto declarado, porque o
     material Pokemon/Hand perdeu a textura no rip. */
  if (luz > 0.5){
    float d = 0.5 + 0.5 * max(0.0, dot(vN, normalize(vec3(0.4, 0.85, 0.45))));
    gl_FragColor = vec4(vec3(0.54, 0.52, 0.47) * d * vCor.rgb, vCor.a);
    return;
  }
  vec4 t = temMapa > 0.5 ? texture2D(mapa, vUv * st.xy + st.zw) : vec4(1.0);
  gl_FragColor = t * vCor;
  if (gl_FragColor.a < 0.004) discard;
}`;

/* Muita textura de partícula não tem canal alfa nenhum: o shader original era
   aditivo e o alfa nunca importou. Se eu respeitar o `mistura: Alpha` que veio
   do material nesses casos, a partícula vira um QUADRADO OPACO — foi o retângulo
   laranja que apareceu no Flamethrower. Então eu meço o alfa da imagem: se ela é
   sólida, o sistema passa a aditivo, que é como o jogo desenhava. */
function temAlfa(img){
  try {
    const n = 48;
    const cv = document.createElement('canvas');
    cv.width = cv.height = n;
    const c = cv.getContext('2d', { willReadFrequently: true });
    c.drawImage(img, 0, 0, n, n);
    const d = c.getImageData(0, 0, n, n).data;
    let min = 255;
    for (let i = 3; i < d.length; i += 4) if (d[i] < min) min = d[i];
    return min < 250;
  } catch { return true; }      // canvas sujo: assume que tem, é o mais seguro
}

/* Sistema sem arquivo de textura. Três dos quatro casos apontam para o
   `Default-Particle` do Unity, que é um asset EMBUTIDO — existe no editor, não
   no disco, então nada há para copiar. Ele é um borrão radial branco, e gerar
   um igual é fiel, não substituto. O quarto caso (`Pokemon/Hand`, o mesmo da
   pedra) não tem textura nenhuma e aí sim é substituto.

   Sem isso o shader caía em `vec4(1.0)` e desenhava um RETÂNGULO BRANCO
   chapado — foi a mancha caqui atrás do Thunderbolt. */
let _borrao = null;
function borrao(){
  if (_borrao) return _borrao;
  const n = 64, cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(n/2, n/2, 0, n/2, n/2, n/2);
  g.addColorStop(0,    'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.72)');
  g.addColorStop(1,    'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, n, n);
  _borrao = new THREE.CanvasTexture(cv);
  _borrao.colorSpace = THREE.SRGBColorSpace;
  _borrao.userData.temAlfa = true;
  return _borrao;
}

const cacheTex = new Map();
function textura(arq, padrao){
  // só partícula ganha o borrão; malha sem textura fica sem, senão a pedra do
  // Rock Throw sairia com um degradê radial estampado
  if (!arq) return Promise.resolve(padrao ? borrao() : null);
  if (!cacheTex.has(arq)){
    cacheTex.set(arq, new THREE.TextureLoader().loadAsync(`${BASE}/tex/${arq}${VER}`)
      .then(t => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.userData.temAlfa = temAlfa(t.image);
        return t;
      })
      .catch(() => null));
  }
  return cacheTex.get(arq);
}

/* Malha de partícula: JSON cru com posição, normal, uv e índice. São dezenas de
   triângulos, então não vale formato sofisticado. */
const cacheMalha = new Map();
function malha(arq){
  if (!arq) return Promise.resolve(null);
  if (!cacheMalha.has(arq)){
    cacheMalha.set(arq, fetch(`${BASE}/malha/${arq}${VER}`).then(r => r.json()).then(m => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
      if (m.nor?.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(m.nor, 3));
      if (m.uv?.length)  g.setAttribute('uv',     new THREE.Float32BufferAttribute(m.uv, 2));
      if (m.idx?.length) g.setIndex(m.idx);
      return g;
    }).catch(() => null));
  }
  return cacheMalha.get(arq);
}

/** Raio que o efeito ocupa em UNIDADES DELE (antes da escala).
 *
 *  Soma o que espalha partícula: a forma de emissão, o deslocamento do nó, e o
 *  quanto a partícula viaja (velocidade × vida). Serve para caber um efeito num
 *  espaço dado — o Earthquake emite num círculo de raio 5, e num jogo de câmera
 *  alta isso vira pedra espalhada por meio mapa. */
const _pico = c => {
  const a = Array.isArray(c) ? c : (c && (c.b || c.a));
  return a && a.length ? Math.max(...a.map(Math.abs)) : 0;
};
export function raioNatural(desc){
  if (desc._raio !== undefined) return desc._raio;
  let r = 0;
  for (const s of desc.sistemas || []){
    const forma = (s.raio || 0) + Math.max(...(s.caixa || [0])) / 2;
    const viagem = _pico(s.velocidade) * _pico(s.vida);
    const no = Math.hypot(s.pos?.[0] || 0, s.pos?.[2] || 0);
    r = Math.max(r, no + forma + viagem);
  }
  for (const m of desc.malhas || [])
    for (const q of m.pista)
      r = Math.max(r, Math.hypot(q.p[0], q.p[2]));
  return (desc._raio = r || 1);
}

/** Efeito que ATRAVESSA a distância atacante→alvo: algum sistema deslocado em Z — o feixe do
 *  Hit que volta até a boca do atacante (Hydro Pump z=4,97, Aurora Beam 4,79, Take Down 4,82),
 *  a onda do Surf 3,3 à frente. Os prefabs são feitos pra arena do jogo (`BattlePosCompoent`:
 *  unidades em z=±3, boca→alvo ≈ 4,9 unidades), então esses têm de ser escalados pela distância
 *  real entre os dois, senão o feixe atravessa o atacante e sai por trás. */
export const ALCANCE_ARENA = 4.9;
export function atravessa(desc){
  return (desc.sistemas || []).some(s => Math.abs(s.pos?.[2] || 0) >= 1.5);
}

const cacheDesc = new Map();
export function carregar(nome){
  if (!cacheDesc.has(nome)){
    cacheDesc.set(nome, fetch(`${BASE}/${nome}.json${VER}`).then(r => r.json()).then(async j => {
      const ent = (await materiais())[nome];
      for (const [i, s] of j.sistemas.entries()){
        // o borrão radial é para QUAD. Numa malha (a pedra que cai no
        // Earthquake) ele vira um degradê estampado e a pedra sai lavada.
        // material real (shader do jogo + todas as texturas), alinhado por índice com o prefab
        const rec = ent?.sistemas?.[i];
        s._tex = await textura(s.textura, s.modo !== 'Mesh');
        /* Malha pelo GUID do dump quando existe: o export por NOME colidia — há 11 malhas
           diferentes chamadas "Cylinder001" (e 17 "Plane001"), e o cone do Flamethrower
           virava um disco de 148 m de outro efeito. */
        // SÓ em renderMode Mesh: o ParticleSystemRenderer guarda uma malha mesmo quando desenha
        // billboard, e usar ela num billboard virou a placa roxa gigante do Psybeam
        s._geo = s.modo === 'Mesh' ? await malha(rec?.malha || s.malha) : null;
        if (rec && Shaders.conhece(rec.shader)){
          s._rec = rec;
          s._texs = await Shaders.carregarTexturas(rec, `${BASE}/tex`, VER);
        }
      }
      for (const m of (j.malhas = j.malhas || [])){
        const rec = ent?.malhas?.[m.nome];
        m._tex = await textura(m.textura);
        m._geo = await malha(rec?.malha || m.malha);
        if (rec && Shaders.conhece(rec.shader)){
          m._rec = rec;
          m._texs = await Shaders.carregarTexturas(rec, `${BASE}/tex`, VER);
        }
      }
      return j;
    }));
  }
  return cacheDesc.get(nome);
}

/* -------------------------------------------------------------- amostra */
/* Curva em FAIXA vem como {a,b}: o Unity sorteia um ponto entre as duas por
   partícula. `sorte` é esse sorteio, feito uma vez no nascimento e guardado —
   assim a partícula mantém o mesmo tamanho e a mesma vida do começo ao fim,
   como no original. Sem isso todas saem idênticas e o efeito perde a textura. */
const faixa = (c, sorte) => {
  if (!c || Array.isArray(c)) return c;
  const a = c.a, b = c.b;
  if (!a) return b;
  if (!b) return a;
  // curva é lista de números; gradiente é lista de [r,g,b,a] — interpolar os
  // dois com a mesma conta soma array com array e devolve lixo (o Flamethrower
  // saiu azul assim)
  return Array.isArray(a[0])
    ? a.map((cor, i) => cor.map((v, j) => v + (b[i][j] - v) * sorte))
    : a.map((v, i) => v + (b[i] - v) * sorte);
};
const amostrar = (arr, t) => {
  if (!arr || !arr.length) return 0;
  const x = Math.max(0, Math.min(0.9999, t)) * (arr.length - 1);
  const i = Math.floor(x), f = x - i;
  return arr[i] * (1 - f) + arr[Math.min(arr.length - 1, i + 1)] * f;
};
const amostrarCor = (arr, t, saida) => {
  if (!arr || !arr.length) return saida.set(1, 1, 1, 1);
  const x = Math.max(0, Math.min(0.9999, t)) * (arr.length - 1);
  const i = Math.floor(x), f = x - i, a = arr[i], b = arr[Math.min(arr.length - 1, i + 1)];
  return saida.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f,
                   a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f);
};

/** Posição e direção iniciais, conforme a forma de emissão do Unity. */
function nascer(s, pos, dir){
  const r = s.raio || 0;
  switch (s.forma){
    case 'Sphere':
    case 'Hemisphere': {
      let x, y, z, d;
      do { x = Math.random()*2-1; y = Math.random()*2-1; z = Math.random()*2-1;
           d = x*x + y*y + z*z; } while (d > 1 || d < 1e-6);
      if (s.forma === 'Hemisphere' && y < 0) y = -y;
      const n = Math.sqrt(d);
      dir.set(x/n, y/n, z/n);
      pos.copy(dir).multiplyScalar(r * Math.cbrt(Math.random()));
      break;
    }
    case 'Cone': {
      const a = (s.angulo || 25) * Math.PI / 180;
      const th = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random());
      pos.set(Math.cos(th) * r * rr, Math.sin(th) * r * rr, 0);
      // o cone do Unity abre no +Z local
      dir.set(Math.cos(th) * Math.sin(a) * rr, Math.sin(th) * Math.sin(a) * rr, Math.cos(a));
      break;
    }
    case 'Circle': {
      const th = Math.random() * Math.PI * 2;
      pos.set(Math.cos(th) * r, Math.sin(th) * r, 0);
      dir.set(Math.cos(th), Math.sin(th), 0);
      break;
    }
    case 'Box': {
      const c = s.caixa || [1, 1, 1];
      pos.set((Math.random()-.5)*c[0], (Math.random()-.5)*c[1], (Math.random()-.5)*c[2]);
      dir.set(0, 0, 1);
      break;
    }
    default:
      pos.set(0, 0, 0);
      dir.set(0, 0, 1);
  }
}

/* ---------------------------------------------------------------- efeito */
const _p = new THREE.Vector3(), _d = new THREE.Vector3();
const _c = new THREE.Vector4(), _m = new THREE.Matrix4();
const _cv = new THREE.Vector3();                                        // ponto de contato do plano de colisão (clima)
const _q = new THREE.Quaternion(), _e = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _q2 = new THREE.Quaternion(), _eu = new THREE.Euler(0, 0, 0, 'YXZ'), _pr = new THREE.Vector3();   // Euler na ordem do Unity
const _eixoZ = new THREE.Vector3(0, 0, 1), _mw = new THREE.Vector3();
const _mi = new THREE.Matrix4(), _m3 = new THREE.Matrix4();
const _dv = new THREE.Vector3(), _dr = new THREE.Vector3(), _dn = new THREE.Vector3();

/* ------------------------------------------------- malha comum do efeito */
/* Nem tudo num efeito e particula: o Earthquake tem 42 PLACAS DE CHAO, malha
   normal com textura de terra. Sem elas o golpe e so poeira no vazio.

   Duas armadilhas, as duas ja custaram caro:

   1. A mistura NAO pode sair do `_DstBlend`. As placas dao `Additive` por ali e
      sao `Legacy Shaders/Particles/Alpha Blended` fila 2996 — alfa. Quem manda
      e o NOME do shader e a FILA: abaixo de 2450 e opaco, "add" no nome e
      aditivo, o resto e alfa.
   2. Nem toda malha do prefab e para aparecer. O artista estaciona a malha-fonte
      da particula na cena, encolhida a 0,01, e aponta o ParticleSystem para ela.
      Desenhar isso poe uma pedra de 8 mm e um quadrado solto no meio do efeito. */
function misturaDeMalha(m){
  const sh = (m.shader || '').toLowerCase();
  if (sh.includes('add')) return 'aditivo';
  if ((m.fila ?? 3000) < 2450) return 'opaco';
  return 'alfa';
}

const VERT_M = `
varying vec2 vUv; varying vec3 vN;
void main(){
  vUv = uv; vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG_M = `
uniform sampler2D mapa; uniform int temMapa; uniform vec4 tinta; uniform int luz;
uniform vec4 st;                       // escala.xy, deslocamento.zw
varying vec2 vUv; varying vec3 vN;
void main(){
  vec4 c = temMapa == 1 ? texture2D(mapa, vUv * st.xy + st.zw) : vec4(1.0);
  c *= tinta;
  // shader de partícula é sem luz; malha opaca sem luz vira silhueta chapada
  if (luz == 1) c.rgb *= 0.55 + 0.45 * max(0.0, dot(vN, normalize(vec3(0.4, 0.8, 0.5))));
  if (c.a < 0.01) discard;
  gl_FragColor = c;
}`;

export class Efeito {
  /** @param desc     o JSON já carregado
   *  @param escala   multiplica tudo
   *  @param espalha  aperta só o ESPALHAMENTO — posição, velocidade e gravidade —
   *    deixando o tamanho da partícula intacto. É o que faz um golpe de arena
   *    caber num jogo de câmera alta: o Earthquake tem raio natural 24,5 contra
   *    2,6 do Quick Attack, e encolher tudo por igual deixaria as faíscas
   *    invisíveis em vez de juntá-las. */
  constructor(desc, { escala = 1, espalha = 1 } = {}){
    this.taxaMul = arguments[1]?.taxaMul || 1;   // clima: multiplica a emissão (chuva ambiente precisa de MUITO mais gota que um golpe)
    this.raiz = new THREE.Group();
    /* As partículas em World guardam posição de MUNDO. Este grupo é filho da
       raiz mas carrega a matriz inversa dela, então sua matriz de mundo é a
       identidade — o que faz a coordenada de mundo desenhar no lugar certo por
       mais que a raiz se mova. Assim o efeito inteiro continua sendo um objeto
       só para quem usa. */
    this.mundo = new THREE.Group();
    this.mundo.matrixAutoUpdate = false;
    this.raiz.add(this.mundo);
    this.escala = escala;
    this.espalha = espalha;
    this.alcance = escala * espalha;      // posição e velocidade
    this.duracaoPista = desc.duracao || 0;   // janela em que a pista foi assada
    this.t = 0;
    this.sistemas = [];

    for (const s of desc.sistemas){
      // sem a malha, um sistema Mesh só saberia desenhar um quadrado opaco
      if (s.modo === 'Mesh' && !s._geo) continue;
      const max = Math.min(s.maximo || 100, 400);
      const solida = s.modo === 'Mesh' && !s.textura;   // pedra, não brilho
      // shader do JOGO quando o material real é conhecido; senão a aproximação antiga
      const doJogo = (s._texs && usarJogo) ? Shaders.criarMaterial(s._rec, s._texs, { instanciado: true }) : null;
      const mat = doJogo || new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG,
        uniforms: { mapa: { value: s._tex || null }, temMapa: { value: s._tex ? 1 : 0 },
                    luz: { value: solida ? 1 : 0 },
                    st: { value: new THREE.Vector4(...(s.st || [1, 1, 0, 0])) } },
        transparent: !solida, depthWrite: solida, side: THREE.DoubleSide,
        // textura sólida só faz sentido em aditivo; em alfa vira quadrado opaco
        blending: solida ? THREE.NoBlending
          : (s.mistura === 'Additive' || (s._tex && !s._tex.userData.temAlfa))
            ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      /* `_TintColor` multiplica a partícula. Os shaders de partícula do Unity
         fazem `tex * tint * 2` — é por isso que o padrão é cinza 0,5, que dá
         exatamente 1. Ignorar isso deixa 96 dos 199 sistemas com cor e
         opacidade erradas. */
      const t = s.tinta;
      // com o shader do jogo a tinta (_TintColor/_MainColor) é aplicada no próprio shader
      s._tinta = (t && !doJogo) ? { r: t[0] * 2, g: t[1] * 2, b: t[2] * 2, a: t[3] * 2 }
                                : { r: 1, g: 1, b: 1, a: 1 };
      if (s.st && s._tex) s._tex.wrapS = s._tex.wrapT = THREE.RepeatWrapping;
      /* CLONE. `s._geo` vem do cache compartilhado, e logo abaixo eu escrevo
         `aCor`/`aUV` nela — dois sistemas com a mesma malha (o Rock Throw tem
         dois em cima do `Plane001`) sobrescreviam um o buffer do outro, e o
         segundo desenhava com as cores do primeiro. Saía quadrilátero chapado
         no lugar de brilho. */
      const geo = s._geo ? s._geo.clone() : new THREE.PlaneGeometry(1, 1);
      const im = new THREE.InstancedMesh(geo, mat, max);
      im.frustumCulled = false;
      if (doJogo) im.renderOrder = Shaders.ordem(s._rec);   // fila de render do material do jogo
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.geometry.setAttribute('aCor',
        new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4));
      const uvs = new Float32Array(max * 4);
      for (let i = 0; i < max; i++){ uvs[i*4+2] = 1; uvs[i*4+3] = 1; }   // quadro cheio
      im.geometry.setAttribute('aUV', new THREE.InstancedBufferAttribute(uvs, 4));
      im.count = 0;

      const no = new THREE.Group();
      no.position.fromArray(s.pos).multiplyScalar(escala * espalha);
      /* Euler do Unity é Z, depois X, depois Y (q = Ry·Rx·Rz) — ordem 'YXZ' no three.js. O padrão
         'XYZ' só coincide quando um eixo é zero; os cones do Hydro Pump ([270, 277, 0]) e 40% dos
         sistemas têm dois ou três ângulos, e saíam apontando pra outro lado. */
      no.rotation.order = 'YXZ';
      no.rotation.set(s.rot[0]*Math.PI/180, s.rot[1]*Math.PI/180, s.rot[2]*Math.PI/180);
      no.scale.fromArray(s.esc);
      this.raiz.add(no);
      // em World a malha sai de baixo do nó que se move
      (s.espaco === 'World' ? this.mundo : no).add(im);

      this.sistemas.push({
        cfg: s, im, no, mat,
        vivas: [],                     // {pos, vel, idade, vida, tam, giro}
        proxima: 0,                    // acumulador da emissão contínua
        rajadasFeitas: new Set(),
      });
    }
    /* Sistema usado como SUB-EMISSOR não emite sozinho: no Unity ele é dirigido
       pela partícula-mãe, e a `rateOverTime` dele vale POR MÃE. Deixar ele
       emitindo por conta própria dobra o efeito e enche a tela. */
    for (const S of this.sistemas)
      for (const sb of (S.cfg.subs || []))
        if (this.sistemas[sb.alvo]) this.sistemas[sb.alvo].soSub = true;
    // ---- malhas comuns (placas do chão, etc.)
    /* Grupo próprio porque as malhas de chão vêm noutra unidade: as partículas
       são autoradas em torno do bicho, as placas em torno da ARENA (o campo do
       Earthquake tem 26 unidades). `limitarChao` reescala só este grupo. */
    this.grupoMalhas = new THREE.Group();
    this.raiz.add(this.grupoMalhas);
    this.malhas = [];
    const fontes = new Set(desc.sistemas.map(s => s.malha).filter(Boolean));
    for (const m of (desc.malhas || [])){
      if (!m._geo) continue;
      if (fontes.has(m.malha)) continue;                       // é fonte de partícula
      const eMax = Math.max(...m.pista.map(q => Math.max(...q.e.map(Math.abs))));
      if (eMax < 0.05) continue;                               // estacionada no prefab
      const mist = misturaDeMalha(m);
      const dobra = (m.shader || '').toLowerCase().includes('particle') ? 2 : 1;
      /* A pedra do Rock Throw não tem textura em slot NENHUM do material e
         nenhuma cor: o rip perdeu a referência (mesma falha dos monstros com
         textura em branco). Branco puro vira bola de neve, então entra um
         cinza-pedra — é substituto declarado, não fidelidade. */
      const t = m.tinta || (mist === 'opaco' && !m._tex ? [0.54, 0.52, 0.47, 1] : null);
      const mat = ((m._texs && usarJogo) ? Shaders.criarMaterial(m._rec, m._texs, { instanciado: false }) : null) || new THREE.ShaderMaterial({
        vertexShader: VERT_M, fragmentShader: FRAG_M,
        uniforms: {
          mapa: { value: m._tex || null }, temMapa: { value: m._tex ? 1 : 0 },
          tinta: { value: new THREE.Vector4(...(t ? t.map(v => v * dobra) : [1, 1, 1, 1])) },
          st: { value: new THREE.Vector4(...(m.st || [1, 1, 0, 0])) },
          luz: { value: mist === 'opaco' ? 1 : 0 },
        },
        transparent: mist !== 'opaco',
        depthWrite: mist === 'opaco',
        side: THREE.DoubleSide,
        blending: mist === 'aditivo' ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      /* As placas pedem `_MainTex_ST` 5x5 e a UV da malha chega a 3,7. Duas
         coisas precisam estar certas, e eu errei as duas antes de acertar:
         `repeat`/`offset` do three.js SÓ funcionam nos materiais embutidos, que
         montam uma `uvTransform` — num ShaderMaterial cru a UV vai pura para o
         `texture2D`, então o ST tem que ser uniforme (acima). E o wrap, esse sim
         parâmetro da GL, precisa ser Repeat: grampeando, toda UV acima de 1 vira
         o pixel da borda e a rachadura sai como um borrão chapado cor de caqui. */
      if (m._tex) m._tex.wrapS = m._tex.wrapT = THREE.RepeatWrapping;
      const obj = new THREE.Mesh(m._geo, mat);
      obj.frustumCulled = false;
      obj.renderOrder = mat.userData.doJogo ? Shaders.ordem(m._rec) : (mist === 'opaco' ? 0 : 1);
      this.grupoMalhas.add(obj);
      this.malhas.push({ cfg: m, obj });
    }
    /* Efeito de CHAO se reconhece pela propria geometria: as malhas somadas dao
       uma caixa larga e chapada. O Earthquake sao 42 placas num disco de ~3 por
       0,15 de altura. Isso decide onde o efeito nasce — nascer na boca poe o
       terremoto flutuando na cara do bicho. */
    if (this.malhas.length){
      /* Medir com o PRIMEIRO quadro da pista aplicado. Sem isso cada placa é
         medida na origem e o que sai é o tamanho de UMA placa, não do campo —
         era por isso que o limitador do piso nunca disparava. */
      this._porQuadro(0);
      const cx = new THREE.Box3();
      for (const M of this.malhas){
        M.obj.updateMatrixWorld(true);
        cx.union(new THREE.Box3().setFromObject(M.obj));
      }
      const t = cx.getSize(new THREE.Vector3());
      this.noChao = t.y < 0.35 * Math.max(t.x, t.z);
      this.raioChao = Math.max(t.x, t.z) / 2;
    }

    this.duracao = Math.max(0.4, ...desc.sistemas.map(s =>
      (s.duracao || 0) + (s.atraso || 0) + amostrar(s.vida, 0)),
      this.malhas.length ? (desc.duracao || 0) : 0);
  }

  get vivo(){ return this.t < this.duracao; }

  /** Põe as malhas no quadro correspondente ao tempo `t` da pista assada.
   *  Eu não interpreto o Animator do Unity — amostrei ele no editor, em 20
   *  passos, e aqui só interpolo. Mesmo truque das curvas de partícula. */
  _porQuadro(t){
    for (const M of this.malhas){
      const q = M.cfg.pista;
      const x = Math.max(0, Math.min(0.9999, t / (this.duracaoPista || this.duracao || 1)))
              * (q.length - 1);
      const i = Math.floor(x), f = x - i, a = q[i], b = q[Math.min(q.length - 1, i + 1)];
      M.obj.visible = a.on === 1;
      if (!M.obj.visible) continue;
      const e = this.escala;
      M.obj.position.set((a.p[0] + (b.p[0] - a.p[0]) * f) * e,
                         (a.p[1] + (b.p[1] - a.p[1]) * f) * e,
                         (a.p[2] + (b.p[2] - a.p[2]) * f) * e);
      M.obj.rotation.order = 'YXZ';   // Euler do Unity
      M.obj.rotation.set((a.r[0] + (b.r[0] - a.r[0]) * f) * Math.PI / 180,
                         (a.r[1] + (b.r[1] - a.r[1]) * f) * Math.PI / 180,
                         (a.r[2] + (b.r[2] - a.r[2]) * f) * Math.PI / 180);
      M.obj.scale.set((a.e[0] + (b.e[0] - a.e[0]) * f) * e,
                      (a.e[1] + (b.e[1] - a.e[1]) * f) * e,
                      (a.e[2] + (b.e[2] - a.e[2]) * f) * e);
    }
  }

  /** Encolhe o piso do efeito para caber num raio, se ele vier maior. */
  limitarChao(raio){
    if (!this.raioChao || this.raioChao <= raio) return;
    this.grupoMalhas.scale.setScalar(raio / this.raioChao);
  }

  atualizar(dt, cam){
    this.t += dt;
    // `_Time.y` dos shaders do jogo (rolagem de UV, folha de sprite)
    for (const S of this.sistemas) if (S.mat.userData.doJogo) S.mat.uniforms.tempo.value += dt;
    for (const M of this.malhas) if (M.obj.material.userData.doJogo) M.obj.material.uniforms.tempo.value += dt;
    this.raiz.updateMatrixWorld(true);
    this.mundo.matrix.copy(this.raiz.matrixWorld).invert();
    this.mundo.matrixWorld.identity();
    /* Pista assada em 20 quadros: eu não interpreto o Animator, eu amostrei ele
       no editor. Mesmo truque das curvas — não preciso entender, preciso amostrar. */
    this._porQuadro(this.t);

    for (const S of this.sistemas){
      const s = S.cfg;
      const tLocal = this.t - (s.atraso || 0);

      // ---- emissão
      if (tLocal >= 0 && (s.laco || tLocal <= s.duracao) && s.emitindo && !S.soSub){
        const k = s.duracao ? (tLocal % s.duracao) / s.duracao : 0;
        const taxa = amostrar(s.taxa, k) * this.taxaMul;
        S.proxima += taxa * dt;
        while (S.proxima >= 1){ S.proxima -= 1; this._nascer(S, k); }
        for (const [i, r] of (s.rajadas || []).entries()){
          if (S.rajadasFeitas.has(i) || tLocal < r.t) continue;
          S.rajadasFeitas.add(i);
          for (let n = 0; n < Math.min(r.n, 200); n++) this._nascer(S, k);
        }
      }

      // ---- simulação
      const g = (s.gravidade || 0) * 9.81;
      const subs = s.subs || [];
      for (let i = S.vivas.length - 1; i >= 0; i--){
        const p = S.vivas[i];
        p.idade += dt;
        if (p.idade >= p.vida){
          // sub-emissor de MORTE: a faísca que apaga vira fumaça no lugar
          for (const sb of subs) if (sb.tipo === 'Death') this._subEmitir(S, sb, p, dt, true);
          S.vivas.splice(i, 1);
          continue;
        }
        // sub-emissor de NASCIMENTO: no Unity ele continua saindo da mãe
        // enquanto ela vive — é isso que faz o rastro de faíscas do projétil
        for (const sb of subs) if (sb.tipo !== 'Death' && sb.tipo !== 'Collision') this._subEmitir(S, sb, p, dt, false);   // Collision dispara no plano (abaixo), não continuamente
        const v = p.idade / p.vida;
        if (s.velVida){
          /* Unity SOMA o velocityOverLifetime à velocidade de nascimento (startSpeed); substituir
             apagava a queda da chuva (startSpeed 20 virava só o vento lateral do velVida). */
          p.vel.x = (p.vel0?.x || 0) + amostrar(faixa(s.velVida.x, 0.5), v) * this.alcance;
          p.vel.y = (p.vel0?.y || 0) + amostrar(faixa(s.velVida.y, 0.5), v) * this.alcance;
          p.vel.z = (p.vel0?.z || 0) + amostrar(faixa(s.velVida.z, 0.5), v) * this.alcance;
        }
        p.vel.y -= g * this.espalha * dt;
        /* Arrasto: 31 dos 199 sistemas usam. Sem ele a rajada sai reta e some
           longe, em vez de desacelerar e assentar perto — que é o que dá peso
           ao impacto. */
        if (s.arrasto > 0) p.vel.multiplyScalar(Math.max(0, 1 - s.arrasto * dt * 8));
        p.pos.addScaledVector(p.vel, dt);
        if (this.planoColisao != null && S.cfg.espaco === 'World' && p.pos.y <= this.planoColisao){
          /* CollisionModule do Unity emulado por um plano (a chuva do jogo usa Plane + subs 'Collision'):
             splash ORIGINAL no ponto de contato e a gota morre — sem atravessar o chão. */
          _cv.set(p.pos.x, this.planoColisao, p.pos.z);
          for (const sb of (s.subs || [])) if (sb.tipo === 'Collision') this._subEmitir(S, sb, { pos: _cv }, dt, true);
          S.vivas.splice(i, 1);
          continue;
        }
        p.giro += p.giroVel * dt;
        /* Ruído. O Unity roda Perlin de verdade em N oitavas; aqui são três
           senos em frequências desencontradas, com fase sorteada por partícula.
           Não é o mesmo campo, mas faz o mesmo trabalho: tirar a linha reta da
           fumaça. O deslocamento não entra na velocidade — se entrasse, ele se
           acumularia e a partícula sairia voando. */
        if (s.ruido){
          const R = s.ruido, f = R.freq || 1, w = this.t * (R.rolagem || 1);
          const forca = amostrar(faixa(R.forca, 0.5), v) * this.alcance;
          p.ruido.set(Math.sin((p.pos.y + p.fase.x) * f + w),
                      Math.sin((p.pos.z + p.fase.y) * f + w * 1.13),
                      Math.sin((p.pos.x + p.fase.z) * f + w * 0.87)).multiplyScalar(forca);
        }
      }

      // ---- escrita das instâncias
      const cores = S.im.geometry.getAttribute('aCor');
      const quadros = S.im.geometry.getAttribute('aUV');
      const F = s.folha;
      let n = 0;
      for (const p of S.vivas){
        if (n >= S.im.instanceMatrix.count) break;
        const v = p.idade / p.vida;
        const base = Math.min(p.tam * (s.tamVida ? amostrar(faixa(s.tamVida, 0.5), v) : 1),
                              this.escala * 6);
        // tamanho não-uniforme: 26 sistemas usam, e é o que estica chama e faixa
        const tx = base * (p.tam3 ? p.tam3.x : 1);
        const ty = base * (p.tam3 ? p.tam3.y : 1);
        const tam = base;
        amostrarCor(faixa(s.corVida, 0.5), v, _c);
        const T = s._tinta;
        cores.setXYZW(n, p.cor.x * _c.x * T.r, p.cor.y * _c.y * T.g,
                         p.cor.z * _c.z * T.b, p.cor.w * _c.w * T.a);

        /* Folha de sprite: a textura é uma tira e o quadro anda com a VIDA da
           partícula. Sem isso a folha inteira aparece espremida num quad, que
           foi o que deixou a chama "listrada". */
        if (F){
          const total = F.x * F.y;
          const q = Math.min(total - 1, Math.floor(v * total * F.ciclos) % total);
          quadros.setXYZW(n, (q % F.x) / F.x, 1 - (Math.floor(q / F.x) + 1) / F.y,
                          1 / F.x, 1 / F.y);
        }

        const P = s.ruido ? _pr.copy(p.pos).add(p.ruido) : p.pos;

        if (s.modo === 'Mesh'){
          /* Malha não é billboard: ela vive orientada no mundo, com a rotação da
             própria partícula. Quem já a coloca de pé é a rotação do sistema,
             aplicada no grupo pai. */
          if (p.giro3) _q.setFromEuler(_eu.set(p.giro3.x, p.giro3.y, p.giro3.z + p.giro));
          else _q.setFromAxisAngle(_up, p.giro);
          _m.compose(P, _q, _e.set(tx, ty, tam));
        } else if (s.modo === 'Stretch' && p.vel.lengthSq() > 1e-8){
          /* Esticada na direção do movimento — mas é BILLBOARD: o comprimento
             segue a velocidade e a largura fica perpendicular à câmera. Eu
             montava só a rotação mínima de +Y para a velocidade, cujo roll é
             arbitrário: a faixa aparecia de perfil (some) ou de frente (lasca
             branca larga). Era o "estranho" do Hydro Pump, e vale para os 32
             sistemas em Stretch. */
          _d.copy(p.vel).normalize();                        // eixo do comprimento
          _dv.subVectors(cam.position, P).normalize();
          _dr.crossVectors(_d, _dv);
          if (_dr.lengthSq() < 1e-8) _dr.set(1, 0, 0); else _dr.normalize();
          _dn.crossVectors(_dr, _d);
          _q.setFromRotationMatrix(_m3.makeBasis(_dr, _d, _dn));
          const comp = Math.abs(s.esticar || 1) * ty;
          _m.compose(P, _q, _e.set(tx, comp, tam));
        } else {
          /* Alinhamento. `View` (o padrão, 122 sistemas) encara a câmera.
             `Local` NÃO encara: fica na orientação do emissor — é o que um
             decalque de chão precisa, senão ele gira junto com quem olha.
             Os 22 em modo Mesh já saem certos por outro caminho: a malha vive
             sob o nó do sistema, que é exatamente o espaço local. */
          if (s.alinha === 'Local' || s.alinha === 'World') _q.identity();
          else _q.copy(cam.quaternion);
          if (p.giro3) _q.multiply(_q2.setFromEuler(_eu.set(p.giro3.x, p.giro3.y, p.giro3.z + p.giro)));
          else if (p.giro) _q.multiply(_q2.setFromAxisAngle(_eixoZ, p.giro));
          _m.compose(P, _q, _e.set(tx, ty, tam));
        }
        S.im.setMatrixAt(n, _m);
        n++;
      }
      S.im.count = n;
      S.im.instanceMatrix.needsUpdate = true;
      cores.needsUpdate = true;
      if (s.folha) quadros.needsUpdate = true;
    }
  }

  /** Emite no sistema-alvo a partir de uma partícula-mãe.
   *
   *  No Unity a `rateOverTime` de um sub-emissor vale POR MÃE, e o de tipo
   *  `Birth` continua saindo enquanto a mãe vive — é o rastro de faíscas do
   *  projétil. O de `Death` solta a rajada no lugar onde ela apagou.
   *
   *  Simplificação assumida: a posição da mãe é convertida para o espaço do
   *  alvo, mas a forma de emissão do alvo passa a valer como deslocamento
   *  relativo a ela, não à origem do emissor. */
  _subEmitir(S, sb, p, dt, morte){
    const A = this.sistemas[sb.alvo];
    if (!A || A === S) return;
    if (sb.prob < 1 && Math.random() > sb.prob) return;

    // mãe -> mundo -> espaço do alvo
    _mw.copy(p.pos);
    if (S.cfg.espaco !== 'World') _mw.applyMatrix4(S.no.matrixWorld);
    if (A.cfg.espaco !== 'World') _mw.applyMatrix4(_mi.copy(A.no.matrixWorld).invert());

    if (morte){
      const n = (A.cfg.rajadas || []).reduce((a, r) => a + r.n, 0) || 8;
      for (let i = 0; i < Math.min(n, 60); i++) this._nascer(A, 0, _mw);
      return;
    }
    if (!p.subProx) p.subProx = {};
    const taxa = amostrar(A.cfg.taxa, 0);
    p.subProx[sb.alvo] = (p.subProx[sb.alvo] || 0) + taxa * dt;
    let guarda = 0;
    while (p.subProx[sb.alvo] >= 1 && guarda++ < 20){
      p.subProx[sb.alvo] -= 1;
      this._nascer(A, 0, _mw);
    }
  }

  _nascer(S, k, origem){
    const s = S.cfg;
    if (S.vivas.length >= S.im.instanceMatrix.count) return;
    nascer(s, _p, _d);
    const sorte = Math.random();
    const vel = amostrar(faixa(s.velocidade, sorte), k) * this.alcance;

    /* Em World a partícula nasce no mundo e esquece o emissor: posição e direção
       passam pela matriz do nó AGORA, e depois disso ela não é mais arrastada. */
    if (s.espaco === 'World'){
      S.no.updateMatrixWorld(true);
      if (origem) _p.multiplyScalar(this.alcance).add(origem);
      else _p.multiplyScalar(this.alcance).applyMatrix4(S.no.matrixWorld);
      _d.transformDirection(S.no.matrixWorld);
      S.vivas.push({
        pos: _p.clone(), vel: _d.clone().multiplyScalar(vel), vel0: _d.clone().multiplyScalar(vel), idade: 0,
        vida: Math.max(0.05, amostrar(faixa(s.vida, sorte), k)),
        tam: Math.max(0.001, amostrar(faixa(s.tamanho, sorte), k)) * this.escala,
        giro: amostrar(faixa(s.giro, sorte), k),
        giroVel: s.giroVida ? amostrar(faixa(s.giroVida, sorte), 0) : 0,
      giro3: s.giro3D ? { x: amostrar(faixa(s.giro3D[0], sorte), k),
                          y: amostrar(faixa(s.giro3D[1], sorte), k),
                          z: amostrar(faixa(s.giro3D[2], sorte), k) } : null,
      fase: s.ruido ? new THREE.Vector3(Math.random() * 99, Math.random() * 99, Math.random() * 99) : null,
      ruido: s.ruido ? new THREE.Vector3() : null,
      subProx: null,
        tam3: s.tamanho3D ? { x: amostrar(faixa(s.tamanho3D[0], sorte), k),
                              y: amostrar(faixa(s.tamanho3D[1], sorte), k) } : null,
        cor: amostrarCor(faixa(s.corInicial, sorte), k, _c).clone(),
      });
      return;
    }
    amostrarCor(faixa(s.corInicial, sorte), k, _c);
    S.vivas.push({
      pos: origem ? _p.clone().multiplyScalar(this.alcance).add(origem)
                  : _p.clone().multiplyScalar(this.alcance),
      vel: _d.clone().multiplyScalar(vel),
      vel0: _d.clone().multiplyScalar(vel),
      idade: 0,
      vida: Math.max(0.05, amostrar(faixa(s.vida, sorte), k)),
      tam: Math.max(0.001, amostrar(faixa(s.tamanho, sorte), k)) * this.escala,
      giro: amostrar(faixa(s.giro, sorte), k),
      giroVel: s.giroVida ? amostrar(faixa(s.giroVida, sorte), 0) : 0,
      giro3: s.giro3D ? { x: amostrar(faixa(s.giro3D[0], sorte), k),
                          y: amostrar(faixa(s.giro3D[1], sorte), k),
                          z: amostrar(faixa(s.giro3D[2], sorte), k) } : null,
      fase: s.ruido ? new THREE.Vector3(Math.random() * 99, Math.random() * 99, Math.random() * 99) : null,
      ruido: s.ruido ? new THREE.Vector3() : null,
      subProx: null,
      tam3: s.tamanho3D ? { x: amostrar(faixa(s.tamanho3D[0], sorte), k),
                            y: amostrar(faixa(s.tamanho3D[1], sorte), k) } : null,
      cor: _c.clone(),
    });
  }

  descartar(){
    for (const S of this.sistemas){
      // agora cada sistema tem a própria cópia, então descartar é correto
      S.im.geometry.dispose();
      S.mat.dispose();
      S.im.removeFromParent();
    }
    for (const M of this.malhas){ M.obj.material.dispose(); M.obj.removeFromParent(); }
    this.raiz.removeFromParent();
  }
}
