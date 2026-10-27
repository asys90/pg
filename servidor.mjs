/**
 * Servidor de desenvolvimento — Pokemon 3D Base
 * HTTP + WebSocket na porta 5190
 *
 * Uso: node servidor.mjs
 *
 * Persistência em servidor/dados/contas.json (criado automaticamente).
 * Suporta login, cadastro, save/load, multiplayer básico (posições, chat,
 * captura de Pokémon, cura no Centro Pokémon).
 */

import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'node:fs';
import crypto from 'node:crypto';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESQUEMAS, validarColecao } from './admin/esquemas.mjs';   // editor de dados do painel: lista branca + validação (mesmo arquivo do navegador)
import { criarModeracao } from './servidor_moderacao.mjs';           // Fase 3: comandos de GM do chat + moderação do painel (mesmas funções)
import { criarEventos } from './servidor_eventos.mjs';               // Fase 3: eventos ao vivo (EXP/shiny/densidade, aviso global, manutenção)
import { criarRecursos } from './servidor_recursos.mjs';             // Fase 3: listas de faixas/máscaras/modelos pras prévias do painel
import { criarRaid } from './servidor_raid.mjs';                     // raid ao vivo: /raid da staff, fila, ida/volta da arena, o chefe e o prêmio

const __dir = nodePath.dirname(fileURLToPath(import.meta.url));
const DADOS = nodePath.join(__dir, 'servidor/dados');
fs.mkdirSync(DADOS, { recursive: true });

const VERSAO_REDE = 15;   // deve bater com rede.mjs

// ── Missões ──────────────────────────────────────────────────────────────────
const MISSOES = {};       // id → missao
const MISSAO_SEQ = [];    // ids na ordem certa
/* Fase 2: data/missoes.json é a fonte das missões (o painel admin edita); relido quando o arquivo muda (mtime), então salvar no
   painel vale no próximo evento, sem reiniciar. Arquivo quebrado = fica com as missões que já estavam carregadas. */
let missoesMtime = -1;
function carregarMissoes() {
  const arq = nodePath.join(__dir, 'public/data/missoes.json');
  let mt; try { mt = fs.statSync(arq).mtimeMs; } catch { return; }
  if (mt === missoesMtime) return;
  missoesMtime = mt;
  try {
    const md = JSON.parse(fs.readFileSync(arq, 'utf8'));
    for (const k of Object.keys(MISSOES)) delete MISSOES[k];
    MISSAO_SEQ.length = 0;
    for (const cap of md.capitulos || [])
      for (const m of cap.missoes || []) { MISSOES[m.id] = m; MISSAO_SEQ.push(m.id); }
    console.log('Missões carregadas:', MISSAO_SEQ.length);
  } catch(e) { console.warn('Missões não carregadas:', e.message); }
}
carregarMissoes();

function missaoEstadoDe(u) {
  carregarMissoes();
  const s = contas[u]?.save;
  if (!s?.missoes) return { atual: MISSAO_SEQ[0] || null, passo: 0, prog: {}, feitas: [] };
  /* o painel pode ter apagado a missão em que o jogador estava (ou passos dela): segue pra próxima não feita em vez de travar */
  const est = s.missoes;   // …e quem já tinha feito tudo pega a missão nova que o painel acrescentou
  if (est.atual == null || !MISSOES[est.atual]) { const prox = proximaMissao(Array.isArray(est.feitas) ? est.feitas : []); if (prox !== est.atual) { est.atual = prox; est.passo = 0; } }
  else if (est.atual != null && est.passo >= (MISSOES[est.atual].passos?.length || 0)) est.passo = Math.max(0, (MISSOES[est.atual].passos?.length || 1) - 1);
  return est;
}
function salvarMissao(u, est) {
  if (!contas[u]) return;
  if (!contas[u].save) contas[u].save = {};
  contas[u].save.missoes = est;
  contas[u].rev = (contas[u].rev || 0) + 1;
  salvarContas();
}
function cfgOk(alvo, cfg) {
  if (alvo == null || cfg == null) return false;
  if (Array.isArray(alvo)) return alvo.map(String).includes(String(cfg));
  return String(alvo) === String(cfg);
}
function proximaMissao(feitas) {
  for (const id of MISSAO_SEQ) if (!feitas.includes(id)) return id;
  return null;
}
/** Aplica um evento ao estado de missões do usuário; devolve { estado, passoFeito, concluida } ou null. */
function aplicarEvento(u, ev) {
  if (!contas[u]) return null;
  const est = missaoEstadoDe(u);
  if (!est.atual) return null;
  const m = MISSOES[est.atual];
  if (!m) return null;
  const p = m.passos?.[est.passo];
  if (!p) return null;
  const chave = est.atual + ':' + est.passo;

  const concluirPasso = () => {
    est.passo++;
    while (est.passo < m.passos.length && passoJaFeito(u, m.passos[est.passo])) est.passo++;   // o seguinte já está cumprido: não espera um evento que não vem de novo
    if (est.passo >= m.passos.length) {
      est.feitas = [...(est.feitas || []), est.atual];
      const concluida = m;
      est.atual = proximaMissao(est.feitas);
      est.passo = 0;
      salvarMissao(u, est);
      return { estado: est, passoFeito: true, concluida };
    }
    salvarMissao(u, est);
    return { estado: est, passoFeito: true, concluida: null };
  };
  if (passoJaFeito(u, p)) return concluirPasso();                         // conta que já travou num passo cumprido destrava no próximo evento

  switch (p.tipo) {
    case 'falar':
    case 'entregar':
      if (ev.tipo === 'falar' && cfgOk(p.cfgs || p.cfg, ev.cfg)) return concluirPasso();
      break;
    case 'ir':
      if (ev.tipo === 'area' && String(ev.area) === String(p.area)) return concluirPasso();
      break;
    case 'capturar':
      if (ev.tipo === 'captura' && (!p.dex || p.dex.includes(ev.dex))) {
        est.prog[chave] = (est.prog[chave] || 0) + 1;
        if (est.prog[chave] >= (p.n || 1)) return concluirPasso();
        salvarMissao(u, est);
        return { estado: est, passoFeito: false, concluida: null };
      }
      break;
    case 'derrotar':
      if (p.selvagem && ev.tipo === 'selvagem' && (!p.dex || p.dex.includes(ev.dex)) && (!p.area || String(ev.area) === String(p.area))) {
        est.prog[chave] = (est.prog[chave] || 0) + 1;
        if (est.prog[chave] >= (p.n || 1)) return concluirPasso();
        salvarMissao(u, est);
        return { estado: est, passoFeito: false, concluida: null };
      }
      if (!p.selvagem && ev.tipo === 'treinador' && cfgOk(p.cfg, ev.cfg)) return concluirPasso();
      break;
    case 'nivel':
      if (ev.tipo === 'nivel' && ev.lv >= p.lv) return concluirPasso();
      break;
    case 'inicial':
      if (ev.tipo === 'inicial') return concluirPasso();
      break;
    case 'curar':
      if (ev.tipo === 'cura' && (!p.cfg || cfgOk(p.cfg, ev.cfg))) return concluirPasso();
      break;
    case 'insignia':
      if (ev.tipo === 'insignia') return concluirPasso();
      break;
  }
  return null;
}
/* Passo cumprido antes de virar o atual. Ex. (27/10): a 1ª missão travava em "Vá ao laboratório" — o evento de área não
   chegava, a pessoa escolhia o inicial com o passo ainda em 'ir', e o 'inicial' não acontece de novo. */
function passoJaFeito(u, p) {
  const s = contas[u]?.save;
  if (p?.tipo === 'inicial') return !!(s?.inicial || s?.time?.some?.(x => x?.inicial));
  if (p?.tipo === 'nivel') return [...(s?.time || []), ...(s?.caixa || [])].some(x => (+x?.lv || 0) >= (+p.lv || 1));   // o nível já foi alcançado antes
  if (p?.tipo === 'ir') return socketsDe(u).some(w => w._areaId != null && String(w._areaId) === String(p.area));   // já está na área (missao_area)
  return false;
}
function enviarMissao(ws, resultado) {
  if (!resultado) return;
  const { estado, passoFeito, concluida } = resultado;
  enviar(ws, { t: 'missao', estado, passoFeito: passoFeito && !concluida, concluiu: concluida?.id || null, nome: concluida?.nome || null });
}
function recompensaMissao(m) {
  const r = m?.recompensa;
  if (!r) return null;
  const bolsa = {};
  if (r.dinheiro) bolsa.dinheiro = r.dinheiro;
  if (r.itens) bolsa.itens = r.itens;
  if (r.bolas) bolsa.bolas = r.bolas;
  return bolsa;
}

// ── Persistência ────────────────────────────────────────────────────────────
const contasArq = nodePath.join(DADOS, 'contas.json');
let contas = {};
try { contas = JSON.parse(fs.readFileSync(contasArq, 'utf8')); } catch {}

/* Gravação: antes era fs.writeFileSync A CADA mutação (inclusive em cada captura/missão), reescrevendo o contas.json inteiro
   e travando o event loop. Agora `salvarContas()` AGRUPA as gravações de jogo (debounce ~500ms) e `salvarContasJa()` grava na
   hora para o que não pode perder (criar conta, login, senha, apagar). Ao encerrar, descarrega o pendente pra não perder save. */
let _salvarPend = null;
function gravarContasDisco() { try { fs.writeFileSync(contasArq, JSON.stringify(contas, null, 2)); } catch (e) { console.error('Falha ao salvar contas:', e.message); } }
function salvarContasJa() { if (_salvarPend) { clearTimeout(_salvarPend); _salvarPend = null; } gravarContasDisco(); }
function salvarContas() { if (!_salvarPend) _salvarPend = setTimeout(() => { _salvarPend = null; gravarContasDisco(); }, 500); }
process.on('SIGINT', () => { salvarContasJa(); process.exit(0); });
process.on('SIGTERM', () => { salvarContasJa(); process.exit(0); });
process.on('beforeExit', () => salvarContasJa());
// Senha: scrypt com sal aleatório por usuário (guardado como "sal:hash"). conferirSenha aceita o formato antigo (sha256) p/ contas velhas.
function hashSenha(s, salt) { salt = salt || crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(String(s ?? ''), salt, 64).toString('hex'); }
function conferirSenha(s, guardado) {
  if (!guardado) return false;
  if (guardado.includes(':')) { const salt = guardado.slice(0, guardado.indexOf(':')); return guardado === hashSenha(s, salt); }
  return guardado === crypto.createHash('sha256').update(String(s ?? '') + 'pokefable').digest('hex');   // legado (contas antigas)
}
function tokenNovo() { return crypto.randomBytes(32).toString('hex'); }
const rnd = (n) => Math.floor(Math.random() * (n + 1));
/** IVs no formato que o JOGO lê (individuo.mjs): lista de 6 — HP, Atq, Def, AtE, DfE, Vel. Até 27/10 o servidor gravava um
    objeto {hp, atk…}, que o jogo lia como tudo 0 (e[0] não existe): o objeto antigo vira lista. Inválido → null. */
function ivsLista(v) {
  const l = Array.isArray(v) ? v : (v && typeof v === 'object') ? ['hp', 'atk', 'def', 'spa', 'spd', 'vel'].map(k => v[k]) : null;
  return l && l.length === 6 && l.every(n => Number.isInteger(n) && n >= 0 && n <= 31) ? l.slice() : null;
}
const ivsNovos = () => Array.from({ length: 6 }, () => rnd(31));
for (const c of Object.values(contas)) for (const p of [...(c?.save?.time || []), ...(c?.save?.caixa || [])]) {   // contas gravadas com o objeto antigo
  if (p && p.ivs !== undefined && !Array.isArray(p.ivs)) { const l = ivsLista(p.ivs); if (l) p.ivs = l; }
}

