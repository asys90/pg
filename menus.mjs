import { t as tr, tHtml } from './i18n.mjs';   // IDIOMA (11/09): tr() traduz texto pt pro idioma do jogador
import * as I18n from './i18n.mjs';                                     // etapa 3: a linha de idioma nas Configurações e a Pokédex por idioma
/* Menus do jogo — casca DOM, sem servidor (menus.css).
 *
 * Um botão Menu (☰ na HUD, ou Esc) abre a grade; cada item abre UMA janela por vez:
 *   pokemon (time + caixa, ficha com stats/golpes/evolução, Seguir), mochila (itens por tipo, bolas
 *   selecionáveis, remédios), missoes (as 12 do capítulo em pt + passos), mapa (áreas do mapa, você),
 *   pokedex (visto/capturado por geração), treinador (nome, dinheiro, insígnias da Gen 1, tempo),
 *   loja (Pokémart do NPC 2150101 do dump, preços em Moeda), social (chat local, amigos, correio),
 *   batalha (PvP/ranking = em breve; treinadores do mapa), config (som, qualidade, tamanhos,
 *   depuração, Montar a HUD, galeria do Fairy, apagar progresso).
 * Dados: data/menus_dados.json (ItemConfig/ShopNpcData/BadgeConfig/quests do dump, em pt).
 * Estado em localStorage: itens, dinheiro, caixa, dex, tempo (o resto já existia: time, bolas…).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as Fogo from './fogo.mjs';
import * as Lodo from './lodo.mjs';
import * as Chat from './chat.mjs';
import * as Popup from './popup.mjs';                                   // pop-ups desenhados a partir do Figma (rodada 5)
import * as Som from './som.mjs';                                       // a aba Som de Configurações mexe nos três canais (rodada 24)
import * as Arr from './arrastar_time.mjs';                             // 20/09: arrastar pra reordenar o time e mover entre time e caixa (o servidor já aceitava, intenção `arranjo`)
let ctx = null, D = null, aberta = null, abaAtual = null, carregandoD = null;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const semBr = s => String(s || '').replace(/<br\s*\/?>/gi, ' ');        // descrição do dump traz <br> escrito: no Figma o texto é puro (v2, rodada 28)
const CAT_CURTA = { 'Itens transportados': 'Transportado', 'Máquina Técnica': 'MT', 'Chamando a Pedra': 'Pedra', 'Edifícios do Habitat': 'Habitat', 'Materiais do Habitat': 'Habitat', 'Comida do Habitat': 'Habitat', 'Sementes do Habitat': 'Habitat' };
const catCurta = s => CAT_CURTA[s] || s;                                  // o selo de categoria do detalhe do item (v2) é [max:12]
export const JANELAS = {
  pokemon:   { titulo: 'Pokémon', icone: 'pokebola', tecla: 'KeyP', sub: 'time e caixa' },
  mochila:   { titulo: 'Mochila', icone: 'mochila', tecla: 'KeyI', sub: 'itens e bolas' },
  missoes:   { titulo: 'Missões', icone: 'missoes', tecla: 'KeyJ', sub: 'a jornada por Kanto' },
  mapa:      { titulo: 'Mapa', icone: 'mapa', tecla: 'KeyK', sub: 'Kanto' },
  pokedex:   { titulo: 'Pokédex', icone: 'pokedex', tecla: 'KeyX', sub: 'vistos e capturados' },
  treinador: { titulo: 'Treinador', icone: 'personagem', tecla: 'KeyU', sub: 'insígnias, dinheiro' },
  loja:      { titulo: 'Loja', icone: 'loja', sub: 'em breve', breve: true },   // PREMIUM (GDD §7.5: doação → Medalhão trocável, cosméticos) — só "em breve" até o servidor; o Pokémart é outra janela
  mercado:   { titulo: 'Pokémart', icone: 'loja', sub: 'itens em Moedas', oculto: true },  // só pelo vendedor da loja da cidade (NPC papel 'loja'): não fica no menu
  social:    { titulo: 'Social', icone: 'amigos', sub: 'chat, amigos, correio', breve: true },
  batalha:   { titulo: 'Batalha', icone: 'batalha', sub: 'PvP, ranking', breve: true },
  config:    { titulo: 'Configurações', icone: 'ajuda', tecla: 'KeyO', sub: 'som, gráficos, HUD' },
  atalho:    { titulo: 'Atalho', icone: 'mochila', sub: 'poções, bolas, montarias', oculto: true },   // seletor dos atalhos 5–8 (não aparece na grade)
  raid:      { titulo: 'Raid', icone: 'batalha', sub: 'raid ao vivo', oculto: true },   // rodada 26: banner da raid ao vivo — só abre pelo btn-raid do HUD (raid_ui.mjs)
};
const ORDEM = Object.keys(JANELAS);

export function instalar(c){
  ctx = c;
  const g = document.createElement('div'); g.id = 'menu-grade'; g.hidden = true;
  g.innerHTML = `<div class="caixa"><h2>Menu <small>Esc fecha · ${ORDEM.filter(k => JANELAS[k].tecla).map(k => JANELAS[k].tecla.slice(3) + ' ' + tr(JANELAS[k].titulo).toLowerCase()).join(' · ')}</small></h2><div class="itens">${ORDEM.filter(k => !JANELAS[k].oculto).map(k => `<button type="button" data-j="${k}" class="${JANELAS[k].breve ? 'breve' : ''}"><i class="ic ic-${JANELAS[k].icone}"></i><b>${tr(JANELAS[k].titulo)}</b><small>${tr(JANELAS[k].sub)}</small></button>`).join('')}</div></div>`;
  g.addEventListener('click', ev => { const b = ev.target.closest('[data-j]'); if (b) abrir(b.dataset.j); else if (ev.target === g) fecharGrade(); });
  document.body.appendChild(g);
  const j = document.createElement('div'); j.id = 'janela'; j.className = 'janela'; j.hidden = true;
  j.innerHTML = `<header><h2 id="j-titulo"></h2><div class="abas" id="j-abas"></div><button type="button" class="x" id="j-x" aria-label="fechar">✕</button></header><div class="corpo" id="j-corpo"></div>`;
  j.querySelector('#j-x').onclick = () => fechar();
  document.body.appendChild(j);
  addEventListener('keydown', tecla, true);
  document.addEventListener('hud:abrir', ev => abrirRecurso(String(ev.detail || '')));   // rodada 29: atalhos Eventos/Loja e ícones sem janela do HUD v2
  if (PREVIA_URL){ let n = 0; const tenta = () => { if (ctx.jogo?.hudLayout?.popups){ previa(true); return; } if (++n < 80) setTimeout(tenta, 500); }; setTimeout(tenta, 500); }   // rodada 30: ?previa=1 abre a paleta assim que o layout v2 estiver montado
  setInterval(() => { if (ctx?.jogo?.ativo) ctx.gravarLS('tempo', (ctx.lerLS('tempo', 0) || 0) + 10); }, 10000);   // tempo de jogo, em segundos
}
async function dados(){
  if (D) return D;
  if (!carregandoD) carregandoD = fetch('./data/menus_dados.json').then(r => r.json()).catch(() => ({ tipos: {}, itens: {}, lojas: {}, insignias: [], missoes: [], passos: [] }));
  D = await carregandoD; return D;
}
/* DIÁLOGOS DA ABA CONTA (15/09): "Estou preso" e "Mandar pra equipe" são DOM solto, fora do `aberta` — o /preso abre o diálogo com o
   menu fechado e o jogador andava (joystick, toque no chão, porta que recarrega a página e perde o texto) e a Enter focava o chat.
   Enquanto um deles existir, `aberto()` vale true e as teclas do jogo ficam de fora (o `tecla` abaixo). Um Set: aberto() roda todo quadro. */
const DIALOGOS = new Set();
function dialogoAberto(){ for (const d of DIALOGOS){ if (d.isConnected) return true; DIALOGOS.delete(d); } return false; }
export const aberto = () => !!aberta || !$('menu-grade')?.hidden || dialogoAberto() || !!(popEb && Popup.aberto(popEb)) || !!(popIn && Popup.aberto(popIn));   // 18/09: a escolha do inicial (v2) também segura o jogo
export function alternarGrade(){ if (aberta) fechar(); else { const g = $('menu-grade'); g.hidden = !g.hidden; ctx.Som?.tocar?.('ui/sound_click', { volume: 0.5 }); } }
function fecharGrade(){ $('menu-grade').hidden = true; }
export function fechar(){ if (aberta) ctx.Som?.tocar?.('ui/sound_click', { volume: 0.3 }); aberta = null; $('janela').hidden = true; for (const q of [popPk, popMo, popMi, popTr, popMa, popSo, popDx, popCf, popRd]) if (q) Popup.fechar(q); pararDex(); avisarRaid(); }
export async function abrir(nome, aba = null){
  if (!JANELAS[nome]) return;
  if ((nome === 'loja' || nome === 'batalha') && defPopup('em-breve')){ abrirEmBreve(nome); return; }   // rodada 29 (v2): o banner "Em breve" da Amanda no lugar da janela vazia
  fecharGrade(); aberta = nome; abaAtual = aba; avisarRaid();
  if (nome === 'pokemon'){ reaprenderAberto = false; try { ctx.recuperarGolpes?.(); } catch (e){ console.warn('golpes perdidos:', e); } }   // 18/09: abrir a janela Pokémon confere os golpes do learnset até o nível (o que ficou pra trás entra ou vira pendência)
  const pop = nome === 'pokemon' ? (aba === 'caixa' ? null : popupPk()) : nome === 'mochila' ? popupMo() : nome === 'missoes' ? popupMi() : nome === 'treinador' ? popupTr() : nome === 'mapa' ? popupMa() : nome === 'social' ? popupSo() : nome === 'pokedex' ? popupDx() : nome === 'config' ? popupCf() : nome === 'raid' ? popupRd() : null;
  for (const q of [popPk, popMo, popMi, popTr, popMa, popSo, popDx, popCf, popRd]) if (q && q !== pop && Popup.aberto(q)) Popup.fechar(q);   // um pop-up de cada vez (P e depois I empilhava os dois)
  if (pop){                                                              // maquete do Figma no lugar da janela antiga
    $('janela').hidden = true;
    Popup.abrir(pop);
    if (pop.__def?.v2){ const t = pop.querySelector('[data-txt="titulo"]'); if (t && !t.textContent && t.dataset.exemplo) t.textContent = tr(t.dataset.exemplo); }   // rodada 29: título da maquete quando o jogo não escreve (Config, Mapa…)
    ctx.Som?.tocar?.('ui/sound_click', { volume: 0.5 });
    await dados(); render();
    return;
  }
  const j = $('janela'); j.hidden = false; j.dataset.janela = nome; j.classList.toggle('larga', nome === 'pokedex');
  abasDoLivro(j, nome);                                                  // pele da Amanda: as abas desenhadas na lombada do livro viram botões
  const reg = ctx.jogo?.hudLayout?.[Hud.presetAtual()]?.['jan-' + nome];   // janela com lugar/tamanho do editor de HUD
  if (reg) Hud.posicionar(j, { ...reg, oculto: false }, false); else Hud.limpar(j);
  $('j-titulo').innerHTML = `<i class="ic ic-${JANELAS[nome].icone}" style="display:inline-block;width:26px;height:26px;vertical-align:middle;margin-right:6px"></i>${tr(JANELAS[nome].titulo)}`;
  ctx.Som?.tocar?.('ui/sound_click', { volume: 0.5 });
  await dados();
  render();
}
/* Livro da Amanda: as 10 abas estão DESENHADAS no fundo (background-livro-menu); botões invisíveis por cima
   abrem as janelas (esquerda: Pokémon, Mochila, Missões, Loja, Pokédex · direita: Mapa, Batalha, Social,
   Treinador, Config). Só aparecem com a pele (CSS). */
const ABAS_LIVRO = [['esq', ['pokemon', 'mochila', 'missoes', 'loja', 'pokedex']], ['dir', ['mapa', 'batalha', 'social', 'treinador', 'config']]];
function abasDoLivro(j, nome){
  let el = j.querySelector('.livro-abas');
  if (!el){
    el = document.createElement('div'); el.className = 'livro-abas';
    for (const [lado, ids] of ABAS_LIVRO) ids.forEach((id, i) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.lado = lado; b.dataset.pos = String(i); b.dataset.j = id; b.title = JANELAS[id]?.titulo || id; b.onclick = () => abrir(id); el.appendChild(b); });
    j.appendChild(el);
  }
  el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.j === nome));
}
function abas(lista){
  const el = $('j-abas'); el.innerHTML = '';
  if (!abaAtual || !lista.some(a => a.id === abaAtual)) abaAtual = lista[0]?.id || null;
  for (const a of lista){ const b = document.createElement('button'); b.type = 'button'; b.textContent = a.nome; b.classList.toggle('on', a.id === abaAtual); b.onclick = () => { abaAtual = a.id; render(); }; el.appendChild(b); }
  return abaAtual;
}
function render(){
  if (!aberta) return;
  if (!D){ dados().then(repintar); return; }                             /* 19/09 (#relatos, Firefox): clique numa aba ou capítulo do pop-up enquanto o menus_dados.json ainda baixava (a 1ª janela aberta na sessão) chegava aqui com D null e quebrava em D.itens; espera a tabela e pinta de novo */
  if (aberta === 'pokemon' && popPk && Popup.aberto(popPk)){ encherPokemon(popPk); return; }
  if (aberta === 'mochila' && popMo && Popup.aberto(popMo)){ encherMochila(popMo); return; }
  if (aberta === 'missoes' && popMi && Popup.aberto(popMi)){ encherMissoes(popMi); return; }
  if (aberta === 'treinador' && popTr && Popup.aberto(popTr)){ encherTreinador(popTr); return; }
  if (aberta === 'mapa' && popMa && Popup.aberto(popMa)){ encherMapa(popMa); return; }
  if (aberta === 'social' && popSo && Popup.aberto(popSo)){ encherSocial(popSo); return; }
  if (aberta === 'pokedex' && popDx && Popup.aberto(popDx)){ encherPokedex(popDx); return; }
  if (aberta === 'config' && popCf && Popup.aberto(popCf)){ encherConfig(popCf); return; }   // rodada 24: o pop-up do Figma no lugar da tela antiga
  if (aberta === 'raid' && popRd && Popup.aberto(popRd)){ encherRaid(popRd); return; }   // rodada 26: banner da raid (quem enche é o raid_ui.mjs)
  const corpo = $('j-corpo'); corpo.innerHTML = '';
  ({ pokemon: rPokemon, mochila: rMochila, missoes: rMissoes, mapa: rMapa, pokedex: rPokedex, treinador: rTreinador, loja: rPremium, mercado: rLoja, social: rSocial, batalha: rBatalha, config: rConfig, atalho: rAtalho, raid: rRaid })[aberta](corpo);
  if (aberta !== 'pokemon'){                                              // pele da Amanda: o conteúdo vira as duas páginas do livro (CSS .paginas); sem pele é um div neutro
    const w = document.createElement('div'); w.className = 'paginas';
    while (corpo.firstChild) w.appendChild(corpo.firstChild);
    corpo.appendChild(w);
  }
}
function tecla(e){
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;
  const grade = !$('menu-grade').hidden;
  if (e.code === 'Escape' && popPrevia && Popup.aberto(popPrevia)){ fecharPrevia(); e.preventDefault(); e.stopImmediatePropagation(); return; }   // pop-up da prévia do adm (rodada 30)
  if (e.code === 'F7' && !e.repeat && ctx?.gm?.()){ previa(); e.preventDefault(); return; }   // rodada 30: paleta da prévia do adm
  if (e.code === 'Escape' && popEb && Popup.aberto(popEb)){ Popup.fechar(popEb); e.preventDefault(); e.stopImmediatePropagation(); return; }   // banner "Em breve" (v2)
  if (popIn && Popup.aberto(popIn)){ if (e.code === 'Escape'){ Popup.fechar(popIn); e.preventDefault(); } e.stopImmediatePropagation(); return; }   // escolha do inicial (v2, 18/09): Esc fecha sem escolher; as outras teclas não chegam ao jogo
  /* "Para qual evolução?" (20/09): a caixa fica esperando uma resposta, então ela segura o teclado inteiro — Esc responde
     "Agora não" e nenhuma outra tecla abre janela nem chega no jogo atrás dela. Tem de vir ANTES do Escape genérico daqui:
     este `tecla` é capture no window e é o primeiro a ver a tecla. */
  if (escolhaEvo){ if (e.code === 'Escape'){ escolhaEvo(null); e.preventDefault(); } e.stopImmediatePropagation(); return; }
  if (e.code === 'Escape'){ if (aberta || grade){ if (aberta) fechar(); else fecharGrade(); } else if (ctx.jogo?.alvo) return; else alternarGrade(); e.preventDefault(); e.stopImmediatePropagation(); return; }   // com alvo: o jogo limpa o alvo primeiro
  if (!e.ctrlKey && !e.altKey && !e.metaKey){
    const alvo = ORDEM.find(k => JANELAS[k].tecla === e.code);
    if (alvo && !e.repeat){ if (aberta === alvo) fechar(); else abrir(alvo); e.preventDefault(); e.stopImmediatePropagation(); return; }
  }
  if (aberta || grade || dialogoAberto()){ e.stopImmediatePropagation(); }   // janela (ou diálogo da aba Conta) aberta: o jogo não recebe teclas
}
const tipoHtml = t => `<span class="tipo" style="background:${ctx.R.COR_TIPO?.[t] || '#556'}">${t}</span>`;
const iconeItem = it => it?.i ? `background-image:url('./ui/itens/${it.i}.png')` : '';   // ícone recortado do pacote FairyGUI Item (tools/icones_itens.mjs)
const dinheiro = () => ctx.lerLS('dinheiro', 50000);
const setDinheiro = v => ctx.gravarLS('dinheiro', v);
const itensLS = () => ctx.lerLS('itens', {});

/* ------------------------------------------------------------------ Pokémon */
let selPokemon = 0;
import * as Hud from './hud.mjs';                                        // registro 'jan-<id>' do layout: posição/tamanho das janelas (editor de HUD)
const TETO_OBED = [20, 26, 32, 38, 46, 52, 58, 62, 70];                 // = TETO_NIVEL do index (GDD §7.4, teto duro; Elite vencida = 100)
const tetoObed = () => { const u = new URLSearchParams(location.search); if (u.has('elite') ? u.get('elite') !== '0' : !!ctx.lerLS('eliteVencida', false)) return 100; const q = u.get('insignias'); const n = q != null ? +q : (ctx.lerLS('insignias', []) || []).length; return TETO_OBED[Math.max(0, Math.min(8, n | 0))]; };
let confirmarSoltar = null;                                             // chave do Pokémon esperando o 2º clique do "Soltar"
let confirmarAprender = null;                                           // pop-up: slot do golpe esperando o 2º clique pra ser esquecido
const chaveDe = e => (e?.uid != null ? 'u:' + e.uid : e.glb + '|' + e.lv + '|' + e.nome);
const mesmoRegistro = (x, e) => (e?.uid != null ? String(x?.uid) === String(e.uid) : !!x && x.glb === e.glb && x.lv === e.lv && x.nome === e.nome);   /* 19/09: pelo uid primeiro — dois da mesma espécie e nível */   // `uid` da posse (servidor, 06/09): dois da mesma espécie e nível deixam de se confundir
function botaoSoltar(chave, n, seguindo){
  if (seguindo) return `<button type="button" class="btn" data-arr-nao="1" disabled title="troque de parceiro antes de soltar">Soltar</button>`;
  if (n <= 1) return `<button type="button" class="btn" data-arr-nao="1" disabled title="é o seu único Pokémon">Soltar</button>`;
  return confirmarSoltar === chave
    ? `<button type="button" class="btn perigo" data-arr-nao="1" data-soltar="${esc(chave)}" title="não tem volta">✔ Soltar de vez</button><button type="button" class="btn" data-arr-nao="1" data-soltar-nao="1">✖ Cancelar</button>`
    : `<button type="button" class="btn" data-arr-nao="1" data-soltar-pede="${esc(chave)}" title="libera o Pokémon (pede confirmação)">Soltar</button>`;
}
/** Solta de vez: tira do time (ou da caixa), grava, repinta a HUD e avisa. Irreversível — por isso o 2º clique. */
async function soltar(chave, origem){
  confirmarSoltar = null;
  const lista = origem === 'caixa' ? ctx.lerLS('caixa', []) : (ctx.jogo.time || []);
  const k = lista.findIndex(x => chaveDe(x) === chave); if (k < 0){ render(); return; }
  /* POSSE (06/09): com conta, quem tira o Pokémon da conta é o SERVIDOR — só depois do OK dele o cliente tira da lista. */
  const ok = await ctx.soltarNoServidor?.(lista[k]);
  if (ok && ok.ok === false){ Chat.sistema('Soltar: ' + (ok.erro || 'o servidor recusou') + '.'); render(); return; }
  const [foi] = lista.splice(k, 1);
  if (origem === 'caixa') ctx.gravarLS('caixa', lista);
  else { ctx.gravarLS('time', lista); ctx.pintarTime?.(true); ctx.atualizarSeguidorPainel?.(); }
  ctx.flutuar?.(ctx.jogo.ash, 'Adeus, ' + foi.nome + '! 👋', '#8ecbff');
  selPokemon = 0; render();
}
function ligarSoltar(corpo, origem){
  corpo.querySelectorAll('[data-soltar-pede]').forEach(b => b.onclick = () => { confirmarSoltar = b.dataset.soltarPede; render(); });
  corpo.querySelectorAll('[data-soltar-nao]').forEach(b => b.onclick = () => { confirmarSoltar = null; render(); });
  corpo.querySelectorAll('[data-soltar]').forEach(b => b.onclick = () => soltar(b.dataset.soltar, origem));
}
function timeAtual(){
  const p = ctx.jogo.semParceiro ? null : ctx.jogo.pika, lista = [];   // 13/09: sem inicial escolhido, o `pika` é só o modelo provisório (Pikachu escondido) — não pode aparecer na aba Pokémon
  /* 19/09 (lexlaine, thread 1550646404534509568, "dois poke iguais com o mesmo lvl"): o registro de quem está em campo era achado
     por espécie+nível e TODOS os que batiam saíam da lista — com dois Gyarados Lv 38, um deles seguindo, o outro sumia da janela
     (5/6 no time). Agora sai só o registro do próprio parceiro (pelo uid; sem uid, o 1º que bate), e a linha dele herda uid, shiny
     e sexo do registro (o ✨ sumia quando o shiny estava em campo, thesyvel). */
  const time = ctx.jogo.time || [];
  let k = -1;
  if (p){ if (p.uid != null) k = time.findIndex(t => t && String(t.uid) === String(p.uid)); if (k < 0) k = time.findIndex(t => t && t.glb === p.glb && t.lv === p.lv); }
  const reg = k >= 0 ? time[k] : null;
  if (p) lista.push({ seguindo: true, uid: p.uid ?? reg?.uid ?? null, shiny: !!(reg ? reg.shiny : p.shiny), sexo: reg?.sexo, dex: p.dex || ctx.dexDoGlb(p.glb), glb: p.glb, nome: p.nome, lv: p.lv, hp: p.hp, maxHp: p.maxHp, exp: p.exp, amizade: p.amizade, ivs: p.ivs, natureza: p.natureza, movs: p.movs, aprender: p.aprender });
  time.forEach((t, i) => { if (t && i !== k) lista.push({ ...t }); });
  return lista;
}
function fichaHtml(e){
  const S = ctx.porDex.get(e.dex); if (!S) return `<div class="ficha"><h3>${esc(e.nome)}</h3><small>sem dados na pokédex</small></div>`;
  const lv = e.lv || 5, bs = S.bs || [45, 45, 45, 45, 45, 45];
  const nomes = ['HP', 'Ataque', 'Defesa', 'At. Esp.', 'Def. Esp.', 'Velocidade'];
  const stats = ctx.Ind ? ctx.Ind.statsDe(S, { ...e, lv }) : bs.map((b, i) => i === 0 ? ctx.R.hpAt(b, lv) : ctx.R.statAt(b, lv));   // IV + natureza do indivíduo
  const nat = ctx.Ind?.natureza(e.natureza), seta = i => !nat || nat[1] === nat[2] ? '' : i === nat[1] ? ' <span class="mais">▲</span>' : i === nat[2] ? ' <span class="menos">▼</span>' : '';
  const movs = e.movs?.length ? e.movs.map(m => ({ ...(ctx.golpe?.(m.id) || { nome: m.id, tipo: '' }), pp: m.pp, ppMax: m.ppMax })) : (ctx.golpesDe?.(e.dex) || []);   // golpes do indivíduo (PP) ou, sem registro, os da espécie
  const golpes = movs.map(g => `<div class="linha" style="cursor:default"><span class="nome"><b>${esc(g.nome)}</b><small>poder ${g.poder ?? '—'} · recarga ${g.recarga ?? '—'}s${g.ppMax != null ? ' · PP ' + g.pp + '/' + g.ppMax : ''}</small></span>${tipoHtml(g.tipo)}</div>`).join('');
  const novo = e.aprender?.[0] ? (ctx.golpe?.(e.aprender[0]) || null) : null;
  const aprender = novo ? `<div class="evo-linha" style="margin-top:6px"><b>✧ quer aprender ${esc(novo.nome)}</b> <small>${esc(novo.tipo || '')} · poder ${novo.poder ?? '—'} · PP ${ctx.Ind?.ppDe?.(novo.id) ?? '?'}</small><div style="margin-top:4px;font-size:12px">esquecer: ${movs.map((g, i) => `<button type="button" class="btn" data-aprender="${i}">${esc(g.nome)}</button>`).join(' ')} <button type="button" class="btn" data-aprender="-1">não aprender</button></div></div>` : '';
  // regras dos jogos originais (evolucao.mjs): cada evolução com o que falta / ✔ pronto
  const ops = ctx.opcoesEvolucao?.(e) || [];
  const evo = ops.length ? ops.map(o => `<div class="evo-linha"><b>→ ${esc(o.nome)}</b> <small>${esc(o.regra.texto)}</small><br>${!o.glb ? '<span class="falta">' + esc(tr('em breve')) + '</span>' : o.pode ? '<span class="ok">✔ pronto' + (o.itemNome ? ' (usa ' + esc(o.itemNome) + ')' : '') + '</span>' : '<span class="falta">' + esc(o.falta) + '</span>'}</div>`).join('') : 'não evolui';
  const prox = ctx.expPara?.(e.dex, lv + 1), xp = (e.exp != null && prox ? `XP ${e.exp}/${prox}` : '') + (e.expReserva > 0 ? ' · ' + e.expReserva + ' XP guardada' : '');
  return `<div class="ficha"><div class="mini"><img src="./ui/mon/pm${String(e.dex).padStart(4, '0')}.png" alt=""></div><h3>${e.shiny ? '✨ ' : ''}${esc(e.nome)} <small style="color:var(--muted)">Nº ${String(e.dex).padStart(3, '0')} · Lv ${lv}${lv > tetoObed() ? ' <span class="falta" title="acima do teto de nível: não obedece até a próxima insígnia">🔒 teto ' + tetoObed() + '</span>' : lv >= tetoObed() ? ' <span class="falta" title="no teto de nível: a XP fica guardada até a próxima insígnia">🔒 no teto</span>' : ''}${xp ? ' · ' + xp : ''}${e.amizade != null ? ' · amizade ' + e.amizade : ''}${e.seguindo ? ' · seguindo' : ''}</small></h3>
    <div>${(S.types || []).map(tipoHtml).join('')} <small style="color:var(--muted)">${S.kg ? S.kg + ' kg' : ''}</small></div>
    <div class="hp"><b style="width:${Math.round(100 * (e.hp ?? stats[0]) / (e.maxHp || stats[0]))}%"></b></div>
    <table class="stats">${stats.map((v, i) => `<tr><td>${nomes[i]}${seta(i)}</td><td>${v}</td><td class="iv">${e.ivs ? 'IV ' + e.ivs[i] : ''}</td></tr>`).join('')}<tr><td>total base</td><td>${S.bst || bs.reduce((a, b) => a + b, 0)}</td><td class="iv">${e.ivs ? 'IV ' + ctx.Ind.somaIV(e) + '/' + ctx.Ind.IV_TOTAL : ''}</td></tr>${e.natureza ? `<tr><td>natureza</td><td colspan="2"><b>${esc(e.natureza)}</b> <small style="color:var(--muted)">${esc(ctx.Ind.descNatureza(e.natureza))}</small></td></tr>` : ''}</table>
    <div class="k" style="margin-top:8px;color:var(--muted);font-size:11px">golpes</div><div class="lista">${golpes || '<small>—</small>'}</div>${aprender}${reaprenderHtml(e)}
    <div style="margin-top:8px;font-size:12px">${evo}</div></div>`;
}
/* ------------------------------------------------------------------ Caixa: arrastar entre o time e a caixa (20/09)
   Pedido do Jaime: "o cara poder arrastar e trocar o time (quando não está em batalha), tipo re-ordenar. Hoje o
   usuário precisa fazer gambiarra e jogar todos pra dentro da caixa e retirar na ordem que quer."
   O servidor já aceitava a ordem nova (intenção `arranjo` → servidor/posse.mjs aplicarArranjo, que recebe o TIME e
   a CAIXA inteiros); faltava a mão. As duas listas ficam lado a lado — arrastar dentro do time reordena, arrastar
   de um lado pro outro move, e com o time cheio a casa escolhida TROCA com quem vem da caixa.
   O caminho antigo continua de pé: "Trazer para o time" aqui e "Enviar para a caixa" na aba Time. As setas ↑ ↓ e o
   botão "→ caixa" fazem o mesmo sem arrastar (teclado e mouse), que é o caminho de quem não consegue arrastar. */
/** Qual casa do time está em campo (a mesma conta do timeAtual, pelo uid primeiro). */
function indiceEmCampo(){
  const p = ctx.jogo.semParceiro ? null : ctx.jogo.pika;
  if (!p) return -1;
  const time = ctx.jogo.time || [];
  let k = -1;
  if (p.uid != null) k = time.findIndex(t => t && String(t.uid) === String(p.uid));
  if (k < 0) k = time.findIndex(t => t && t.glb === p.glb && t.lv === p.lv);
  return k;
}
function linhaPk(e, marca, botoes, preso){
  const pct = e.maxHp ? Math.round(100 * ((e.hp == null ? e.maxHp : e.hp) / e.maxHp)) : 100;
  return `<div class="linha"${preso ? ' data-arr-preso="1"' : ''}><span class="nome"><b>${e.shiny ? '✨ ' : ''}${esc(e.nome)}${marca}</b><small>Lv ${e.lv} · Nº ${String(e.dex).padStart(3, '0')}</small><div class="hp"><b style="width:${pct}%"></b></div></span>${botoes}</div>`;
}
function rCaixa(corpo){
  const time = ctx.jogo.time || [], caixa = ctx.lerLS('caixa', []) || [], emCampo = indiceEmCampo();
  const setas = (i, preso) => `<span class="arr-mini"><button type="button" class="btn" data-arr-nao="1" data-sobe="${i}" title="${esc(tr('sobe um lugar'))}">↑</button><button type="button" class="btn" data-arr-nao="1" data-desce="${i}" title="${esc(tr('desce um lugar'))}">↓</button><button type="button" class="btn" data-arr-nao="1" ${preso ? `disabled title="${esc(tr(i === emCampo ? 'troque de parceiro antes' : 'é o seu único Pokémon'))}"` : `data-guardar="${i}" title="${esc(tr('manda pra caixa'))}"`}>→ ${esc(tr('caixa'))}</button></span>`;
  const linhasT = time.map((e, i) => { const preso = i === emCampo || time.length <= 1;
    return linhaPk(e, i === emCampo ? ' <small>· ' + esc(tr('em campo')) + '</small>' : (e.hp === 0 ? ' <small style="color:#f58e8e">· ' + esc(tr('desmaiado')) + '</small>' : ''), setas(i, preso), preso); }).join('');
  const linhasC = caixa.map((e, i) => linhaPk(e, '', `<button type="button" class="btn" data-arr-nao="1" data-trazer="${i}" ${time.length >= 6 ? `disabled title="${esc(tr('o time está cheio — arraste pra cima de um do time pra trocar'))}"` : ''}>${esc(tr('Trazer para o time'))}</button>${botaoSoltar(chaveDe(e), 2, false)}`, false)).join('');
  corpo.innerHTML = `<div class="dois arr-dois">
    <div class="arr-col"><div class="arr-titulo">${esc(tr('Time'))} <small>${time.length}/6</small></div>
      <div class="arr-dica">${esc(tr('arraste pra mudar a ordem — no celular, segure o dedo pra pegar'))}</div>
      <div class="lista" id="arr-time">${linhasT || `<div class="vazio">${esc(tr('Sem Pokémon no time.'))}</div>`}</div></div>
    <div class="arr-col"><div class="arr-titulo">${esc(tr('Caixa'))} <small>${caixa.length}</small></div>
      <div class="arr-dica">${esc(tr('arraste um daqui pro time (time cheio = troca com a casa onde soltar)'))}</div>
      <div class="lista" id="arr-caixa">${linhasC || `<div class="vazio">${esc(tr('A caixa está vazia. "Enviar para a caixa", na aba Time, guarda um Pokémon aqui.'))}</div>`}</div></div></div>`;
  const cT = corpo.querySelector('#arr-time'), cC = corpo.querySelector('#arr-caixa');
  cT.querySelectorAll('.linha').forEach((n, i) => { n.__arrItem = time[i]; });
  cC.querySelectorAll('.linha').forEach((n, i) => { n.__arrItem = caixa[i]; });
  const fim = () => { selPokemon = 0; ctx.atualizarSeguidorPainel?.(); render(); };
  if (Arr.ligado()){
    Arr.ligar(cT, { lista: 'time', grupo: 'janela-pokemon', seletor: '.linha', previa: 'mover', rolavel: cT, aoFim: fim });
    Arr.ligar(cC, { lista: 'caixa', grupo: 'janela-pokemon', seletor: '.linha', previa: 'mover', rolavel: cC, aoFim: fim });
  }
  corpo.querySelectorAll('[data-sobe]').forEach(b => b.onclick = () => { if (Arr.aplicar('time', +b.dataset.sobe, 'time', +b.dataset.sobe - 1)) fim(); });
  corpo.querySelectorAll('[data-desce]').forEach(b => b.onclick = () => { if (Arr.aplicar('time', +b.dataset.desce, 'time', +b.dataset.desce + 1)) fim(); });
  corpo.querySelectorAll('[data-guardar]').forEach(b => b.onclick = () => { if (Arr.aplicar('time', +b.dataset.guardar, 'caixa', caixa.length)) fim(); });
  corpo.querySelectorAll('[data-trazer]').forEach(b => b.onclick = () => { if (Arr.aplicar('caixa', +b.dataset.trazer, 'time', time.length)) fim(); });
  ligarSoltar(corpo, 'caixa');
}

