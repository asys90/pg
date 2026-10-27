/* Indivíduo: IV (0–31 por stat) e natureza (25, +10 %/−10 %) — o que faz cada Pokémon ser único.
   Fórmulas da série (as de regras.mjs são estas com IV/EV zerados e natureza neutra; o ×3 do HP é a folga do
   combate em tempo real). EV fica reservado (parâmetro `ev`, sempre 0 por enquanto — decisão no GDD §11.3).
   Sorte: hoje rola no cliente (single-player); no servidor a rolagem vai pra lá (GDD §8). Sem reroll pago. */
export const STATS = ['HP', 'Ataque', 'Defesa', 'At. Esp.', 'Def. Esp.', 'Velocidade'];
export const IV_MAX = 31, IV_TOTAL = 31 * 6;
export const HP_X = 3;                                                   // folga do tempo real (igual ao regras.mjs)
/** [nome, stat que sobe, stat que desce] — índices em STATS (1 Atk, 2 Def, 3 SpA, 4 SpD, 5 Spe); neutra = mesmo índice. */
export const NATUREZAS = [
  ['Hardy', 1, 1], ['Lonely', 1, 2], ['Brave', 1, 5], ['Adamant', 1, 3], ['Naughty', 1, 4],
  ['Bold', 2, 1], ['Docile', 2, 2], ['Relaxed', 2, 5], ['Impish', 2, 3], ['Lax', 2, 4],
  ['Timid', 5, 1], ['Hasty', 5, 2], ['Serious', 5, 5], ['Jolly', 5, 3], ['Naive', 5, 4],
  ['Modest', 3, 1], ['Mild', 3, 2], ['Quiet', 3, 5], ['Bashful', 3, 3], ['Rash', 3, 4],
  ['Calm', 4, 1], ['Gentle', 4, 2], ['Sassy', 4, 5], ['Careful', 4, 3], ['Quirky', 4, 4],
];
export const natureza = nome => NATUREZAS.find(n => n[0] === nome) || null;
export const sortearIVs = () => Array.from({ length: 6 }, () => Math.floor(Math.random() * (IV_MAX + 1)));
export const sortearNatureza = () => NATUREZAS[Math.floor(Math.random() * NATUREZAS.length)][0];
export function multNatureza(nome, i){ const n = natureza(nome); if (!n || n[1] === n[2]) return 1; return i === n[1] ? 1.1 : i === n[2] ? 0.9 : 1; }
export const descNatureza = nome => { const n = natureza(nome); return !n ? '' : n[1] === n[2] ? 'neutra' : '+' + STATS[n[1]] + ' −' + STATS[n[2]]; };
export const somaIV = e => (e?.ivs || []).reduce((a, b) => a + b, 0);

export function hp(base, lv, iv = 0, ev = 0){ return (Math.floor((2 * base + iv + Math.floor(ev / 4)) * lv / 100) + lv + 10) * HP_X; }
export function stat(base, lv, iv = 0, ev = 0, nat = null, i = 1){ return Math.floor((Math.floor((2 * base + iv + Math.floor(ev / 4)) * lv / 100) + 5) * multNatureza(nat, i)); }
/** Completa o que faltar (quem já existia antes de 31/08 ganha IV/natureza sorteados uma vez). */
export function garantir(e){
  if (!e) return e;
  if (!Array.isArray(e.ivs) || e.ivs.length !== 6) e.ivs = sortearIVs();
  if (!natureza(e.natureza)) e.natureza = sortearNatureza();
  return e;
}
export const hpDe = (S, e) => hp(S.bs[0], e.lv || 1, e.ivs?.[0] || 0);
export const statDe = (S, e, i) => stat(S.bs[i], e.lv || 1, e.ivs?.[i] || 0, 0, e.natureza, i);
/* ------------------------------------------------------------ golpes por indivíduo (learnset) e PP
   `movs` = [{ id, pp, ppMax }] até 4, no registro do time e na entidade; `golpesIds` do index é derivado daqui.
   Learnset (data/learnset.json, tools/learnset.mjs): golpes de dano com efeito, por nível (Sword/Shield). */
