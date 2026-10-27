/* Esquemas da Fase 2 do painel (conteúdo do jogo): insígnias, curvas de EXP, iniciais, montarias, golpes, missões, evoluções,
 * espécies e learnset. Entram no ESQUEMAS do admin/esquemas.mjs (mesmo formato e mesmas regras — ver o cabeçalho de lá), então o
 * servidor valida por eles e só grava o que está aqui. Dois ganchos a mais:
 *   tela     = a edição é numa tela própria (admin/conteudo.mjs, botão #lado [data-vista=tela]); o "Arquivos de dados" leva pra ela
 *   colecao  = (dados, { validarCampo, validarRegistro, generica }) → { ok, v } | { ok: false, erro } — valida o conteúdo inteiro
 *              quando ele NÃO é feito de registros (mapa de números, pares [golpe, nível], capítulos → missões → passos), ou
 *              quando precisa de uma regra que cruza registros (`generica` = a validação normal do esquema).
 * Fonte de verdade das missões: data/missoes.json (o jogo em missoes.mjs e o servidor em MISSOES). O menus_dados.missoes/passos
 * é o dump do jogo original, que ninguém lê — o painel não edita. */

const ok = v => ({ ok: true, v }), falha = erro => ({ ok: false, erro });
const ehObj = v => v && typeof v === 'object' && !Array.isArray(v);
const inteiro = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const RE_ARQUIVO = /^[\w-]{1,60}$/;
const RE_GLB_MON = /^pm\d{4}_\d\d$/;
const RE_GOLPE = /^[a-z0-9]{1,40}$/;
const RE_DEX = /^\d{1,4}$/;
/** Chaves desconhecidas passam direto (igual ao validarRegistro): o arquivo pode ter campo que o painel ainda não edita. */
const extras = (o, conhecidas) => Object.fromEntries(Object.entries(o).filter(([k]) => !conhecidas.includes(k) && /^\w{1,40}$/.test(k)));

export const TIPOS = { Normal: 'Normal', Fighting: 'Lutador', Flying: 'Voador', Poison: 'Veneno', Ground: 'Terra', Rock: 'Pedra', Bug: 'Inseto',
  Ghost: 'Fantasma', Steel: 'Aço', Fire: 'Fogo', Water: 'Água', Grass: 'Planta', Electric: 'Elétrico', Psychic: 'Psíquico', Ice: 'Gelo',
  Dragon: 'Dragão', Dark: 'Sombrio', Fairy: 'Fada' };
const OPC_TIPOS = Object.entries(TIPOS).map(([v, rotulo]) => ({ v, rotulo }));
export const CURVAS = { slow: 'Lenta', medium: 'Média', fast: 'Rápida', 'medium-slow': 'Média-lenta', 'slow-then-very-fast': 'Errática', 'fast-then-very-slow': 'Flutuante' };

/** Mapa { id: número } (alturas, sexos, tamanhos): cada valor validado por um campo `num`. */
const mapaDeNumeros = (reId, campo, ajudaId) => (d, { validarCampo }) => {
  if (!ehObj(d)) return falha('esperava um objeto { id: número }');
  const out = {};
  for (const [id, v] of Object.entries(d)) {
    if (!reId.test(id)) return falha(`id inválido: ${id}` + (ajudaId ? ` (${ajudaId})` : ''));
    const r = validarCampo(campo, v);
    if (!r.ok) return falha(`[${id}] ${r.erro}`);
    out[id] = r.v;
  }
  return ok(out);
};
const mapaDeTextos = (reId, max) => d => {
  if (!ehObj(d)) return falha('esperava um objeto { id: texto }');
  const out = {};
  for (const [id, v] of Object.entries(d)) {
    if (!reId.test(id)) return falha(`id inválido: ${id}`);
    if (typeof v !== 'string' || v.length > max) return falha(`[${id}] texto de até ${max} letras`);
    out[id] = v;
  }
  return ok(out);
};