/* ── ANTI-TRAPAÇA (26/10) ─────────────────────────────────────────────────────
   REGRA: o cliente NUNCA cria/edita Pokémon, nem mexe em dinheiro/itens/bolas/insígnias.
   Tudo isso é decidido pelo SERVIDOR. Os helpers abaixo filtram o que o cliente manda. */

// As ÚNICAS chaves do save que o cliente pode gravar por `prefs`; o resto é do servidor.
const PREFS_OK = new Set(['bolaSel', 'atalhos', 'seguidor', 'seguidorUid', 'personagem', 'mochila', 'introVista', 'ultimoCentro', 'tempo', 'inicial']);
function aplicarPrefs(c, prefs) {
  if (!prefs || typeof prefs !== 'object') return;
  for (const k of Object.keys(prefs)) if (PREFS_OK.has(k)) c.save[k] = prefs[k];   // chave fora da lista (dinheiro, bolas…) é IGNORADA
}
/* `arranjo` só REORDENA (e move entre time/caixa) os Pokémon que a conta JÁ tem, casando por uid: o registro de cada
   um continua sendo o do servidor, então o cliente não inventa espécie/nível/shiny nem edita stats por aqui. Só aceita
   se o conjunto de uids continuar o mesmo (nada criado, duplicado ou sumido). */
function aplicarArranjo(c, arranjo) {
  if (!arranjo || typeof arranjo !== 'object') return;
  const porUid = new Map();
  for (const p of [...(c.save.time || []), ...(c.save.caixa || [])]) if (p && p.uid != null) porUid.set(String(p.uid), p);
  const reordenar = (lista, max) => {
    if (!Array.isArray(lista)) return null;
    const vistos = new Set(), nova = [];
    for (const item of lista) {
      const uid = String(item && typeof item === 'object' ? item.uid : item);
      const reg = porUid.get(uid);
      if (reg && !vistos.has(uid)) { nova.push(reg); vistos.add(uid); }
    }
    return max ? nova.slice(0, max) : nova;
  };
  const time = reordenar(arranjo.time, 6), caixa = reordenar(arranjo.caixa, 0);
  if (time && caixa && time.length + caixa.length === porUid.size) { c.save.time = time; c.save.caixa = caixa; }
}
/* dex (Pokédex) e conhecimento: o cliente NÃO sobrescreve o objeto inteiro — só ACRESCENTA (merge monotônico), senão dava
   pra mandar a Pokédex 100%/conhecimento no talo. dex = { nºdex: 'visto'|'pego' }: o cliente só marca 'visto'; o 'pego' quem
   põe é o SERVIDOR (na captura/inicial), então não dá pra forjar "pego" em massa. conhecimento = { esp:{dex:nível 0-5}, titulos:[] }:
   nível só sobe e título só soma (nunca apaga nem rebaixa). HONESTO: isto impede zerar/rebaixar e forjar "pego", mas um trapaceiro
   ainda infla o PRÓPRIO 'visto'/nível; o lock duro é o servidor computar isso de eventos assinados (não existe no stub local). */
function mesclarDex(atual, novo) {
  const r = (atual && typeof atual === 'object') ? atual : {};
  if (novo && typeof novo === 'object')
    for (const k of Object.keys(novo)) if (/^\d+$/.test(k) && !r[k]) r[k] = 'visto';   // cliente só adiciona VISTO
  return r;
}
function marcarPego(c, dex) {                                                            // servidor marca 'pego' (autoritativo) ao capturar/escolher inicial
  if (dex == null || !c.save) return;
  if (!c.save.dex || typeof c.save.dex !== 'object') c.save.dex = {};
  c.save.dex[+dex] = 'pego';
}
function mesclarConhecimento(atual, novo) {
  const base = (atual && typeof atual === 'object') ? atual : { esp: {}, titulos: [], v: 1 };
  base.esp = (base.esp && typeof base.esp === 'object') ? base.esp : {};
  base.titulos = Array.isArray(base.titulos) ? base.titulos : [];
  if (novo && typeof novo === 'object') {
    if (novo.esp && typeof novo.esp === 'object')
      for (const k of Object.keys(novo.esp)) {
        if (!/^\d+$/.test(k)) continue;
        const lv = Math.max(0, Math.min(5, Math.round(+novo.esp[k] || 0)));
        if (lv > (+base.esp[k] || 0)) base.esp[k] = lv;                                  // só sobe
      }
    if (Array.isArray(novo.titulos))
      for (const t of novo.titulos) { const s = String(t).slice(0, 60); if (!base.titulos.includes(s) && base.titulos.length < 300) base.titulos.push(s); }
  }
  return base;
}
const NATUREZAS = ['Hardy','Lonely','Brave','Adamant','Naughty','Bold','Docile','Relaxed','Impish','Lax','Timid','Hasty','Serious','Jolly','Naive','Modest','Mild','Quiet','Bashful','Rash','Calm','Gentle','Sassy','Careful','Quirky'];
function novoUid() { return String(Date.now()) + String(Math.floor(Math.random() * 9999)).padStart(4, '0'); }
/* Captura: o cliente só diz QUAL Pokémon (dex/nome/modelo); o SERVIDOR gera IVs/natureza/shiny e clampa o nível.
   NOTA DE PRODUÇÃO: o certo é a espécie/nível virem de um encontro que o servidor assinou/guardou — aqui (dev) só se clampa. */
/* Fase 0: a taxa de shiny vem do data/config_jogo.json (painel admin → Arquivos de dados), a mesma que o cliente usa no
   selvagem. Relê só quando o arquivo muda (mtime): salvar no painel vale na próxima captura, sem reiniciar. */
let cfgJogoCache = { mtime: -1, cfg: {} };
function cfgJogo() {
  try {
    const arq = nodePath.join(DADOS_PUB, 'config_jogo.json'), mt = fs.statSync(arq).mtimeMs;
    if (mt !== cfgJogoCache.mtime) cfgJogoCache = { mtime: mt, cfg: JSON.parse(fs.readFileSync(arq, 'utf8')) || {} };
  } catch { cfgJogoCache = { mtime: -1, cfg: {} }; }
  return cfgJogoCache.cfg;
}
const taxaShiny = () => { const t = cfgJogo().taxaShiny; return Math.max(1, (Number.isInteger(t) && t >= 2 ? t : 4096) / (eventos?.shinyMult() || 1)); };   // Fase 3: ÷ multiplicador do evento ao vivo
function individuoServidor(base) {
  const lv = Math.max(1, Math.min(100, Math.round(+base?.lv || 5)));
  const ivs = ivsNovos();
  return { dex: base?.dex, nome: base?.nome, glb: base?.glb, lv, ivs, natureza: NATUREZAS[Math.floor(Math.random() * NATUREZAS.length)], shiny: Math.random() < 1 / taxaShiny(), uid: novoUid() };
}
/* Iniciais permitidos (Fase 2): os de data/iniciais.json — o MESMO arquivo que o laboratório do jogo oferece (o painel edita),
   relido quando muda. Sem o arquivo (ou quebrado) vale a lista antiga: os starters de cada geração. */
const INICIAIS_PADRAO = new Set([1,4,7,152,155,158,252,255,258,387,390,393,495,498,501,650,653,656,722,725,728,810,813,816,906,909,912]);
let iniciaisCache = { mtime: -1, dex: null };
function inicialOk(dex) {
  try {
    const arq = nodePath.join(DADOS_PUB, 'iniciais.json'), mt = fs.statSync(arq).mtimeMs;
    if (mt !== iniciaisCache.mtime) { const l = JSON.parse(fs.readFileSync(arq, 'utf8')); iniciaisCache = { mtime: mt, dex: Array.isArray(l) && l.length ? new Set(l.map(o => +o?.dex)) : null }; }
  } catch { iniciaisCache = { mtime: -1, dex: null }; }
  return (iniciaisCache.dex || INICIAIS_PADRAO).has(+dex);
}
/* Espécies válidas = nº de dex do pokedex.json. STOPGAP da nº14 no local: captura/inicial recusa dex que não existe.
   IMPORTANTE: produção amarra a espécie a um ENCONTRO assinado (a captura manda só `id` do encontro + bola, nunca a espécie),
   e por isso lá a nº14 não existe. O stub local não tem encontro, então o máximo que dá é barrar dex inexistente. */
let ESPECIES_OK = null;
try {
  const pdx = JSON.parse(fs.readFileSync(nodePath.join(__dir, 'public/pokedex.json'), 'utf8'));
  ESPECIES_OK = new Set((pdx.species || []).map(s => +s.n).filter(n => n > 0));
  console.log('Espécies válidas:', ESPECIES_OK.size);
} catch (e) { console.warn('pokedex.json não carregado (validação de espécie desligada):', e.message); }
function especieValida(dex) { return !ESPECIES_OK || ESPECIES_OK.has(+dex); }   // sem o arquivo, não bloqueia (fail-open no dev)
// Rate-limit simples por IP (em memória; zera ao reiniciar).
const _tentativas = new Map();
function limitado(ip, chave, max, janelaMs) {
  const k = chave + '|' + (ip || '?'), agora = Date.now();
  const arr = (_tentativas.get(k) || []).filter(t => agora - t < janelaMs);
  arr.push(agora); _tentativas.set(k, arr);
  return arr.length > max;
}

// ── Sessões: token → usuario (com expiração) ─────────────────────────────────
const _sess = new Map();
const TOKEN_VIDA_MS = 30 * 24 * 3600 * 1000;                              // token vale 30 dias
const sessoes = {
  get(t) {
    const u = _sess.get(t); if (!u) return null;
    if (contas[u]?.tokenExp && Date.now() > contas[u].tokenExp) { _sess.delete(t); if (contas[u]) contas[u].token = null; return null; }   // token vencido
    return u;
  },
  set(t, u) { _sess.set(t, u); },
  delete(t) { _sess.delete(t); },
  get size() { return _sess.size; },
};
// restaura sessões do disco ao iniciar
for (const [u, c] of Object.entries(contas)) {
  if (c.token) sessoes.set(c.token, u);
}

function tokenDe(req) {
  const auth = req.headers['authorization'] || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}
function usuarioDe(req) {
  const t = tokenDe(req);
  return t ? sessoes.get(t) || null : null;
}

// ── Painel admin (/admin, servido pelo Vite) ─────────────────────────────────
/* Só conta GM. Edita os arquivos de dados que o JOGO lê (public/data/*.json, servidos pelo Vite), com cópia de segurança em
   servidor/dados/backups/ antes de cada gravação (fica com as 30 últimas de cada arquivo). Tudo que chega é LIMPO aqui. */