function rPokemon(corpo){
  const aba = abas([{ id: 'time', nome: 'Time' }, { id: 'caixa', nome: 'Caixa' }]);
  if (aba === 'caixa'){ rCaixa(corpo); return; }
  const lista = timeAtual();
  if (!lista.length){ corpo.innerHTML = '<div class="vazio">Sem Pokémon ainda — escolha o inicial no laboratório do Oak.</div>'; return; }
  if (selPokemon >= lista.length) selPokemon = 0;
  const e = lista[selPokemon];
  corpo.innerHTML = `<div class="dois"><div class="lista">${lista.map((p, i) => `<div class="linha ${i === selPokemon ? 'on' : ''}" data-i="${i}"><span class="nome"><b>${p.shiny ? '✨ ' : ''}${esc(p.nome)}${p.sexo === 'm' ? ' <small class="sexo m">♂</small>' : p.sexo === 'f' ? ' <small class="sexo f">♀</small>' : ''}${p.seguindo ? ' <small>· seguindo</small>' : ''}${p.hp === 0 ? ' <small style="color:#f58e8e">· desmaiado</small>' : ''}</b><small>Lv ${p.lv} · Nº ${String(p.dex).padStart(3, '0')}</small><div class="hp"><b style="width:${p.maxHp ? Math.round(100 * p.hp / p.maxHp) : 100}%"></b></div></span>${(ctx.porDex.get(p.dex)?.types || []).map(tipoHtml).join('')}</div>`).join('')}${'<div class="linha vazia"></div>'.repeat(Math.max(0, 6 - lista.length))}
    <div style="color:var(--muted);font-size:11px;margin-top:6px">${lista.length}/6 no time</div></div>
    <div>${fichaHtml(e)}<div class="acoes">${e.seguindo ? (() => { const todas = ctx.opcoesEvolucao?.(e) || [], ops = todas.filter(o => o.glb), prontas = ops.filter(o => o.pode), breve = !ops.length && todas.find(o => !o.glb); return prontas.length ? prontas.map(o => `<button type="button" class="btn ouro" data-evo="${ops.indexOf(o)}" title="${esc(o.regra.texto)}">✧ Evoluir → ${esc(o.nome)}${o.itemNome ? ' (usa ' + esc(o.itemNome) + ')' : ''}</button>`).join('') : `<button type="button" class="btn ouro" disabled title="${esc(ops[0]?.falta || (breve ? breve.nome + ': ' + tr('em breve') : tr('não evolui')))}">✧ Evoluir${ops[0] ? ' — ' + esc(ops[0].falta) : breve ? ' — ' + esc(breve.nome) + ' (' + esc(tr('em breve')) + ')' : ''}</button>`; })() : `<button type="button" class="btn ouro" id="p-seguir">Seguir</button><button type="button" class="btn" id="p-caixa">Enviar para a caixa</button>`}${botaoSoltar(chaveDe(e), lista.length, !!e.seguindo)}${e.hp === 0 ? (() => { const r = ctx.reanimadorNaMochila?.(); return `<button type="button" class="btn ouro" id="p-reanimar" ${r ? '' : 'disabled'} title="${r ? 'usa ' + esc(r.nome) : 'compre um Reanimador no Pokémart'}">💊 ${r ? esc(r.nome) + ' (' + r.n + ')' : 'Reanimador — não tem na mochila'}</button>`; })() : ''}</div></div></div>`;
  corpo.querySelectorAll('[data-evo]').forEach(b => b.onclick = () => { const ops = (ctx.opcoesEvolucao?.(e) || []).filter(o => o.glb); fechar(); ctx.evoluir?.(ops[+b.dataset.evo]); });
  corpo.querySelector('#p-reanimar')?.addEventListener('click', () => { ctx.reanimarMembro?.(e); render(); });
  corpo.querySelectorAll('[data-i]').forEach(l => l.onclick = () => { selPokemon = +l.dataset.i; render(); });
  corpo.querySelector('#p-seguir')?.addEventListener('click', async () => { await ctx.seguir?.(e); selPokemon = 0; render(); });
  corpo.querySelectorAll('[data-aprender]').forEach(b => b.onclick = () => { ctx.aprenderGolpe?.(e, e.aprender[0], +b.dataset.aprender); render(); });
  corpo.querySelectorAll('[data-reaprender-id]').forEach(b => b.onclick = () => { ctx.reaprender?.(e, b.dataset.reaprenderId); render(); });   // 18/09: Reaprender na janela antiga
  ligarSoltar(corpo, 'time');
  corpo.querySelector('#p-caixa')?.addEventListener('click', () => { const t = ctx.jogo.time || []; const k = t.findIndex(x => mesmoRegistro(x, e)); if (k < 0) return; const [saiu] = t.splice(k, 1); ctx.gravarLS('time', t); const cx = ctx.lerLS('caixa', []); cx.push(saiu); ctx.gravarLS('caixa', cx); ctx.atualizarSeguidorPainel?.(); selPokemon = 0; render(); });
}
let escolhaEvo = null;                                                   // resposta pendente da caixa "Para qual evolução?" (null = caixa fechada); o `tecla()` lê daqui
/* ESCOLHER PARA QUEM EVOLUIR (20/09, chaospider no #bugs "Evolução Eevee": "se eu for direto para a aba do pokémon, ele só
   estava me dando a opção de evoluir para a Vaporeon, sem me dar opção de qualquer outra, mesmo eu tendo a pedra evolutiva
   disponível"). A janela nova (e o ✧ da grade do HUD) tem UM botão de evoluir e ele pegava sempre a primeira regra da espécie
   que já dava — no Eevee a ordem da tabela começa em Vaporeon, então as outras pedras não tinham como ser usadas por ali.
   Com mais de uma evolução pronta, esta caixinha pergunta. Devolve a opção escolhida, ou null se ele desistir. */
export function escolherEvolucao(e, ops){
  return new Promise(resolve => {
    if (!Array.isArray(ops) || !ops.length){ resolve(null); return; }
    if (ops.length === 1){ resolve(ops[0]); return; }
    if (document.querySelector('.ev-escolha')){ resolve(null); return; }
    /* A CAIXA PRENDE A TELA (revisão de 20/09). A primeira versão era um retângulo solto no meio da tela: o teclado ficava
       travado (DIALOGOS), mas o MOUSE não — dava pra clicar na grade do time atrás dela e trocar de parceiro com a pergunta
       aberta; a resposta chegava depois e evoluía QUEM ENTROU EM CAMPO. Agora ela vem dentro de um fundo que cobre tudo e
       engole o clique, e Esc responde "Agora não". */
    const fundo = document.createElement('div'); fundo.className = 'ev-escolha';
    Object.assign(fundo.style, { position: 'fixed', inset: '0', zIndex: '700', background: 'rgba(4,8,18,.55)',
      display: 'grid', placeItems: 'center', padding: '16px' });
    const d = document.createElement('div');
    Object.assign(d.style, { width: 'min(420px, 92%)',
      background: '#0F1A2E', border: '2px solid #F8C237', borderRadius: '16px', padding: '18px',
      font: '700 13px "Nunito Sans", system-ui, sans-serif', color: '#B8C2D9', display: 'grid', gap: '8px' });
    fundo.appendChild(d);
    const tit = document.createElement('div');
    Object.assign(tit.style, { font: '800 18px \'Baloo 2\', system-ui', color: '#F8C237', textAlign: 'center' });
    tit.textContent = tr('Para qual evolução?');
    const sub = document.createElement('div');
    Object.assign(sub.style, { textAlign: 'center', lineHeight: '1.3' });
    sub.textContent = (e?.nome || 'Este Pokémon') + ' ' + tr('pode evoluir de mais de um jeito. Escolha:');
    d.append(tit, sub);
    const fim = op => { escolhaEvo = null; fundo.remove(); DIALOGOS.delete(fundo); resolve(op || null); };
    for (const t of ['pointerdown', 'pointerup', 'click', 'wheel', 'touchstart']) fundo.addEventListener(t, ev => ev.stopPropagation());   // nada do que acontece aqui chega no jogo nem na HUD atrás
    for (const o of ops){
      const b = document.createElement('button'); b.type = 'button';
      Object.assign(b.style, { background: '#13254A', border: '1px solid #F8C237', borderRadius: '10px', padding: '9px', color: '#F8C237', font: 'inherit', cursor: 'pointer', textAlign: 'left' });
      b.textContent = '✦ ' + o.nome + (o.itemNome ? ' — ' + tr('usa') + ' ' + o.itemNome : ' — ' + tr(o.regra?.texto || ''));
      b.onclick = () => fim(o);
      d.appendChild(b);
    }
    const nao = document.createElement('button'); nao.type = 'button'; nao.textContent = tr('Agora não');
    Object.assign(nao.style, { background: '#0B1220', border: '1px solid rgba(248,194,55,.4)', borderRadius: '10px', padding: '9px', color: '#B8C2D9', font: 'inherit', cursor: 'pointer' });
    nao.onclick = () => fim(null);
    d.appendChild(nao);
    escolhaEvo = fim;                                                    // o `tecla()` lá em cima usa isto pro Esc e pra não deixar tecla nenhuma passar
    document.body.appendChild(fundo); DIALOGOS.add(fundo);
  });
}

/* ============================================================ pop-up Pokémon (maquete do Figma, rodada 5)
   O `popup.mjs` desenha e avisa; as contas e as ações são as mesmas de sempre, logo acima. A lista tem 6 casas fixas:
   as sobrando ficam com os textos vazios e a barra a zero, como na maquete. */
let popPk = null;
/** A maquete vem por orientação (`popups.pc` e `popups.deitado`); no celular ainda não há pop-up ligado. */
function defPopup(nome){
  const ori = ctx.MOBILE ? (Hud.presetAtual() === 'celular_deitado' ? 'deitado' : null) : 'pc';   // celular em pé não tem maquete: janela antiga
  if (!ori) return null;
  const ps = ctx.jogo?.hudLayout?.popups;
  return ps?.[ori]?.[nome] || null;
}
function popupPk(){
  if (popPk) return popPk;
  const def = defPopup('pokemon');
  if (new URLSearchParams(location.search).get('popup') === '0') return null;   // ?popup=0 volta pra janela antiga (e é por onde se chega na Caixa)
  if (!def) return null;                                                 // sem maquete (celular em pé): janela antiga
  popPk = Popup.montar(def, {
    item: i => { selPokemon = i; confirmarSoltar = null; confirmarAprender = null; reaprenderAberto = false; render(); },
    acao: nome => acaoPokemon(nome),
    fechar: () => { if (aberta === 'pokemon') aberta = null; confirmarAprender = null; },
  });
  /* Golpe novo na fila (subiu de nível com 4 golpes): a maquete não tem lugar pra isso, então os 4 cards viram botões
     ("clique no golpe que vai esquecer", 2 cliques) e a linha da evolução vira o "não aprender". Está no relatório pra Amanda. */
  for (let i = 1; i <= 4; i++){
    const g = Popup.grupo(popPk, 'golpe-' + i);
    if (g) g.addEventListener('click', ev => { ev.stopPropagation(); acaoPokemon('golpe-' + i); });
  }
  const evoEl = popPk.querySelector('[data-fig="ficha"] [data-txt="evolucao"]');
  if (evoEl) evoEl.addEventListener('click', ev => { ev.stopPropagation(); acaoPokemon('nao-aprender'); });
  montarReaprender(popPk);                                                // 18/09: botão "↻ Reaprender" + lista (nós sintéticos por cima dos cards de golpe)
  return popPk;
}
/** Nome pt do tipo (a tabela de cores do Figma usa os mesmos nomes de ui/tipo/). */
const TIPO_FIG = { Normal: 'normal', Fire: 'fogo', Water: 'agua', Grass: 'planta', Electric: 'eletrico', Ice: 'gelo',
  Fighting: 'lutador', Poison: 'venenoso', Ground: 'terrestre', Flying: 'voador', Psychic: 'psiquico', Bug: 'inseto',
  Rock: 'pedra', Ghost: 'fantasma', Dragon: 'dragao', Dark: 'noturno', Steel: 'metalico', Fairy: 'fada' };
const iconeMonU = dex => './ui/mon/pm' + String(dex).padStart(4, '0') + '.png';

/* REAPRENDER (18/09, xkuuhaaku "move relearner", dv_dasmerces "tem como reaprender um golpe?"): a maquete da Amanda não tem lugar próprio,
   então um botão sintético "↻ Reaprender (N)" entra na linha do rótulo "Golpes", encostado à direita dos cards, e abre uma lista (nó
   sintético por cima dos 4 cards) com os golpes do learnset até o nível atual que o Pokémon não tem. Escolher um vira a pendência da
   linha "✧ quer aprender X — clique no golpe que vai esquecer" (com vaga livre entra na hora). Vale pro PC e pro celular deitado, padrão
   e v2 (as caixas são lidas dos nós da maquete); a janela antiga (?popup=0, celular em pé) tem o bloco "↻ Reaprender golpe" na ficha. */
let reaprenderAberto = false;
function reaprenderHtml(e){                                              // janela antiga
  const lista = ctx.golpesReaprender?.(e) || []; if (!lista.length) return '';
  return `<details class="reaprender" style="margin-top:6px"><summary data-reaprender="1" style="cursor:pointer;font-size:12px">↻ ${esc(tr('Reaprender golpe'))} (${lista.length})</summary><div style="margin-top:4px;font-size:12px">${lista.map(g => `<button type="button" class="btn" data-reaprender-id="${esc(g.id)}" title="Lv ${g.lv} · ${esc(g.tipo || '')} · poder ${g.poder ?? '—'}">${esc(g.nome)} <small>Lv ${g.lv}</small></button>`).join(' ')}</div></details>`;
}
function montarReaprender(pop){
  const f = Popup.grupo(pop, 'ficha'); if (!f || f.querySelector('.gp-reaprender-btn')) return;
  const px = v => parseFloat(v) || 0;
  const cards = [1, 2, 3, 4].map(i => Popup.grupo(pop, 'golpe-' + i)).filter(Boolean); if (!cards.length) return;
  const rot = f.querySelector('[data-txt="rotulo-golpes"]');
  const esq = Math.min(...cards.map(c => px(c.style.left))), dir = Math.max(...cards.map(c => px(c.style.left) + px(c.style.width)));
  const topo = Math.min(...cards.map(c => px(c.style.top))), fundo = Math.max(...cards.map(c => px(c.style.top) + px(c.style.height)));
  const h = Math.max(14, rot ? px(rot.style.height) : 16), w = Math.min(150, Math.round((dir - esq) * 0.5)), y = rot ? px(rot.style.top) : Math.max(0, topo - h - 4);
  const fs = Math.max(9, (rot ? px(rot.style.fontSize) : 12) - 1) + 'px', fonte = rot?.style.fontFamily || 'inherit';
  const b = document.createElement('button'); b.type = 'button'; b.className = 'gp-reaprender-btn'; b.dataset.reaprender = '1';
  Object.assign(b.style, { position: 'absolute', left: (dir - w) + 'px', top: y + 'px', width: w + 'px', height: h + 'px', zIndex: '900', boxSizing: 'border-box', margin: '0', padding: '0 6px', border: '1px solid rgba(255,255,255,.35)', borderRadius: (h / 2) + 'px', background: 'rgba(20,28,48,.85)', color: '#fff', fontFamily: fonte, fontSize: (w < 120 ? Math.max(9, Math.round(parseFloat(fs) * 0.85)) + 'px' : fs), lineHeight: '1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', pointerEvents: 'auto', display: 'none' });   // celular (cards de 179 px): fonte um pouco menor e sem o contador
  const l = document.createElement('div'); l.className = 'gp-reaprender-lista';
  Object.assign(l.style, { position: 'absolute', left: esq + 'px', top: topo + 'px', width: (dir - esq) + 'px', height: (fundo - topo) + 'px', zIndex: '901', boxSizing: 'border-box', padding: '6px 8px', overflowY: 'auto', borderRadius: '10px', border: '1px solid rgba(255,255,255,.3)', background: 'rgba(12,18,32,.96)', color: '#fff', fontFamily: fonte, fontSize: fs, lineHeight: '1.25', textAlign: 'left', pointerEvents: 'auto', display: 'none' });
  b.addEventListener('click', ev => { ev.stopPropagation(); reaprenderAberto = !reaprenderAberto; render(); });
  l.addEventListener('click', ev => {
    ev.stopPropagation();
    if (ev.target.closest('[data-reaprender-fechar]')){ reaprenderAberto = false; render(); return; }
    const alvo = ev.target.closest('[data-reaprender-id]'); if (!alvo) return;
    const e = timeAtual()[selPokemon]; reaprenderAberto = false; confirmarAprender = null;
    if (e) ctx.reaprender?.(e, alvo.dataset.reaprenderId);
    render();
  });
  f.appendChild(b); f.appendChild(l);
}
function atualizarReaprender(pop, e){
  const b = pop.querySelector('.gp-reaprender-btn'), l = pop.querySelector('.gp-reaprender-lista'); if (!b || !l) return;
  const lista = e ? (ctx.golpesReaprender?.(e) || []) : [];
  if (!lista.length) reaprenderAberto = false;
  b.style.display = lista.length ? 'block' : 'none';
  b.textContent = '↻ ' + tr('Reaprender') + ((parseFloat(b.style.width) || 0) < 120 ? '' : ' (' + lista.length + ')');
  b.title = tr('Golpes que ele aprende até o nível atual e ainda não tem');
  l.style.display = reaprenderAberto ? 'block' : 'none';
  if (!reaprenderAberto) return;
  const btn = 'display:inline-block;margin:3px 4px 3px 0;padding:3px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.12);color:#fff;font:inherit;cursor:pointer';
  l.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><b>↻ ' + esc(tr('Reaprender')) + '</b><small style="opacity:.8;margin:0 6px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(tr('clique no golpe que quer de volta')) + '</small><button type="button" data-reaprender-fechar="1" style="' + btn + ';margin:0;padding:1px 7px">✕</button></div>'
    + lista.map(g => '<button type="button" data-reaprender-id="' + esc(g.id) + '" style="' + btn + '" title="Lv ' + g.lv + ' · ' + esc(g.tipo || '') + ' · poder ' + (g.poder ?? '—') + '">' + esc(g.nome) + ' <small style="opacity:.75">Lv ' + g.lv + '</small></button>').join('');
}
function acaoPokemon(nome){
  const lista = timeAtual(), e = lista[selPokemon]; if (!e) return;
  const novo = e.aprender?.[0] || null;
  if (/^golpe-\d$/.test(nome)){                                          // card do golpe: 1º clique pede confirmação, 2º esquece esse e aprende o novo
    const slot = +nome.split('-')[1] - 1;
    if (!novo || slot >= (e.movs || []).length) return;
    if (confirmarAprender !== slot){ confirmarAprender = slot; render(); return; }
    confirmarAprender = null; ctx.aprenderGolpe?.(e, novo, slot); render(); return;
  }
  if (nome === 'nao-aprender'){ if (!novo) return; confirmarAprender = null; ctx.aprenderGolpe?.(e, novo, -1); render(); return; }
  if (nome === 'evoluir'){
    const ops = (ctx.opcoesEvolucao?.(e) || []).filter(o => o.glb && o.pode);
    if (!ops.length) return;
    /* MAIS DE UMA EVOLUÇÃO PRONTA (20/09, chaospider no #bugs "Evolução Eevee"): o botão é um só e pegava sempre a PRIMEIRA
       regra da espécie — Eevee com a Pedra da Água, a do Fogo e a do Trovão na mochila só virava Vaporeon. Agora ele pergunta. */
    /* a resposta chega DEPOIS: confere de novo que é o mesmo Pokémon em campo e que a regra ainda vale (revisão de 20/09) */
    if (ops.length > 1){ escolherEvolucao(e, ops).then(o => {
      if (!o || !e.seguindo) return;
      if (!(ctx.opcoesEvolucao?.(e) || []).some(x => x.glb && x.pode && x.dex === o.dex)) return;
      fechar(); ctx.evoluir?.(o);
    }); return; }
    fechar();                                                            // o clarão da evolução fica por cima; a janela sai antes (como na janela antiga)
    ctx.evoluir?.(ops[0]);
    return;
  }
  if (nome === 'soltar'){
    const chave = chaveDe(e);
    if (e.seguindo || lista.length <= 1) return;
    if (confirmarSoltar === chave) soltar(chave, 'time');                // 2º clique: vai
    else { confirmarSoltar = chave; render(); }                          // 1º clique: pede confirmação
  }
}
/** Escreve os dados de verdade nas áreas da maquete (os ids são os do Figma). */
function encherPokemon(pop){
  const lista = timeAtual();
  if (selPokemon >= lista.length) selPokemon = 0;
  Popup.rotulo(pop, 'titulo');                                          // título como a maquete escreve (PC: "Pokémon - Meu time"; celular: "Pokémon")
  Popup.texto(pop, 'contagem-time', lista.length + '/6 no time');
  const pref = pop.__prefItem || 'item-time';                            // PC: item-time-N (cartão completo); celular: slot-poke-N (cabeça + tecla)
  for (let i = 0; i < 6; i++){
    const it = Popup.item(pop, i, pref); if (!it) continue;
    const p = lista[i], S = p && ctx.porDex.get(p.dex);
    Popup.itemVazio(pop, i, !p, pref);                                   // slot sem Pokémon: só o cartão
    Popup.texto(pop, 'tecla', String(i + 1), it);                        // celular: número do slot
    if (!p) continue;
    const tipo = S?.types?.[0] || null;
    Popup.texto(pop, 'item-nome', (p.shiny ? '✨ ' : '') + p.nome, it);   // shiny (14/09)
    Popup.texto(pop, 'item-status', p.seguindo ? 'Seguindo' : p.hp === 0 ? 'Desmaiado' : '', it);
    Popup.texto(pop, 'item-nivel', 'Lv ' + p.lv + ' · Nº ' + String(p.dex).padStart(3, '0'), it);
    Popup.badge(pop, 'item-tipo', tipo && TIPO_FIG[tipo], tipo && (S.types.length > 1 ? S.types.join(' · ') : tipo), it);   // 14/09 (l.neto): os dois tipos no mesmo selo (ícone/cor do primeiro)
    alinharTiposDoTime(pop, it, (S?.types || []).length);                // 18/09: 1 tipo na ponta direita, 2 tipos lado a lado, em toda linha
    iconesTipo(pop, it, S?.types || []);                                 // v2 (17/09): ícone(s) do tipo no cartão do time
    Popup.imagem(pop, 'pokemon', iconeMonU(p.dex), it);
    const hpI = p.hp ?? p.maxHp ?? 0;                                      // 17/09 (auditoria): registro sem `hp` (captura/inicial sem conta) = HP cheio, como o HUD do time (`t.hp ?? t.maxHp`); aqui saía "0/189" com a barra vazia
    const k = p.maxHp ? Math.max(0, Math.min(1, hpI / p.maxHp)) : 0;
    Popup.barra(pop, 'vida', k, corDaVida(k), it);
    Popup.texto(pop, 'vida', Math.round(hpI) + '/' + (p.maxHp ?? 0), it);
  }
  Popup.selecionar(pop, selPokemon + 1, pref, pref);
  encherFichaPokemon(pop, lista[selPokemon], lista);
}
/** Cores da barra: as mesmas faixas da Amanda que o conversor colheu (card-vida [estado:100|40|10]). */
function corDaVida(k){
  const c = ctx.jogo?.hudLayout?._figma?.faixas?.cores?.vida || {};
  return k > 0.5 ? (c['100'] || '#2FAE47') : k > 0.2 ? (c['40'] || '#D19A18') : (c['10'] || '#E5474D');
}
function encherFichaPokemon(pop, e, lista){
  const f = Popup.grupo(pop, 'ficha'); if (!f) return;
  const S = e && ctx.porDex.get(e.dex);
  const nada = (id, dentro) => Popup.texto(pop, id, '', dentro);
  if (!e || !S){
    for (const id of ['ficha-nome', 'ficha-status', 'ficha-numero', 'ficha-peso', 'natureza', 'evolucao', 'vida']) nada(id, f);
    Popup.badge(pop, 'ficha-tipo', null, null, f);
    Popup.imagem(pop, 'pokemon', null, f);
    for (let i = 0; i < 4; i++){ Popup.golpeVazio(pop, i, true); const no = Popup.grupo(pop, 'golpe-' + (i + 1)); if (no){ no.style.pointerEvents = ''; no.style.cursor = ''; } }
    Popup.botao(pop, 'evoluir', false, '✦ Evoluir'); Popup.botao(pop, 'soltar', false, 'Soltar');
    atualizarReaprender(pop, null);
    return;
  }
  const lv = e.lv || 5, bs = S.bs || [45, 45, 45, 45, 45, 45];
  const stats = ctx.Ind ? ctx.Ind.statsDe(S, { ...e, lv }) : bs.map((b, i) => i === 0 ? ctx.R.hpAt(b, lv) : ctx.R.statAt(b, lv));
  const prox = ctx.expPara?.(e.dex, lv + 1);
  const tipo = S.types?.[0] || null;
  Popup.texto(pop, 'ficha-nome', (e.shiny ? '✨ ' : '') + e.nome, f);   // shiny (14/09)
  Popup.texto(pop, 'ficha-status', e.seguindo ? 'Seguindo' : e.hp === 0 ? 'Desmaiado' : lv > tetoObed() ? 'No teto' : '', f);
  Popup.texto(pop, 'ficha-numero', 'Nº ' + String(e.dex).padStart(3, '0') + ' · Lv ' + lv
    + (e.exp != null && prox ? ' · XP ' + e.exp + '/' + prox : '') + (e.amizade != null ? ' · amizade ' + e.amizade : ''), f);
  Popup.badge(pop, 'ficha-tipo', tipo && TIPO_FIG[tipo], tipo && (S.types.length > 1 ? S.types.join(' · ') : tipo), f);   // 14/09 (l.neto): os dois tipos
  iconesTipo(pop, f, S.types || []);                                     // v2 (17/09): bolinha(s) do tipo na ficha (18/09: só a bolinha, a rodada 31 tirou o texto)
  Popup.texto(pop, 'ficha-peso', S.kg ? S.kg + ' kg' : '', f);
  pesoAposTipos(f, (S.types || []).length);                              /* 18/09 (rodada 32): o peso anda colado à última bolinha visível */
  Popup.imagem(pop, 'pokemon', iconeMonU(e.dex), f);
  const hp = e.hp ?? stats[0], maxHp = e.maxHp || stats[0];
  const k = maxHp ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  Popup.barra(pop, 'vida', k, corDaVida(k), f);
  Popup.texto(pop, 'vida', Math.round(hp) + '/' + maxHp, f);
  const IDS = ['hp', 'ataque', 'defesa', 'at-esp', 'def-esp', 'velocidade'];
  const nat = ctx.Ind?.natureza(e.natureza);
  const seta = i => (!nat || nat[1] === nat[2]) ? '' : i === nat[1] ? ' ▲' : i === nat[2] ? ' ▼' : '';
  IDS.forEach((id, i) => {
    Popup.texto(pop, 'stat-' + id + '-valor', stats[i] + seta(i), f);
    Popup.texto(pop, 'stat-' + id + '-iv', e.ivs ? 'IV ' + e.ivs[i] : '', f);
  });
  Popup.texto(pop, 'stat-total-valor', S.bst || bs.reduce((a, b) => a + b, 0), f);
  Popup.texto(pop, 'stat-total-iv', e.ivs && ctx.Ind ? 'IV ' + ctx.Ind.somaIV(e) + '/' + ctx.Ind.IV_TOTAL : '', f);
  Popup.texto(pop, 'natureza', e.natureza ? e.natureza + '  ' + (ctx.Ind?.descNatureza(e.natureza) || '') : '', f);
  const movs = e.movs?.length ? e.movs.map(m => ({ ...(ctx.golpe?.(m.id) || { nome: m.id, tipo: '' }), pp: m.pp, ppMax: m.ppMax })) : (ctx.golpesDe?.(e.dex) || []);
  for (let i = 0; i < 4; i++){
    const g = movs[i], no = Popup.grupo(pop, 'golpe-' + (i + 1));
    Popup.golpeVazio(pop, i, !g);
    iconesTipo(pop, no, g?.tipo ? [g.tipo] : []);                         // v2 (17/09): ícone do tipo do golpe (card vazio: esconde o encaixe)
    if (!g || !no) continue;
    Popup.texto(pop, 'golpe-nome', g.nome, no);
    Popup.texto(pop, 'golpe-info', 'poder ' + (g.poder ?? '—') + ' · recarga ' + (g.recarga ?? '—') + 's' + (g.ppMax != null ? ' · PP ' + g.pp + '/' + g.ppMax : ''), no);
    Popup.badge(pop, 'golpe-tipo', g.tipo && TIPO_FIG[g.tipo], g.tipo || null, no);
  }
  const novoId = e.aprender?.[0] || null, novo = novoId ? (ctx.golpe?.(novoId) || { nome: String(novoId) }) : null;
  for (let i = 0; i < 4; i++){                                           // golpe na fila: os 4 cards viram botões ("clique pra esquecer este")
    const no = Popup.grupo(pop, 'golpe-' + (i + 1)); if (!no) continue;
    const clicavel = !!novo && !!movs[i];
    no.style.pointerEvents = clicavel ? 'auto' : ''; no.style.cursor = clicavel ? 'pointer' : '';
    if (clicavel && confirmarAprender === i) Popup.texto(pop, 'golpe-info', '✔ clique de novo: esquece ' + movs[i].nome + ' e aprende ' + novo.nome, no);
  }
  const todasEvo = ctx.opcoesEvolucao?.(e) || [], ops = todasEvo.filter(o => o.glb);
  const pronta = ops.find(o => o.pode);
  /* EVOLUÇÃO SEM MODELO (17/09, Fulana no feedback: "a Chikorita não pode evoluir"): a regra da série existe (Bayleef no Lv 16), mas o
     modelo da evolução não foi exportado — o filtro por `glb` deixava a lista vazia e a ficha dizia "não evolui", que parece regra do
     jogo. São 39 espécies com modelo sem NENHUMA evolução exportada: os 24 iniciais de fora de Kanto (Chikorita, Cyndaquil, Totodile…),
     Golbat, Onix, Scyther, Chansey, Porygon, Magneton, Rhydon, Seadra, Electabuzz, Magmar, Lickitung, Tangela, Primeape, Shinx e Riolu. */
  const emBreve = ops.length ? null : todasEvo.find(o => !o.glb);
  const prontas = ops.filter(o => o.pode);                               // 20/09: TODAS as que já dão, não só a primeira (Eevee)
  const evoEl = Popup.texto(pop, 'evolucao', novo
    ? '✧ quer aprender ' + novo.nome + ' — clique no golpe que vai esquecer, ou aqui pra não aprender'
    : prontas.length > 1
      ? '→ pode evoluir para ' + prontas.map(o => o.nome).join(', ') + ' — clique em Evoluir e escolha'
      : ops.length
        ? '→ ' + ops[0].nome + ': ' + ops[0].regra.texto + (pronta ? '' : ' - ' + (ops[0].falta || 'ainda não'))
        : emBreve ? '→ ' + emBreve.nome + ': ' + emBreve.regra.texto + ' (em breve)' : 'não evolui', f);
  if (evoEl){ evoEl.style.pointerEvents = novo ? 'auto' : ''; evoEl.style.cursor = novo ? 'pointer' : ''; }
  Popup.botao(pop, 'evoluir', !!pronta && !!e.seguindo, prontas.length > 1 ? '✦ Evoluir (' + prontas.length + ' formas)' : pronta ? '✦ Evoluir → ' + pronta.nome : '✦ Evoluir');
  const podeSoltar = !e.seguindo && lista.length > 1;
  Popup.botao(pop, 'soltar', podeSoltar, confirmarSoltar === chaveDe(e) ? '✔ Soltar de vez' : 'Soltar');
  atualizarReaprender(pop, e);                                           // 18/09: botão/lista do Reaprender pro Pokémon selecionado
}

/* ------------------------------------------------------------------ Mochila */
function quantidades(){
  const q = { ...itensLS() };
  for (const [id, n] of Object.entries(ctx.jogo.bolas || {})) if (n > 0) q[id] = n;
  return q;
}
function rMochila(corpo){
  const q = quantidades();
  const tiposPresentes = new Set(Object.keys(q).map(id => D.itens[id]?.t).filter(Boolean));
  const ordem = [7, 9, 3, 4, 1, 2, 5, 6, 8, 10, 11, 12, 13, 14, 15];
  const lista = ordem.filter(t => tiposPresentes.has(t)).map(t => ({ id: String(t), nome: D.tipos[t] || ('tipo ' + t) }));
  const aba = abas(lista.length ? lista : [{ id: '7', nome: 'Pokébola' }]);
  const itens = Object.entries(q).filter(([id]) => String(D.itens[id]?.t) === aba && q[id] > 0);
  const av = avisoMo && Date.now() < avisoMo.ate ? avisoMo : null;         // 17/09: o motivo/resultado do "Usar no parceiro" aparece aqui, não atrás da janela
  const cab = `<div style="margin-bottom:8px;color:var(--muted);font-size:12px">💰 ${dinheiro().toLocaleString('pt-BR')} ${esc(D.moedas?.[1] || 'Moeda')}</div>`
    + (av ? `<div class="aviso-uso" style="margin:-2px 0 8px;font-size:13px;font-weight:700;color:${av.ok ? '#8ef58e' : '#ffd23a'}">${esc(tr(av.texto))}</div>` : '');
  if (!itens.length){ corpo.innerHTML = cab + '<div class="vazio">Nada aqui ainda. O Pokémart da cidade (fale com o vendedor) vende bolas e remédios; itens de missão chegam com as recompensas.</div>'; return; }
  corpo.innerHTML = cab + `<div class="grade-itens">${itens.map(([id, n]) => { const it = D.itens[id]; const bola = it.t === 7; const rem = it.t === 9; const evo = !bola && !rem && ctx.ehItemDeEvolucao?.(id); return `<div class="item q${it.q || 1}"><i class="ic-item" style="${iconeItem(it)}"></i><span class="n">×${n}</span><b>${esc(it.n)}${bola && String(ctx.jogo.bolaSel) === String(id) ? ' <small style="color:#ffe07a">(F)</small>' : ''}</b><small>${esc(it.d || D.tipos[it.t] || '')}</small><div class="acoes">${bola ? `<button type="button" class="btn" data-bola="${id}">Usar no F</button><button type="button" class="btn" data-atalho="${id}" title="prende no primeiro atalho livre (5–8)">⚡ Atalho</button>` : rem ? `<button type="button" class="btn" data-usar="${id}">Usar no parceiro</button><button type="button" class="btn" data-atalho="${id}" title="prende no primeiro atalho livre (5–8)">⚡ Atalho</button>` : evo ? `<button type="button" class="btn ouro" data-evoitem="${id}" title="evolui o parceiro se a regra dele usa este item">✧ Usar no parceiro</button>` : ''}</div></div>`; }).join('')}</div>`;
  corpo.querySelectorAll('[data-bola]').forEach(b => b.onclick = () => { ctx.jogo.bolaSel = b.dataset.bola; ctx.gravarLS('bolaSel', ctx.jogo.bolaSel); render(); });
  corpo.querySelectorAll('[data-evoitem]').forEach(b => b.onclick = () => { fechar(); ctx.usarItemEvolucao?.(b.dataset.evoitem); });
  corpo.querySelectorAll('[data-usar]').forEach(b => b.onclick = () => { const id = b.dataset.usar; ctx.usarItem?.(id, D.itens[id]?.n || '', (txt, ok) => avisarMo(id, txt, ok)); render(); });   // a cura em si vive no index (usarItem), igual à dos atalhos; o aviso volta pra janela (17/09)
  corpo.querySelectorAll('[data-atalho]').forEach(b => b.onclick = () => { const id = b.dataset.atalho, it = D.itens[id]; const slots = ctx.atalhos?.() || []; let i = slots.findIndex(s => !s); if (i < 0) i = slots.length - 1; ctx.definirAtalho?.(i, { tipo: 'item', id: +id, nome: it.n, icone: './ui/itens/' + it.i + '.png', bola: it.t === 7 }); render(); });
}

/* ============================================================ pop-up Mochila (maquete do Figma, rodada 7)
   Grade de 18 células que rola, busca por nome, 6 categorias na lateral, Usar e a lixeira (com confirmação).
   As categorias da maquete não existem no jogo: o inventário vem do dump indexado pelo `t` do item. Este é o de/para
   que escolhi (está no relatório pra ela): todos = tudo; pokebolas = 7; medicina = 9 (Recuperação); tm = 4 (Máquina
   Técnica); chave = 3 (Itens transportados, que são os de missão); customizacao = 11 (traje) + 12 (montaria). */
let popMo = null, catMo = 'todos', buscaMo = '', selMo = 0, confirmarDescarte = null;
const CATS_MO = { todos: null, pokebolas: [7], medicina: [9], tm: [4], chave: [3], customizacao: [11, 12] };
/* O que "Usar" faz no jogo hoje: Pokébola vira a bola escolhida, item de Recuperação (t=9: poções, Reanimador) cura, pedra
   evolui. TM, traje, montaria e item de missão NÃO têm uso pela mochila ainda — o botão fica desligado (antes o `usarItem`
   tratava tudo como poção e consumia o item). Descartar não vale pra item de missão (t=3) nem pra bola (mora em `bolas`). */