// ── Missões: capítulos → missões → passos (os tipos que o missoes.mjs e o servidor conhecem) ──────────────────────────────
export const TIPOS_PASSO = {
  falar:    'Falar com um NPC',
  ir:       'Ir até uma área',
  inicial:  'Escolher o inicial',
  capturar: 'Capturar Pokémon',
  derrotar: 'Derrotar (selvagens ou treinador)',
  nivel:    'Ter um Pokémon no nível',
  curar:    'Curar o time (Enfermeira Joy)',
  insignia: 'Ter N insígnias',
  entregar: 'Entregar item a um NPC',
  item:     'Ter um item na mochila',
};
const listaInt = (v, min, max, tam = 50) => Array.isArray(v) && v.length >= 1 && v.length <= tam && v.every(n => inteiro(n, min, max));
const falas = v => Array.isArray(v) && v.length <= 12 && v.every(s => typeof s === 'string' && s.length <= 400);
function validarPasso(p) {
  if (!ehObj(p)) return 'passo inválido';
  if (!TIPOS_PASSO[p.tipo]) return `tipo de passo desconhecido: ${p.tipo}`;
  if (typeof p.texto !== 'string' || !p.texto.trim() || p.texto.length > 200) return 'falta o texto do passo (até 200 letras) — é o que o jogador lê no rastreador';
  if (p.onde != null && (typeof p.onde !== 'string' || p.onde.length > 120)) return '"onde": texto de até 120 letras';
  if (p.fala != null && !falas(p.fala)) return '"fala": até 12 linhas de texto';
  const cfg = v => v == null || inteiro(v, 1, 999999999) || listaInt(v, 1, 999999999, 20);
  if (!cfg(p.cfg)) return '"cfg": o número do NPC (ou uma lista)';
  if (p.cfgs != null && !listaInt(p.cfgs, 1, 999999999, 20)) return '"cfgs": lista de números de NPC';
  if (p.n != null && !inteiro(p.n, 1, 9999)) return '"n": quantidade de 1 a 9999';
  if (p.area != null && !inteiro(p.area, 1, 99999999)) return '"area": o número da área';
  if (p.dex != null && !listaInt(p.dex, 1, 2000, 200)) return '"dex": lista de números da Pokédex';
  if (p.item != null && !inteiro(p.item, 1, 999999999)) return '"item": o número do item';
  if (p.cena != null && !inteiro(p.cena, 1, 99999999)) return '"cena": o número da cena';
  for (const k of ['selvagem', 'treinador']) if (p[k] != null && typeof p[k] !== 'boolean') return `"${k}": sim ou não`;
  switch (p.tipo) {
    case 'falar': if (p.cfg == null && p.cfgs == null) return 'falar: diga com qual NPC (cfg)'; break;
    case 'entregar': if (p.cfg == null || p.item == null) return 'entregar: precisa do NPC (cfg) e do item'; break;
    case 'item': if (p.item == null) return 'item: diga qual item'; break;
    case 'ir': if (p.area == null) return 'ir: diga qual área'; break;
    case 'nivel': if (!inteiro(p.lv, 1, 100)) return 'nível: "lv" de 1 a 100'; break;
    case 'insignia': if (!inteiro(p.n, 1, 99)) return 'insígnia: "n" de 1 a 99'; break;
  }
  return null;
}
function validarRecompensa(r) {
  if (!ehObj(r)) return 'recompensa inválida';
  for (const k of ['dinheiro', 'exp']) if (r[k] != null && !inteiro(r[k], 0, 1e9)) return `recompensa: "${k}" inteiro de 0 a 1 bilhão`;
  for (const k of ['itens', 'bolas']) if (r[k] != null) {
    if (!ehObj(r[k]) || Object.keys(r[k]).length > 50) return `recompensa: "${k}" = { "id do item": quantidade }`;
    for (const [id, n] of Object.entries(r[k])) if (!/^\d{1,9}$/.test(id) || !inteiro(n, 1, 999999)) return `recompensa ${k}: item ${id} × ${n} inválido`;
  }
  return null;
}
function validarCapitulos(d) {
  if (!Array.isArray(d)) return falha('esperava a lista de capítulos');
  if (d.length > 200) return falha('capítulos demais');
  const caps = new Set(), mis = new Set(), out = [];
  for (const [ci, c] of d.entries()) {
    const onde = `[capítulo ${ci + 1}]`;
    if (!ehObj(c)) return falha(onde + ' inválido');
    if (!inteiro(c.id, 1, 99999) || caps.has(c.id)) return falha(onde + ' "id" vazio ou repetido');
    caps.add(c.id);
    if (typeof c.nome !== 'string' || !c.nome.trim() || c.nome.length > 80) return falha(onde + ' falta o nome (até 80 letras)');
    if (!Array.isArray(c.missoes) || c.missoes.length > 200) return falha(onde + ' "missoes" precisa ser uma lista');
    const missoes = [];
    for (const [mi, m] of c.missoes.entries()) {
      const om = `${onde} [missão ${mi + 1}]`;
      if (!ehObj(m)) return falha(om + ' inválida');
      if (!inteiro(m.id, 1, 999999999) || mis.has(m.id)) return falha(om + ' "id" vazio ou repetido (o id é único no jogo inteiro: o save guarda ele)');
      mis.add(m.id);
      if (typeof m.nome !== 'string' || !m.nome.trim() || m.nome.length > 100) return falha(om + ' falta o nome (até 100 letras)');
      if (m.des != null && (typeof m.des !== 'string' || m.des.length > 400)) return falha(om + ' descrição de até 400 letras');
      if (!Array.isArray(m.passos) || !m.passos.length || m.passos.length > 40) return falha(om + ' precisa de 1 a 40 passos');
      const passos = [];
      for (const [pi, p] of m.passos.entries()) {
        const e = validarPasso(p);
        if (e) return falha(`${om} [passo ${pi + 1}] ${e}`);
        passos.push(JSON.parse(JSON.stringify(p)));
      }
      if (m.recompensa != null) { const e = validarRecompensa(m.recompensa); if (e) return falha(om + ' ' + e); }
      missoes.push({ ...extras(m, ['id', 'nome', 'des', 'passos', 'recompensa']), id: m.id, nome: m.nome, ...(m.des != null ? { des: m.des } : {}), passos,
        ...(m.recompensa != null ? { recompensa: JSON.parse(JSON.stringify(m.recompensa)) } : {}) });
    }
    out.push({ ...extras(c, ['id', 'nome', 'missoes']), id: c.id, nome: c.nome, missoes });
  }
  if (JSON.stringify(out).length > 3e6) return falha('missões grandes demais');
  return ok(out);
}

