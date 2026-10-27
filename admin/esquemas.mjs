/* Esquemas do editor de dados do painel admin (Fase 0).
 * O MESMO arquivo é usado pelo navegador (monta tabela e formulário) e pelo servidor (valida e decide quais arquivos de
 * public/data a rota /admin/dados aceita — só os que estão aqui).
 *
 * Esquema:  { titulo, descricao, arquivo, caminho?, forma, id?, recarga?, campos }
 *   arquivo  = nome em public/data, sem .json
 *   caminho  = subchave dentro do arquivo (ex.: 'itens' em menus_dados.json); sem caminho = o arquivo inteiro
 *   forma    = 'objeto' (o arquivo é UM registro, ex.: config) · 'mapa' ({ id: registro }) · 'lista' ([registro, …])
 *   id       = (lista) campo que identifica o registro — obrigatório e único
 *   recarga  = 'vivo' se o jogo aplica sem recarregar; senão o jogo avisa pra dar F5
 * Campo: { k, rotulo, tipo, ajuda?, col? (aparece na tabela), obrigatorio?, ...regras do tipo }
 *   texto(max) · num(min, max, int) · bool · opcao(opcoes: [{v, rotulo}]) · numeros(tam, min, max, int: "20, 26, 32")
 *   linhas (lista de textos, uma por linha) · json (livre; validar(v) → mensagem de erro ou null)
 * Chave que o esquema não conhece PASSA DIRETO: os arquivos têm campos que o painel ainda não edita, e não dá pra perder dado.
 * Fase 2 (conteúdo: insígnias, EXP, iniciais, montarias, golpes, missões, evoluções, espécies, learnset): admin/esquemas_f2.mjs,
 * que acrescenta `tela` (edição numa tela própria) e `colecao` (validação do conteúdo inteiro — ver validarColecao). */
import { ESQUEMAS_F2 } from './esquemas_f2.mjs';
import { ESQUEMAS_F3 } from './esquemas_f3.mjs';   // Fase 3: cores de NPC, falas, diálogos, traduções, músicas, raid