const podeUsarMo = a => a.it.t === 7 || a.it.t === 9 || !!ctx.ehItemDeEvolucao?.(a.id);
/* POR QUE NÃO USOU (17/09, Marcolino no #alpha-testers: "clico e não vai" na Poção): o Usar chama o `usarItem` do index, que só cura
   o Pokémon EM CAMPO e avisava flutuando em cima dele — atrás da janela (e sem aviso nenhum quando não era a vez na batalha). Agora o
   motivo (HP cheio, desmaiado, sem Pokémon, acabou) e o resultado ("recuperou 20 HP") ficam 4 s DENTRO da Mochila: na linha de dica do
   painel do item (v2 do PC), ao lado do Usar (Figma padrão) ou no vão entre a busca e as moedas (v2 do celular, que não tem botão). */
/* Item de evolução que VAI evoluir o parceiro agora (a mesma conta do `usarItemEvolucao` do index). Só esse pede confirmação no toque
   duplo: evoluir não tem volta, e dois toques rápidos numa pedra (pra ler a descrição, ou num celular lento) evoluíam na hora. */
const evoluiAgoraMo = a => a.it.t !== 7 && a.it.t !== 9 && !!ctx.ehItemDeEvolucao?.(a.id)
  && (ctx.opcoesEvolucao?.(ctx.jogo?.pika) || []).some(o => o.pode && o.glb && String(o.consome) === String(a.id));
let avisoMo = null;                                                        // { id, texto, ok, ate, confirmaEvo }
function avisarMo(id, texto, ok = false){
  avisoMo = { id: String(id), texto, ok: !!ok, ate: Date.now() + 4000 };
  clearTimeout(avisarMo.t); avisarMo.t = setTimeout(() => { avisoMo = null; if (aberta === 'mochila') render(); }, 4100);
}
/** Linha do aviso nas maquetes sem painel de detalhe: à esquerda do Usar ou, sem botão, entre a busca e as moedas. `av` = { texto, ok, dica } ou null. */
function linhaAvisoMo(pop, av){
  let el = pop.querySelector(':scope > [data-txt="aviso-uso"]');
  if (!el){
    const px = (no, k) => parseFloat(no?.style?.[k]) || 0;
    const btn = pop.querySelector(':scope > [data-tag="acao"][data-tagval="usar"]'), lista = Popup.grupo(pop, 'lista-itens');
    let f = null;
    if (btn && lista) f = { x: px(lista, 'left'), y: px(btn, 'top'), w: px(btn, 'left') - px(lista, 'left') - 14, h: px(btn, 'height'), al: 'right', tamanho: Math.round(px(btn, 'height') * 0.45) };
    else {
      const busca = Popup.grupo(pop, 'campo-busca'), moedas = ['gold', 'pokedollar'].map(n => Popup.grupo(pop, n)).filter(Boolean);
      if (busca && moedas.length){ const x = px(busca, 'left') + px(busca, 'width') + 8; f = { x, y: px(busca, 'top'), w: Math.min(...moedas.map(m => px(m, 'left'))) - x - 8, h: px(busca, 'height'), al: 'center', tamanho: Math.round(px(busca, 'height') * 0.32) }; }
    }
    if (!f || !(f.w > 40) || !(f.h > 8)) return;
    el = document.createElement('span'); el.className = 'pf-txt'; el.dataset.txt = 'aviso-uso';
    Hud.estiloTexto(el, { ...f, fonte: 'Nunito Sans', peso: 800, alV: 'center', regra: 'encolher' });
    el.style.zIndex = '950';
    pop.appendChild(el);
  }
  el.style.color = !av ? '' : av.ok ? '#8EF58E' : av.dica ? '#A9CFE0' : '#FFD23A';
  Popup.texto(pop, 'aviso-uso', av ? av.texto : '');
}
const podeDescartarMo = a => a.it.t !== 3 && a.it.t !== 7;
function popupMo(){
  if (popMo) return popMo;
  const def = defPopup('mochila');
  if (new URLSearchParams(location.search).get('popup') === '0') return null;
  if (!def) return null;
  popMo = Popup.montar(def, {
    aba: c => { catMo = c; selMo = 0; confirmarDescarte = null; render(); },
    acao: nome => acaoMochila(nome),
    digita: v => { buscaMo = v; selMo = 0; render(); },
    fechar: () => { if (aberta === 'mochila') aberta = null; },
  });
  return popMo;
}
/** Itens da categoria e da busca, ordenados por tipo e depois por nome (a maquete não tem botão de ordenar). */
function itensMochila(){
  if (!D) return [];                                                      // 18/09 (firer): a Mochila aberta antes do menus_dados.json chegar quebrava em D.itens ("Cannot read properties of null"); sem tabela, lista vazia até o carregarDados terminar
  const q = quantidades(), tipos = CATS_MO[catMo], busca = buscaMo.trim().toLowerCase();
  return Object.entries(q)
    .filter(([id, n]) => n > 0 && D.itens[id])
    .filter(([id]) => !tipos || tipos.includes(D.itens[id].t))
    .filter(([id]) => !busca || (D.itens[id].n || '').toLowerCase().includes(busca))
    .map(([id, n]) => ({ id, n, it: D.itens[id] }))
    .sort((a, b) => (a.it.t - b.it.t) || String(a.it.n).localeCompare(String(b.it.n), 'pt-BR'));
}
function acaoMochila(nome){
  const lista = itensMochila(), alvo = lista[selMo];
  if (!alvo) return;
  if (nome === 'usar'){
    confirmarDescarte = null;
    if (!podeUsarMo(alvo)){ avisarMo(alvo.id, 'esse item não se usa pela Mochila'); render(); return; }   // só chega aqui pelo toque duplo (o botão fica desligado)
    if (alvo.it.t === 7){ ctx.jogo.bolaSel = alvo.id; ctx.gravarLS('bolaSel', alvo.id); render(); return; }   // Pokébola: vira a bola escolhida
    if (ctx.ehItemDeEvolucao?.(alvo.id)){
      if (!evoluiAgoraMo(alvo)){ avisarMo(alvo.id, (alvo.it.n || 'esse item') + ' não tem efeito em ' + (ctx.jogo?.pika?.nome || 'seu Pokémon')); render(); return; }   // revisão (17/09): o aviso fica na janela (antes ela fechava e o aviso flutuava atrás)
      fechar(); ctx.usarItemEvolucao?.(alvo.id); return;
    }
    ctx.usarItem?.(alvo.id, alvo.it.n || '', (txt, ok) => avisarMo(alvo.id, txt, ok));
    render();
    return;
  }
  if (nome === 'descartar'){
    if (!podeDescartarMo(alvo)) return;
    if (confirmarDescarte !== alvo.id){ confirmarDescarte = alvo.id; render(); return; }   // 1º clique pede confirmação
    if (ctx.comConta?.()) ctx.bolsaOp('descartar', { item: +alvo.id }).then(() => render());   // com conta é o servidor que joga fora
    else { const itens = ctx.lerLS('itens', {}); delete itens[alvo.id]; ctx.gravarLS('itens', itens); }
    ctx.flutuar?.(ctx.jogo.ash, 'descartou ' + (alvo.it.n || 'item'), '#f58e8e');
    confirmarDescarte = null; selMo = 0; render();
  }
}
function encherMochila(pop){
  const lista = itensMochila();
  if (selMo >= lista.length) selMo = 0;
  Popup.trocarAba(pop, catMo);
  Popup.rotulo(pop, 'titulo');                                          // "Mochila" (só a página do celular tem)
  /* Duas moedas na maquete: `pokedollar` é o dinheiro comum do jogo (LS `dinheiro`) e `gold` é a moeda rara, que o
     jogo ainda não tem — mostro o que estiver em LS `cristal`, hoje sempre 0. Está no relatório pra ela.
     17/09 (print do Marcolino no #alpha-testers: "[object Object]" na pílula): com conta, o save montado pelo servidor põe no `cristal`
     as ESPERAS da coleta do cristal Teráxico (servidor/save.mjs: `cristal: { ...b.coletas }`, ponto → hora), não uma moeda. A
     "Cristal" do jogo original (moeda 2 do dump) era a de loja paga, que não existe aqui. Só número vale; o resto é 0. */
  const cristal = ctx.lerLS('cristal', 0);
  Popup.texto(pop, 'pokedollar', dinheiro().toLocaleString('pt-BR'));
  Popup.texto(pop, 'gold', (Number.isFinite(cristal) ? cristal : 0).toLocaleString('pt-BR'));
  Popup.texto(pop, 'moedas', dinheiro().toLocaleString('pt-BR'));        // pacotes antigos tinham uma moeda só
  const celulas = Popup.celulas(pop, 'lista-itens', Math.max(lista.length, 1), 'item');
  if (!pop.__ligouItens){                                                // clique escolhe a célula (as clonadas também)
    pop.addEventListener('click', ev => {
      const c = ev.target?.closest?.('[data-fig^="item-"]'); if (!c || !pop.contains(c)) return;
      const n = +c.dataset.fig.split('-').pop(); if (!n) return;
      /* TOQUE DUPLO USA (17/09): a maquete v2 promete "Clique duas vezes para usar" e o v2 do celular nem tem botão Usar — lá a poção
         não tinha como ser usada pela Mochila. Vale nos dois visuais (o Usar continua). */
      const agora = Date.now(), duplo = selMo === n - 1 && agora - (pop.__toqueMo || 0) < 450;
      pop.__toqueMo = duplo ? 0 : agora;
      selMo = n - 1; confirmarDescarte = null;
      if (!duplo){ render(); return; }
      const e2 = itensMochila()[n - 1];                                   // revisão (17/09): pedra que evolui pede confirmação — o Usar segue direto
      if (e2 && evoluiAgoraMo(e2) && !(avisoMo?.confirmaEvo && avisoMo.id === String(e2.id) && Date.now() < avisoMo.ate)){
        avisarMo(e2.id, 'Evoluir não tem volta: faça de novo pra usar ' + (e2.it.n || 'o item')); avisoMo.confirmaEvo = true; render(); return;
      }
      acaoMochila('usar');
    });
    const mostrarDica = alvo => {                                        // [passa:item]: descrição inteira numa caixinha
      const c = alvo?.closest?.('[data-fig^="item-"]');
      const e = c && itensMochila()[+c.dataset.fig.split('-').pop() - 1];
      Popup.dica(pop, 'tooltip', e ? c : null, e ? { titulo: e.it.n || '', descricao: semBr(e.it.d) } : null);
    };
    pop.addEventListener('mouseover', ev => mostrarDica(ev.target));
    pop.addEventListener('mouseout', ev => { if (!pop.contains(ev.relatedTarget)) mostrarDica(null); });
    pop.addEventListener('touchstart', ev => mostrarDica(ev.target), { passive: true });
    pop.addEventListener('touchend', () => setTimeout(() => mostrarDica(null), 2000), { passive: true });
    pop.__ligouItens = true;
  }
  celulas.forEach((c, i) => {
    const e = lista[i];
    for (const f of c.children){ if (f.dataset.sobre) continue; f.style.display = e ? (f.dataset.txt ? (f.dataset.display || 'flex') : 'block') : 'none'; }   // a marca de selecionado (v2) é da seleção, não do preenchimento
    if (!e) return;
    Popup.texto(pop, 'item-nome', e.it.n || ('item ' + e.id), c);
    Popup.texto(pop, 'item-qtd', '×' + e.n, c);
    Popup.texto(pop, 'item-descricao', semBr(e.it.d), c);
    Popup.imagem(pop, 'item', e.it.i ? './ui/itens/' + e.it.i + '.png' : null, c);
  });
  Popup.selecionar(pop, selMo + 1, 'item', 'item');
  const alvo = lista[selMo];
  const av = avisoMo && Date.now() < avisoMo.ate && (alvo?.id === avisoMo.id || !lista.some(x => x.id === avisoMo.id)) ? avisoMo : null;   // o item gasto até o fim sai da lista: o aviso fica
  const det = Popup.grupo(pop, 'detalhe-item');                          // v2 (rodada 27): painel do item escolhido (nome, categoria, quantidade, descrição, dica, foto)
  if (det){
    Popup.texto(pop, 'item-nome', alvo ? (alvo.it.n || '') : '', det);
    Popup.texto(pop, 'item-categoria', alvo ? catCurta(D.tipos?.[alvo.it.t] || '') : '', det);
    Popup.texto(pop, 'item-qtd', alvo ? ('Você tem ' + alvo.n) : '', det);
    Popup.texto(pop, 'item-descricao', alvo ? semBr(alvo.it.d) : '', det);
    const dica = Popup.no(pop, 'item-dica', det);
    if (dica && dica.dataset.corBase == null) dica.dataset.corBase = dica.style.color;
    if (av){ Popup.texto(pop, 'item-dica', av.texto, det); if (dica) dica.style.color = av.ok ? '#8EF58E' : '#FFD23A'; }   // 17/09: motivo/resultado do Usar
    else { if (alvo && podeUsarMo(alvo)) Popup.rotulo(pop, 'item-dica', det); else Popup.texto(pop, 'item-dica', '', det); if (dica) dica.style.color = dica.dataset.corBase; }
    Popup.imagem(pop, 'item', alvo && alvo.it.i ? './ui/itens/' + alvo.it.i + '.png' : null, det);
  } else linhaAvisoMo(pop, av || (alvo && podeUsarMo(alvo) && !pop.querySelector(':scope > [data-tag="acao"][data-tagval="usar"]') ? { texto: 'Toque duas vezes no item pra usar', dica: true } : null));
  const bola = alvo && alvo.it.t === 7;
  Popup.botao(pop, 'usar', !!alvo && podeUsarMo(alvo), bola ? 'Escolher' : 'Usar');
  Popup.botao(pop, 'descartar', !!alvo && podeDescartarMo(alvo));
  const lix = pop.querySelector('[data-tagval="descartar"]');
  if (lix) lix.title = alvo && confirmarDescarte === alvo.id ? 'clique de novo pra descartar de vez' : 'descartar o item escolhido';
}


/* ============================================================ pop-ups da rodada 15–21 do Figma (05/09): Treinador, Mapa, Social,
   Pokédex. Mesma divisão de sempre: popup.mjs desenha, aqui ficam os dados e as regras. Cada um tem versão PC e deitado
   com os mesmos ids (defPopup escolhe). */
let popTr = null, popMa = null, popSo = null, popDx = null;
const pad3 = n => String(n).padStart(3, '0');
const NOMES_NIVEL = ['desconhecido', 'Avistado', 'Registrado', 'Estudado', 'Especialista', 'Mestre'];
/** Pinta as N bolinhas (`ret bolinha`) de um grupo: verde até `n`, cinza depois. */
function bolinhas(grupo, n, cheia = '#2FAE47', vazia = '#39424E'){
  if (!grupo) return;
  [...grupo.querySelectorAll('[data-fig="bolinha"]')].forEach((b, i) => { b.style.backgroundColor = i < n ? cheia : vazia; });
}
/* ÍCONE DO TIPO NO v2 (17/09, auditoria dos placeholders): a pílula da rodada 29 é `slot-tipo > img/tipo` (ui/figma/tipo/<tipo>.png). O Popup.badge só pinta a
   pílula antiga (ret + texto): no v2 as caixas do ícone ficavam vazias no time, na ficha, nos golpes e na Pokédex. `tipo-N` sem tipo some (Pokémon de um tipo
   só no slot que a maquete desenhou com dois); card sem `tipo-N` (golpe) usa o `slot-tipo` direto.
   18/09 (teste da Amanda no site): NUNCA escreve o nome do tipo — a maquete v2 só tem a bolinha (o `txt/ficha-tipo` da rodada 30 recebia "Electric" e saiu na
   31); e a bolinha usa a caixa do `slot-tipo`, não a do `img/tipo` (encaixarBolinha). */
function iconesTipo(pop, raiz, tipos){
  if (!raiz || !pop?.__def?.v2) return;
  const url = t => './ui/figma/tipo/' + (TIPO_FIG[t] || 'normal') + '.png';   /* 18/09 (rodada 32, Amanda: "a qualidade caiu depois do d6239fe0"): de volta aos PNGs de 692 px, a aparência que ela aprovou — os de 128 px (ui/tipo, tools/icones_tipo.py) ficam sem uso; o TAMANHO continua sendo a caixa do slot-tipo (encaixarBolinha) */
  const poe = (g, t) => { const s = g.dataset.fig === 'slot-tipo' ? g : g.querySelector(':scope > [data-fig="slot-tipo"]'); const el = Popup.imagem(pop, 'tipo', url(t), g); if (el && s) Hud.encaixarBolinha(el, s, url(t)); };
  const grupos = [...raiz.querySelectorAll(':scope > [data-fig^="tipo-"]')];
  if (grupos.length) grupos.forEach((g, i) => { const t = tipos[i]; g.style.display = t ? 'block' : 'none'; if (t) poe(g, t); });
  else { const s = raiz.querySelector(':scope > [data-fig="slot-tipo"]'); if (s){ s.style.display = tipos[0] ? 'block' : 'none'; if (tipos[0]) poe(s, tipos[0]); } }
}
/* TIPOS NA LINHA DO TIME (18/09, Jaime: "o Mew está com o elemento desalinhado, sendo que só tem um"). Cada linha da lista-time vem da maquete
   com o exemplo que a Amanda pôs nela: as linhas 2 e 5 com dois tipos (tipo-1 em x 344, tipo-2 na ponta, x 368), as outras com um só (tipo-1 na
   ponta, x 368). O jogo escondia o tipo-2 e deixava o tipo-1 onde estava: um Pokémon de um tipo numa linha desenhada com dois ficava com a
   bolinha fora da coluna das outras, e um de dois tipos numa linha de um só perdia o 2º tipo. Agora toda linha usa a geometria de uma linha de
   dois tipos da maquete e as bolinhas encostam na ponta direita: 1 tipo = na ponta; 2 tipos = tipo-1 ao lado, tipo-2 na ponta. A linha que não
   tem o encaixe do 2º tipo ganha uma cópia do de outra linha. */
function alinharTiposDoTime(pop, it, n){
  const g1 = it.querySelector(':scope > [data-fig="tipo-1"]'); if (!g1 || !n) return;
  const G = pop.__tiposTime || (pop.__tiposTime = (() => {
    for (const r of pop.querySelectorAll('[data-fig^="item-time-"]')){
      const a = r.querySelector(':scope > [data-fig="tipo-1"]'), b = r.querySelector(':scope > [data-fig="tipo-2"]');
      if (a && b) return { x1: a.style.left, x2: b.style.left, molde: b };
    }
    return null;
  })());
  if (!G) return;
  let g2 = it.querySelector(':scope > [data-fig="tipo-2"]');
  if (!g2 && n > 1){ g2 = G.molde.cloneNode(true); g2.style.top = g1.style.top; g1.after(g2); }
  g1.style.left = n > 1 ? G.x1 : G.x2;
  if (g2) g2.style.left = G.x2;
}
/* PESO COLADO ÀS BOLINHAS NA FICHA (18/09, rodada 32 da Amanda: "bolinha + bolinha + peso"). A maquete põe o `txt/ficha-peso` logo depois da
   última bolinha: na rodada 31 (exemplo Pikachu, 1 tipo) a 12 px do tipo-1 no PC (7 no celular); na 32 (Bulbasaur, 2 tipos) na mesma
   distância do tipo-2. O jogo esconde o tipo-2 de quem só tem um tipo e o peso ficava onde a maquete de 2 tipos o pôs, com o vão da bolinha
   que faltou. Agora ele anda com a última bolinha visível, na distância que a maquete dá (medida da última bolinha que ela desenhou). */
function pesoAposTipos(f, n){
  const peso = f?.querySelector(':scope > [data-txt="ficha-peso"]'), t1 = f?.querySelector(':scope > [data-fig="tipo-1"]');
  if (!peso || !t1 || !n) return;
  const t2 = f.querySelector(':scope > [data-fig="tipo-2"]'), px = v => parseFloat(v) || 0, fim = g => px(g.style.left) + px(g.style.width);
  if (peso.dataset.x0 == null) peso.dataset.x0 = String(px(peso.style.left));   /* o lugar da maquete, antes de mexer */
  const vao = +peso.dataset.x0 - fim(t2 || t1);
  peso.style.left = (fim(n > 1 && t2 ? t2 : t1) + vao) + 'px';
}
/* BOLINHA NO TAMANHO DO SLOT (18/09, teste da Amanda no site): a bolinha usa a caixa do slot-tipo e a esfera medida no PNG. A função
   (encaixarBolinha) e a medida (medirAlfa) foram pro hud.mjs no mesmo dia, pra barra de skills do HUD usar a mesma (teste local da Amanda com
   a rodada 31: "bolinhas desiguais também na barra de skills"). */
/** Pílulas de tipo de uma célula/grupo (`tipo-*` com `ret bg-badge` + `rotulo txt-badge`): escreve os tipos da espécie na ordem, esconde as sobras. */
function pilulasTipo(pop, raiz, tipos){
  const cores = ctx.jogo?.hudLayout?.popups?.pc?.pokemon?.tipos || {};
  const grupos = [...raiz.querySelectorAll(':scope > [data-fig^="tipo-"]')];
  grupos.forEach((g, i) => {
    const t = tipos[i]; g.style.display = t ? 'block' : 'none'; if (!t) return;
    const c = cores[TIPO_FIG[t]] || null, bg = g.querySelector('[data-fig="bg-badge"]'), tx = pop.__def?.v2 ? null : g.querySelector('.pf-rotulo');   /* 18/09: no v2 a pílula é só a bolinha, nunca escreve o nome do tipo */
    if (bg && c) bg.style.backgroundColor = c.fundo; if (tx){ tx.textContent = t; if (c) tx.style.color = c.texto; }
  });
  iconesTipo(pop, raiz, tipos);                                          // v2 (17/09): bolinha(s) do tipo na Pokédex (18/09: sem nome escrito)
}
const iconeMonDex = dex => './ui/mon/pm' + String(dex).padStart(4, '0') + '.png';

/* ---------------------------------------------------------------- Treinador */
let visorTr = null;
function popupTr(){
  if (popTr) return popTr;
  const def = defPopup('treinador'); if (new URLSearchParams(location.search).get('popup') === '0' || !def) return null;
  popTr = Popup.montar(def, {
    abre: alvo => { if (alvo === 'popup-pokemon'){ abrir('pokemon'); return true; } return false; },
    fechar: () => { if (aberta === 'treinador') aberta = null; if (visorTr) visorTr.ativo = false; },
  });
  return popTr;
}
let ginasiosTr = null;
async function carregarGinasios(){ if (!ginasiosTr) ginasiosTr = await fetch('./data/ginasios.json').then(r => r.json()).catch(() => ({})); return ginasiosTr; }
/** O bonequinho 3D do jogador (img/jogador [do-jogo]): clone do modelo em campo, com a roupa dele, girando devagar. */
function visorTreinador(){
  if (visorTr) return visorTr;
  const canvas = document.createElement('canvas'); canvas.width = 222; canvas.height = 292;
  const ren = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }); ren.setPixelRatio(1); ren.setSize(222, 292, false); ren.outputColorSpace = THREE.SRGBColorSpace;
  const cena = new THREE.Scene(); cena.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2418, 1.2)); const sol = new THREE.DirectionalLight(0xffffff, 1.4); sol.position.set(2, 4, 3); cena.add(sol);
  const cam = new THREE.PerspectiveCamera(30, 222 / 292, 0.05, 50); cam.position.set(0, 0.95, 3.4); cam.lookAt(0, 0.75, 0);
  const v = { canvas, ren, cena, cam, grupo: null, mixer: null, ativo: false, t0: 0, giro: 0 };
  v.quadro = () => { if (!v.ativo) return; const t = performance.now() / 1000, dt = Math.min(0.05, t - (v.t0 || t)); v.t0 = t; v.giro += dt * 0.5; if (v.grupo) v.grupo.rotation.y = v.giro; v.mixer?.update(dt); ren.render(cena, cam); requestAnimationFrame(v.quadro); };
  v.montar = () => {
    const a = ctx.jogo?.ash; if (!a?.corpo) return;
    if (v.grupo){ cena.remove(v.grupo); v.grupo = null; v.mixer = null; }
    const corpo = SkeletonUtils.clone(a.corpo); corpo.scale.copy(a.corpo.scale); corpo.position.copy(a.corpo.position);
    const g = new THREE.Group(); g.add(corpo); cena.add(g); v.grupo = g;
    const clipe = a.acoes?.get('Idle')?.getClip(); if (clipe){ v.mixer = new THREE.AnimationMixer(corpo); v.mixer.clipAction(clipe).play(); }
  };
  visorTr = v; return v;
}
/* ANEL DE CADA INSÍGNIA + MIOLO DO ESTADO (v2, rodada 27+; teste da Amanda no site, 18/09: "insígnias todas cinzas e cortadas"). Na maquete
   nova cada célula `insignia-N` tem a PRÓPRIA arte: o anel na cor da insígnia (prata, azul, laranja, arco-íris…) com o miolo no estado em que
   ela desenhou (1–2 conquistadas, 3–8 vazias). As referências `insignia [estado:vazia|conquistada]` são a versão genérica (anel prata) e num
   tamanho diferente da célula (96×110 contra 76×87 no PC; 60×66 contra 41×61 no celular): o estadoRef trocava a arte da célula pela da
   referência, e por isso os oito anéis saíam prata e, no celular, esticados em elipse. Agora a célula fica com o anel dela e a referência
   entra só no MIOLO: um círculo pintado com o interior do PNG da referência (azul = conquistada, escuro = vazia) e recortado por border-radius.
   Rodada 32 (18/09): o miolo virou nó próprio, `img/miolo`, na célula e em cada referência — a caixa do disco interno. O disco da referência
   (a caixa do img/miolo dela) é desenhado na caixa do img/miolo da célula, sem medida nenhuma. Pacote sem o nó (rodada 31): ficam as razões
   medidas nos PNGs daquela rodada — miolo da célula = 1,40× (PC) / 1,475× (celular) a caixa do ícone; miolo da referência = 1,50× a caixa do
   ícone dela; todos centrados na caixa do ícone. Layout antigo (célula sem arte própria) segue como era. */
