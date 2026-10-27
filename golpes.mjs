/**
 * Os golpes com efeito 3D reconstruído — a mesma tabela para o jogo
 * (index.html) e para a bancada de golpes.
 *
 * Poder/tipo/categoria da série. Fases do efeito: `inicio` (Start no
 * atacante), `voo` (Fly: projétil que viaja até o alvo), `ataque` (Atk no
 * atacante na hora do acerto) e sempre o Hit no alvo. `contato` = corpo a corpo
 * com investida. Recarga ∝ poder. `efeito` é o id oficial do golpe, que é como o
 * jogo de origem nomeia o prefab (00084_Hit…).
 */
import { TODOS } from './golpes_todos.mjs';   // os 194 gerados (tools/golpes.mjs)
// Os 16 afinados à mão — ganham dos gerados quando o id coincide.
const MANUAIS = {
  // Normal
  tackle:       { id: 'tackle',       nome: 'Tackle',        tipo: 'Normal',   poder: 40,  cat: 'fisico',   alcance: 1.3, recarga: 1.6, efeito: '00033', som: 'Take Down', anim: 'Attack', atraso: 0.12, contato: true },
  quickattack:  { id: 'quickattack',  nome: 'Quick Attack',  tipo: 'Normal',   poder: 40,  cat: 'fisico',   alcance: 1.3, recarga: 2.4, efeito: '00098', som: 'punch5',   anim: 'Attack', atraso: 0.12, contato: true },
  // Voador / Planta
  gust:         { id: 'gust',         nome: 'Gust',          tipo: 'Flying',   poder: 40,  cat: 'especial', alcance: 6,   recarga: 1.6, efeito: '00016', som: 'gust',     anim: 'Cast',   atraso: 0.3 },
  vinewhip:     { id: 'vinewhip',     nome: 'Vine Whip',     tipo: 'Grass',    poder: 45,  cat: 'fisico',   alcance: 2.4, recarga: 1.8, efeito: '00022', som: 'slash2',   anim: 'Attack', atraso: 0.2 },
  solarbeam:    { id: 'solarbeam',    nome: 'Solar Beam',    tipo: 'Grass',    poder: 120, cat: 'especial', alcance: 8,   recarga: 5.0, efeito: '00076', som: 'flash2',   anim: 'Cast',   atraso: 0.9, inicio: true, ataque: true },
  // Fogo
  ember:        { id: 'ember',        nome: 'Ember',         tipo: 'Fire',     poder: 40,  cat: 'especial', alcance: 6,   recarga: 1.6, efeito: '00052', som: 'Fire',     anim: 'Cast',   atraso: 0.25, inicio: true, voo: true },
  flamethrower: { id: 'flamethrower', nome: 'Flamethrower',  tipo: 'Fire',     poder: 90,  cat: 'especial', alcance: 7,   recarga: 3.5, efeito: '00053', som: 'Fire2',    anim: 'Cast',   atraso: 0.3,  inicio: true, voo: true },
  fireblast:    { id: 'fireblast',    nome: 'Fire Blast',    tipo: 'Fire',     poder: 110, cat: 'especial', alcance: 7,   recarga: 4.5, efeito: '00126', som: 'Fire3',    anim: 'Cast',   atraso: 0.45, inicio: true, voo: true },
  // Água
  watergun:     { id: 'watergun',     nome: 'Water Gun',     tipo: 'Water',    poder: 40,  cat: 'especial', alcance: 6,   recarga: 1.6, efeito: '00055', som: 'Water1',   anim: 'Cast',   atraso: 0.3,  inicio: true },
  hydropump:    { id: 'hydropump',    nome: 'Hydro Pump',    tipo: 'Water',    poder: 110, cat: 'especial', alcance: 7,   recarga: 4.5, efeito: '00056', som: 'Water3',   anim: 'Cast',   atraso: 0.45, inicio: true },
  // Elétrico
  thundershock: { id: 'thundershock', nome: 'Thunder Shock', tipo: 'Electric', poder: 40,  cat: 'especial', alcance: 6,   recarga: 1.6, efeito: '00084', som: 'Thunder1', anim: 'Cast',   atraso: 0.28 },
  thunderbolt:  { id: 'thunderbolt',  nome: 'Thunderbolt',   tipo: 'Electric', poder: 90,  cat: 'especial', alcance: 7,   recarga: 3.5, efeito: '00085', som: 'Thunder3', anim: 'Cast',   atraso: 0.45, inicio: true },
  // Pedra / Terra
  rockthrow:    { id: 'rockthrow',    nome: 'Rock Throw',    tipo: 'Rock',     poder: 50,  cat: 'fisico',   alcance: 5,   recarga: 1.8, efeito: '00088', som: 'Earth3',   anim: 'Attack', atraso: 0.35 },
  earthquake:   { id: 'earthquake',   nome: 'Earthquake',    tipo: 'Ground',   poder: 100, cat: 'fisico',   alcance: 5,   recarga: 4.5, efeito: '00089', som: 'Earth1',   anim: 'Attack', atraso: 0.5,  inicio: true },
  // Psíquico / Fantasma
  psychic:      { id: 'psychic',      nome: 'Psychic',       tipo: 'Psychic',  poder: 90,  cat: 'especial', alcance: 7,   recarga: 3.5, efeito: '00094', som: 'saint1',   anim: 'Cast',   atraso: 0.4,  inicio: true },
  lick:         { id: 'lick',         nome: 'Lick',          tipo: 'Ghost',    poder: 30,  cat: 'fisico',   alcance: 1.3, recarga: 1.4, efeito: '00122', som: 'darkness2', anim: 'Attack', atraso: 0.15, contato: true },
};
/* Fase 2 do painel: a tabela que vale é a do data/golpes.json (admin → Golpes), gerada destas duas (TODOS + MANUAIS, com o PP do
   learnset.json) — com o arquivo, ele é a fonte e os MANUAIS já estão dentro dele. Sem o arquivo vale a mistura de sempre. */
