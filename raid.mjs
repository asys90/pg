/* RAID AO VIVO — lado do CLIENTE (14/09/2026). A especificação é a do Mew: staff anuncia, até 10 contas entram na fila, a
 * contagem acaba e o SERVIDOR leva cada participante pra arena 4120009 (Quarto da Lorelei) em "modo raid"; lá todos batem no
 * mesmo Mew (vida compartilhada, simulado pelo servidor), e no fim cada um recebe o prêmio e volta pra onde estava.
 *
 * Este módulo guarda o ESTADO da raid no cliente e traduz as mensagens do servidor em ações do jogo. Quem desenha (botão
 * piscando, banner, placa da fila, barra do chefe, faixa de aviso) é o `raid_ui.mjs` da frente de interface — carregado por
 * `import()` dinâmico e protegido: se o arquivo não existir ou faltar uma função, o jogo segue sem quebrar.
 *
 *   Raid.instalar(ctx)          — ctx: { mapa, enviar, Chat, Som, emArena(), navegando(), ativarArena(id), desativarArena(),
 *                                         irParaCena({ mapa, chegada, texto, raid }), sairDaArena(texto), nomeItem(id) }   (o index.html monta)
 *   Raid.montarUI({ Hud, Menus, I18n }) — 1× depois do HUD/menus montados: instala o raid_ui.mjs e repassa o último estado
 *   Raid.receber(m)             — rede.mjs roteia `raid`, `raid_ir`, `raid_voltar`, `raid_fim`
 *   Raid.chefe(info|null)       — barra de vida do chefe (o index chama no `selvagem`/`shp`/`sumiu` do Mundo)
 *   Raid.carimbo()/carimbar(id)/apagarCarimbo() · Raid.arenaNoBoot(mapa) — o carimbo `sessionStorage['raid.ativa']`
 *
 * O CARIMBO: gravado junto do `porta.ok` quando o jogo leva o jogador pra arena (raid_ir). No boot, `NOME === '4120009'` + carimbo
 * = modo raid (sem portas, NPCs, treinadores nem selvagens locais; o desmaio do time não manda pro Centro). Apagado na volta
 * (raid_voltar), quando o servidor diz que a raid acabou/não é sua, e em qualquer carga de OUTRA cena (o index faz).
 */
import * as I18n from './i18n.mjs';

/* CONFIG (Fase 3 do painel → Arquivos de dados → Raid): data/raid.json. PADRAO = o que estava fixo no código; campo ausente ou
   fora do formato fica com ele. Lido no import (o index usa o ARENA no boot, antes do instalar). Vida/dano/shiny/prêmio são do
   servidor de raid — aqui só passam adiante (o cliente não decide nada disso). */
export const PADRAO = { arena: '4120009', vagas: 10, chefeNome: 'Mew', chefeDex: 151, chefeGlb: 'pm0151_00', chefeNivel: 70, altura: 2.5, flutua: 1.0 };
const lido = await fetch('./data/raid.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null) || {};
const numOu = (v, min, max, pad) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : pad; };
export const CFG = { ...lido,
  arena: /^\d{3,9}$/.test(String(lido.arena ?? '')) ? String(lido.arena) : PADRAO.arena,
  vagas: Math.round(numOu(lido.vagas, 1, 50, PADRAO.vagas)),
  chefeNome: typeof lido.chefeNome === 'string' && lido.chefeNome.trim() ? lido.chefeNome.trim().slice(0, 30) : PADRAO.chefeNome,
  chefeDex: Math.round(numOu(lido.chefeDex, 1, 2000, PADRAO.chefeDex)),
  chefeGlb: /^pm\d{4}(_\d{2})?$/.test(String(lido.chefeGlb ?? '')) ? lido.chefeGlb : PADRAO.chefeGlb,
  chefeNivel: Math.round(numOu(lido.chefeNivel, 1, 100, PADRAO.chefeNivel)),
  altura: numOu(lido.altura, 0.5, 20, PADRAO.altura), flutua: numOu(lido.flutua, 0, 10, PADRAO.flutua) };
export const ARENA = CFG.arena;
/** O nome do chefe desta raid: o que o servidor mandou, senão o do data/raid.json. */
const nomeChefe = () => String(snap?.nome || CFG.chefeNome);
const CARIMBO = 'raid.ativa';
const IDA = 'raid.indo';                                                  // "esta aba já foi pra arena desta raid" (o ponto de retorno automático não repete)
const FASES_DENTRO = new Set(['indo', 'luta', 'fim']);
const FASES_IR = new Set(['indo', 'luta']);

let ctx = null, UI = null, uiCarregando = null;
let snap = { t: 'raid', fase: 'nenhuma' }, recebeu = false;
let ultimoChefe, temRegistro = false;
let timerFim = null, timerIda = null;