function mioloInsignia(cel, ref, pop){
  const arte = cel.dataset.arte; if (!arte || !ref?.img) return;
  cel.style.backgroundImage = 'url(' + arte + ')';                        // o anel na cor da insígnia (a folga do PNG já está no backgroundSize)
  const cx = cel.querySelector(':scope > [data-var="insignia"]'); if (!cx) return;
  const px = v => parseFloat(v) || 0, pad = ref.imgPad || 0;
  const rm = (ref.filhos || []).find(f => f.id === 'miolo'), rc = (ref.filhos || []).find(f => f.id === 'insignia');
  let m = rm ? cel.querySelector(':scope > [data-var="miolo"]') : null, d, h, D, Cx, Cy;
  if (m){                                                                 /* rodada 32: a caixa do img/miolo da célula recebe o img/miolo da referência */
    d = px(m.style.width) || 1; h = px(m.style.height) || d; D = rm.w || 1; Cx = rm.x + rm.w / 2; Cy = rm.y + rm.h / 2;
  } else {                                                                /* pacote sem o nó: razões medidas nos PNGs da rodada 31 */
    const ix = px(cx.style.left), iy = px(cx.style.top), iw = px(cx.style.width) || 1, ih = px(cx.style.height) || iw;
    const celular = (pop?.__def?.tela?.w || 1920) < 1000;
    d = h = iw * (celular ? 1.475 : 1.40); D = (rc ? rc.w : iw) * 1.5;
    Cx = rc ? rc.x + rc.w / 2 : (ref.w || 0) / 2; Cy = rc ? rc.y + rc.h / 2 : (ref.h || 0) / 2;
    m = cel.querySelector(':scope > .ins-miolo');
    if (!m){ m = document.createElement('i'); m.className = 'ins-miolo'; cel.insertBefore(m, cx); }
    Object.assign(m.style, { position: 'absolute', left: (ix + iw / 2 - d / 2) + 'px', top: (iy + ih / 2 - d / 2) + 'px', width: d + 'px', height: d + 'px', zIndex: '5' });
  }
  const s = d / D;                                                        /* diâmetro do miolo da célula / o da referência */
  Object.assign(m.style, { borderRadius: '50%', pointerEvents: 'none', backgroundImage: 'url(' + ref.img + ')', backgroundRepeat: 'no-repeat',
    backgroundSize: ((ref.w + 2 * pad) * s) + 'px ' + ((ref.h + 2 * pad) * s) + 'px',
    backgroundPosition: (d / 2 - (Cx + pad) * s) + 'px ' + (h / 2 - (Cy + pad) * s) + 'px' });
}
function encherTreinador(pop){
  Popup.rotulo(pop, 'titulo');
  const D2 = D, t = ctx.lerLS('tempo', 0), h = Math.floor(t / 3600), mi = Math.floor((t % 3600) / 60);
  const d = dexEstado(); const pegos = Object.values(d).filter(v => v === 'pego').length, vistos = Object.keys(d).length;
  const tem = new Set(ctx.lerLS('insignias', []));
  const P = ctx.Personagem, pers = P?.ler?.();
  const ini = ctx.lerLS('inicial', null);
  Popup.texto(pop, 'jogador-nome', ctx.nome || 'Ash');
  Popup.texto(pop, 'dinheiro', dinheiro().toLocaleString('pt-BR') + ' ' + (D2.moedas?.[1] || 'Moeda'));
  Popup.texto(pop, 'tempo-jogo', h + 'h ' + String(mi).padStart(2, '0') + 'm');
  Popup.texto(pop, 'time-resumo', (ctx.jogo.time || []).length + '/6 · caixa ' + (ctx.lerLS('caixa', []) || []).length);
  Popup.texto(pop, 'pokedex-resumo', vistos + ' vistos · ' + pegos + ' capturados');
  Popup.texto(pop, 'insignias-resumo', tem.size + '/8');
  Popup.texto(pop, 'personagem', pers ? (P.nomeDe?.(pers) || pers.tipo) : 'Ash');
  Popup.texto(pop, 'inicial', ini ? (ini.nome || (ini.dex && ctx.porDex.get(ini.dex)?.name) || '—') : '—');
  // o bonequinho 3D
  const cx = Popup.no(pop, 'jogador');
  if (cx){
    const v = visorTreinador();
    if (v.canvas.parentElement !== cx){ cx.appendChild(v.canvas); Object.assign(v.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' }); cx.style.pointerEvents = 'auto'; }
    v.montar(); if (!v.ativo){ v.ativo = true; v.t0 = 0; requestAnimationFrame(v.quadro); }
  }
  // insígnias: 8 soquetes na ordem da tabela (Cinza, Azul, Laranja, Arco-Íris, Rosa, Dourada, Vermelho Escuro, Verde)
  const ins = (D2.insignias || []).filter(b => b.gen === 1);
  carregarGinasios().then(G => {
    const porId = {}; for (const g of Object.values(G || {})) if (g.insignia) porId[g.insignia.id] = g.insignia;
    ins.forEach((b, i) => {
      const cel = Popup.grupo(pop, 'insignia-' + (i + 1)); if (!cel) return;
      const conquistada = tem.has(b.id);
      Popup.texto(pop, 'insignia-nome', b.n.replace(/^medalha /i, ''), cel);
      const ref = Popup.estadoRef(pop, cel, 'insignia', conquistada ? 'conquistada' : 'vazia');
      mioloInsignia(cel, ref, pop);                                        // v2 (18/09): a célula fica com o anel da cor dela; a referência pinta só o miolo
      const ic = porId[b.id]?.icone;
      Popup.imagem(pop, 'insignia', conquistada && ic ? './ui/icones/' + ic + '.png' : null, cel);   // dghz_1..8 recortados do pacote Item (13/09): antes apontava pra ui/itens/ic_dghz_*, que nunca existiu — a insígnia ganha ficava vazia
    });
  });
  const teto = tetoObed();
  /* 17/09 (auditoria dos placeholders): "ranking chega com o servidor" é texto fixo da maquete e já não é verdade (o ranking existe: /ranking no chat,
     posição na Pokédex). Fica a regra do shiny e, com conta, a posição de verdade. */
  const notaRk = pop.querySelector('[data-fig="nota-ranking"]');
  if (notaRk){ notaRk.textContent = tr('shiny 1/4.096 pra todos'); minhaPosicao().then(p => { if (p && p.especies?.pos && aberta === 'treinador' && Popup.aberto(pop)) notaRk.textContent = tr(p.especies.pos + 'º de ' + p.total + ' no ranking · shiny 1/4.096 pra todos'); /* 17/09: a frase inteira no tr() (padrão no ui_en/ui_es) */ }); }
  Popup.texto(pop, 'obedecem', 'Obedecem até Lv ' + teto + ' · acima disso não obedecem golpes; cada insígnia sobe o teto (' + TETO_OBED.slice(0, 8).join('/') + ', Elite 100)');
  // colecionador
  const K = ctx.conhecimento;
  if (K){
    const r = K.resumo(), ts = K.listaTitulos();
    Popup.texto(pop, 'col-kanto', r.pegosKanto + '/' + r.kantoAte + ' capturados (' + Math.round(r.pegosKanto / r.kantoAte * 100) + '%) · ' + r.vistosKanto + ' vistos');
    Popup.texto(pop, 'col-nacional', r.pegos + ' capturados · ' + r.vistos + ' vistos');
    Popup.texto(pop, 'col-shinies', '✨ ' + r.shinies);
    Popup.texto(pop, 'col-conhecimento', r.mestres + ' espécie' + (r.mestres === 1 ? '' : 's') + ' em Mestre · ' + r.estudadas + ' em Estudado+ · ' + r.pontosTotal + ' pontos');
    const slug = x => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    for (const g of pop.querySelectorAll('[data-fig^="conquista-"]')){
      const chave = g.dataset.fig.slice(10);
      const tit = ts.find(x => slug(x.nome) === chave || slug(x.id) === chave || slug(x.nome).startsWith(chave.split('-')[0]));
      g.style.display = tit ? 'block' : 'none'; if (!tit) continue;
      Popup.texto(pop, 'conquista-nome', tit.nome, g); Popup.texto(pop, 'conquista-desc', tit.desc, g);
      Popup.estadoRef(pop, g, 'conquista', tit.tem ? 'feita' : 'pendente');
      const bola = g.querySelector('[data-var="conquista-estado"]'); if (bola && !bola.style.backgroundImage){ bola.style.borderRadius = '50%'; bola.style.backgroundColor = tit.tem ? '#2FAE47' : '#39424E'; bola.style.display = 'block'; }
    }
  }
}

/* ---------------------------------------------------------------- Mapa */
let pontosMapa = null, areaMapa = null;
function popupMa(){
  if (popMa) return popMa;
  const def = defPopup('mapa'); if (new URLSearchParams(location.search).get('popup') === '0' || !def) return null;
  popMa = Popup.montar(def, {
    acao: nome => { if (nome === 'trocar-regiao') Chat.sistema('Só Kanto por enquanto — outras regiões chegam depois.'); },
    /* ÁREA DO JOGADOR A CADA ABERTURA (17/09, chaospider: da Rota 4 pra Cerulean e de Cerulean pra Rota 24 o Mapa seguia na área velha até
       entrar e sair do Centro Pokémon). `areaMapa` é do módulo e só era recalculada quando estava null: a 1ª abertura prendia a área até a
       página recarregar (porta recarrega, por isso o Centro "consertava"). Zerando ao abrir, a janela nasce onde o jogador está; o clique
       no mapa continua trocando a área enquanto ela fica aberta. */
    abrir: () => { areaMapa = null; },
    fechar: () => { if (aberta === 'mapa') aberta = null; },
  });
  const mapa = Popup.grupo(popMa, 'mapa');
  if (mapa){                                                             // clique na arte: a área mais perto (data/mapa_kanto_pontos.json)
    mapa.style.pointerEvents = 'auto'; mapa.style.cursor = 'pointer';
    mapa.addEventListener('click', ev => {
      if (!pontosMapa) return;
      const r = mapa.getBoundingClientRect(); const fx = (ev.clientX - r.left) / r.width, fy = (ev.clientY - r.top) / r.height;
      let melhor = null, dm = Infinity;
      const testar = (id, [px, py]) => { const d = Math.hypot((px - fx) * (r.width / r.height), py - fy); if (d < dm){ dm = d; melhor = id; } };
      for (const [id, p] of Object.entries(pontosMapa.areas || {})) testar(+id, p);
      for (const [id, lista] of Object.entries(pontosMapa.extras || {})) for (const p of lista) testar(+id, p);
      if (melhor != null && dm < (pontosMapa.raio || 0.045) * (r.width / r.height) * 1.6){ areaMapa = melhor; render(); }
    });
  }
  return popMa;
}
function areaDoJogador(){
  const a = ctx.jogo?.ash, caixas = (ctx.dados?.caixas || []).filter(c => c.sx > 0 && c.sz > 0), fx = ctx.flipX();
  const c = a && caixas.find(b => Math.abs(a.x - fx * b.x) <= b.sx / 2 && Math.abs(a.z - b.z) <= b.sz / 2);
  return c ? c.a : null;
}
/* GENÉRICO SÓ EM ROTA (15/09, thesyvel: "era para ter Pokémon no ginásio de Saffron?" — o Mapa listava Rattata/Pidgey lá dentro).
   A regra antiga era por NOME (/Cidade|Ilha|Liga|Centro/), então tudo que não casava — ginásio, loja, museu, Torre Pokémon,
   Ilhas Seafoam — caía na lista genérica e o Mapa prometia Pokémon em sala onde não nasce nada. A faixa da área é o dado
   confiável: a grama genérica é das ROTAS (12xx). Quem tem fauna própria (caverna, algumas cidades) já entra pelo `proprios`. */
const ehRota = a => Math.floor(Number(a) / 100) === 12;
async function encherMapa(pop){
  Popup.rotulo(pop, 'titulo'); Popup.texto(pop, 'regiao', 'Kanto');
  Popup.imagem(pop, 'mapa', './ui/figma/backgrounds/mapa-kanto.png');
  pontosMapa ??= await fetch('./data/mapa_kanto_pontos.json').then(r => r.json()).catch(() => ({ areas: {}, raio: 0.045 }));
  mapaHabitats ??= await fetch('./data/habitats.json').then(r => r.json()).catch(() => ({ areas: {}, generico: [] }));
  if (aberta !== 'mapa' || !Popup.aberto(pop)) return;
  const nomes = { ...(pontosMapa.nomes || {}), ...(ctx.dados?.nomes || {}) };   // a cena recortada (pallet_rota1) só conhece as próprias áreas; os pontos trazem os nomes de Kanto
  if (areaMapa == null || !nomes[areaMapa]) areaMapa = areaDoJogador() ?? +Object.keys(pontosMapa.areas || {})[0];
  const a = areaMapa, nome = ctx.nomeArea?.(a) || nomes[a] || ('área ' + a);   // 17/09: o mesmo nome do minimapa e do "Você chegou em" (os pontos diziam "Cidade Cerulean"/"Cidade Lavender", sem tradução no EN/ES)
  Popup.texto(pop, 'area-nome', nome);
  const proprios = mapaHabitats.areas?.[String(a)] || [];
  const lista = proprios.length ? proprios : (ehRota(a) ? mapaHabitats.generico || [] : []);
  Popup.texto(pop, 'area-dica', lista.length ? (proprios.length ? 'Pokémon desta área — de perto eles entram na Pokédex.' : 'Pokémon comuns da região — de perto eles entram na Pokédex.') : 'Sem Pokémon selvagens aqui.');
  const d = dexEstado();
  const cels = Popup.celulas(pop, 'lista-pokemons', Math.max(lista.length, 1), 'pokemon');
  cels.forEach((c, i) => {
    const e = lista[i]; c.style.display = e ? 'block' : 'none'; if (!e) return;
    const st = d[e.dex], visto = st === 'visto' || st === 'pego';
    Popup.imagem(pop, 'pokemon', iconeMonDex(e.dex), c);
    const img = c.querySelector('[data-var="pokemon"]'); if (img){ img.style.filter = visto ? '' : 'brightness(0) opacity(.85)'; if (!img.style.borderRadius) img.style.borderRadius = '50%'; }   /* silhueta preta de quem você ainda não viu; 18/09 (teste da Amanda no site): retrato e silhueta recortados no CÍRCULO da célula. A rodada 32 trouxe o `raio` (metade da caixa) no img/pokemon e o popup.mjs já o aplica com o `recorta`; o 50 % fica só pro layout que não traz raio (HUD padrão) */
    Popup.texto(pop, 'pokemon-nome', visto ? e.nome : '???', c);
    Popup.estadoRef(pop, c, 'pokemon', visto ? 'descoberto' : 'oculto');
    /* JÁ CAPTURADO (17/09, ideia do chaospider): Pokébola pequena no canto da célula de quem já foi pego (o mesmo `dexEstado` da Pokédex:
       time, caixa e conhecimento). A maquete não tem esse estado, então a marca é um nó nosso, criado uma vez por célula. */
    let pego = c.querySelector(':scope > .mapa-pego');
    if (!pego){ pego = document.createElement('i'); pego.className = 'mapa-pego'; Object.assign(pego.style, { position: 'absolute', right: '6%', top: '4%', width: '24%', aspectRatio: '1', background: 'url(./ui/icones/pokebola.png) center / contain no-repeat', pointerEvents: 'none', zIndex: '2' }); c.appendChild(pego); }
    pego.style.display = st === 'pego' ? 'block' : 'none';
  });
  const selo = Popup.extra(pop, 'selo-area'), mapa = Popup.grupo(pop, 'mapa'), pt = pontosMapa.areas?.[String(a)];
  if (selo && mapa && pt){
    const mx = parseFloat(mapa.style.left) || 0, my = parseFloat(mapa.style.top) || 0, mw = parseFloat(mapa.style.width) || 1, mh = parseFloat(mapa.style.height) || 1;
    const sw = parseFloat(selo.style.width) || 70, sh = parseFloat(selo.style.height) || 67;
    Popup.mostrarExtra(pop, 'selo-area', true, { x: mx + pt[0] * mw - sw / 2, y: my + pt[1] * mh - sh / 2 });
  } else if (selo) Popup.mostrarExtra(pop, 'selo-area', false);
}

/* ---------------------------------------------------------------- Social (fase 2b, 06/09: amigos e mensagens diretas pela conta) */
let abaSo = 'amigos', soDados = null, soBusca = '', soConversa = null, soMsgs = [], soAmigoMenu = null, soCarregando = false;
const soLigado = () => ctx.conta?.estado?.().modo === 'conta';
const soChamar = (metodo, caminho, corpo) => soLigado() ? ctx.conta.chamar(metodo, caminho, corpo) : Promise.resolve({ ok: false, erro: 'Entre com uma conta pra ter amigos e mensagens.' });
const tempoAtras = ms => { const s = Math.max(0, (Date.now() - ms) / 1000); return s < 90 ? 'agora' : s < 3600 ? Math.round(s / 60) + 'min' : s < 86400 ? Math.round(s / 3600) + 'h' : Math.round(s / 86400) + 'd'; };
const retrato = dex => dex ? './ui/mon/pm' + String(dex).padStart(4, '0') + '.png' : null;
async function soCarregar(){
  if (!soLigado() || soCarregando) return; soCarregando = true;
  const r = await soChamar('GET', '/social'); soCarregando = false;
  if (r.ok){ soDados = r.dados; if (popSo && Popup.aberto(popSo) && aberta === 'social') encherSocial(popSo); }
  else if (r.erro) Chat.sistema('Social: ' + r.erro);
}
async function soAbrirConversa(com){
  soConversa = com; abaSo = 'mensagens';
  const r = await soChamar('GET', '/social/conversa?com=' + encodeURIComponent(com));
  if (r.ok){ soMsgs = r.dados.mensagens || []; if (soDados){ const c = soDados.conversas.find(x => x.com === com); if (c) c.naoLidas = 0; } }
  if (popSo && Popup.aberto(popSo)) encherSocial(popSo);
}
function popupSo(){
  if (popSo) return popSo;
  const def = defPopup('social'); if (new URLSearchParams(location.search).get('popup') === '0' || !def) return null;
  popSo = Popup.montar(def, {
    aba: a => { abaSo = a; render(); },
    digita: (v, inp) => { if (inp?.dataset.txt === 'busca'){ soBusca = String(v || '').trim().toLowerCase(); render(); } },   // o campo de mensagem e o do convite são lidos na hora de enviar
    abre: nome => { if (nome === 'dialogo-solicitacoes'){ Popup.mostrarExtra(popSo, nome, true); encherSolicitacoes(popSo); return true; } return false; },
    acao: (nome, el) => { soAcao(nome, el).catch(e => Chat.sistema('Social: ' + (e?.message || e))); },
    fechar: () => { if (aberta === 'social') aberta = null; Popup.mostrarExtra(popSo, 'tooltip-amigo', false); },
  });
  popSo.addEventListener('click', ev => {                                 // clique num amigo abre o menu dele; numa conversa, abre a conversa
    const cel = ev.target?.closest?.('[data-fig="lista-amigos"] > [data-fig^="amigo-"]');
    if (cel?.__amigo){
      soAmigoMenu = cel.__amigo;
      const rp = popSo.getBoundingClientRect(), rc = cel.getBoundingClientRect(), k = popSo.__escala || 1;
      Popup.mostrarExtra(popSo, 'tooltip-amigo', true, { x: (rc.right - rp.left) / k - 250, y: (rc.top - rp.top) / k + 4 });
      return;
    }
    const conv = ev.target?.closest?.('[data-fig^="conversa-"]');
    if (conv?.__com){ soAbrirConversa(conv.__com); return; }
    if (!ev.target.closest('[data-fig="tooltip-amigo"]')) Popup.mostrarExtra(popSo, 'tooltip-amigo', false);
  });
  return popSo;
}
const soInput = (pop, extra, campo) => pop.querySelector('[data-fig="' + extra + '"] [data-fig="' + campo + '"] input');
async function soAcao(nome, el){
  const pop = popSo;
  if (nome === 'enviar-convite'){
    const inp = soInput(pop, 'dialogo-convite', 'campo-nome'); const para = (inp?.value || '').trim();
    if (!para){ Chat.sistema('Digite o nome exato do treinador.'); return; }
    const r = await soChamar('POST', '/social/pedido', { para });
    if (r.ok){ Chat.sistema(r.dados.amigos ? '🤝 Você e ' + r.dados.nick + ' agora são amigos.' : '📨 Convite enviado pra ' + r.dados.nick + '.'); if (inp) inp.value = ''; Popup.mostrarExtra(pop, 'dialogo-convite', false); soCarregar(); }
    else Chat.sistema('Convite: ' + r.erro);
  } else if (nome === 'aceitar' || nome === 'recusar'){
    const de = el?.closest?.('[data-fig^="solicitacao-"]')?.__de; if (!de) return;
    const r = await soChamar('POST', '/social/' + nome, { de });
    if (r.ok) Chat.sistema(nome === 'aceitar' ? '🤝 Você e ' + (r.dados.nick || de) + ' agora são amigos.' : 'Convite recusado.'); else Chat.sistema('Social: ' + r.erro);
    await soCarregar(); encherSolicitacoes(pop);
  } else if (nome === 'mensagem'){
    Popup.mostrarExtra(pop, 'tooltip-amigo', false); if (soAmigoMenu) soAbrirConversa(soAmigoMenu.usuario);
  } else if (nome === 'convidar'){                                        // fase 4: convite de TROCA (o PvP ainda vem depois)
    Popup.mostrarExtra(pop, 'tooltip-amigo', false);
    if (!soAmigoMenu) return;
    if (!ctx.trocar?.(soAmigoMenu.nick)) Chat.sistema('Pra trocar, vocês precisam estar na mesma área, um do lado do outro. (O desafio de batalha chega com o PvP.)');
  } else if (nome === 'desfazer-amizade'){
    Popup.mostrarExtra(pop, 'tooltip-amigo', false); if (!soAmigoMenu) return;
    const r = await soChamar('POST', '/social/remover', { usuario: soAmigoMenu.usuario });
    if (r.ok) Chat.sistema(soAmigoMenu.nick + ' saiu da sua lista de amigos.'); else Chat.sistema('Social: ' + r.erro);
    soCarregar();
  } else if (nome === 'enviar'){
    const inp = soInput(pop, 'conteudo-mensagens', 'campo-mensagem'); const texto = (inp?.value || '').trim();
    if (!soConversa){ Chat.sistema('Escolha uma conversa ou abra pelo menu do amigo.'); return; }
    if (!texto) return;
    const r = await soChamar('POST', '/social/mensagem', { para: soConversa, texto });
    if (r.ok){ if (inp) inp.value = ''; soMsgs.push({ de: soDados?.eu?.usuario, texto, hora: r.dados.hora, lida: true }); const nick = soDados?.amigos.find(a => a.usuario === soConversa)?.nick || soConversa; Chat.publicar('pm', texto, 'você → ' + nick); encherSocial(pop); soCarregar(); }
    else Chat.sistema('Mensagem: ' + r.erro);
  }
}
/** Evento vindo da rede (rede.mjs): mensagem direta ou convite. */
export function socialEvento(m){
  if (!m) return;
  if (m.t === 'dm'){
    ctx.Som?.tocar?.('ui/sound_successful', { volume: .45, prio: true });   // toque de mensagem (11/09)
    Chat.publicar('pm', m.texto, m.nick || m.de);
    if (popSo && Popup.aberto(popSo) && aberta === 'social' && soConversa === m.de) soAbrirConversa(m.de); else soCarregar();
  } else if (m.t === 'social'){
    const n = m.nick || m.de;
    if (m.tipo === 'pedido' || m.tipo === 'aceito') ctx.Som?.tocar?.('ui/sound_click', { volume: .5, prio: true });
    Chat.sistema(m.tipo === 'pedido' ? '🤝 ' + n + ' quer ser seu amigo: Social → Solicitações.' : m.tipo === 'aceito' ? '🤝 ' + n + ' aceitou seu convite.' : n + ' desfez a amizade.');
    soCarregar();
  }
}
/* ---------------------------------------------------------------- Ranking de colecionador (servidor/ranking.mjs) */
let rankingEu = null, rankingEuEm = 0;
const NOMES_RANKING = { especies: 'espécies de Kanto', shinies: 'shinies', conhecimento: 'pontos de conhecimento' };
async function pegarRanking(caminho, comToken = false){
  const base = ctx.conta?.baseUrl?.(); if (!base) return null;
  if (comToken) { const r = await ctx.conta.chamar('GET', caminho); return r.ok ? r.dados : null; }
  try { const r = await fetch(base + caminho, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; }
}
/** /ranking no chat: top 5 de cada lista. */
export async function mostrarRanking(){
  const R = await pegarRanking('/ranking');
  if (!R){ Chat.sistema('Ranking: sem servidor no ar.'); return false; }
  Chat.sistema('🏆 Ranking de colecionadores (' + R.total + ' treinador' + (R.total === 1 ? '' : 'es') + '):');
  for (const [chave, nome] of Object.entries(NOMES_RANKING)){
    const l = (R.listas?.[chave] || []).slice(0, 5);
    Chat.sistema('• ' + nome + ': ' + (l.length ? l.map(x => x.pos + 'º ' + x.nick + ' (' + x.valor + ')').join(' · ') : 'ninguém ainda'));
  }
  return true;
}
/** Minha posição (cache de 30 s), pra linha "Colecionador Kanto" da Pokédex. */
async function minhaPosicao(){
  if (ctx.conta?.estado?.().modo !== 'conta') return null;
  if (rankingEu && Date.now() - rankingEuEm < 30000) return rankingEu;
  rankingEu = await pegarRanking('/ranking/eu', true); rankingEuEm = Date.now();
  return rankingEu;
}
/** /w nome texto no chat: mensagem direta pra um amigo (pelo nick ou usuário). */
export async function enviarDm(nome, texto){
  if (!soLigado()){ Chat.sistema('Mensagem direta precisa de conta no servidor.'); return false; }
  if (!soDados){ const r = await soChamar('GET', '/social'); if (r.ok) soDados = r.dados; }
  const v = String(nome || '').toLowerCase(); const a = (soDados?.amigos || []).find(x => x.usuario === v || x.nick.toLowerCase() === v);
  if (!a){ Chat.sistema('Não achei "' + nome + '" na sua lista de amigos (mensagem direta é só entre amigos).'); return false; }
  const r = await soChamar('POST', '/social/mensagem', { para: a.usuario, texto });
  if (r.ok){ Chat.publicar('pm', texto, 'você → ' + a.nick); if (soConversa === a.usuario) soMsgs.push({ de: soDados.eu.usuario, texto, hora: r.dados.hora }); return true; }
  Chat.sistema('Mensagem: ' + r.erro); return false;
}
function encherSolicitacoes(pop){
  const sol = Popup.extra(pop, 'dialogo-solicitacoes'); if (!sol) return;
  const P = soDados?.pedidos || [];
  sol.style.overflowY = 'auto'; sol.style.pointerEvents = 'auto';
  const cs = Popup.celulas(pop, 'dialogo-solicitacoes', Math.max(P.length, 1), 'solicitacao');
  cs.forEach((c, i) => {
    const p = P[i]; c.style.display = p ? 'block' : 'none'; if (!p) return;
    c.__de = p.de; c.style.pointerEvents = 'auto';
    Popup.texto(pop, 'solicitante-nome', p.nick, c); Popup.texto(pop, 'solicitante-info', 'Lv ' + (p.lv || 0) + (p.online ? ' · online' : ''), c);
    Popup.imagem(pop, 'retrato', retrato(p.dex), c);
  });
  let nota = sol.querySelector(':scope > .pf-nota');
  if (!nota){ nota = document.createElement('div'); nota.className = 'pf-nota'; Object.assign(nota.style, { position: 'absolute', left: '0', right: '0', top: '45%', textAlign: 'center', color: '#B8C2D9', font: '13px "Nunito Sans", system-ui, sans-serif', pointerEvents: 'none' }); sol.appendChild(nota); }
  nota.textContent = P.length ? '' : 'Nenhum convite pendente.';
}
function encherMensagens(pop, mens){
  const D = soDados; const conv = D?.conversas || [];
  const cels = Popup.celulas(pop, 'conteudo-mensagens', Math.max(conv.length, 1), 'conversa');
  cels.forEach((c, i) => {
    const v = conv[i]; c.style.display = v ? 'block' : 'none'; if (!v) return;
    c.__com = v.com; c.style.pointerEvents = 'auto'; c.style.cursor = 'pointer';
    Popup.texto(pop, 'conversa-nome', v.nick, c); Popup.texto(pop, 'ultima-mensagem', v.ultima, c); Popup.texto(pop, 'nao-lidas', v.naoLidas ? String(v.naoLidas) : '', c);
    const bq = c.querySelector('[data-fig="badge-nao-lidas"], [data-fig="badge-qtd"]'); if (bq) bq.style.display = v.naoLidas ? 'block' : 'none';
    Popup.imagem(pop, 'retrato', retrato(v.dex), c);
    c.style.outline = v.com === soConversa ? '1px solid #F8C237' : ''; c.style.outlineOffset = '-1px'; c.style.borderRadius = '6px';
  });
  const log = mens.querySelector('[data-fig="conversa-log"]');
  if (log){
    let caixa = log.querySelector(':scope > .pf-dm-log');
    if (!caixa){ caixa = document.createElement('div'); caixa.className = 'pf-dm-log'; Object.assign(caixa.style, { position: 'absolute', inset: '0', overflowY: 'auto', padding: '10px 12px', color: '#E6ECFF', font: '13px/1.45 "Nunito Sans", system-ui, sans-serif', pointerEvents: 'auto', userSelect: 'text' }); log.appendChild(caixa); log.style.pointerEvents = 'auto'; }
    const eu = D?.eu?.usuario, nick = D?.amigos.find(a => a.usuario === soConversa)?.nick || conv.find(x => x.com === soConversa)?.nick || soConversa;
    if (!soConversa) caixa.innerHTML = '<div style="color:#B8C2D9;text-align:center;margin-top:40%">Escolha uma conversa ao lado, ou clique num amigo e peça "mensagem".</div>';
    else caixa.innerHTML = soMsgs.length ? soMsgs.map(m => '<div><b style="color:' + (m.de === eu ? '#8ef58e' : '#F8C237') + '">' + esc(m.de === eu ? 'Você' : nick) + '</b> <small style="color:#7f8db0">' + new Date(m.hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</small><br>' + esc(m.texto) + '</div>').join('') : '<div style="color:#B8C2D9;text-align:center;margin-top:40%">Sem mensagens ainda. Diga oi pra ' + esc(nick) + '.</div>';
    caixa.scrollTop = caixa.scrollHeight;
  }
  const inp = soInput(pop, 'conteudo-mensagens', 'campo-mensagem');
  if (inp){
    const nick = D?.amigos.find(a => a.usuario === soConversa)?.nick || conv.find(x => x.com === soConversa)?.nick;
    inp.placeholder = soConversa ? 'mensagem pra ' + nick + '…' : 'escolha uma conversa';
    if (!inp.__enter){ inp.__enter = true; inp.addEventListener('keydown', ev => { if (ev.key === 'Enter'){ ev.preventDefault(); soAcao('enviar').catch(() => {}); } }); }
  }
}
function encherSocial(pop){
  Popup.rotulo(pop, 'titulo'); for (const a of pop.querySelectorAll('[data-tag="aba"]')) Popup.rotulo(pop, 'aba', a);
  Popup.trocarAba(pop, abaSo);
  const vistaAmigos = ['campo-busca', 'btn-adicionar', 'btn-solicitacoes', 'lista-amigos'].map(n => Popup.grupo(pop, n)).filter(Boolean);
  const cont = pop.querySelector('[data-txt="amigos-contagem"]');
  const mostrarAmigos = abaSo === 'amigos';
  for (const g of vistaAmigos) g.style.display = mostrarAmigos ? 'block' : 'none';
  if (cont) cont.style.display = mostrarAmigos ? (cont.dataset.display || 'flex') : 'none';
  if (!mostrarAmigos) Popup.mostrarExtra(pop, 'tooltip-amigo', false);
  // aba Chat: o chat que o jogo já tem, em tela cheia dentro do painel
  let caixa = pop.querySelector('.pf-chat-social');
  const lista = Popup.grupo(pop, 'lista-amigos'), busca = Popup.grupo(pop, 'campo-busca');
  if (!caixa && lista && busca){
    caixa = document.createElement('div'); caixa.className = 'pf-chat-social';
    const x = parseFloat(busca.style.left) || 48, y = parseFloat(busca.style.top) || 96, w = parseFloat(lista.style.width) || 1404;
    const h = (parseFloat(lista.style.top) || 158) + (parseFloat(lista.style.height) || 332) - y;
    Object.assign(caixa.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', display: 'none', pointerEvents: 'auto', zIndex: '40', userSelect: 'text' });
    pop.appendChild(caixa); Chat.montar(caixa, { compacto: false });
  }
  if (caixa) caixa.style.display = abaSo === 'chat' ? 'flex' : 'none';
  // aba Mensagens: o conteúdo alternativo da maquete, no lugar da lista de amigos
  const mens = Popup.extra(pop, 'conteudo-mensagens');
  if (mens){
    if (abaSo === 'mensagens'){
      const x = parseFloat(busca?.style.left) || 48, y = parseFloat(busca?.style.top) || 96;
      Popup.mostrarExtra(pop, 'conteudo-mensagens', true, { x, y }); mens.style.pointerEvents = 'auto';
      if (soLigado() && !soDados) soCarregar();
      encherMensagens(pop, mens);
    } else Popup.mostrarExtra(pop, 'conteudo-mensagens', false);
  }
  // amigos
  const D = soDados;
  const cels0 = () => pop.querySelectorAll('[data-fig="lista-amigos"] > [data-fig^="amigo-"]');
  if (!soLigado()){ Popup.texto(pop, 'amigos-contagem', 'entre com uma conta pra ter amigos'); for (const c of cels0()) c.style.display = 'none'; Popup.texto(pop, 'solicitacoes-qtd', ''); bolinhaPedidos(pop, 0); return; }
  if (!D){ Popup.texto(pop, 'amigos-contagem', 'carregando…'); for (const c of cels0()) c.style.display = 'none'; bolinhaPedidos(pop, 0); soCarregar(); return; }
  const amigos = D.amigos.filter(a => !soBusca || a.nick.toLowerCase().includes(soBusca) || a.usuario.includes(soBusca));
  Popup.texto(pop, 'amigos-contagem', D.amigos.length + (D.amigos.length === 1 ? ' amigo' : ' amigos') + ' · ' + D.amigos.filter(a => a.online).length + ' online');
  const cels = Popup.celulas(pop, 'lista-amigos', Math.max(amigos.length, 1), 'amigo');
  cels.forEach((c, i) => {
    const a = amigos[i]; c.style.display = a ? 'block' : 'none'; if (!a) return;
    c.__amigo = a; c.style.pointerEvents = 'auto'; c.style.cursor = 'pointer';
    Popup.texto(pop, 'amigo-nome', a.nick, c);
    Popup.texto(pop, 'amigo-info', a.online ? 'Lv ' + (a.lv || 0) + (a.area ? ' · ' + a.area : ' · online') : 'offline' + (a.vistoEm ? ' há ' + tempoAtras(a.vistoEm) : ''), c);
    Popup.imagem(pop, 'retrato', retrato(a.dex), c);
    const dot = c.querySelector('[data-fig="estado-online"]'); if (dot) dot.style.display = a.online ? 'block' : 'none';   // o quadradinho verde da maquete é "online"
  });
  if (!amigos.length && lista){
    let vazio = lista.querySelector(':scope > .pf-nota');
    if (!vazio){ vazio = document.createElement('div'); vazio.className = 'pf-nota'; Object.assign(vazio.style, { position: 'absolute', left: '0', right: '0', top: '40%', textAlign: 'center', color: '#B8C2D9', font: '13px "Nunito Sans", system-ui, sans-serif', pointerEvents: 'none' }); lista.appendChild(vazio); }
    vazio.textContent = D.amigos.length ? 'Ninguém com esse nome.' : 'Sem amigos ainda. "Adicionar amigo" pede o nome exato do treinador.'; vazio.style.display = 'block';
  } else { const vazio = lista?.querySelector(':scope > .pf-nota'); if (vazio) vazio.style.display = 'none'; }
  // solicitações (contador no botão; o diálogo é preenchido quando abre)
  const n = D.pedidos.length;
  Popup.texto(pop, 'solicitacoes-qtd', n ? String(n) : '');
  bolinhaPedidos(pop, n);                                                // badge-qtd do padrão e bolinha desenhada do v2 (17/09)
  const sol = Popup.extra(pop, 'dialogo-solicitacoes'); if (sol && sol.style.display !== 'none') encherSolicitacoes(pop);
}

/* BOLINHA DE PEDIDOS (17/09, checagem visual): com 0 pedidos o botão Solicitações não mostra bolinha. HUD padrão: a bolinha é peça (`badge-qtd`). v2: ela vem
   DESENHADA no PNG do btn-solicitacoes, então fica tampada com um pedaço do miolo do btn-adicionar — a mesma arte sem a bolinha, da mesma altura, e o degradê
   do miolo só muda na vertical (no celular o btn-adicionar é mais estreito; por isso a amostra sai do MEIO dele). Pedido pra Amanda: a bolinha do v2 como peça
   separada; aí a tampa sai. */
function bolinhaPedidos(pop, n){
  const btn = pop.querySelector('[data-fig="btn-solicitacoes"]'); if (!btn) return;
  const badge = btn.querySelector('[data-fig="badge-qtd"]'); if (badge) badge.style.display = n ? 'block' : 'none';
  const ad = pop.querySelector('[data-fig="btn-adicionar"]'), q = btn.querySelector(':scope > [data-txt="solicitacoes-qtd"]');
  if (!pop.__def?.v2 || !ad || !q || !ad.style.backgroundImage) return;
  let t = btn.querySelector(':scope > .pf-sem-pedidos');
  if (!t){
    const pad = -parseFloat(ad.style.backgroundPosition) || 0, aw = parseFloat(ad.style.width) || 0, ah = parseFloat(ad.style.height) || 0;
    const x = (parseFloat(q.style.left) || 0) - 2, y = (parseFloat(q.style.top) || 0) - 2, w = (parseFloat(q.style.width) || 0) + 4, h = (parseFloat(q.style.height) || 0) + 4;
    t = document.createElement('i'); t.className = 'pf-sem-pedidos';
    Object.assign(t.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', pointerEvents: 'none', zIndex: String(Math.max(1, (parseInt(q.style.zIndex) || 10) - 1)),
      backgroundImage: ad.style.backgroundImage, backgroundRepeat: 'no-repeat', backgroundSize: (aw + 2 * pad) + 'px ' + (ah + 2 * pad) + 'px', backgroundPosition: -(pad + (aw - w) / 2) + 'px ' + -(pad + y) + 'px' });
    btn.insertBefore(t, q);
  }
  t.style.display = n ? 'none' : 'block';
}
/* ---------------------------------------------------------------- Pokédex */
let genDx = 1;
const GENS_DX = [[1, 1, 151], [2, 152, 251], [3, 252, 386], [4, 387, 493], [5, 494, 649]];
function popupDx(){
  if (popDx) return popDx;
  const def = defPopup('pokedex'); if (new URLSearchParams(location.search).get('popup') === '0' || !def) return null;
  popDx = Popup.montar(def, {
    aba: a => { const m = /^gen-(\d)$/.exec(a); if (m){ genDx = +m[1]; selDex = null; render(); } },
    digita: v => { dexBusca = v; render(); },
    fechar: () => { if (aberta === 'pokedex') aberta = null; pararDex(); },
  });
  popDx.addEventListener('click', ev => {                                // clique na linha escolhe a espécie
    const c = ev.target?.closest?.('[data-fig="lista-especies"] > [data-fig^="especie-"]'); if (!c || c.__dex == null) return;
    selDex = c.__dex; render();
  });
  return popDx;
}
async function encherPokedex(pop){
  Popup.rotulo(pop, 'titulo'); for (const a of pop.querySelectorAll('[data-tag="aba"]')) Popup.rotulo(pop, 'aba', a);
  Popup.trocarAba(pop, 'gen-' + genDx);
  const [, a, b] = GENS_DX.find(([g]) => g === genDx) || GENS_DX[0]; const d = dexEstado(), K = ctx.conhecimento;
  const q = dexBusca.trim().toLowerCase();
  const todos = [...ctx.porDex.values()].filter(s => s.n >= a && s.n <= b).sort((p, r) => p.n - r.n);
  const sp = todos.filter(s => !q || String(s.n) === q || (d[s.n] && s.name.toLowerCase().includes(q)));
  const vistos = todos.filter(s => d[s.n]).length, pegos = todos.filter(s => d[s.n] === 'pego').length;
  if (!sp.some(s => s.n === selDex)) selDex = (sp.find(s => d[s.n]) || sp[0])?.n ?? null;
  Popup.texto(pop, 'contadores', '👁 ' + vistos + ' · ★ ' + pegos + '/' + todos.length);
  if (K){
    const r = K.resumo(); const base = 'Colecionador Kanto · ' + r.pegosKanto + '/' + r.kantoAte + ' capturados · ' + r.vistosKanto + ' vistos · ' + r.shinies + ' shiny';
    Popup.texto(pop, 'colecionador', base);
    minhaPosicao().then(p => { if (p && p.especies?.pos && aberta === 'pokedex' && Popup.aberto(pop)) Popup.texto(pop, 'colecionador', base + ' · ' + p.especies.pos + 'º de ' + p.total + ' no ranking'); });   // posição entre os jogadores (servidor)
  }
  // lista
  const cels = Popup.celulas(pop, 'lista-especies', Math.max(sp.length, 1), 'especie');
  cels.forEach((c, i) => {
    const s = sp[i]; c.style.display = s ? 'block' : 'none'; if (!s) return;
    const st = d[s.n], nv = K ? K.nivel(s.n) : (st === 'pego' ? 2 : st ? 1 : 0);
    c.__dex = s.n; c.style.pointerEvents = 'auto'; c.style.cursor = 'pointer';
    Popup.texto(pop, 'numero', pad3(s.n), c); Popup.texto(pop, 'nome', st ? s.name : '?????', c);
    const prog = c.querySelector('[data-fig="progresso-especie"]'); if (prog){ prog.style.display = st ? 'block' : 'none'; bolinhas(prog, nv); }
    for (const g of c.querySelectorAll(':scope > [data-fig^="tipo-"]')) g.style.display = 'none';
    if (st) pilulasTipo(pop, c, s.types || []);
    Popup.estadoRef(pop, c, 'especie', s.n === selDex ? 'selecionada' : st ? 'vista' : 'oculta');
    for (const m of c.querySelectorAll(':scope > [data-sobre]')) m.style.display = s.n === selDex ? 'block' : 'none';   /* 18/09: v2 — a marca-selecionado [estado:selecionada] da linha; a maquete não tem ref 'especie', então o estadoRef acima não fazia nada e a lista não mostrava qual espécie está na ficha */
  });
  // ficha
  if (selDex == null) return;
  const S = ctx.porDex.get(selDex), st = d[selDex], conhecido = !!st;
  await Promise.all([carregarElenco(), carregarDexExtra()]);
  if (aberta !== 'pokedex' || !Popup.aberto(pop)) return;
  const X = dexExtra.especies?.[selDex] || {};
  const rv = K ? K.revela(selDex) : null, nv = rv ? rv.nivel : (st === 'pego' ? 2 : st ? 1 : 0);
  Popup.texto(pop, 'especie-nome', nv >= 1 ? S?.name : '?????'); Popup.texto(pop, 'especie-numero', 'Nº ' + pad3(selDex));
  Popup.texto(pop, 'especie-visto', '· ' + (st === 'pego' ? 'capturado' : st ? 'visto' : 'desconhecido'));
  bolinhas(Popup.grupo(pop, 'progresso-registro'), nv); Popup.texto(pop, 'nivel-nome', NOMES_NIVEL[nv]);
  const falta = K && nv < 5 ? K.falta(selDex).slice(0, 3) : [];
  Popup.texto(pop, 'como-subir', nv >= 5 ? 'Nível máximo: você é Mestre desta espécie.' : (rv && rv.proximo != null ? rv.pontos + '/' + rv.proximo + ' pra ' + NOMES_NIVEL[nv + 1] + (falta.length ? ' — pra subir: ' + falta.join(', ') : '') : (st ? '' : 'Encontre este Pokémon pra abrir a ficha.')));
  const f = Popup.grupo(pop, 'ficha-especie');
  pilulasTipo(pop, Popup.grupo(pop, 'tipos-especie') || f, nv >= 1 ? (S?.types || []) : []);
  // visor 3D nas duas caixas [do-jogo]
  const modelos = Popup.grupo(pop, 'modelos'), bN = modelos?.querySelector('[data-var="modelo-normal"]'), bS = modelos?.querySelector('[data-var="modelo-shiny"]');
  if (modelos && bN && bS){
    const v = visorDex(); const w = parseFloat(bN.style.width) || 266, h = parseFloat(bN.style.height) || 157, x0 = parseFloat(bN.style.left) || 13, x1 = parseFloat(bS.style.left) || 327, y = parseFloat(bN.style.top) || 15;
    v.redimensionar(Math.round(w), Math.round(h), Math.round(x1 - x0 - w));
    if (v.canvas.parentElement !== modelos){ modelos.appendChild(v.canvas); }
    Object.assign(v.canvas.style, { position: 'absolute', left: x0 + 'px', top: y + 'px', width: (2 * w + (x1 - x0 - w)) + 'px', height: h + 'px', pointerEvents: 'auto', zIndex: '60', cursor: 'grab' });
    if (!v.ativo){ v.ativo = true; v.t0 = 0; requestAnimationFrame(v.quadro); }
    const glb = glbDe(selDex); selDexGlb = glb;
    mostrarModeloDex(glb, nv >= 1).catch(e => console.warn('pokédex 3D:', e));
  }
  // tabela de informações (cadeado até o nível certo)
  const alt = ctx.alturas?.[selDex] ?? X.a, peso = S?.kg ?? X.p;
  const linhas = [
    ['info-altura---peso', 2, alt || peso ? (alt ? alt.toFixed(1) + ' m' : '—') + ' · ' + (peso ? peso + ' kg' : '—') : '—'],
    ['info-habilidades', 3, X.h?.length ? X.h.join(', ') + (X.ho ? (nv >= 4 ? ' (oculta: ' + X.ho + ')' : ' (oculta: abre no nível 4)') : '') : '—'],
    ['info-g-nero', 4, X.m != null ? (X.m < 0 ? 'sem gênero' : '♂ ' + X.m + '% · ♀ ' + X.f + '%') : '—'],
    ['info-taxa-de-captura', 3, (S?.rate ?? X.c ?? '—') + ' · ' + (chanceCaptura(S?.rate ?? X.c ?? 45) * 100).toFixed(1) + '% com HP cheio e Pokébola'],
  ];
  for (const g of pop.querySelectorAll('[data-fig="tabela-infos"] > [data-fig^="info-"]')){
    const l = linhas.find(x => x[0] === g.dataset.fig) || linhas.find(x => g.dataset.fig.startsWith(x[0].slice(0, 9)));
    Popup.rotulo(pop, 'info-rotulo', g);
    if (!l){ continue; }
    const aberto = nv >= l[1];
    const cad = g.querySelector('[data-var="cadeado"]'); if (cad){ cad.style.display = aberto ? 'none' : 'block'; if (!aberto) arteExemplo(cad); }
    const vl = Popup.texto(pop, 'info-valor', aberto ? l[2] : 'abre no nível ' + l[1] + ' (' + NOMES_NIVEL[l[1]] + ')', g);
    if (vl) vl.style.color = aberto ? '#FFFFFF' : '#B8C2D9';
  }
  const noMapa = (ctx.jogo.selvagens || []).filter(s => s.dex === selDex && s.estado !== 'morto').length;
  const onde = (() => { const hb = ctx.habitats; if (!hb) return []; const out = []; for (const [area, lista] of Object.entries(hb.areas || {})) if (lista.some(e => e.dex === selDex)) out.push(ctx.nomeArea?.(+area) || ctx.dados?.nomes?.[area] || ('área ' + area)); return out; })();
  Popup.rotulo(pop, 'rotulo-onde');
  Popup.texto(pop, 'onde', nv >= 1 ? ((onde.length ? onde.join(', ') : 'não aparece no mato (só troca/evento)') + (noMapa ? ' · ' + noMapa + ' neste mapa agora' : '')) : '?');
  const avS = Popup.grupo(pop, 'aviso-stats'), avG = Popup.grupo(pop, 'aviso-golpes');
  const cadeadoDe = g => { const c = g?.querySelector('[data-var="cadeado"]'); arteExemplo(c); if (c) c.style.display = 'block'; };
  if (avS){ avS.style.display = nv < 2 ? 'block' : 'none'; cadeadoDe(avS); Popup.texto(pop, 'aviso', 'stats, evolução e fraquezas abrem no nível 2 (capture um)', avS); }
  if (avG){ const golpes = (X.g || []).length, vistosG = (K?.registro(selDex)?.gl || []).length; avG.style.display = nv < 4 && golpes ? 'block' : 'none'; cadeadoDe(avG); Popup.texto(pop, 'aviso', 'golpes abrem vendo a espécie batalhar (' + vistosG + '/' + golpes + ' do learnset vistos; tudo no nível 4)', avG); }
}

/* ------------------------------------------------------------------ Missões */
function rMissoes(corpo){
  abas([{ id: 'principal', nome: 'Principal' }]);
  const M = ctx.missoes;
  if (!M?.pronto?.()){ corpo.innerHTML = '<div class="vazio">As missões ainda estão carregando…</div>'; return; }
  const caps = M.capitulos(), ativa = M.ativa(), idx = M.indicePasso(), prog = M.progresso();
  const nomeItem = id => D.itens[id]?.n || ('item ' + id);
  const rec = r => [r?.dinheiro ? r.dinheiro + ' Moedas' : null, ...Object.entries(r?.itens || {}).map(([id, n]) => esc(nomeItem(id)) + ' ×' + n), r?.exp ? r.exp + ' XP' : null].filter(Boolean).join(' · ') || '—';
  const passoTxt = (p, i) => { const n = p.n || 0; const c = i === idx && n > 1 ? ' ' + Math.min(prog, n) + '/' + n : ''; return esc(p.texto) + c + (p.onde ? ' <small style="color:var(--muted)">(' + esc(p.onde) + ')</small>' : ''); };
  const atual = ativa ? `<div class="missao-atual"><small style="color:var(--muted)">Capítulo ${ativa.capitulo} · ${esc(ativa.capNome)}</small><br><b>${esc(ativa.nome)}</b><br><span style="font-size:12px">${esc(ativa.des)}</span>
      <div style="margin-top:8px;font-size:13px;line-height:1.5">${ativa.passos.map((p, i) => `<div>${i < idx ? '✔' : i === idx ? '▶' : '○'} ${passoTxt(p, i)}</div>`).join('')}</div>
      <div style="margin-top:6px;font-size:12px;color:var(--muted)">recompensa: ${rec(ativa.recompensa)}</div></div>`
    : '<div class="missao-atual"><b>Você concluiu tudo o que existe por enquanto.</b><br><span style="font-size:12px">Mais capítulos chegam nas próximas versões.</span></div>';
  corpo.innerHTML = atual + caps.map(c => { const feitas = c.missoes.filter(m => m.estado === 'feita').length, aberta = c.missoes.some(m => m.estado === 'ativa'); return `<details ${aberta ? 'open' : ''} style="margin-top:8px"><summary style="cursor:pointer;color:${feitas === c.missoes.length ? 'var(--muted)' : '#ffe07a'}">${feitas === c.missoes.length ? '✅' : aberta ? '▶️' : '🔒'} Capítulo ${c.id} — ${esc(c.nome)} <small style="color:var(--muted)">${feitas}/${c.missoes.length}</small></summary><div class="lista">${c.missoes.map(m => `<div class="linha" style="cursor:default;${m.estado === 'travada' ? 'opacity:.55' : ''}"><span style="font-size:16px">${m.estado === 'feita' ? '✅' : m.estado === 'ativa' ? '▶️' : '🔒'}</span><span class="nome"><b>${esc(m.nome)}</b><small>${esc(m.des)} · recompensa: ${rec(m.recompensa)}</small></span></div>`).join('')}</div></details>`; }).join('');
}

/* ============================================================ pop-up Missões (maquete do Figma, rodada 10)
   Em cima a missão ativa com até 4 objetivos; embaixo os 20 capítulos, que abrem e fecham. A altura de cada linha
   varia (capítulo fechado 28 px, aberto 26 + missões×46 − 4 + 10), então a pilha é montada na mão. Os ícones de
   estado saem das referências `[estado:…]` da própria página, não de nomes de arquivo escritos aqui. */
let popMi = null, capAberto = null, capAtivoVisto = null;
function popupMi(){
  if (popMi) return popMi;
  const def = defPopup('missoes');
  if (new URLSearchParams(location.search).get('popup') === '0') return null;
  if (!def) return null;                                                 // sem maquete (celular em pé): janela antiga
  popMi = Popup.montar(def, {
    aba: () => render(),
    fechar: () => { if (aberta === 'missoes') aberta = null; },
  });
  popMi.addEventListener('click', ev => {                                // clique no capítulo abre/fecha
    const c = ev.target?.closest?.('[data-fig^="capitulo-"]'); if (!c || /-missoes$/.test(c.dataset.fig)) return;
    const n = +c.dataset.fig.split('-')[1]; if (!n) return;
    capAberto = capAberto === n ? null : n; render();
  });
  return popMi;
}
/** Ícone de um estado, lido da referência `[estado:x]` do pacote (nada de nome de arquivo escrito no código). */
function iconeEstado(pop, ref, estado, id, el = null){
  const f = (pop.__refs?.[ref]?.[estado]?.filhos || []).find(x => x.id === id);
  if (el && f?.exemplo && f.exemploPad) Hud.fundoComFolga(el, f.exemploPad);   // 17/09 (auditoria): no v2 o PNG do ícone vem com a folga de 16 px em volta — com `contain` o ▶ ✓ ○ 🔒 saía do tamanho de um ponto
  return f?.exemplo || null;
}
/** Arte de EXEMPLO da maquete usada como arte fixa (cadeado da Pokédex, ilustração do "Em breve"). 17/09 (auditoria dos placeholders): no v2 o PNG
    vem com a folga de 16 px em volta (`data-exemplo-pad`) e, desenhado com `contain`, o cadeado virava um pontinho dourado. */
function arteExemplo(el){
  if (!el?.dataset.exemplo || el.style.backgroundImage) return;
  el.style.backgroundImage = 'url(' + el.dataset.exemplo + ')';
  if (+el.dataset.exemploPad) Hud.fundoComFolga(el, +el.dataset.exemploPad);
}
function textoRecompensaMi(r){
  const nomeItem = id => D.itens[id]?.n || ('item ' + id);
  return [r?.dinheiro ? r.dinheiro + ' Moedas' : null,
          ...Object.entries(r?.itens || {}).map(([id, n]) => nomeItem(id) + ' ×' + n),
          r?.exp ? r.exp + ' XP' : null].filter(Boolean).join(' · ') || '—';
}
/* Geometria da lista de capítulos, LIDA da maquete (PC: capítulo 20 px, grupo em y 26, missões de 42 a cada 46, +10 depois;
   deitado: 14 / 18,7 / 29,9 a cada 34,5). Medida uma vez, antes do 1º clonarSerie mexer na árvore. */
function geometriaMissoes(pop){
  if (pop.__geo) return pop.__geo;
  const g = n => Popup.grupo(pop, n), top = el => parseFloat(el?.style.top) || 0, alt = el => parseFloat(el?.style.height) || 0, esq = el => parseFloat(el?.style.left) || 0;
  const c1 = g('capitulo-1'), c2 = g('capitulo-2'), c3 = g('capitulo-3'), gm = g('capitulo-1-missoes'), m1 = g('missao-1'), m2 = g('missao-2');
  const hCap = alt(c1) || 20;
  const passoCap = (c2 && c3) ? top(c3) - top(c2) : hCap + 8;         // capítulo fechado → próximo
  const yGrupo = gm ? top(gm) : hCap + 6, xGrupo = gm ? esq(gm) : 0;   // onde as missões do capítulo aberto começam
  const hMis = alt(m1) || 42, passoMis = m2 ? top(m2) - top(m1) : hMis + 4;
  const depois = (c2 && gm) ? top(c2) - (yGrupo + alt(gm)) : 10;       // folga depois do grupo aberto
  const arteAberto = c1?.dataset.arte || null, arteFechado = c2?.dataset.arte || null;   // 17/09: v2 — a seta ▼/▶ está DESENHADA na arte (capitulo-1 aberto, capitulo-2 fechado)
  return (pop.__geo = { hCap, passoCap, yGrupo, xGrupo, hMis, passoMis, depois, arteAberto, arteFechado });
}
function encherMissoes(pop){
  const M = ctx.missoes;
  const G = geometriaMissoes(pop);
  Popup.rotulo(pop, 'titulo');                                          // "Missões" e os nomes das abas: rótulos da maquete (v2 trouxe como txt/, não na arte)
  for (const aba of pop.querySelectorAll('[data-tag="aba"]')) Popup.rotulo(pop, 'aba', aba);
  if (!M?.pronto?.()) return;
  const ativa = M.ativa(), idx = M.indicePasso(), prog = M.progresso();
  const fa = Popup.grupo(pop, 'missao-ativa');
  Popup.texto(pop, 'capitulo-local', ativa ? 'Capítulo ' + ativa.capitulo + ' · ' + ativa.capNome : '', fa);
  Popup.texto(pop, 'missao-titulo', ativa ? ativa.nome : 'Você concluiu tudo o que existe por enquanto.', fa);
  Popup.texto(pop, 'missao-descricao', ativa ? (ativa.des || '') : 'Mais capítulos chegam nas próximas versões.', fa);
  const passos = ativa?.passos || [];
  for (let i = 0; i < 4; i++){
    const g = Popup.grupo(pop, 'objetivo-' + (i + 1)); if (!g) continue;
    const p2 = passos[i];
    g.style.display = p2 ? 'block' : 'none';
    if (!p2) continue;
    const estado = i < idx ? 'feito' : i === idx ? 'atual' : 'pendente';
    const ic = Popup.no(pop, 'objetivo-estado', g);
    if (ic){
      const url = iconeEstado(pop, 'objetivo', estado, 'objetivo-estado', ic);
      ic.style.backgroundImage = url ? 'url(' + url + ')' : 'none';
      ic.style.border = url ? '0' : '1.5px solid #B8C2D9';               // pendente é um círculo vazio, sem PNG
      ic.style.borderRadius = url ? '0' : '50%';
    }
    const cont = (i === idx && p2.n > 1) ? ' ' + Math.min(prog, p2.n) + '/' + p2.n : '';
    Popup.texto(pop, 'objetivo', (p2.texto || '') + cont, g);
    Popup.texto(pop, 'objetivo-local', p2.onde ? '(' + p2.onde + ')' : '', g);
  }
  Popup.texto(pop, 'recompensa', ativa ? 'Recompensa: ' + textoRecompensaMi(ativa.recompensa) : '');
  // ---- lista de capítulos (altura variável)
  const caps = M.capitulos();
  if (ativa && ativa.capitulo !== capAtivoVisto){ capAtivoVisto = ativa.capitulo; capAberto = ativa.capitulo; }   // abre o ativo UMA vez (e quando muda); depois o jogador manda — antes, fechar o ativo reabria no mesmo render
  const linhas = Popup.clonarSerie(pop, 'lista-capitulos', 'capitulo-1', caps.length, 'capitulo');
  const nMissoes = caps.reduce((a, c) => a + (capAberto === c.id ? c.missoes.length : 0), 0);
  const grupoMolde = Popup.grupo(pop, 'capitulo-1-missoes');
  if (grupoMolde) grupoMolde.style.display = 'none';                     // o grupo da maquete não é usado: só o molde da linha
  const linhasMi = Popup.clonarSerie(pop, 'lista-capitulos', 'missao-1', Math.max(nMissoes, 1), 'missao');
  for (const el of linhasMi) el.style.display = 'none';
  let nLinha = 0, y = 0;
  caps.forEach((c, i) => {
    const linha = linhas[i]; if (!linha) return;
    const aberto = capAberto === c.id;
    linha.style.top = y + 'px';
    const seta = linha.querySelector('[data-fig="icone-seta"]');
    if (seta) seta.textContent = aberto ? '▼' : '▶';
    if (G.arteAberto && G.arteFechado && G.arteAberto !== G.arteFechado) linha.style.backgroundImage = 'url(' + (aberto ? G.arteAberto : G.arteFechado) + ')';   // 17/09 (auditoria dos placeholders): no v2 o capítulo 1 (e as cópias dele) ficava sempre com ▼ e o aberto com ▶
    const feitas = c.missoes.filter(m => m.estado === 'feita').length;
    const est = feitas === c.missoes.length ? 'concluida' : c.missoes.some(m => m.estado === 'ativa') ? 'ativa' : 'bloqueada';
    const ic = Popup.no(pop, 'capitulo-estado', linha);
    if (ic){ const url = iconeEstado(pop, 'missao', est, 'objetivo-estado', ic); ic.style.backgroundImage = url ? 'url(' + url + ')' : 'none'; }
    Popup.texto(pop, 'capitulo-nome', 'Capítulo ' + c.id + ' · ' + c.nome, linha);
    Popup.texto(pop, 'capitulo-progresso', feitas + '/' + c.missoes.length, linha);
    if (!aberto){ y += G.passoCap; return; }
    y += G.yGrupo;
    /* As linhas da missão vão DIRETO na lista, não dentro de um grupo por capítulo: um nível a mais de grupo
       absoluto dentro do contêiner que rola não pintava (o Chrome desenhava só o retângulo de fundo). */
    c.missoes.forEach((m, k) => {
      const el = linhasMi[nLinha++]; if (!el) return;
      el.style.display = 'block'; el.style.top = (y + k * G.passoMis) + 'px'; el.style.left = G.xGrupo + 'px';
      const estM = m.estado === 'feita' ? 'concluida' : m.estado === 'ativa' ? 'ativa' : 'bloqueada';
      for (const mk of el.querySelectorAll(':scope > [data-fig="marca-ativa"]')) mk.style.display = estM === 'ativa' ? 'block' : 'none';   // 17/09 (auditoria): as linhas são cópias da missao-1 da maquete, que vem com a moldura dourada ligada — só a missão ativa fica com ela
      const ic2 = Popup.no(pop, 'objetivo-estado', el);
      if (ic2){ const url = iconeEstado(pop, 'missao', estM, 'objetivo-estado', ic2); ic2.style.backgroundImage = url ? 'url(' + url + ')' : 'none'; }
      const nomeEl = Popup.texto(pop, 'missao-nome', m.nome, el);
      if (nomeEl) nomeEl.style.color = estM === 'bloqueada' ? '#B8C2D9' : '#FFFFFF';
      Popup.texto(pop, 'missao-resumo', (m.des || '') + ' · recompensa: ' + textoRecompensaMi(m.recompensa), el);
    });
    y += Math.max(0, (c.missoes.length - 1) * G.passoMis + G.hMis) + G.depois;
  });
  Popup.alturaRolagem(pop, 'lista-capitulos', y);
}

/* ------------------------------------------------------------------ Mapa */
let mapaRuas = null, mapaHabitats = null, mapaSel = null;
function rMapa(corpo){
  abas([{ id: 'kanto', nome: 'Kanto' }]);
  const dd = ctx.dados, caixas = (dd.caixas || []).filter(c => c.sx > 0 && c.sz > 0);
  if (caixas.length < 2){ corpo.innerHTML = '<div class="vazio">Sem mapa nesta cena (interior). Saia pra rua pra ver Kanto.</div>'; return; }
  corpo.innerHTML = `<div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap"><div style="flex:1 1 560px;min-width:340px"><canvas class="mapa" width="1280" height="960" style="width:100%;border-radius:12px;cursor:pointer"></canvas><div id="m-legenda" style="color:var(--muted);font-size:12px;margin-top:6px">clique numa área pra ver os Pokémon dela</div></div><div id="m-card" style="flex:1 1 240px;min-width:230px"></div></div>`;
  const cv = corpo.querySelector('canvas'), c = cv.getContext('2d');
  const fx = ctx.flipX();
  const xs = caixas.flatMap(b => [fx * b.x - b.sx / 2, fx * b.x + b.sx / 2]), zs = caixas.flatMap(b => [b.z - b.sz / 2, b.z + b.sz / 2]);
  const x0 = Math.min(...xs) - 8, x1 = Math.max(...xs) + 8, z0 = Math.min(...zs) - 8, z1 = Math.max(...zs) + 8;
  const k = Math.min(1280 / (x1 - x0), 960 / (z1 - z0)), ox = (1280 - (x1 - x0) * k) / 2, oz = (960 - (z1 - z0) * k) / 2;
  const X = x => ox + (x - x0) * k, Z = z => oz + (z - z0) * k;
  if (!mapaRuas){                                                        // ruas/pontes uma vez só (42k colocações filtradas)
    mapaRuas = [];
    for (const ch of ['areaEnv', 'ambiente', 'objetos']) for (const o of dd[ch] || []){
      const n = (o.n || '').toLowerCase();
      if (/road|floor|bridge|pier|stair/.test(n) && !/sea|water|shui/.test(n)) mapaRuas.push({ x: o.x, z: o.z, w: +o.w || 4 });
    }
  }
  const ehCidade = nome => /Cidade|Ilha|Liga/.test(nome);
  const desenhar = () => {
    c.fillStyle = '#79b7e0'; c.fillRect(0, 0, 1280, 960);                // mar
    for (const b of caixas){                                             // áreas
      const nome = dd.nomes?.[b.a] || ''; const cid = ehCidade(nome);
      c.fillStyle = cid ? '#dcca97' : '#95c96f';
      c.beginPath(); c.roundRect(X(fx * b.x - b.sx / 2), Z(b.z - b.sz / 2), b.sx * k, b.sz * k, 6); c.fill();
      c.strokeStyle = mapaSel === b.a ? '#ffd23a' : '#6b6b4a'; c.lineWidth = mapaSel === b.a ? 3 : 1.2; c.stroke();
    }
    c.fillStyle = '#c4ad7c'; for (const r of mapaRuas) c.fillRect(X(fx * r.x - r.w / 2), Z(r.z - r.w / 2), r.w * k, r.w * k);   // ruas
    c.fillStyle = '#4d8fd6'; for (const t2 of dd.agua || []) c.fillRect(X(fx * t2.x), Z(t2.z), k, k);       // água
    c.fillStyle = '#3f8a2f'; for (const t2 of dd.grama || []) c.fillRect(X(fx * t2.x), Z(t2.z), k, k);      // grama alta
    for (const b of caixas){                                             // rótulos
      const nome = dd.nomes?.[b.a] || ''; if (!nome || nome.startsWith('área')) continue;
      const cid = ehCidade(nome), rot = nome.replace('Cidade ', ''), cx2 = X(fx * b.x), cz2 = Z(b.z);
      c.font = (cid ? '600 19px' : '600 13px') + ' system-ui'; c.textAlign = 'center';
      if (cid){ const w = c.measureText(rot).width + 16; c.fillStyle = '#ffffffee'; c.beginPath(); c.roundRect(cx2 - w / 2, cz2 - 13, w, 26, 12); c.fill(); c.strokeStyle = '#444'; c.lineWidth = 1; c.stroke(); c.fillStyle = '#1a1a1a'; c.fillText(rot, cx2, cz2 + 5); }
      else { c.strokeStyle = '#f2f7e6'; c.lineWidth = 3; c.strokeText(rot, cx2, cz2 + 4); c.fillStyle = '#1d3a12'; c.fillText(rot, cx2, cz2 + 4); }
    }
    const ash = ctx.jogo.ash;
    if (ash){ c.fillStyle = '#ff5f5f'; c.beginPath(); c.arc(X(ash.x), Z(ash.z), 6, 0, Math.PI * 2); c.fill(); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke(); }
  };
  const cartao = async a => {
    mapaSel = a; desenhar();
    const alvo = corpo.querySelector('#m-card'); const nome = dd.nomes?.[a] || ('área ' + a);
    mapaHabitats ??= await fetch('./data/habitats.json').then(r => r.json()).catch(() => ({ areas: {}, generico: [] }));
    const proprios = mapaHabitats.areas?.[String(a)] || [];
    const lista = proprios.length ? proprios : (ehRota(a) ? mapaHabitats.generico || [] : []);
    const d = dexEstado();
    const linha = e => { const st = d[e.dex]; const visto = st === 'visto' || st === 'pego';
      return `<div class="m-poke ${visto ? '' : 'sombra'}"><img src="./ui/mon/pm${String(e.dex).padStart(4, '0')}.png" loading="lazy"><b>${visto ? esc(e.nome) : '???'}</b>${e.agua ? '<small>💧</small>' : ''}${st === 'pego' ? '<small class="pego">✔ pego</small>' : ''}</div>`; };
    alvo.innerHTML = `<div class="ficha"><h3>${esc(nome)}</h3>${lista.length ? `<div style="color:var(--muted);font-size:11px;margin:4px 0 8px">${proprios.length ? 'Pokémon desta área' : 'Pokémon comuns da região'} — de perto eles entram na Pokédex</div><div class="m-grade">${lista.map(linha).join('')}</div>` : '<div class="vazio" style="padding:14px 6px">Sem Pokémon selvagens aqui.</div>'}</div>`;
  };
  cv.onclick = ev => {
    const r = cv.getBoundingClientRect();
    const mx = (ev.clientX - r.left) / r.width * 1280, mz = (ev.clientY - r.top) / r.height * 960;
    const wx = (mx - ox) / k + x0, wz = (mz - oz) / k + z0;
    const b = caixas.find(b => Math.abs(wx - fx * b.x) <= b.sx / 2 && Math.abs(wz - b.z) <= b.sz / 2);
    if (b) cartao(b.a);
  };
  desenhar();
  const ash = ctx.jogo.ash;
  const atual = ash && caixas.find(b => Math.abs(ash.x - fx * b.x) <= b.sx / 2 && Math.abs(ash.z - b.z) <= b.sz / 2);
  cartao(atual ? atual.a : caixas[0].a);
}

/* ------------------------------------------------------------------ Pokédex (3D + shiny + ficha completa) */
let selDex = null, elenco = null, dexView = null, dexExtra = null, dexBusca = '', dexShiny = false, selDexGlb = null;
const cacheGlb = new Map(), texShiny = new Map();
async function carregarElenco(){ if (!elenco) elenco = await fetch('./data/elenco.json').then(r => r.json()).catch(() => []); return elenco; }
async function carregarDexExtra(){ if (!dexExtra) dexExtra = await fetch('./data/dex_extra.json').then(r => r.json()).catch(() => ({ especies: {}, golpes: {} })); return dexExtra; }
const glbDe = n => { const cands = (elenco || []).filter(e => e.n === n); return (cands.find(e => /_00$/.test(e.glb)) || cands[0])?.glb || null; };
function dexEstado(){
  const d = ctx.lerLS('dex', {});
  for (const [k, v] of Object.entries(ctx.conhecimento?.estadoAntigo?.() || {})) if (v === 'pego' || !d[k]) d[k] = v;   // Pokédex de conhecimento
  for (const s of ctx.jogo.selvagens || []) if (s.dex && !d[s.dex]) d[s.dex] = 'visto';
  for (const t of timeAtual()) if (t.dex) d[t.dex] = 'pego';
  for (const t of ctx.lerLS('caixa', [])) if (t.dex) d[t.dex] = 'pego';
  ctx.gravarLS('dex', d); return d;
}
/** Visor 3D duplo: um renderizador (canvas 1200×600) com duas viewports — Normal à esquerda e
    ✨ Shiny à direita —, os dois em Idle girando juntos; arrastar gira. Modelos de cenario/mon com o
    fogo/lodo do jogo; desconhecido = um "?" nos dois lados (19/09: o modelo nem é baixado). */
function visorDex(){
  if (dexView) return dexView;
  const canvas = document.createElement('canvas'); canvas.className = 'dex-3d'; canvas.width = 1200; canvas.height = 600;
  const ren = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }); ren.setPixelRatio(1); ren.setSize(1200, 600, false); ren.outputColorSpace = THREE.SRGBColorSpace; ren.setScissorTest(true);
  const cena = new THREE.Scene();
  cena.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2418, 1.1));
  const sol = new THREE.DirectionalLight(0xffffff, 1.6); sol.position.set(2, 4, 3); cena.add(sol);
  cena.add(new THREE.Mesh(new THREE.RingGeometry(0.55, 0.62, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.35 })));
  const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 100); cam.position.set(0, 0.62, 2.35); cam.lookAt(0, 0.46, 0);
  const v = { canvas, ren, cena, cam, grupos: [], mixers: [], ativo: false, giro: 0, arrastando: null, t0: 0, lay: { w: 600, h: 600, gap: 0 } };
  /* Duas janelas (normal | shiny) lado a lado: no pop-up do Figma cada uma tem o tamanho da caixa `img/modelo-*` e um vão entre elas. */
  v.redimensionar = (w, h, gap = 0) => { if (v.lay.w === w && v.lay.h === h && v.lay.gap === gap) return; v.lay = { w, h, gap }; ren.setSize(2 * w + gap, h, false); canvas.width = 2 * w + gap; canvas.height = h; cam.aspect = w / h; cam.updateProjectionMatrix(); };
  let ultimoX = 0;
  canvas.addEventListener('pointerdown', ev => { v.arrastando = ev.pointerId; ultimoX = ev.clientX; try { canvas.setPointerCapture(ev.pointerId); } catch {} });
  canvas.addEventListener('pointermove', ev => { if (v.arrastando !== ev.pointerId) return; v.giro += (ev.clientX - ultimoX) * 0.012; ultimoX = ev.clientX; });
  const solta = ev => { if (v.arrastando === ev.pointerId) v.arrastando = null; };
  canvas.addEventListener('pointerup', solta); canvas.addEventListener('pointercancel', solta);
  v.render = () => {
    for (let i = 0; i < 2; i++){
      v.grupos.forEach((g, k) => { g.visible = k === i; });
      const { w, h, gap } = v.lay; ren.setViewport(i * (w + gap), 0, w, h); ren.setScissor(i * (w + gap), 0, w, h);
      ren.render(cena, cam);
    }
  };
  v.quadro = () => {
    if (!v.ativo) return;
    const t = performance.now() / 1000, dt = Math.min(0.05, t - (v.t0 || t)); v.t0 = t;
    if (v.arrastando === null) v.giro += dt * 0.45;
    for (const g of v.grupos) g.rotation.y = v.giro;
    for (const m of v.mixers) m.update(dt);
    Fogo.atualizarFogo(dt); Lodo.atualizarLodo(dt);
    v.render();
    requestAnimationFrame(v.quadro);
  };
  dexView = v; return v;
}
function limparModeloDex(){
  const v = dexView; if (!v) return;
  for (const g of v.grupos){ v.cena.remove(g); g.traverse(o => { if ((o.isMesh && o.material?.__silhueta) || o.isSprite) o.material.dispose(); }); }
  v.grupos = []; v.mixers = [];
}
/** Shiny como o jogo faz: cada textura X vira shiny/X_1.png. A textura shiny é criada do ZERO depois
    que a imagem carrega (new Texture): trocar o `source` de um clone já enviado à GPU reescreve a
    textura GL compartilhada com a normal — os dois lados viravam shiny. Devolve quantas existem. */
