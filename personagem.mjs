/* Personagem do jogador — a tabela das skins e a tela de criação (index.html).
 *
 * As 6 skins iniciais do Fairy (menino: Ash, Casaco do Pikachu, Coração de Ouro; menina: Misty, Casaco do Pikachu,
 * Alma de Prata) + o Chapéu de Palha (Boy_030/Girl_030, pedido do Jaime) têm o visual fixo do jogo; o Herói e a Heroína (ArtAssets/Boy/Boy_002, Girl/Girl_002) são tintáveis
 * por canal da máscara (pele, cabelo, roupa, tom, olhos) via tinta.mjs; a Misty aceita cabelo e olhos pela máscara nova
 * (tools/mascara_misty.py). CANAIS/PADRAO/PRESETS são os MESMOS do painel "✎ personagem" da bancada de golpes.
 *
 * Estado: localStorage `personagem` = { tipo, cores } (mesma chave que a bancada; `tipo` = id da skin — nos tintáveis
 * coincide com o nome da tinta: heroi | heroina | misty) e `nome` (JSON, como o lerLS/gravarLS do index).
 *
 * No index.html:
 *   const criacao = Personagem.precisaCriar() ? Personagem.abrir({ som: Som }) : null;   // abre já; o mapa carrega atrás
 *   await criacao; const p = Personagem.ler(); montarPersonagem('./cenario/pc/' + Personagem.glbDe(p) + '.glb', …)
 *   await Personagem.aplicar(ash.pivo, p);                                  // cores (só nos tintáveis)
 *   Personagem.abrir({ som, cancelavel: true, sobreJogo: true }) → jogo.trocarJogador(p)   // Configurações → ✎ Personagem
 *
 * A tela: abas Menino/Menina, 4 cartas por aba com o modelo em 3D (um renderer, viewport/scissor por carta — a mesma
 * técnica da escolha do inicial), a carta escolhida gira (arrastar gira), painel de cores nos tintáveis (repinta ao
 * vivo), nome e "Começar". Com a tela aberta, teclado e roda não chegam ao jogo (guarda em captura, registrada na carga
 * do módulo — antes do index e do menus.mjs).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as Tinta from './tinta.mjs';

export const SKINS = [
  { id: 'ash',      sexo: 'menino', nome: 'Ash',               glb: 'Male_XiaoZhi', desc: 'Conjunto Ash (Fashion 52001)' },
  { id: 'boy_012',  sexo: 'menino', nome: 'Casaco do Pikachu', glb: 'Boy_012',      desc: 'Fashion 52004' },
  { id: 'boy_025',  sexo: 'menino', nome: 'Coração de Ouro',   glb: 'Boy_025',      desc: 'Fashion 52017 (HeartGold)' },
  { id: 'heroi',    sexo: 'menino', nome: 'Herói',             glb: 'Boy_002',      tinta: 'heroi',   desc: 'cores livres: pele, cabelo, roupa, olhos' },
  { id: 'boy_030',  sexo: 'menino', nome: 'Chapéu de Palha',   glb: 'Boy_030',      desc: 'Fashion 52021 · o do Luffy' },
  { id: 'misty',    sexo: 'menina', nome: 'Misty',             glb: 'Girl_001',     tinta: 'misty',   desc: 'Fashion 53001 · cabelo e olhos à escolha' },
  { id: 'girl_012', sexo: 'menina', nome: 'Casaco do Pikachu', glb: 'Girl_012',     desc: 'Fashion 53004' },
  { id: 'girl_025', sexo: 'menina', nome: 'Alma de Prata',     glb: 'Girl_025',     desc: 'Fashion 53017 (SoulSilver)' },
  { id: 'heroina',  sexo: 'menina', nome: 'Heroína',           glb: 'Girl_002',     tinta: 'heroina', desc: 'cores livres: pele, cabelo, vestido, olhos' },
  { id: 'girl_030', sexo: 'menina', nome: 'Chapéu de Palha',   glb: 'Girl_030',     desc: 'Fashion 53021 · o do Luffy' },
];
/* O GUARDA-ROUPA: as outras roupas do dump já exportadas (data/skins_treinador.json com `glbOk`, por
   tools/skins_treinador_ok.mjs) entram como skins de visual fixo (02/09): id = prefab em minúsculas (boy_013…), sem tinta.
   Ficam FORA da tela de criação (que renderiza 4–5 modelos 3D ao vivo por aba — 38 cartas por sexo pesariam demais):
   `skinDe`/`glbDe` reconhecem as duas listas, então um `personagem.tipo = 'boy_013'` salvo (bancada, guarda-roupa futuro no
   Config) veste normalmente no jogo. Sem o arquivo (demo) fica só a lista acima. */
