/* PASSE DE PROGRESSO — regras do lado do cliente (refeito 26/10: o arquivo não veio junto com a build).
   O passe é um texto com campos separados por ponto: versão.uid.exp.bandeiras.dex.skins.cenas.assinatura
   (é a ordem que o conta.mjs usa em `conteudoPasse`). Quem confere a assinatura é a borda (Worker); aqui só se lê.
   Servidor local (servidor.mjs) não emite passe nem tem borda: toda cena vale, então CENAS_LIVRES cobre qualquer id. */

export const COOKIE = 'pf_passe';
export const VALIDADE_S = 7 * 24 * 3600;                                  // vida de um passe emitido
export const FOLGA_S = 3600;                                              // margem pro relógio do aparelho

/** Cenas que não precisam de passe. Sem borda (localhost/LAN) nada é negado: `includes` diz sim pra qualquer cena. */
export const CENAS_LIVRES = Object.freeze({ includes: () => true });

const lista = s => (s ? String(s).split(',').map(x => x.trim()).filter(Boolean) : []);

/** Lê o texto do passe → { uid, exp, gm, dex:Set<number>, skins:Set, cenas:Set } ou null se não tiver a forma certa. */
export function lerPasse(txt){
  const p = String(txt || '').split('.');
  if (p.length < 7) return null;
  let uid; try { uid = decodeURIComponent(p[1]); } catch { return null; }
  const exp = Number(p[2]);
  if (!uid || !Number.isFinite(exp)) return null;
  const bandeiras = p[3] || '';
  return {
    uid, exp,
    gm: /g/i.test(bandeiras),
    dex: new Set(lista(p[4]).map(Number).filter(Number.isFinite)),
    skins: new Set(lista(p[5])),
    cenas: new Set(lista(p[6])),
  };
}

/** O passe NÃO cobre este modelo ('pm0025_00')? Devolve o motivo (texto) ou null quando cobre — o conta.mjs (cobreGlb)
    nega com `!stemPermitido(...)`. Modelo que não é de Pokémon (sem `pmNNNN`) sempre passa. */
export function stemPermitido(stem, p){
  const m = /^pm(\d{4})/i.exec(String(stem || ''));
  if (!m) return null;
  return p?.dex?.has(+m[1]) ? null : 'espécie fora do passe';
}