// ── Learnset: { dex: [[golpe, nível], …] } ───────────────────────────────────────────────────────────────────────────────
function validarLearnset(d) {
  if (!ehObj(d)) return falha('esperava { "nº da dex": [["golpe", nível], …] }');
  const out = {};
  for (const [dex, l] of Object.entries(d)) {
    if (!RE_DEX.test(dex)) return falha(`nº da dex inválido: ${dex}`);
    if (!Array.isArray(l) || l.length > 120) return falha(`[${dex}] precisa ser uma lista (até 120 golpes)`);
    for (const [i, par] of l.entries())
      if (!Array.isArray(par) || par.length !== 2 || typeof par[0] !== 'string' || !RE_GOLPE.test(par[0]) || !inteiro(par[1], 1, 120))
        return falha(`[${dex}] golpe ${i + 1}: use ["id do golpe", nível de 1 a 120]`);
    out[dex] = l.map(([g, n]) => [g, n]).sort((a, b) => a[1] - b[1]);   // o jogo pega "os últimos 4 até o nível": a ordem é por nível
  }
  return ok(out);
}

const regraEvolucao = r => {
  if (r.gatilho === 'item' && !r.item && !r.itemNome) return 'usar item: diga qual item (ou só o nome, se ainda não existe no jogo)';
  if (r.item === 0 && !r.itemNome) return 'item que ainda não existe (0): escreva o nome dele, é o que o jogador lê';
  if (r.segurando === 0 && !r.segurandoNome) return 'item segurado que ainda não existe (0): escreva o nome dele';
  if (r.golpe != null && !r.golpeNome) return 'conhecer golpe: preencha também o nome do golpe (é o que o jogador lê)';
  return null;
};