const DO_ARQUIVO = await fetch('./data/golpes.json').then(r => r.ok ? r.json() : null).catch(() => null);
export const GOLPES = DO_ARQUIVO && typeof DO_ARQUIVO === 'object' && Object.keys(DO_ARQUIVO).length
  ? Object.fromEntries(Object.entries(DO_ARQUIVO).map(([k, g]) => [k, { ...g, id: k }]))   // golpe novo do painel não traz o id dentro
  : { ...TODOS, ...Object.fromEntries(Object.entries(MANUAIS).map(([k, v]) => [k, { ...TODOS[k], ...v, acerto: true }])) };
export const POR_EFEITO = new Map(Object.values(GOLPES).map(g => [g.efeito, g]));
export const GOLPES_PIKA = ['thundershock', 'thunderbolt'];      // teclas 1 e 2
// o que cada espécie selvagem usa (por dex); quem não está aqui usa Tackle
export const GOLPES_ESPECIE = {
  19: ['tackle', 'quickattack'], 16: ['gust', 'tackle'], 17: ['gust', 'quickattack'], 25: ['thundershock', 'quickattack'], 1: ['tackle', 'vinewhip'], 4: ['ember'], 7: ['watergun'], 27: ['scratch', 'swift'], 54: ['watergun', 'scratch'], 74: ['tackle', 'rockthrow'], 94: ['lick'], 403: ['tackle', 'bite'], 447: ['quickattack', 'swift'],
  // lendários (seguidor ou chefão)
  144: ['gust', 'blizzard'], 145: ['thunderbolt', 'gust'], 146: ['fireblast', 'gust'], 150: ['psychic', 'hyperbeam'],
  243: ['thunderbolt', 'quickattack'], 244: ['flamethrower', 'fireblast'], 245: ['hydropump', 'watergun'], 249: ['hydropump', 'gust'], 250: ['fireblast', 'gust'],
  382: ['hydropump', 'watergun'], 383: ['earthquake', 'fireblast'], 384: ['hyperbeam', 'gust'], 483: ['hyperbeam', 'flamethrower'], 484: ['hydropump', 'hyperbeam'], 487: ['psychic', 'hyperbeam'], 493: ['hyperbeam', 'psychic'], 130: ['hydropump', 'tackle'], 6: ['flamethrower', 'fireblast'],
};
export const VEL_PROJETIL = 14;                                  // m/s das fases Fly