function texturaShiny(base){
  const nome = base?.name || ''; if (!nome) return Promise.resolve(null);
  if (!texShiny.has(nome)) texShiny.set(nome, new Promise(res => {
    const img = new Image();
    img.onload = () => { const t = new THREE.Texture(img); t.name = nome + '_1'; t.flipY = base.flipY; t.colorSpace = base.colorSpace; t.wrapS = base.wrapS; t.wrapT = base.wrapT; t.repeat.copy(base.repeat); t.offset.copy(base.offset); t.minFilter = base.minFilter; t.magFilter = base.magFilter; t.anisotropy = base.anisotropy; t.channel = base.channel; t.needsUpdate = true; res(t); };
    img.onerror = () => { texShiny.delete(nome); res(null); };   // passe de progresso (19/09): 403 da borda não fica guardado — a próxima ficha tenta de novo
    img.src = `./cenario/mon/shiny/${encodeURIComponent(nome)}_1.png`;
  }));
  return texShiny.get(nome);
}
function aplicarShiny(raiz){
  const pendentes = [];
  raiz.traverse(o => {
    if (!o.isMesh) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])){
      if (!m || m.uniforms || !m.map) continue;
      pendentes.push(texturaShiny(m.map).then(t => { if (t){ m.map = t; m.needsUpdate = true; return true; } return false; }));
    }
  });
  return Promise.all(pendentes).then(r => r.filter(Boolean).length);
}
/* ESPÉCIE NUNCA VISTA (passe de progresso, 19/09): a ficha não baixa o modelo — mostra um "?" nas duas janelas. A borda só entrega
   o GLB de espécie que a conta já viu; baixar aqui (a silhueta de antes) viraria um pedido negado a cada clique na lista. */
