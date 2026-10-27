/* Conta do jogador — FASE 2 da rede (05/09/2026): login por usuário + senha e o SAVE guardado na conta (servidor/contas.mjs).
 * Com o servidor no ar, o jogo só começa depois do login (telas do Figma da Amanda, telas.mjs) e o progresso vem da conta.
 * PASSO 6 (11/09): o cliente NÃO sobe save. O que o jogo grava (gravarLS do index) fica num cofre em memória e vira uma
 * INTENÇÃO pelo WebSocket 2,5 s depois — `arranjo` (ordem do time/caixa, apelido, golpes), `pref` (preferências do personagem,
 * lista fechada) e `conhecimento` (Pokédex de conhecimento); o resto (itens, dinheiro, insígnias, missões, nome, esperas de
 * ginásio, treinadores vencidos) é do servidor e o cofre só espelha o que ele manda. Ao fechar/sair, o que ficou pendente vai
 * por HTTP com keepalive (`POST /conta/estado`). Sem servidor no ar, ou com ?rede=0 / ?conta=0, tudo fica no localStorage.
 *   Conta.garantir({ params, layoutHudP })  → { modo: 'conta' | 'sem-servidor' | 'offline', usuario }  (o index espera isto antes de ler o save)
 *   Conta.tocou(chave)                       → o index chama a cada gravarLS
 *   Conta.sair() / Conta.zerarSave()         → Configurações
 * Chaves que SÃO save: SAVE_CHAVES. Preferências do aparelho (hud.*, chat.*, volume, tamanhos, pele, dev, popup.escala…) nunca sobem.
 */
import * as I18n from './i18n.mjs';                                      // IDIOMA (11/09): a conta lembra a escolha
import { COOKIE as COOKIE_PASSE, CENAS_LIVRES, VALIDADE_S, FOLGA_S, lerPasse, stemPermitido } from './passe_regras.mjs';   // PASSE DE PROGRESSO (fase 2, 19/09)
const VALIDADE_PASSE_S = VALIDADE_S + FOLGA_S;                          // vida do cookie (a borda confere o `exp` assinado)
export const SAVE_CHAVES = ['time', 'caixa', 'itens', 'bolas', 'bolaSel', 'atalhos', 'dinheiro', 'dex', 'conhecimento', 'insignias', 'eliteVencida',
  'ginasioCd', 'treinadoresVencidos', 'inicial', 'introVista', 'ultimoCentro', 'seguidor', 'seguidorUid', 'nome', 'personagem', 'mochila', 'tempo', 'cristal', 'missoes'];   // seguidorUid (14/09): QUAL dos dois Pidgey segue — vai pro servidor como preferência, senão em outro aparelho o boot pegava o primeiro
const LS = { token: 'conta.token', usuario: 'conta.usuario', rev: 'conta.rev', dono: 'conta.dono', sujo: 'conta.sujo', gm: 'conta.gm' };
const ESPERA_ENVIO = 2500, ESPERA_ERRO = 10000, VARREDURA = 20000;

let base = null, token = null, usuario = null, rev = 0, modo = 'offline', gm = false;   // gm: marca de GM/adm, dita pelo servidor
let sujo = false, timer = null, enviando = false, ultimoHash = '', avisouErro = false, ctx = null, aviso = null;

/* O COFRE (08/09): COM CONTA, as chaves de jogo (SAVE_CHAVES) não ficam no aparelho — vivem aqui, em memória, e são o que o
   servidor mandou. O jogo lê e grava por `lerBruto`/`gravarBruto` (o `lerLS`/`gravarLS` do index passa por eles), então nada
   mais no código precisou saber disso. Preferiências do aparelho (hud.*, volume, qualidade, pele…) continuam no localStorage,
   porque são de cada máquina. SEM conta (?rede=0, demo pública, bancadas) tudo segue no localStorage: lá não há servidor. */
const cofre = new Map();                      // chave de save → texto JSON
const CHAVES = new Set(SAVE_CHAVES);
export const comConta = () => modo === 'conta';
/* CARGOS (09/09): quem é staff/mod aparece no jogo. Quem dá é o SERVIDOR (vem no login e no GET /save) — nunca a URL.
   A tabela mora aqui porque o index, o rede.mjs e o chat.mjs precisam da mesma cor e da mesma etiqueta. */