const DADOS_PUB = nodePath.join(__dir, 'public/data');
const MODELOS_DIR = nodePath.join(__dir, 'public/cenario/mon');
const BACKUPS = nodePath.join(DADOS, 'backups');
// Os GLB de mapa ficam em DOIS lugares (a Vite serve os dois em /cenario/): public/cenario/ (ex.: pallet_rota1) e cenario/ na raiz
// (os outros 72, incl. kanto). O editor lê/grava no MESMO lugar de onde o jogo carrega — public tem precedência no Vite.
const CENARIO_PUB = nodePath.join(__dir, 'public/cenario');
const CENARIO_RAIZ = nodePath.join(__dir, 'cenario');
function caminhoGlb(m) {
  const pub = nodePath.join(CENARIO_PUB, m + '.glb'), raiz = nodePath.join(CENARIO_RAIZ, m + '.glb');
  if (fs.existsSync(pub)) return pub;
  if (fs.existsSync(raiz)) return raiz;
  return pub;   // mapa novo: grava em public (ganha no Vite)
}
function mapasComGlb() {                                                   // nomes de mapa com .glb (os dois lugares), que também têm <mapa>.json
  const nomes = new Set();
  for (const d of [CENARIO_PUB, CENARIO_RAIZ]) { try { for (const f of fs.readdirSync(d)) if (f.endsWith('.glb')) nomes.add(f.slice(0, -4)); } catch {} }
  return [...nomes].filter(m => fs.existsSync(nodePath.join(DADOS_PUB, m + '.json'))).sort();
}
const ZONAS_ARQ = nodePath.join(DADOS_PUB, 'zonas_spawn.json');
const HABITATS_ARQ = nodePath.join(DADOS_PUB, 'habitats.json');
function gmDe(req) { const u = usuarioDe(req); return u && contas[u]?.gm ? u : null; }

// ── Jogadores (painel, Fase 1): resumo, moderação e o que o GM pode gravar no save ──
const ADMIN_LOG = nodePath.join(DADOS, 'admin_log.jsonl');
function logAdmin(gm, alvo, acao, extra = {}) { try { fs.appendFileSync(ADMIN_LOG, JSON.stringify({ quando: new Date().toISOString(), gm, alvo, acao, ...extra }) + '\n'); } catch (e) { console.warn('admin_log:', e.message); } }
function logAdminDe(alvo, n) {
  let linhas = []; try { linhas = fs.readFileSync(ADMIN_LOG, 'utf8').split('\n'); } catch {}
  const out = [];
  for (let i = linhas.length - 1; i >= 0 && out.length < n; i--) { try { const e = JSON.parse(linhas[i]); if (e.alvo === alvo) out.push(e); } catch {} }
  return out;
}
const socketsDe = u => [...conexoes.values()].filter(w => w._usuario === u);
/** Banimento em vigor: -1 = pra sempre, timestamp = até quando, 0 = livre (vencido conta como livre). */
const banidoAteDe = c => (c?.banidoAte === -1 || c?.banidoAte > Date.now()) ? c.banidoAte : 0;
function resumoConta(u, c) {
  const w = socketsDe(u).find(x => x._info);
  return { usuario: u, nome: c.save?.nome || '', email: c.email || '', gm: !!c.gm, cargo: c.cargo || null, idioma: c.idioma || null,
    dinheiro: c.save?.dinheiro ?? null, nTime: (c.save?.time || []).length, nCaixa: (c.save?.caixa || []).length,
    banidoAte: banidoAteDe(c), banMotivo: banidoAteDe(c) ? c.banMotivo || '' : '', mudoAte: c.mudoAte > Date.now() ? c.mudoAte : 0,
    online: w ? { mapa: w._mapa, x: +(+w._info.x || 0).toFixed(1), z: +(+w._info.z || 0).toFixed(1), area: w._info.area ?? null } : null };
}
/** Manda a tela de "derrubado" (o cliente mostra o texto) e fecha. Devolve quantas conexões caíram. */
function derrubar(u, texto) {
  const ws = socketsDe(u);
  for (const w of ws) { enviar(w, { t: 'saia', texto }); setTimeout(() => { try { w.close(); } catch {} }, 300); }
  return ws.length;
}
const resumoMon = p => ({ uid: p?.uid, dex: p?.dex, nome: p?.nome, lv: p?.lv, shiny: !!p?.shiny });
// itens existentes (menus_dados.json do jogo), relido quando o arquivo muda — bolsa com id que o jogo não conhece é recusada
let itensCache = { mtime: -1, ids: null };
function itemExiste(id) {
  try {
    const arq = nodePath.join(DADOS_PUB, 'menus_dados.json'), mt = fs.statSync(arq).mtimeMs;
    if (mt !== itensCache.mtime) itensCache = { mtime: mt, ids: new Set(Object.keys(JSON.parse(fs.readFileSync(arq, 'utf8')).itens || {})) };
  } catch { return true; }                                                  // sem o arquivo (demo) não bloqueia
  return !itensCache.ids || itensCache.ids.has(String(id));
}
function limparBolsa(d) {
  const bolsa = {};
  if (d.dinheiro !== undefined) {
    const n = Number(d.dinheiro);
    if (!Number.isInteger(n) || n < 0 || n > 1e12) return { erro: 'Dinheiro: um número inteiro de 0 a 1 trilhão.' };
    bolsa.dinheiro = n;
  }
  for (const k of ['itens', 'bolas']) if (d[k] !== undefined) {
    if (!d[k] || typeof d[k] !== 'object' || Array.isArray(d[k])) return { erro: k + ': formato inválido.' };
    const m = {};
    for (const [id, q] of Object.entries(d[k])) {
      if (!/^\d{1,9}$/.test(id) || !itemExiste(id)) return { erro: `${k}: o item ${id} não existe no jogo.` };
      const n = Number(q);
      if (!Number.isInteger(n) || n < 0 || n > 999999) return { erro: `${k} ${id}: quantidade de 0 a 999999.` };
      if (n > 0) m[id] = n;                                                  // 0 = tira da bolsa
    }
    if (Object.keys(m).length > 3000) return { erro: k + ': itens demais.' };
    bolsa[k] = m;
  }
  if (d.insignias !== undefined) {
    if (!Array.isArray(d.insignias) || d.insignias.length > 200 || !d.insignias.every(i => Number.isInteger(i) && i > 0 && i < 1e7)) return { erro: 'Insígnias: uma lista de ids.' };
    bolsa.insignias = [...new Set(d.insignias)];
  }
  return { bolsa };
}
/* Time e caixa vindos do painel: só Pokémon que a conta JÁ tem (casa por uid — criar é pela ação "dar Pokémon", que sorteia como
   uma captura). O GM pode mexer em nível, shiny, natureza e IVs, mover entre time e caixa e tirar (soltar); o resto do registro
   (golpes, HP, EXP…) continua o do servidor. */
const NATUREZAS_OK = new Set(NATUREZAS);
function limparTime(c, d) {
  if (!Array.isArray(d.time) || !Array.isArray(d.caixa)) return { erro: 'Faltou o time ou a caixa.' };
  if (d.time.length > 6) return { erro: 'O time tem no máximo 6 Pokémon.' };
  const porUid = new Map(), vistos = new Set();
  for (const p of [...(c.save.time || []), ...(c.save.caixa || [])]) if (p?.uid != null) porUid.set(String(p.uid), p);
  const limpar = lista => {
    const out = [];
    for (const e of lista) {
      const uid = String(e?.uid ?? ''), orig = porUid.get(uid);
      if (!orig) return { erro: `Pokémon desconhecido (uid ${uid}) — pra criar, use "Dar Pokémon".` };
      if (vistos.has(uid)) return { erro: `Pokémon repetido (uid ${uid}).` };
      vistos.add(uid);
      const p = { ...orig };
      if (e.lv !== undefined) { const lv = Number(e.lv); if (!Number.isInteger(lv) || lv < 1 || lv > 100) return { erro: `${p.nome || uid}: nível de 1 a 100.` }; p.lv = lv; }
      if (e.shiny !== undefined) p.shiny = e.shiny === true;
      if (e.natureza !== undefined) { if (!NATUREZAS_OK.has(e.natureza)) return { erro: `${p.nome || uid}: natureza inválida.` }; p.natureza = e.natureza; }
      if (e.ivs !== undefined) {
        const ivs = ivsLista(e.ivs);
        if (!ivs) return { erro: `${p.nome || uid}: IVs de 0 a 31.` };
        p.ivs = ivs;
      }
      out.push(p);
    }
    return { lista: out };
  };
  const t = limpar(d.time); if (t.erro) return t;
  const cx = limpar(d.caixa); if (cx.erro) return cx;
  return { time: t.lista, caixa: cx.lista };
}
function lerJson(arq, padrao) { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } }
/* Cópia do arquivo atual em servidor/dados/backups/ antes de sobrescrever. Nomes: <base>-<data>.json e <base>-glb-<data>.glb.
   Mantém os 30 últimos de cada JSON e os 8 últimos de cada GLB (é grande). A limpeza do JSON ignora os "-glb-" do mesmo nome
   (antes, salvar o JSON do pallet_rota1 podia apagar os backups do GLB dele). */
const RE_BACKUP = /^(\w+?)-(glb-)?(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.(json|glb)$/;
function fazerBackup(arq, ehGlb) {
  if (!fs.existsSync(arq)) return;
  fs.mkdirSync(BACKUPS, { recursive: true });
  const base = nodePath.basename(arq).replace(/\.(json|glb)$/, ''), prefixo = base + (ehGlb ? '-glb-' : '-'), ext = ehGlb ? '.glb' : '.json';
  fs.copyFileSync(arq, nodePath.join(BACKUPS, prefixo + new Date().toISOString().replace(/[:.]/g, '-') + ext));
  const velhos = fs.readdirSync(BACKUPS).filter(f => f.startsWith(prefixo) && f.endsWith(ext) && (ehGlb || !f.startsWith(base + '-glb-'))).sort();
  for (const f of velhos.slice(0, Math.max(0, velhos.length - (ehGlb ? 8 : 30)))) fs.unlinkSync(nodePath.join(BACKUPS, f));
}
function gravarComBackup(arq, obj) {
  fazerBackup(arq, false);
  const tmp = arq + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj, null, 1)); fs.renameSync(tmp, arq);   // troca atômica: o jogo nunca lê meio arquivo
}
let _modelos = null, _modelosEm = 0;
function modelosMon() {                                                    // glb de Pokémon que existem (espécie sem modelo não nasce)
  if (_modelos && Date.now() - _modelosEm < 10000) return _modelos;
  try { _modelos = new Set(fs.readdirSync(MODELOS_DIR).filter(f => /^pm\d{4}(_\d{2})?\.glb$/.test(f))); } catch { _modelos = new Set(); }
  _modelosEm = Date.now(); return _modelos;
}
const numEntre = (v, min, max, pad) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : pad; };
/* exigirModelo: nas zonas a espécie PRECISA ter .glb; nos habitats não (o arquivo veio do jogo e pode citar modelo que esta
   cópia não tem — apagar a linha ao salvar seria perder dado sem ninguém pedir). */
function limparEspecie(e, exigirModelo) {
  const dex = Math.round(Number(e?.dex)), glb = String(e?.glb || '');
  if (!especieValida(dex) || !/^pm\d{4}(_\d{2})?\.glb$/.test(glb) || (exigirModelo && !modelosMon().has(glb))) return null;
  const o = { dex, glb, nome: String(e.nome ?? '').slice(0, 40) || 'Nº ' + dex, peso: Math.round(numEntre(e.peso, 1, 1000, 100)) };
  if (e.agua) o.agua = 1;
  if (typeof e.fonte === 'string' && e.fonte) o.fonte = e.fonte.slice(0, 20);
  return o;
}
/* Objeto de cenário: uma peça (prefab `n`) colocada em x/y/z. O `a` do dump é sempre 0 (não é rotação — a orientação está no prefab);
   preservado só pra não perder dado. O nome do prefab aceita letras/números/_-./:[] e espaço (nomes "lib:..." do export). */