/* ------------------------------------------------------------------ carimbo */
export function carimbo(){ try { return sessionStorage.getItem(CARIMBO) || null; } catch { return null; } }
export function carimbar(id){ try { sessionStorage.setItem(CARIMBO, String(id ?? '1')); } catch {} }
export function apagarCarimbo(){ try { sessionStorage.removeItem(CARIMBO); } catch {} }
export function marcarIda(id){ try { sessionStorage.setItem(IDA, String(id ?? '1')); } catch {} }
const jaFoi = id => { try { return sessionStorage.getItem(IDA) === String(id); } catch { return true; } };   // falha FECHADA: sem storage, não navega sozinho
/** A cena que está carregando é a arena E a aba foi levada pra lá pela raid? */
export const arenaNoBoot = mapa => String(mapa) === ARENA && !!carimbo();
export const estado = () => snap;

/* ------------------------------------------------------------------ interface (raid_ui.mjs, da outra frente) */
function ui(fn, ...args){
  try { if (UI && typeof UI[fn] === 'function') return UI[fn](...args); }
  catch (e){ console.warn('raid_ui.' + fn + ':', e); }
  return undefined;
}
export function instalar(c){ ctx = c; }
/** Instala o raid_ui.mjs uma vez. Sem o arquivo (ou sem `instalar`), a raid funciona sem botão/banner — só o chat avisa. */
export function montarUI(dep = {}){
  if (uiCarregando) return uiCarregando;
  uiCarregando = (async () => {
    try {
      const [mod, Popup] = await Promise.all([import('./raid_ui.mjs'), import('./popup.mjs').catch(() => null)]);
      if (!mod || typeof mod.instalar !== 'function'){ console.warn('raid: raid_ui.mjs sem instalar() — a raid segue sem a interface'); return null; }
      mod.instalar({
        Hud: dep.Hud || null, Popup, Menus: dep.Menus || null, I18n: dep.I18n || I18n, cfg: CFG,
        ao: {
          entrar(){ ctx?.enviar?.({ t: 'raid_entrar' }); },
          sair(){ ctx?.enviar?.({ t: 'raid_sair' }); },
        },
      });
      UI = mod;
      ui('modoArena', !!ctx?.emArena?.());
      ui('estado', snap);
      if (ultimoChefe !== undefined) ui('chefe', ultimoChefe);
      return mod;
    } catch (e){ console.warn('raid: sem raid_ui.mjs (' + (e?.message || e) + ') — a raid segue sem a interface'); return null; }
  })();
  return uiCarregando;
}
/** Barra de vida do chefe no topo: { nome, lv, hp, maxHp } ou null (some). */
export function chefe(info){
  if (info) temRegistro = true;
  ultimoChefe = info ? { nome: info.nome || CFG.chefeNome, lv: info.lv ?? null, hp: Math.max(0, Math.round(info.hp ?? 0)), maxHp: Math.max(1, Math.round(info.maxHp || 1)) } : null;
  ui('chefe', ultimoChefe);
}
export function modoArena(on){ ui('modoArena', !!on); }
/** Faixa central (~4 s) + a mesma frase no chat. */
function avisar(texto, { chat = true } = {}){
  ui('aviso', texto);                                                     // o raid_ui.aviso já passa pelo I18n.t (e o Chat.sistema também): texto em pt aqui
  if (chat) ctx?.Chat?.sistema?.(texto);
}

/* ------------------------------------------------------------------ mensagens do servidor */
export function receber(m){
  if (!m || !ctx) return;
  try {
    switch (m.t){
      case 'raid': aoEstado(m); return;
      case 'raid_ir': aoIr(m); return;
      case 'raid_voltar': aoVoltar(m); return;
      case 'raid_fim': aoFim(m); return;
    }
  } catch (e){ console.warn('raid: ' + m.t + ':', e); }
}