/** Atraso total até o golpe acertar: a animação mais o voo do projétil, se houver. */
export const atrasoDoGolpe = (golpe, d) => golpe.atraso + (golpe.voo ? Math.max(0.2, d / VEL_PROJETIL) : 0);

// Ajustes por efeito, vistos na bancada: o Solar Beam foi autorado para encher a
// tela da batalha por turno (raio natural 71 m) e as "cargas" de Solar Beam /
// Fire Blast são domos maiores que o bicho.
export const AJUSTE_EFEITO = {
  '00076_Hit': 0.25, '00076_Start': 0.5, '00126_Start': 0.5, '00056_Hit': 0.8,
  // feixes e ondas que enchem a tela na bancada (Surf, Psybeam, Bubble Beam, Aurora Beam, Hyper Beam, Double-Edge, Take Down)
  '00057_Start': 0.5, '00057_Hit': 0.5, '00060_Hit': 0.5, '00061_Hit': 0.5, '00062_Hit': 0.3, '00063_Hit': 0.5, '00038_Hit': 0.3, '00036_Start': 0.6,
  '00044_Hit': 0.4,                                   // Bite: a mandíbula cobre a tela de perto
};

/**
 * Conserta a descrição carregada por Part.carregar (é cacheada, então vale
 * aplicar quantas vezes for): malha de fogo/fluxo com mistura Alpha sai como
 * mancha marrom (Flamethrower, Fire Blast, Hydro Pump); no jogo esse material é
 * aditivo.
 */
export function corrigirEfeito(desc){
  if (!desc?.sistemas) return desc;
  // Malha de partícula em mistura Alpha sem cor de tinta: são feixes, anéis e
  // fluxos (flow, guangzhu, noise, Boss_T_Fx…) — todos os 104 do acervo saem
  // como mancha marrom em alfa; aditivo é como o jogo os mostra.
  for (const s of desc.sistemas) if (s.mistura === 'Alpha' && s.modo === 'Mesh' && !s.tinta) s.mistura = 'Additive';
  // Malha aditiva SEM textura: no jogo é um plano de brilho com cor do shader;
  // aqui vira um plano opaco "de matéria" (Hyper Beam saía com uma barra marrom).
  desc.sistemas = desc.sistemas.filter(s => !(s.modo === 'Mesh' && !s.textura && s.mistura === 'Additive'));
  // "guangzhu" (光柱, pilar de luz): o plano do feixe de Bubble Beam / Aurora Beam
  // enche a tela como um quadrado; encolhido lê como feixe.
  for (const s of desc.sistemas) if (s.modo === 'Mesh' && /guangzhu/i.test(s.textura || '') && !s._encolhido){
    s._encolhido = true;
    const k = 0.3, esc = c => Array.isArray(c) ? c.map(v => v * k) : c && typeof c === 'object' ? { a: esc(c.a), b: esc(c.b) } : c;
    s.tamanho = esc(s.tamanho); if (s.tamanho3D) s.tamanho3D = s.tamanho3D.map(esc);
  }
  return desc;
}

/**
 * Fator de escala de um efeito: o ajuste manual, senão uma regra pelo raio
 * natural — efeitos autorados para encher a arena de turno (raio > 20 m, como
 * Double-Edge e Solar Beam com 71 m) encolhem para caber num bicho.
 */
export function ajusteEfeito(nome, raio){
  if (AJUSTE_EFEITO[nome] != null) return AJUSTE_EFEITO[nome];
  return raio > 20 ? Math.max(0.2, 20 / raio) : 1;
}