export const SKINS_EXTRA = [];
let roupas = [], receitasCor = {};
try {
  [roupas, receitasCor] = await Promise.all([
    fetch('./data/skins_treinador.json').then(r => r.ok ? r.json() : []),
    fetch('./data/receitas_cor.json').then(r => r.ok ? r.json() : {}).catch(() => ({})),   // receitas das roupas do dump (abaixo)
  ]);
  for (const s of roupas) if (s.glbOk && s.prefab !== 'Boy_001' && !SKINS.some(k => k.glb === s.prefab))
    SKINS_EXTRA.push({ id: s.prefab.toLowerCase(), sexo: s.sexo, nome: s.nome, glb: s.prefab, desc: 'Fashion ' + s.id + (s.inicial ? ' · inicial do jogo' : ''), extra: true });
} catch (e){ console.warn('skins do dump:', e); }
export const PADRAO = {
  heroi:   { pele: '#ffcbaa', cabelo: '#322527', roupa: '#f83537', roupa2: '#ffffff', olhos: '#ffffff' },
  heroina: { pele: '#ffcbaa', cabelo: '#1a4195', roupa: '#ff9bd7', roupa2: '#ffffff', olhos: '#00bdff' },
  misty:   { cabelo: '#f07a4a', olhos: '#00bdff' },
};
/* o que cada canal da máscara pinta (sonda de cor de 30/08): branco = fica como a textura */
export const ROTULOS = {
  heroi:   { pele: 'pele', cabelo: 'cabelo', roupa: 'boné e camisa', roupa2: 'jaqueta e calça (tom)', olhos: 'olhos' },
  heroina: { pele: 'pele', cabelo: 'cabelo', roupa: 'vestido', roupa2: 'chapéu (tom)', olhos: 'olhos' },
  misty:   { cabelo: 'cabelo', olhos: 'olhos' },
};
export const CANAIS = {
  heroi:   { 'fc0001_00_hero_body_col': { R: 'pele', G: 'roupa', B: 'cabelo', K: 'roupa2', mask: 'fc0001_00_hero_body_msk.png' },
             'fc0001_00_hero_face_col': { R: 'pele', G: 'olhos', B: null, K: null, mask: 'fc0001_00_hero_face_msk.png' } },
  heroina: { 'fc0002_00_heroine_body_col': { R: 'pele', G: 'cabelo', B: 'roupa2', K: 'roupa', mask: 'fc0002_00_heroine_body_msk.png' },
             'fc0002_00_heroine_face_col': { R: 'pele', G: 'olhos', B: null, K: null, mask: 'fc0002_00_heroine_face_msk.png' } },
  misty:   { 'body': { R: null, G: 'cabelo', B: null, K: null, mask: 'misty_body_msk.png', neutralizar: ['G'], ganho: 1.55 },
             'fc0002_00_heroine_face_col': { R: [1, 0.9394, 0.9009], G: 'olhos', B: null, K: null, mask: 'fc0002_00_heroine_face_msk.png' } },
};
export const PRESETS = {
  pele: ['#ffe0c4', '#ffcbaa', '#e8b48f', '#c98d63', '#9c6540', '#5b3a26'],
  cabelo: ['#322527', '#1b1b22', '#7a4a2a', '#c98a3a', '#f2d16b', '#d84a2f', '#b8b8c8', '#5b8ef0', '#7bd67b', '#ff9bd7'],
  olhos: ['#ffffff', '#00bdff', '#ffab28', '#5bff28', '#8da5ff', '#6b3f2a', '#ee4444'],
  roupa: ['#f83537', '#1a4195', '#2aa84a', '#f2c230', '#8a3fd1', '#222222', '#eeeeee', '#ff7a1a', '#ff9bd7'],
  roupa2: ['#ffffff', '#f83537', '#1a4195', '#2aa84a', '#f2c230', '#8a3fd1', '#333333', '#ff9bd7'],
  roupa3: ['#d18449', '#7a4a2a', '#f83537', '#1a4195', '#2aa84a', '#f2c230', '#222222', '#eeeeee'],   // 3ª peça das roupas do dump (receitas_cor.json)
};
/* RECEITAS DAS ROUPAS DO DUMP (27/10, data/receitas_cor.json — tools/receitas_cor.mjs, editável no painel): as roupas que o
   jogo original deixava tingir (máscara RGB + canal marcado no .mat) ganham receita no MESMO formato das de cima, com
   id = prefab em minúsculas (boy_012…) — que é também o id da skin, então o `coresDe` acha as cores salvas do jogador.
   Não sobrescrevem as escritas aqui (heroi/heroina/misty). */
for (const [id, r] of Object.entries(receitasCor || {}))
  if (!CANAIS[id] && r?.texturas && r.rotulos && r.padrao){ CANAIS[id] = r.texturas; ROTULOS[id] = r.rotulos; PADRAO[id] = r.padrao; }
/* Painel admin → Skins de treinador, campo "Cores editáveis" (`tinta` no skins_treinador.json, 27/10): liga, desliga ou troca a
   receita de cor de uma skin pelo MODELO (prefab = glb). Sem o campo vale a tabela acima; 'fixo' desliga; 'propria' = a
   receita com o id do próprio modelo; receita que não existe em CANAIS é ignorada. A máscara é feita pra UM modelo — a
   prévia do painel testa se a receita pega antes de salvar. */
for (const r of Array.isArray(roupas) ? roupas : []){
  if (!r?.tinta || !r.prefab) continue;
  const pedida = r.tinta === 'propria' ? String(r.prefab).toLowerCase() : r.tinta;
  const t = pedida !== 'fixo' && CANAIS[pedida] ? pedida : null;
  for (const s of [...SKINS, ...SKINS_EXTRA]) if (s.glb === r.prefab && (s.tinta || null) !== t){
    if (t) s.tinta = t; else delete s.tinta;
    s.desc = t ? 'cores livres: ' + Object.values(ROTULOS[t]).join(', ') : 'visual fixo';
  }
}
/* QUEM APARECE NA TELA DE CRIAÇÃO (27/10, painel admin → Skins de treinador, "Aparece na criação" = `criacao` no
   skins_treinador.json). As fixas de SKINS seguem na ordem de sempre e saem só se o arquivo disser criacao:false; as do
   guarda-roupa (SKINS_EXTRA) entram DEPOIS delas, na ordem do arquivo, quando criacao:true. Arquivo sem o campo = só as
   fixas, como era. O registro do Ash no dump é o Boy_001, mas o jogo desenha o Ash com o Male_XiaoZhi (por isso o
   Boy_001 nem entra no SKINS_EXTRA): o campo dele vale pro Male_XiaoZhi. */
const naCriacao = new Map();                                             // glb → true/false (só quem tem o campo)
for (const r of Array.isArray(roupas) ? roupas : []) if (typeof r?.criacao === 'boolean' && r.prefab) naCriacao.set(r.prefab === 'Boy_001' ? 'Male_XiaoZhi' : r.prefab, r.criacao);
/** As skins que a tela de criação mostra pra um sexo, na ordem das cartas. Nunca vazia (arquivo mal salvo = as fixas). */
export function skinsDaCriacao(sexo){
  const lista = [...SKINS.filter(s => s.sexo === sexo && naCriacao.get(s.glb) !== false),
                 ...SKINS_EXTRA.filter(s => s.sexo === sexo && naCriacao.get(s.glb) === true)];
  return lista.length ? lista : SKINS.filter(s => s.sexo === sexo);
}
/** Skin pelo id, nas duas listas (null se não existe — o `skinDe` cai no Ash). */
export const skinPorId = id => SKINS.find(s => s.id === id) || SKINS_EXTRA.find(s => s.id === id) || null;
const RGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
/** Receita pro tinta.mjs: por textura, a cor de cada canal (string = cor escolhida; array = cor fixa; null = branco). */
export function receita(tinta, cores){
  const out = {};
  for (const [tex, c] of Object.entries(CANAIS[tinta] || {})){
    const cor = k => Array.isArray(c[k]) ? c[k] : c[k] ? RGB(cores[c[k]] || PADRAO[tinta][c[k]] || '#ffffff') : [1, 1, 1];
    out[tex] = { ColorR: cor('R'), ColorG: cor('G'), ColorB: cor('B'), ColorBlack: cor('K'), mask: c.mask, neutralizar: c.neutralizar, ganho: c.ganho };
  }
  return out;
}

/* ------------------------------------------------------------------ estado salvo */
/* 08/09: com conta, `personagem`/`mochila`/`nome` vivem no cofre do conta.mjs, não no aparelho (window.__contaLer/Gravar);
   sem conta (?rede=0, bancadas) é o localStorage mesmo. */
