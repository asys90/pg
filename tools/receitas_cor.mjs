/* Gera public/data/receitas_cor.json: as receitas de cor das roupas do jogo original que têm máscara RGB (Boy_012…022,
 * Girl_010…021). Uso: node tools/receitas_cor.mjs
 *
 * De onde sai cada receita: os materiais do GLB (public/cenario/pc/<Modelo>.glb) × data/npc_tintas.json (gerado dos .mat do
 * dump: máscara + cor de fábrica de cada canal R/G/B/preto). No .mat, o 4º número da cor (alfa) = 1 marca o canal que o jogo
 * original deixava o jogador TINGIR — são esses que viram partes editáveis. Fora eles:
 *   • canal com o tom de pele de fábrica → parte "pele" (a mesma do Herói/Heroína);
 *   • canal G do rosto → "olhos";
 *   • o resto fica fixo na cor de fábrica (array), pra roupa sair igual à de antes quando ninguém mexe.
 * Os NOMES das partes (cabelo, jaqueta…) vêm da tabela NOMES abaixo, conferidos pintando cada modelo com cores de sonda na
 * prévia do painel; canal sem nome vira "cor 1/2/3". Depois de gerado, o painel (Arquivos de dados → Receitas de cor) edita
 * nomes e cores padrão — rodar de novo SOBRESCREVE essas edições.
 * Modelo cuja máscara do corpo não existe em cenario/npc/mask fica de fora (a tinta sem máscara pinta a textura inteira). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELOS = ['Boy_012', 'Boy_013', 'Boy_014', 'Boy_015', 'Boy_016', 'Boy_017', 'Boy_018', 'Boy_020', 'Boy_021', 'Boy_022',
  'Girl_010', 'Girl_012', 'Girl_013', 'Girl_014', 'Girl_015', 'Girl_016', 'Girl_017', 'Girl_018', 'Girl_019', 'Girl_020', 'Girl_021'];
/** modelo → canal do CORPO → [chave da parte, rótulo]. A chave casa com as paletas do personagem.mjs (cabelo, roupa, roupa2).
    Conferido em 27/10 pintando cada canal de uma cor de sonda (vermelho/azul/verde) ao lado do original. Vários canais pintam
    mais de uma peça (a máscara do jogo original junta, ex.: cabelo e jaqueta) — o rótulo diz tudo o que muda.
    Rótulo de até ~15 letras: a linha de cor da tela de criação (telas_personagem.mjs) corta o resto. */
const NOMES = {
  Boy_012: { G: ['cabelo', 'cabelo e blusa'], B: ['roupa', 'estampa'] },
  Boy_013: { R: ['cabelo', 'cabelo e jaqueta'], G: ['roupa', 'boina'], B: ['roupa2', 'calça'] },
  Boy_014: { G: ['cabelo', 'cabelo/macacão'], B: ['roupa', 'remendos'] },
  Boy_015: { G: ['roupa', 'calça e listras'], B: ['roupa2', 'tênis'] },
  Boy_016: { G: ['roupa', 'detalhes'], B: ['roupa2', 'jaqueta e calça'] },
  Boy_017: { G: ['cabelo', 'cabelo'], B: ['roupa', 'camiseta'] },
  Boy_018: { G: ['roupa', 'gorro'], B: ['roupa2', 'cachecol'], K: ['roupa3', 'jaqueta'] },
  Boy_020: { G: ['cabelo', 'cabelo'] },
  Boy_021: { G: ['cabelo', 'cabelo e jaqueta'], B: ['roupa', 'boné e calça'] },
  Boy_022: { G: ['cabelo', 'cabelo e jaqueta'], B: ['roupa', 'tênis'] },
  Girl_010: { G: ['cabelo', 'cabelo'], B: ['roupa', 'laços'] },
  Girl_012: { G: ['cabelo', 'cabelo'], B: ['roupa', 'estampa'] },
  Girl_013: { G: ['cabelo', 'cabelo'], B: ['roupa', 'gorro'] },
  Girl_014: { G: ['cabelo', 'cabelo'], B: ['roupa', 'acessório'] },
  Girl_015: { G: ['cabelo', 'cabelo'] },
  Girl_016: { G: ['cabelo', 'cabelo'] },
  Girl_017: { G: ['cabelo', 'cabelo'], B: ['roupa', 'tênis'] },
  Girl_018: { G: ['cabelo', 'cabelo'], B: ['roupa', 'gorro'] },
  Girl_019: { G: ['cabelo', 'cabelo'], B: ['roupa', 'boina'] },
  Girl_020: { G: ['cabelo', 'cabelo'], B: ['roupa', 'boné'] },
  Girl_021: { G: ['cabelo', 'cabelo'], B: ['roupa', 'tênis'] },
};

