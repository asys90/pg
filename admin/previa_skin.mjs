/* Prévia da skin no editor de dados (esquema skins_treinador → `previa`). Usa o MESMO palco 3D da tela de criação do jogo
 * (personagem.mjs criarPalco: Idle, gira sozinho, arrastar gira, tinta de fábrica do npc_tintas.json + receita de cor), então
 * o que aparece aqui é o que o jogador vê. Além do modelo:
 *  • com receita de cor ("Cores editáveis"): seletores pra testar as cores ao vivo (só na prévia; quem escolhe é o jogador) e o
 *    teste da receita — a máscara é feita pra UM modelo; se nenhuma textura dele bate com a receita, avisa que não vai pegar;
 *  • sem receita: diz se o modelo tem máscara de cor do jogo original (dá pra virar editável com uma receita nova).
 * Também serve a tela "Receitas de cor" (registro com `modelo` + `texturas`): a receita mostrada é o registro em edição. */
import { criarPalco, receita, ROTULOS, PADRAO, PRESETS, CANAIS } from '/personagem.mjs';
import * as Tinta from '/tinta.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let P = null, raiz = null, atual = null;        // atual = { id, glb, tinta }
const cores = {};                               // receita → cores de teste
const coresDe = t => (cores[t] ||= { ...PADRAO[t] });
let tabelaTintas = null;
const tintas = () => (tabelaTintas ||= fetch('/data/npc_tintas.json').then(r => r.json()).catch(() => ({})));
/* Montagem em andamento por id. O P.montar põe o modelo na cena DEPOIS de baixar o GLB: descartar antes disso (trocou de
   linha no meio do carregamento) deixaria o modelo velho órfão e visível por cima do novo — então o velho só sai quando a
   montagem dele termina. */
const montagens = new Map();
const montar = s => { if (!montagens.has(s.id)) montagens.set(s.id, P.montar(s).finally(() => montagens.delete(s.id))); return montagens.get(s.id); };
const soltar = id => { const pr = montagens.get(id); if (pr) pr.catch(() => {}).then(() => { if (atual?.id !== id) P.descartar(id); }); else P.descartar(id); };

function montarRaiz() {
  raiz = document.createElement('div'); raiz.className = 'previa-skin';
  raiz.innerHTML = '<div class="palco"></div><div class="previa-info"></div><div class="previa-cores"></div>';
  P = criarPalco(raiz, coresDe);
  raiz.appendChild(P.canvas);
  const palco = raiz.querySelector('.palco');
  let x0 = 0;                                   // arrastar gira (o P.arrastavel do jogo prende o id; aqui o id muda a cada skin)
  palco.addEventListener('pointerdown', ev => { const it = P.itens.get(atual?.id); if (!it?.pronto) return; it.arrasto = ev.pointerId; x0 = ev.clientX; try { palco.setPointerCapture(ev.pointerId); } catch {} });
  palco.addEventListener('pointermove', ev => { const it = P.itens.get(atual?.id); if (!it || it.arrasto !== ev.pointerId) return; it.giro += (ev.clientX - x0) * 0.012; x0 = ev.clientX; });
  const solta = ev => { const it = P.itens.get(atual?.id); if (it && it.arrasto === ev.pointerId) it.arrasto = null; };
  palco.addEventListener('pointerup', solta); palco.addEventListener('pointercancel', solta);
}
const info = (html, aviso = false) => { const el = raiz.querySelector('.previa-info'); el.innerHTML = html; el.classList.toggle('aviso', aviso); };

/** Põe a prévia no topo do formulário `caixa` (o editor refaz o formulário a cada linha clicada; a prévia é a mesma). */
export function mostrar(caixa, r) {
  if (!raiz) montarRaiz();
  caixa.prepend(raiz);
  atualizar(r);
}

