/* Troca de Pokémon (cliente) — FASE 4 da rede (06/09/2026). O servidor é quem move (servidor/trade.mjs): aqui é só a mesa.
 *   Troca.instalar(ctx)   ctx: { jogo, enviar, Chat, Conta, lerLS, gravarLS, outros(), iconeMon(glb), aplicarSave(save, rev) }
 *   Troca.receber(m)      troca_convite | troca_convidou | troca_recusou | troca_abriu | troca_estado | troca_salvar |
 *                         troca_feita | troca_cancelou
 *   Troca.convidar(nome)  o comando /trocar <nome> do chat (acha quem está por perto na sala)
 *   Troca.aberta()        a mesa está na tela? (o index tranca o teclado do jogo enquanto isso)
 *
 * Regras que o jogador sente: só com conta, só perto (12 m), até 3 de cada lado, mexer na mesa derruba as duas confirmações,
 * e o que aparece do outro lado é o que o SERVIDOR leu do save dele — não o que ele digitou.
 */
let ctx = null, sessao = null, convite = null, meus = [], escolhidos = [], estadoAtual = null;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function instalar(c){ ctx = c; }
export const aberta = () => !!sessao;

/* ------------------------------------------------------------------ estilo (uma vez) */
function estilo(){
  if ($('troca-css')) return;
  const s = document.createElement('style'); s.id = 'troca-css';
  s.textContent = `
#troca-tela{position:fixed;inset:0;z-index:520;display:grid;place-items:center;background:rgba(4,7,16,.62);font:13px/1.4 system-ui,Segoe UI,Roboto,sans-serif;color:#e8eefc}
#troca-tela .tr-caixa{width:min(760px,94vw);max-height:92vh;overflow:auto;background:#111834;border:1px solid #2a3350;border-radius:14px;box-shadow:0 18px 60px #000a}
#troca-tela header{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #2a3350}
#troca-tela header b{color:#ffe07a}
#troca-tela header .x{margin-left:auto;background:none;border:0;color:#98a4c0;font-size:18px;cursor:pointer}
#troca-tela .tr-mesa{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px 14px}
#troca-tela h3{margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:#98a4c0}
#troca-tela .tr-lista{display:flex;flex-direction:column;gap:5px;max-height:44vh;overflow:auto}
#troca-tela .tr-mon{display:flex;align-items:center;gap:8px;padding:5px 7px;border:1px solid #2a3350;border-radius:9px;background:#0d142c}
#troca-tela .tr-mon img{width:34px;height:34px;object-fit:contain}
#troca-tela .tr-mon .n{flex:1;min-width:0}
#troca-tela .tr-mon .n b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#troca-tela .tr-mon .n small{color:#98a4c0}
#troca-tela button.tr-mon{width:100%;cursor:pointer;color:inherit;text-align:left;font:inherit}
#troca-tela button.tr-mon:hover{border-color:#5b6a99}
#troca-tela .tr-mon.sel{border-color:#ffd23a;background:#241f0e}
#troca-tela .tr-vazio{padding:18px 8px;text-align:center;color:#98a4c0}
#troca-tela .tr-pe{display:flex;align-items:center;gap:10px;padding:10px 14px;border-top:1px solid #2a3350}
#troca-tela .tr-pe span{flex:1;color:#98a4c0}
#troca-convite{position:fixed;right:14px;bottom:120px;z-index:521;background:#111834;border:1px solid #ffd23a66;border-radius:12px;padding:10px 12px;box-shadow:0 10px 34px #000a;font:13px system-ui;color:#e8eefc;display:flex;gap:8px;align-items:center}
#troca-convite b{color:#ffe07a}
@media (max-width:700px){#troca-tela .tr-mesa{grid-template-columns:1fr}}`;
  document.head.appendChild(s);
}