const T = JSON.parse(fs.readFileSync(path.join(RAIZ, 'public/data/npc_tintas.json'), 'utf8'));
const PELE = [[1, 0.7961, 0.6667], [1, 0.8588, 0.7686], [0.9922, 0.9098, 0.8275]];   // os tons de pele de fábrica do dump
const ehPele = c => PELE.some(p => p.every((v, i) => Math.abs(v - c[i]) < 0.02));
const hex = c => '#' + c.slice(0, 3).map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
const fixo = c => c.slice(0, 3).map(v => +v.toFixed(4));
const jsonDoGlb = arq => { const b = fs.readFileSync(arq), n = b.readUInt32LE(12); return JSON.parse(b.slice(20, 20 + n).toString('utf8')); };

const saida = {}, fora = [];
for (const modelo of MODELOS) {
  const g = jsonDoGlb(path.join(RAIZ, 'public/cenario/pc', modelo + '.glb')), id = modelo.toLowerCase();
  const r = { modelo, texturas: {}, rotulos: {}, padrao: {} };
  let n = 0, semMascara = null;
  for (const m of g.materials || []) {
    const t = T[modelo + ':' + m.name] || T[m.name];
    if (!t?.mask || t.isMask) continue;
    if (!fs.existsSync(path.join(RAIZ, 'cenario/npc/mask', t.mask))) { semMascara = t.mask; continue; }
    const rosto = /face/i.test(m.name), canais = { mask: t.mask };
    for (const [k, nomeCor] of [['R', 'ColorR'], ['G', 'ColorG'], ['B', 'ColorB'], ['K', 'ColorBlack']]) {
      const c = t[nomeCor] || [1, 1, 1, 0];
      let parte = null, rot = null;
      if (ehPele(c)) { parte = 'pele'; rot = 'pele'; }
      else if (rosto && k === 'G') { parte = 'olhos'; rot = 'olhos'; }
      else if (!rosto && c[3] === 1) {
        const nome = NOMES[modelo]?.[k];
        if (nome) [parte, rot] = nome; else { n++; parte = 'cor' + n; rot = 'cor ' + n; }
      }
      if (!parte) { canais[k] = fixo(c); continue; }
      canais[k] = parte; r.rotulos[parte] ||= rot; r.padrao[parte] ||= hex(c);
    }
    r.texturas[m.name] = canais;
  }
  const temCorpo = Object.keys(r.texturas).some(k => !/face/i.test(k));
  if (!temCorpo) { fora.push(modelo + (semMascara ? ' (falta a máscara ' + semMascara + ')' : ' (sem máscara no corpo)')); continue; }
  // ordem das partes na tela: pele, as da roupa, olhos
  const ordem = ks => [...ks.filter(k => k === 'pele'), ...ks.filter(k => k !== 'pele' && k !== 'olhos'), ...ks.filter(k => k === 'olhos')];
  r.rotulos = Object.fromEntries(ordem(Object.keys(r.rotulos)).map(k => [k, r.rotulos[k]]));
  r.padrao = Object.fromEntries(Object.keys(r.rotulos).map(k => [k, r.padrao[k]]));
  saida[id] = r;
}
fs.writeFileSync(path.join(RAIZ, 'public/data/receitas_cor.json'), JSON.stringify(saida, null, 1));
console.log(Object.keys(saida).length + ' receitas:', Object.entries(saida).map(([id, r]) => id + '[' + Object.values(r.rotulos).join(', ') + ']').join('  '));
if (fora.length) console.log('fora:', fora.join('; '));