export const CARGOS = { staff: { tag: 'STAFF', cor: '#ff4d4d' }, mod: { tag: 'MOD', cor: '#ffa640' } };
export const cargoDe = c => CARGOS[c] || null;
/** Como o nome de alguém deve aparecer: { texto, cor }. Serve pro rótulo na cabeça e pro chat. */
export function comCargo(nome, cargo, corPadrao = '#ffe07a'){
  const q = CARGOS[cargo];
  return q ? { texto: '[' + q.tag + '] ' + nome, cor: q.cor, tag: q.tag } : { texto: nome, cor: corPadrao, tag: null };
}
let meuCargo = null;
export const meuCargoAtual = () => meuCargo;
let meuAlfa = false;                                                      // Alpha Tester (12/09): a conta jogou no alpha; vem do servidor (login e GET /save), como o cargo
export const souAlfa = () => meuAlfa;
/** O que a CONTA diz sobre quem é você: marca de GM, cargo e onde parou. Vem no `GET /save` e também no login — os dois
    caminhos passam por aqui pra não acontecer de novo de um deles esquecer um campo. */
function aplicarConta(d){
  if (!d) return;
  marcarGm(d.gm);
  meuCargo = d.cargo || null;
  if ('alfa' in d) meuAlfa = !!d.alfa;                                    // só mexe se o campo veio (servidor velho não manda; não zera à toa)
  if ('pos' in d) posUltima = d.pos || null;
  /* IDIOMA (11/09): a escolha feita NESTE aparelho vence (a barra da tela de login); sem escolha aqui, vale a da conta. */
  if (d.idioma && I18n.IDIOMAS[d.idioma]){ let local = null; try { local = localStorage.getItem('idioma'); } catch {} if (!local && d.idioma !== I18n.idioma()) I18n.definir(d.idioma); }
}
/** Avisa a conta do idioma escolhido (barra da tela de login, ou quem chamar). */
export async function idioma(l){ if (modo === 'conta' && token && I18n.IDIOMAS[l]) return api('POST', '/conta/idioma', { idioma: l }); return null; }
/* ONDE A CONTA PAROU (08/09): vem do servidor no GET /save e o index usa pra nascer no lugar certo depois de recarregar. */
let posUltima = null;
export const posSalva = () => posUltima;
/** Leitura crua de uma chave (texto JSON ou null). Com conta e chave de save, vem do cofre. */
export function lerBruto(k){ return (comConta() && CHAVES.has(k)) ? (cofre.get(k) ?? null) : ler(k); }
/** Gravação crua. Com conta e chave de save, fica no cofre e marca pra subir; o aparelho não vê. */
export function gravarBruto(k, txt){
  if (comConta() && CHAVES.has(k)){ cofre.set(k, txt); tocouChave(k); return; }
  gravar(k, txt); tocou(k);
}
const ler = k => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const apagar = k => { try { localStorage.removeItem(k); } catch {} };

export const estado = () => ({ modo, usuario, rev, sujo, base, gm });
/** GM/adm? A marca vem do SERVIDOR (login e GET /save); o localStorage é só espelho pro boot seguinte (index: const GM). */
export const ehGm = () => gm;
function marcarGm(v){ gm = !!v; if (gm) gravar(LS.gm, '1'); else apagar(LS.gm); }
export const tokenAtual = () => (modo === 'conta' ? token : null);
export const baseUrl = () => base;                                       // http do servidor (rotas públicas, ex.: /ranking)
export function baseHttp(params){
  const s = params.get('servidor');                                       // ?servidor=ws://host:porta (o mesmo da rede) → http://host:porta
  if (s){ try { const u = new URL(s); return (u.protocol === 'wss:' ? 'https://' : 'http://') + u.host; } catch {} }
  return location.protocol === 'https:' ? location.origin + '/servidor' : 'http://' + location.hostname + ':5190';   // no site (HTTPS) o servidor fica atrás de /servidor no mesmo host (12/09)
}

/* ------------------------------------------------------------------ chamadas */
async function api(metodo, caminho, corpo = null, keepalive = false){
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const cab = { 'Content-Type': 'application/json' }; if (token) cab.Authorization = 'Bearer ' + token;
    const r = await fetch(base + caminho, { method: metodo, headers: cab, body: corpo ? JSON.stringify(corpo) : undefined, signal: ctl.signal, keepalive });
    let dados = null; try { dados = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, dados, erro: r.ok ? null : (dados?.erro || ('Erro ' + r.status)) };
  } catch (e){ return { ok: false, status: 0, dados: null, erro: 'Sem conexão com o servidor.' }; }
  finally { clearTimeout(t); }
}
async function saude(){
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2500);
  try { const r = await fetch(base + '/saude', { signal: ctl.signal, cache: 'no-store' }); return r.ok; } catch { return false; } finally { clearTimeout(t); }
}

