/* Evolução e XP como nos JOGOS ORIGINAIS (index.html + menus.mjs).
 *
 * Regras: data/evolucoes.json (tools/evolucoes.mjs ← PokéAPI): por espécie, uma lista de { para, nome, gatilho, texto, … }
 *   gatilho 'nivel' — Lv mínimo e/ou amizade alta (≥ 160), horário (dia/noite), item segurado, golpe conhecido / golpe de
 *                     um tipo, companheiro (ou tipo) no time, Atk×Def (Tyrogue); 'muda' = Shedinja (junto do Ninjask);
 *           'item'  — usar uma pedra (consome); 'troca' — troca, que aqui vira usar o Cabo de Ligação (ou o item segurado
 *                     direto, como em Legends: Arceus); 'outro' — regras que não dá pra cumprir por aqui (torres, giros…).
 * XP: data/exp.json — as 6 curvas oficiais, base exp e amizade base por espécie; ganho pela fórmula da Gen 5+.
 * Amizade: começa na base da espécie (70), +1 por minuto seguindo, +2 por nível, −1 ao desmaiar; evolui com 160.
 *
 *   await Evolucao.carregar();
 *   Evolucao.opcoes({ dex, lv, amizade }, ctx) → [{ regra, pode, falta, consome }]   ctx = { itens, time, tiposDe, conhece, tiposConhecidos }
 *   Evolucao.expPara(dex, lv) · nivelPara(dex, exp) · expGanha(lvVencedor, dexDerrotado, lvDerrotado, { chefe })
 */
let D = null, X = null;
export async function carregar(){
  if (!D){
    [D, X] = await Promise.all([
      fetch('./data/evolucoes.json').then(r => r.json()).catch(() => ({ por: {}, itens: {} })),
      fetch('./data/exp.json').then(r => r.json()).catch(() => ({ curvas: {}, especies: {} })),
    ]);
  }
  return D;
}
export const pronto = () => !!D;
export const regras = dex => D?.por?.[dex] || [];
export const itens = () => D?.itens || {};
export const ehItemDeEvolucao = id => !!D?.itens?.[id];
export const nomeItem = id => D?.itens?.[id]?.n || ('item ' + id);
/** Dia 6h–17h59, noite 18h–5h59 (relógio do aparelho — Espeon de dia, Umbreon à noite). */
export const horario = (d = new Date()) => { const h = d.getHours(); return (h >= 18 || h < 6) ? 'noite' : 'dia'; };
const TIPOS_PT = { Normal: 'Normal', Fighting: 'Lutador', Flying: 'Voador', Poison: 'Veneno', Ground: 'Terra', Rock: 'Pedra', Bug: 'Inseto', Ghost: 'Fantasma', Steel: 'Aço', Fire: 'Fogo', Water: 'Água', Grass: 'Planta', Electric: 'Elétrico', Psychic: 'Psíquico', Ice: 'Gelo', Dragon: 'Dragão', Dark: 'Sombrio', Fairy: 'Fada' };

/* ------------------------------------------------------------------ XP */
const curva = dex => X?.curvas?.[X?.especies?.[dex]?.c || 'medium'] || [];
/** XP total no começo do nível lv (curva da espécie). */
export function expPara(dex, lv){ const c = curva(dex); return c[Math.max(1, Math.min(100, lv | 0))] || 0; }
export function nivelPara(dex, exp){ const c = curva(dex); let lv = 1; while (lv < 100 && (c[lv + 1] ?? Infinity) <= exp) lv++; return lv; }
/** Fórmula da Gen 5+: b·L/5 · ((2L+10)/(L+Lp+10))^2.5 + 1 — b = base exp da espécie derrotada, L nível dela, Lp o do vencedor. */
export function expGanha(lvVencedor, dexDerrotado, lvDerrotado, { chefe = false } = {}){
  const b = X?.especies?.[dexDerrotado]?.b || 60, L = Math.max(1, lvDerrotado | 0), Lp = Math.max(1, lvVencedor | 0);
  const base = (b * L / 5) * Math.pow((2 * L + 10) / (L + Lp + 10), 2.5) + 1;
  return Math.max(1, Math.floor(base * (chefe ? 3 : 1)));
}
export const amizadeBase = dex => X?.especies?.[dex]?.a ?? 70;
export const AMIZADE_EVOLUI = 160;

/* ------------------------------------------------------------------ regras */
/** Avalia uma regra pro Pokémon m ({ dex, lv, amizade }) com o contexto do jogo. Devolve { pode, falta, consome }. */
export function avaliar(r, m, ctx = {}){
  const lv = m.lv || 1, amizade = m.amizade ?? amizadeBase(m.dex), tem = id => (ctx.itens?.[id] || 0) > 0;
  if (r.gatilho === 'outro' || r.local || r.chuva || r.beleza) return { pode: false, falta: 'não dá por aqui (' + r.texto + ')', consome: null };
  if (r.gatilho === 'item' || r.gatilho === 'troca'){
    if (!r.item) return { pode: false, falta: 'precisa de ' + r.itemNome + ' (não existe no jogo ainda)', consome: null };
    return tem(r.item) ? { pode: true, falta: '', consome: r.item } : { pode: false, falta: 'falta ' + nomeItem(r.item) + ' na mochila (Pokémart)', consome: null };
  }
  if (r.gatilho === 'muda') return { pode: false, falta: 'vem junto com a outra evolução', consome: null, muda: true };
  const faltas = []; let consome = null;
  if (r.nivel && lv < r.nivel) faltas.push(`Lv ${r.nivel} (está no ${lv})`);
  if (r.amizade && amizade < r.amizade) faltas.push(`amizade ${r.amizade} (está em ${amizade})`);
  if (r.horario && r.horario !== horario()) faltas.push(r.horario === 'dia' ? 'só de dia' : 'só à noite');
  if ('segurando' in r){
    if (!r.segurando) faltas.push('precisa de ' + r.segurandoNome + ' (não existe no jogo ainda)');
    else if (!tem(r.segurando)) faltas.push('falta ' + nomeItem(r.segurando) + ' na mochila');
    else consome = r.segurando;
  }
  if (r.golpe && !ctx.conhece?.(m.dex, lv)?.has(r.golpe)) faltas.push('precisa conhecer ' + r.golpeNome);
  if (r.tipoGolpe && !ctx.tiposConhecidos?.(m.dex, lv)?.has(r.tipoGolpe)) faltas.push('precisa conhecer um golpe do tipo ' + (TIPOS_PT[r.tipoGolpe] || r.tipoGolpe));
  if (r.noTime && !(ctx.time || []).some(t => t.dex === r.noTime)) faltas.push('precisa de outro Pokémon específico no time');
  if (r.tipoNoTime && !(ctx.time || []).some(t => t.dex !== m.dex && (ctx.tiposDe?.(t.dex) || []).includes(r.tipoNoTime))) faltas.push('precisa de um Pokémon do tipo ' + (TIPOS_PT[r.tipoNoTime] || r.tipoNoTime) + ' no time');
  return { pode: !faltas.length, falta: faltas.join(' · '), consome };
}
/** Todas as regras da espécie avaliadas: [{ regra, pode, falta, consome, muda }]. Quem tem modelo é o chamador que decide. */
export function opcoes(m, ctx = {}){ return regras(m.dex).map(r => ({ regra: r, ...avaliar(r, m, ctx) })); }