const lerLS = (k, padrao) => { try { const v = window.__contaLer ? window.__contaLer(k) : localStorage.getItem(k); return v ? JSON.parse(v) : padrao; } catch { return padrao; } };
const gravarLS = (k, v) => { try { const t = JSON.stringify(v); if (window.__contaGravar) window.__contaGravar(k, t); else { localStorage.setItem(k, t); window.__contaTocou?.(k); } } catch {} };
export const ler = () => { const p = lerLS('personagem', null); return p && typeof p === 'object' && p.tipo ? p : null; };
export const gravar = p => gravarLS('personagem', p);
export const skinDe = p => SKINS.find(s => s.id === p?.tipo) || SKINS_EXTRA.find(s => s.id === p?.tipo) || SKINS[0];
export const glbDe = p => skinDe(p).glb;
export const nomeDe = p => skinDe(p).nome;
/** Primeira vez (sem `personagem` salvo) ou ?personagem=1. */
export const precisaCriar = (forcar = false) => forcar || !ler();
/** Cores de um tipo tintável: padrão do jogo + o que estiver salvo pra esse tipo. */
export function coresDe(tinta, salvo = ler()){
  if (!tinta || !PADRAO[tinta]) return null;
  return { ...PADRAO[tinta], ...((salvo?.tipo === tinta && salvo.cores) || {}) };
}
/** Pinta um corpo já montado (pivô/cena do GLB) com as cores do personagem e veste a mochila salva.
 *  Skins de visual fixo: só a mochila. */
export async function aplicar(corpo, p = ler()){
  if (!corpo) return 0;
  const bolsa = p?.mochila !== undefined ? p.mochila : lerLS('mochila', null);   // acessório: vale pra qualquer skin
  if (bolsa) vestirMochila(corpo, bolsa).catch(e => console.warn('mochila:', e));   // não espera: o GLB da mochila pode demorar
  const s = skinDe(p); if (!s.tinta) return 0;
  return Tinta.pintar(corpo, receita(s.tinta, coresDe(s.tinta, p)));
}

/* ------------------------------------------------------------------ mochila (acessório nas costas, 02/09)
   O Fairy vende a mochila SEPARADA da roupa (FashionConfig Type 2, 32 modelos, data/mochilas.json): o prefab `Bag###`
   é uma malha SKINNED em 2 ossos do mesmo rig do treinador (`Bip001 Spine` e `Bip001 Spine1`). Aqui a malha da
   mochila é religada ao esqueleto do treinador já montado — os mesmos ossos por nome, com as inversas e o bindMatrix
   do corpo dele —, então ela acompanha qualquer animação e qualquer roupa. Tinta pelo material (npc_tintas.json). */
let _mochilas = null;
const _cacheBolsa = new Map();
export async function listaMochilas(){
  if (!_mochilas) _mochilas = await fetch('./data/mochilas.json').then(r => r.json()).catch(() => []);
  return _mochilas;
}
export const mochilaSalva = () => lerLS('mochila', null);
export function gravarMochila(glb){ gravarLS('mochila', glb || null); }
/** A mochila que já vem na roupa (o Herói Boy_002 traz a malha `bag` dentro do GLB): some quando outra é vestida. */
const mochilaPropria = corpo => { let m = null; corpo?.traverse(o => { if (!m && o.isMesh && /^bag$/i.test(o.name) && !o.userData.mochila) m = o; }); return m; };
/* A malha da mochila vestida fica num WeakMap DO MÓDULO, não em `corpo.userData` (19/09, frente de desempenho):
   `Object3D.copy` serializa o userData com `JSON.stringify`, e uma malha ali dentro arrastaria o esqueleto e as
   texturas inteiras pro JSON a cada clone do corpo. É a mesma armadilha que o `mapOriginal` do tinta.mjs era.
   O `bolsa.userData.mochila` continua sendo só o NOME do GLB (texto), que é barato e o `mochilaPropria` usa. */
const bolsaVestida = new WeakMap();                                    // corpo do treinador → malha da mochila vestida
/** Tira a mochila vestida (se houver) e devolve a da própria roupa. */
export function tirarMochila(corpo){
  const m = corpo && bolsaVestida.get(corpo);
  if (m){ m.parent?.remove(m); bolsaVestida.delete(corpo); }
  const propria = mochilaPropria(corpo); if (propria) propria.visible = true;
}
/** Veste `glb` (ex.: 'Bag001') no treinador `corpo` (pivô/cena do GLB, já montado). Devolve a malha ou null. */
export async function vestirMochila(corpo, glb){
  tirarMochila(corpo);
  if (!corpo || !glb) return null;
  /* A promessa que FALHOU não fica no cache (20/09, revisão do passe fechado): desde que `cenario/pc/` passou a exigir passe, um
     403 solto (cookie que sumiu com o jogo aberto) guardava a rejeição e aquela mochila ficava quebrada até recarregar a página —
     inclusive a dos OUTROS jogadores. Tirando do cache, a próxima montagem tenta de novo, como o resto do jogo já fazia. */
  if (!_cacheBolsa.has(glb)) _cacheBolsa.set(glb, new GLTFLoader().loadAsync('./cenario/pc/' + glb + '.glb').catch(e => { _cacheBolsa.delete(glb); throw e; }));
  const g = await _cacheBolsa.get(glb);
  const cena = SkeletonUtils.clone(g.scene);
  const bolsa = cena.getObjectByProperty('isSkinnedMesh', true); if (!bolsa){ console.warn('mochila sem malha skinned:', glb); return null; }
  // o corpo do treinador = a malha skinned com mais ossos (`body`/`Body`; a `face` só tem a cabeça)
  const skinneds = []; corpo.traverse(o => { if (o.isSkinnedMesh && o.skeleton && !o.userData.mochila) skinneds.push(o); });
  const body = skinneds.sort((a, b) => b.skeleton.bones.length - a.skeleton.bones.length)[0];
  if (!body?.skeleton){ console.warn('mochila: treinador sem esqueleto'); return null; }
  const nomes = bolsa.skeleton.bones.map(b => b.name);
  const idx = nomes.map(n => body.skeleton.bones.findIndex(b => b.name === n));
  if (idx.some(i => i < 0)){ console.warn('mochila: osso não achado no treinador', nomes); return null; }
  /* A mochila vira irmã da malha `body`, MANTENDO a transformação própria do nó dela (o FBX da mochila e do Herói
     vem com o nó da malha em escala 100 e vértices em centímetros; as outras roupas vêm em metros — copiar a
     transformação do corpo encolhia a mochila a 1 cm no Casaco do Pikachu). O esqueleto usa os OSSOS do treinador
     com as inversas e o bindMatrix da própria mochila: o rig é o mesmo (Bip001, mesma pose de descanso), então em
     repouso cai onde o jogo a modelou e depois segue a animação do corpo. */
  const esq = new THREE.Skeleton(idx.map(i => body.skeleton.bones[i]), bolsa.skeleton.boneInverses.map(m => m.clone()));
  bolsa.castShadow = true; bolsa.receiveShadow = true; bolsa.frustumCulled = false;
  body.parent.add(bolsa);
  bolsa.bind(esq, bolsa.bindMatrix.clone());
  bolsa.name = 'mochila'; bolsa.userData.mochila = glb;
  bolsaVestida.set(corpo, bolsa);
  const propria = mochilaPropria(corpo); if (propria) propria.visible = false;   // a mochila da própria roupa dá lugar à vestida
  await Tinta.aplicarTinta(bolsa, glb);
  return bolsa;
}