/** Registro mudou (linha nova, prefab ou receita trocados): remonta só se o modelo ou a receita mudaram. */
export async function atualizar(r) {
  if (!raiz) return;
  let glb, t, versao = '';
  if (r?.modelo && r.texturas) {
    /* Registro da tela "Receitas de cor": a receita é o PRÓPRIO registro, ainda não salvo — registra com um id só do painel
       pra prévia mostrar a edição ao vivo (o personagem.mjs aqui é só do painel; o jogo lê o arquivo salvo). */
    glb = String(r.modelo).trim(); t = 'painel:' + glb.toLowerCase();
    CANAIS[t] = r.texturas; ROTULOS[t] = r.rotulos || {}; PADRAO[t] = r.padrao || {}; delete cores[t];
    versao = '|' + assinatura(JSON.stringify([r.texturas, r.rotulos, r.padrao]));
  } else {
    glb = String(r?.prefab || '').trim();
    const pedida = r?.tinta === 'propria' ? glb.toLowerCase() : r?.tinta;   // "receita própria" = a com o id do prefab
    t = pedida && pedida !== 'fixo' && CANAIS[pedida] ? pedida : null;
    if (r?.tinta === 'propria' && !t) versao = '|sem-receita';
  }
  const id = glb + '|' + (t || '') + versao;
  if (atual?.id === id) return;
  if (atual) soltar(atual.id);
  atual = { id, glb, tinta: t };
  const palco = raiz.querySelector('.palco'); palco.dataset.id = id; palco.classList.remove('pronto');
  raiz.querySelector('.previa-cores').innerHTML = '';
  if (!glb) { info('Sem prefab — preencha o campo Prefab.', true); return; }
  info('carregando ' + esc(glb) + '…');
  let it;
  try { it = await montar({ id, glb, tinta: t, nome: glb }); }
  catch { if (atual.id === id) { P.descartar(id); info(`⚠ Modelo não encontrado: <code>public/cenario/pc/${esc(glb)}.glb</code>. No jogo esta skin não carrega.`, true); } return; }
  if (atual.id !== id || !it?.pronto) return;
  P.selecionar(id); palco.classList.add('pronto');
  const nomes = await texturasDo(it.obj);
  if (atual.id !== id) return;
  if (t) {
    /* A receita é por TEXTURA: um modelo pode ter só parte delas (ex.: roupas que reusam o rosto do Herói pegam pele e
       olhos, mas não o corpo). Partes = os canais R/G/B/preto das texturas que existem neste modelo. */
    const partesDe = tx => ['R', 'G', 'B', 'K'].map(k => CANAIS[t][tx][k]).filter(v => typeof v === 'string');
    const todas = new Set(Object.keys(CANAIS[t]).flatMap(partesDe));
    const pegam = new Set(Object.keys(CANAIS[t]).filter(tx => nomes.has(tx)).flatMap(partesDe));
    const rot = ks => { const s = new Set(ks); return [...Object.keys(ROTULOS[t]).filter(k => s.has(k)), ...[...s].filter(k => !(k in ROTULOS[t]))].map(k => ROTULOS[t][k] || k).join(', '); };
    if (!pegam.size) { info(`⚠ A receita <b>${esc(t)}</b> não pega neste modelo (as texturas dele não são as da máscara). No jogo, os seletores de cor não vão mudar nada.`, true); return; }
    const faltam = [...todas].filter(k => !pegam.has(k));
    if (faltam.length) info(`⚠ A receita <b>${esc(t)}</b> só pega em parte deste modelo: mudam <b>${esc(rot(pegam))}</b>; não mudam <b>${esc(rot(faltam))}</b> (a máscara do corpo é de outro modelo).`, true);
    else info(`<b>Cores editáveis no jogo:</b> ${esc(rot(todas))}. Teste abaixo (só na prévia — quem escolhe é o jogador na criação).`);
    seletores(t, id, pegam);
  } else info(versao === '|sem-receita'
    ? `⚠ "Receita própria", mas não existe receita <b>${esc(glb.toLowerCase())}</b> em Receitas de cor — no jogo fica com o visual fixo.`
    : await descreverMascara(nomes), versao === '|sem-receita');
}
/** Hash curto (FNV-1a) só pra saber se a receita editada mudou. */
const assinatura = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };

/** Nomes das texturas CRUAS (e dos materiais) do modelo. A tinta consulta a receita por esses nomes — que o GLB em cache
    guarda e a textura assada esconde —, então uma receita-espiã com Proxy anota tudo o que ela pergunta, sem pintar nada. */
async function texturasDo(obj) {
  const nomes = new Set();
  await Tinta.pintar(obj, new Proxy({}, { get: (_, k) => { if (typeof k === 'string') nomes.add(k); return undefined; } }));
  return nomes;
}

function seletores(t, id, pegam) {
  const el = raiz.querySelector('.previa-cores'), c = coresDe(t);
  el.innerHTML = Object.entries(ROTULOS[t]).filter(([k]) => pegam.has(k)).map(([k, rot]) => `<label class="cor"><input type="color" data-k="${k}" value="${c[k]}"><span>${esc(rot)}</span></label>`).join('')
    + '<button type="button" class="aleatorio">🎲</button><button type="button" class="padrao">padrão</button>';
  const repintar = () => { for (const i of el.querySelectorAll('input[type=color]')) c[i.dataset.k] = i.value; P.repintar(id, t, c); };
  for (const i of el.querySelectorAll('input[type=color]')) i.oninput = repintar;
  el.querySelector('.aleatorio').onclick = () => { for (const i of el.querySelectorAll('input[type=color]')) { const l = PRESETS[i.dataset.k] || []; if (l.length) i.value = l[Math.floor(Math.random() * l.length)]; } repintar(); };
  el.querySelector('.padrao').onclick = () => { for (const i of el.querySelectorAll('input[type=color]')) i.value = PADRAO[t][i.dataset.k]; repintar(); };
}

/** Sem receita: quantas partes do modelo têm máscara de cor no npc_tintas.json (o jogo original tingia por ela). */
async function descreverMascara(nomes) {
  const T = await tintas();
  const comMascara = [...nomes].filter(n => T[n]?.mask && !T[n].isMask);
  return comMascara.length
    ? `<b>Visual fixo.</b> O modelo tem máscara de cor do jogo original em ${comMascara.length} parte(s) (${esc(comMascara.join(', '))}) — dá pra virar editável criando uma receita pra ele no <code>personagem.mjs</code>.`
    : '<b>Visual fixo.</b> Este modelo não tem máscara de cor.';
}