let LEARN = null;
export function carregarLearnset(d){ LEARN = d || null; }
export const ppDe = id => LEARN?.pp?.[id] ?? 20;
export const learnsetDe = dex => LEARN?.learnset?.[dex] || [];
/** Ids que um indivíduo dessa espécie/nível teria: os últimos 4 do learnset ≤ lv; mínimo 2 (completa com o fallback). */
export function golpesIniciais(dex, lv, fallback = []){
  const ids = [...new Set(learnsetDe(dex).filter(([, n]) => n <= (lv || 1)).map(([k]) => k))].slice(-4);
  for (const f of fallback){ if (ids.length >= 2) break; if (!ids.includes(f)) ids.push(f); }
  return ids;
}
export const novoGolpe = id => ({ id, pp: ppDe(id), ppMax: ppDe(id) });
export const golpesPara = (dex, lv, fallback) => golpesIniciais(dex, lv, fallback).map(novoGolpe);
/** Golpes que entram exatamente nesse nível. */
export const aprendeEm = (dex, lv) => learnsetDe(dex).filter(([, n]) => n === lv).map(([k]) => k);
export function garantirMovs(e, fallback){
  if (!e) return e;
  if (!Array.isArray(e.movs) || !e.movs.length) e.movs = golpesPara(e.dex, e.lv || 5, fallback);
  for (const m of e.movs){ if (m.ppMax == null) m.ppMax = ppDe(m.id); if (m.pp == null) m.pp = m.ppMax; }
  return e;
}
export const idsDe = e => (e?.movs || []).map(m => m.id);
export const temPP = (e, id) => { const m = (e?.movs || []).find(m => m.id === id); return !m || m.pp > 0; };
export function gastarPP(e, id){ const m = (e?.movs || []).find(m => m.id === id); if (!m) return true; if (m.pp <= 0) return false; m.pp--; return true; }
export function restaurarPP(e){ for (const m of e?.movs || []) m.pp = m.ppMax ?? ppDe(m.id); if (e && e.ppEsq) delete e.ppEsq; }   /* a cura completa também zera a memória de PP dos golpes esquecidos */
/* PP DE GOLPE ESQUECIDO (19/09, chaospider "PPs infinitos? Tô dentro!", tópico 1550862692154343555): trocar de golpe pelo Reaprender
   criava o golpe NOVO com PP cheio, então esquecer X e reaprender X logo depois devolvia o PP de X — golpe por golpe, o time inteiro
   voltava cheio sem passar no Centro. Agora quem esquece guarda o PP que tinha em `ppEsq` (no REGISTRO do time) e, se voltar, volta com
   ele; golpe que o Pokémon nunca teve entra cheio. A cura completa (restaurarPP) limpa a memória. No máximo 12 golpes lembrados. */
export function esquecerGolpe(reg, m){
  if (!reg || !m?.id) return;
  const q = { ...(reg.ppEsq && typeof reg.ppEsq === 'object' ? reg.ppEsq : {}) }; delete q[m.id];
  q[m.id] = m.pp == null ? (m.ppMax ?? ppDe(m.id)) : Math.max(0, +m.pp || 0);
  const ks = Object.keys(q); for (const k of ks.slice(0, Math.max(0, ks.length - 12))) delete q[k];
  reg.ppEsq = q;
}
export function golpeLembrado(reg, id){
  const g = novoGolpe(id), v = reg?.ppEsq?.[id];
  if (v != null){ g.pp = Math.max(0, Math.min(g.ppMax, +v || 0)); const q = { ...reg.ppEsq }; delete q[id]; reg.ppEsq = q; }
  return g;
}
export const semPP = e => !!(e?.movs?.length) && e.movs.every(m => m.pp <= 0);

/** Os 6 stats do indivíduo (bs da espécie + IV + natureza). */
export function statsDe(S, e){
  const bs = S?.bs || [45, 45, 45, 45, 45, 45], lv = e?.lv || 5, iv = e?.ivs || [0, 0, 0, 0, 0, 0];
  return bs.map((b, i) => i === 0 ? hp(b, lv, iv[0]) : stat(b, lv, iv[i], 0, e?.natureza, i));
}