/* ------------------------------------------------------------------ normais da placa do rosto */
/** Normais da placa do rosto = normais da esfera da cabeça. O rosto dos treinadores (e dos NPCs) é uma placa separada
    na frente da cabeça. Nos modelos do jogo que ficam bons (Boy_025, Girl_025…) as normais da placa vêm "transferidas"
    da esfera da cabeça (desvio de até 53° da geometria); em Boy_002/012 e Girl_002/012 vieram geométricas, e o relevo do
    queixo/boca da placa sombreia escuro — um "cavanhaque" (30/08). Ajusta uma esfera aos vértices da placa (mínimos
    quadrados) e aponta cada normal do centro pro vértice: a placa passa a sombrear igual à cabeça. Uma vez por geometria. */
export function suavizarRosto(corpo){
  let n = 0;
  corpo.traverse(o => {
    if (!o.isMesh || !(/face/i.test(o.name) || /face/i.test(o.parent?.name || ''))) return;
    const g = o.geometry; if (!g || g.userData.rostoSuavizado) return; g.userData.rostoSuavizado = true;
    const P = g.attributes.position, N = g.attributes.normal; if (!P || !N || P.count < 12) return;
    // ajuste algébrico da esfera: x²+y²+z² = 2ax + 2by + 2cz + d → sistema normal 4×4
    const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], B = [0, 0, 0, 0];
    for (let i = 0; i < P.count; i++){ const x = P.getX(i), y = P.getY(i), z = P.getZ(i), r = [2 * x, 2 * y, 2 * z, 1], f = x * x + y * y + z * z; for (let a = 0; a < 4; a++){ B[a] += r[a] * f; for (let b = 0; b < 4; b++) A[a][b] += r[a] * r[b]; } }
    const sol = resolver4(A, B); if (!sol) return;
    const [cx, cy, cz] = sol;
    let mx = 0, my = 0, mz = 0; for (let i = 0; i < N.count; i++){ mx += N.getX(i); my += N.getY(i); mz += N.getZ(i); }   // pra que lado é "fora": a média das normais antigas
    let s = 0; for (let i = 0; i < P.count; i++) s += (P.getX(i) - cx) * mx + (P.getY(i) - cy) * my + (P.getZ(i) - cz) * mz;
    const sinal = s < 0 ? -1 : 1;
    for (let i = 0; i < P.count; i++){ const x = P.getX(i) - cx, y = P.getY(i) - cy, z = P.getZ(i) - cz, l = Math.hypot(x, y, z) || 1; N.setXYZ(i, sinal * x / l, sinal * y / l, sinal * z / l); }
    N.needsUpdate = true; n++;
  });
  return n;
}
function resolver4(A, B){                                    // eliminação de Gauss com pivô parcial
  const M = A.map((r, i) => [...r, B[i]]);
  for (let c = 0; c < 4; c++){
    let p = c; for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-18) return null; [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 4; r++){ if (r === c) continue; const k = M[r][c] / M[c][c]; for (let j = c; j < 5; j++) M[r][j] -= k * M[c][j]; }
  }
  return M.map((r, i) => r[4] / r[i]);
}

/* ------------------------------------------------------------------ malhas que os clipes apagam */
/** Esconde as malhas que TODO clipe do modelo apaga (17/09, coe no #bugs "Bug Visual?": "batendo asa com asa fechada").
    Alguns Pokémon do dump trazem peças alternativas como malha à parte e ligam/desligam cada uma por um nó vazio
    `CusAnimVis_<malha>`: a posição x dele é a chave (0,01 = aparece, 0 = some). O Pidgeotto tem a ASA DOBRADA assim
    (`pm0017_00_00_LWingSkin`/`RWingSkin`, presas no Spine2) e os 8 clipes dele a apagam; o three.js não conhece a convenção,
    então a asa dobrada ficava colada no corpo enquanto a de verdade batia (seguidor, selvagem, os que sobrevoam a Rota 1,
    Pokédex). A lista sai uma vez por GLB (`g`); `obj` é o clone a esconder. Censo de cenario/mon em 17/09: só o Pidgeotto
    se encaixa (Torchic e Sandslash têm os nós mas a malha é uma só; o Koffing não anima a fumaça e ela fica como está). */
export function apagarMalhasOcultas(g, obj){
  if (!g?.scene || !obj) return 0;
  if (!g.__malhasApagadas){
    g.__malhasApagadas = [];
    g.scene.traverse(o => {
      const m = /^CusAnimVis_(.+)$/.exec(o.name); if (!m) return;
      const trilhas = (g.animations || []).map(c => c.tracks.find(t => t.name === o.name + '.position')).filter(Boolean);
      /* CUBICSPLINE guarda tangente de entrada, valor e tangente de saída: 9 números por chave (o x do valor é o 4º) */
      const acende = t => { const passo = t.values.length / t.times.length, x0 = passo === 9 ? 3 : 0; for (let i = 0; i < t.times.length; i++) if (t.values[i * passo + x0] > 0.005) return true; return false; };
      if (trilhas.length && !trilhas.some(acende)) g.__malhasApagadas.push(m[1]);
    });
  }
  for (const nome of g.__malhasApagadas){ const o = obj.getObjectByName(nome); if (o) o.visible = false; }
  return g.__malhasApagadas.length;
}

/* ------------------------------------------------------------------ a tela */
let aberto = null;                                   // { confirmar, cancelar, promessa } enquanto a tela está na frente
export const estaAberto = () => !!aberto;
/* Guarda de entrada, registrada na carga do módulo (antes dos listeners do index e do menus.mjs, que são registrados
   depois): com a tela aberta, tecla e roda param aqui — Enter confirma, Esc cancela (se puder), digitar no campo do nome
   continua funcionando. Sem isso WASD/P/I/Esc mexiam no jogo e nos menus por trás da tela. */
