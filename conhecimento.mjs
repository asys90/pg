/* Pokédex de CONHECIMENTO (01/09) — nível de conhecimento por espécie e por jogador, como prometido no devlog.
 * Sobe com: avistar, capturar (em rotas diferentes, ♂ e ♀), ver os golpes da espécie, ver evoluir, enfrentar muitas
 * vezes e achar shiny. Cada nível revela mais da ficha na Pokédex. Tudo no navegador (LS `conhecimento`); o ranking
 * entre jogadores fica pro servidor — aqui vale o placar do próprio jogador (Colecionador) e os títulos.
 *
 *   import * as Conhecimento from './conhecimento.mjs';
 *   Conhecimento.instalar({ lerLS, gravarLS, porDex, avisar: txt => Chat.sistema(txt), premiar: (id, n) => …, titulo: t => … });
 *   Conhecimento.evento('visto', { dex, shiny });  'pego' { dex, area, shiny, sexo }  'luta' { dex }  'golpe' { dex, id }  'evoluiu' { de, para }
 *   Conhecimento.nivel(dex) → 0..5 · pontos(dex) · falta(dex) → [textos] · revela(dex) → { tipos, stats, captura, genero, learnset, mestre }
 *   Conhecimento.resumo(kantoAte = 151) → { vistos, pegos, shinies, mestres, titulos, … }
 * NUNCA mexe em chance de shiny (promessa pública: 1/4.096 igual pra todos). */
let io = null, dados = null;
const NIVEIS = ['desconhecido', 'Avistado', 'Registrado', 'Estudado', 'Especialista', 'Mestre'];
const LIMIAR = [0, 1, 4, 10, 18, 28];                                      // pontos mínimos de cada nível (máx. teórico 36)
const TITULOS = [
  /* Alpha Tester (12/09): não é de coleção — é a marca de quem jogou no alpha, que vem da CONTA (io.alfa). Fica em PRIMEIRO
     na lista de propósito: `tituloAtual` mostra o ÚLTIMO que a pessoa tem, então qualquer título de coleção ganho depois
     aparece no lugar dele (o Alpha Tester é a marca base, enquanto ainda não se conquistou nada). */
  { id: 'alphaTester',  nome: 'Alpha Tester',      cond: r => !!r.alfa,         desc: 'jogou no alpha de Pokemon 3D Base' },
  { id: 'observador',   nome: 'Observador',        cond: r => r.vistos >= 25,   desc: '25 espécies vistas' },
  { id: 'colecionador', nome: 'Colecionador',      cond: r => r.pegos >= 25,    desc: '25 espécies capturadas', premio: [1003, 5] },
  { id: 'shiny',        nome: 'Caçador de Shiny',  cond: r => r.shinies >= 1,   desc: 'capturou um shiny' },
  { id: 'estudioso',    nome: 'Estudioso',         cond: r => r.estudadas >= 10, desc: '10 espécies em nível Estudado ou mais' },
  { id: 'mestreKanto',  nome: 'Mestre de Kanto',   cond: r => r.pegosKanto >= 151, desc: 'as 151 de Kanto capturadas', premio: [1004, 1] },
  { id: 'professor',    nome: 'Professor',         cond: r => r.mestres >= 25,  desc: '25 espécies em nível Mestre' },
];
const SEXO_NENHUM = '-';

function carregar(){ if (!io) return { esp: {}, titulos: [], v: 1 };   // antes de instalar (ex.: rotularJogador no boot): vazio, sem cache
  if (!dados){ dados = io.lerLS('conhecimento', null) || { esp: {}, titulos: [], v: 1 }; dados.esp ||= {}; dados.titulos ||= []; } return dados; }
function salvar(){ if (io && dados) io.gravarLS('conhecimento', dados); }
function reg(dex){ const d = carregar(); return d.esp[dex] ||= { v: 0, p: 0, ar: [], sx: '', gl: [], ev: 0, lu: 0, sh: 0 }; }
const temGenero = dex => (io.sexos?.[dex] ?? 50) >= 0;

export function instalar(ctx){ io = ctx; carregar(); try { conferirTitulos(); } catch {} }   // reconcilia os títulos no boot (12/09: tira o "Caçador de Shiny" dado por VER um shiny, agora só vale CAPTURAR)