function limparObjeto(o) {
  const n = String(o?.n ?? '');
  if (!n || n.length > 80 || !/^[\w .:/\[\]-]+$/.test(n)) return null;
  const num = v => { const x = Number(v); return Number.isFinite(x) ? +x.toFixed(3) : 0; };
  const r = { n, x: num(o.x), y: num(o.y), z: num(o.z) };
  for (const k of ['a', 'w', 'h']) if (o[k] !== undefined) r[k] = num(o[k]);   // ambiente/areaEnv (chão/água) trazem a/w/h — preserva
  return r;
}
function limparZona(z) {
  const especies = (Array.isArray(z?.especies) ? z.especies : []).slice(0, 30).map(e => limparEspecie(e, true)).filter(Boolean);
  if (!especies.length) return null;                                       // zona sem espécie válida não nasce nada: descarta
  const a = Math.round(numEntre(z.lvMin, 1, 100, 3)), b = Math.round(numEntre(z.lvMax, 1, 100, a));
  return {
    id: (typeof z.id === 'string' && z.id !== 'undefined' && z.id !== 'null' && /^[\w-]{1,40}$/.test(z.id)) ? z.id : 'z' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    mapa: /^[\w-]{1,40}$/.test(String(z.mapa)) ? String(z.mapa) : 'kanto',
    nome: String(z.nome ?? '').slice(0, 60) || 'Zona',
    x: +numEntre(z.x, -5000, 5000, 0).toFixed(2), z: +numEntre(z.z, -5000, 5000, 0).toFixed(2),   // coordenadas do MUNDO (as do jogador)
    raio: +numEntre(z.raio, 1, 200, 10).toFixed(1),
    especies, lvMin: Math.min(a, b), lvMax: Math.max(a, b),
    max: Math.round(numEntre(z.max, 1, 30, 4)),                            // quantos vivos ao mesmo tempo
    intervalo: Math.round(numEntre(z.intervalo, 1, 600, 8)),               // segundos entre um nascimento e outro
    shiny: +numEntre(z.shiny, 0, 1, 0).toFixed(4),                        // chance de shiny da zona (0 = a padrão do jogo)
    ativa: z.ativa !== false,
  };
}