addEventListener('keydown', e => {
  if (!aberto) return;
  const digitando = e.target?.tagName === 'INPUT';
  if (e.code === 'Escape'){ e.stopImmediatePropagation(); e.preventDefault(); aberto.cancelar(); return; }
  if (e.code === 'Enter' && !e.repeat){ e.stopImmediatePropagation(); e.preventDefault(); aberto.confirmar(); return; }
  if (!digitando) e.stopImmediatePropagation();
}, true);
addEventListener('keyup', e => { if (aberto && e.target?.tagName !== 'INPUT') e.stopImmediatePropagation(); }, true);
addEventListener('wheel', e => { if (aberto) e.stopImmediatePropagation(); }, { capture: true, passive: true });

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CSS = `
#criar{position:fixed;inset:0;z-index:58;display:flex;align-items:center;justify-content:center;background:radial-gradient(1200px 700px at 50% 30%,#1a2440,#06080d 70%);color:var(--text,#d6e2ff);font:12px/1.4 "Segoe UI",Arial,sans-serif}
#criar.sobre-jogo{background:#000a}
#criar .caixa{position:relative;width:min(860px,96vw);max-height:94vh;overflow:auto;padding:16px 18px 14px;border:1px solid #b47622;border-radius:14px;background:var(--panel,#101624f2);box-shadow:0 12px 30px #000c;box-sizing:border-box}
#criar h2{margin:0 0 4px;font-size:20px;color:#ffe07a}
#criar .sub{color:var(--muted,#8c9ab7);font-size:12px;margin-bottom:10px}
#criar .x{position:absolute;right:10px;top:10px;width:30px;height:30px;border:1px solid var(--line,#314361);border-radius:8px;background:#0b1020;color:var(--text,#d6e2ff);font:inherit;cursor:pointer;z-index:3}
#criar .sexos{display:flex;gap:8px;margin-bottom:10px}
#criar .sexos button,#criar .acoes button,#criar .cores button{padding:8px 14px;border:1px solid var(--line,#314361);border-radius:8px;background:#0b1020;color:var(--text,#d6e2ff);font:inherit;cursor:pointer;touch-action:manipulation}
#criar .sexos button.on{border-color:#ffd23a;color:#ffe07a}
#criar .cartas{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
#criar .cartas.c5{grid-template-columns:repeat(5,1fr);gap:8px}
#criar .carta{padding:8px 8px 10px;border:2px solid var(--line,#314361);border-radius:12px;background:#101624;text-align:center;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none;touch-action:pan-y}
#criar .carta.on{border-color:#ffd23a;background:#1b2238}
#criar .carta .palco{position:relative;height:210px;margin:0 auto 6px;border-radius:10px;background:radial-gradient(ellipse at 50% 90%,#25335a 0,#101624 62%)}
#criar .carta.on .palco{background:radial-gradient(ellipse at 50% 90%,#4a3d1a 0,#1b2238 62%)}
#criar .carta .palco::after{content:'…';position:absolute;inset:0;display:grid;place-items:center;color:#8c9ab7;font-size:26px}
#criar .carta .palco.pronto::after{display:none}
#criar .carta b{display:block;font-size:14px}
#criar .carta small{display:block;margin-top:4px;color:var(--muted,#8c9ab7);font-size:11px;min-height:2.6em}
#criar .palco-3d{position:absolute;left:0;top:0;pointer-events:none;z-index:2}
#criar .cores{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px;padding:10px;border:1px solid var(--line,#314361);border-radius:10px;background:#0b1020}
#criar .cores[hidden]{display:none}
#criar .cores .t{width:100%;color:#ffe07a;font-size:12px}
#criar .cor{display:flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid var(--line,#314361);border-radius:8px;background:#101624}
#criar .cor span:first-child{color:var(--muted,#8c9ab7);min-width:44px}
#criar .cor input[type=color]{width:34px;height:26px;border:0;background:none;padding:0;cursor:pointer}
#criar .presets{display:flex;gap:3px}
#criar .presets i{width:16px;height:16px;border-radius:50%;border:1px solid #0008;cursor:pointer;display:inline-block}
#criar .presets i:hover{transform:scale(1.2)}
#criar .nome{display:flex;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap}
#criar .nome input{width:200px;padding:8px 10px;border:1px solid var(--line,#314361);border-radius:8px;background:#0b1020;color:var(--text,#d6e2ff);font:inherit;font-size:14px}
#criar .nome small{color:var(--muted,#8c9ab7)}
#criar .acoes{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
#criar .acoes .ok{border-color:#b47622;background:linear-gradient(#342317,#10131b);color:#ffe6b0;font-weight:700;font-size:14px;padding:10px 26px}
body.tela-estreita #criar .cartas{grid-template-columns:1fr 1fr;gap:8px}
body.tela-estreita #criar .carta .palco{height:150px}
body.tela-estreita #criar .caixa{padding:12px}
body.tela-baixa #criar .caixa{max-height:98vh;padding:10px 12px}
body.tela-baixa #criar .carta .palco{height:130px}
body.tela-baixa #criar h2{font-size:16px}
`;
let cssPronto = false;
function injetarCss(){ if (cssPronto) return; const st = document.createElement('style'); st.id = 'css-criar'; st.textContent = CSS; document.head.appendChild(st); cssPronto = true; }

const cacheGlb = new Map();
/* Mesma coisa da mochila: a promessa que falhou sai do cache pra a próxima tentativa valer (o criador de personagem fica em pé
   quando o modelo volta 403 numa janela sem cookie). */
const carregarGlb = glb => { if (!cacheGlb.has(glb)) cacheGlb.set(glb, new GLTFLoader().loadAsync('./cenario/pc/' + glb + '.glb').catch(e => { cacheGlb.delete(glb); throw e; })); return cacheGlb.get(glb); };

/** Mede o modelo na pose ANIMADA (Idle em 4 instantes; apoia pelo ponto mais baixo) — a caixa de bind pose do rig do
    treinador é bem maior que a malha, e medir errado deixa o boneco flutuando ou cortado. */
function medir(obj, mixer, idle){
  const acao = idle ? mixer.clipAction(idle) : null; if (acao) acao.play();
  let minY = Infinity, centro = null, tam = null; const dur = idle?.duration || 1;
  for (const k of [0, 0.25, 0.5, 0.75]){
    if (acao) mixer.setTime(k * dur); obj.updateMatrixWorld(true);
    const bx = new THREE.Box3().setFromObject(obj, true);
    if (!centro){ centro = bx.getCenter(new THREE.Vector3()); tam = bx.getSize(new THREE.Vector3()); }
    minY = Math.min(minY, bx.min.y);
  }
  if (acao){ mixer.setTime(0); acao.stop(); }
  return { centro, tam, minY };
}