/* SNAPSHOT idempotente: chega a cada mudança e logo depois do bem-vindo. Reconstrói tudo sem histórico. */
function aoEstado(m){
  const antes = recebeu ? snap.fase : null;
  recebeu = true;
  snap = { ...m, fase: m.fase || 'nenhuma' };
  ui('estado', snap);
  const naArena = String(ctx.mapa) === ARENA;
  const dentro = !!snap.eu && FASES_DENTRO.has(snap.fase);

  if (naArena && dentro){
    clearTimeout(timerFim); timerFim = null;
    carimbar(snap.id);
    if (!ctx.emArena()) ctx.ativarArena?.(snap.id);                      // entrou na arena sem o carimbo (F5 com o storage limpo, volta pela conta): liga o modo aqui
    if (snap.fase === 'luta' && antes !== 'luta') avisar(antes && antes !== 'nenhuma' ? 'A raid começa!' : 'A raid já começou: ataque o ' + nomeChefe() + '!');
    if (!temRegistro && snap.fase === 'luta' && snap.hp != null && snap.maxHp) chefe({ nome: snap.nome, lv: null, hp: snap.hp, maxHp: snap.maxHp });   // a barra aparece antes do corpo do Mew chegar
    return;
  }
  if (naArena && ctx.emArena() && !ctx.navegando?.()){
    /* Na arena em modo raid e a raid já não é minha (acabou: fase nenhuma; ou é OUTRA raid, anunciada depois de um reinício). Quem tira
       daqui é o servidor: ele manda o `raid_voltar` logo atrás deste retrato, e repete a cada reconexão enquanto a conta tiver a volta
       pendente. CORREÇÃO FINAL (14/09): antes, sem ele, recarregava SEM mapa — a carga saía do `ultimaCena` (a própria arena) e, com a
       posição da conta também na arena, o `voltarNaCena` não levava a lugar nenhum: o jogador nascia no Quarto da Lorelei normal, com as
       portas pra Sala do Bruno e pro Centro de Indigo. E com outra raid anunciada as portas abriam na hora (`desativarArena`). Agora nada
       de abrir a sala: sem `raid_voltar` em 4 s, sai pra um lugar SEGURO (último Centro visitado, senão o laboratório do Oak). */
    if (!timerFim) timerFim = setTimeout(() => {
      timerFim = null;
      if (!ctx.emArena() || ctx.navegando?.() || (snap.eu && FASES_DENTRO.has(snap.fase))) return;
      apagarCarimbo(); chefe(null);
      if (ctx.sairDaArena) ctx.sairDaArena('A raid acabou. Voltando…');
      else ctx.irParaCena?.({ mapa: null, texto: 'A raid acabou. Voltando…' });
    }, 4000);
    return;
  }
  if (!naArena && snap.eu && FASES_IR.has(snap.fase) && snap.mapa && !jaFoi(snap.id)){
    /* Participante fora da arena sem ter recebido o `raid_ir` (a conexão caiu bem na hora e voltou sem recarregar): vai sozinho, uma vez
       por raid nesta aba. Espera um pouco — se o servidor está mandando o raid_ir agora, ele chega e manda primeiro. */
    clearTimeout(timerIda);
    timerIda = setTimeout(() => {
      timerIda = null;
      if (ctx.navegando?.() || !snap.eu || !FASES_IR.has(snap.fase) || jaFoi(snap.id)) return;
      ctx.irParaCena?.({ mapa: snap.mapa, texto: 'Indo pra raid do ' + nomeChefe() + '…', raid: snap.id });
    }, 2500);
    return;
  }
  if (!dentro && !naArena) apagarCarimbo();
  if (snap.fase === 'nenhuma' && ultimoChefe) chefe(null);
}

/* O servidor já gravou a posição da conta num lugar da arena: recarrega a página pra lá (sem `chegada`: nasce na posição da conta). */
function aoIr(m){
  const mapa = String(m.mapa || snap.mapa || ARENA);
  carimbar(m.id);
  clearTimeout(timerIda); timerIda = null;
  if (String(ctx.mapa) === mapa && ctx.emArena()){ marcarIda(m.id); return; }   // já está na arena em modo raid (F5 no meio): nada a fazer
  ctx.irParaCena?.({ mapa, texto: 'Indo pra raid do ' + nomeChefe() + '…', raid: m.id });
}

/* Fim: o servidor devolveu a posição de antes. Quem está na arena recarrega pra lá; quem nunca chegou nela fica onde está. */
function aoVoltar(m){
  apagarCarimbo();
  clearTimeout(timerFim); timerFim = null; clearTimeout(timerIda); timerIda = null;
  chefe(null);
  if (!ctx.emArena() && String(ctx.mapa) !== ARENA) return;
  ctx.irParaCena?.({ mapa: m.mapa || null, texto: 'Voltando pra onde você estava…' });
}

/* Resultado: a bolsa, as vidas e o save já foram aplicados pelo rede.mjs (como em toda mensagem do servidor); aqui é o aviso. */
function aoFim(m){
  const p = m.premio || null;
  let texto;
  if (m.venceu && p && (p.mew || p.dinheiro || Object.keys(p.itens || {}).length)){
    const partes = [];
    if (p.mew) partes.push((p.mew.shiny ? '✨ ' : '') + (p.mew.nome || nomeChefe()) + (p.mew.lv ? ' Lv ' + p.mew.lv : ''));
    if (p.dinheiro) partes.push(p.dinheiro + ' ' + I18n.t('Moedas'));
    for (const [id, n] of Object.entries(p.itens || {})) if (n > 0) partes.push(I18n.t(ctx.nomeItem?.(id) || ('item ' + id)) + ' ×' + n);
    texto = nomeChefe() + ' derrotado! Prêmio: ' + partes.join(', ') + '.';
    try { ctx.Som?.tocar?.('ui/sound_pkmnget', { volume: 0.8, prio: true }); } catch {}
  } else if (m.venceu){
    texto = nomeChefe() + ' derrotado! Você não causou dano: sem prêmio desta vez.';
  } else {
    texto = 'A raid acabou: o ' + nomeChefe() + ' escapou.';
  }
  avisar(texto);
  if (m.venceu && p?.mew?.shiny) ctx.Chat?.sistema?.('✨ O seu ' + (p.mew.nome || nomeChefe()) + ' é SHINY!');
  if (p?.mew) ctx.Chat?.sistema?.('O ' + (p.mew.nome || nomeChefe()) + ' entrou no seu time (ou na caixa, se o time estiver cheio).');
  if (ctx.emArena()) ctx.Chat?.sistema?.('Em instantes você volta pra onde estava.');
}