const faixaNivel = v => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'precisa ser um objeto { "área": [mín, máx] }';
  for (const [a, f] of Object.entries(v)) {
    if (!/^\d{1,8}$/.test(a)) return `área inválida: ${a}`;
    if (!Array.isArray(f) || f.length !== 2 || !f.every(n => Number.isInteger(n) && n >= 1 && n <= 100) || f[0] > f[1]) return `área ${a}: use [mín, máx] entre 1 e 100`;
  }
  return null;
};
const listaDeTextos = v => (Array.isArray(v) && v.every(s => typeof s === 'string')) ? null : 'precisa ser uma lista de textos';
// receitas de cor (formato do CANAIS/ROTULOS/PADRAO do personagem.mjs)
const ehObjeto = v => v && typeof v === 'object' && !Array.isArray(v);
const CHAVE_PARTE = /^[a-z][a-z0-9_]{0,23}$/;
const nomesDasPartes = v => {
  if (!ehObjeto(v) || !Object.keys(v).length) return 'precisa ser { "parte": "nome que o jogador vê" }';
  for (const [k, n] of Object.entries(v)) if (!CHAVE_PARTE.test(k) || typeof n !== 'string' || !n.trim() || n.length > 40) return `parte "${k}": chave em minúsculas e nome de até 40 letras`;
  return null;
};
const coresDasPartes = v => {
  if (!ehObjeto(v)) return 'precisa ser { "parte": "#rrggbb" }';
  for (const [k, c] of Object.entries(v)) if (!CHAVE_PARTE.test(k) || !/^#[0-9a-f]{6}$/i.test(c)) return `parte "${k}": use uma cor #rrggbb`;
  return null;
};
const canaisDaMascara = v => {
  if (!ehObjeto(v) || !Object.keys(v).length) return 'precisa ser { "material": { "R": …, "G": …, "B": …, "K": …, "mask": "arquivo.png" } }';
  for (const [mat, c] of Object.entries(v)) {
    if (!ehObjeto(c) || typeof c.mask !== 'string' || !/^[\w .-]{1,80}\.png$/i.test(c.mask)) return `${mat}: falta "mask" (arquivo .png em cenario/npc/mask)`;
    for (const k of ['R', 'G', 'B', 'K']) {
      const x = c[k];
      if (x === undefined || x === null || (typeof x === 'string' && CHAVE_PARTE.test(x))) continue;
      if (!Array.isArray(x) || x.length !== 3 || !x.every(n => typeof n === 'number' && n >= 0 && n <= 1)) return `${mat}.${k}: use a chave de uma parte, [r, g, b] de 0 a 1 ou null`;
    }
  }
  return null;
};
// itens e lojas (menus_dados.json) e treinadores (Fase 1)
const TIPOS_ITEM = { 1: 'Moeda', 2: 'Materiais', 3: 'Itens transportados', 4: 'Máquina Técnica', 5: 'Materiais (2)', 6: 'Pacote', 7: 'Pokébola', 8: 'Fragmento',
  9: 'Recuperação', 10: 'Título', 11: 'Traje', 12: 'Montaria', 13: 'Cupões', 14: 'Equipamento', 15: 'Chamando a Pedra', 16: 'Edifícios do Habitat',
  17: 'Materiais do Habitat', 18: 'Comida do Habitat', 19: 'Sementes do Habitat' };
const precoItem = v => Array.isArray(v) && v.length <= 10 && v.every(p => Array.isArray(p) && p.length === 2 && p.every(n => Number.isInteger(n) && n >= 0 && n < 1e12))
  ? null : 'lista de [moeda, preço] — ex.: [[1, 100]] = 100 Moedas; [[1, 100], [2, 5]] = 100 Moedas ou 5 Cristais';
const timeNpc = v => {
  if (!Array.isArray(v) || v.length < 1 || v.length > 6) return 'de 1 a 6 Pokémon: [{ "dex": 19, "lv": 11, "glb": "pm0019_00" }, …]';
  for (const [i, p] of v.entries()) {
    if (!p || typeof p !== 'object' || !Number.isInteger(p.dex) || p.dex < 1 || p.dex > 2000) return `Pokémon ${i + 1}: "dex" inválido`;
    if (!Number.isInteger(p.lv) || p.lv < 1 || p.lv > 100) return `Pokémon ${i + 1}: "lv" de 1 a 100`;
    if (typeof p.glb !== 'string' || !/^pm\d{4}[\w-]{0,20}$/.test(p.glb)) return `Pokémon ${i + 1}: "glb" do modelo (ex.: pm0019_00)`;
  }
  return null;
};
const insigniaGinasio = v => ehObjeto(v) && Number.isInteger(v.id) && v.id > 0 && v.id < 1e7 && typeof v.nome === 'string' && v.nome.trim() && v.nome.length <= 60
  && (v.icone == null || /^[\w-]{1,60}$/.test(v.icone)) ? null : 'use { "id": 101, "nome": "medalha Cinza", "icone": "dghz_1" }';
/** Registro de receita: toda parte usada nos canais precisa de nome e cor padrão. */
const receitaCompleta = r => {
  for (const [mat, c] of Object.entries(r.texturas || {})) for (const k of ['R', 'G', 'B', 'K'])
    if (typeof c[k] === 'string' && (!r.rotulos?.[c[k]] || !r.padrao?.[c[k]])) return `${mat}.${k} usa a parte "${c[k]}", que precisa estar em Partes e em Cor padrão`;
  return null;
};

export const ESQUEMAS = {
  config_jogo: {
    titulo: 'Configuração do jogo', arquivo: 'config_jogo', forma: 'objeto',
    descricao: 'Números que antes ficavam fixos no código. Campo vazio = usa o padrão do jogo.',
    campos: [
      { k: 'taxaShiny', rotulo: 'Shiny selvagem (1 em N)', tipo: 'num', min: 2, max: 1000000, int: true, ajuda: 'Padrão 4096. Quanto menor, mais shiny.' },
      { k: 'tetoNivel', rotulo: 'Teto de obediência por insígnias', tipo: 'numeros', tam: 9, min: 1, max: 100, int: true, ajuda: 'Nível máximo que obedece com 0, 1, … 8 insígnias. Padrão: 20, 26, 32, 38, 46, 52, 58, 62, 70.' },
      { k: 'desmaio', rotulo: 'Segundos desmaiado', tipo: 'num', min: 1, max: 120, int: true, ajuda: 'Quanto tempo o selvagem fica no chão (janela de captura). Padrão 8.' },
      { k: 'maxBolasNoAr', rotulo: 'Bolas no ar ao mesmo tempo', tipo: 'num', min: 1, max: 20, int: true, ajuda: 'Padrão 4.' },
      { k: 'trocaCd', rotulo: 'Recarga da troca de Pokémon (s)', tipo: 'num', min: 0, max: 120, int: true, ajuda: 'Padrão 6.' },
      { k: 'chefeLv', rotulo: 'Nível do chefe de teste (?chefe)', tipo: 'num', min: 1, max: 100, int: true, ajuda: 'Padrão 70.' },
      { k: 'nivelArea', rotulo: 'Nível dos selvagens por área', tipo: 'json', validar: faixaNivel, ajuda: 'Mais fácil em Habitats por Área (nível de cada área ao lado das espécies). Área fora daqui usa a tabela do código. Ex.: { "1201": [2, 5] }' },
      // as bolas (`bolas`) têm tela própria (esquema `bolas`, abaixo); aqui elas só passam direto
    ],
  },
  itens: {
    titulo: 'Itens', arquivo: 'menus_dados', caminho: 'itens', forma: 'mapa', idValido: /^\d{1,9}$/, idAjuda: 'só números',
    descricao: 'Todos os itens do jogo (nome, descrição, tipo, ícone e preço). As Pokébolas também são itens (tipo Pokébola).',
    previa: '/admin/previa_item.mjs',
    campos: [
      { k: 'n', rotulo: 'Nome', tipo: 'texto', max: 200, col: true, obrigatorio: true },
      { k: 't', rotulo: 'Tipo', tipo: 'opcao', col: true, opcoes: Object.entries(TIPOS_ITEM).map(([v, rotulo]) => ({ v: +v, rotulo })) },
      { k: 'd', rotulo: 'Descrição', tipo: 'texto', max: 3000, area: true },
      { k: 'v', rotulo: 'Valor (moeda, preço)', tipo: 'json', col: true, validar: precoItem, resumo: v => (v || []).map(([m, p]) => p + ' (moeda ' + m + ')').join(' ou '),
        ajuda: 'Valor de referência do item no jogo original: [[moeda, preço]], ex.: [[1, 100]] = 100 Moedas. Vazio = sem valor. O preço de VENDA nas lojas é o da tela Lojas.' },
      { k: 'i', rotulo: 'Ícone', tipo: 'texto', max: 60, validar: s => /^[\w-]{1,60}$/.test(s) ? null : 'nome de arquivo sem extensão', ajuda: 'Arquivo ui/itens/<ícone>.png.' },
      { k: 'q', rotulo: 'Qualidade (raridade)', tipo: 'num', min: 0, max: 10, int: true },
    ],
  },
  lojas: {
    titulo: 'Lojas', arquivo: 'menus_dados', caminho: 'lojas', forma: 'mapa', registroLista: true, usaItens: true, idValido: /^\d{1,9}$/, idAjuda: 'só números',
    descricao: 'O que cada loja vende: item, quantidade por compra, moeda, preço e nível mínimo. O Pokémart do jogo é a loja 2150101.',
    ajudaLista: 'a ordem aqui é a ordem na loja',
    colunas: [
      { rotulo: 'Produtos', valor: l => (l || []).length },
      { rotulo: 'Moedas', valor: (l, ctx) => [...new Set((l || []).map(p => ctx.item(p.moeda)))].join(', ') },
      { rotulo: 'Vende', valor: (l, ctx) => (l || []).slice(0, 3).map(p => ctx.item(p.item)).join(', ') + ((l || []).length > 3 ? '…' : '') },
    ],
    campos: [
      { k: 'item', rotulo: 'Item', tipo: 'num', int: true, min: 1, max: 999999999, item: true, obrigatorio: true },
      { k: 'n', rotulo: 'Qtd', tipo: 'num', int: true, min: 1, max: 9999, padrao: 1, ajuda: 'quantas unidades vêm por compra' },
      { k: 'moeda', rotulo: 'Moeda', tipo: 'num', int: true, min: 1, max: 999999999, item: true, padrao: 1, obrigatorio: true, ajuda: 'o item usado pra pagar (1 = Moeda, 2 = Cristal)' },
      { k: 'preco', rotulo: 'Preço', tipo: 'num', int: true, min: 0, max: 1e9, padrao: 100, obrigatorio: true },
      { k: 'lv', rotulo: 'Nível mín.', tipo: 'num', int: true, min: 1, max: 99999, padrao: 1, ajuda: 'nível do treinador pra liberar (o jogo original usa até 9999)' },
    ],
  },
  treinadores: {
    titulo: 'Treinadores NPC', arquivo: 'treinadores', forma: 'mapa', idValido: /^\d{1,9}$/, idAjuda: 'o cfg do treinador no mapa, só números',
    descricao: 'Os treinadores que desafiam o jogador no mapa: nome, modelo, time, prêmio e falas. O ID é o cfg que aparece na camada de treinadores do mapa.',
    previa: '/admin/previa_treinador.mjs',
    campos: [
      { k: 'nome', rotulo: 'Nome', tipo: 'texto', max: 60, col: true, obrigatorio: true },
      { k: 'glb', rotulo: 'Modelo (NPC)', tipo: 'texto', max: 40, col: true, validar: s => /^[\w-]{1,40}$/.test(s) ? null : 'nome do arquivo, sem .glb', ajuda: 'Arquivo cenario/npc/<modelo>.glb (ex.: NPC1008, fc1041_00).' },
      { k: 'time', rotulo: 'Time', tipo: 'json', col: true, obrigatorio: true, validar: timeNpc, resumo: v => (v || []).map(p => '#' + p.dex + ' Nv' + p.lv).join(', '),
        ajuda: 'Lista de { "dex", "lv", "glb" } (até 6). A prévia mostra os nomes.' },
      { k: 'dinheiro', rotulo: 'Prêmio em dinheiro', tipo: 'num', min: 0, max: 10000000, int: true, col: true },
      { k: 'fala', rotulo: 'Fala antes da batalha', tipo: 'linhas', validar: listaDeTextos },
      { k: 'vitoria', rotulo: 'Fala quando o jogador vence', tipo: 'linhas', validar: listaDeTextos },
      { k: 'derrota', rotulo: 'Fala quando o jogador perde', tipo: 'linhas', validar: listaDeTextos },
    ],
  },
  npcs: {
    titulo: 'NPCs (quem é quem)', arquivo: 'npcs_glb', forma: 'mapa', idValido: /^\d{1,9}$/, idAjuda: 'o cfg do NPC, o mesmo do ponto no mapa',
    descricao: 'Nome, modelo e falas de cada NPC. O cfg liga ao ponto no mapa (Editor de Mapa → Pontos). NPC do mapa sem cadastro aqui não aparece no jogo.',
    previa: '/admin/previa_treinador.mjs',
    campos: [
      { k: 'nome', rotulo: 'Nome', tipo: 'texto', max: 60, col: true },
      { k: 'glb', rotulo: 'Modelo', tipo: 'texto', max: 60, col: true, validar: s => /^(npc|mon|pc)\/[\w-]{1,40}$/.test(s) ? null : 'pasta/arquivo sem .glb (ex.: npc/fc1004_00, mon/pm0122)',
        ajuda: 'cenario/<modelo>.glb — npc/… (pessoas) ou mon/… (Pokémon). Placa não tem modelo.' },
      { k: 'falas', rotulo: 'Falas (uma por linha)', tipo: 'linhas', validar: listaDeTextos },
      { k: 'papel', rotulo: 'Papel', tipo: 'opcao', col: true, opcoes: [{ v: 'cura', rotulo: 'Cura (Centro Pokémon)' }, { v: 'loja', rotulo: 'Loja' }, { v: 'caixa', rotulo: 'Caixa (PC)' }] },
      { k: 'placa', rotulo: 'Placa (ponto invisível com texto)', tipo: 'bool', col: true },
      { k: 'tipo', rotulo: 'Tipo do jogo original', tipo: 'num', int: true, min: 0, max: 99 },
      { k: 'cena', rotulo: 'Cena', tipo: 'num', int: true, min: 1, max: 99999999, ajuda: '1000001 = Kanto' },
    ],
  },
  portas: {
    titulo: 'Portas', arquivo: 'portas', forma: 'mapa', idValido: /^\d{1,9}$/, idAjuda: 'o cfg do ponto da porta no mapa',
    descricao: 'Ponto da camada de NPCs com cfg aqui vira porta: "Porta" leva à "Chegada" de destino (n); "Chegada" é onde o jogador nasce ao entrar. Editar no mapa: Editor de Mapa → Pontos.',
    validar: r => r.t === 6 && r.n === undefined ? 'porta precisa do destino (n; 0 = sem saída)' : null,
    campos: [
      { k: 't', rotulo: 'Tipo', tipo: 'opcao', col: true, obrigatorio: true, opcoes: [{ v: 6, rotulo: 'Porta (leva a…)' }, { v: 7, rotulo: 'Chegada (onde nasce)' }] },
      { k: 'n', rotulo: 'Destino (cfg da chegada)', tipo: 'num', int: true, min: 0, max: 999999999, col: true, ajuda: '0 = porta sem saída (o jogo original tem 17 assim)' },
      { k: 'c', rotulo: 'Cena deste ponto', tipo: 'num', int: true, min: 1, max: 99999999, col: true, ajuda: '1000001 = Kanto; as outras são os mapas numerados' },
      { k: 'a', rotulo: 'Área', tipo: 'num', int: true, min: 0, max: 99999999, col: true },
    ],
  },
  bolas: {
    titulo: 'Bolas', arquivo: 'config_jogo', caminho: 'bolas', forma: 'mapa', idValido: /^\d{1,9}$/, idAjuda: 'o nº do item da bola (tipo Pokébola em Itens)',
    descricao: 'As Pokébolas que o jogador pode usar e a força de captura de cada uma. Só as bolas desta lista aparecem no seletor e podem ser jogadas. O preço é o da tela Lojas.',
    campos: [
      { k: 'nome', rotulo: 'Nome', tipo: 'texto', max: 40, col: true, obrigatorio: true },
      { k: 'taxa', rotulo: 'Multiplicador de captura', tipo: 'num', min: 0.1, max: 1000, col: true, obrigatorio: true,
        ajuda: 'Pokébola 1 · Grande Bola 1,5 · Ultra Bola 2. 255 = pega sempre (Bola Mestra).' },
    ],
  },
  ginasios: {
    titulo: 'Ginásios', arquivo: 'ginasios', forma: 'mapa',
    descricao: 'Líder, time, recompensa e falas de cada ginásio.',
    campos: [
      { k: 'numero', rotulo: 'Nº', tipo: 'num', min: 1, max: 99, int: true, col: true },
      { k: 'nome', rotulo: 'Nome', tipo: 'texto', max: 60, col: true, obrigatorio: true },
      { k: 'lider', rotulo: 'Líder', tipo: 'texto', max: 40, col: true },
      { k: 'cidade', rotulo: 'Cidade', tipo: 'texto', max: 40, col: true },
      { k: 'tipo', rotulo: 'Tipo', tipo: 'texto', max: 20, col: true },
      { k: 'dinheiro', rotulo: 'Dinheiro da vitória', tipo: 'num', min: 0, max: 10000000, int: true },
      { k: 'time', rotulo: 'Time do líder', tipo: 'json', validar: timeNpc, resumo: v => (v || []).map(p => '#' + p.dex + ' Nv' + p.lv).join(', '), ajuda: 'Lista de { "dex", "lv", "glb" } (até 6).' },
      // Fase 2: a insígnia que o ginásio dá (o save guarda o id; o nome e o ícone das insígnias são a tela Insígnias)
      { k: 'insignia', rotulo: 'Insígnia da vitória', tipo: 'json', obrigatorio: true, validar: insigniaGinasio, resumo: v => v?.nome || '',
        ajuda: '{ "id": 101, "nome": "medalha Cinza", "icone": "dghz_1" } — o id é o da tela Insígnias; o jogo conta as insígnias por ele.' },
      { k: 'cfgLider', rotulo: 'NPC do líder (cfg)', tipo: 'num', min: 1, max: 999999999, int: true, obrigatorio: true, ajuda: 'O NPC que vira o líder ⚔ (o jogo acha o ginásio por este número).' },
      { k: 'cfgGuia', rotulo: 'NPC do guia (cfg)', tipo: 'num', min: 1, max: 999999999, int: true },
      { k: 'cena', rotulo: 'Cena do interior', tipo: 'num', min: 1, max: 99999999, int: true },
      { k: 'glb', rotulo: 'Modelo do líder', tipo: 'texto', max: 60, validar: s => /^[\w/-]{1,60}$/.test(s) ? null : 'caminho do modelo, ex.: npc/NPC1004', ajuda: 'Em cenario/, sem .glb (ex.: npc/NPC1004 ou pc/Girl_012).' },
      { k: 'fala', rotulo: 'Fala antes da batalha', tipo: 'linhas', validar: listaDeTextos },
      { k: 'vitoria', rotulo: 'Fala na vitória do jogador', tipo: 'linhas', validar: listaDeTextos },
      { k: 'derrota', rotulo: 'Fala na derrota do jogador', tipo: 'linhas', validar: listaDeTextos },
      { k: 'cooldownMin', rotulo: 'Espera pra revanche (min)', tipo: 'numeros', min: 0, max: 100000, int: true },
      { k: 'resetMoedas', rotulo: 'Moedas pra zerar a espera', tipo: 'num', min: 0, max: 10000000, int: true },
    ],
  },
  mochilas: {
    titulo: 'Mochilas', arquivo: 'mochilas', forma: 'lista', id: 'id',
    descricao: 'Mochilas cosméticas do treinador. A prévia veste a mochila num treinador (arrastar gira) e diz se o modelo existe nesta cópia.',
    previa: '/admin/previa_mochila.mjs',                   // Fase 3
    campos: [
      { k: 'id', rotulo: 'ID', tipo: 'num', min: 1, max: 99999999, int: true, col: true, obrigatorio: true },
      { k: 'nome', rotulo: 'Nome', tipo: 'texto', max: 60, col: true },
      { k: 'glb', rotulo: 'Modelo (glb)', tipo: 'texto', max: 60, col: true, validar: s => /^[\w-]{1,60}$/.test(s) ? null : 'nome do prefab, ex.: Bag001', ajuda: 'Prefab em cenario/pc/<modelo>.glb (ex.: Bag001).' },
      { k: 'qualidade', rotulo: 'Qualidade', tipo: 'num', min: 0, max: 10, int: true, col: true },
      { k: 'sexo', rotulo: 'Quem pode usar', tipo: 'opcao', opcoes: [{ v: 0, rotulo: 'Todos' }, { v: 1, rotulo: 'Menino' }, { v: 2, rotulo: 'Menina' }] },
      { k: 'icone', rotulo: 'Ícone', tipo: 'texto', max: 60 },
      { k: 'glbOk', rotulo: 'Modelo existe', tipo: 'bool' },
    ],
  },
  skins_treinador: {
    titulo: 'Skins de treinador', arquivo: 'skins_treinador', forma: 'lista', id: 'id',
    descricao: 'Conjuntos de roupa do treinador. Clique numa linha pra ver o modelo em 3D (arrastar gira).',
    previa: '/admin/previa_skin.mjs',                      // dados.mjs carrega e mostra o modelo acima do formulário
    campos: [
      { k: 'id', rotulo: 'ID', tipo: 'num', min: 1, max: 99999999, int: true, col: true, obrigatorio: true },
      { k: 'nome', rotulo: 'Nome', tipo: 'texto', max: 60, col: true },
      { k: 'sexo', rotulo: 'Sexo', tipo: 'opcao', opcoes: [{ v: 'menino', rotulo: 'Menino' }, { v: 'menina', rotulo: 'Menina' }], col: true },
      { k: 'prefab', rotulo: 'Prefab', tipo: 'texto', max: 60, col: true, ajuda: 'Modelo em public/cenario/pc/<prefab>.glb.' },
      // as receitas (canais da máscara → partes) vivem no personagem.mjs (CANAIS/ROTULOS); o jogo lê este campo por prefab
      { k: 'tinta', rotulo: 'Cores editáveis', tipo: 'opcao', col: true, opcoes: [
        { v: 'fixo', rotulo: 'Não (visual fixo)' },
        { v: 'heroi', rotulo: 'Sim — Herói: pele, cabelo, boné e camisa, jaqueta e calça, olhos' },
        { v: 'heroina', rotulo: 'Sim — Heroína: pele, cabelo, vestido, chapéu, olhos' },
        { v: 'misty', rotulo: 'Sim — Misty: cabelo e olhos' },
        { v: 'propria', rotulo: 'Sim — receita própria do modelo (Receitas de cor)' },
      ], ajuda: 'O jogador escolhe essas cores na criação do personagem. Cada receita usa uma máscara feita pra UM modelo — a prévia acima diz se ela pega neste. "Receita própria" = a da tela Receitas de cor com o ID do prefab. Vazio = o padrão do código.' },
      { k: 'criacao', rotulo: 'Aparece na criação', tipo: 'bool', col: true,
        ajuda: 'Se a skin aparece pro jogador na tela de criação do personagem (e em Configurações → ✎ Personagem). As 10 de sempre vêm primeiro, as outras na ordem desta lista; passando de 5 por sexo, a tela ganha páginas. Precisa do modelo existir.' },
      { k: 'inicial', rotulo: 'Inicial no jogo original', tipo: 'bool', ajuda: 'Só informativo (vem do jogo original).' },
      { k: 'ok', rotulo: 'Liberada', tipo: 'bool' },
      { k: 'glbOk', rotulo: 'Modelo existe', tipo: 'bool' },
    ],
  },
  receitas_cor: {
    titulo: 'Receitas de cor', arquivo: 'receitas_cor', forma: 'mapa',
    descricao: 'As partes de cada roupa que o jogador pode pintar: o nome que ele vê e a cor padrão. Geradas das máscaras do jogo original (tools/receitas_cor.mjs); o ID é o prefab em minúsculas. A prévia mostra a edição ao vivo.',
    previa: '/admin/previa_skin.mjs',
    validar: receitaCompleta,
    campos: [
      { k: 'modelo', rotulo: 'Modelo (prefab)', tipo: 'texto', max: 60, col: true, obrigatorio: true },
      { k: 'rotulos', rotulo: 'Partes (nome que o jogador vê)', tipo: 'json', col: true, obrigatorio: true, validar: nomesDasPartes, resumo: v => Object.values(v).join(', '),
        ajuda: '{ "chave": "nome" } — a ordem aqui é a ordem na tela de criação, e lá cabem uns 15 caracteres por nome. As chaves cabelo, pele, olhos, roupa e roupa2 ganham a paleta pronta do jogo.' },
      { k: 'padrao', rotulo: 'Cor padrão de cada parte', tipo: 'json', obrigatorio: true, validar: coresDasPartes, ajuda: '{ "chave": "#rrggbb" } — a cor com que a roupa nasce (a de fábrica do jogo original).' },
      { k: 'texturas', rotulo: 'Canais da máscara (avançado)', tipo: 'json', obrigatorio: true, validar: canaisDaMascara,
        ajuda: 'Por material do modelo: R/G/B/K = a chave da parte que o canal pinta, [r, g, b] (0–1) pra cor fixa, ou null (fica como a textura). mask = arquivo em cenario/npc/mask.' },
    ],
  },
  ...ESQUEMAS_F2,
  ...ESQUEMAS_F3,
};

const LIMITE_REGISTROS = 20000, LIMITE_REGISTRO_BYTES = 60000;

export function validarCampo(c, v) {
  const erro = m => ({ ok: false, erro: m });
  switch (c.tipo) {
    case 'texto': { const s = String(v).slice(0, c.max || 200), m = c.validar?.(s); return m ? erro(m) : { ok: true, v: s }; }
    case 'num': {
      const n = Number(v);
      if (!Number.isFinite(n)) return erro('precisa ser um número');
      if (c.int && !Number.isInteger(n)) return erro('precisa ser inteiro');
      if (c.min != null && n < c.min) return erro(`mínimo ${c.min}`);
      if (c.max != null && n > c.max) return erro(`máximo ${c.max}`);
      return { ok: true, v: n };
    }
    case 'bool': return { ok: true, v: v === true || v === 'true' || v === 1 };
    case 'opcao': {
      const o = (c.opcoes || []).find(o => String(o.v) === String(v));
      return o ? { ok: true, v: o.v } : erro('opção inválida');
    }
    case 'numeros': {
      const arr = Array.isArray(v) ? v : String(v).split(/[,;\s]+/).filter(Boolean);
      const nums = arr.map(Number);
      if (nums.some(n => !Number.isFinite(n))) return erro('use números separados por vírgula');
      if (c.tam && nums.length !== c.tam) return erro(`precisa de ${c.tam} números`);
      for (const n of nums) {
        if (c.int && !Number.isInteger(n)) return erro('todos precisam ser inteiros');
        if (c.min != null && n < c.min) return erro(`mínimo ${c.min}`);
        if (c.max != null && n > c.max) return erro(`máximo ${c.max}`);
      }
      return { ok: true, v: nums };
    }
    case 'linhas':
    case 'json': {
      let s; try { s = JSON.stringify(v); } catch { return erro('valor inválido'); }
      if (s === undefined) return erro('valor inválido');
      if (s.length > (c.max || 50000)) return erro('grande demais');
      const val = JSON.parse(s);
      const m = c.validar?.(val);
      return m ? erro(m) : { ok: true, v: val };
    }
    default: return erro('tipo de campo desconhecido');
  }
}

export function validarRegistro(esq, reg) {
  if (!reg || typeof reg !== 'object' || Array.isArray(reg)) return { ok: false, erro: 'registro inválido' };
  const conhecidos = new Set(esq.campos.map(c => c.k)), out = {};
  for (const [k, v] of Object.entries(reg)) if (!conhecidos.has(k) && /^\w{1,40}$/.test(k)) out[k] = v;   // passa direto
  for (const c of esq.campos) {
    const v = reg[c.k];
    if (v === undefined || v === null || v === '') {
      if (c.obrigatorio) return { ok: false, erro: `${c.rotulo || c.k} é obrigatório` };
      continue;                                                                    // vazio = sem o campo (usa o padrão)
    }
    const r = validarCampo(c, v);
    if (!r.ok) return { ok: false, erro: `${c.rotulo || c.k}: ${r.erro}` };
    out[c.k] = r.v;
  }
  if (JSON.stringify(out).length > LIMITE_REGISTRO_BYTES) return { ok: false, erro: 'registro grande demais' };
  const m = esq.validar?.(out);                                                    // regra que cruza campos (ex.: receita de cor)
  if (m) return { ok: false, erro: m };
  return { ok: true, v: out };
}

/** `registroLista` (ex.: uma loja = lista de produtos): cada elemento é validado pelos campos do esquema. */
export function validarLista(esq, lista) {
  if (!Array.isArray(lista)) return { ok: false, erro: 'esperava uma lista' };
  if (lista.length > (esq.maxLista || 2000)) return { ok: false, erro: 'itens demais na lista' };
  const out = [];
  for (let i = 0; i < lista.length; i++) {
    const r = validarRegistro(esq, lista[i]);
    if (!r.ok) return { ok: false, erro: `[item ${i + 1}] ${r.erro}` };
    out.push(r.v);
  }
  return { ok: true, v: out };
}

export function validarColecao(esq, dados) {
  // Fase 2: conteúdo que não é feito de registros (ou regra entre registros) — o esquema valida tudo; `generica` = o caminho normal
  if (esq.colecao) return esq.colecao(dados, { validarCampo, validarRegistro, generica: d => validarColecao({ ...esq, colecao: null }, d) });
  if (esq.forma === 'objeto') return validarRegistro(esq, dados);
  if (esq.forma === 'mapa') {
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return { ok: false, erro: 'esperava um objeto { id: registro }' };
    const ids = Object.keys(dados);
    if (ids.length > LIMITE_REGISTROS) return { ok: false, erro: 'registros demais' };
    const out = {};
    for (const id of ids) {
      if (!(esq.idValido || /^[\w-]{1,40}$/).test(id)) return { ok: false, erro: `id inválido: ${id}` + (esq.idAjuda ? ` (${esq.idAjuda})` : '') };
      const r = esq.registroLista ? validarLista(esq, dados[id]) : validarRegistro(esq, dados[id]);
      if (!r.ok) return { ok: false, erro: `[${id}] ${r.erro}` };
      out[id] = r.v;
    }
    return { ok: true, v: out };
  }
  if (esq.forma === 'lista') {
    if (!Array.isArray(dados)) return { ok: false, erro: 'esperava uma lista' };
    if (dados.length > LIMITE_REGISTROS) return { ok: false, erro: 'registros demais' };
    const out = [], vistos = new Set();
    for (let i = 0; i < dados.length; i++) {
      const r = validarRegistro(esq, dados[i]);
      if (!r.ok) return { ok: false, erro: `[linha ${i + 1}] ${r.erro}` };
      if (esq.id) {
        const id = r.v[esq.id];
        if (id === undefined || vistos.has(String(id))) return { ok: false, erro: `[linha ${i + 1}] ${esq.id} vazio ou repetido` };
        vistos.add(String(id));
      }
      out.push(r.v);
    }
    return { ok: true, v: out };
  }
  return { ok: false, erro: 'forma de esquema desconhecida' };
}
