/**
 * Regras puras: números, sem DOM e sem render.
 *
 * Ficam separadas porque valem igual no cliente 2D e no 3D — e porque são a
 * parte que dá para conferir contra a série principal sem abrir o jogo.
 */

/* ------------------------------------------------------------ atributos */
// Fórmulas da série principal com IV/EV zerados e natureza neutra. O ×3 no HP
// não é canônico: é folga para o combate em tempo real, que troca muito mais
// golpes por minuto que o combate por turnos.
export const hpAt   = (base, lv) => (Math.floor(0.02 * base * lv) + lv + 10) * 3;
export const statAt = (base, lv) => Math.floor(0.02 * base * lv) + 5;
export const expPara = lv => Math.floor(14 * Math.pow(lv, 1.45));

/* ------------------------------------------------------------- combate */
export function efetividade(chart, tipo, defTipos){
  let m = 1;
  for (const d of defTipos) m *= chart[tipo]?.[d] ?? 1;
  return m;
}

/** Um golpe. O "movimento" é implícito: potência fixa 32 no tipo primário do
 *  atacante, físico ou especial conforme o stat maior. Sem lista de ataques,
 *  o tipo do bicho já dá a variedade — e o gráfico de tipos continua mandando. */
export function golpe(db, atk, def){
  const A = db.porNome.get(atk.name), D = db.porNome.get(def.name);
  const fisico = A.bs[1] >= A.bs[3];
  const a = statAt(fisico ? A.bs[1] : A.bs[3], atk.lv);
  const d = statAt(fisico ? D.bs[2] : D.bs[4], def.lv);
  const eff = efetividade(db.chart, A.types[0], D.types);
  const base = Math.floor(((2 * atk.lv / 5 + 2) * 32 * a / d) / 50 + 2);
  // imunidade é zero de verdade: o piso de 1 valeria para Electric contra Ground
  // e apagaria a única regra do gráfico de tipos que muda a decisão do jogador.
  const dano = eff === 0 ? 0
             : Math.max(1, Math.floor(base * 1.5 * eff * (0.85 + Math.random() * 0.15)));
  return { dano, eff };
}

/* ------------------------------------------------------------- captura */
/** Fórmula de captura da 3ª geração em diante. `rate` vem da PokéAPI. */
export function chanceCaptura(db, alvo, mult){
  const S = db.porNome.get(alvo.name);
  const a = ((3 * alvo.maxHp - 2 * alvo.hp) * S.rate * mult) / (3 * alvo.maxHp);
  if (a >= 255) return 1;
  return Math.pow((1048560 / Math.sqrt(Math.sqrt(16711680 / a))) / 65536, 4);
}

export const BALLS = [
  { id: 'poke',  nome: 'Poké Ball',  mult: 1,   preco: 200 },
  { id: 'great', nome: 'Great Ball', mult: 1.5, preco: 600 },
  { id: 'ultra', nome: 'Ultra Ball', mult: 2,   preco: 1200 },
];

/* -------------------------------------------------------------- perfil */
/** Como o Tibia divide os bichos: quem encosta e quem atira. O critério sai
 *  dos stats — ataque especial bem acima do físico, é atirador. */
export const perfil = (db, name) => {
  const S = db.porNome.get(name);
  return S.bs[3] > S.bs[1] + 8 ? 'atirador' : 'corpo';
};
export const ALCANCE = { corpo: 1.5, atirador: 4.2 };

/* --------------------------------------------------------------- cores */
export const COR_TIPO = {
  Normal:'#a8a878', Fire:'#f0802f', Water:'#6890f0', Electric:'#f8d030',
  Grass:'#78c850', Ice:'#98d8d8', Fighting:'#c03028', Poison:'#a040a0',
  Ground:'#e0c068', Flying:'#a890f0', Psychic:'#f85888', Bug:'#a8b820',
  Rock:'#b8a038', Ghost:'#705898', Dragon:'#7038f8', Dark:'#705848',
  Steel:'#b8b8d0', Fairy:'#ee99ac',
};

/* ----------------------------------------------------------------- som */
/** Um som por tipo, escolhido do próprio acervo do jogo. O combate aqui não tem
 *  lista de golpes — o tipo primário do atacante é o "golpe" —, então o tipo é
 *  exatamente a chave certa para o áudio também. */
export const SOM_TIPO = {
  Normal:'punch5',    Fire:'Fire2',      Water:'Water1',   Electric:'Thunder1',
  Grass:'pollen',     Ice:'Ice2',        Fighting:'punch5', Poison:'poison',
  Ground:'Earth1',    Flying:'Wind1',    Psychic:'saint1',  Bug:'bug',
  Rock:'Earth3',      Ghost:'darkness2', Dragon:'Blow5',    Dark:'darkness6',
  Steel:'metal',      Fairy:'sparkle',
};

/** O segundo som, o do resultado: é ele que ensina o gráfico de tipos de ouvido. */
export const somDaEficacia = eff =>
  eff === 0 ? null : eff > 1 ? 'superdamage' : eff < 1 ? 'decrease' : 'normaldamage';

/** Índice por nome, feito uma vez. */
export function indexar(db){
  db.porNome = new Map(db.species.map(s => [s.name, s]));
  return db;
}