/** Pontos de conhecimento da espécie (ver tabela no diário 01/09). */
export function pontos(dex){
  const r = carregar().esp[dex]; if (!r) return 0;
  let p = 0;
  if (r.v > 0 || r.p > 0) p += 1;
  if (r.p > 0) p += 3;
  p += Math.min(2, Math.max(0, r.ar.length - 1)) * 2;                     // até 3 áreas distintas
  if (r.p > 0 && !temGenero(dex)) p += 4; else p += (r.sx.includes('m') ? 2 : 0) + (r.sx.includes('f') ? 2 : 0);
  p += Math.min(8, r.gl.length);
  if (r.ev) p += 4;
  p += Math.min(5, Math.floor(r.lu / 3));
  if (r.sh) p += 5;
  return p;
}
export function nivel(dex){ const p = pontos(dex); let n = 0; for (let i = 1; i < LIMIAR.length; i++) if (p >= LIMIAR[i]) n = i; return n; }
export const nomeNivel = n => NIVEIS[n] || NIVEIS[0];
export function registro(dex){ return carregar().esp[dex] || null; }
/** O que a ficha pode mostrar neste nível. */
export function revela(dex){
  const n = nivel(dex);
  return { nome: n >= 1, tipos: n >= 1, onde: n >= 1, stats: n >= 2, evolucao: n >= 2, fraquezas: n >= 2, captura: n >= 3, habilidades: n >= 3, genero: n >= 4, learnset: n >= 4, oculta: n >= 4, mestre: n >= 5, nivel: n, pontos: pontos(dex), proximo: LIMIAR[n + 1] ?? null };
}
/** Lista curta do que ainda falta pra subir (pra mostrar na ficha). */
export function falta(dex){
  const r = carregar().esp[dex] || { v: 0, p: 0, ar: [], sx: '', gl: [], ev: 0, lu: 0, sh: 0 }, f = [];
  if (!r.p) f.push('capturar um');
  if (r.p && r.ar.length < 3) f.push('capturar em outra rota (' + r.ar.length + '/3)');
  if (temGenero(dex)){ if (!r.sx.includes('m')) f.push('capturar um ♂'); if (!r.sx.includes('f')) f.push('capturar uma ♀'); }
  if (r.gl.length < 8) f.push('ver mais golpes da espécie (' + r.gl.length + '/8)');
  if (!r.ev) f.push('ver a espécie evoluir');
  if (r.lu < 15) f.push('enfrentar mais vezes (' + r.lu + '/15)');
  if (!r.sh) f.push('encontrar um shiny ✨');
  return f;
}

/** Evento do jogo. Devolve o nível novo se subiu (pra quem chamou avisar), senão null. */
export function evento(tipo, e = {}){
  if (!io) return null;
  const dex = +(e.dex ?? e.de); if (!dex) return null;
  const antes = nivel(dex), r = reg(dex);
  if (tipo === 'visto'){ r.v++; if (e.shiny) r.sh = 1; }
  else if (tipo === 'pego'){
    r.p++; if (e.shiny){ r.sh = 1; r.shp = 1; }   // shp = shiny CAPTURADO (o título/ranking usam este; `sh` = shiny só VISTO, vale pra Pokédex)
    if (e.area != null && !r.ar.includes(e.area)) r.ar.push(e.area);
    if (e.sexo === 'm' || e.sexo === 'f'){ if (!r.sx.includes(e.sexo)) r.sx += e.sexo; }
    else if (!temGenero(dex)) r.sx = SEXO_NENHUM;
  }
  else if (tipo === 'luta') r.lu++;
  else if (tipo === 'golpe'){ if (e.id && !r.gl.includes(e.id)) r.gl.push(e.id); else if (!e.id) return null; }
  else if (tipo === 'evoluiu'){ r.ev = 1; if (e.para){ const r2 = reg(+e.para); r2.v = Math.max(r2.v, 1); } }
  else return null;
  salvar();
  const depois = nivel(dex);
  if (depois > antes){
    const S = io.porDex?.get(dex);
    io.avisar?.(`📖 ${S?.name || 'Nº ' + dex}: conhecimento nível ${depois} (${NIVEIS[depois]})${depois < 5 ? ' — ' + (['', 'a ficha mostra os tipos e onde vive', 'revela stats, altura e peso', 'revela taxa de captura e habilidades', 'revela gênero, learnset completo e habilidade oculta'][depois] || '') : ' — você sabe TUDO sobre a espécie!'}`);
  }
  conferirTitulos();
  return depois > antes ? depois : null;
}