export const ESQUEMAS_F2 = {
  insignias: {
    titulo: 'Insígnias', arquivo: 'menus_dados', caminho: 'insignias', forma: 'lista', id: 'id',
    descricao: 'Nome e ícone de cada insígnia. O jogo mostra as da geração 1 (Kanto) no Treinador; a que cada ginásio dá fica na tela Ginásios.',
    previa: '/admin/previa_insignia.mjs',
    campos: [
      { k: 'id', rotulo: 'ID', tipo: 'num', int: true, min: 1, max: 9999999, col: true, obrigatorio: true, ajuda: 'O save do jogador guarda este número: não troque o de uma insígnia que já existe.' },
      { k: 'n', rotulo: 'Nome', tipo: 'texto', max: 60, col: true, obrigatorio: true },
      { k: 'i', rotulo: 'Ícone', tipo: 'texto', max: 60, col: true, validar: s => RE_ARQUIVO.test(s) ? null : 'nome do arquivo, sem .png', ajuda: 'Arquivo ui/icones/<ícone>.png (as de Kanto são dghz_1 … dghz_8).' },
      { k: 'gen', rotulo: 'Geração (região)', tipo: 'num', int: true, min: 1, max: 9, col: true, obrigatorio: true, ajuda: '1 = Kanto (a única que o jogo mostra por enquanto).' },
    ],
  },
  exp_curvas: {
    titulo: 'Curvas de EXP', arquivo: 'exp', caminho: 'curvas', forma: 'objeto',
    descricao: 'EXP total pra chegar em cada nível, nas 6 curvas oficiais. Cada espécie usa uma delas (tela Espécies → EXP).',
    validar: r => {
      for (const [k, c] of Object.entries(r)) {
        if (!CURVAS[k]) continue;
        if (c[0] !== 0 || c[1] !== 0) return `${CURVAS[k]}: os dois primeiros números (índice 0 e Lv 1) são 0`;
        for (let i = 2; i < c.length; i++) if (c[i] < c[i - 1]) return `${CURVAS[k]}: Lv ${i} (${c[i]}) é menor que o Lv ${i - 1} (${c[i - 1]}) — a EXP só cresce`;
      }
      return null;
    },
    campos: Object.entries(CURVAS).map(([k, nome]) => ({ k, rotulo: `${nome} (${k})`, tipo: 'numeros', tam: 101, int: true, min: 0, max: 100000000, obrigatorio: true,
      ajuda: '101 números separados por vírgula: índice 0, Lv 1 … Lv 100 (EXP total no começo do nível).' })),
  },
  iniciais: {
    titulo: 'Iniciais', arquivo: 'iniciais', forma: 'lista', id: 'dex',
    descricao: 'Os Pokémon que o laboratório do Oak oferece, por geração. O jogo mostra estes e o servidor só aceita a escolha de um deles.',
    colecao: (d, { generica }) => {
      const r = generica(d); if (!r.ok) return r;
      if (!r.v.some(x => x.gen === 1)) return falha('precisa de pelo menos um inicial da geração 1 (a mesa do Oak e o pop-up da Amanda usam a geração 1)');
      return r;
    },
    campos: [
      { k: 'gen', rotulo: 'Geração', tipo: 'num', int: true, min: 1, max: 9, col: true, obrigatorio: true, ajuda: 'Uma aba por geração na escolha do inicial; a 1 é a da mesa do Oak.' },
      { k: 'dex', rotulo: 'Nº (dex)', tipo: 'num', int: true, min: 1, max: 2000, col: true, obrigatorio: true },
      { k: 'nome', rotulo: 'Nome', tipo: 'texto', max: 40, col: true, obrigatorio: true },
      { k: 'glb', rotulo: 'Modelo', tipo: 'texto', max: 20, col: true, obrigatorio: true, validar: s => RE_GLB_MON.test(s) ? null : 'modelo do Pokémon, ex.: pm0001_00', ajuda: 'Arquivo cenario/mon/<modelo>.glb.' },
      { k: 'tipos', rotulo: 'Tipos', tipo: 'linhas', obrigatorio: true, resumo: v => (v || []).map(t => TIPOS[t] || t).join(' / '),
        validar: v => v.length >= 1 && v.length <= 2 && v.every(t => TIPOS[t]) ? null : 'um ou dois, um por linha, em inglês: ' + Object.keys(TIPOS).join(', ') },
    ],
  },
  montarias: {
    titulo: 'Montarias', arquivo: 'montarias', forma: 'lista', id: 'glb',
    descricao: 'Os Pokémon que dá pra montar (tecla M e atalhos 5–9): pose do treinador, tamanho, velocidade e por onde andam.',
    campos: [
      { k: 'glb', rotulo: 'Modelo', tipo: 'texto', max: 20, col: true, obrigatorio: true, validar: s => RE_GLB_MON.test(s) ? null : 'modelo do Pokémon, ex.: pm0249_00' },
      { k: 'nome', rotulo: 'Nome', tipo: 'texto', max: 40, col: true, obrigatorio: true },
      { k: 'livre', rotulo: 'Liberada pra todos', tipo: 'bool', col: true, ajuda: 'Desmarcada = só a staff monta (até a loja de montarias existir). Jogo sem conta monta todas.' },
      { k: 'meio', rotulo: 'Anda por', tipo: 'opcao', col: true, obrigatorio: true, opcoes: [{ v: 'terra', rotulo: 'Terra' }, { v: 'agua', rotulo: 'Água (entra pela beira)' }, { v: 'anfibia', rotulo: 'Terra e água' }] },
      { k: 'voa', rotulo: 'Voa', tipo: 'bool', col: true, ajuda: 'Sobe e passa por cima de tudo (cruza água pelo ar).' },
      { k: 'escala', rotulo: 'Tamanho montada (×)', tipo: 'num', min: 0.1, max: 5, col: true, obrigatorio: true, ajuda: 'Fator do modelo com o treinador em cima (Lugia 0,6).' },
      { k: 'vel', rotulo: 'Velocidade', tipo: 'num', int: true, min: 1000, max: 200000, col: true, obrigatorio: true, ajuda: 'Em 1/10000 da velocidade a pé: 25000 = 2,5× (Charizard), 37500 = 3,75× (Lugia).' },
      { k: 'poseIdle', rotulo: 'Pose do treinador parado', tipo: 'opcao', obrigatorio: true, opcoes: ['RideIdle', 'RideIdle1', 'RideIdle2', 'RideIdle3', 'RideIdle4', 'RideIdle5'].map(v => ({ v })) },
      { k: 'poseRun', rotulo: 'Pose do treinador andando', tipo: 'opcao', obrigatorio: true, opcoes: ['Ride', 'Ride1', 'Ride2', 'Ride3', 'Ride4', 'Ride5'].map(v => ({ v })) },
    ],
  },
  golpes: {
    titulo: 'Golpes', arquivo: 'golpes', forma: 'mapa', idValido: RE_GOLPE, idAjuda: 'minúsculas e números, ex.: thunderbolt',
    descricao: 'Os golpes com efeito 3D: poder, tipo, PP, alcance, recarga e o efeito/som/animação. O learnset (quem aprende o quê) é a tela Learnset.',
    campos: [
      { k: 'nome', rotulo: 'Nome (inglês)', tipo: 'texto', max: 40, col: true, obrigatorio: true },
      { k: 'nomePt', rotulo: 'Nome em português', tipo: 'texto', max: 60, col: true },
      { k: 'tipo', rotulo: 'Tipo', tipo: 'opcao', col: true, obrigatorio: true, opcoes: OPC_TIPOS },
      { k: 'cat', rotulo: 'Categoria', tipo: 'opcao', col: true, obrigatorio: true, opcoes: [{ v: 'fisico', rotulo: 'Físico' }, { v: 'especial', rotulo: 'Especial' }, { v: 'status', rotulo: 'Status' }] },
      { k: 'poder', rotulo: 'Poder', tipo: 'num', int: true, min: 0, max: 300, col: true, obrigatorio: true },
      { k: 'pp', rotulo: 'PP', tipo: 'num', int: true, min: 1, max: 99, col: true, ajuda: 'Vazio = o do learnset.json antigo (ou 20).' },
      { k: 'precisao', rotulo: 'Precisão (%)', tipo: 'num', int: true, min: 0, max: 100 },
      { k: 'alcance', rotulo: 'Alcance (m)', tipo: 'num', min: 0, max: 40, obrigatorio: true, ajuda: '1,3 = corpo a corpo; 6–8 = à distância; 0 = em si mesmo.' },
      { k: 'recarga', rotulo: 'Recarga (s)', tipo: 'num', min: 0, max: 60, obrigatorio: true },
      { k: 'atraso', rotulo: 'Atraso até acertar (s)', tipo: 'num', min: 0, max: 5, obrigatorio: true, ajuda: 'Tempo da animação até o golpe pegar (o voo do projétil soma por cima).' },
      { k: 'prioridade', rotulo: 'Prioridade', tipo: 'num', int: true, min: -7, max: 7 },
      { k: 'efeito', rotulo: 'Efeito 3D (id)', tipo: 'texto', max: 8, obrigatorio: true, validar: s => /^\d{5}$/.test(s) ? null : '5 dígitos, ex.: 00085', ajuda: 'O prefab do efeito do jogo original (00085_Hit…).' },
      { k: 'anim', rotulo: 'Animação do Pokémon', tipo: 'opcao', obrigatorio: true, opcoes: [{ v: 'Attack', rotulo: 'Attack (golpe)' }, { v: 'Cast', rotulo: 'Cast (lançar)' }, { v: 'Buff', rotulo: 'Buff (em si)' }] },
      { k: 'som', rotulo: 'Som do golpe', tipo: 'texto', max: 40, validar: s => /^[\w .-]{1,40}$/.test(s) ? null : 'nome do som' },
      { k: 'somAcerto', rotulo: 'Som do acerto', tipo: 'texto', max: 40, validar: s => /^[\w .-]{1,40}$/.test(s) ? null : 'nome do som' },
      { k: 'contato', rotulo: 'Contato (investida corpo a corpo)', tipo: 'bool' },
      { k: 'inicio', rotulo: 'Fase de início no atacante (Start)', tipo: 'bool' },
      { k: 'voo', rotulo: 'Projétil que voa até o alvo (Fly)', tipo: 'bool' },
      { k: 'ataque', rotulo: 'Fase de ataque no atacante (Atk)', tipo: 'bool' },
      { k: 'proprio', rotulo: 'Usa em si mesmo', tipo: 'bool' },
      { k: 'acerto', rotulo: 'Tem efeito de acerto (Hit)', tipo: 'bool' },
      { k: 'descricao', rotulo: 'Descrição', tipo: 'texto', max: 400, area: true },
    ],
  },
  learnset: {
    titulo: 'Learnset', arquivo: 'learnset', caminho: 'learnset', forma: 'mapa', tela: 'learnset', naLista: true,
    descricao: 'Que golpes cada espécie aprende e em que nível (tela própria).',
    colecao: validarLearnset,
    campos: [],
  },
  missoes: {
    titulo: 'Missões', arquivo: 'missoes', caminho: 'capitulos', forma: 'lista', tela: 'missoes', naLista: true,
    descricao: 'Capítulos, missões, passos e recompensas da história (tela própria).',
    colecao: validarCapitulos,
    campos: [],
  },
  evolucoes: {
    titulo: 'Evoluções', arquivo: 'evolucoes', caminho: 'por', forma: 'mapa', registroLista: true, tela: 'evolucoes', naLista: true, idValido: RE_DEX, idAjuda: 'o nº da dex',
    descricao: 'Como cada espécie evolui (tela própria).',
    validar: regraEvolucao,
    campos: [
      { k: 'para', rotulo: 'Evolui para (nº)', tipo: 'num', int: true, min: 1, max: 2000, obrigatorio: true },
      { k: 'nome', rotulo: 'Nome da evolução', tipo: 'texto', max: 40, obrigatorio: true },
      { k: 'gatilho', rotulo: 'Como', tipo: 'opcao', obrigatorio: true, opcoes: [
        { v: 'nivel', rotulo: 'Subir de nível' }, { v: 'item', rotulo: 'Usar um item (pedra)' }, { v: 'troca', rotulo: 'Troca (ou usar o item)' },
        { v: 'muda', rotulo: 'Junto com outra evolução (Shedinja)' }, { v: 'outro', rotulo: 'Especial (não dá por aqui)' }] },
      { k: 'texto', rotulo: 'Texto pro jogador', tipo: 'texto', max: 160, obrigatorio: true, ajuda: 'O que a ficha mostra, ex.: "Lv 16" ou "usar Pedra da Água".' },
      { k: 'nivel', rotulo: 'Nível mínimo', tipo: 'num', int: true, min: 1, max: 100 },
      { k: 'amizade', rotulo: 'Amizade mínima', tipo: 'num', int: true, min: 0, max: 255, ajuda: '160 = amizade alta (padrão dos jogos).' },
      { k: 'horario', rotulo: 'Horário', tipo: 'opcao', opcoes: [{ v: 'dia', rotulo: 'Só de dia (6h–17h59)' }, { v: 'noite', rotulo: 'Só à noite' }] },
      { k: 'item', rotulo: 'Item usado', tipo: 'num', int: true, min: 0, max: 999999999, item: true, ajuda: 'Pedra, cabo ou item da troca. 0 = ainda não existe no jogo (aí o jogador lê o nome abaixo).' },
      { k: 'itemNome', rotulo: 'Nome do item usado', tipo: 'texto', max: 60 },
      { k: 'segurando', rotulo: 'Segurando o item', tipo: 'num', int: true, min: 0, max: 999999999, item: true, ajuda: '0 = ainda não existe no jogo.' },
      { k: 'segurandoNome', rotulo: 'Nome do item segurado', tipo: 'texto', max: 60 },
      { k: 'golpe', rotulo: 'Conhecendo o golpe (id)', tipo: 'num', int: true, min: 1, max: 99999, ajuda: 'O id do golpe na Pokédex (dex_extra), ex.: 10246 = Ancient Power.' },
      { k: 'golpeNome', rotulo: 'Nome do golpe', tipo: 'texto', max: 60 },
      { k: 'tipoGolpe', rotulo: 'Conhecendo um golpe do tipo', tipo: 'opcao', opcoes: OPC_TIPOS },
      { k: 'noTime', rotulo: 'Com este Pokémon no time (nº)', tipo: 'num', int: true, min: 1, max: 2000 },
      { k: 'tipoNoTime', rotulo: 'Com um Pokémon deste tipo no time', tipo: 'opcao', opcoes: OPC_TIPOS },
      { k: 'genero', rotulo: 'Só um sexo', tipo: 'opcao', opcoes: [{ v: 'm', rotulo: '♂ macho' }, { v: 'f', rotulo: '♀ fêmea' }], ajuda: 'Informativo: o jogo ainda não confere.' },
      { k: 'stats', rotulo: 'Atk × Def (Tyrogue)', tipo: 'opcao', opcoes: [{ v: 1, rotulo: 'Atk > Def' }, { v: 0, rotulo: 'Atk = Def' }, { v: -1, rotulo: 'Atk < Def' }], ajuda: 'Informativo: o jogo ainda não confere.' },
      { k: 'extra', rotulo: 'Regra especial (texto livre)', tipo: 'texto', max: 60 },
    ],
  },
  evolucoes_itens: {
    titulo: 'Itens de evolução', arquivo: 'evolucoes', caminho: 'itens', forma: 'mapa', tela: 'evolucoes', idValido: /^\d{1,9}$/, idAjuda: 'o id do item',
    descricao: 'Os itens que o jogo deixa usar num Pokémon pra evoluir (a tela Evoluções mantém esta lista sozinha).',
    campos: [
      { k: 'id', rotulo: 'ID', tipo: 'num', int: true, min: 1, max: 999999999, obrigatorio: true },
      { k: 'n', rotulo: 'Nome', tipo: 'texto', max: 200, obrigatorio: true },
      { k: 'd', rotulo: 'Descrição', tipo: 'texto', max: 3000 },
      { k: 't', rotulo: 'Tipo', tipo: 'num', int: true, min: 0, max: 99 },
      { k: 'i', rotulo: 'Ícone', tipo: 'texto', max: 60 },
      { k: 'q', rotulo: 'Qualidade', tipo: 'num', int: true, min: 0, max: 10 },
    ],
  },
  // ── Espécies (tela própria: admin/conteudo.mjs junta tudo por nº da dex e grava em cada arquivo o que mudou) ─────────────
  especies: {
    titulo: 'Espécies', arquivo: 'especies', forma: 'mapa', tela: 'especies', naLista: true, idValido: RE_DEX, idAjuda: 'o nº da dex',
    descricao: 'Nome dos modelos, tamanho, altura, sexo, descrição e EXP de cada espécie (tela própria). Este arquivo guarda os ajustes que não existem nos dados gerados do jogo original (hoje: o tamanho no campo).',
    campos: [
      { k: 'escala', rotulo: 'Ajuste de tamanho no campo (×)', tipo: 'num', min: 0.1, max: 5, ajuda: 'Multiplica o tamanho que sai da altura (régua proporcional, o modo padrão). 1 = sem ajuste.' },
    ],
  },
  alturas: {
    titulo: 'Alturas', arquivo: 'alturas', forma: 'mapa', tela: 'especies', descricao: 'Altura real de cada espécie (m).',
    colecao: mapaDeNumeros(RE_DEX, { tipo: 'num', min: 0.01, max: 200 }, 'o nº da dex'), campos: [],
  },
  sexos: {
    titulo: 'Sexo', arquivo: 'sexos', forma: 'mapa', tela: 'especies', descricao: '% de machos de cada espécie (-1 = sem gênero).',
    colecao: mapaDeNumeros(RE_DEX, { tipo: 'num', min: -1, max: 100 }, 'o nº da dex'), campos: [],
  },
  tamanhos: {
    titulo: 'Tamanhos (modo jogo)', arquivo: 'tamanhos', forma: 'mapa', tela: 'especies', descricao: 'MapSize do jogo original por modelo (só no modo de tamanho "jogo").',
    colecao: mapaDeNumeros(/^pm\d{4}(_\d\d){0,2}$/, { tipo: 'num', min: 0.01, max: 50 }, 'pm0025 ou pm0025_61'), campos: [],
  },
  descricoes_pt: {
    titulo: 'Descrições da Pokédex (pt)', arquivo: 'idioma/dex_pt', forma: 'mapa', tela: 'especies', descricao: 'O texto da ficha da Pokédex em português.',
    colecao: mapaDeTextos(/^\d{1,5}$/, 6000), campos: [],
  },
  dex_extra: {
    titulo: 'Pokédex (dados extras)', arquivo: 'dex_extra', caminho: 'especies', forma: 'mapa', tela: 'especies', idValido: RE_DEX,
    descricao: 'Ficha extra da Pokédex (gênero e altura mostrados, golpes por nível da ficha…).',
    campos: [
      { k: 'm', rotulo: '% machos', tipo: 'num', min: -1, max: 100 },
      { k: 'f', rotulo: '% fêmeas', tipo: 'num', min: -1, max: 100 },
      { k: 'a', rotulo: 'Altura (m)', tipo: 'num', min: 0.01, max: 200 },
    ],
  },
  elenco: {
    titulo: 'Elenco (modelos)', arquivo: 'elenco', forma: 'lista', id: 'glb', tela: 'especies',
    descricao: 'Cada modelo 3D de Pokémon que o jogo tem (formas, megas, gigantamax).',
    campos: [
      { k: 'n', rotulo: 'Nº (dex)', tipo: 'num', int: true, min: 1, max: 2000, obrigatorio: true },
      { k: 'nome', rotulo: 'Nome', tipo: 'texto', max: 40, obrigatorio: true },
      { k: 'glb', rotulo: 'Modelo', tipo: 'texto', max: 30, obrigatorio: true, validar: s => /^pm\d{4}[\w-]{0,20}$/.test(s) ? null : 'ex.: pm0025_00' },
      { k: 'nota', rotulo: 'Forma', tipo: 'texto', max: 40 },
      { k: 'altura', rotulo: 'Altura do modelo (m)', tipo: 'num', min: 0, max: 200 },
    ],
  },
  exp_especies: {
    titulo: 'EXP por espécie', arquivo: 'exp', caminho: 'especies', forma: 'mapa', tela: 'especies', idValido: RE_DEX,
    descricao: 'Curva de EXP, EXP base (quanto dá ao ser derrotado) e amizade base de cada espécie.',
    campos: [
      { k: 'c', rotulo: 'Curva de EXP', tipo: 'opcao', obrigatorio: true, opcoes: Object.entries(CURVAS).map(([v, rotulo]) => ({ v, rotulo })) },
      { k: 'b', rotulo: 'EXP base', tipo: 'num', int: true, min: 1, max: 1000, obrigatorio: true },
      { k: 'a', rotulo: 'Amizade base', tipo: 'num', int: true, min: 0, max: 255, obrigatorio: true },
    ],
  },
};