/** Palco 3D: UM renderizador (canvas por cima da caixa, sem receber cliques) desenha cada treinador dentro do .palco
    da sua carta — viewport + scissor no retângulo do elemento, medido a cada quadro (serve pra grade do PC e pra lista
    do celular). Cada carta tem o seu clone com materiais próprios (a tinta troca o `map`, e o GLB em cache fica cru). */
/* EXPORTADO desde 09/09: as telas do Figma (telas_personagem.mjs) desenham os modelos nas caixas `img/personagem
   [do-jogo]` com este mesmo palco — um canvas WebGL só, com scissor por caixa. `P.usar(outraCaixa)` muda de tela sem
   recarregar os GLBs (o cache vive aqui dentro e some no `P.fechar`). */
export function criarPalco(caixa, coresDeTinta){
  const canvas = document.createElement('canvas'); canvas.className = 'palco-3d';
  /* No celular o palco pesa: sem antialias e a 1× de pixel ratio. Com antialias e 1,5× ele abria um framebuffer grande
     DEMAIS e a aba caía (10/09). No PC segue como era.
     ESCALA REVISTA (20/09, Jaime no iPhone 16 Pro Max: "pra escolher char parece serrilhado"): a 1× num aparelho de
     3× o modelo aparecia com um terço da resolução da tela — escadinha em todo contorno. Quem estourava a memória
     era o ANTIALIAS (multiplica o framebuffer), não a escala: ele continua desligado no toque, e a escala sobe até
     2× respeitando um TETO DE PIXELS. Celular deitado (844×390) dá 2× = 1,3 milhão de pixels, uns 10 MB com
     profundidade; numa tela maior a raiz do teto segura sozinha, sem caso especial por aparelho. */
  const toque = (() => { try { return matchMedia('(pointer: coarse)').matches || innerWidth < 900; } catch { return false; } })();
  const TETO_PX_PALCO = 2.6e6;
  const razaoPalco = toque
    ? Math.max(1, Math.min(devicePixelRatio || 1, 2, Math.sqrt(TETO_PX_PALCO / Math.max(1, innerWidth * innerHeight))))
    : Math.min(devicePixelRatio || 1, 1.5);
  const ren = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !toque });
  ren.setPixelRatio(razaoPalco); ren.outputColorSpace = THREE.SRGBColorSpace; ren.autoClear = false; ren.setClearColor(0x000000, 0);
  const cena = new THREE.Scene();
  cena.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2418, 1.1));
  const sol = new THREE.DirectionalLight(0xffffff, 1.6); sol.position.set(2, 4, 3); cena.add(sol);
  const anel = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.29, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.2 })); cena.add(anel);
  const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 50); cam.position.set(0, 0.62, 3.1); cam.lookAt(0, 0.5, 0);
  const P = { canvas, ren, cena, cam, itens: new Map(), ativo: true, sel: null, w: 0, h: 0, t0: 0 };
  P.montar = async s => {
    if (P.itens.has(s.id)) return P.itens.get(s.id);
    const it = { id: s.id, skin: s, pronto: false, grupo: null, obj: null, mixer: null, idle: null, clipe: null, giro: 0, arrasto: null, umaVez: null, pintando: null, pendente: null };
    P.itens.set(s.id, it);
    const g = await carregarGlb(s.glb);
    if (!P.ativo) return it;                                                   // fechou enquanto carregava
    suavizarRosto(g.scene);                                                   // normais da placa do rosto (geometria compartilhada com os clones)
    const obj = SkeletonUtils.clone(g.scene);
    obj.traverse(n => { if (n.isMesh){ n.frustumCulled = false; n.material = Array.isArray(n.material) ? n.material.map(m => m.clone()) : n.material.clone(); } });
    await Tinta.aplicarTinta(obj);                                            // cores de fábrica (data/npc_tintas.json)
    if (s.tinta) await Tinta.pintar(obj, receita(s.tinta, coresDeTinta(s.tinta)));
    if (!P.ativo) return it;
    const mixer = new THREE.AnimationMixer(obj);
    const clipe = n => g.animations.find(c => c.name === n);
    const { centro, tam, minY } = medir(obj, mixer, clipe('Idle') || g.animations[0]);
    const idleClipe = clipe('Idle') || g.animations[0];
    const idle = idleClipe ? mixer.clipAction(idleClipe) : null; if (idle) idle.reset().play();
    const escala = 1 / Math.max(tam.y, tam.x * 0.9, tam.z * 0.9, 1e-3);          // cabe num cubo de 1 m, pé em y = 0
    const grupo = new THREE.Group(); obj.position.set(-centro.x, -minY, -centro.z); grupo.add(obj); grupo.scale.setScalar(escala); grupo.visible = false;
    mixer.addEventListener('finished', ev => { if (ev.action === it.umaVez && it.idle){ it.umaVez = null; it.idle.reset().fadeIn(0.12).play(); } });   // reação acabou: volta pro Idle
    Object.assign(it, { obj, grupo, mixer, idle, clipe, pronto: true });
    cena.add(grupo);
    caixa.querySelectorAll(`.palco[data-id="${s.id}"]`).forEach(el => el.classList.add('pronto'));
    return it;
  };
  /** Carta escolhida: o treinador olha em volta (clipe Idling) e passa a girar. */
  P.selecionar = id => {
    P.sel = id; const it = P.itens.get(id); if (!it?.pronto) return;
    it.giro = it.grupo.rotation.y;
    const c = it.clipe('Idling') || it.clipe('Idling1'); if (!c || !it.idle) return;
    const a = it.mixer.clipAction(c); a.reset().setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; a.fadeIn(0.1).play(); it.idle.fadeOut(0.1); it.umaVez = a;
  };
  /** Repinta o clone da carta com cores novas; mudanças em rajada (arrastar o seletor de cor) esperam a pintura anterior. */
  P.repintar = (id, tinta, cores) => {
    const it = P.itens.get(id); if (!it?.pronto) return;
    if (it.pintando){ it.pendente = { ...cores }; return; }
    it.pintando = Tinta.pintar(it.obj, receita(tinta, cores)).catch(e => console.warn('tinta:', e)).finally(() => {
      it.pintando = null;
      if (it.pendente){ const c = it.pendente; it.pendente = null; P.repintar(id, tinta, c); }
    });
  };
  P.quadro = () => {
    if (!P.ativo) return;
    requestAnimationFrame(P.quadro);
    if (!canvas.isConnected) return;
    const t = performance.now() / 1000, dt = Math.min(0.05, t - (P.t0 || t)); P.t0 = t;
    const ultimo = canvas.previousElementSibling || caixa.lastElementChild;   // altura do conteúdo sem o próprio canvas (senão nunca encolhe)
    const W = caixa.clientWidth, H = Math.max(caixa.clientHeight, ultimo ? ultimo.offsetTop + ultimo.offsetHeight + 14 : 0);
    if (P.w !== W || P.h !== H){ ren.setSize(W, H, false); canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; P.w = W; P.h = H; }
    ren.setScissorTest(false); ren.clear(); ren.setScissorTest(true);
    const rc = canvas.getBoundingClientRect();
    for (const it of P.itens.values()){
      if (!it.pronto) continue;
      const el = caixa.querySelector(`.palco[data-id="${it.id}"]`); if (!el) continue;   // aba escondida: nem anima
      const r = el.getBoundingClientRect(); if (r.width < 8 || r.height < 8) continue;
      it.mixer.update(dt);
      const on = it.id === P.sel;
      if (on && it.arrasto == null) it.giro += dt * 0.6;
      it.grupo.rotation.y = on ? it.giro : Math.sin(t * 0.6 + it.id.length) * 0.3;
      for (const k of P.itens.values()) if (k.grupo) k.grupo.visible = k === it;
      anel.material.opacity = on ? 0.5 : 0.15;
      /* A tela do Figma vem ESCALADA (`transform: scale`), e o rect é em px de TELA enquanto o viewport do WebGL é em px
         do canvas. Sem dividir pela escala, o modelo saía da carta (rodada 23). Sem transform, k = 1 e nada muda. */
      const k = (rc.width && P.w) ? (rc.width / P.w) : 1;
      const x = (r.left - rc.left) / k, y = (rc.bottom - r.bottom) / k;         // viewport: origem embaixo à esquerda, em px CSS
      const w2 = r.width / k, h2 = r.height / k;
      ren.setViewport(x, y, w2, h2); ren.setScissor(x, y, w2, h2);
      cam.aspect = w2 / h2; cam.updateProjectionMatrix();
      ren.render(cena, cam);
    }
  };
  /** Arrastar na carta escolhida gira o treinador (pan-y no CSS deixa a rolagem vertical do celular viva). */
  P.arrastavel = (el, id) => {
    let x0 = 0;
    el.addEventListener('pointerdown', ev => { const it = P.itens.get(id); if (!it || P.sel !== id) return; it.arrasto = ev.pointerId; x0 = ev.clientX; try { el.setPointerCapture(ev.pointerId); } catch {} });
    el.addEventListener('pointermove', ev => { const it = P.itens.get(id); if (!it || it.arrasto !== ev.pointerId) return; it.giro += (ev.clientX - x0) * 0.012; x0 = ev.clientX; });
    const solta = ev => { const it = P.itens.get(id); if (it && it.arrasto === ev.pointerId) it.arrasto = null; };
    el.addEventListener('pointerup', solta); el.addEventListener('pointercancel', solta);
  };
  P.usar = nova => { if (!nova || nova === caixa) return P; caixa = nova; nova.appendChild(canvas); return P; };   // trocou de tela: o canvas vai junto
  /** Solta UM modelo (a aba que saiu): sem isto, trocar Menino/Menina deixava os 5 anteriores vivos — dez rigs e ~95 MB
      de textura na tela que já é o pico de memória no celular (10/09). */
  P.descartar = id => {
    const it = P.itens.get(id); if (!it) return false;
    it.mixer?.stopAllAction?.();
    it.grupo?.traverse(o => {
      if (!o.isMesh) return;
      o.geometry?.dispose();
      for (const m of [].concat(o.material || [])){
        for (const k of ['map', 'normalMap', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'alphaMap']) m?.[k]?.dispose?.();
        m?.dispose?.();
      }
    });
    if (it.grupo) cena.remove(it.grupo);
    P.itens.delete(id);
    if (P.sel === id) P.sel = null;
    return true;
  };
  /* Fechar de verdade: sem descartar geometria, material e textura, tudo ficava alocado até o contexto morrer — e no
     celular o contexto do palco convive com o do jogo (10/09). */
  P.fechar = () => {
    P.ativo = false;
    for (const it of P.itens.values()){
      it.grupo?.traverse(o => {
        if (!o.isMesh) return;
        o.geometry?.dispose();
        for (const m of [].concat(o.material || [])){
          for (const k of ['map', 'normalMap', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'alphaMap']) m?.[k]?.dispose?.();
          m?.dispose?.();
        }
      });
      if (it.grupo) cena.remove(it.grupo);
      it.mixer?.stopAllAction?.();
    }
    P.itens.clear(); anel.geometry.dispose(); anel.material.dispose();
    ren.dispose(); canvas.remove(); cacheGlb.clear();
  };
  requestAnimationFrame(P.quadro);
  return P;
}