/** Placar do próprio jogador (Kanto = até 151 por padrão). */
export function resumo(kantoAte = 151){
  const d = carregar(); let vistos = 0, pegos = 0, pegosKanto = 0, vistosKanto = 0, shinies = 0, mestres = 0, estudadas = 0, pontosTotal = 0;
  for (const [k, r] of Object.entries(d.esp)){
    const dex = +k, n = nivel(dex); pontosTotal += pontos(dex);
    if (r.v || r.p){ vistos++; if (dex <= kantoAte) vistosKanto++; }
    if (r.p){ pegos++; if (dex <= kantoAte) pegosKanto++; }
    if (r.shp) shinies++;   // shinies = espécies CAPTURADAS em shiny (12/09; era `sh && p` = viu shiny + pegou a espécie, dava o título sem capturar shiny)
    if (n >= 5) mestres++; if (n >= 3) estudadas++;
  }
  const alfa = !!(io && io.alfa && io.alfa());                             // Alpha Tester (12/09): vem da conta, não da coleção
  return { vistos, pegos, vistosKanto, pegosKanto, kantoAte, shinies, mestres, estudadas, pontosTotal, alfa, titulos: d.titulos.slice(), tituloAtual: tituloAtual() };
}
export function tituloAtual(){ const d = carregar(); const t = TITULOS.filter(x => d.titulos.includes(x.id)); return t.length ? t[t.length - 1].nome : ''; }
export function listaTitulos(){ const d = carregar(); const r = resumo(); return TITULOS.map(t => ({ ...t, tem: d.titulos.includes(t.id), ok: !!t.cond(r) })); }
function conferirTitulos(){
  const d = carregar(), r = resumo(); let novo = false;
  for (const t of TITULOS){
    if (d.titulos.includes(t.id) || !t.cond(r)) continue;
    d.titulos.push(t.id); novo = true;
    io.avisar?.(`🏅 Título conquistado: ${t.nome} (${t.desc})${t.premio ? ' — ganhou ' + t.premio[1] + '× ' + (io.nomeItem?.(t.premio[0]) || 'item') : ''}`);
    if (t.premio) io.premiar?.(t.premio[0], t.premio[1], t.id);   // o id do título vai junto: com conta é o SERVIDOR que paga (uma vez cada)
  }
  /* Auto-correção (12/09): tira título que não é mais merecido — as condições são de coleção e não regridem, então o único caso é
     um título dado por uma regra antiga com bug (o "Caçador de Shiny" saía por VER um shiny; agora só por CAPTURAR). Nunca paga
     de novo ao reganhar (o servidor guarda quem já recebeu o prêmio). */
  const tirar = d.titulos.filter(id => { if (id === 'alphaTester') return false; const t = TITULOS.find(x => x.id === id); return t && !t.cond(r); });   // 14/09: a marca do alpha nunca sai por auto-correção (vem da conta; se o flag ainda não chegou, não é motivo pra tirar)
  if (tirar.length){ d.titulos = d.titulos.filter(id => !tirar.includes(id)); novo = true; }
  if (novo){ salvar(); io.titulo?.(tituloAtual()); }
}
/** Sorteia o sexo de um indivíduo pela razão ♂ da espécie ('m' | 'f' | '-'). */
export function sortearSexo(dex){ const m = io?.sexos?.[dex]; if (m == null) return Math.random() < 0.5 ? 'm' : 'f'; if (m < 0) return SEXO_NENHUM; return Math.random() * 100 < m ? 'm' : 'f'; }
export const simboloSexo = s => s === 'm' ? '♂' : s === 'f' ? '♀' : '';
/** Compatibilidade com a Pokédex antiga (LS `dex`: 'visto' | 'pego'). */
export function estadoAntigo(){ const d = carregar(), out = {}; for (const [k, r] of Object.entries(d.esp)){ if (r.p) out[k] = 'pego'; else if (r.v) out[k] = 'visto'; } return out; }
export function tudo(){ return carregar(); }