/* ------------------------------------------------------------------ convite */
/** /trocar <nome>: acha quem está por perto com esse nome e convida. */
export function convidar(nome){
  const alvo = (ctx.outros?.() || []).find(o => (o.nome || '').toLowerCase() === String(nome || '').toLowerCase().trim());
  if (!alvo){ ctx.Chat?.sistema('Ninguém por perto com o nome "' + nome + '". Fique na mesma área e tente de novo.'); return false; }
  ctx.enviar({ t: 'troca_convidar', para: alvo.id });
  return true;
}
function mostrarConvite(m){
  fecharConvite();
  ctx?.Som?.tocar?.('ui/sound_successful', { volume: .5, prio: true });   // toque do convite (11/09)
  estilo();
  convite = document.createElement('div'); convite.id = 'troca-convite';
  convite.innerHTML = `<span><b>${esc(m.nome)}</b> quer trocar Pokémon</span><button class="btn ouro" id="tr-sim">Aceitar</button><button class="btn" id="tr-nao">Recusar</button>`;
  document.body.appendChild(convite);
  const responde = ok => { ctx.enviar({ t: 'troca_responder', de: m.de, ok }); fecharConvite(); };
  $('tr-sim').onclick = () => responde(true);
  $('tr-nao').onclick = () => responde(false);
  convite.__t = setTimeout(() => responde(false), 30000);                  // ninguém responde: recusa sozinho
}
function fecharConvite(){ if (convite){ clearTimeout(convite.__t); convite.remove(); convite = null; } }

/* ------------------------------------------------------------------ mesa */
function meusPokemon(){
  const time = (ctx.jogo.time || []).map((p, i) => ({ ...p, onde: 'time', i }));
  const caixa = (ctx.lerLS('caixa', []) || []).map((p, i) => ({ ...p, onde: 'caixa', i }));
  return [...time, ...caixa];
}
const chave = p => p.onde + ':' + p.i;
function abrirMesa(m){
  estilo(); fecharConvite();
  sessao = { com: m.com, maxItens: m.maxItens || 3, confirmei: false, fase: 'montando' };
  meus = meusPokemon(); escolhidos = []; estadoAtual = null;
  const t = document.createElement('div'); t.id = 'troca-tela';
  t.innerHTML = `<div class="tr-caixa">
    <header><span>Troca com <b>${esc(m.com.nome)}</b></span><button class="x" id="tr-x" title="sair da troca">✕</button></header>
    <div class="tr-mesa">
      <section><h3>Você oferece <small id="tr-conta"></small></h3><div class="tr-lista" id="tr-meus"></div></section>
      <section><h3>${esc(m.com.nome)} oferece</h3><div class="tr-lista" id="tr-dele"></div></section>
    </div>
    <div class="tr-pe"><span id="tr-status">Escolha até ${sessao.maxItens} e confirme. Os dois precisam confirmar.</span>
      <button class="btn ouro" id="tr-ok">Confirmar</button></div></div>`;
  document.body.appendChild(t);
  $('tr-x').onclick = () => { ctx.enviar({ t: 'troca_sair' }); fecharMesa(); };
  $('tr-ok').onclick = () => { if (sessao.fase !== 'montando') return; ctx.enviar({ t: 'troca_confirmar', ok: !sessao.confirmei }); };
  pintarMeus(); pintarDele([]);
}
function fecharMesa(){ sessao = null; escolhidos = []; estadoAtual = null; $('troca-tela')?.remove(); }
function cartao(p, sel, botao){
  const ic = ctx.iconeMon?.(p.glb) || '';
  const dentro = `${ic ? `<img src="${ic}" alt="">` : ''}<span class="n"><b>${p.shiny ? '✨ ' : ''}${esc(p.nome)}</b><small>Lv ${p.lv || 1}${p.onde === 'caixa' ? ' · caixa' : ''}</small></span>`;
  return botao ? `<button type="button" class="tr-mon${sel ? ' sel' : ''}" data-k="${p.onde}:${p.i}">${dentro}</button>`
               : `<div class="tr-mon${sel ? ' sel' : ''}">${dentro}</div>`;
}
function pintarMeus(){
  const el = $('tr-meus'); if (!el) return;
  el.innerHTML = meus.length ? meus.map(p => cartao(p, escolhidos.includes(chave(p)), true)).join('') : '<div class="tr-vazio">você não tem Pokémon pra trocar</div>';
  $('tr-conta').textContent = escolhidos.length ? '(' + escolhidos.length + '/' + sessao.maxItens + ')' : '';
  for (const b of el.querySelectorAll('button.tr-mon')) b.onclick = () => alternar(b.dataset.k);
}
function pintarDele(lista){
  const el = $('tr-dele'); if (!el) return;
  el.innerHTML = lista?.length ? lista.map(p => cartao(p, false, false)).join('') : '<div class="tr-vazio">nada ainda</div>';
}
function alternar(k){
  if (!sessao || sessao.fase !== 'montando') return;
  const i = escolhidos.indexOf(k);
  if (i >= 0) escolhidos.splice(i, 1);
  else { if (escolhidos.length >= sessao.maxItens) return; escolhidos.push(k); }
  pintarMeus();
  ctx.enviar({ t: 'troca_ofertar', itens: escolhidos.map(c => ({ onde: c.split(':')[0], i: +c.split(':')[1] })) });
}
function pintarEstado(m){
  if (!sessao) return;
  estadoAtual = m; sessao.confirmei = !!m.confirmei; sessao.fase = m.fase || 'montando';
  pintarDele(m.dele);
  const ok = $('tr-ok'), st = $('tr-status'); if (!ok || !st) return;
  ok.textContent = m.confirmei ? '✓ Confirmado' : 'Confirmar';
  ok.classList.toggle('ouro', !m.confirmei);
  st.className = '';
  if (m.confirmei && m.confirmou) st.textContent = 'Fechando a troca…';
  else if (m.confirmei) st.textContent = 'Esperando ' + (m.com?.nome || 'o outro') + ' confirmar.';
  else if (m.confirmou) st.textContent = (m.com?.nome || 'O outro') + ' já confirmou. Falta você.';
  else st.textContent = 'Escolha até ' + sessao.maxItens + ' e confirme. Mexer na mesa derruba as confirmações.';
}