/* ------------------------------------------------------------------ espelho local ↔ save */
function colherLocal(){                                                   // o que está no localStorage, só as chaves de save
  const s = {}; let tem = false;
  for (const k of SAVE_CHAVES){ const v = lerBruto(k); if (v == null) continue; try { s[k] = JSON.parse(v); tem = true; } catch {} }
  return tem ? s : null;
}
function aplicarSave(save){                                                // o save da conta vira o estado do jogo (chave ausente some)
  for (const k of SAVE_CHAVES){
    const tem = save && k in save && save[k] !== undefined;
    if (comConta()){                                                       // 08/09: com conta o jogo mora no cofre, e o
      if (tem) cofre.set(k, JSON.stringify(save[k])); else cofre.delete(k);   // APARELHO não guarda nada de jogo — nem sobra velha
      apagar(k);
    } else if (tem) gravar(k, JSON.stringify(save[k])); else apagar(k);
  }
  gravar(LS.dono, usuario); apagar(LS.sujo); sujo = false;
  ultimoHash = JSON.stringify(colherLocal() || {});
}
function guardarSessao(t, u, r){ token = t; usuario = u; rev = r || 0; gravar(LS.token, t); gravar(LS.usuario, u); gravar(LS.rev, String(rev)); }
function limparSessao(cookie = true){ token = null; usuario = null; rev = 0; for (const k of Object.values(LS)) apagar(k); apagarPasse(cookie); }

/* ------------------------------------------------------------------ PASSE DE PROGRESSO (fase 2, 19/09)
   "Só baixa quem progride": na borda (Worker da Cloudflare), `cenario/` só entrega a cena e o modelo de Pokémon que a CONTA já
   alcançou. A prova é o passe assinado pelo servidor (passe_regras.mjs), que viaja no cookie `pf_passe` (Path=/cenario).
   Quem grava o cookie é o CLIENTE, com o `{passe, exp}` que o servidor manda no JSON (login, cadastro, GET /save, GET /conta/passe)
   e no WebSocket (`{t:'passe'}`, rede.mjs). O cookie tem Path=/cenario, então a página (em /) NÃO consegue lê-lo de volta pelo
   document.cookie: o que o jogo sabe que tem fica num ESPELHO no localStorage (`passe.atual`), gravado junto com o cookie.
   `exp` (segundos) cresce a cada emissão da mesma conta: um passe mais velho nunca substitui um mais novo (a resposta HTTP que
   chega depois da mensagem do WebSocket). Sem Worker (localhost, LAN) nada disso nega nada: o cookie só vai junto e é ignorado. */
const LS_PASSE = 'passe.atual';
let passeMem = null;                                                      // o texto do passe (espelho em memória do localStorage)
/* Relê o espelho a cada consulta (revisão, 19/09): o cookie é um só pro navegador inteiro, e outra aba pode ter gravado um passe mais
   novo. Com a cópia em memória presa à primeira leitura, esta aba comparava com o passe velho e podia gravar por cima do mais novo.
   Sem localStorage (bloqueado), fica a memória. */
function passeGuardado(){ const ls = ler(LS_PASSE); if (ls != null) passeMem = ls; else if (passeMem == null) passeMem = ''; return passeMem ? lerPasse(passeMem) : null; }
/* Os campos que dizem O QUE o passe libera (uid, bandeiras, dex, skins, cenas): o `exp` fica de fora. Mudou = liberou algo novo. */
const conteudoPasse = txt => { const p = String(txt || '').split('.'); return [p[1], p[3], p[4], p[5], p[6]].join('.'); };
/** Grava o passe que o servidor mandou ({passe, exp}). Síncrona. Devolve se aceitou. */
export function gravarPasse(d){
  const txt = d && typeof d.passe === 'string' ? d.passe : null;
  const n = txt ? lerPasse(txt) : null; if (!n) return false;
  const cur = passeGuardado();
  if (cur && cur.uid === n.uid && n.exp < cur.exp) return false;         // passe mais velho que o que já temos (HTTP atrasado depois do WS)
  const agoraS = Math.floor(Date.now() / 1000);
  /* A vida do cookie NÃO depende do relógio do aparelho (verificação, 19/09): com o relógio adiantado mais de 7 dias, `exp − agora`
     dava 60 s e o cookie sumia com o jogo aberto — cada modelo novo virava 403 até o passe seguinte. Quem decide se o passe venceu é
     a borda, pelo `exp` assinado e pelo relógio dela; um cookie que dura mais que o passe só leva um passe vencido (negado igual). */
  const idade = Math.max(VALIDADE_PASSE_S, n.exp - agoraS);
  const seguro = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';   // em http:// de LAN o Secure seria recusado
  try { document.cookie = COOKIE_PASSE + '=' + txt + '; Path=/cenario; Max-Age=' + idade + '; SameSite=Lax' + seguro; } catch {}
  const cresceu = !cur || conteudoPasse(passeMem) !== conteudoPasse(txt);
  passeMem = txt; gravar(LS_PASSE, txt);
  n.cresceu = cresceu;
  try { dispatchEvent(new CustomEvent('passe-novo', { detail: n })); } catch {}
  return true;
}
/** Regrava o cookie a partir do espelho (revisão, 19/09): o boot chama antes de pedir a cena. Quem limpou só os cookies do site
    ainda tem o passe no localStorage — sem isto a cena tomava um 403 até o passe novo chegar. Só com o passe da MESMA conta da
    sessão guardada e ainda válido. */