let texInterrogacao = null;
function mostrarDesconhecidoDex(v){
  if (!texInterrogacao){
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'); g.fillStyle = 'rgba(11,15,26,0.9)'; g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffd23a'; g.font = 'bold 170px "Segoe UI", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 128, 140);
    texInterrogacao = new THREE.CanvasTexture(c); texInterrogacao.colorSpace = THREE.SRGBColorSpace;
  }
  for (let i = 0; i < 2; i++){
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texInterrogacao, transparent: true, depthWrite: false }));
    sp.scale.setScalar(0.62); sp.position.y = 0.46;
    const grupo = new THREE.Group(); grupo.add(sp); v.cena.add(grupo); v.grupos.push(grupo);
  }
  const r = $('dex-rotulo-shiny'); if (r) r.innerHTML = '✨ Shiny';
}
async function mostrarModeloDex(glb, conhecido){
  const v = visorDex(); limparModeloDex();
  if (!glb) return false;
  if (!conhecido){ mostrarDesconhecidoDex(v); return true; }
  let g = cacheGlb.get(glb);
  if (!g){ g = await new GLTFLoader().loadAsync('./cenario/mon/' + glb + '.glb'); cacheGlb.set(glb, g); if (cacheGlb.size > 8) cacheGlb.delete(cacheGlb.keys().next().value); }
  if (selDexGlb !== glb) return false;
  const montar = shiny => {
    const obj = SkeletonUtils.clone(g.scene);
    obj.traverse(o => { if (o.isMesh){ o.frustumCulled = false; o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone(); } });
    let temShiny = Promise.resolve(0);
    ctx.Personagem?.apagarMalhasOcultas?.(g, obj);   // 17/09: a asa dobrada do Pidgeotto some aqui também (todo clipe a apaga; personagem.mjs)
    if (conhecido){ Fogo.aplicarFogo(obj, glb); Lodo.aplicarLodo(obj, glb); if (shiny) temShiny = aplicarShiny(obj); }
    else obj.traverse(o => { if (o.isMesh){ const m = new THREE.MeshBasicMaterial({ color: 0x0b0f1a }); m.__silhueta = true; o.material = m; } });
    const mixer = new THREE.AnimationMixer(obj);
    const idle = g.animations.find(c => /^idle$/i.test(c.name)) || g.animations[0];
    /* Caixa da pose ANIMADA (precise = aplica o skinning): a caixa de descanso (bind pose) deixa aves
       e flutuantes no ar — o Pidgey "flutuava". Amostra o Idle em 4 instantes e apoia pelo ponto
       mais baixo; centro x/z do primeiro instante. */
    const acao = idle ? mixer.clipAction(idle) : null; if (acao) acao.play();
    const cx = new THREE.Box3(); let minY = Infinity, centro = null, tam = null;
    const dur = idle?.duration || 1;
    for (const k of [0, 0.25, 0.5, 0.75]){
      if (acao){ mixer.setTime(k * dur); } obj.updateMatrixWorld(true);
      const bx = new THREE.Box3().setFromObject(obj, true);
      if (!centro){ centro = bx.getCenter(new THREE.Vector3()); tam = bx.getSize(new THREE.Vector3()); cx.copy(bx); }
      minY = Math.min(minY, bx.min.y);
    }
    if (acao) mixer.setTime(0);
    const esc = 1 / Math.max(tam.y, tam.x * 0.9, tam.z * 0.9, 1e-3);
    const grupo = new THREE.Group(); obj.position.set(-centro.x, -minY, -centro.z); grupo.add(obj); grupo.scale.setScalar(esc);
    v.cena.add(grupo); v.grupos.push(grupo); v.mixers.push(mixer);
    return temShiny;
  };
  montar(false); const temShiny = montar(true);
  v.giro = 0.6;
  temShiny.then(n => { const r = $('dex-rotulo-shiny'); if (r && selDexGlb === glb) r.innerHTML = n ? '✨ Shiny' : '✨ Shiny <small style="color:var(--muted)">(sem textura shiny exportada — igual ao normal)</small>'; });
  return true;
}
/** Fraquezas/resistências pela tabela de tipos do jogo (regras.mjs). */
function fraquezas(tipos){
  const chart = ctx.chart, lista = ctx.tipos || [];
  if (!chart || !tipos?.length) return { fraco: [], resiste: [], imune: [] };
  const r = { fraco: [], resiste: [], imune: [] };
  for (const t of lista){
    const m = ctx.R.efetividade(chart, t, tipos);
    if (m > 1) r.fraco.push([t, m]); else if (m === 0) r.imune.push([t, 0]); else if (m < 1) r.resiste.push([t, m]);
  }
  return r;
}
/** Cadeia de evolução: sobe até a base pela pokédex, depois desce pelos `evo`. */
function cadeiaEvolucao(dex){
  const porNome = new Map([...ctx.porDex.values()].map(s => [s.name, s]));
  let base = ctx.porDex.get(dex), guard = 0;
  while (guard++ < 5){ const pre = [...ctx.porDex.values()].find(s => (s.evo || []).some(e => e.to === base.name)); if (!pre) break; base = pre; }
  const linhas = [];
  const desce = (s, prof) => { linhas.push({ s, prof }); for (const e of s.evo || []){ const alvo = porNome.get(e.to); if (alvo && prof < 3) desce(alvo, prof + 1); } };
  desce(base, 0); return linhas;
}
const chanceCaptura = rate => { const a = Math.max(1, rate) / 3; if (a >= 255) return 1; const b = 1048560 / Math.sqrt(Math.sqrt(16711680 / a)); return Math.pow(b / 65536, 4); };   // HP cheio, Pokébola
function rPokedex(corpo){
  if (!I18n.dexPronto()) I18n.carregarDex().then(() => { if (aberta === 'pokedex') render(); });   // descrições por idioma (etapa 3): baixa só quando a janela abre
  const gens = [[1, 1, 151], [2, 152, 251], [3, 252, 386], [4, 387, 493], [5, 494, 649]];
  const aba = abas(gens.map(([g]) => ({ id: String(g), nome: 'Gen ' + g })));
  const [, a, b] = gens.find(([g]) => String(g) === aba); const d = dexEstado();
  const q = dexBusca.trim().toLowerCase();
  const sp = [...ctx.porDex.values()].filter(s => s.n >= a && s.n <= b).filter(s => !q || String(s.n) === q || (d[s.n] && s.name.toLowerCase().includes(q))).sort((p, r) => p.n - r.n);
  const todos = [...ctx.porDex.values()].filter(s => s.n >= a && s.n <= b);
  const vistos = todos.filter(s => d[s.n]).length, pegos = todos.filter(s => d[s.n] === 'pego').length;
  if (!sp.some(s => s.n === selDex)) selDex = (sp.find(s => d[s.n]) || sp[0])?.n || null;
  corpo.innerHTML = `<div class="dois dex-dois"><div><div class="dex-topo"><input id="dex-busca" placeholder="buscar por nome ou número…" value="${esc(dexBusca)}" autocomplete="off"><span>👁 ${vistos} · ★ ${pegos} / ${todos.length}</span></div>
    ${(() => { const K = ctx.conhecimento; if (!K) return ''; const r = K.resumo(); return `<div class="dex-colec"><b>Colecionador</b> Kanto ${r.pegosKanto}/${r.kantoAte} capturados (${Math.round(r.pegosKanto / r.kantoAte * 100)}%) · ${r.vistosKanto} vistos · ✨ ${r.shinies} shiny · 📖 ${r.mestres} mestre${r.mestres === 1 ? '' : 's'}${r.tituloAtual ? ` · 🏅 ${esc(r.tituloAtual)}` : ''}</div>`; })()}
    <div class="dex-lista">${sp.map(s => `<div class="dex ${d[s.n] === 'pego' ? 'pego' : d[s.n] ? 'visto' : ''} ${s.n === selDex ? 'on' : ''}" data-n="${s.n}"><span class="num">${String(s.n).padStart(3, '0')}</span><span class="nm">${d[s.n] ? esc(s.name) : '?????'}</span><span class="tp">${d[s.n] ? (s.types || []).map(tipoHtml).join('') : ''}</span>${(() => { const n = ctx.conhecimento?.nivel(s.n) ?? (d[s.n] === 'pego' ? 2 : d[s.n] ? 1 : 0); return n ? `<span class="pego-ic" title="conhecimento ${n}/5">${'●'.repeat(n)}${'○'.repeat(5 - n)}</span>` : ''; })()}</div>`).join('') || '<div class="vazio">nada com esse nome nesta geração</div>'}</div></div><div class="ficha dex-ficha" id="dex-ficha"></div></div>`;
  const busca = corpo.querySelector('#dex-busca');
  busca.addEventListener('input', () => { dexBusca = busca.value; const pos = busca.selectionStart; render(); const b2 = $('j-corpo').querySelector('#dex-busca'); b2?.focus(); try { b2?.setSelectionRange(pos, pos); } catch {} });
  corpo.querySelectorAll('.dex').forEach(el => el.onclick = () => { selDex = +el.dataset.n; corpo.querySelectorAll('.dex').forEach(x => x.classList.toggle('on', x === el)); mostrarDex(); });
  mostrarDex();
}
async function mostrarDex(){
  const f = $('dex-ficha'); if (!f || selDex == null) return;
  const d = dexEstado(), S = ctx.porDex.get(selDex), st = d[selDex], conhecido = !!st;
  await Promise.all([carregarElenco(), carregarDexExtra()]);
  const X = dexExtra.especies?.[selDex] || {}, G = dexExtra.golpes || {};
  const glb = glbDe(selDex), v = visorDex(); v.redimensionar(600, 600, 0);   // janela antiga: as duas metades de sempre
  const alt = ctx.alturas?.[selDex] ?? X.a, peso = S?.kg ?? X.p;
  const bs = S?.bs || [], nomes = ['HP', 'Atq', 'Def', 'AtE', 'DfE', 'Vel'];
  const fr = fraquezas(S?.types || []);
  const cadeia = conhecido && S ? cadeiaEvolucao(selDex) : [];
  const golpes = (X.g || []).slice().sort((p, q) => p[0] - q[0]);
  const noMapa = (ctx.jogo.selvagens || []).filter(s => s.dex === selDex && s.estado !== 'morto').length;
  const onde = (() => { const h = ctx.habitats; if (!h) return []; const out = []; for (const [area, lista] of Object.entries(h.areas || {})) if (lista.some(e => e.dex === selDex)) out.push(ctx.nomeArea?.(+area) || ctx.dados?.nomes?.[area] || ('área ' + area)); if ((h.generico || []).some(e => e.dex === selDex)) out.push('grama de qualquer rota'); return out; })();
  const catMap = { 1: 'físico', 2: 'especial', 3: 'status' };
  /* Pokédex de conhecimento: cada nível revela mais (1 tipos/onde · 2 stats, altura/peso, evolução, fraquezas · 3 taxa de
     captura, habilidades · 4 gênero, learnset completo, habilidade oculta · 5 Mestre). Sem o módulo: visto = 1, pego = 2. */
  const K = ctx.conhecimento, rv = K ? K.revela(selDex) : null;
  const nv = rv ? rv.nivel : (st === 'pego' ? 2 : st ? 1 : 0);
  const nomesNivel = ['desconhecido', 'Avistado', 'Registrado', 'Estudado', 'Especialista', 'Mestre'];
  const vistoGolpe = new Set(K?.registro(selDex)?.gl || []);
  const faltaLista = K && nv < 5 ? K.falta(selDex).slice(0, 4) : [];
  const golpesMostrar = nv >= 4 ? golpes : golpes.filter(([, id]) => vistoGolpe.has(id));
  const trava = (n, txt) => `<td class="oculto">🔒 nível ${n} (${nomesNivel[n]})${txt ? ' · ' + txt : ''}</td>`;
  const golpeHtml = ([lv, id]) => { const g = G[id]; return g ? `<div><span class="lv">${lv}</span><b>${esc(g[0])}</b>${tipoHtml(g[1])}<small>${catMap[g[2]] || ''} · poder ${g[3] || '—'} · PP ${g[4] || '—'}</small></div>` : ''; };
  f.innerHTML = `<h3>${nv >= 1 ? esc(S?.name) : '?????'} <small style="color:var(--muted)">Nº ${String(selDex).padStart(3, '0')} · ${st === 'pego' ? 'capturado' : st ? 'visto' : 'desconhecido'}</small></h3>
    <div class="dex-nivel"><span class="pts" title="${rv ? rv.pontos + ' pontos de conhecimento' : ''}">${'●'.repeat(nv)}${'○'.repeat(5 - nv)}</span> <b>${nomesNivel[nv]}</b>${rv && rv.proximo != null ? ` <small>${rv.pontos}/${rv.proximo} pra ${nomesNivel[nv + 1]}</small>` : nv >= 5 ? ' <small>✨ você sabe tudo sobre a espécie</small>' : ''}${faltaLista.length ? `<div class="dex-falta">pra subir: ${faltaLista.map(esc).join(' · ')}</div>` : ''}</div>
    <div class="dex-visor"></div>
    <div class="dex-rotulos"><span>Normal</span><span id="dex-rotulo-shiny">✨ Shiny</span></div>
    <div style="color:var(--muted);font-size:11px;text-align:center">${glb ? 'arraste pra girar os dois' : 'sem modelo 3D exportado ainda'}</div>
    ${nv >= 1 ? `
    <div>${(S?.types || []).map(tipoHtml).join('')}</div>
    ${(I18n.descricaoDex(selDex) || X.d) && nv >= 2 ? `<p class="dex-des">${esc(I18n.descricaoDex(selDex) || X.d)}</p>` : ''}
    <table class="stats dex-tab">
      <tr><td>altura / peso</td>${nv >= 2 ? `<td>${alt ? alt.toFixed(1) + ' m' : '—'} · ${peso ? peso + ' kg' : '—'}</td>` : trava(2, 'capture um')}</tr>
      ${X.h?.length ? `<tr><td>habilidades</td>${nv >= 3 ? `<td>${X.h.map(esc).join(', ')}${X.ho ? (nv >= 4 ? ` <small style="color:var(--muted)">(oculta: ${esc(X.ho)})</small>` : ' <small class="oculto">(oculta: 🔒 nível 4)</small>') : ''}</td>` : trava(3)}</tr>` : ''}
      ${X.m != null ? `<tr><td>gênero</td>${nv >= 4 ? `<td>${X.m < 0 ? 'sem gênero' : `♂ ${X.m}% · ♀ ${X.f}%`}</td>` : trava(4)}</tr>` : ''}
      <tr><td>taxa de captura</td>${nv >= 3 ? `<td>${S?.rate ?? X.c ?? '—'} · ${(chanceCaptura(S?.rate ?? X.c ?? 45) * 100).toFixed(1)}% com HP cheio e Pokébola (desmaiado: ${(chanceCaptura((S?.rate ?? 45) * 3) * 100).toFixed(0)}%)</td>` : trava(3, 'enfrente e capture mais')}</tr>
      <tr><td>onde encontrar</td><td>${onde.length ? onde.map(esc).join(', ') : 'não aparece no mato (só troca/evento)'}${noMapa ? ` · <b>${noMapa} neste mapa agora</b>` : ''}</td></tr>
    </table>
    ${nv >= 2 ? `<div class="dex-stats">${bs.map((b, i) => `<span><small>${nomes[i]}</small>${b}</span>`).join('')}<span><small>total</small>${S?.bst || bs.reduce((x, y) => x + y, 0)}</span></div>
    <div class="dex-secao">evolução</div><div class="dex-cadeia">${cadeia.map(({ s, prof }) => `<span class="${s.n === selDex ? 'on' : ''}" data-n="${s.n}" style="margin-left:${prof * 14}px">${prof ? '▸ ' : ''}${esc(s.name)}${(() => { const pre = cadeia.find(c => (c.s.evo || []).some(e => e.to === s.name)); const e = pre?.s.evo.find(e => e.to === s.name); return e ? ` <small>${e.lvl ? 'Nv. ' + e.lvl : ''}${e.cond ? ' ' + esc(e.cond) : ''}</small>` : ''; })()}</span>`).join('')}</div>
    <div class="dex-secao">fraco contra ${fr.fraco.length}</div><div>${fr.fraco.map(([t, m]) => `<span class="tipo" style="background:${ctx.R.COR_TIPO?.[t] || '#556'}">${t} ×${m}</span>`).join('') || '—'}</div>
    <div class="dex-secao">resiste a ${fr.resiste.length + fr.imune.length}</div><div>${[...fr.resiste, ...fr.imune].map(([t, m]) => `<span class="tipo" style="background:${ctx.R.COR_TIPO?.[t] || '#556'}">${t} ×${m === 0 ? '0' : m === 0.25 ? '¼' : '½'}</span>`).join('') || '—'}</div>` : '<div class="dex-secao oculto">🔒 stats, evolução e fraquezas abrem no nível 2 (Registrado): capture um</div>'}
    ${golpes.length ? (golpesMostrar.length ? `<div class="dex-secao">golpes por nível${nv < 4 ? ` <small>(${golpesMostrar.length}/${golpes.length} vistos · o learnset completo abre no nível 4)</small>` : ''}</div><div class="dex-golpes">${golpesMostrar.map(golpeHtml).join('')}</div>` : `<div class="dex-secao oculto">🔒 golpes: veja a espécie usar golpes em batalha (${golpes.length} no learnset; completo no nível 4)</div>`) : ''}`
    : '<div style="color:var(--muted);font-size:12px;margin-top:8px">Encontre este Pokémon pra abrir a ficha.</div>'}`;
  f.querySelector('.dex-visor').appendChild(v.canvas);
  f.querySelectorAll('.dex-cadeia [data-n]').forEach(e => e.onclick = () => { selDex = +e.dataset.n; render(); });
  selDexGlb = glb;
  if (!v.ativo){ v.ativo = true; v.t0 = 0; requestAnimationFrame(v.quadro); }
  try { await mostrarModeloDex(glb, nv >= 1); } catch (e){ console.warn('pokédex 3D:', e); }
}
function pararDex(){ if (dexView){ dexView.ativo = false; } }
window.__dex = { get view(){ return dexView; }, mostrar: mostrarDex };

/* ------------------------------------------------------------------ Treinador */
function rTreinador(corpo){
  abas([{ id: 'ficha', nome: 'Ficha' }]);
  const t = ctx.lerLS('tempo', 0), h = Math.floor(t / 3600), mi = Math.floor((t % 3600) / 60);
  const d = dexEstado(); const pegos = Object.values(d).filter(v => v === 'pego').length, vistos = Object.keys(d).length;
  const ins = (D.insignias || []).filter(b => b.gen === 1); const tem = new Set(ctx.lerLS('insignias', []));
  corpo.innerHTML = `<div class="dois"><div class="ficha"><h3>${esc(ctx.nome || 'Ash')}</h3><table class="stats"><tr><td>dinheiro</td><td>${dinheiro().toLocaleString('pt-BR')} ${esc(D.moedas?.[1] || '')}</td></tr><tr><td>tempo de jogo</td><td>${h}h ${String(mi).padStart(2, '0')}m</td></tr><tr><td>time</td><td>${timeAtual().length}/6 · caixa ${ctx.lerLS('caixa', []).length}</td></tr><tr><td>pokédex</td><td>${vistos} vistos · ${pegos} capturados</td></tr><tr><td>insígnias</td><td>${tem.size}/8</td></tr><tr><td>personagem</td><td>${esc(ctx.personagemNome?.() || 'Ash')}</td></tr><tr><td>inicial</td><td>${esc(ctx.lerLS('inicial', null)?.nome || '—')}</td></tr></table></div>
    <div class="ficha"><h3>Insígnias de Kanto</h3><div class="insignias">${ins.map(b => `<div class="insignia ${tem.has(b.id) ? 'tem' : ''}" title="${esc(b.n)}">${esc(b.n.replace(/^medalha /i, ''))}</div>`).join('')}</div><div style="margin-top:6px;font-size:12px">Obedecem até <b style="color:#ffe07a">Lv ${tetoObed()}</b> <small style="color:var(--muted)">· acima disso ignoram ordens às vezes; cada insígnia sobe o teto em 10</small></div><small style="color:var(--muted)">os 8 ginásios entram com as batalhas contra treinadores</small></div></div>`;
  if (ctx.conhecimento){                                               // Pokédex de conhecimento: placar do colecionador e títulos
    const r = ctx.conhecimento.resumo(), ts = ctx.conhecimento.listaTitulos();
    corpo.insertAdjacentHTML('beforeend', `<div class="ficha" style="margin-top:8px"><h3>Colecionador${r.tituloAtual ? ` <small style="color:var(--gold,#f4aa35)">🏅 ${esc(r.tituloAtual)}</small>` : ''}</h3>
      <table class="stats"><tr><td>Kanto</td><td>${r.pegosKanto}/${r.kantoAte} capturados (${Math.round(r.pegosKanto / r.kantoAte * 100)}%) · ${r.vistosKanto} vistos</td></tr>
      <tr><td>nacional</td><td>${r.pegos} capturados · ${r.vistos} vistos</td></tr>
      <tr><td>shinies capturados</td><td>✨ ${r.shinies}</td></tr>
      <tr><td>conhecimento</td><td>${r.mestres} espécie${r.mestres === 1 ? '' : 's'} em Mestre · ${r.estudadas} em Estudado+ · ${r.pontosTotal} pontos</td></tr></table>
      <div class="titulos">${ts.map(x => `<div class="titulo ${x.tem ? 'tem' : ''}" title="${esc(x.desc)}">${x.tem ? '🏅' : '○'} ${esc(x.nome)} <small>${esc(x.desc)}</small></div>`).join('')}</div>
      <div style="color:var(--muted);font-size:11px;margin-top:6px">ranking entre jogadores chega com o servidor; a chance de shiny é igual pra todos (1/4.096), sem exceção.</div></div>`);
  }
}

/* ------------------------------------------------------------------ Loja */
function rLoja(corpo){
  const lojas = D.lojas || {};
  const nomeLoja = id => { if (id === '2150101') return 'Pokémart'; const m = String(id).match(/^215(\d\d)01$/); const nm = m && ctx.nomeArea?.(+('15' + m[1])); return nm ? nm.replace(/^Loja (de )?da Cidade /, '').replace(/^Loja da Cidade /, '') : 'Loja ' + String(id).slice(-4); };
  const aba = (abaAtual && lojas[abaAtual]) ? abaAtual : '2150101';   // SÓ a loja deste vendedor: as abas "Loja 1107/1501/4103/4401" (outras lojas do dump) não fazem sentido no Pokémart (Jaime, 31/08)
  abas([{ id: aba, nome: nomeLoja(aba) }]);                              // uma aba só, com o nome da loja (e limpa abas da janela anterior)
  const lista = lojas[aba] || [];
  corpo.innerHTML = `<div style="margin-bottom:8px;color:var(--muted);font-size:12px">💰 ${dinheiro().toLocaleString('pt-BR')} ${esc(D.moedas?.[1] || 'Moeda')} · preços do jogo original</div><div class="grade-itens">${lista.map(l => { const it = D.itens[l.item]; if (!it) return ''; return `<div class="item q${it.q || 1}"><i class="ic-item" style="${iconeItem(it)}"></i><span class="n">${l.preco.toLocaleString('pt-BR')}</span><b>${esc(it.n)}${l.n > 1 ? ' ×' + l.n : ''}</b><small>${esc(it.d || D.tipos[it.t] || '')}</small><div class="acoes"><button type="button" class="btn ouro" data-comprar="${l.item}" data-preco="${l.preco}" data-n="${l.n}" ${dinheiro() < l.preco ? 'disabled' : ''}>Comprar</button></div></div>`; }).join('')}</div>`;
  corpo.querySelectorAll('[data-comprar]').forEach(b => b.onclick = () => { const id = b.dataset.comprar, preco = +b.dataset.preco, n = +b.dataset.n || 1; if (dinheiro() < preco) return; if (ctx.comConta?.()) ctx.bolsaOp('comprar', { loja: aba, item: +id }).then(() => render()); else if (D.itens[id]?.t === 7){ ctx.jogo.bolas[id] = (ctx.jogo.bolas[id] || 0) + n; ctx.gravarLS('bolas', ctx.jogo.bolas); } else { const it = itensLS(); it[id] = (it[id] || 0) + n; ctx.gravarLS('itens', it); } if (!ctx.comConta?.()){ setDinheiro(dinheiro() - preco); ctx.Som?.tocar?.('ui/sound_itemget', { volume: .7, prio: true }); } render(); });
}

/* ------------------------------------------------------------------ Loja Premium (GDD §7.5)
   Doação com recompensa (Medalhão de Membro trocável, cosméticos). Sem servidor não existe compra —
   e o Jaime pediu pra NÃO listar o que vai ter: só "em breve". O Pokémart (itens) é a janela 'mercado'. */
function rPremium(corpo){
  corpo.innerHTML = '<div class="vazio">Loja premium — em breve, junto com o servidor online.</div>';
}

/* ------------------------------------------------------------------ Social / Batalha */
function rSocial(corpo){
  const aba = abas([{ id: 'chat', nome: 'Chat' }, { id: 'amigos', nome: 'Amigos' }, { id: 'correio', nome: 'Correio' }]);
  if (aba === 'chat'){
    corpo.innerHTML = '<div class="chat-janela"></div><div style="color:var(--muted);font-size:11px;margin-top:6px">o mesmo chat da HUD, em tela cheia: Local mostra tudo com etiqueta [G] [T] [H] [S]; /g /t /h /l mudam o canal</div>';
    Chat.montar(corpo.querySelector('.chat-janela'), { compacto: false });
  } else if (aba === 'amigos') corpo.innerHTML = '<div class="vazio">Lista de amigos vazia. Adicionar, convidar pra batalha e presentear entram com o servidor.</div>';
  else corpo.innerHTML = '<div class="lista"><div class="linha" style="cursor:default"><span style="font-size:18px">✉️</span><span class="nome"><b>Bem-vindo a Kanto</b><small>Sistema · sua jornada começa em Pallet. Anexo: 5 Pokébolas (já na mochila).</small></span></div></div>';
}
function rBatalha(corpo){
  const aba = abas([{ id: 'trein', nome: 'Treinadores' }, { id: 'pvp', nome: 'PvP' }, { id: 'rank', nome: 'Ranking' }]);
  if (aba === 'trein'){ const n = new Set((ctx.dados.treinadores || []).map(t => String(t.cfg))).size, venc = new Set([].concat(ctx.lerLS('treinadoresVencidos', []) || []).map(k => String(k).split('@')[0])).size; /* 17/09: por treinador (cfg), não por vaga — o mapa tem 1.984 vagas pra 166 treinadores e as contas do bug das vagas (genandrade) têm o mesmo treinador 2–4 vezes na lista */ corpo.innerHTML = `<div class="vazio">${n} treinadores marcados neste mapa · <b>${venc}</b> vencidos.<br>Procure os nomes <b style="color:#ffb1b1">⚔</b> pelas rotas e fale (Z) pra desafiar — batalha por turnos; ginásios e insígnias vêm depois.</div>`; }
  else corpo.innerHTML = '<div class="vazio">Precisa de servidor. A janela já existe pra você posicionar.</div>';
}

/* ------------------------------------------------------------------ Atalhos 5–8 (seletor) */
let slotAtalho = 0;
/** Abre o seletor pro atalho i (peça #atalhos da HUD: clique no vazio, botão direito ou toque longo). */
/** Repinta a janela aberta (o index chama quando o servidor manda dinheiro/itens novos). */
export function repintar(){ try { if (aberta) render(); } catch {} }
export function abrirAtalho(i){ slotAtalho = i; abaAtual = null; return abrir('atalho'); }
function rAtalho(corpo){
  const tecla = (ctx.teclasAtalho || ['5', '6', '7', '8'])[slotAtalho] || '?', atual = (ctx.atalhos?.() || [])[slotAtalho];
  $('j-titulo').innerHTML = `<i class="ic ic-mochila" style="display:inline-block;width:26px;height:26px;vertical-align:middle;margin-right:6px"></i>Atalho ${tecla}`;
  const aba = abas([{ id: 'itens', nome: 'Itens' }, { id: 'montarias', nome: 'Montarias' }]);
  const cab = `<div style="margin-bottom:8px;color:var(--muted);font-size:12px">tecla <b style="color:#ffe07a">${tecla}</b> ou toque no slot usa; ${atual ? 'hoje: <b>' + esc(atual.nome) + '</b>' : 'slot vazio'}</div>`;
  const prender = (b) => { ctx.definirAtalho?.(slotAtalho, b); fechar(); };
  if (aba === 'itens'){
    const q = quantidades(); const lista = Object.entries(q).filter(([id, n]) => n > 0 && [7, 9].includes(D.itens[id]?.t));
    corpo.innerHTML = cab + (lista.length ? `<div class="grade-itens">${lista.map(([id, n]) => { const it = D.itens[id]; return `<div class="item q${it.q || 1}"><i class="ic-item" style="${iconeItem(it)}"></i><span class="n">×${n}</span><b>${esc(it.n)}</b><small>${esc(D.tipos[it.t] || '')}</small><div class="acoes"><button type="button" class="btn ouro" data-item="${id}">Prender no ${tecla}</button></div></div>`; }).join('')}</div>` : '<div class="vazio">Nada pra prender: poções e bolas ficam aqui quando estiverem na mochila (Loja).</div>');
    corpo.querySelectorAll('[data-item]').forEach(b => b.onclick = () => { const it = D.itens[b.dataset.item]; prender({ tipo: 'item', id: +b.dataset.item, nome: it.n, icone: './ui/itens/' + it.i + '.png', bola: it.t === 7 }); });
  } else {
    const lista = ctx.montarias?.() || [];
    corpo.innerHTML = cab + `<div class="grade-itens">${lista.map(m => { const dex = ctx.dexDoGlb(m.glb); return `<div class="item"><i class="ic-item" style="background-image:url('./ui/mon/pm${String(dex).padStart(4, '0')}.png')"></i><b>${esc(m.nome)}</b><small>${m.voa ? 'voadora · passa por cima de tudo' : 'terrestre'}</small><div class="acoes"><button type="button" class="btn ouro" data-monta="${m.glb}">Prender no ${tecla}</button></div></div>`; }).join('')}</div>`;
    corpo.querySelectorAll('[data-monta]').forEach(b => b.onclick = () => { const m = lista.find(x => x.glb === b.dataset.monta); const dex = ctx.dexDoGlb(m.glb); prender({ tipo: 'montaria', glb: m.glb, nome: m.nome, icone: './ui/mon/pm' + String(dex).padStart(4, '0') + '.png' }); });
  }
  if (atual) corpo.insertAdjacentHTML('beforeend', '<div class="acoes" style="margin-top:12px"><button type="button" class="btn" id="a-limpar">Esvaziar o atalho</button></div>'), corpo.querySelector('#a-limpar').onclick = () => prender(null);
}

/* ===================================================== RAID AO VIVO (banner da Amanda, rodada 26 — 14/09)
   O banner é um pop-up como os outros (Esc fecha, o jogador não anda, um pop-up por vez), mas quem sabe da raid é o
   `raid_ui.mjs`: ele se liga aqui com `ligarRaid({ encher, acao, simples, mudou, def })` e recebe de volta como abrir,
   repintar e fechar. Sem maquete (celular em pé, `?popup=0`, layout sem `raid`) cai na janela antiga com o `simples`. */
let popRd = null, raidApi = null, raidEraAberta = false;
export function ligarRaid(api){
  raidApi = api || null;
  return { aberto: () => aberta === 'raid', repintar: () => { if (aberta === 'raid') render(); }, fechar: () => { if (aberta === 'raid') fechar(); } };
}
/** Avisa o raid_ui quando o banner abre ou fecha (a placa da fila só aparece com o banner fechado). */
function avisarRaid(){
  const agora = aberta === 'raid';
  if (agora === raidEraAberta) return;
  raidEraAberta = agora;
  try { raidApi?.mudou?.(agora); } catch (e){ console.warn('raid:', e); }
}
function popupRd(){
  if (popRd) return popRd;
  if (new URLSearchParams(location.search).get('popup') === '0') return null;
  const def = defPopup('raid') || (ctx.MOBILE && Hud.presetAtual() !== 'celular_deitado' ? null : raidApi?.def?.());   // layout salvo antigo sem a raid: o raid_ui traz a do arquivo
  if (!def) return null;
  popRd = Popup.montar(def, {
    acao: nome => { if (nome === 'entrar-fila' || nome === 'sair-fila'){ try { raidApi?.acao?.(nome); } catch (e){ console.warn('raid:', e); } } },
    fechar: () => { if (aberta === 'raid') aberta = null; avisarRaid(); },
  });
  return popRd;
}
function encherRaid(pop){ try { raidApi?.encher?.(pop); } catch (e){ console.warn('raid:', e); } }
function rRaid(corpo){
  try { if (raidApi?.simples?.(corpo)) return; } catch (e){ console.warn('raid:', e); }
  corpo.innerHTML = '<div class="vazio">' + esc(tr('Nenhuma raid anunciada agora.')) + '</div>';
}

/* ------------------------------------------------------------------ Configurações */
let confirmarApagar = false;
/* ===================================================== CONFIGURAÇÕES (pop-up do Figma, rodada 24 — 10/09)
   Substitui a tela antiga (`rConfig`, logo abaixo), que fica de reserva pro `?popup=0` e pro celular em pé.
   Cinco abas: Geral no frame, e Som/Controles/Social/Conta em blocos-referência fora dele (o caminho do Social).
   O que o jogo NÃO faz ainda entra APAGADO com a dica no `title` — controle que não faz nada engana o jogador. */
let popCf = null, abaCf = 'geral';

/* Deslizante de PARADAS: a maquete desenhou porcentagem, mas no jogo isto é lista fechada — o deslizante anda de parada
   em parada e mostra o NOME da opção. (Tamanho dos Pokémon e densidade de selvagens também vieram na maquete como
   deslizantes, mas são coisa de ADM, não do jogador — Jaime, 11/09: ficam escondidos, ver `encherConfig`.) */
const PARADAS = {
  'tamanho-interface':   { ops: ['pequena', 'normal', 'grande'],    rot: ['Menor', 'Normal', 'Maior'] },   // a caixa do `txt/valor` é `max:5` (feita pra "60%"): "Pequena" não cabia e o P sumia atrás do trilho (Jaime, 11/09)
};
/* ADM, não jogador (Jaime, 11/09): as duas linhas da maquete que o jogo esconde. O bastidor continua com o `tam-modo` do
   painel de diagnóstico (?dev=1) e com `?tamanhos=` / `?densidade=` na URL. Pedido pra Amanda tirá-las na rodada 25. */
const CF_ADM = ['ajuste-tamanho-pokemon', 'ajuste-densidade-selvagens'];
const QUALIDADES = { ops: ['baixa', 'alta'], rot: ['Baixa', 'Alta'] };
/* Os volumes são CONTÍNUOS de verdade (0 a 100%), ao contrário das paradas acima. `canal` é o campo do `Som.ajustar`. */
const CF_VOLUMES = { 'vol-musica': 'mus', 'vol-efeitos': 'sfx', 'vol-interface': 'ui' };
/* Chaves liga/desliga que o jogo cumpre. As outras estão no CF_FALTA. */
const CF_TOGGLES = {
  'mudo':               { ler: () => !!Som.estado().mudo,  por: v => Som.ajustar({ mudo: v }) },
  'som-segundo-plano':  { ler: () => !!Som.estado().fundo, por: v => Som.ajustar({ fundo: v }) },
};
/* As teclas DE VERDADE, pra aba Controles. `correr` não existe: quem corre é a montaria. */
const CF_TECLAS = {
  mover: 'W A S D', correr: '—', interagir: 'Z', mochila: 'I', mapa: 'K', chat: 'Enter', atalhos: '1–4 · 5–9',
};
const CF_DICA_TECLA = {
  correr: 'o jogo não tem correr: quem anda rápido é a montaria (M)',
  interagir: 'Z fala com o NPC perto e interage com o parceiro (Shift+Z troca de Pokémon)',
  atalhos: '1 a 4 são os golpes, 5 a 9 os itens e montarias, F joga a bola',
};
const paradaDe = (id, valor) => { const P = PARADAS[id]; const i = P.ops.indexOf(String(valor ?? '')); return i < 0 ? Math.floor(P.ops.length / 2) : i; };
const kDaParada = (id, i) => { const n = PARADAS[id].ops.length; return n > 1 ? i / (n - 1) : 0; };
const paradaDoK = (id, k) => { const n = PARADAS[id].ops.length; return Math.max(0, Math.min(n - 1, Math.round(k * (n - 1)))); };

/* O que ainda não existe no jogo. Fica APAGADO e a dica diz por quê — e some daqui assim que a opção nascer de verdade. */
const CF_FALTA = {
  'nomes-jogadores': 'em breve', 'dano-flutuante': 'em breve', 'ocultar-lotado': 'em breve',
  'confirmar-importante': 'em breve', 'reduzir-animacoes': 'em breve', 'daltonismo': 'em breve',
  /* Controles: remapear tecla ainda não existe, e o joystick do celular não é ajustável. */
  'remapear-mover': 'trocar a tecla ainda não dá', 'remapear-correr': 'trocar a tecla ainda não dá',
  'remapear-interagir': 'trocar a tecla ainda não dá', 'remapear-mochila': 'trocar a tecla ainda não dá',
  'remapear-mapa': 'trocar a tecla ainda não dá', 'remapear-chat': 'trocar a tecla ainda não dá',
  'remapear-atalhos': 'trocar a tecla ainda não dá',
  'lado-joystick': 'em breve', 'tamanho-joystick': 'em breve', 'tamanho-botoes': 'em breve', 'vibracao': 'em breve',   // rodada 25: coluna Celular
  /* Social: privacidade precisa do servidor. */
  'quem-mensagem': 'precisa do servidor — em breve', 'quem-convida': 'precisa do servidor — em breve',
  'status-online': 'precisa do servidor — em breve', 'fonte-chat': 'o chat já se redimensiona pelo canto ◢',
  'filtro-chat': 'em breve — hoje quem cuida é a moderação (/aviso, /mudo)',
};
function popupCf(){
  if (popCf) return popCf;
  const def = defPopup('config'); if (new URLSearchParams(location.search).get('popup') === '0' || !def) return null;
  popCf = Popup.montar(def, {
    aba: a => { abaCf = a; render(); },
    acao: (nome, el) => cfAcao(nome, el),
    abre: nome => { if (nome === 'dialogo-apagar'){ cfAbrirApagar(); return true; } return false; },
    digita: () => cfConferirNome(),
    fechar: () => { if (aberta === 'config') aberta = null; Popup.mostrarExtra(popCf, 'dialogo-apagar', false); },
  });
  Popup.ligarAjustes(popCf, {
    mover: (id, k) => cfDeslizar(id, k, false),
    soltar: (id, k) => cfDeslizar(id, k, true),
  });
  return popCf;
}
/** Arrastou um deslizante: `fim` diz se o dedo levantou (só então vale mexer no jogo, que às vezes recarrega). */
function cfDeslizar(id, k, fim){
  if (CF_VOLUMES[id]){                                                     // volume é contínuo: desenha e aplica na hora
    k = Math.max(0, Math.min(1, k));
    Popup.ajuste(popCf, 'ajuste-' + id, k, Math.round(k * 100) + '%');
    Som.ajustar({ [CF_VOLUMES[id]]: k });
    if (fim) Som.tocar('ui/sound_click', { volume: 0.6, prio: true });     // dá pra OUVIR onde ficou
    return;
  }
  const P = PARADAS[id]; if (!P) return;
  const i = paradaDoK(id, k);
  Popup.ajuste(popCf, 'ajuste-' + id, kDaParada(id, i), P.rot[i]);
  if (!fim) return;
  if (id === 'tamanho-interface') Hud.definirTamanho?.(P.ops[i]);
}
function cfRecarregar(chave, valor){
  const u = new URL(location.href);
  if (valor) u.searchParams.set(chave, valor); else u.searchParams.delete(chave);
  try { sessionStorage.setItem('porta.ok', '1'); } catch {}                // é navegação do jogo: o `mapa` da URL sobrevive
  try { window.__telaCheia?.lembrar(); } catch {}                         // troca de idioma etc.: a tela cheia volta no 1º toque depois da recarga (17/09)
  location.href = u.toString();
}
function cfAcao(nome, el){
  /* SELETOR SEM SETAS (v2, rodada 27+): a maquete nova não tem `seta-esq`/`seta-dir` — o grupo `seletor-<id>` inteiro leva [acao:<id>] e o
     clique caía aqui sem ninguém tratar (Qualidade gráfica não mudava; teste da Amanda no site, 18/09). Clique no grupo = próxima opção;
     as setas do layout antigo (anterior/proximo) continuam valendo. */
  const seletor = el?.dataset?.fig === 'seletor-' + nome;
  if (nome === 'anterior' || nome === 'proximo' || seletor){
    const id = seletor ? nome : Popup.seletorDe(el); if (!id) return;
    if (id === 'qualidade'){
      const p = new URLSearchParams(location.search);
      const i = Math.max(0, QUALIDADES.ops.indexOf(p.get('qualidade') || (ctx.qualidade || 'alta')));
      const j = (i + (nome === 'anterior' ? QUALIDADES.ops.length - 1 : 1)) % QUALIDADES.ops.length;
      cfRecarregar('qualidade', QUALIDADES.ops[j]);
    }
    return;
  }
  if (PARADAS[nome]){                                                      // clicou no meio do deslizante: anda uma parada
    const g = popCf.querySelector('[data-fig="ajuste-' + nome + '"]');
    const i = Math.min(PARADAS[nome].ops.length - 1, paradaDoK(nome, Popup.ajusteDe(g)) + 1);
    cfDeslizar(nome, kDaParada(nome, i), true);
    return;
  }
  if (CF_VOLUMES[nome]){                                                   // clicou no meio do trilho de volume
    const g = popCf.querySelector('[data-fig="ajuste-' + nome + '"]');
    cfDeslizar(nome, Popup.ajusteDe(g), true);
    return;
  }
  if (CF_TOGGLES[nome]){                                                   // chave liga/desliga de verdade
    const T = CF_TOGGLES[nome];
    T.por(!T.ler());
    render();
    return;
  }
  if (nome === 'resetar-painel-missao'){ Hud.zerarMover(); return; }
  if (nome === 'resetar-paineis'){ Hud.zerarMover(); Chat.sistema('Painéis de volta ao lugar padrão.'); return; }
  /* ---- aba Conta */
  if (nome === 'logout'){ Popup.botao(popCf, 'logout', false, 'Saindo…'); ctx.conta?.sair?.(); return; }
  if (nome === 'trocar-senha'){ cfDialogoSenha(); return; }
  if (nome === 'copiar-diagnostico'){ cfCopiarDiag(); return; }
  if (nome === 'diagnostico-chat'){ cfDialogoRelato(); return; }         // RELATOS (11/09): manda pro servidor (e pro #relatos do Discord)
  if (nome === 'apagar-progresso'){ cfApagarProgresso(); return; }
  if (CF_FALTA[nome]) return;                                              // apagado: não faz nada mesmo
}
/** Diagnóstico do aparelho em texto, o mesmo que a tela antiga mostrava. */
const cfDiagTexto = () => { const d = ctx.diagnostico?.(); return d ? Object.entries(d).map(([k, v]) => k + ': ' + (Array.isArray(v) ? '\n  ' + v.join('\n  ') : v)).join('\n') : 'indisponível'; };
async function cfCopiarDiag(){
  const tx = cfDiagTexto();
  try { await navigator.clipboard.writeText(tx); Popup.botao(popCf, 'copiar-diagnostico', true, 'Copiado!'); setTimeout(() => Popup.botao(popCf, 'copiar-diagnostico', true, 'Copiar'), 2000); }
  catch { Chat.sistema('Não deu pra copiar sozinho — o texto está aí na caixa, dá pra selecionar.'); }
}
/** Apagar progresso: com conta, é o personagem que some (a conta fica); sem conta, é o `apagarTudo` de sempre. */
async function cfApagarProgresso(){
  Popup.mostrarExtra(popCf, 'dialogo-apagar', false);
  if (ctx.conta?.estado?.().modo === 'conta'){
    const r = await ctx.conta.apagarPersonagem();
    if (r && !r.ok){ Chat.sistema('Não deu pra apagar: ' + r.erro); return; }
    location.reload();
    return;
  }
  apagarTudo();
}
/* Põe o bloco da aba NA ÁREA DE CONTEÚDO, embaixo das abas. O `mostrarExtra` centraliza no pop-up inteiro, e como os
   blocos de Conta (737) e Controles (689) são MAIS ALTOS que a área (562), eles subiam por cima dos botões de aba e não
   dava mais pra trocar de aba sem fechar tudo (Jaime, 10/09). Aqui eles encostam no topo da área e são AJUSTADOS pra
   ocupá-la: os altos encolhem (0,76× e 0,82×) e os baixos CRESCEM (Som e Social vêm com 45–56% da largura da área, e
   flutuando pequenos no meio do painel faziam a janela parecer grande demais — Jaime, 11/09). O bloco tem moldura
   própria, então mudar de escala não quebra o desenho. Anotado no relatório dela. */