/* ------------------------------------------------------------------ mensagens do servidor */
export function receber(m){
  switch (m.t){
    case 'troca_convite': mostrarConvite(m); return;
    case 'troca_convidou': ctx.Chat?.sistema('Convite de troca enviado pra ' + m.nome + '.'); return;
    case 'troca_recusou': ctx.Chat?.sistema(m.nome + ' recusou a troca.'); return;
    case 'troca_abriu': abrirMesa(m); return;
    case 'troca_estado': pintarEstado(m); return;
    case 'troca_salvar':                                                   // o servidor vai executar: sobe o save deste aparelho antes
      Promise.resolve(ctx.Conta?.enviarAgora?.()).finally(() => ctx.enviar({ t: 'troca_pronto' }));
      if (sessao){ sessao.fase = 'salvando'; const st = $('tr-status'); if (st) st.textContent = 'Salvando o progresso dos dois…'; }
      return;
    case 'troca_feita': {
      const nomes = l => (l || []).map(p => (p.shiny ? '✨ ' : '') + p.nome + ' Lv' + p.lv).join(', ') || 'nada';
      ctx.aplicarSave?.(m.save, m.rev);
      fecharMesa();
      ctx.Chat?.sistema('Troca com ' + m.com + ' feita: você deu ' + nomes(m.dei) + ' e recebeu ' + nomes(m.recebi) + '.');
      return;
    }
    case 'troca_cancelou': ctx.Chat?.sistema('Troca cancelada: ' + (m.motivo || 'sem motivo') + '.'); fecharMesa(); fecharConvite(); return;
  }
}