// ── Servidor HTTP ────────────────────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const rota = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const json = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };

  // ── Upload do GLB de cenário (binário; o editor 3D re-exporta o mapa) ──────────
  // Caminho próprio: o corpo é um .glb (vários MB), não JSON — não passa pelo cap de 1MB nem pelo parse de texto.
  if (req.method === 'POST' && rota === '/admin/mapa-glb') {
    const u = usuarioDe(req);
    if (!contas[u]?.gm) return json(403, { erro: 'Só conta GM.' });
    const m = String(url.searchParams.get('mapa') || '');
    if (!/^[\w-]{1,40}$/.test(m)) return json(400, { erro: 'mapa inválido' });
    const chunks = []; let tam = 0, grande = false;
    req.on('data', d => { if (grande) return; tam += d.length; if (tam > 150 * 1024 * 1024) { grande = true; json(413, { erro: 'GLB grande demais.' }); req.destroy(); return; } chunks.push(d); });
    req.on('end', () => {
      if (grande) return;
      const buf = Buffer.concat(chunks);
      if (buf.length < 12 || buf.readUInt32LE(0) !== 0x46546C67) return json(400, { erro: 'o corpo não é um GLB válido (header glTF).' });   // "glTF" = 0x46546C67
      const arq = caminhoGlb(m);   // grava onde o jogo lê (public/cenario/ ou cenario/ raiz)
      try {
        fazerBackup(arq, true);
        const tmp = arq + '.tmp'; fs.writeFileSync(tmp, buf); fs.renameSync(tmp, arq);
        console.log(`[admin] ${u} salvou o GLB de ${m} (${(buf.length / 1048576).toFixed(1)} MB)`);
        return json(200, { ok: true, bytes: buf.length });
      } catch (e) { return json(500, { erro: e.message }); }
    });
    return;
  }

  let body = '', corpoGrande = false;
  const capCorpo = rota.startsWith('/admin/') ? 30 * 1024 * 1024 : 1024 * 1024;   // rotas admin (só GM) mandam mapas grandes (kanto ~2,3MB de objetos); o resto fica em 1MB (nº17)
  req.setEncoding('utf8');                                // corpo grande chega em vários pedaços: sem isto um "ã" cortado na divisa virava "��" (o painel gravava o arquivo estragado)
  req.on('data', d => {                                   // cap de corpo: evita encher a RAM/disco com POST gigante (nº17)
    if (corpoGrande) return;
    body += d;
    if (body.length > capCorpo) { corpoGrande = true; json(413, { erro: 'Corpo grande demais.' }); req.destroy(); }
  });
  req.on('end', () => {
    if (corpoGrande) return;
    let d = {};
    try { d = body ? JSON.parse(body) : {}; } catch {}

    // ── Diagnóstico de boot + erros do cliente ────────────────────────────
    if (req.method === 'POST' && (rota === '/conta/boot' || rota === '/conta/log')) {
      if (limitado(req.socket.remoteAddress, 'log', 60, 60000)) return json(429, { ok: false });   // nº17: freia flood de log por IP
      const linha = JSON.stringify({ ...d, _t: new Date().toISOString(), _ip: req.socket.remoteAddress }) + '\n';
      try { fs.appendFileSync(nodePath.join(DADOS, 'client.log'), linha); } catch {}
      if (d.tipo === 'erro' || d.tipo === 'rejeicao')
        console.warn('[client]', d.usuario || '?', d.tipo, d.msg?.slice(0, 120));
      return json(200, { ok: true });
    }

    // GET /conta/logs — lista os últimos erros do cliente. nº16: só GM (o log tem IP+usuário de outros jogadores).
    if (req.method === 'GET' && rota === '/conta/logs') {
      const uLog = usuarioDe(req);
      if (!contas[uLog]?.gm) return json(403, { erro: 'Sem permissão.' });
      try {
        const linhas = fs.readFileSync(nodePath.join(DADOS, 'client.log'), 'utf8').trim().split('\n').filter(Boolean);
        const ultimas = linhas.slice(-50).map(l => { try { return JSON.parse(l); } catch { return { raw: l }; } });
        return json(200, { ok: true, total: linhas.length, ultimas });
      } catch { return json(200, { ok: true, total: 0, ultimas: [] }); }
    }

    if (req.method === 'GET' && rota === '/saude') return json(200, { ok: true, jogo: 'Pokemon 3D Base' });
    if (req.method === 'GET' && rota === '/alfa') return json(200, { ok: true, chaveObrigatoria: false });
    if (req.method === 'POST' && rota === '/chaves/validar') return json(200, { ok: true, chave: d.chave });

    // ── Cadastro ──────────────────────────────────────────────────────────
    if (req.method === 'POST' && rota === '/conta/criar') {
      if (limitado(req.socket.remoteAddress, 'criar', 5, 60000)) return json(429, { erro: 'Muitas contas criadas desse IP. Espere um minuto.' });
      const u = String(d.usuario || '').toLowerCase().trim();
      if (!u || u.length < 3) return json(400, { erro: 'Nome de usuário muito curto (mínimo 3 letras).' });
      if (!/^[a-z0-9_]{3,20}$/.test(u)) return json(400, { erro: 'Use apenas letras, números e _ (3–20 caracteres).' });
      if (contas[u]) return json(409, { erro: 'Este usuário já existe.' });
      const codigo = crypto.randomBytes(8).toString('hex');
      const token = tokenNovo();
      contas[u] = { senha: hashSenha(d.senha || ''), email: d.email || '', save: null, rev: 0, codigo, token, tokenExp: Date.now() + TOKEN_VIDA_MS };
      salvarContasJa();
      sessoes.set(token, u);
      return json(200, { ok: true, token, usuario: u, rev: 0, codigo, save: null });
    }

    // ── Login ─────────────────────────────────────────────────────────────
    if (req.method === 'POST' && rota === '/conta/entrar') {
      if (limitado(req.socket.remoteAddress, 'entrar', 10, 60000)) return json(429, { erro: 'Muitas tentativas. Espere um minuto.' });
      const u = String(d.usuario || '').toLowerCase().trim();
      const c = contas[u];
      if (!c || !conferirSenha(d.senha || '', c.senha)) return json(401, { erro: 'Usuário ou senha incorretos.' });
      const ban = banidoAteDe(c);                                         // painel → Jogadores → Banir
      if (ban) return json(403, { erro: 'Conta suspensa ' + (ban === -1 ? 'para sempre' : 'até ' + new Date(ban).toLocaleString('pt-BR')) + '.' + (c.banMotivo ? ' Motivo: ' + c.banMotivo : '') });
      const manut = eventos.bloqueiaLogin(c); if (manut) return json(503, { erro: manut });   // Fase 3: modo manutenção (GM entra)
      const token = tokenNovo();
      c.token = token;
      c.tokenExp = Date.now() + TOKEN_VIDA_MS;
      salvarContasJa();
      sessoes.set(token, u);
      return json(200, { ok: true, token, usuario: u, rev: c.rev || 0, save: c.save || null, gm: !!c.gm, cargo: c.cargo || null, alfa: !!c.alfa, idioma: c.idioma || null, ...(c.posGm ? { pos: c.posGm } : {}) });   // posGm: um GM levou a conta (/tp, /puxar)
    }

    // ── Recuperação de senha ───────────────────────────────────────────────
    if (req.method === 'POST' && rota === '/conta/recuperar') {
      if (limitado(req.socket.remoteAddress, 'recuperar', 5, 60000)) return json(429, { erro: 'Muitas tentativas. Espere um minuto.' });
      const u = String(d.usuario || '').toLowerCase().trim();
      const c = contas[u];
      if (!c) return json(400, { erro: 'Usuário não encontrado.' });
      if (c.codigo !== d.codigo) return json(400, { erro: 'Código de recuperação incorreto.' });
      c.senha = hashSenha(d.nova || '');
      c.codigo = crypto.randomBytes(8).toString('hex');
      salvarContasJa();
      return json(200, { ok: true, codigo: c.codigo });
    }

    // ── Save (requer auth) ────────────────────────────────────────────────
    if (req.method === 'GET' && rota === '/save') {
      const u = usuarioDe(req);
      if (!u) return json(401, { erro: 'Sessão inválida.' });
      const c = contas[u];
      return json(200, { ok: true, save: c.save || null, rev: c.rev || 0, gm: !!c.gm, cargo: c.cargo || null, alfa: !!c.alfa, idioma: c.idioma || null, ...(c.posGm ? { pos: c.posGm } : {}) });
    }

    if (req.method === 'PUT' && rota === '/save') {
      const u = usuarioDe(req);
      if (!u) return json(401, { erro: 'Sessão inválida.' });
      // ANTI-TRAPAÇA: o cliente só pode ZERAR (save:null). Um save com conteúdo (dinheiro/time) é do SERVIDOR — recusa.
      if (d.save != null) return json(403, { erro: 'Operação não permitida.' });
      contas[u].save = null;
      contas[u].rev = (contas[u].rev || 0) + 1;
      salvarContas();
      return json(200, { ok: true, rev: contas[u].rev });
    }

    // ── Estado (keepalive, aceita sem auth silenciosamente) ───────────────
    if (req.method === 'POST' && rota === '/conta/estado') {
      const u = usuarioDe(req);
      if (u && contas[u]) {
        const c = contas[u];
        if (!c.save) c.save = {};
        if (d.arranjo) aplicarArranjo(c, d.arranjo);   // só reordena os Pokémon que a conta já tem
        aplicarPrefs(c, d.prefs);                       // só as chaves permitidas (nunca dinheiro/itens/bolas)
        if (d.conhecimento !== undefined) c.save.conhecimento = mesclarConhecimento(c.save.conhecimento, d.conhecimento);   // nº15: só soma, não sobrescreve
        if (d.dex !== undefined) c.save.dex = mesclarDex(c.save.dex, d.dex);                                                 // nº15: cliente só adiciona 'visto'
        c.rev = (c.rev || 0) + 1;
        salvarContas();
        if (d.outroAparelho) return json(409, { erro: 'Conflito de sessão.', outroAparelho: true });
      }
      return json(200, { ok: true, rev: contas[u]?.rev || 0 });
    }

    // ── Sair ──────────────────────────────────────────────────────────────
    if (req.method === 'POST' && rota === '/conta/sair') {
      const u = usuarioDe(req);
      if (u && contas[u]) { sessoes.delete(contas[u].token); contas[u].token = null; salvarContasJa(); }
      return json(200, { ok: true });
    }

    // ── Configurações de conta ────────────────────────────────────────────
    if (req.method === 'POST' && rota === '/conta/nome') {
      const u = usuarioDe(req);
      if (!u) return json(401, { erro: 'Sessão inválida.' });
      const nome = String(d.nome || '').trim();
      if (nome.length < 2) return json(400, { erro: 'Nome muito curto.' });
      if (!contas[u].save) contas[u].save = {};
      contas[u].save.nome = nome;
      salvarContas();
      return json(200, { ok: true });
    }

    if (req.method === 'POST' && rota === '/conta/idioma') {
      const u = usuarioDe(req);
      if (u && contas[u] && d.idioma) { contas[u].idioma = d.idioma; salvarContas(); }
      return json(200, { ok: true });
    }

    if (req.method === 'POST' && rota === '/conta/senha') {
      const u = usuarioDe(req);
      if (!u) return json(401, { erro: 'Sessão inválida.' });
      if (!conferirSenha(d.senhaAtual || '', contas[u].senha)) return json(400, { erro: 'Senha atual incorreta.' });
      contas[u].senha = hashSenha(d.nova || '');
      salvarContasJa();
      return json(200, { ok: true });
    }

    if (req.method === 'POST' && rota === '/conta/personagem/apagar') {
      const u = usuarioDe(req);
      if (u && contas[u]?.save) { delete contas[u].save.personagem; salvarContas(); }
      return json(200, { ok: true });
    }

    if (req.method === 'POST' && rota === '/conta/apagar') {
      const u = usuarioDe(req);
      if (!u) return json(401, { erro: 'Sessão inválida.' });
      if (!conferirSenha(d.senha || '', contas[u].senha)) return json(400, { erro: 'Senha incorreta.' });
      if (contas[u].token) sessoes.delete(contas[u].token);
      delete contas[u];
      salvarContasJa();
      return json(200, { ok: true });
    }

    // ── Painel admin (só GM) ──────────────────────────────────────────────
    if (rota.startsWith('/admin/')) {
      if (rota === '/admin/eu' && req.method === 'GET') {                  // o painel pergunta quem é antes de abrir
        const u = usuarioDe(req);
        if (!u) return json(401, { erro: 'Sessão inválida.' });
        return json(200, { ok: true, usuario: u, gm: !!contas[u]?.gm, nome: contas[u]?.save?.nome || u });
      }
      const g = gmDe(req);
      if (!g) return json(403, { erro: 'Só conta GM.' });
      if (rota.startsWith('/admin/eventos') && eventos.rota(rota, req.method, d, g, json)) return;   // Fase 3: eventos ao vivo (servidor_eventos.mjs)
      if (rota.startsWith('/admin/recursos/') && recursos(rota, req.method, url, json)) return;      // Fase 3: listas pras prévias (servidor_recursos.mjs)
      if (rota === '/admin/modelos' && req.method === 'GET')
        return json(200, { ok: true, modelos: [...modelosMon()].sort().map(glb => ({ glb, dex: +glb.slice(2, 6) })) });
      if (rota === '/admin/mapas' && req.method === 'GET') {               // cenas que têm arquivo de mapa (o painel junta o nome do cenas.json)
        let mapas = []; try { mapas = fs.readdirSync(DADOS_PUB).filter(f => /^(\d+|kanto|pallet_rota1)\.json$/.test(f)).map(f => f.slice(0, -5)); } catch {}
        return json(200, { ok: true, mapas });
      }
      if (rota === '/admin/zonas' && req.method === 'GET') return json(200, { ok: true, ...lerJson(ZONAS_ARQ, { v: 1, zonas: [] }) });
      if (rota === '/admin/zonas' && req.method === 'POST') {
        if (!Array.isArray(d.zonas)) return json(400, { erro: 'Faltou a lista de zonas.' });
        const zonas = d.zonas.slice(0, 500).map(limparZona).filter(Boolean);
        const ids = new Set(); for (const z of zonas) { while (ids.has(z.id)) z.id += '_'; ids.add(z.id); }
        gravarComBackup(ZONAS_ARQ, { v: 1, zonas });
        console.log(`[admin] ${g} salvou ${zonas.length} zona(s) de spawn`);
        return json(200, { ok: true, total: zonas.length, descartadas: d.zonas.length - zonas.length });
      }
      if (rota === '/admin/habitats' && req.method === 'GET') return json(200, { ok: true, ...lerJson(HABITATS_ARQ, { areas: {}, generico: [] }) });
      if (rota === '/admin/habitats' && req.method === 'POST') {
        const areas = {};
        for (const [k, lista] of Object.entries(d.areas && typeof d.areas === 'object' ? d.areas : {})) {
          if (!/^\d{1,8}$/.test(k) || !Array.isArray(lista)) continue;
          const l = lista.slice(0, 60).map(e => limparEspecie(e, false)).filter(Boolean);
          if (l.length) areas[k] = l;
        }
        const generico = (Array.isArray(d.generico) ? d.generico : []).slice(0, 60).map(e => limparEspecie(e, false)).filter(Boolean);
        gravarComBackup(HABITATS_ARQ, { ...lerJson(HABITATS_ARQ, {}), areas, generico });   // mantém as outras chaves do arquivo (ex.: `mapa`)
        console.log(`[admin] ${g} salvou habitats (${Object.keys(areas).length} áreas)`);
        return json(200, { ok: true, areas: Object.keys(areas).length });
      }
      // ── Editor de Cenário 3D: objetos (prefabs colocados) do mapa ──
      if (rota === '/admin/mapas-glb' && req.method === 'GET') {           // mapas com .glb (public/cenario/ + cenario/ raiz) que têm <mapa>.json
        return json(200, { ok: true, mapas: mapasComGlb() });
      }
      if (rota === '/admin/mapa-objetos' && req.method === 'GET') {
        const m = String(url.searchParams.get('mapa') || '');
        if (!/^[\w-]{1,40}$/.test(m)) return json(400, { erro: 'mapa inválido' });
        const d2 = lerJson(nodePath.join(DADOS_PUB, m + '.json'), null);
        if (!d2) return json(404, { erro: 'mapa não encontrado' });
        // o jogo monta o cenário de 3 listas: areaEnv (chão), ambiente (água/céu) e objetos (props)
        return json(200, { ok: true, objetos: d2.objetos || [], ambiente: d2.ambiente || [], areaEnv: d2.areaEnv || [] });
      }
      if (rota === '/admin/mapa-objetos' && req.method === 'POST') {
        const m = String(d.mapa || '');
        if (!/^[\w-]{1,40}$/.test(m)) return json(400, { erro: 'mapa inválido' });
        const arq = nodePath.join(DADOS_PUB, m + '.json');
        const d2 = lerJson(arq, null);
        if (!d2) return json(404, { erro: 'mapa não encontrado' });
        const limpa = l => (Array.isArray(l) ? l : []).slice(0, 200000).map(limparObjeto).filter(Boolean);
        let n = 0;
        for (const k of ['objetos', 'ambiente', 'areaEnv']) if (Array.isArray(d[k])) { d2[k] = limpa(d[k]); n += d2[k].length; }   // só troca as listas que vieram; o resto do mapa fica
        gravarComBackup(arq, d2);
        console.log(`[admin] ${g} salvou ${n} peças de cenário em ${m}`);
        return json(200, { ok: true, total: n });
      }
      /* ── Editor de Mapa: ÁREAS (caixas + nomes) ──
         Uma área = id + nome + 1..N caixas {a,x,y,z,sx,sy,sz} (x em coords de ARQUIVO; o jogo espelha). A caixa decide a área
         onde o jogador está (nome na tela, música) e o limite do mundo na água. O nome que o jogo mostra vem PRIMEIRO do
         data/cenas.json (nomeAreaCena) e depois do `nomes` do mapa — então renomear grava nos dois. Só os nomes enviados mudam
         (o cliente manda os que editou; ex.: o cenas diz "Cidade Celeste" e o mapa "Cidade Cerulean", e isso fica como está).
         `tilesArea` (opcional) = o id de área de cada tile de grama/água, na ordem do arquivo: é como uma área nova assume a
         grama de dentro dela (o spawn agrupa por tile.a). */
      if (rota === '/admin/mapa-areas' && req.method === 'POST') {
        const m = String(d.mapa || '');
        if (!/^[\w-]{1,40}$/.test(m)) return json(400, { erro: 'mapa inválido' });
        const arq = nodePath.join(DADOS_PUB, m + '.json');
        const d2 = lerJson(arq, null);
        if (!d2) return json(404, { erro: 'mapa não encontrado' });
        if (!Array.isArray(d.caixas) || d.caixas.length > 2000) return json(400, { erro: 'Faltou a lista de caixas.' });
        const num = (v, min, max) => { const n = +v; return Number.isFinite(n) && n >= min && n <= max ? +n.toFixed(3) : null; };
        const caixas = [];
        for (const c of d.caixas) {
          const a = Number.isInteger(+c?.a) && +c.a >= 1 && +c.a <= 99999999 ? +c.a : null;
          const x = num(c?.x, -100000, 100000), z = num(c?.z, -100000, 100000), sx = num(c?.sx, 0.5, 10000), sz = num(c?.sz, 0.5, 10000);
          if (a == null || x == null || z == null || sx == null || sz == null) return json(400, { erro: 'Caixa inválida: ' + JSON.stringify(c).slice(0, 80) });
          caixas.push({ a, x, y: num(c.y ?? 0, -10000, 10000) ?? 0, z, sx, sy: num(c.sy ?? 60, 0.5, 10000) ?? 60, sz });
        }
        const comCaixa = new Set(caixas.map(c => c.a)), tinhaCaixa = new Set((d2.caixas || []).map(c => +c.a));
        const removidas = new Set([...tinhaCaixa].filter(a => !comCaixa.has(a)));
        const areasAntes = (d2.areas || []).map(Number);
        const novas = [...comCaixa].filter(a => !areasAntes.includes(a));
        const areas = [...areasAntes.filter(a => !removidas.has(a)), ...novas], temArea = new Set(areas);
        const nomes = { ...(d2.nomes || {}) }, renomeadas = {};
        for (const a of removidas) delete nomes[a];
        for (const [k, v] of Object.entries(d.nomes && typeof d.nomes === 'object' ? d.nomes : {})) {
          if (!temArea.has(+k) || typeof v !== 'string' || !v.trim()) continue;
          nomes[+k] = renomeadas[+k] = v.trim().slice(0, 60);
        }
        for (const k of ['grama', 'agua']) {
          const ids = d.tilesArea?.[k]; if (ids == null) continue;
          if (!Array.isArray(ids) || ids.length !== (d2[k] || []).length) return json(409, { erro: `A lista de ${k} mudou desde que o painel abriu — recarregue a página.` });
          ids.forEach((a, i) => { if (Number.isInteger(a) && temArea.has(a)) d2[k][i].a = a; });
        }
        d2.caixas = caixas; d2.areas = areas; d2.nomes = nomes;
        gravarComBackup(arq, d2);
        const arqCenas = nodePath.join(DADOS_PUB, 'cenas.json'), ce = lerJson(arqCenas, null);
        if (Array.isArray(ce?.cenas)) {
          let mudou = false;
          for (const cena of ce.cenas) for (const x of cena.areas || []) if (renomeadas[x.id] && x.nome !== renomeadas[x.id]) { x.nome = renomeadas[x.id]; mudou = true; }
          const cenaMapa = ce.cenas.find(c => c.id === d2.mapa);
          if (cenaMapa) {
            const antes = (cenaMapa.areas || []).length;
            cenaMapa.areas = (cenaMapa.areas || []).filter(x => !removidas.has(x.id));
            for (const a of novas) if (!cenaMapa.areas.some(x => x.id === a)) cenaMapa.areas.push({ id: a, nome: nomes[a] || 'Área ' + a, tipo: 1 });
            if (cenaMapa.areas.length !== antes || novas.length) mudou = true;
          }
          if (mudou) gravarComBackup(arqCenas, ce);
        }
        console.log(`[admin] ${g} salvou áreas de ${m}: ${areas.length} áreas, ${caixas.length} caixas (+${novas.length} −${removidas.size})`);
        return json(200, { ok: true, areas: areas.length, caixas: caixas.length, novas: novas.length, removidas: removidas.size });
      }
      /* ── Editor de Mapa: CAMADAS (Fase 1) — os pontos (npcs, treinadores) e os tiles (grama, agua, spawn = piso de caverna) do
         <mapa>.json. Só troca as listas que vieram. Cada item é refeito campo a campo na ordem do arquivo (número finito; cfg,
         modelo, tipo e área inteiros); chave desconhecida cai fora. Quem o NPC é (npcs_glb) e as portas (portas.json) vão
         pelo /admin/dados, com os esquemas `npcs` e `portas`. ── */
      if (rota === '/admin/mapa-camadas' && req.method === 'POST') {
        const m = String(d.mapa || '');
        if (!/^[\w-]{1,40}$/.test(m)) return json(400, { erro: 'mapa inválido' });
        const arq = nodePath.join(DADOS_PUB, m + '.json'), d2 = lerJson(arq, null);
        if (!d2) return json(404, { erro: 'mapa não encontrado' });
        const CAMPOS = { npcs: ['cfg', 'modelo', 'face', 'x', 'y', 'z', 'a'], treinadores: ['cfg', 'tipo', 'x', 'y', 'z', 'a'], grama: ['cfg', 'tipo', 'x', 'y', 'z', 'a'],
          agua: ['tipo', 'x', 'y', 'z', 'a'], spawn: ['x', 'z', 'y', 'a'] };
        const INTEIROS = new Set(['cfg', 'modelo', 'tipo', 'a']), contagem = {}, novas = {};
        for (const [k, campos] of Object.entries(CAMPOS)) {
          if (d[k] === undefined) continue;
          if (!Array.isArray(d[k]) || d[k].length > 100000) return json(400, { erro: k + ': lista inválida' });
          const lista = [];
          for (const [i, o] of d[k].entries()) {
            const out = {};
            for (const c of campos) {
              const v = o?.[c];
              if (v === undefined || v === null) { if (c === 'x' || c === 'z') return json(400, { erro: `${k} ${i + 1}: sem posição` }); continue; }
              const n = Number(v);
              if (!Number.isFinite(n) || Math.abs(n) > 1e9 || (INTEIROS.has(c) && !Number.isInteger(n))) return json(400, { erro: `${k} ${i + 1}: "${c}" inválido` });
              out[c] = (c === 'x' || c === 'y' || c === 'z' || c === 'face') ? +n.toFixed(3) : n;
            }
            lista.push(out);
          }
          novas[k] = lista; contagem[k] = lista.length;
        }
        if (!Object.keys(novas).length) return json(400, { erro: 'Nada pra salvar.' });
        Object.assign(d2, novas);
        gravarComBackup(arq, d2);
        console.log(`[admin] ${g} salvou camadas de ${m}: ${Object.entries(contagem).map(([k, n]) => k + ' ' + n).join(', ')}`);
        return json(200, { ok: true, contagem });
      }
      /* ── Jogadores (Fase 1) ──
         A conta é o `contas[u]` em memória (grava com salvarContasJa). O painel NUNCA recebe senha, token nem código de
         recuperação — o código só aparece quando o GM gera um novo, pra passar ao jogador. Toda ação entra no admin_log.jsonl
         (quem, em quem, o quê, antes/depois) e, com o jogador online, chega na hora pelo WS: bolsa → {t:'bolsa'}, time →
         {t:'save'}, ban/desconectar → {t:'saia'} + fecha o socket, recado/mudo → {t:'sistema'}. */
      if (rota === '/admin/jogadores' && req.method === 'GET') {
        const q = String(url.searchParams.get('q') || '').toLowerCase().trim(), soOnline = url.searchParams.get('online') === '1';
        const lista = Object.entries(contas).map(([u, c]) => resumoConta(u, c))
          .filter(r => (!q || r.usuario.includes(q) || r.nome.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)) && (!soOnline || r.online))
          .sort((a, b) => (!!b.online - !!a.online) || a.usuario.localeCompare(b.usuario));
        const visitantes = [...conexoes.values()].filter(w => w._info && !contas[w._usuario]).map(w => ({ usuario: w._usuario, online: { mapa: w._mapa, x: +(+w._info.x || 0).toFixed(1), z: +(+w._info.z || 0).toFixed(1) } }));
        return json(200, { ok: true, total: Object.keys(contas).length, online: conexoes.size, jogadores: lista.slice(0, 500), visitantes });
      }
      if (rota === '/admin/jogador' && req.method === 'GET') {
        const u = String(url.searchParams.get('u') || ''), c = contas[u];
        if (!c) return json(404, { erro: 'Conta não encontrada.' });
        return json(200, { ok: true, conta: resumoConta(u, c), save: c.save || {}, rev: c.rev || 0, log: logAdminDe(u, 60) });
      }
      if (rota.startsWith('/admin/jogador/') && req.method === 'POST') {
        const acao = rota.slice('/admin/jogador/'.length), u = String(d.u || ''), c = contas[u];
        if (!c) return json(404, { erro: 'Conta não encontrada.' });
        if (u === g && ((acao === 'cargo' && d.gm !== true) || (acao === 'moderar' && d.acao !== 'recado')))   // não se tranca pra fora do painel
          return json(400, { erro: 'Isso não pode ser feito na sua própria conta.' });
        if (!c.save) c.save = {};
        const pronto = (extra = {}) => { c.rev = (c.rev || 0) + 1; salvarContasJa(); return json(200, { ok: true, conta: resumoConta(u, c), save: c.save, rev: c.rev, log: logAdminDe(u, 60), ...extra }); };

        if (acao === 'bolsa') {
          const r = limparBolsa(d);
          if (r.erro) return json(400, { erro: r.erro });
          const antes = { dinheiro: c.save.dinheiro ?? null, itens: c.save.itens || {}, bolas: c.save.bolas || {}, insignias: c.save.insignias || [] };
          Object.assign(c.save, r.bolsa);
          logAdmin(g, u, 'bolsa', { antes, depois: r.bolsa });
          for (const w of socketsDe(u)) { enviar(w, { t: 'bolsa', op: 'painel', bolsa: r.bolsa }); enviar(w, { t: 'sistema', texto: '🎒 Um GM ajustou a sua bolsa.' }); }
          return pronto();
        }
        if (acao === 'time') {
          const r = limparTime(c, d);
          if (r.erro) return json(400, { erro: r.erro });
          const antes = { time: (c.save.time || []).map(resumoMon), caixa: (c.save.caixa || []).map(resumoMon) };
          c.save.time = r.time; c.save.caixa = r.caixa;
          logAdmin(g, u, 'time', { antes, depois: { time: r.time.map(resumoMon), caixa: r.caixa.map(resumoMon) } });
          const res = pronto();
          for (const w of socketsDe(u)) { enviar(w, { t: 'save', save: c.save, rev: c.rev }); enviar(w, { t: 'sistema', texto: '🔁 Um GM mexeu no seu time.' }); }
          return res;
        }
        if (acao === 'pokemon') {                                            // dar um Pokémon: o servidor sorteia IVs/natureza como numa captura
          const dex = +d.dex, lv = Math.max(1, Math.min(100, Math.round(+d.lv || 5)));
          if (!especieValida(dex)) return json(400, { erro: 'Espécie inválida.' });
          const glb = String(d.glb || ''); if (!/^pm\d{4}[\w-]{0,20}$/.test(glb)) return json(400, { erro: 'Modelo (glb) inválido.' });
          const pk = individuoServidor({ dex, lv, glb, nome: String(d.nome || '').slice(0, 30) });
          if (d.shiny === true) pk.shiny = true;
          if (!Array.isArray(c.save.time)) c.save.time = [];
          if (!Array.isArray(c.save.caixa)) c.save.caixa = [];
          const lugar = c.save.time.length < 6 ? 'time' : 'caixa';
          c.save[lugar].push(pk); marcarPego(c, dex);
          logAdmin(g, u, 'deu pokemon', { depois: { ...resumoMon(pk), lugar } });
          const res = pronto({ lugar });
          for (const w of socketsDe(u)) { enviar(w, { t: 'save', save: c.save, rev: c.rev }); enviar(w, { t: 'sistema', texto: '🎁 Um GM te deu ' + (pk.nome || 'um Pokémon') + ' (Nv ' + pk.lv + ')' + (lugar === 'caixa' ? ' — está na caixa.' : '.') }); }
          return res;
        }
        if (acao === 'cargo') {
          const cargo = ['staff', 'mod'].includes(d.cargo) ? d.cargo : null, gm = d.gm === true;
          const antes = { gm: !!c.gm, cargo: c.cargo || null };
          if (gm) c.gm = true; else delete c.gm;
          c.cargo = cargo;
          logAdmin(g, u, 'cargo', { antes, depois: { gm, cargo } });
          return pronto();
        }
        if (acao === 'moderar') {                                            // Fase 3: as mesmas funções dos comandos de GM do chat (servidor_moderacao.mjs)
          const r = moderacao.moderar(g, u, d.acao, d);
          if (r.erro) return json(400, { erro: r.erro });
          return pronto();
        }
        if (acao === 'codigo') {                                             // novo código de recuperação de senha (o antigo para de valer)
          c.codigo = crypto.randomBytes(8).toString('hex');
          logAdmin(g, u, 'novo código de recuperação', {});
          return pronto({ codigo: c.codigo });
        }
        return json(404, { erro: 'Ação desconhecida.' });
      }
      // ── Dados genéricos (Fase 0): só os arquivos de admin/esquemas.mjs; valida pelo esquema e grava com backup ──
      if (rota.startsWith('/admin/dados/')) {
        const nomeEsq = rota.slice('/admin/dados/'.length);
        const esq = Object.prototype.hasOwnProperty.call(ESQUEMAS, nomeEsq) ? ESQUEMAS[nomeEsq] : null;
        if (!esq) return json(404, { erro: 'Arquivo não editável pelo painel: ' + nomeEsq });
        const arq = nodePath.join(DADOS_PUB, esq.arquivo + '.json');
        const vazio = esq.forma === 'lista' ? [] : {};
        const atual = lerJson(arq, esq.caminho ? {} : vazio);
        if (req.method === 'GET') return json(200, { ok: true, dados: (esq.caminho ? atual[esq.caminho] : atual) ?? vazio });
        if (req.method === 'POST') {
          const r = validarColecao(esq, d.dados);
          if (!r.ok) return json(400, { erro: r.erro });
          gravarComBackup(arq, esq.caminho ? { ...atual, [esq.caminho]: r.v } : r.v);   // com caminho, só troca a subchave
          const n = esq.forma === 'objeto' ? 1 : (Array.isArray(r.v) ? r.v.length : Object.keys(r.v).length);
          console.log(`[admin] ${g} salvou ${esq.arquivo}${esq.caminho ? '.' + esq.caminho : ''} (${n} registro(s))`);
          return json(200, { ok: true, total: n });
        }
      }
      // ── Histórico: lista os backups e restaura um (a restauração também faz backup, então dá pra desfazer o desfazer) ──
      if (rota === '/admin/backups' && req.method === 'GET') {
        const arquivos = {};
        let nomes = []; try { nomes = fs.readdirSync(BACKUPS); } catch {}
        for (const f of nomes) {
          const m = f.match(RE_BACKUP); if (!m) continue;
          const tipo = m[4], chave = m[1] + '.' + tipo;
          let bytes = 0; try { bytes = fs.statSync(nodePath.join(BACKUPS, f)).size; } catch {}
          (arquivos[chave] ||= []).push({ nome: f, tipo, bytes, data: m[3].replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z') });
        }
        for (const k of Object.keys(arquivos)) arquivos[k].sort((a, b) => b.data.localeCompare(a.data));
        return json(200, { ok: true, arquivos });
      }
      if (rota === '/admin/backups/restaurar' && req.method === 'POST') {
        const nome = String(d.nome || '');
        const m = nome.match(RE_BACKUP);
        if (!m) return json(400, { erro: 'nome de backup inválido' });
        const origem = nodePath.join(BACKUPS, nome);
        if (!fs.existsSync(origem)) return json(404, { erro: 'backup não encontrado' });
        const ehGlb = m[4] === 'glb';
        const emPasta = Object.values(ESQUEMAS).find(e => e.arquivo.includes('/') && nodePath.basename(e.arquivo) === m[1])?.arquivo;   // Fase 2: o backup guarda só o nome (dex_pt), o arquivo mora em idioma/
        const destino = ehGlb ? caminhoGlb(m[1]) : nodePath.join(DADOS_PUB, (emPasta || m[1]) + '.json');
        if (!fs.existsSync(destino)) return json(404, { erro: 'o arquivo de destino não existe' });   // só restaura por cima de um arquivo que existe
        const conteudo = fs.readFileSync(origem);                                // lê ANTES do backup novo (a limpeza pode apagar o mais antigo)
        fazerBackup(destino, ehGlb);
        const tmp = destino + '.tmp'; fs.writeFileSync(tmp, conteudo); fs.renameSync(tmp, destino);
        console.log(`[admin] ${g} restaurou ${nome}`);
        return json(200, { ok: true, arquivo: m[1], tipo: m[4] });
      }
      return json(404, { erro: 'Rota admin não encontrada: ' + rota });
    }

    json(404, { erro: 'Rota não encontrada: ' + rota });
  });
});