export function reporCookie(){
  const p = passeAtual(); if (!p || p.uid !== ler(LS.usuario)) return false;
  const idade = Math.max(VALIDADE_PASSE_S, p.exp - Math.floor(Date.now() / 1000));
  const seguro = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  try { document.cookie = COOKIE_PASSE + '=' + passeMem + '; Path=/cenario; Max-Age=' + idade + '; SameSite=Lax' + seguro; } catch { return false; }
  return true;
}
/** Apaga o cookie e o espelho (sair da conta, apagar personagem, apagar conta, sessão vencida). `cookie = false` só esquece o
    espelho: o cookie sai no próximo boot sem sessão (ver `limparPasseSemSessao`). */
export function apagarPasse(cookie = true){
  passeMem = ''; apagar(LS_PASSE);
  if (!cookie) return;
  try { document.cookie = COOKIE_PASSE + '=; Path=/cenario; Max-Age=0; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : ''); } catch {}
}
/** Boot sem sessão guardada (quem acabou de sair da conta, visitante): o cookie que sobrou não é de ninguém e sai aqui. */
export function limparPasseSemSessao(){ if (!temSessaoSalva()) apagarPasse(); }
/** O passe que o aparelho tem (lido do espelho), ou null se falta ou venceu. */
export function passeAtual(){ const p = passeGuardado(); return p && p.exp * 1000 > Date.now() ? p : null; }
/** Segundos até o passe vencer (0 sem passe). */
export const passeVenceEm = () => { const p = passeAtual(); return p ? Math.max(0, p.exp - Math.floor(Date.now() / 1000)) : 0; };
/** A borda entregaria esta cena ('kanto', '4110002'…)? */
export function cobreCena(id){ const p = passeAtual(); return CENAS_LIVRES.includes(String(id)) || !!p?.gm || !!p?.cenas.has(String(id)); }
/** …e este modelo de Pokémon ('pm0025_00', 'pm0054.glb')? */
export function cobreGlb(stem){ const p = passeAtual(); return !!p && (p.gm || !stemPermitido(String(stem || '').replace(/\.glb$/, ''), p)); }
/** Há sessão guardada neste aparelho (o mesmo token que o `garantir` usa)? */
export const temSessaoSalva = () => !!(token || ler(LS.token));
/* PASSE CEDO: com a sessão salva, pede o passe ANTES da cena (o boot espera `ms`); falhou ou demorou, segue com o que tiver.
   Pedidos ao mesmo tempo dividem a mesma chamada. Devolve { ok, status }. */
let passeVoando = null;
/* `onde` = {cena, chegada} (verificação, 19/09): a cena que o boot vai abrir e a chegada da porta. O servidor libera o que está perto
   da chegada (habitat e portas) — senão quem sai de um interior por OUTRA porta (Caverna do Diglett, andares da Torre) aquecia
   espécies que o passe ainda não cobria, antes de o WebSocket conectar. */
export function passeCedo(ms = 1500, onde = null){
  const tk = token || ler(LS.token);
  if (!tk) return Promise.resolve({ ok: false, status: 0 });
  if (!passeVoando){
    const b = base || baseHttp(new URLSearchParams(location.search));
    const q = onde && onde.cena ? '?cena=' + encodeURIComponent(String(onde.cena)) + (onde.chegada ? '&chegada=' + encodeURIComponent(String(onde.chegada)) : '') : '';
    passeVoando = (async () => {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
      try {
        const r = await fetch(b + '/conta/passe' + q, { headers: { Authorization: 'Bearer ' + tk }, cache: 'no-store', signal: ctl.signal });
        let dados = null; try { dados = await r.json(); } catch {}
        if (r.ok && dados?.passe) gravarPasse(dados);
        return { ok: r.ok && !!dados?.passe, status: r.status };
      } catch { return { ok: false, status: 0 }; }
      finally { clearTimeout(t); passeVoando = null; }
    })();
  }
  const voando = passeVoando;
  return Promise.race([voando, new Promise(res => setTimeout(() => res({ ok: false, status: 0, demorou: true }), ms))]);
}

/* ------------------------------------------------------------------ o portão do boot */
/** Chamado pelo index ANTES de ler o save. Resolve quando o jogo pode seguir (logado, ou sem servidor). */
export async function garantir(c){
  ctx = c; const p = c.params;
  if (p.get('rede') === '0' || p.get('conta') === '0' || /[?&]figmateste=1(&|$)/.test(location.search)){ modo = 'offline'; return { modo }; }
  base = baseHttp(p);
  if (!(await saude())){ modo = 'sem-servidor'; console.log('conta: servidor fora do ar em ' + base + ' — jogando no localStorage'); return { modo }; }
  token = ler(LS.token); usuario = ler(LS.usuario); rev = +ler(LS.rev) || 0;
  if (token){
    /* 08/09: até aqui, se a sessão anterior fechou com mudança não enviada, o espelho do APARELHO subia por cima antes de ler.
       Com o servidor dono de Pokémon, bolsa, nível e missões isso protegia pouco e atrapalhava muito (ressuscitava estado
       velho). Agora quem manda é sempre o servidor; o preço é perder os últimos segundos de uma sessão que caiu. */
    apagar(LS.sujo);
    const r = await api('GET', '/save');
    if (r.ok && r.dados && 'save' in r.dados){ gravarPasse(r.dados); modo = 'conta'; rev = r.dados.rev || 0; gravar(LS.rev, String(rev)); aplicarConta(r.dados); aplicarSave(r.dados.save); ligarSync(); return { modo, usuario, gm }; }
    if (r.status === 401) limparSessao();                                  // sessão venceu: login de novo
    else { modo = 'sem-servidor'; console.warn('conta: ' + (r.erro || 'servidor sem contas (versão antiga?)')); return { modo }; }   // servidor velho responde 200 sem `save`: não apaga nada
  }
  const layout = await c.layoutHudP;
  if (!layout?.telas?.pc?.login){ modo = 'sem-servidor'; console.warn('conta: o layout não tem a tela de login'); return { modo }; }
  try { c.aoTela?.(); } catch {}                                           // o index esconde o "carregando o mapa" quando a tela entra (12/09)
  const T = await import('./telas.mjs');
  await new Promise(resolve => T.mostrar('login', layout, { conta: { entrar, criar, recuperar, codigoNovo, alfa, validarChave, idioma }, aoEntrar: resolve }));   // alfa/validarChave: a caixa da Alpha Key (11/09)
  modo = 'conta'; ligarSync();
  return { modo, usuario, novo: !!ctx.__novo };
}
/* CÓDIGO DE RECUPERAÇÃO (07/09): o servidor mostra UMA vez, no cadastro (e a cada troca de senha). Guardo em memória só pra
   a tela conseguir exibir; nunca vai pro localStorage — se fosse ficar guardado no aparelho não serviria de recuperação. */
let codigo = null;
export const codigoNovo = () => { const c = codigo; codigo = null; return c; };
/* ALPHA KEYS (11/09): o cadastro pode estar fechado. A tela pergunta (`alfa`) e confere a chave (`validarChave`) ANTES de
   abrir o formulário; o `criar` manda a chave junto e o servidor a gasta. */
export async function alfa(){ const r = await api('GET', '/alfa'); return { chaveObrigatoria: !!(r.ok && r.dados?.chaveObrigatoria) }; }
export async function validarChave(chave){ const r = await api('POST', '/chaves/validar', { chave }); return r.ok ? { ok: true, chave: r.dados?.chave || chave } : { ok: false, erro: r.erro }; }
/** Esqueci a senha: usuário + código de recuperação → senha nova (e um código novo). */
export async function recuperar(usuario, cod, nova){
  base = base || baseHttp(new URLSearchParams(location.search));
  const r = await api('POST', '/conta/recuperar', { usuario: String(usuario || '').toLowerCase().trim(), codigo: cod, nova });
  if (!r.ok) return { ok: false, erro: r.erro || 'Não deu pra trocar a senha.' };
  codigo = r.dados?.codigo || null;
  return { ok: true, codigo };
}
/** Login (telas.mjs chama). Devolve { ok } ou { ok:false, erro }. */
export async function entrar(u, senha){
  const r = await api('POST', '/conta/entrar', { usuario: u, senha });
  if (!r.ok || typeof r.dados?.token !== 'string') return { ok: false, erro: r.erro || 'O servidor não tem contas (versão antiga).' };
  guardarSessao(r.dados.token, r.dados.usuario, r.dados.rev);
  gravarPasse(r.dados);                                                   // passe de progresso (19/09): o cookie existe antes de o boot pedir a cena
  modo = 'conta';
  aplicarConta(r.dados);
  if (r.dados.idioma !== I18n.idioma()) api('POST', '/conta/idioma', { idioma: I18n.idioma() });   // a escolha da tela vai pra conta                                                  // marca de GM, cargo e onde parou — igual ao caminho do token (10/09)
  aplicarSave(r.dados.save);                                              // 08/09: o que vale é o da conta — progresso solto no aparelho NÃO é mais importado
  return { ok: true, usuario };
}
/** Cadastro (telas.mjs chama). */
export async function criar(u, email, senha, chave = null){   // guarda o código de recuperação que vier (codigoNovo); `chave` = Alpha Key (11/09)
  const r = await api('POST', '/conta/criar', { usuario: u, email, senha, chave: chave || undefined });
  if (!r.ok || typeof r.dados?.token !== 'string') return { ok: false, erro: r.erro || 'O servidor não tem contas (versão antiga).', precisaChave: !!r.dados?.precisaChave };
  guardarSessao(r.dados.token, r.dados.usuario, 0);
  gravarPasse(r.dados);                                                   // conta nova: o passe já vem com a BASE (a intro, o quarto, os iniciais)
  codigo = r.dados.codigo || null;                                        // o código de recuperação vem UMA vez, aqui (telas.mjs mostra)
  modo = 'conta'; if (ctx) ctx.__novo = true;
  api('POST', '/conta/idioma', { idioma: I18n.idioma() });               // conta nova nasce com o idioma da tela
  aplicarSave(null);                                                      // 08/09: conta nova nasce VAZIA (era aqui que o personagem velho do aparelho ressuscitava)
  return { ok: true, usuario };
}
/* ---------------------------------------------------------------- sincronia (PASSO 6, 11/09): o cliente NÃO sobe save.
   Cada chave de jogo que ele grava vira uma INTENÇÃO pelo WebSocket: `time`/`caixa` → `arranjo` (ordem, apelido e golpes —
   quem é seu é o servidor), preferências do personagem → `pref` (lista fechada), Pokédex de conhecimento → `conhecimento`.
   O que é do servidor (itens, dinheiro, insígnias, missões, nome, espera de ginásio, treinadores vencidos) fica no cofre só
   como espelho até o servidor mandar o dele. Sem mundo ainda (antes do `bemvindo`), fica pendente e sobe na hora. */
const PREFS = ['bolaSel', 'atalhos', 'seguidor', 'seguidorUid', 'personagem', 'mochila', 'introVista', 'ultimoCentro', 'tempo', 'inicial'];
let enviarRede = null;
const pendente = { arranjo: false, prefs: new Set(), conhecimento: false };
/** O index liga o WebSocket aqui (Rede.enviar) assim que ele existe; o que estava pendente sobe. */
export function ligarRede(fn){ enviarRede = fn; despachar(); }
const lerCofre = k => { try { return JSON.parse(cofre.get(k) ?? 'null'); } catch { return null; } };
function tocouChave(k){
  if (modo !== 'conta') return;
  if (k === 'time' || k === 'caixa') pendente.arranjo = true;
  else if (PREFS.includes(k)) pendente.prefs.add(k);
  else if (k === 'dex' || k === 'conhecimento') pendente.conhecimento = true;
  else return;                                                           // chave do servidor: o cofre é só espelho
  sujo = true; clearTimeout(timer); timer = setTimeout(despachar, ESPERA_ENVIO);
}
const temPendente = () => pendente.arranjo || pendente.prefs.size || pendente.conhecimento;
/** Manda o que está pendente. Pelo WebSocket em jogo; por HTTP (`POST /conta/estado`, keepalive) quando a página está
    fechando ou ao sair — o WebSocket pode não despejar o que ficou na fila. O que não foi continua pendente. */
function despachar(viaHttp = false){
  clearTimeout(timer);
  if (modo !== 'conta' || travado || !temPendente()) return null;
  if (viaHttp){
    const corpo = {};
    if (pendente.arranjo) corpo.arranjo = { time: lerCofre('time') || [], caixa: lerCofre('caixa') || [] };
    if (pendente.prefs.size){ corpo.prefs = {}; for (const k of pendente.prefs) corpo.prefs[k] = lerCofre(k); }
    if (pendente.conhecimento) corpo.conhecimento = { dex: lerCofre('dex'), conhecimento: lerCofre('conhecimento') };
    pendente.arranjo = false; pendente.prefs.clear(); pendente.conhecimento = false; sujo = false; apagar(LS.sujo);
    return api('POST', '/conta/estado', corpo, true).then(r => { if (r.status === 409 && r.dados?.outroAparelho) pararSync(); return r.ok; });
  }
  if (!enviarRede || !noMundo) return null;                              // sem mundo ainda: o bemvindo chama de novo
  if (pendente.arranjo && enviarRede({ t: 'arranjo', time: lerCofre('time') || [], caixa: lerCofre('caixa') || [] })) pendente.arranjo = false;
  for (const k of [...pendente.prefs]) if (enviarRede({ t: 'pref', chave: k, valor: lerCofre(k) })) pendente.prefs.delete(k);
  if (pendente.conhecimento && enviarRede({ t: 'conhecimento', dex: lerCofre('dex'), conhecimento: lerCofre('conhecimento') })) pendente.conhecimento = false;
  if (!temPendente()){ sujo = false; apagar(LS.sujo); }
  else { timer = setTimeout(despachar, ESPERA_ERRO); }                    // o WebSocket caiu: tenta de novo (e o bemvindo da volta também chama)
  return null;
}
function ligarSync(){
  if (ligarSync.__ligado) return; ligarSync.__ligado = true;
  addEventListener('pagehide', () => despachar(true));
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') despachar(true); });
}
/** O index chama a cada gravarLS(chave, valor); personagem.mjs (que grava direto) chama por window.__contaTocou. */
export function tocou(chave){ if (modo === 'conta' && SAVE_CHAVES.includes(chave)) tocouChave(chave); }
if (typeof window !== 'undefined'){ window.__contaTocou = tocou; window.__contaLer = lerBruto; window.__contaGravar = gravarBruto; }   // personagem.mjs grava sem importar
function marcarSujo(){ sujo = true; }                                       // (compatibilidade: quem chamava isto agora passa por tocouChave)
/** O servidor montou o save de novo (arranjo corrigido, troca): vale o dele, e o jogo relê. */
export function saveDoServidor(save, revNovo){ aplicarDoServidor(save, revNovo); try { avisarSaveNovo?.(); } catch (e){ console.warn('save do servidor:', e); } }
/** O SERVIDOR mexeu no save (troca de Pokémon): vira o localStorage aqui e o `rev` acompanha, sem marcar sujo (senão o
    aparelho subiria por cima o save velho que ainda estava na memória dele). */
/* BOLSA (passo 2 do save do servidor): dinheiro, itens, Pokébolas e insígnias são do SERVIDOR. Tudo que ele manda (resposta de
   uma operação, ou o acerto que vem no `PUT /save`) é escrito aqui, sem marcar sujo — senão o aparelho subiria por cima o
   número velho que ainda está na memória dele. `aoBolsa` deixa o index reler `jogo.bolas` e repintar a HUD. */
const BOLSA_CHAVES = ['dinheiro', 'itens', 'bolas', 'insignias'];
let avisarBolsa = null;
/* O index relê o save do localStorage quando o servidor o reescreve no meio do jogo (senão a memória dele fica com o time velho). */
let avisarSaveNovo = null;
export function aoSave(fn){ avisarSaveNovo = fn; }
export function aoBolsa(fn){ avisarBolsa = fn; }
export function aplicarBolsa(bolsa){
  if (!bolsa || typeof bolsa !== 'object') return false;
  for (const k of BOLSA_CHAVES) if (k in bolsa) gravarBruto(k, JSON.stringify(bolsa[k]));   // 12/09: com conta o jogo LÊ do cofre — gravar no localStorage deixava dinheiro/itens/insígnias do servidor invisíveis até o próximo login (compra sem item, insígnia que não contava no teto); `tocouChave` ignora estas chaves (só espelho)
  try { avisarBolsa?.(bolsa); } catch (e){ console.warn('bolsa:', e); }
  return true;
}
export function aplicarDoServidor(save, revNovo){
  if (modo !== 'conta') return false;
  aplicarSave(save || {});
  if (Number.isFinite(+revNovo)){ rev = +revNovo; gravar(LS.rev, String(rev)); }
  sujo = false; apagar(LS.sujo);
  return true;
}
/** NOME DO TREINADOR (08/09): é ÚNICO no servidor (amizade e troca acham gente pelo nome). Devolve { ok, nome } ou
    { ok:false, erro } — quem chama mostra o erro em vez de fingir que trocou. Sem conta, grava só neste aparelho. */
export async function trocarNome(nome){
  const n = String(nome || '').replace(/\s+/g, ' ').trim().slice(0, 16);
  if (n.length < 3) return { ok: false, erro: 'O nome do treinador tem de ter pelo menos 3 letras.' };
  if (modo !== 'conta'){ gravar('nome', JSON.stringify(n)); return { ok: true, nome: n, local: true }; }
  const r = await api('POST', '/conta/nome', { nome: n });
  if (!r.ok) return { ok: false, erro: r.erro || 'Não deu pra trocar o nome.' };
  const posto = r.dados?.nome || n;
  gravarBruto('nome', JSON.stringify(posto));                             // 12/09: com conta o jogo lê `nome` do cofre — `gravar` (localStorage) deixava o nome antigo na tela até relogar
  ultimoHash = JSON.stringify(colherLocal() || {});                       // o aparelho já está igual ao servidor: não marcar sujo
  return { ok: true, nome: posto };
}
/** Troca a senha. A rota existe desde 07/09 e devolve um CÓDIGO DE RECUPERAÇÃO novo — o antigo morre junto com a senha
    velha, então quem chama tem de mostrar o novo pro jogador. */
export async function trocarSenha(atual, nova){
  const r = await chamar('POST', '/conta/senha', { senhaAtual: atual, nova });
  if (!r.ok) return { ok: false, erro: r.erro || 'Não deu pra trocar a senha.' };
  return { ok: true, codigo: r.dados?.codigo || null };
}
/** APAGAR O PERSONAGEM (08/09): o jogo do jogador some no SERVIDOR (save, Pokémon, bolsa, missões); a conta e o nome ficam. */
export async function apagarPersonagem(){
  if (modo !== 'conta') return { ok: false, erro: 'Isto só vale com conta.' };
  clearTimeout(timer); sujo = false; apagar(LS.sujo);
  const r = await api('POST', '/conta/personagem/apagar');
  if (!r.ok) return { ok: false, erro: r.erro || 'Não deu pra apagar o personagem.' };
  rev = r.dados?.rev ?? rev; gravar(LS.rev, String(rev));
  cofre.clear(); ultimoHash = '{}';
  apagarPasse();                                                          // o servidor manda outro na próxima conexão (o que foi desbloqueado continua na conta)
  return { ok: true };
}
/** APAGAR A CONTA (08/09): irreversível, pede a senha. Depois disto não há mais sessão — quem chama recarrega a página. */
export async function apagarConta(senha){
  if (modo !== 'conta') return { ok: false, erro: 'Isto só vale com conta.' };
  const r = await api('POST', '/conta/apagar', { senha });
  if (!r.ok) return { ok: false, erro: r.erro || 'Não deu pra apagar a conta.' };
  clearTimeout(timer); cofre.clear(); sujo = false;
  for (const k of SAVE_CHAVES) apagar(k);
  limparSessao(); modo = 'offline';
  return { ok: true };
}
/** Chamada autenticada pra outros módulos (Social): { ok, status, dados, erro }. */
export async function chamar(metodo, caminho, corpo = null){ if (modo !== 'conta' || !token) return { ok: false, status: 0, dados: null, erro: 'Entre com uma conta pra usar isto.' }; return api(metodo, caminho, corpo); }
/** Quem mostra avisos (o chat de Sistema): o index liga depois que o chat existe. */
export function aoAvisar(fn){ aviso = fn; }
/* TRAVA DE JOGO (10/09): a conta entrou em outro aparelho. Este aqui para de gravar na hora — o que ele fizer daqui pra
   frente não vale, e continuar mandando só sobrescreveria o outro. Quem quiser voltar recarrega a página. */
let travado = false, noMundo = false, esperasNoMundo = 0;
/** O `rede.mjs` avisa quando o WebSocket entrou no mundo (a trava de jogo passou a ser nossa). */
export function entrouNoMundo(){ noMundo = true; esperasNoMundo = 0; despachar(); }   // passo 6: o que ficou pendente sobe agora
export function pararSync(){                                              // sem discurso: quem explica é a tela de derrubado (telas.mjs)
  if (travado) return; travado = true;
  clearTimeout(timer); sujo = false; apagar(LS.sujo);
}
export const estaTravado = () => travado;
/** Manda o que estiver pendente agora (Configurações, antes de sair). */
export async function enviarAgora(){ const r = despachar(true); if (r) await r; }   // passo 6: o que estiver pendente vai por HTTP (aguardável: sair/troca)

/* ------------------------------------------------------------------ sair / zerar */
export async function sair(){
  if (modo === 'conta'){ await enviarAgora(); await api('POST', '/conta/sair'); }
  for (const k of SAVE_CHAVES) apagar(k);                                  // o próximo a entrar neste aparelho não herda o progresso
  /* Integração (19/09): o cookie do passe NÃO sai aqui. Até a recarga, a página ainda termina de montar o que estava baixando
     (NPC-Pokémon da cena) e, sem o cookie, cada pedido desses virava um 403 da borda. Quem apaga é o boot seguinte, que já
     começa sem sessão (limparPasseSemSessao, no index). */
  limparSessao(false); modo = 'offline';
  location.reload();                                                     // volta pra tela de login (mesma URL: mapa, servidor de teste…)
}
/** "Apagar progresso": a conta continua, o save vira vazio (o index limpa o localStorage e recarrega). */
export async function zerarSave(){
  if (modo !== 'conta') return false;
  clearTimeout(timer); sujo = false; apagar(LS.sujo);
  const r = await api('PUT', '/save', { save: null, rev });
  if (r.ok){ rev = r.dados.rev; gravar(LS.rev, String(rev)); }
  ultimoHash = '{}';
  return r.ok;
}
