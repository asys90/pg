/* Esquemas da Fase 3 do painel (cores de NPC, diálogos, traduções, raid e músicas). Entram no ESQUEMAS do esquemas.mjs (`...ESQUEMAS_F3`),
 * então valem as mesmas regras de lá: o navegador monta a tela e o servidor valida/grava com backup pelos mesmos esquemas.
 * Os eventos ao vivo NÃO estão aqui: têm tela própria (admin/eventos.mjs) e rota própria (servidor_eventos.mjs), porque
 * salvar precisa empurrar pros jogadores online. */

const ehObjeto = v => v && typeof v === 'object' && !Array.isArray(v);

// ── Cores de NPC (npc_tintas.json) ─────────────────────────────────────────────────────────────────────────────────────
/** [r, g, b] ou [r, g, b, a], de 0 a 2 (o shader multiplica a textura: acima de 1 clareia). */
const corRGBA = v => (Array.isArray(v) && (v.length === 3 || v.length === 4) && v.every(n => typeof n === 'number' && n >= 0 && n <= 2))
  ? null : 'use [r, g, b, a] com números de 0 a 2 (1 = a textura como está) — ou escolha a cor na prévia acima';
export const corHex = v => Array.isArray(v) ? '#' + v.slice(0, 3).map(n => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0')).join('') : '';
const nomePng = s => /^[\w .()-]{1,80}\.png$/i.test(s) ? null : 'nome de arquivo .png (em cenario/npc/mask)';
const canaisNeutros = v => (Array.isArray(v) && v.length <= 3 && v.every(c => ['R', 'G', 'B'].includes(c))) ? null : 'lista com "R", "G" e/ou "B" — ex.: ["G"]';

// ── Textos ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const linhasCurtas = (max = 10, tam = 300) => v => (Array.isArray(v) && v.length >= 1 && v.length <= max && v.every(s => typeof s === 'string' && s.length <= tam))
  ? null : `de 1 a ${max} linhas, cada uma com até ${tam} letras`;
const chaves = s => [...String(s || '').matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
/** Tradução: as variáveis {x} da tradução têm que ser as mesmas do texto em português (senão o jogo mostra "{x}" cru). */
const traducaoCasa = r => {
  for (const l of ['en', 'es']) if (r[l] && chaves(r[l]) !== chaves(r.pt)) return `${l.toUpperCase()}: use as mesmas variáveis do português (${chaves(r.pt) ? '{' + chaves(r.pt).split(',').join('}, {') + '}' : 'nenhuma'})`;
  return null;
};

// ── Músicas (musicas.json): faixa = caminho em som/ sem .ogg ("bg/sound_road1") ──────────────────────────────────────────
const FAIXA = /^(bg|ui)\/[\w-]{1,60}$/;
const faixaOk = s => FAIXA.test(s) ? null : 'faixa no formato "bg/sound_road1" (arquivo som/bg/sound_road1.ogg)';
const mapaDeFaixas = v => {
  if (!ehObjeto(v)) return 'precisa ser { "id": "bg/faixa" }';
  for (const [k, f] of Object.entries(v)) {
    if (!/^\d{1,9}$/.test(k)) return `id inválido: ${k} (só números)`;
    if (typeof f !== 'string' || !FAIXA.test(f)) return `${k}: faixa no formato "bg/sound_road1"`;
  }
  return null;
};
const faixasFixas = ks => v => {
  if (!ehObjeto(v)) return `precisa ser { ${ks.map(k => `"${k}": "bg/…"`).join(', ')} }`;
  for (const [k, f] of Object.entries(v)) if (!ks.includes(k) || typeof f !== 'string' || !FAIXA.test(f)) return `use só ${ks.join(', ')}, cada um com uma faixa "bg/…"`;
  return null;
};

export const ESQUEMAS_F3 = {
  npc_tintas: {
    titulo: 'Cores de NPC', arquivo: 'npc_tintas', forma: 'mapa', idValido: /^[\w][\w .:()-]{0,79}$/, idAjuda: 'o nome do material do modelo (ex.: fc2013_00_nursejoy_hair_col) ou "<modelo>:<material>"',
    descricao: 'A cor de fábrica de cada parte dos NPCs, roupas e mochilas: a textura é quase branca e a cor vem daqui, pelos canais R/G/B/preto da máscara. A prévia mostra o modelo (quando existe nesta cópia) com a edição.',
    previa: '/admin/previa_tinta.mjs',
    campos: [
      { k: 'ColorR', rotulo: 'Canal vermelho da máscara (R)', tipo: 'json', col: true, validar: corRGBA, resumo: corHex, ajuda: 'Sem máscara, é o tom da peça inteira.' },
      { k: 'ColorG', rotulo: 'Canal verde da máscara (G)', tipo: 'json', col: true, validar: corRGBA, resumo: corHex },
      { k: 'ColorB', rotulo: 'Canal azul da máscara (B)', tipo: 'json', col: true, validar: corRGBA, resumo: corHex },
      { k: 'ColorBlack', rotulo: 'Preto da máscara (o resto)', tipo: 'json', col: true, validar: corRGBA, resumo: corHex },
      { k: 'mask', rotulo: 'Máscara', tipo: 'texto', max: 84, col: true, validar: s => s ? nomePng(s) : null, ajuda: 'PNG em cenario/npc/mask. Vazio = sem máscara (só o canal R pinta, como tom base).' },
      { k: 'isMask', rotulo: 'Tinta', tipo: 'opcao', opcoes: [{ v: 0, rotulo: 'Pinta (normal)' }, { v: 1, rotulo: 'Não pinta (a textura já vem colorida)' }] },
      { k: 'neutralizar', rotulo: 'Recolorir textura já pintada (avançado)', tipo: 'json', validar: canaisNeutros,
        ajuda: 'Canais da máscara cuja cor original é trocada pelo cinza antes de pintar — pra recolorir um cabelo que já veio pintado. Ex.: ["G"].' },
      { k: 'ganho', rotulo: 'Brilho do cinza (com "Recolorir")', tipo: 'num', min: 0.5, max: 4, ajuda: 'Padrão 1,6.' },
    ],
  },
  // as falas dos NPCs (npcs_glb.json) são a tela "NPCs (quem é quem)" da Fase 1; a Fase 3 só faz o jogo aberto aplicá-las na hora
  dialogos: {
    titulo: 'Diálogos do jogo', arquivo: 'dialogos', forma: 'objeto', recarga: 'vivo',
    descricao: 'Falas que antes ficavam fixas no código (portão de Pallet, Professor Oak, escolha do inicial, abertura). Vazio = o texto original. {nome} = o nome do Pokémon. O jogo aberto aplica na hora.',
    campos: [
      { k: 'oakNome', rotulo: 'Nome do professor nas falas', tipo: 'texto', max: 40, ajuda: 'Original: Professor Samuel.' },
      { k: 'portao', rotulo: 'Assistente no portão de Pallet (sem Pokémon)', tipo: 'linhas', validar: linhasCurtas(6) },
      { k: 'portaoBalao', rotulo: 'Balão quando o assistente está longe', tipo: 'texto', max: 120 },
      { k: 'portaoChat', rotulo: 'Linha no chat (portão)', tipo: 'texto', max: 200 },
      { k: 'oakJaEscolheu', rotulo: 'Oak: já escolheu o inicial', tipo: 'linhas', validar: linhasCurtas(4), ajuda: 'Original: Você já escolheu {nome}. Cuide bem dele!' },
      { k: 'oakEntrega', rotulo: 'Oak: entrega o inicial', tipo: 'linhas', validar: linhasCurtas(6) },
      { k: 'escolhaTitulo', rotulo: 'Escolha do inicial: título', tipo: 'texto', max: 80 },
      { k: 'escolhaSub', rotulo: 'Escolha do inicial: subtítulo', tipo: 'texto', max: 160 },
      { k: 'jaVenceu', rotulo: 'Treinador já vencido (sem fala própria)', tipo: 'texto', max: 120 },
      { k: 'introLiga', rotulo: 'Abertura: legenda 1', tipo: 'texto', max: 80 },
      { k: 'introRed', rotulo: 'Abertura: fala do Red', tipo: 'texto', max: 80 },
      { k: 'introMega', rotulo: 'Abertura: Mega Evolução', tipo: 'texto', max: 80 },
    ],
  },
  traducoes: {
    titulo: 'Traduções (EN/ES)', arquivo: 'traducoes', forma: 'lista', id: 'pt', recarga: 'vivo',
    descricao: 'O jogo é escrito em português e traduz na hora pro inglês/espanhol do jogador. Cada linha: o texto em português exatamente como aparece e a tradução. {x} casa com qualquer trecho (ex.: "Você chegou em {x}." → "You arrived in {x}."). Estas vencem os dicionários de data/idioma/. O jogo aberto aplica na hora.',
    validar: traducaoCasa,
    campos: [
      { k: 'pt', rotulo: 'Português (como aparece no jogo)', tipo: 'texto', max: 400, col: true, obrigatorio: true, area: true },
      { k: 'en', rotulo: 'English', tipo: 'texto', max: 400, col: true, area: true },
      { k: 'es', rotulo: 'Español', tipo: 'texto', max: 400, col: true, area: true },
      { k: 'nota', rotulo: 'Onde aparece (anotação)', tipo: 'texto', max: 80 },
    ],
  },
  musicas: {
    titulo: 'Músicas por área', arquivo: 'musicas', forma: 'objeto', recarga: 'vivo',
    descricao: 'A faixa que toca em cada área de Kanto, em cada interior (cena) e nas batalhas. Faixa = arquivo em som/ sem o .ogg. A prévia lista as áreas com o nome e toca a faixa; o jogo aberto troca na hora.',
    previa: '/admin/previa_musica.mjs',
    campos: [
      { k: 'areas', rotulo: 'Áreas (id → faixa)', tipo: 'json', validar: mapaDeFaixas, ajuda: 'Área fora da lista usa a padrão de área.' },
      { k: 'cenas', rotulo: 'Interiores (cena → faixa)', tipo: 'json', validar: mapaDeFaixas, ajuda: 'Cena fora da lista usa a padrão de interior.' },
      { k: 'padrao', rotulo: 'Padrão', tipo: 'json', validar: faixasFixas(['area', 'interior']), ajuda: '{ "area": "bg/…", "interior": "bg/…" }' },
      { k: 'batalha', rotulo: 'Batalhas', tipo: 'json', validar: faixasFixas(['treinador', 'ginasio', 'elite']), ajuda: '{ "treinador": "bg/…", "ginasio": "bg/…", "elite": "bg/…" }' },
      { k: 'login', rotulo: 'Tela de login', tipo: 'texto', max: 64, validar: faixaOk },
    ],
  },
  raid: {
    titulo: 'Raid', arquivo: 'raid', forma: 'objeto',
    descricao: 'A arena e o chefe da raid ao vivo. Arena, vagas, nome e tamanho do chefe valem no jogo (fila, barra do chefe, avisos e o modo arena); vida, dano, shiny e prêmio são do servidor de raid (servidor_raid.mjs, relido a cada /raid anunciar; os comandos /raid do chat sobrepõem só naquela raid).',
    previa: '/admin/previa_raid.mjs',
    validar: r => r.chefeGlb && r.chefeDex && +r.chefeGlb.slice(2, 6) !== r.chefeDex ? `o modelo ${r.chefeGlb} é da espécie nº ${+r.chefeGlb.slice(2, 6)}, não da ${r.chefeDex}` : null,
    campos: [
      { k: 'arena', rotulo: 'Cena da arena', tipo: 'texto', max: 12, validar: s => /^\d{3,9}$/.test(s) ? null : 'o id da cena (só números)', ajuda: 'Original: 4120009 (Quarto da Lorelei).' },
      { k: 'vagas', rotulo: 'Vagas na fila', tipo: 'num', min: 1, max: 50, int: true, ajuda: 'Original: 10.' },
      { k: 'chefeNome', rotulo: 'Nome do chefe', tipo: 'texto', max: 30, ajuda: 'Original: Mew.' },
      { k: 'chefeDex', rotulo: 'Espécie do chefe (nº)', tipo: 'num', min: 1, max: 2000, int: true, ajuda: 'Original: 151.' },
      { k: 'chefeGlb', rotulo: 'Modelo do chefe', tipo: 'texto', max: 30, validar: s => /^pm\d{4}(_\d{2})?$/.test(s) ? null : 'ex.: pm0151_00', ajuda: 'cenario/mon/<modelo>.glb. Original: pm0151_00.' },
      { k: 'chefeNivel', rotulo: 'Nível do chefe', tipo: 'num', min: 1, max: 100, int: true, ajuda: 'Original: 70.' },
      { k: 'chefeHp', rotulo: 'Vida do chefe', tipo: 'num', min: 0, max: 10000000, int: true, ajuda: '0 = automática (pelo nº de jogadores). /raid hp N muda só naquela raid.' },
      { k: 'chefeDano', rotulo: 'Dano do chefe (×)', tipo: 'num', min: 0, max: 10, ajuda: '1 = normal. /raid dano F muda só naquela raid.' },
      { k: 'taxaShiny', rotulo: 'Shiny do prêmio (1 em N)', tipo: 'num', min: 1, max: 1000000, int: true, ajuda: '/raid shiny N muda só naquela raid.' },
      { k: 'premio', rotulo: 'Prêmio', tipo: 'opcao', opcoes: [{ v: 'mew', rotulo: 'O chefe (entra no time)' }, { v: 'sem-mew', rotulo: 'Só itens (sem o chefe)' }] },
      { k: 'altura', rotulo: 'Altura do chefe na arena (m)', tipo: 'num', min: 0.5, max: 20, ajuda: 'Original: 2,5.' },
      { k: 'flutua', rotulo: 'Quanto o chefe flutua (m)', tipo: 'num', min: 0, max: 10, ajuda: 'Original: 1.' },
    ],
  },
};