// ── WebSocket ────────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });
const conexoes = new Map();   // id → ws
let proxId = 1;
// Fase 3 do painel: a lógica mora nos módulos; aqui só entram os helpers que eles reusam (os mesmos da tela Jogadores)
const eventos = criarEventos({ dadosPub: DADOS_PUB, conexoes, contas, enviar, derrubar, logAdmin, gravarComBackup });
const moderacao = criarModeracao({ contas, sessoes, socketsDe, banidoAteDe, derrubar, logAdmin, enviar, salvarContasJa, conexoes, dadosPub: DADOS_PUB, avisar: eventos.avisar });
const recursos = criarRecursos(__dir);
const raid = criarRaid({ contas, sessoes, conexoes, enviar, socketsDe, logAdmin, salvarContas, salvarContasJa, dadosPub: DADOS_PUB, raiz: __dir, individuoServidor, marcarPego,
  shinyMult: () => eventos.shinyMult(), pontoSeguro: () => moderacao.cidade('pallet') });

function enviar(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(remetente, obj, soMesmoMapa = true) {
  const m = remetente._mapa;
  for (const ws of conexoes.values()) {
    if (ws === remetente) continue;
    if (soMesmoMapa && ws._mapa !== m) continue;
    enviar(ws, obj);
  }
}

function infoJogador(ws) {
  const i = ws._info || {};
  return { id: ws._id, nome: i.nome || ws._usuario || 'Jogador', cargo: null, titulo: i.titulo || '', x: i.x || 0, y: i.y || 0, z: i.z || 0, giro: i.giro || 0, anim: i.anim || 'Idle', parceiro: i.parceiro || null, pshiny: !!i.shiny, montaria: i.montaria || null, personagem: i.personagem || null, px: i.px, pz: i.pz, pg: i.pg, pa: i.pa };
}

wss.on('connection', ws => {
  ws._id = String(proxId++);
  ws._mapa = 'kanto';
  ws._usuario = null;
  ws._info = null;
  conexoes.set(ws._id, ws);

  ws.on('message', raw => {
    if (raw && raw.length > 64 * 1024) return;                                  // nº20: mensagem gigante é ignorada (anti-amplificação)
    const agora = Date.now();                                                   // nº20: rate-limit por conexão (descarta o excedente de flood)
    if (!ws._rl || agora - ws._rl.t > 1000) ws._rl = { t: agora, n: 0 };
    if (++ws._rl.n > 120) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    switch (m.t) {
      case 'entrar': {
        ws._mapa = m.mapa || 'kanto';
        ws._info = { ...m };
        const uTok = m.token ? sessoes.get(m.token) : null;
        if (uTok && banidoAteDe(contas[uTok])) { enviar(ws, { t: 'saia', texto: 'Sua conta está suspensa.' }); try { ws.close(); } catch {} return; }
        if (eventos.aoEntrar(ws, uTok)) return;                            // Fase 3: manutenção barra quem não é GM; senão manda o evento ao vivo
        moderacao.aoEntrar(ws, uTok);                                      // Fase 3: chegou onde o GM levou (posGm) → apaga
        if (uTok) for (const w of socketsDe(uTok)) {                       // sessão única, como em produção: a aba/aparelho anterior leva `saia` (não reconecta) e some do mapa dos outros — antes cada aba virava mais um boneco
          if (w === ws) continue;
          enviar(w, { t: 'saia', texto: 'Você entrou de outro lugar.' });
          conexoes.delete(w._id);
          broadcast(w, { t: 'saiu', id: w._id });
          setTimeout(() => { try { w.close(); } catch {} }, 300);
        }
        ws._usuario = uTok || ('Visitante' + ws._id);                    // identidade só do token; sem conta = Visitante (nunca o nome do cliente)
        if (ws._info) ws._info.nome = (uTok && contas[uTok]?.save?.nome) || ws._usuario;   // nome na cabeça/chat vem da CONTA

        const outros = [];
        for (const [id, other] of conexoes) {
          if (id === ws._id || !other._info || other._mapa !== ws._mapa) continue;
          outros.push(infoJogador(other));
        }
        enviar(ws, { t: 'bemvindo', id: ws._id, jogadores: outros, selvagens: [], online: conexoes.size, conta: ws._usuario, versao: VERSAO_REDE, soloWilds: true, ...raid.bemvindo(ws) });   // dev local não tem servidor de mundo: o cliente nasce os selvagens sozinho (batalha/captura locais). Raid: na arena o participante liga o Mundo só com o chefe
        broadcast(ws, { t: 'entrou', jogador: infoJogador(ws) });
        raid.aoEntrar(ws);                                                 // retrato da raid logo depois do bem-vindo (+ ida pendente / volta que não chegou)
        // Envia estado de missões logo após bemvindo
        const uM = sessoes.get(m.token) || null;
        if (uM && contas[uM]) {
          const estM = missaoEstadoDe(uM);
          if (estM.atual) enviar(ws, { t: 'missao', estado: estM });
        }
        console.log(`[+] ${ws._usuario} entrou em ${ws._mapa} (${conexoes.size} online)`);
        break;
      }

      case 'ping':
        enviar(ws, { t: 'pong', hora: m.hora });
        break;

      case 'pos':
        if (ws._info) { ws._info.x = m.x; ws._info.y = m.y; ws._info.z = m.z; ws._info.giro = m.giro; ws._info.anim = m.anim; if (m.px != null) { ws._info.px = m.px; ws._info.pz = m.pz; ws._info.pg = m.pg; ws._info.pa = m.pa; } }
        broadcast(ws, { t: 'pos', id: ws._id, x: m.x, y: m.y, z: m.z, giro: m.giro, anim: m.anim, px: m.px, pz: m.pz, pg: m.pg, pa: m.pa });
        break;

      case 'parceiro':
        if (ws._info) { ws._info.parceiro = m.parceiro; ws._info.shiny = m.pshiny; ws._info.montaria = m.montaria; }
        broadcast(ws, { t: 'parceiro', id: ws._id, parceiro: m.parceiro, pshiny: m.pshiny, montaria: m.montaria });
        break;

      case 'personagem':
        if (ws._info) ws._info.personagem = m.personagem;
        broadcast(ws, { t: 'personagem', id: ws._id, personagem: m.personagem });
        break;

      case 'titulo': {
        const titulo = String(m.titulo ?? '').slice(0, 40);                     // nº19: título é string livre espalhada a todos — limita o tamanho
        if (ws._info) ws._info.titulo = titulo;
        broadcast(ws, { t: 'titulo', id: ws._id, titulo });
        break;
      }

      case 'chat': {
        const texto = String(m.texto ?? '').slice(0, 240);                // corta no servidor (o cliente dizia 240, mas por WS dava pra furar)
        if (!texto.trim()) break;
        const c = contas[ws._usuario];                                    // conta logada (Visitante não tem)
        if (c?.mudoAte > Date.now()) { enviar(ws, { t: 'sistema', texto: '🔇 Você está silenciado até ' + new Date(c.mudoAte).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '.' }); break; }   // painel → Jogadores
        const nome = c?.save?.nome || ws._usuario || 'Jogador';           // nome do personagem (não o login)
        const cargo = c?.cargo || null;                                   // [STAFF]/[MOD] pros outros verem
        broadcast(ws, { t: 'chat', canal: m.canal || 'local', texto, de: { nome, cargo } }, m.canal === 'local');
        // sem "echo pra mim": o cliente já mostra a própria mensagem (publicar em chat.mjs) — reenviar duplicava
        break;
      }

      // Save de intenções do cliente (arranjo/prefs/conhecimento)
      case 'save': {
        const u = (sessoes.get(ws._info?.token) || null);
        if (u && contas[u]) {
          const c = contas[u];
          if (!c.save) c.save = {};
          if (m.arranjo) aplicarArranjo(c, m.arranjo);   // só reordena os Pokémon que a conta já tem
          aplicarPrefs(c, m.prefs);                       // só as chaves permitidas (nunca dinheiro/itens/bolas)
          if (m.conhecimento !== undefined) c.save.conhecimento = mesclarConhecimento(c.save.conhecimento, m.conhecimento);   // nº15: só soma
          if (m.dex !== undefined) c.save.dex = mesclarDex(c.save.dex, m.dex);                                                 // nº15: cliente só adiciona 'visto'
          c.rev = (c.rev || 0) + 1;
          salvarContas();
        }
        break;
      }

      // ── Missões ──────────────────────────────────────────────────────────
      case 'missao_falar': {
        const uF = sessoes.get(ws._info?.token) || null;
        const est1 = uF ? missaoEstadoDe(uF) : null;
        console.log(`[missao_falar] usuario=${uF} cfg=${m.cfg} passo_atual=${JSON.stringify(est1 ? MISSOES[est1.atual]?.passos?.[est1.passo] : null)}`);
        if (uF) enviarMissao(ws, aplicarEvento(uF, { tipo: 'falar', cfg: m.cfg }));
        break;
      }
      case 'missao_area': {
        const uA = sessoes.get(ws._info?.token) || null;
        ws._areaId = m.area ?? null;                                      // onde está agora (passo 'ir' que vira o atual com a pessoa já lá)
        const est2 = uA ? missaoEstadoDe(uA) : null;
        console.log(`[missao_area] usuario=${uA} area=${m.area} passo_atual=${JSON.stringify(est2 ? MISSOES[est2.atual]?.passos?.[est2.passo] : null)}`);
        if (uA) enviarMissao(ws, aplicarEvento(uA, { tipo: 'area', area: m.area }));
        break;
      }
      case 'missao_treinador': {
        const uT = sessoes.get(ws._info?.token) || null;
        if (uT) enviarMissao(ws, aplicarEvento(uT, { tipo: 'treinador', cfg: m.cfg, area: m.area }));
        break;
      }
      case 'missao_selvagem': {
        const uS = sessoes.get(ws._info?.token) || null;
        if (uS) enviarMissao(ws, aplicarEvento(uS, { tipo: 'selvagem', dex: m.dex, area: m.area }));
        break;
      }
      case 'missao_captura': {
        const uC2 = sessoes.get(ws._info?.token) || null;
        if (uC2) enviarMissao(ws, aplicarEvento(uC2, { tipo: 'captura', dex: m.dex }));
        break;
      }
      case 'missao_inicial': {
        const uI = sessoes.get(ws._info?.token) || null;
        if (uI) enviarMissao(ws, aplicarEvento(uI, { tipo: 'inicial' }));
        break;
      }
      case 'missao_cura': {
        const uCr = sessoes.get(ws._info?.token) || null;
        if (uCr) enviarMissao(ws, aplicarEvento(uCr, { tipo: 'cura', cfg: m.cfg }));
        break;
      }
      case 'missao_nivel': {
        const uN = sessoes.get(ws._info?.token) || null;
        if (uN) enviarMissao(ws, aplicarEvento(uN, { tipo: 'nivel', lv: m.lv }));
        break;
      }
      case 'missao_insignia': {
        const uIg = sessoes.get(ws._info?.token) || null;
        if (uIg) enviarMissao(ws, aplicarEvento(uIg, { tipo: 'insignia', id: m.id, numero: m.numero }));
        break;
      }

      // ── Posse de Pokémon (captura, soltar, etc.) ─────────────────────────
      default: {
        if (m.t?.startsWith('posse_')) {
          const op = m.t.slice(6);
          const u = sessoes.get(ws._info?.token) || null;
          const c = u ? contas[u] : null;

          if (op === 'inicial' && m.mon && c) {
            if (!inicialOk(m.mon.dex)) { enviar(ws, { t: 'posse_erro', op, erro: 'inicial inválido' }); return; }
            if (!c.save) c.save = {};
            if (!Array.isArray(c.save.time)) c.save.time = [];
            const jaEscolheu = c.save.time.some(p => p.inicial);
            if (jaEscolheu) {
              enviar(ws, { t: 'posse_erro', op, erro: 'inicial já escolhido' });
            } else {
              const uid = String(Date.now()) + String(Math.floor(Math.random() * 9999)).padStart(4, '0');
              const ivs = ivsNovos();
              const naturezas = ['Hardy','Lonely','Brave','Adamant','Naughty','Bold','Docile','Relaxed','Impish','Lax','Timid','Hasty','Serious','Jolly','Naive','Modest','Mild','Quiet','Bashful','Rash','Calm','Gentle','Sassy','Careful','Quirky'];
              const natureza = naturezas[Math.floor(Math.random() * naturezas.length)];
              const shiny = Math.random() < 1 / taxaShiny();
              const pk = { ...m.mon, uid, lv: 5, ivs, natureza, shiny, inicial: true };
              c.save.time.unshift(pk);
              c.save.inicial = { dex: m.mon.dex, glb: m.mon.glb, nome: m.mon.nome, i: m.i ?? 0 };
              marcarPego(c, pk.dex);                    // nº15: inicial marca 'pego' na Pokédex (servidor)
              c.rev = (c.rev || 0) + 1;
              salvarContas();
              enviar(ws, { t: 'posse', op, mon: pk, vidas: c.save.time });
              const rI = aplicarEvento(u, { tipo: 'inicial' });
              if (rI) enviarMissao(ws, rI);
            }
          } else if (op === 'capturar' && m.pokemon && c) {
            if (!especieValida(m.pokemon.dex)) { enviar(ws, { t: 'posse_erro', op, erro: 'espécie inválida' }); return; }   // nº14 (stopgap): recusa dex que não existe
            if (!c.save) c.save = {};
            if (!Array.isArray(c.save.time)) c.save.time = [];
            if (!Array.isArray(c.save.caixa)) c.save.caixa = [];
            const pk = individuoServidor(m.pokemon);   // IVs/natureza/shiny e nível decididos pelo SERVIDOR (não confia no cliente)
            if (c.save.time.length < 6) c.save.time.push(pk);
            else c.save.caixa.push(pk);
            marcarPego(c, pk.dex);                      // nº15: quem marca 'pego' na Pokédex é o servidor
            c.rev = (c.rev || 0) + 1;
            salvarContas();
            enviar(ws, { t: 'posse', op, pokemon: pk, vidas: c.save.time });
            // Dispara evento de missão de captura
            const rC = aplicarEvento(u, { tipo: 'captura', dex: m.pokemon?.dex });
            if (rC) enviarMissao(ws, rC);
          } else if (op === 'soltar' && m.uid && c?.save) {
            c.save.time = (c.save.time || []).filter(p => p.uid !== m.uid);
            c.save.caixa = (c.save.caixa || []).filter(p => p.uid !== m.uid);
            c.rev = (c.rev || 0) + 1;
            salvarContas();
            enviar(ws, { t: 'posse', op, uid: m.uid, vidas: c.save.time });
          } else {
            enviar(ws, { t: 'posse', op, ...m });
          }
        }

        else if (m.t?.startsWith('bolsa_')) {
          const op = m.t.slice(6);
          const u = sessoes.get(ws._info?.token) || null;
          const c = u ? contas[u] : null;
          // bolsa_missao: paga recompensa da missão concluída
          if (op === 'missao' && m.missao && c) {
            // ANTI-TRAPAÇA: só paga se a missão foi REALMENTE concluída (está em feitas) e ainda NÃO foi paga.
            const est = c.save?.missoes;
            const feita = !!(est && Array.isArray(est.feitas) && est.feitas.includes(m.missao));
            if (c.save && !Array.isArray(c.save.recompensasPagas)) c.save.recompensasPagas = [];
            const jaPaga = !!c.save?.recompensasPagas?.includes(m.missao);
            const miss = MISSOES[m.missao];
            const rec = recompensaMissao(miss);
            if (feita && !jaPaga && rec && c.save) {
              c.save.recompensasPagas.push(m.missao);
              if (rec.dinheiro) c.save.dinheiro = (c.save.dinheiro || 0) + rec.dinheiro;
              if (rec.itens) { if (!c.save.itens) c.save.itens = {}; for (const [k, v] of Object.entries(rec.itens)) c.save.itens[k] = (c.save.itens[k] || 0) + v; }
              if (rec.bolas) { if (!c.save.bolas) c.save.bolas = {}; for (const [k, v] of Object.entries(rec.bolas)) c.save.bolas[k] = (c.save.bolas[k] || 0) + v; }
              c.rev = (c.rev || 0) + 1;
              salvarContas();
            }
            enviar(ws, { t: 'bolsa', op, bolsa: { dinheiro: c.save?.dinheiro, itens: c.save?.itens, bolas: c.save?.bolas } });
          } else {
            enviar(ws, { t: 'bolsa', op, bolsa: c?.save ? { dinheiro: c.save.dinheiro ?? 9999, bolas: c.save.bolas, itens: c.save.itens } : null });
          }
        }

        else if (m.t === 'vida_curar') {
          if (ws._ultCura && Date.now() - ws._ultCura < 2000) break;      // anti-flood (prod: exigir estar num Centro Pokémon)
          ws._ultCura = Date.now();
          const u = sessoes.get(ws._info?.token) || null;
          const c = u ? contas[u] : null;
          let vidas = null;
          if (c?.save?.time) {
            vidas = c.save.time.map(p => ({ ...p, hp: p.hpMax || p.stats?.hp || 100, status: null }));
            c.save.time = vidas;
            c.rev = (c.rev || 0) + 1;
            salvarContas();
          }
          enviar(ws, { t: 'vida', vidas });
        }

        else if (m.t?.startsWith('bat_')) {
          enviar(ws, { t: 'bat_erro', erro: 'Batalha PvP não disponível no servidor local.' });
        }

        else if (m.t?.startsWith('troca_')) {
          const uTr = sessoes.get(ws._info?.token) || null;                      // nº18: só quem está logado relaia troca (antes: qualquer conexão espalhava)
          if (uTr) broadcast(ws, { ...m, id: ws._id });
        }

        else if (m.t === 'missao_passo') {
          enviar(ws, { t: 'missao', estado: m.estado });
        }

        else if (m.t === 'mod' || m.t?.startsWith('mod_')) moderacao.comando(ws, m);   // Fase 3: /online /ver /aviso /mudo /kick /banir /perdoar /tp /ir /puxar (o chat manda {t:'mod_<op>'})
        else if (m.t === 'raid_staff' || m.t === 'raid_entrar' || m.t === 'raid_sair' || m.t === 'ataque') raid.receber(ws, m);   // raid ao vivo (o `ataque` só existe com o Mundo ligado: o chefe)
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!conexoes.delete(ws._id)) return;                                 // já saiu da lista (sessão única) e o `saiu` já foi
    console.log(`[-] ${ws._usuario || ws._id} saiu (${conexoes.size} online)`);
    broadcast(ws, { t: 'saiu', id: ws._id });
  });

  ws.on('error', () => {});
});

httpServer.listen(5190, () => {
  console.log('');
  console.log('╔═══════════════════════════════════════╗');
  console.log('║  Pokemon 3D Base — Servidor Dev     ║');
  console.log('║  HTTP + WebSocket na porta 5190       ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log('');
});