/* Rodada 25 (11/09): os blocos `conteudo-<aba>` têm o MESMO tamanho da vista `conteudo-geral` — a aba É a tela inteira do
   painel. Renderiza 1:1 no lugar da vista (mesma caixa), sem escala e sem centralizar; painel, título, abas e X ficam parados.
   (Na rodada 24 cada bloco vinha de um tamanho e a gente ajustava proporcionalmente; saiu.) */
function cfMostrarAba(pop, chave, mostrar){
  const d = Popup.extra(pop, chave); if (!d) return;
  d.style.transform = '';
  if (!mostrar){ Popup.mostrarExtra(pop, chave, false); return; }
  const area = pop.querySelector('[data-fig="conteudo-geral"]');           // a caixa da vista Geral: o bloco entra exatamente nela
  const ax = parseFloat(area?.style.left) || 0, ay = parseFloat(area?.style.top) || 0;
  Popup.mostrarExtra(pop, chave, true, { x: ax, y: ay });
  d.style.pointerEvents = 'auto';
}
/* RELATO DE PROBLEMA (11/09): "Mandar pra equipe" na aba Conta. Caixinha com o que aconteceu; vai junto o diagnóstico do aparelho
   e o contexto (mapa, área, posição, versão, FPS, ping, memória, idioma, erros) pra POST /conta/relato — disco + Discord #relatos.
   Sem conta, copia tudo pra área de transferência. Diálogo em DOM (paleta da Amanda); pedido de arte anotado no figma-desvios.md. */
function cfDialogoRelato(){
  if (!popCf || document.querySelector('.cf-relato')) return;
  const comConta = ctx.conta?.estado?.().modo === 'conta';
  const d = document.createElement('div'); d.className = 'cf-relato';
  Object.assign(d.style, { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(480px, 92%)',
    background: '#0F1A2E', border: '2px solid #F8C237', borderRadius: '16px', padding: '18px', zIndex: '600',
    font: '700 13px "Nunito Sans", system-ui, sans-serif', color: '#B8C2D9', display: 'grid', gap: '8px' });
  d.innerHTML = '<div style="font:800 18px \'Baloo 2\', system-ui;color:#F8C237;text-align:center">Mandar pra equipe</div>'
    + '<div style="text-align:center">Conte o que aconteceu. O diagnóstico do aparelho vai junto.</div>'
    + '<textarea rows="4" maxlength="1000" placeholder="o que aconteceu?"></textarea>'
    + '<div class="cf-relato-av" style="min-height:16px;color:#f58e8e;text-align:center"></div>'
    + '<div style="display:flex;gap:10px"><button type="button" class="ok" style="flex:1">Enviar</button>'
    + '<button type="button" class="nao" style="flex:1">Cancelar</button></div>';
  const ta = d.querySelector('textarea');
  Object.assign(ta.style, { background: '#0B1220', border: '1px solid rgba(248,194,55,.4)', borderRadius: '8px', padding: '8px 10px', color: '#fff', font: 'inherit', resize: 'vertical' });
  for (const b of d.querySelectorAll('button'))
    Object.assign(b.style, { background: '#13254A', border: '1px solid #F8C237', borderRadius: '10px', padding: '9px', color: '#F8C237', font: 'inherit', cursor: 'pointer' });
  d.innerHTML = tHtml(d.innerHTML); d.querySelector('textarea').placeholder = tr('o que aconteceu?');   // idioma
  document.body.appendChild(d); DIALOGOS.add(d);
  const area = d.querySelector('textarea'), av = d.querySelector('.cf-relato-av');
  area.addEventListener('keydown', e => e.stopPropagation());               // as teclas do jogo (I, K, M…) não podem agir enquanto escreve
  setTimeout(() => area.focus(), 50);
  d.querySelector('.nao').onclick = () => d.remove();
  d.querySelector('.ok').onclick = async () => {
    const texto = area.value.trim(); if (!texto){ av.textContent = tr('Conte o que aconteceu antes de mandar.'); return; }
    const diag = ctx.diagnostico?.() || {}, contexto = ctx.contexto?.() || {};
    if (!comConta){
      const tx = texto + '\n\n' + Object.entries({ ...contexto, ...diag }).map(([k, v]) => k + ': ' + (Array.isArray(v) ? v.join(' | ') : v)).join('\n');
      try { await navigator.clipboard.writeText(tx); } catch {}
      d.remove(); Chat.sistema('Você está jogando sem conta: o relato foi copiado — cole no Discord da equipe.'); return;
    }
    av.style.color = '#B8C2D9'; av.textContent = tr('enviando…');
    const r = await ctx.conta.chamar('POST', '/conta/relato', { texto, diag, contexto });
    if (!r.ok){ av.style.color = '#f58e8e'; av.textContent = tr(r.erro || 'não foi'); return; }
    d.remove(); Chat.sistema('Relato enviado pra equipe. Obrigado!');
  };
}
/* ESTOU PRESO (15/09, alfa): quem travou em parede/escada/caverna ESCREVE o relato antes (≥ 50 caracteres, ≥ 5 palavras, sem enchimento —
   as MESMAS regras do `textoPresoRuim` do servidor/relatos.mjs, que confere de novo) e só com o ok do servidor é levado pro último Centro
   Pokémon (ou o laboratório do Oak), SEM curar o time. Vai pro POST /conta/relato com `preso: true` e o contexto estendido (posição com
   1 casa, chegada, montaria, nadando, destino…) — disco + #relatos. O servidor segura 10 min entre usos (429) e recusa em batalha por
   turno e na luta da raid. Abre pelo botão da aba Conta das Configurações e pelo /preso do chat. Diálogo em DOM, estilo do "Mandar pra equipe". */
export const PRESO = { minimo: 50, palavras: 5, repeticao: 7, diferentes: 12 };
/** Por que o texto ainda não serve ('curto' | 'palavras' | 'enchimento') ou null — espelho do `textoPresoRuim` do servidor. */
export function regrasPreso(texto){
  const t = String(texto ?? '').trim();
  const palavras = t.split(/\s+/).filter(p => (p.match(/\p{L}/gu) || []).length >= 2).length;
  const motivo = t.length < PRESO.minimo ? 'curto' : palavras < PRESO.palavras ? 'palavras'
    : (new RegExp('(.)\\1{' + (PRESO.repeticao - 1) + ',}', 'su').test(t) || new Set(t).size < PRESO.diferentes) ? 'enchimento' : null;
  return { ok: !motivo, n: t.length, palavras, motivo };
}
/** O diálogo "Estou preso" (botão da aba Conta e /preso). */
export function estouPreso(){
  if (!ctx) return;
  const ja = document.querySelector('.cf-preso'); if (ja){ ja.querySelector('textarea')?.focus(); return; }
  const destino = (() => { try { return ctx.destinoPreso?.() || null; } catch { return null; } })();
  const centro = destino?.centro !== false;
  const baixa = innerHeight < 520;                                          // celular deitado (390 px): mais apertado e rolável
  const d = document.createElement('div'); d.className = 'cf-preso';
  Object.assign(d.style, { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(520px, calc(100% - 32px))',
    maxHeight: 'calc(100% - 16px)', overflowY: 'auto', boxSizing: 'border-box', background: '#0F1A2E', border: '2px solid #F8C237', borderRadius: '16px',
    padding: baixa ? '10px 14px' : '18px', zIndex: '600', font: '700 ' + (baixa ? 12 : 13) + 'px "Nunito Sans", system-ui, sans-serif', color: '#B8C2D9',
    display: 'grid', gap: baixa ? '5px' : '8px' });
  const el = (tag, css = {}, texto = null) => { const e = document.createElement(tag); Object.assign(e.style, css); if (texto != null) e.textContent = tr(texto); d.appendChild(e); return e; };
  el('div', { font: '800 ' + (baixa ? 16 : 18) + 'px \'Baloo 2\', system-ui', color: '#F8C237', textAlign: 'center' }, 'Estou preso');
  el('div', { textAlign: 'center', lineHeight: '1.3' }, centro
    ? 'Conte o que você estava fazendo e onde tentou ir quando travou. Sua posição e o diagnóstico vão juntos pra equipe. Depois de enviar, você volta pro último Centro Pokémon.'
    : 'Conte o que você estava fazendo e onde tentou ir quando travou. Sua posição e o diagnóstico vão juntos pra equipe. Depois de enviar, você volta pro laboratório do Professor Oak.');
  el('div', { textAlign: 'center', lineHeight: '1.3', color: '#FFB3B6', background: 'rgba(229,71,77,.12)', border: '1px solid rgba(229,71,77,.55)', borderRadius: '8px', padding: baixa ? '4px 8px' : '6px 10px' },
    'Use só se estiver preso de verdade: uso falso ou pra atalho tira o acesso ao alfa.');
  const area = el('textarea', { background: '#0B1220', border: '1px solid rgba(248,194,55,.4)', borderRadius: '8px', padding: '8px 10px', color: '#fff', font: 'inherit', resize: 'vertical', minHeight: baixa ? '64px' : '96px' });
  area.rows = baixa ? 3 : 4; area.maxLength = 1000;
  area.placeholder = tr('Ex.: estava descendo a escada da caverna do Monte Lua, virei pra esquerda e fiquei travado entre a pedra e a parede; não consigo andar pra lado nenhum.');
  const linha = el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' });
  const dica = document.createElement('span'), cont = document.createElement('span');
  Object.assign(dica.style, { lineHeight: '1.25', fontWeight: '600' }); Object.assign(cont.style, { font: '800 12px ui-monospace, monospace', whiteSpace: 'nowrap' });
  dica.className = 'cf-preso-dica'; cont.className = 'cf-preso-cont'; linha.append(dica, cont);
  const av = el('div', { minHeight: '16px', color: '#f58e8e', textAlign: 'center', lineHeight: '1.3' }); av.className = 'cf-preso-av';
  const bts = el('div', { display: 'flex', gap: '10px' });
  const ok = document.createElement('button'), nao = document.createElement('button');
  ok.type = nao.type = 'button'; ok.className = 'ok'; nao.className = 'nao'; ok.textContent = tr('Enviar'); nao.textContent = tr('Cancelar');
  for (const b of [ok, nao]) Object.assign(b.style, { flex: '1', background: '#13254A', border: '1px solid #F8C237', borderRadius: '10px', padding: baixa ? '7px' : '9px', color: '#F8C237', font: 'inherit', cursor: 'pointer' });
  bts.append(ok, nao);
  document.body.appendChild(d); DIALOGOS.add(d);
  let enviando = false, erroServ = '', semSuporte = false;
  /** O que impede de usar agora (mensagem) ou '' — o servidor confere de novo. */
  const bloqueio = () => {
    const j = ctx.jogo || {};
    if (j.turno) return tr('Você está numa batalha por turno: termine a batalha antes de usar o "Estou preso".');
    if (j.raidArena) return tr('Você está na arena da raid: quando a raid acabar, você volta sozinho pra onde estava.');
    if (ctx.conta?.estado?.().modo !== 'conta') return tr('Você está jogando sem conta: o "Estou preso" precisa de uma conta, porque o relato tem de chegar na equipe antes de você ser levado. Entre com a sua conta do alfa e tente de novo.');
    return '';
  };
  const DICAS = { curto: null, palavras: 'Escreva pelo menos 5 palavras: o que você estava fazendo e onde tentou ir quando travou.',
    enchimento: 'Isso parece enchimento (letra repetida ou quase nenhum caractere diferente). Conte de verdade o que aconteceu.' };
  const atualizar = () => {
    const R = regrasPreso(area.value), b = bloqueio();
    cont.textContent = Math.min(R.n, 9999) + '/' + PRESO.minimo; cont.style.color = R.n >= PRESO.minimo ? '#8fe08f' : '#f58e8e';
    const falta = PRESO.minimo - R.n;
    dica.textContent = R.ok ? tr('Pronto pra enviar.') : R.motivo === 'curto' ? (R.n ? tr('Faltam {n} caracteres.', { n: falta }) : '') : tr(DICAS[R.motivo]);
    dica.style.color = R.ok ? '#8fe08f' : '#B8C2D9';
    if (!enviando){ av.style.color = '#f58e8e'; av.textContent = b || erroServ; }
    const pode = R.ok && !b && !enviando && !semSuporte;
    ok.disabled = !pode; ok.style.opacity = pode ? '1' : '0.45'; ok.style.cursor = pode ? 'pointer' : 'default';
    d.dataset.pode = pode ? '1' : '0'; d.dataset.bloqueio = b ? '1' : '0';   // sonda headless
  };
  const tique = setInterval(() => { if (!d.isConnected){ clearInterval(tique); return; } atualizar(); }, 500);   // a batalha começa/acaba com o diálogo aberto
  const fecharDlg = () => { clearInterval(tique); d.remove(); };
  area.addEventListener('input', atualizar);
  area.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape'){ e.preventDefault(); fecharDlg(); } });   // as teclas do jogo (I, K, M…) não podem agir enquanto escreve
  /* o keyup NÃO é engolido (15/09): o jogo só apaga a tecla no keyup — a seta segurada no jogo e solta aqui dentro ficava presa e,
     no Cancelar, o jogador saía andando sozinho (atravessou uma porta na sonda). */
  nao.onclick = fecharDlg;
  ok.onclick = async () => {
    const R = regrasPreso(area.value);
    if (enviando || !R.ok || bloqueio()){ atualizar(); return; }
    enviando = true; erroServ = ''; atualizar();
    av.style.color = '#B8C2D9'; av.textContent = tr('enviando…');
    let diag = {}, contexto = {};
    try { diag = ctx.diagnostico?.() || {}; } catch (e){ diag = { erro: String(e?.message || e) }; }
    try { contexto = ctx.contexto?.() || {}; } catch (e){ contexto = { erro: String(e?.message || e) }; }
    const r = await ctx.conta.chamar('POST', '/conta/relato', { texto: area.value.trim(), diag, contexto, preso: true });
    enviando = false;
    if (!r.ok){
      let msg = tr(r.erro || 'não foi');
      if (!I18n.ehPt() && msg === r.erro){                                  // o texto do servidor ainda não tem tradução: diz o essencial no idioma do jogador
        const min = /(\d+)\s*min/.exec(r.erro || '')?.[1];
        if (r.status === 429 && min) msg = tr('Você usou o "Estou preso" há pouco. Espere {n} min antes de usar de novo.', { n: min });
        else if (r.status === 400) msg = tr('O relato não passou nas regras: pelo menos 50 caracteres e 5 palavras, sem enchimento.');
        else if (r.status === 409) msg = tr('Agora não dá: você está numa batalha ou na luta da raid.');
      }
      erroServ = msg; atualizar(); return;
    }
    /* SERVIDOR ANTIGO (15/09, revisão): publicar só o cliente (reset no VPS sem reiniciar o node) deixa no ar um servidor que não
       conhece o `preso` — ele aceita como relato normal ({ok, id}, sem `preso`), sem a espera de 10 min, sem as regras e sem a
       recusa em batalha/raid. Sem `preso.usos24h` na resposta ninguém é levado: o relato chegou, o teleporte espera o servidor novo. */
    if (!Number.isFinite(r.dados?.preso?.usos24h)){
      semSuporte = true;
      erroServ = tr('O servidor ainda não conhece o "Estou preso": o seu relato chegou na equipe, mas você não foi levado. Recarregue a página daqui a pouco e tente de novo.');
      atualizar(); return;
    }
    fecharDlg();
    Chat.sistema(centro ? 'Relato enviado pra equipe. Levando você pro último Centro Pokémon…' : 'Relato enviado pra equipe. Levando você pro laboratório do Professor Oak…');
    const n = +r.dados?.preso?.usos24h || 0;
    if (n >= 3) Chat.sistema(tr('Você já usou o "Estou preso" {n} vezes nas últimas 24 h.', { n }));
    fechar();
    const foi = await ctx.irDestinoPreso?.();
    if (foi === false) Chat.sistema('O jogo já estava trocando de lugar. Se continuar preso, recarregue a página.');
  };
  atualizar();
  setTimeout(() => area.focus(), 50);
}
/* A maquete não trouxe diálogo de SENHA (só o de apagar), e a rota do servidor existe desde 07/09 sem tela nenhuma.
   Este aqui é DOM simples com a paleta dela — pedido de arte pra rodada 25 anotado no figma-desvios.md. */
function cfDialogoSenha(){
  if (!popCf || document.querySelector('.cf-senha')) return;
  if (ctx.conta?.estado?.().modo !== 'conta'){ Chat.sistema('Você está jogando sem conta: não há senha pra trocar.'); return; }
  const d = document.createElement('div'); d.className = 'cf-senha';
  Object.assign(d.style, { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: '420px',
    background: '#0F1A2E', border: '2px solid #F8C237', borderRadius: '16px', padding: '18px', zIndex: '600',
    font: '700 13px "Nunito Sans", system-ui, sans-serif', color: '#B8C2D9', display: 'grid', gap: '8px' });
  d.innerHTML = '<div style="font:800 18px \'Baloo 2\', system-ui;color:#F8C237;text-align:center">Trocar senha</div>'
    + '<input type="password" autocomplete="current-password" placeholder="senha de agora">'
    + '<input type="password" autocomplete="new-password" placeholder="senha nova (6 a 64)">'
    + '<input type="password" autocomplete="new-password" placeholder="repita a senha nova">'
    + '<div class="cf-senha-av" style="min-height:16px;color:#f58e8e;text-align:center"></div>'
    + '<div style="display:flex;gap:10px"><button type="button" class="ok" style="flex:1">Trocar</button>'
    + '<button type="button" class="nao" style="flex:1">Cancelar</button></div>';
  for (const i of d.querySelectorAll('input'))
    Object.assign(i.style, { background: '#0B1220', border: '1px solid rgba(248,194,55,.4)', borderRadius: '8px', padding: '8px 10px', color: '#fff', font: 'inherit' });
  for (const b of d.querySelectorAll('button'))
    Object.assign(b.style, { background: '#13254A', border: '1px solid #F8C237', borderRadius: '10px', padding: '9px', color: '#F8C237', font: 'inherit', cursor: 'pointer' });
  d.innerHTML = tHtml(d.innerHTML); for (const i of d.querySelectorAll('input')) i.placeholder = tr(i.placeholder);   // idioma
  document.body.appendChild(d);
  const [atual, nova, rep] = d.querySelectorAll('input'), av = d.querySelector('.cf-senha-av');
  d.querySelector('.nao').onclick = () => d.remove();
  d.querySelector('.ok').onclick = async () => {
    if (nova.value !== rep.value){ av.textContent = tr('as duas senhas novas têm de ser iguais.'); return; }
    if (nova.value.length < 6){ av.textContent = tr('a senha nova precisa de 6 caracteres ou mais.'); return; }
    av.style.color = '#B8C2D9'; av.textContent = tr('trocando…');
    const r = await ctx.conta.trocarSenha(atual.value, nova.value);
    if (!r.ok){ av.style.color = '#f58e8e'; av.textContent = tr(r.erro); return; }
    d.remove();
    Chat.sistema('Senha trocada.' + (r.codigo ? ' GUARDE o código de recuperação NOVO (o antigo não vale mais): ' + r.codigo : ''));
  };
  atual.focus();
}
/* IDIOMA DENTRO DO JOGO (etapa 3, 11/09): a maquete não tem a linha; ela entra na vaga que ficou livre quando as linhas de
   ADM saíram, no estilo do seletor dela (rótulo à esquerda, pílula à direita). Trocar grava no aparelho e na conta e
   recarrega o jogo no mesmo lugar (a HUD inteira já está desenhada no idioma antigo). Pedido pra Amanda na rodada 25. */
/* ===== RODADA 29: banner "Em breve" (v2) e o interruptor do visual novo */
let popEb = null;
const ehV2 = () => !!ctx?.jogo?.hudLayout?._figma?.v2;
function popupEb(){
  if (popEb) return popEb;
  const def = defPopup('em-breve'); if (!def) return null;
  popEb = Popup.montar(def, { fechar: () => {} });
  return popEb;
}
/** Abre o banner "Em breve" pro recurso (loja, fliperama, batalha, guilda, mercado, eventos): emblema, nome e texto do pacote da Amanda. */
export function abrirEmBreve(recurso){
  const pop = popupEb(); if (!pop) return false;
  fecharGrade();
  const R = pop.__def.recursos?.[recurso] || { nome: recurso, texto: '' };
  Popup.imagem(pop, 'emblema-recurso', R.emblema || null);
  Popup.texto(pop, 'recurso-nome', R.nome || recurso);
  Popup.texto(pop, 'recurso-texto', R.texto || '');
  Popup.rotulo(pop, 'em-breve');
  arteExemplo(Popup.no(pop, 'banner'));                                  // 17/09 (auditoria dos placeholders): a ilustração de fundo do banner (img/banner) é arte fixa da maquete; a área ficava vazia e os degradês por cima pintavam um azul liso
  Popup.abrir(pop); ctx.Som?.tocar?.('ui/sound_click', { volume: 0.5 });
  return true;
}
/* ===== ESCOLHA DO INICIAL na maquete da Amanda (pop-up `inicial` da rodada 29/30; decisão do Jaime em 18/09: SEM abas de geração,
   só os 3 de Kanto). O index continua dono do palco 3D (palcoIniciais) e do registro (receberInicial); aqui é só a janela: o canvas do
   palco entra DENTRO do pop-up (escala junto com ele) e desenha cada modelo na caixa `img/modelo` da sua `opcao-N`; nome e ícones de
   tipo nas células (iconesTipo esconde o `tipo-2` de quem só tem um); a `marca-selecionado` (a maquete só desenhou na opcao-2) é clonada
   pras outras e acesa na escolhida. Com o HUD antigo nada disto roda (temPopup('inicial') = false) e a caixa dourada do index continua. */
let popIn = null;
/** O layout carregado tem a maquete desse pop-up nesta orientação? (o index decide entre a caixa antiga e a da Amanda) */
export function temPopup(nome){ return !!defPopup(nome); }
/** `lista` = os iniciais ({ dex, nome, glb, tipos }); `palco` = palcoIniciais() do index; `aoEscolher(o, i)` registra; `semEscolha()` avisa que falta escolher. */
export function abrirInicial({ lista, palco = null, aoEscolher = null, semEscolha = null } = {}){
  const def = defPopup('inicial'); if (!def || !lista?.length) return false;
  if (popIn && Popup.aberto(popIn)) return true;
  if (popIn){ popIn.remove(); popIn = null; }                             // monta de novo a cada abertura: são poucos nós e as chamadas de volta ficam frescas
  let sel = -1, ops = [];
  const P = palco;
  const pintar = () => {
    ops.forEach((op, i) => { for (const m of op.querySelectorAll(':scope > [data-sobre="selecionado"]')) m.style.display = i === sel ? 'block' : 'none'; });
    Popup.botao(popIn, 'escolher-inicial', true, sel >= 0 ? 'Escolher ' + lista[sel].nome : 'Escolher');   // idioma: "Escolher {x}" no ui_<l>.json
  };
  popIn = Popup.montar(def, {
    escolhe: (x, el) => { const i = ops.indexOf(el); if (i < 0 || i === sel || !lista[i]) return; sel = i; P?.selecionar?.(sel); ctx.Som?.tocar?.('ui/sound_click', { volume: 0.5 }); pintar(); },
    acao: a => { if (a !== 'escolher-inicial') return; if (sel < 0){ semEscolha?.(); return; } const o = lista[sel], i = sel; Popup.fechar(popIn); aoEscolher?.(o, i); },
    fechar: () => { P?.fechar?.(); },
  });
  ops = [1, 2, 3].map(n => popIn.querySelector('[data-fig="opcao-' + n + '"]')).filter(Boolean);
  const marca = popIn.querySelector('[data-sobre="selecionado"]');
  ops.forEach((op, i) => {
    const o = lista[i]; op.style.display = o ? 'block' : 'none'; if (!o) return;
    if (marca && !op.querySelector(':scope > [data-sobre="selecionado"]')) op.appendChild(marca.cloneNode(true));
    Popup.texto(popIn, 'pokemon-nome', o.nome, op);
    iconesTipo(popIn, op, o.tipos || []);
    op.style.touchAction = 'pan-y';
    P?.arrastavel?.(op, i);                                                // arrastar na opção escolhida gira o modelo
  });
  Popup.rotulo(popIn, 'titulo'); Popup.rotulo(popIn, 'mensagem');
  if (P?.canvas){
    Object.assign(P.canvas.style, { position: 'absolute', left: '0', top: '0', width: def.w + 'px', height: def.h + 'px', pointerEvents: 'none', zIndex: '500' });
    popIn.appendChild(P.canvas);
    P.hospedar?.(() => popIn, i => ops[i]?.querySelector('[data-var="modelo"]') || null);
    P.abrir?.(); P.montar?.(lista);
  }
  pintar();
  fecharGrade();
  Popup.abrir(popIn); ctx.Som?.tocar?.('ui/sound_click', { volume: 0.5 });
  return true;
}
/** Um clique numa peça do HUD v2 (hud:abrir): o que existe abre; o que não existe mostra o banner. */
function abrirRecurso(nome){
  if (!nome) return;
  if (['loja', 'fliperama', 'batalha', 'guilda', 'mercado', 'eventos'].includes(nome)){ if (!abrirEmBreve(nome)) abrir(nome === 'eventos' || nome === 'fliperama' ? 'loja' : nome); return; }
  abrir(nome);
}
/* ===== RODADA 30 (18/09): MODO PRÉVIA do adm — pedido da Amanda: abrir dentro do jogo as telas da maquete v2 que ainda não têm função
   (Mercado, Eventos, Guilda, Calendário, Raid, Inicial, banner de evento, Em breve), cheias com os exemplos dela, pra aprovar na tela antes
   de o recurso existir. Só GM ou jogo local (`ctx.gm()`) e só com o visual novo. `?previa=1` na URL ou F7 abrem/fecham a paleta.
   Nada é gravado: os pop-ups da prévia são instâncias à parte (`popsPrevia`), fora do estado das janelas de verdade. */
const PREVIA_URL = (() => { try { return new URLSearchParams(location.search).get('previa') === '1'; } catch { return false; } })();
const ORDEM_PREVIA = ['mercado', 'eventos', 'guilda', 'calendario', 'raid', 'inicial', 'banner-evento', 'em-breve'];
let popPrevia = null, paletaPrevia = null; const popsPrevia = {};
function fecharPrevia(){ if (popPrevia) Popup.fechar(popPrevia); popPrevia = null; }
function abrirPrevia(nome){
  const def = defPopup(nome); if (!def) return false;
  fechar(); fecharGrade(); fecharPrevia();
  let pop = popsPrevia[nome];
  if (!pop){
    pop = popsPrevia[nome] = Popup.montar(def, { fechar: () => { if (popPrevia === pop) popPrevia = null; }, acao: a => Chat.sistema('Prévia: a ação "' + a + '" ainda não tem função.') });
    Popup.encherExemplo(pop);
  }
  popPrevia = pop; Popup.abrir(pop); ctx.Som?.tocar?.('ui/sound_click', { volume: 0.5 });
  return true;
}
/** Liga/desliga a paleta da prévia (F7, `?previa=1`); `on` força. Devolve se ficou ligada. */
export function previa(on = null){
  if (!ctx?.gm?.()) return false;
  if (paletaPrevia){ if (on === true) return true; paletaPrevia.remove(); paletaPrevia = null; fecharPrevia(); return false; }
  if (on === false) return false;
  const ori = ctx.MOBILE ? (Hud.presetAtual() === 'celular_deitado' ? 'deitado' : null) : 'pc';
  const ps = ori && ctx.jogo?.hudLayout?.popups?.[ori];
  if (!ps || !ehV2()){ Chat.sistema('Prévia: ligue o visual novo (Configurações → Geral → Visual novo, ou ?hud=v2)' + (ctx.MOBILE ? ' e deite o celular' : '') + '.'); return false; }
  const nomes = Object.keys(ps), maquete = ORDEM_PREVIA.filter(n => nomes.includes(n)), janelas = nomes.filter(n => !maquete.includes(n) && JANELAS[n]);
  const p = document.createElement('div'); p.id = 'previa';
  p.innerHTML = '<b>Prévia das telas (adm)</b><span class="fecha" title="fechar (F7)">×</span>'
    + '<div class="sec">Maquete, com os exemplos da Amanda</div><div class="bts" data-sec="maquete"></div>'
    + '<div class="sec">Janelas do jogo</div><div class="bts" data-sec="janela"></div>'
    + '<div class="sec">Banner "Em breve" por recurso</div><div class="bts" data-sec="breve"></div>'
    + '<small>' + ori + ' · nada é gravado · Esc fecha o pop-up, F7 a paleta</small>';
  const bt = (sec, rotulo, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = rotulo; b.onclick = fn; p.querySelector('[data-sec="' + sec + '"]').appendChild(b); };
  for (const n of maquete) bt('maquete', n, () => abrirPrevia(n));
  for (const n of janelas) bt('janela', n, () => { fecharPrevia(); abrir(n); });
  bt('janela', 'mochila cheia', () => abrirPreviaMochila());   /* 18/09 (Amanda, PR #2): a Mochila com 46 itens de exemplo, pra lista rolar e conferir a scrollbar */
  for (const r of ['loja', 'fliperama', 'batalha', 'guilda', 'mercado', 'eventos']) bt('breve', r, () => { fecharPrevia(); fechar(); abrirEmBreve(r); });
  p.querySelector('.fecha').onclick = () => previa(false);
  document.body.appendChild(p); paletaPrevia = p;
  return true;
}
/* MOCHILA CHEIA NA PRÉVIA (18/09, pedido da Amanda no PR #2: "a scrollbar da Mochila ela não conseguiu conferir — não tem itens suficientes pra
   lista rolar"). O botão "mochila cheia" da paleta abre uma instância À PARTE do pop-up `mochila` (em `popsPrevia`, como as outras da prévia)
   com 46 itens de exemplo do dump: ícones de ui/itens/, quantidades variadas e todas as categorias das abas (Pokébolas 8, Medicina 15, MT 6,
   Chave 10, Customização 2 e 5 pedras que só aparecem em Todos). O preenchimento segue os passos do encherMochila — abas por CATS_MO, busca,
   Popup.celulas, anel de selecionado pelo Popup.selecionar, painel detalhe-item no PC, linha de dica no celular, dica ao passar o mouse — mas
   a lista é esta, fixa: o inventário de verdade (`itens`, `bolas`, dinheiro, conta) não é lido nem gravado, e Usar, Descartar e o toque duplo
   só avisam no chat. Em Todos a lista rola nos dois (6 linhas de 8 no PC, 23 de 2 no celular). Esc e o X fecham (é o `popPrevia`). */
const MOCHILA_PREVIA = [[1001, 25], [1002, 12], [1003, 6], [1004, 1], [1005, 30], [1006, 3], [1007, 5], [1008, 4],
  [2001, 15], [2002, 8], [2003, 4], [2004, 2], [2005, 1], [2006, 6], [2007, 3], [2008, 2], [2009, 3], [2010, 4], [2011, 1], [2012, 5], [2013, 1], [2017, 9], [2035, 12],
  [30001, 1], [30004, 2], [30007, 1], [30008, 1], [30009, 1], [30010, 3],
  [20001, 1], [20002, 1], [20003, 1], [20004, 2], [20005, 1], [20007, 1], [20008, 1], [20009, 1], [20068, 1], [20071, 1],
  [57031, 1], [57032, 1], [50304, 2], [50306, 1], [50307, 1], [50308, 3], [50309, 1]];