/** Abre a tela. Devolve { tipo, cores, nome } quando o jogador confirma (já salvo em localStorage) ou null se cancelar
    (só com `cancelavel`). `sobreJogo` = fundo translúcido (reaberta em cima do jogo). */
/* NOME PADRÃO (08/09): era o da ROUPA — quem não digitasse nada virava "Coração de Ouro", e o nome do treinador tem de ser
   Único. Agora o padrão é o USUÁRIO da conta (que já é único); sem conta, segue o nome da roupa. */
const contaUsuario = () => { try { return String(localStorage.getItem('conta.usuario') || '').trim(); } catch { return ''; } };   // esta é de sessão, não de jogo: fica no aparelho mesmo
export function abrir({ som = null, cancelavel = false, sobreJogo = false, reservarNome = null } = {}){
  if (aberto) return aberto.promessa;
  injetarCss();
  const salvo = ler(); let skin = skinDe(salvo), sexo = skin.sexo;
  const coresPor = {}; for (const t of Object.keys(PADRAO)) coresPor[t] = coresDe(t, salvo);
  const nomeSalvo = String(lerLS('nome', '') || '');
  const root = document.createElement('div'); root.id = 'criar'; if (sobreJogo) root.classList.add('sobre-jogo');
  root.innerHTML = `<div class="caixa">${cancelavel ? '<button type="button" class="x" aria-label="fechar">✕</button>' : ''}<h2>Seu treinador</h2>
    <div class="sub">escolha quem você é e o seu nome${cancelavel ? '' : ' — dá pra mudar depois em Configurações → ✎ Personagem'}</div>
    <div class="sexos"><button type="button" data-sexo="menino">Menino</button><button type="button" data-sexo="menina">Menina</button></div>
    <div class="cartas"></div>
    <div class="cores" hidden></div>
    <div class="nome"><label>nome <input type="text" maxlength="16" autocomplete="off" spellcheck="false" value="${esc(nomeSalvo)}"></label><small class="aviso-nome">aparece em cima da cabeça e no chat · 3 a 16 letras · não pode repetir o de outro treinador</small></div>
    <div class="acoes">${cancelavel ? '<button type="button" class="cancela">Cancelar</button>' : ''}<button type="button" class="ok">${cancelavel ? 'Salvar' : 'Começar ▶'}</button></div></div>`;
  document.body.appendChild(root);
  const caixa = root.querySelector('.caixa'), cartasEl = root.querySelector('.cartas'), coresEl = root.querySelector('.cores'), input = root.querySelector('.nome input');
  const P = criarPalco(caixa, t => coresPor[t]); caixa.appendChild(P.canvas);
  // as "media queries" do jogo (index/hud.css) são classes no body; na primeira vez a tela abre antes de o jogo as pôr
  const telas = () => { document.body.classList.toggle('tela-estreita', innerWidth <= 480); document.body.classList.toggle('tela-baixa', innerHeight <= 480); };
  telas(); addEventListener('resize', telas);
  const clique = () => som?.tocar?.('ui/sound_click', { volume: 0.5 });

  const pintarCores = () => {
    const tinta = skin.tinta;
    if (!tinta){ coresEl.hidden = true; coresEl.innerHTML = ''; return; }
    const cores = coresPor[tinta], chaves = Object.keys(ROTULOS[tinta]);
    coresEl.hidden = false;
    coresEl.innerHTML = `<div class="t">✎ cores — ${esc(skin.nome)}</div>` + chaves.map(k => `<label class="cor"><span>${esc(ROTULOS[tinta][k])}</span><input type="color" data-k="${k}" value="${cores[k]}"><span class="presets">${(PRESETS[k] || []).map(h => `<i data-k="${k}" data-h="${h}" style="background:${h}"></i>`).join('')}</span></label>`).join('')
      + '<button type="button" class="aleatorio">🎲 aleatório</button><button type="button" class="padrao">padrão do jogo</button>';
    const aplicar = () => { coresEl.querySelectorAll('input[type=color]').forEach(i => cores[i.dataset.k] = i.value); P.repintar(skin.id, tinta, cores); };
    coresEl.querySelectorAll('input[type=color]').forEach(i => i.oninput = aplicar);
    coresEl.querySelectorAll('.presets i').forEach(p => p.onclick = () => { coresEl.querySelector(`input[data-k="${p.dataset.k}"]`).value = p.dataset.h; aplicar(); clique(); });
    coresEl.querySelector('.aleatorio').onclick = () => { for (const k of chaves){ const l = PRESETS[k] || []; if (l.length) coresEl.querySelector(`input[data-k="${k}"]`).value = l[Math.floor(Math.random() * l.length)]; } aplicar(); clique(); };
    coresEl.querySelector('.padrao').onclick = () => { for (const k of chaves) coresEl.querySelector(`input[data-k="${k}"]`).value = PADRAO[tinta][k]; aplicar(); clique(); };
  };
  const selecionar = (id, tocar = true) => {
    const s = skinPorId(id); if (!s) return;
    skin = s; input.placeholder = contaUsuario() || s.nome;
    cartasEl.querySelectorAll('.carta').forEach(c => c.classList.toggle('on', c.dataset.id === id));
    P.selecionar(id); pintarCores(); if (tocar) clique();
  };
  const pintarCartas = () => {
    const lista = skinsDaCriacao(sexo);                                  // painel: quem aparece na criação
    root.querySelectorAll('.sexos button').forEach(b => b.classList.toggle('on', b.dataset.sexo === sexo));
    cartasEl.classList.toggle('c5', lista.length >= 5);
    cartasEl.innerHTML = lista.map(s => `<div class="carta ${s.id === skin.id ? 'on' : ''}" data-id="${s.id}"><div class="palco ${P.itens.get(s.id)?.pronto ? 'pronto' : ''}" data-id="${s.id}"></div><b>${esc(s.nome)}</b><small>${esc(s.desc)}</small></div>`).join('');
    cartasEl.querySelectorAll('.carta').forEach(c => { c.onclick = () => { if (skin.id !== c.dataset.id) selecionar(c.dataset.id); }; P.arrastavel(c, c.dataset.id); });
    for (const s of lista) P.montar(s).catch(e => console.warn('personagem:', s.glb, e));
  };
  root.querySelectorAll('.sexos button').forEach(b => b.onclick = () => {
    if (sexo === b.dataset.sexo) return;
    sexo = b.dataset.sexo; skin = skinsDaCriacao(sexo)[0];                  // primeira carta da aba (Ash / Misty)
    pintarCartas(); selecionar(skin.id);
  });
  root.addEventListener('pointerdown', () => som?.destravar?.(), { once: true });   // o clique libera o áudio do navegador

  let fechado = false;
  const fechar = () => { if (fechado) return; fechado = true; removeEventListener('resize', telas); P.fechar(); root.remove(); aberto = null; };
  let resolver = null;
  const promessa = new Promise(res => { resolver = res; });
  let ocupado = false;
  const avisoNome = root.querySelector('.aviso-nome'), dizerNome = t => { if (avisoNome) avisoNome.textContent = t; };
  const confirmar = async () => {
    if (fechado || ocupado) return;
    const nome = (input.value.trim() || contaUsuario() || skin.nome).slice(0, 16);
    if (reservarNome){                                                    // nome único: o servidor confere ANTES de a tela fechar
      ocupado = true; dizerNome('conferindo o nome…');
      let r = null; try { r = await reservarNome(nome); } catch (e){ r = { ok: false, erro: String(e?.message || e) }; }
      ocupado = false;
      if (!r?.ok){ dizerNome(r?.erro || 'Esse nome não deu. Tente outro.'); input.focus(); input.select(); return; }
      input.value = r.nome || nome;
    }
    if (fechado) return;
    const p = { tipo: skin.id }; if (skin.tinta) p.cores = { ...coresPor[skin.tinta] };
    gravar(p); gravarLS('nome', (input.value.trim() || nome).slice(0, 16));
    try { const u = new URL(location.href); if (u.searchParams.has('personagem')){ u.searchParams.delete('personagem'); history.replaceState(null, '', u); } } catch {}   // senão recarregar/atravessar porta reabre a tela
    som?.destravar?.(); clique();
    const nomeFim = (input.value.trim() || nome).slice(0, 16);
    fechar(); resolver({ ...p, nome: nomeFim });
  };
  const cancelar = () => { if (!cancelavel || fechado) return; fechar(); resolver(null); };
  aberto = { confirmar, cancelar, promessa };
  root.querySelector('.ok').onclick = confirmar;
  root.querySelector('.x')?.addEventListener('click', cancelar);
  root.querySelector('.cancela')?.addEventListener('click', cancelar);
  pintarCartas(); selecionar(skin.id, false); input.placeholder = contaUsuario() || skin.nome;
  return promessa;
}