async function abrirPreviaMochila(){
  if (!defPopup('mochila')) return false;
  await dados(); if (!D?.itens) return false;                            /* a paleta pode abrir antes do menus_dados.json chegar */
  const def = defPopup('mochila'); if (!def) return false;
  fechar(); fecharGrade(); fecharPrevia();
  let pop = popsPrevia['mochila-cheia'];
  if (!pop){
    const st = { cat: 'todos', busca: '', sel: 0 };
    const lista = () => {
      const tipos = CATS_MO[st.cat], b = st.busca.trim().toLowerCase();
      return MOCHILA_PREVIA.filter(([id]) => D.itens[id]).map(([id, n]) => ({ id: String(id), n, it: D.itens[id] }))
        .filter(e => (!tipos || tipos.includes(e.it.t)) && (!b || (e.it.n || '').toLowerCase().includes(b)))
        .sort((x, y) => (x.it.t - y.it.t) || String(x.it.n).localeCompare(String(y.it.n), 'pt-BR'));
    };
    const avisa = a => Chat.sistema('Prévia: "' + a + '" não mexe no inventário (mochila de exemplo).');
    const encher = () => {
      const L = lista(); if (st.sel >= L.length) st.sel = 0;
      Popup.trocarAba(pop, st.cat); Popup.rotulo(pop, 'titulo');
      Popup.texto(pop, 'pokedollar', '12.400'); Popup.texto(pop, 'moedas', '12.400'); Popup.texto(pop, 'gold', '350');
      Popup.celulas(pop, 'lista-itens', Math.max(L.length, 1), 'item').forEach((c, i) => {
        const e = L[i];
        for (const f of c.children){ if (f.dataset.sobre) continue; f.style.display = e ? (f.dataset.txt ? (f.dataset.display || 'flex') : 'block') : 'none'; }
        if (!e) return;
        Popup.texto(pop, 'item-nome', e.it.n || ('item ' + e.id), c); Popup.texto(pop, 'item-qtd', '×' + e.n, c);
        Popup.texto(pop, 'item-descricao', semBr(e.it.d), c); Popup.imagem(pop, 'item', e.it.i ? './ui/itens/' + e.it.i + '.png' : null, c);
      });
      Popup.selecionar(pop, st.sel + 1, 'item', 'item');
      const alvo = L[st.sel], det = Popup.grupo(pop, 'detalhe-item');
      if (det){
        Popup.texto(pop, 'item-nome', alvo ? (alvo.it.n || '') : '', det);
        Popup.texto(pop, 'item-categoria', alvo ? catCurta(D.tipos?.[alvo.it.t] || '') : '', det);
        Popup.texto(pop, 'item-qtd', alvo ? ('Você tem ' + alvo.n) : '', det);
        Popup.texto(pop, 'item-descricao', alvo ? semBr(alvo.it.d) : '', det);
        if (alvo && podeUsarMo(alvo)) Popup.rotulo(pop, 'item-dica', det); else Popup.texto(pop, 'item-dica', '', det);
        Popup.imagem(pop, 'item', alvo && alvo.it.i ? './ui/itens/' + alvo.it.i + '.png' : null, det);
      } else linhaAvisoMo(pop, alvo && podeUsarMo(alvo) && !pop.querySelector(':scope > [data-tag="acao"][data-tagval="usar"]') ? { texto: 'Toque duas vezes no item pra usar', dica: true } : null);
      Popup.botao(pop, 'usar', !!alvo && podeUsarMo(alvo), alvo && alvo.it.t === 7 ? 'Escolher' : 'Usar');
      Popup.botao(pop, 'descartar', !!alvo && podeDescartarMo(alvo));
    };
    pop = popsPrevia['mochila-cheia'] = Popup.montar(def, {
      aba: c => { if (c === st.cat) return; st.cat = c; st.sel = 0; encher(); },
      digita: v => { st.busca = v; st.sel = 0; encher(); },
      acao: avisa,
      fechar: () => { if (popPrevia === pop) popPrevia = null; },
    });
    pop.id = 'pf-previa-mochila';                                          /* o id da Mochila de verdade (pf-popup-mochila) é o que o tools/figma_conferir.mjs procura */
    pop.addEventListener('click', ev => {                                  /* clique escolhe a célula (anel de selecionado); o 2º rápido seria o Usar */
      const c = ev.target?.closest?.('[data-fig^="item-"]'); if (!c || !pop.contains(c)) return;
      const n = +c.dataset.fig.split('-').pop(); if (!n) return;
      const agora = Date.now(), duplo = st.sel === n - 1 && agora - (pop.__toqueMo || 0) < 450;
      pop.__toqueMo = duplo ? 0 : agora; st.sel = n - 1; encher();
      if (duplo) avisa('usar');
    });
    const dica = el => {                                                   /* [passa:item]: a descrição inteira na caixinha, como na Mochila de verdade */
      const c = el?.closest?.('[data-fig^="item-"]'), e = c && pop.contains(c) && lista()[+c.dataset.fig.split('-').pop() - 1];
      Popup.dica(pop, 'tooltip', e ? c : null, e ? { titulo: e.it.n || '', descricao: semBr(e.it.d) } : null);
    };
    pop.addEventListener('mouseover', ev => dica(ev.target));
    pop.addEventListener('mouseout', ev => { if (!pop.contains(ev.relatedTarget)) dica(null); });
    pop.addEventListener('touchstart', ev => dica(ev.target), { passive: true });
    pop.addEventListener('touchend', () => setTimeout(() => dica(null), 2000), { passive: true });
    pop.__encher = encher;
  }
  popPrevia = pop; Popup.abrir(pop); pop.__encher();                      /* depois do abrir: o Popup.celulas mede a grade pelo offsetTop (escondido dá 0) */
  ctx.Som?.tocar?.('ui/sound_click', { volume: 0.5 });
  return true;
}
/* VAGAS DAS LINHAS NOSSAS na aba Geral (Idioma, Visual novo). As duas linhas de ADM que o jogo esconde (`ajuste-tamanho-pokemon`,
   `ajuste-densidade-selvagens`) deixam duas vagas: "Tamanho da interface" sobe pra 1ª e as nossas entram nas outras duas, CENTRADAS na
   altura da linha de deslizante (a nossa é alta como o seletor). Antes a conta era `top + passo` a partir do seletor e, no v2 (linhas
   mais juntas), a 2ª linha caía em cima do divisor de "Painéis". A pílula da direita copia a caixa do `bg-seletor` (layout antigo) ou,
   no v2, a do `txt/valor` do seletor — os 396/210 px fixos eram do PC antigo e no celular deitado (coluna de 334 px) caíam em cima dos
   toggles da coluna da direita, e no PC saíam da coluna (teste da Amanda no site, 18/09). No layout antigo as contas dão o mesmo de antes. */
function cfVaga(area, n){
  const q = area.querySelector('[data-fig="seletor-qualidade"]'), gAdm = area.querySelector('[data-fig="ajuste-tamanho-pokemon"]'), gDen = area.querySelector('[data-fig="ajuste-densidade-selvagens"]');
  if (!q || !gAdm) return null;
  const px = v => parseFloat(v) || 0;
  const passo = gDen ? (px(gDen.style.top) - px(gAdm.style.top)) / 2 : px(gAdm.style.top) - px(q.style.top);
  const vaga = px(gAdm.style.top) + passo * n, hVaga = px(gAdm.style.height), h = px(q.style.height) || 38;
  const bg = q.querySelector('[data-fig="bg-seletor"]'), val = q.querySelector('[data-txt="valor"]'), ref = bg || val;
  return { left: q.style.left, top: Math.round(vaga + hVaga / 2 - h / 2), width: q.style.width, height: h, rotulo: q.querySelector('[data-fig="rotulo"]'),
    bx: ref ? px(ref.style.left) : 396, bw: ref ? px(ref.style.width) : 210, bh: bg ? (px(bg.style.height) || 36) : h, by: bg ? px(bg.style.top) : 0 };
}
/** Texto de botão nosso cabendo na pílula da maquete (no celular a pílula tem 88 px): encolhe a fonte até caber, como o Hud.encolher. */
function cfCaber(b){
  Object.assign(b.style, { whiteSpace: 'nowrap', overflow: 'hidden' });
  let fs = parseFloat(b.style.fontSize) || 14;
  for (let i = 0; i < 8 && fs > 7 && b.scrollWidth > b.clientWidth + 0.5; i++){ fs -= 1; b.style.fontSize = fs + 'px'; }
}
/** Configurações → Geral: "Visual novo (beta)" — liga/desliga o HUD v2 da Amanda (LS hud.v2) e recarrega o jogo no mesmo lugar. */
function cfLinhaVisual(pop){
  const area = pop.querySelector('[data-fig="conteudo-geral"]'); if (!area) return;
  const V = cfVaga(area, 2); if (!V) return;                               // 2ª vaga: abaixo do Idioma
  let linha = area.querySelector('.cf-visual');
  if (!linha){ linha = document.createElement('div'); linha.className = 'cf-visual'; area.appendChild(linha); }
  const rotulo = V.rotulo;
  Object.assign(linha.style, { position: 'absolute', left: V.left, top: V.top + 'px', width: V.width, height: V.height + 'px', pointerEvents: 'auto', zIndex: '5' });
  const fonte = (rotulo?.style.fontWeight || '700') + ' ' + (rotulo?.style.fontSize || '14.5px') + ' "Nunito Sans", system-ui, sans-serif';
  linha.innerHTML = '';
  const lab = document.createElement('span'); lab.textContent = tr('Visual novo (beta)');
  Object.assign(lab.style, { position: 'absolute', left: '0', top: '0', height: '100%', display: 'flex', alignItems: 'center', font: fonte, color: '#fff' });
  linha.appendChild(lab);
  const { bx, bw, bh, by } = V;
  const on = ehV2();
  const b = document.createElement('button'); b.type = 'button'; b.textContent = on ? tr('Voltar pro visual atual') : tr('Ligar');
  Object.assign(b.style, { position: 'absolute', left: bx + 'px', top: by + 'px', width: bw + 'px', height: bh + 'px', borderRadius: (bh / 2) + 'px',
    border: '1px solid rgba(248,194,55,1)', background: on ? 'rgba(11,18,32,.9)' : '#F8C237', color: on ? '#F8C237' : '#1A1A1A', font: fonte, cursor: 'pointer', padding: '0' });
  b.onclick = () => { try { localStorage.setItem('hud.v2', on ? '0' : '1'); } catch {} cfRecarregar('hud', null); };
  linha.appendChild(b); cfCaber(b);
}
function cfLinhaIdioma(pop){
  const area = pop.querySelector('[data-fig="conteudo-geral"]'); if (!area) return;
  const V = cfVaga(area, 1); if (!V) return;                               // 1ª vaga: logo abaixo de "Tamanho da interface"
  let linha = area.querySelector('.cf-idioma');
  if (!linha){ linha = document.createElement('div'); linha.className = 'cf-idioma'; area.appendChild(linha); }
  const rotulo = V.rotulo;
  Object.assign(linha.style, { position: 'absolute', left: V.left, top: V.top + 'px', width: V.width, height: V.height + 'px', pointerEvents: 'auto', zIndex: '5' });
  const fonte = (rotulo?.style.fontWeight || '700') + ' ' + (rotulo?.style.fontSize || '14.5px') + ' "Nunito Sans", system-ui, sans-serif';
  linha.innerHTML = '';
  const lab = document.createElement('span'); lab.textContent = tr('Idioma');
  Object.assign(lab.style, { position: 'absolute', left: '0', top: '0', height: '100%', display: 'flex', alignItems: 'center', font: fonte, color: '#fff' });
  linha.appendChild(lab);
  const { bx, bw, bh, by } = V;
  const cada = bw / 3;
  Object.entries(I18n.IDIOMAS).forEach(([l, nome], i) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = l.toUpperCase(); b.title = nome;
    const on = I18n.idioma() === l;
    Object.assign(b.style, { position: 'absolute', left: (bx + i * cada) + 'px', top: by + 'px', width: (cada - 4) + 'px', height: bh + 'px', borderRadius: (bh / 2) + 'px',
      border: '1px solid rgba(248,194,55,' + (on ? '1' : '.45') + ')', background: on ? '#F8C237' : 'rgba(11,18,32,.9)', color: on ? '#1A1A1A' : '#F8C237', font: fonte, cursor: on ? 'default' : 'pointer', padding: '0' });
    b.onclick = async () => { if (I18n.idioma() === l) return; await I18n.definir(l); try { await ctx.conta?.idioma?.(l); } catch {} cfRecarregar('idioma', l); };
    linha.appendChild(b);
  });
}
function cfAbrirApagar(){ Popup.mostrarExtra(popCf, 'dialogo-apagar', true); cfConferirNome(); }
/** O apagar só liga quando o nome digitado bate com o do treinador (pedido da maquete). */
function cfConferirNome(){
  const d = Popup.extra(popCf, 'dialogo-apagar'); if (!d) return;
  const inp = d.querySelector('input');
  const certo = String(inp?.value || '').trim().toLowerCase() === String(ctx.nome || '').trim().toLowerCase();
  Popup.botao(d, 'apagar-progresso', certo && !!ctx.nome);
}
/** Enche a aba Geral com o que o jogo tem hoje. */
function encherConfig(pop){
  Popup.trocarAba(pop, abaCf);
  for (const a of pop.querySelectorAll('[data-tag="aba"]')) Popup.rotulo(pop, 'aba', a);
  const p = new URLSearchParams(location.search);
  /* Geral — os quatro controles que já existem */
  Popup.seletor(pop, 'seletor-qualidade', QUALIDADES.rot[Math.max(0, QUALIDADES.ops.indexOf(p.get('qualidade') || ctx.qualidade || 'alta'))]);
  const val = { 'tamanho-interface': Hud.tamanhoUI?.() || 'normal' };
  for (const id of Object.keys(PARADAS)){
    const i = paradaDe(id, val[id]);
    Popup.ajuste(pop, 'ajuste-' + id, kDaParada(id, i), PARADAS[id].rot[i]);
  }
  /* as linhas de ADM somem, e "Tamanho da interface" sobe pro lugar da primeira delas (senão fica um buraco no meio do
     bloco "Jogo"; o vão que sobra antes do divisor não incomoda) */
  for (const id of CF_ADM){ const g = pop.querySelector('[data-fig="' + id + '"]'); if (g) g.style.display = 'none'; }
  const gAdm = pop.querySelector('[data-fig="ajuste-tamanho-pokemon"]'), gUi = pop.querySelector('[data-fig="ajuste-tamanho-interface"]');
  if (gAdm && gUi) gUi.style.top = gAdm.style.top;
  cfLinhaIdioma(pop);                                                      // IDIOMA (etapa 3): na vaga logo abaixo
  cfLinhaVisual(pop);                                                      // rodada 29: "Visual novo (beta)" na vaga seguinte
  /* o que ainda não existe: apagado, com o porquê */
  for (const [id, dica] of Object.entries(CF_FALTA)){
    Popup.toggle(pop, 'toggle-' + id, false);                              // apagado E desligado: dourado-apagado parece "ligado"
    for (const pre of ['toggle-', 'seletor-', 'ajuste-']) Popup.desligarGrupo(pop, pre + id, false, dica);
    /* Alguns não são grupo com esse nome — os sete botões de remapear se chamam todos `btn-remapear`, e quem os
       identifica é a AÇÃO. Apago pela ação também. */
    const b = pop.querySelector('[data-tag="acao"][data-tagval="' + id + '"]');
    if (b){ b.dataset.desligado = '1'; b.style.opacity = '0.45'; b.style.cursor = 'default'; b.title = tr(dica); }
  }
  for (const [chave, aba] of [['conteudo-som', 'som'], ['conteudo-controles', 'controles'], ['conteudo-social', 'social'], ['conteudo-conta', 'conta']]){
    cfMostrarAba(pop, chave, abaCf === aba);
  }
  if (abaCf === 'som') encherCfSom(pop);
  else if (abaCf === 'conta') encherCfConta(pop);
  else if (abaCf === 'controles') encherCfControles(pop);
  else if (abaCf === 'social') encherCfSocial(pop);
}
/** SOM: três volumes contínuos, mudo e o som em segundo plano. Tudo de verdade. */
function encherCfSom(pop){
  const e = Som.estado();
  for (const [id, campo] of Object.entries(CF_VOLUMES)){
    const k = Math.max(0, Math.min(1, e[campo] ?? 0));
    Popup.ajuste(pop, 'ajuste-' + id, k, Math.round(k * 100) + '%');
  }
  Popup.toggle(pop, 'toggle-mudo', !!e.mudo);
  Popup.toggle(pop, 'toggle-som-segundo-plano', !!e.fundo);
}
/** CONTA: quem é, sair, trocar senha, apagar e o diagnóstico do aparelho. */
function encherCfConta(pop){
  const c = ctx.conta?.estado?.() || {}, comConta = c.modo === 'conta';
  Popup.texto(pop, 'jogador-nome', ctx.nome || '—');
  Popup.texto(pop, 'email', comConta ? (cfEmail || 'sem e-mail no cadastro') : '— (jogando sem conta)');
  if (comConta && cfEmail === null) cfBuscarEmail();
  Popup.botao(pop, 'logout', comConta, 'Sair da conta');
  Popup.botao(pop, 'trocar-senha', comConta, 'Trocar senha');
  Popup.botao(pop, 'diagnostico-chat', true, 'Mandar pra equipe');        // RELATOS (11/09): era "Mandar pro chat" (só escrevia no chat local)
  cfBotaoPreso(pop);                                                       // ESTOU PRESO (15/09): logo abaixo de Copiar / Mandar pra equipe
  Popup.desligarGrupo(pop, 'btn-sair', comConta, 'você está jogando sem conta');
  Popup.desligarGrupo(pop, 'btn-trocar-senha', comConta, 'você está jogando sem conta');
  /* a caixa `diagnostico-info [do-jogo]` recebe o texto, rolável */
  const cx = pop.querySelector('[data-fig="diagnostico-info"]');
  if (cx){
    let pre = cx.querySelector('pre');
    if (!pre){
      pre = document.createElement('pre');
      Object.assign(pre.style, { position: 'absolute', inset: '6px', margin: '0', overflow: 'auto', whiteSpace: 'pre-wrap',
        font: '400 10px ui-monospace, monospace', color: '#B8C2D9', pointerEvents: 'auto' });
      cx.style.pointerEvents = 'auto'; cx.appendChild(pre);
    }
    pre.textContent = cfDiagTexto();
  }
}
/* ESTOU PRESO (15/09): a maquete da aba Conta não tem nó pra botão novo. A caixa do diagnóstico encolhe uma fileira, Copiar / Mandar pra
   equipe sobem junto, e o "Estou preso" entra na fileira de baixo, na largura da coluna — dourado cheio pra ser achado na hora. Em
   coordenadas da maquete (escala junto com o pop-up), uma vez por montagem; ui/figma e ui/hud_layout.json ficam intocados. */
function cfBotaoPreso(pop){
  const blc = Popup.extra(pop, 'conteudo-conta'); if (!blc || blc.querySelector('.cf-preso-btn')) return;
  const caixa = blc.querySelector('[data-fig="diagnostico-info"]'), copiar = blc.querySelector('[data-fig="btn-copiar-diag"]'), mandar = blc.querySelector('[data-fig="btn-diag-chat"]');
  if (!copiar || !mandar) return;
  const px = v => parseFloat(v) || 0;
  const x0 = px(copiar.style.left), h = px(mandar.style.height); let topo = px(mandar.style.top);
  if (caixa){
    const vao = Math.max(4, topo - (px(caixa.style.top) + px(caixa.style.height)));
    const passo = h + vao;
    if (px(caixa.style.height) - passo < 40) return;                       // maquete sem espaço: não inventa (a /preso continua valendo)
    caixa.style.height = (px(caixa.style.height) - passo) + 'px';
    copiar.style.top = (px(copiar.style.top) - passo) + 'px'; mandar.style.top = (topo - passo) + 'px';
  } else {
    /* VISUAL NOVO (18/09, chaospider no #bugs: "no Geral não tem a opção como na versão legacy"): a aba Conta do v2 não tem o nó
       'diagnostico-info' — a caixa do diagnóstico está PINTADA no fundo, e Copiar / Mandar pra equipe também (não dá pra empurrá-los
       pra cima como acima). O botão entra na fileira logo ACIMA deles, dentro da caixa pintada, com o mesmo vão que separa Trocar senha
       de Sair da conta; e a caixa pintada ganha um nó 'diagnostico-info' de verdade (do subtítulo até o botão) pra receber o texto do
       diagnóstico, que no v2 ficava em branco. */
    const a = blc.querySelector('[data-fig="btn-trocar-senha"]'), s = blc.querySelector('[data-fig="btn-sair"]');
    const vao = (a && s) ? Math.max(6, px(s.style.top) - (px(a.style.top) + px(a.style.height))) : Math.round(h / 2);
    topo = topo - vao - h;
    const sub = [...blc.querySelectorAll('[data-fig="subtitulo"]')].find(e => Math.abs(px(e.style.left) - x0) < 40);
    const y0 = sub ? px(sub.style.top) + px(sub.style.height) + Math.round(vao / 2) : 0;
    if (topo - vao - y0 < 40) return;                                      // maquete sem espaço: não inventa (a /preso continua valendo)
    const cx = document.createElement('div'); cx.dataset.fig = 'diagnostico-info';
    Object.assign(cx.style, { position: 'absolute', left: x0 + 'px', top: y0 + 'px', width: (px(mandar.style.left) + px(mandar.style.width) - x0) + 'px', height: (topo - vao - y0) + 'px' });
    blc.appendChild(cx);
  }
  const rot = mandar.querySelector('.pf-rotulo, [data-txt]');
  const b = document.createElement('button'); b.type = 'button'; b.className = 'cf-preso-btn'; b.textContent = tr('Estou preso');
  b.title = tr('Travou em parede, escada ou caverna? Conte o que aconteceu e volte pro último Centro Pokémon.');
  Object.assign(b.style, { position: 'absolute', left: x0 + 'px', top: topo + 'px', width: (px(mandar.style.left) + px(mandar.style.width) - x0) + 'px', height: h + 'px',
    boxSizing: 'border-box', margin: '0', padding: '0', borderRadius: (h / 2) + 'px', border: '1.5px solid #F8C237', background: '#F8C237', color: '#1A1A1A',
    font: '900 ' + (rot?.style.fontSize || '12.5px') + ' "Nunito Sans", system-ui, sans-serif', cursor: 'pointer', pointerEvents: 'auto', zIndex: '60',
    boxShadow: '0 0 0 3px rgba(248,194,55,.18)' });
  b.addEventListener('click', ev => { ev.stopPropagation(); estouPreso(); });
  blc.appendChild(b);
}
let cfEmail = null;
async function cfBuscarEmail(){
  cfEmail = '';                                                            // só tenta uma vez
  const r = await ctx.conta?.chamar?.('GET', '/conta');
  cfEmail = (r?.ok && r.dados?.email) || '';
  if (aberta === 'config') render();
}
/** CONTROLES: mostra as teclas de verdade; remapear e joystick ainda não existem. */
function encherCfControles(pop){
  for (const [id, tecla] of Object.entries(CF_TECLAS)){
    const g = pop.querySelector('[data-fig="tecla-' + id + '"]');
    if (!g) continue;
    Popup.texto(pop, 'tecla', tecla, g);
    if (CF_DICA_TECLA[id]) g.title = tr(CF_DICA_TECLA[id]);
  }
  Popup.seletor(pop, 'seletor-lado-joystick', 'Esquerda');
  Popup.ajuste(pop, 'ajuste-tamanho-joystick', 0.5, 'Normal');
  Popup.ajuste(pop, 'ajuste-tamanho-botoes', 0.5, 'Normal');              // rodada 25: coluna Celular (ainda não ajustável)
  Popup.toggle(pop, 'toggle-vibracao', false);                             // o jogo não vibra (navigator.vibrate não é usado)
}
/** SOCIAL: nada disto existe ainda (privacidade, status e filtro precisam do servidor) — tudo apagado, só mostra o estado de hoje. */
function encherCfSocial(pop){
  Popup.toggle(pop, 'toggle-filtro-chat', false);
  Popup.toggle(pop, 'toggle-status-online', true);
  Popup.seletor(pop, 'seletor-quem-mensagem', 'Todos');
  Popup.seletor(pop, 'seletor-quem-convida', 'Todos');
  Popup.seletor(pop, 'seletor-fonte-chat', 'Normal');
}
function rConfig(corpo){
  abas([{ id: 'geral', nome: 'Geral' }]);
  const p = new URLSearchParams(location.search);
  const vol = ctx.lerLS('volume', 100);
  corpo.innerHTML = `<div class="config">
    <label><span>seu nome (aparece em cima da cabeça e no chat)</span><input type="text" id="c-nome" maxlength="16" value="${esc(ctx.nome || 'Ash')}" style="width:160px;padding:5px 8px;border:1px solid var(--line);border-radius:6px;background:#0b1020;color:var(--text);font:inherit"></label>
    <div id="c-nome-aviso" style="grid-column:1/-1;margin:-6px 0 4px;color:#98a4c0;font-size:12px">o nome é único: não dá pra usar o de outro treinador</div>
    <label><span>volume</span><input type="range" id="c-vol" min="0" max="100" value="${vol}"> <span id="c-volv">${vol}%</span></label>
    <label><span>qualidade gráfica</span><select id="c-qual"><option value="">automática (${esc(ctx.qualidade || '?')})</option><option value="alta">alta</option><option value="baixa">baixa (sem sombra, 0,75×)</option></select></label>
    <label><span>tamanho dos Pokémon</span><select id="c-tam"><option value="proporcional">proporcional (padrão)</option><option value="jogo">como o jogo</option><option value="nativo">nativo do modelo</option></select></label>
    <label><span>tamanho da interface (HUD e janelas)</span><select id="c-ui"><option value="pequena">pequena</option><option value="normal">normal</option><option value="grande">grande</option></select><small id="c-uiv" style="color:var(--muted);font-size:11px;white-space:nowrap"></small></label>
    ${ctx.conta?.estado?.().modo === 'conta' ? `<label><span>conta: <b>${esc(ctx.conta.estado().usuario)}</b> · o jogo fica salvo no servidor, não neste aparelho</span><button type="button" class="btn" id="c-sair">Sair da conta</button></label>
    <label><span>apagar o PERSONAGEM: começa do zero (Pokémon, itens, insígnias, missões); a conta continua sua</span><button type="button" class="btn" id="c-apagar-perso">Apagar personagem</button></label>
    <label><span>apagar a CONTA: some tudo, pra sempre — pede a senha</span><button type="button" class="btn" id="c-apagar-conta">Apagar conta</button></label>
    <div id="c-conta-aviso" style="grid-column:1/-1;margin:-6px 0 4px;color:#98a4c0;font-size:12px"></div>` : ''}
    <label><span>painel de missão: arraste com o mouse ou o dedo pra mudar de lugar</span><button type="button" class="btn" id="c-missao-lugar">↺ lugar padrão</button></label>
    ${Hud.temGuardado() ? `<label><span>a HUD veio com uma maquete nova; o layout que você montou no editor ficou guardado</span><button type="button" class="btn" id="c-hud-meu">↺ usar o meu de novo</button></label>` : ''}
    <label><span>densidade de selvagens</span><select id="c-dens"><option value="">normal</option><option value="0.5">pouca</option><option value="1.5">muita</option><option value="3">lotado</option></select></label>
    ${ctx.gm?.() ? `<label><span>painéis de depuração (hud, chefe, montaria, seguidor)</span><input type="checkbox" id="c-dbg"></label>` : ''}
    <div class="acoes" style="margin-top:12px"><button type="button" class="btn ouro" id="c-perso">✎ Personagem</button>${ctx.gm?.() ? `<button type="button" class="btn ouro" id="c-hud">🧩 Montar a HUD</button><button type="button" class="btn" id="c-galeria">Galeria da UI do Fairy</button><button type="button" class="btn" id="c-bancada">Bancada de habilidades</button>` : ''}<button type="button" class="btn ouro" id="c-preso">Estou preso</button><button type="button" class="btn" id="c-apagar">Apagar progresso (reinicia tudo)</button></div>
    <div style="color:var(--muted);font-size:11px;margin-top:8px">qualidade e densidade recarregam a cena.</div>
    <details style="margin-top:10px"><summary style="cursor:pointer;color:#ffe07a">Diagnóstico do aparelho — abra e copie quando algo ficar preto ou errado</summary><pre id="c-diag" style="white-space:pre-wrap;font-size:11px;color:var(--muted);max-height:260px;overflow:auto;background:#0b1020;padding:8px;border-radius:8px;margin:6px 0"></pre><button type="button" class="btn" id="c-diag-copiar">copiar</button> <button type="button" class="btn" id="c-diag-chat">mandar pro chat</button></details></div>`;
  const diag = () => { const d = ctx.diagnostico?.(); return d ? Object.entries(d).map(([k, v]) => k + ': ' + (Array.isArray(v) ? '\n  ' + v.join('\n  ') : v)).join('\n') : 'indisponível'; };
  const preDiag = corpo.querySelector('#c-diag'); preDiag.textContent = diag();
  corpo.querySelector('#c-diag-copiar').onclick = async () => { const tx = diag(); preDiag.textContent = tx; try { await navigator.clipboard.writeText(tx); corpo.querySelector('#c-diag-copiar').textContent = 'copiado!'; } catch { const r = document.createRange(); r.selectNodeContents(preDiag); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } };
  corpo.querySelector('#c-preso').onclick = () => estouPreso();           // ESTOU PRESO (15/09): o mesmo diálogo da aba Conta do pop-up
  corpo.querySelector('#c-diag-chat').onclick = () => { const d = ctx.diagnostico?.(); if (d) Chat.sistema('diag: ' + [d.gpu, 'webgl2 ' + d.webgl2, d.qualidade, d.tela, 'tex ' + d.maxTextura, 'highp ' + d.highpFrag, 'erros ' + d.erros.join(' ; ')].join(' · ')); };
  corpo.querySelector('#c-qual').value = p.get('qualidade') || ''; corpo.querySelector('#c-tam').value = ctx.jogo.tamanhos || 'proporcional'; corpo.querySelector('#c-dens').value = p.get('densidade') || '';
  const cDbg = corpo.querySelector('#c-dbg'); if (cDbg) cDbg.checked = !!ctx.depuracao?.();   // 08/09: só existe pra GM — sem este guarda, ABRIR as Configurações quebrava pro jogador comum
  corpo.querySelector('#c-nome').onchange = async ev => {                 // nome único (08/09): quem decide é o servidor
    const campo = ev.target, av = corpo.querySelector('#c-nome-aviso');
    campo.disabled = true; av.textContent = 'conferindo…'; av.style.color = '#98a4c0';
    const r = await ctx.renomear?.(campo.value);
    campo.disabled = false; campo.value = ctx.nome;
    if (r && !r.ok){ av.textContent = r.erro; av.style.color = '#f58e8e'; }
    else { av.textContent = 'pronto — você agora é ' + ctx.nome + '.'; av.style.color = '#8fe08f'; }
  };
  corpo.querySelector('#c-vol').oninput = ev => { const v = +ev.target.value; corpo.querySelector('#c-volv').textContent = v + '%'; ctx.gravarLS('volume', v); ctx.Som?.ajustar?.({ sfx: v / 100, mus: v / 100 }); };
  const recarregar = (chave, valor) => { const u = new URL(location.href); if (valor) u.searchParams.set(chave, valor); else u.searchParams.delete(chave); location.href = u.toString(); };
  corpo.querySelector('#c-qual').onchange = ev => recarregar('qualidade', ev.target.value);
  corpo.querySelector('#c-dens').onchange = ev => recarregar('densidade', ev.target.value);
  corpo.querySelector('#c-tam').onchange = ev => ctx.definirTamanhos?.(ev.target.value);
  const cUi = corpo.querySelector('#c-ui'), cUiv = corpo.querySelector('#c-uiv');   // tamanho da interface (05/09): muda ao vivo; a HUD não passa do que cabe na tela
  const dicaUi = () => { cUiv.textContent = 'nesta tela: HUD ' + Math.round(Hud.escalaAtual() * 100) + '% · janelas ' + (ctx.MOBILE ? 'tela cheia' : Math.round(Popup.escalaPopup() * 100) + '%'); };
  cUi.value = Hud.tamanhoUI(); dicaUi();
  cUi.onchange = ev => { Hud.definirTamanho(ev.target.value); dicaUi(); };
  corpo.querySelector('#c-missao-lugar').onclick = () => Hud.zerarMover();   // painel de missão de volta ao lugar da maquete
  const meuHud = corpo.querySelector('#c-hud-meu');                      // §7 item 14: maquete nova entrou; o layout do editor está guardado
  if (meuHud) meuHud.onclick = () => { meuHud.textContent = Hud.restaurarGuardado() ? 'pronto — recarregue a página' : 'não deu pra restaurar'; meuHud.disabled = true; };
  const sairBtn = corpo.querySelector('#c-sair'); if (sairBtn) sairBtn.onclick = () => { sairBtn.textContent = 'Saindo…'; ctx.conta.sair(); };   // fase 2: volta pra tela de login sem o progresso deste aparelho
  /* APAGAR PERSONAGEM / APAGAR CONTA (08/09): quem apaga é o SERVIDOR. Dois cliques no botão pra confirmar; a conta ainda
     pede a senha, porque é pra sempre. */
  const avConta = corpo.querySelector('#c-conta-aviso');
  const doisCliques = (btn, rotulo, acao) => {
    if (!btn) return; let armado = false;
    btn.onclick = async () => {
      if (!armado){ armado = true; btn.textContent = 'Tem certeza? Clique de novo'; setTimeout(() => { if (armado){ armado = false; btn.textContent = rotulo; } }, 5000); return; }
      armado = false; btn.disabled = true; btn.textContent = 'apagando…';
      const r = await acao();
      btn.disabled = false; btn.textContent = rotulo;
      if (r && !r.ok){ avConta.textContent = r.erro; avConta.style.color = '#f58e8e'; }
    };
  };
  doisCliques(corpo.querySelector('#c-apagar-perso'), 'Apagar personagem', async () => {
    const r = await ctx.conta.apagarPersonagem();
    if (r.ok) location.href = new URL('?jogar=1', location.href).toString();   // volta pro começo: criação de personagem
    return r;
  });
  doisCliques(corpo.querySelector('#c-apagar-conta'), 'Apagar conta', async () => {
    const senha = prompt('Apagar a conta é PRA SEMPRE. Digite a sua senha pra confirmar:');
    if (!senha) return { ok: false, erro: 'cancelado' };
    const r = await ctx.conta.apagarConta(senha);
    if (r.ok) location.href = new URL('?jogar=1', location.href).toString();   // sem conta: cai na tela de login
    return r;
  });
  corpo.querySelector('#c-dbg')?.addEventListener('change', ev => ctx.depuracao?.(ev.target.checked));   // só GM (o jogador não tem a linha)
  corpo.querySelector('#c-perso').onclick = () => { fechar(); ctx.criarPersonagem?.(); };   // tela de criação por cima do jogo (personagem.mjs)
  /* Botões de GM que abrem as bancadas (editor de HUD, galeria da UI, bancada de golpes): os endereços moravam em docs/paginas.json
     (`atalhos`), que esta cópia não tem — 27/10: sem o fetch (só dava 404), os botões ficam escondidos como já ficavam sem a lista. */
  for (const sel of ['#c-hud', '#c-galeria', '#c-bancada']){ const b = corpo.querySelector(sel); if (b) b.style.display = 'none'; }
  const ap = corpo.querySelector('#c-apagar');
  ap.onclick = () => { if (!confirmarApagar){ confirmarApagar = true; ap.textContent = 'Tem certeza? Clique de novo'; setTimeout(() => { confirmarApagar = false; ap.textContent = 'Apagar progresso'; }, 4000); return; } apagarTudo(); };   // Jaime (31/08): reinicia TUDO (missões, Centro, abertura, personagem…) pra testar do zero; só preferências do aparelho ficam
}
/** Apagar progresso = conta nova: limpa localStorage/sessionStorage inteiros, menos o layout da HUD e preferências de
    aparelho (hud.*, volume, tamanhos), e recarrega numa URL limpa (sem mapa/chegada/intro): criação de personagem →
    abertura → Pallet, como no primeiro login. */
async function apagarTudo(){
  if (ctx.conta?.estado?.().modo === 'conta') await ctx.conta.zerarSave();   // fase 2: o save da conta também vira vazio (a conta fica)
  const manter = {};
  for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (k && (k.startsWith('hud.') || k.startsWith('conta.') || k === 'volume' || k === 'tamanhos')) manter[k] = localStorage.getItem(k); }
  try { localStorage.clear(); sessionStorage.clear(); } catch {}
  for (const [k, v] of Object.entries(manter)) localStorage.setItem(k, v);
  const u = new URL(location.href); for (const k of [...u.searchParams.keys()]) if (k !== 'raf' && k !== 'mobile') u.searchParams.delete(k);
  u.searchParams.set('jogar', '1');
  location.href = u.toString();
}
