import * as I18n from './i18n.mjs';   // IDIOMA (11/09)
import { t as tr, tHtml } from './i18n.mjs';   // IDIOMA (11/09): tr() traduz texto pt pro idioma do jogador
/* Telas de FORA do jogo desenhadas no Figma da Amanda (rodada 19): login e cadastro, tela cheia, sem HUD.
 * Vêm do bloco `telas` do ui/hud_layout.json (pc e deitado) e são montadas pelo popup.mjs como um pop-up do tamanho da tela.
 * Desde a fase 2 da rede (05/09) são o LOGIN DE VERDADE: usuário (ou e-mail) + senha, cadastro com e-mail e confirmação —
 * decisão do Jaime ("prefiro que seja senha"), e a maquete já era assim. Quem conversa com o servidor é o conta.mjs:
 *   Telas.mostrar('login', layout, { conta: { entrar, criar }, aoEntrar })  → abre; ao entrar fecha e chama aoEntrar
 *   Telas.mostrar('login', layout, { Chat })                                → PRÉVIA (?tela=login|cadastro, página de dev): só avisa
 * Ações da maquete: [acao:login] / [acao:cadastrar] / [acao:recuperar-senha]; [abre:tela-cadastro] e [abre:tela-login]
 * alternam as duas. `img/logo` = o logo. Enter envia.
 * ROD. 23 (09/09): entraram `personagem` (escolher o treinador) e `personalizar` (cores + nome) — quem as monta é o
 * telas_personagem.mjs; e o login passou a usar SEMPRE o fundo ESCURO (pedido da Amanda: combina com a seleção nova,
 * que se passa de noite; antes trocava por hora do dia).
 */
import * as Popup from './popup.mjs';
import * as TelasP from './telas_personagem.mjs';   // rodada 23: as telas de escolher e personalizar o treinador

/* DISCORD (20/09, pedido do Jaime: "falta na página principal do site o link pro Discord"). O site abre DIRETO na tela de
   login, então ela é a página principal — e quem chega sem chave não tinha para onde ir: a caixa da Alpha Key dizia "a chave
   que recebeu" sem nunca dizer onde se recebe uma (as chaves saem nos sorteios do Discord). Convite permanente do próprio
   Jaime (kronyxonline), o que aponta pro #alpha-testers. Trocar aqui muda os dois lugares que o mostram. */
const DISCORD = 'https://discord.gg/P2NeDwbcwj';
/* O logo, em caminho SVG — é ele que faz o botão ser reconhecido sem precisar ler. */
const LOGO_DISCORD = '<svg viewBox="0 0 127 96" width="18" height="14" aria-hidden="true" focusable="false"><path fill="currentColor" d="M107 8A105 105 0 0 0 80.9 0a73 73 0 0 0-3.4 7 97 97 0 0 0-29 0A73 73 0 0 0 45 0a105 105 0 0 0-26 8C2.4 33 -1.5 57 .5 80.6A106 106 0 0 0 32.7 96a78 78 0 0 0 6.9-11.2 69 69 0 0 1-10.9-5.2l2.7-2.1a75 75 0 0 0 64.2 0l2.7 2.1a69 69 0 0 1-10.9 5.2A78 78 0 0 0 94.3 96a106 106 0 0 0 32.2-15.4c2.4-27.4-3.9-51.2-19.5-72.6ZM42.4 66.2c-6.3 0-11.5-5.8-11.5-12.9s5-13 11.5-13 11.6 5.9 11.5 13c0 7.1-5.1 12.9-11.5 12.9Zm42.5 0c-6.3 0-11.5-5.8-11.5-12.9s5-13 11.5-13 11.6 5.9 11.5 13c0 7.1-5 12.9-11.5 12.9Z"/></svg>';

let atual = null, ctx = null, layout = null;
/* Qual maquete usar. NÃO pode depender de `body.mobile`: essa classe só é posta DEPOIS do criador de personagem, então no
   celular a tela do treinador montava a de PC (1920×900) e o palco 3D abria um framebuffer de 2880×1350 — 100 a 150 MB de
   GPU só pra escolher o treinador, e a aba caía (10/09). O teste é o mesmo que o index usa pra decidir MOBILE. */
const toque = () => { try { return matchMedia('(pointer: coarse)').matches || innerWidth < 900; } catch { return innerWidth < 900; } };
const ori = () => ((document.body.classList.contains('mobile') || toque()) && innerWidth > innerHeight) ? 'deitado' : 'pc';

/* CÓDIGO DE RECUPERAÇÃO e ESQUECI A SENHA (07/09). Painéis simples, do tamanho do que precisam: a maquete da Amanda tem o
   botão "recuperar senha", mas não desenhou estas duas telas (anotado no docs/figma-desvios.md). */
function painel(html){
  html = tHtml(html);                                                      // idioma: os textos dos painéis simples
  const fundo = document.createElement('div');
  fundo.className = 'tela-extra';
  fundo.style.cssText = 'position:fixed;inset:0;z-index:700;display:grid;place-items:center;background:rgba(4,7,16,.72);font:14px/1.45 system-ui,Segoe UI,Roboto,sans-serif;color:#e8eefc';
  fundo.innerHTML = '<div style="width:min(430px,92vw);background:#111834;border:1px solid #2a3350;border-radius:14px;padding:18px 20px;box-shadow:0 18px 60px #000a">' + html + '</div>';
  document.body.appendChild(fundo);
  return fundo;
}
/** Mostra o código de recuperação UMA vez, depois do cadastro. Só fecha depois de marcar "anotei". */
export function mostrarCodigo(codigo, aoFechar){
  const f = painel('<b style="color:#ffe07a;font-size:16px">Anote o seu código de recuperação</b>'
    + '<p style="color:#98a4c0;margin:8px 0 12px">É a ÚNICA forma de voltar pra sua conta se você esquecer a senha. Ele não fica guardado neste aparelho e não dá pra vê-lo de novo.</p>'
    + '<div id="codigo-recuperacao" style="font:600 20px/1.4 ui-monospace,Consolas,monospace;letter-spacing:2px;text-align:center;padding:12px;border:1px dashed #ffd23a;border-radius:10px;background:#241f0e">' + codigo + '</div>'
    + '<div style="display:flex;gap:8px;align-items:center;margin-top:14px"><button type="button" class="btn" id="cod-copiar">Copiar</button>'
    + '<label style="flex:1;display:flex;gap:6px;align-items:center;color:#98a4c0"><input type="checkbox" id="cod-anotei"> anotei em lugar seguro</label>'
    + '<button type="button" class="btn ouro" id="cod-ok" disabled>Continuar</button></div>');
  const ok = f.querySelector('#cod-ok');
  f.querySelector('#cod-anotei').onchange = ev => { ok.disabled = !ev.target.checked; };
  f.querySelector('#cod-copiar').onclick = () => { try { navigator.clipboard?.writeText(codigo); f.querySelector('#cod-copiar').textContent = 'copiado ✓'; } catch {} };
  ok.onclick = () => { f.remove(); aoFechar?.(); };
}
/** Esqueci a senha: usuário + código + senha nova. */
function formRecuperar(pop){
  const f = painel('<b style="color:#ffe07a;font-size:16px">Esqueci a senha</b>'
    + '<p style="color:#98a4c0;margin:8px 0 12px">Use o código de recuperação que apareceu quando você criou a conta. Se perdeu os dois, chame no Discord do jogo.</p>'
    + '<label style="display:block;margin-bottom:8px">usuário<input id="rec-usuario" autocomplete="username" style="width:100%;margin-top:4px;padding:8px;border:1px solid #2a3350;border-radius:8px;background:#0d142c;color:#e8eefc;font:inherit"></label>'
    + '<label style="display:block;margin-bottom:8px">código de recuperação<input id="rec-codigo" placeholder="XXXX-XXXX-XXXX-XXXX" style="width:100%;margin-top:4px;padding:8px;border:1px solid #2a3350;border-radius:8px;background:#0d142c;color:#e8eefc;font:inherit;text-transform:uppercase"></label>'
    + '<label style="display:block;margin-bottom:12px">senha nova<input id="rec-senha" type="password" autocomplete="new-password" style="width:100%;margin-top:4px;padding:8px;border:1px solid #2a3350;border-radius:8px;background:#0d142c;color:#e8eefc;font:inherit"></label>'
    + '<div style="display:flex;gap:8px"><button type="button" class="btn" id="rec-nao">Voltar</button><button type="button" class="btn ouro" id="rec-sim">Trocar a senha</button></div>'
    + '<div id="rec-aviso" style="margin-top:10px;color:#f58e8e;min-height:18px"></div>');
  const aviso = t => { f.querySelector('#rec-aviso').textContent = tr(t); };
  f.querySelector('#rec-nao').onclick = () => f.remove();
  f.querySelector('#rec-sim').onclick = async () => {
    const u = f.querySelector('#rec-usuario').value.trim(), c = f.querySelector('#rec-codigo').value.trim(), s2 = f.querySelector('#rec-senha').value;
    if (!u || !c) return aviso('Preencha o usuário e o código.');
    if (s2.length < 6) return aviso('Senha nova: pelo menos 6 caracteres.');
    aviso('Trocando…');
    const r = await ctx.conta.recuperar(u, c, s2);
    if (!r.ok) return aviso(r.erro || 'Não deu.');
    f.remove();
    if (r.codigo) mostrarCodigo(r.codigo, () => avisar(pop, 'Senha trocada. Entre com ela.', false));
    else avisar(pop, 'Senha trocada. Entre com ela.', false);
  };
}
export function mostrar(nome, L, c = {}){
  layout = L || layout; ctx = c || ctx;
  const def = layout?.telas?.[ori()]?.[nome] || layout?.telas?.pc?.[nome];
  if (!def){ console.warn('telas: não há maquete de ' + nome); return null; }
  fechar();
  const pop = Popup.montar({ ...def, semMargem: true }, {
    acao: (a, el) => acao(nome, a, el, pop),
    abre: alvo => { const m = /^tela-(\w+)$/.exec(alvo || ''); if (m){ mostrar(m[1], layout, ctx); return true; } return false; },
    fechar: () => {},
  });
  pop.style.zIndex = ctx?.conta ? '600' : '200'; pop.classList.add('pf-tela');   // login de verdade fica por cima de tudo (carregando, "vire o celular")
  estiloTela();
  for (const g of pop.querySelectorAll('[data-fig^="painel-"]')){         // a moldura dourada fica POR CIMA do véu escuro, como no Figma: como fundo do grupo ela ficava atrás, e o véu (12 px pra dentro) pintava a parte interna do anel
    const img = g.style.backgroundImage; if (!img || img === 'none' || g.querySelector(':scope > .tela-moldura')) continue;
    const m = document.createElement('div'); m.className = 'tela-moldura';
    Object.assign(m.style, { position: 'absolute', inset: '0', backgroundImage: img, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', pointerEvents: 'none', zIndex: '15' });
    g.style.backgroundImage = 'none'; g.appendChild(m);
  }
  /* RESERVA do "esqueci a senha": a maquete da rodada 19 não o tinha e sem ele a recuperação por código ficaria inalcançável.
     A maquete de hoje TEM (`link-esqueci`, ação `recuperar-senha`, embaixo do botão) — então só desenho o meu quando ela
     vier sem nenhum. A condição antiga procurava `data-fig*="recuperar"`, que nunca casou com `link-esqueci`: davam DOIS
     links na tela, e o meu ainda caía no canto (o botão de entrar não tem left/top em px, então a conta dava 0). */
  if (nome === 'login' && ctx?.conta?.recuperar && !pop.querySelector('[data-tagval="recuperar-senha"]')){
    const btn = pop.querySelector('[data-fig="btn-entrar"]');
    const link = document.createElement('button');
    link.type = 'button'; link.id = 'tela-esqueci'; link.textContent = 'esqueci minha senha';
    const x = parseFloat(btn?.style.left) || 0, y = (parseFloat(btn?.style.top) || 0) + (parseFloat(btn?.style.height) || 0) + 16, w = parseFloat(btn?.style.width) || 200;
    link.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;z-index:30;background:none;border:0;color:#cfd8ee;text-decoration:underline;cursor:pointer;font:inherit;font-size:13px';
    pop.appendChild(link);
    link.onclick = () => formRecuperar(pop);
  }
  /* TELAS DO TREINADOR (rodada 23): quem monta é o telas_personagem.mjs; aqui só se ligam os ganchos no pop-up. */
  const H = (nome === 'personagem' || nome === 'personalizar') ? TelasP.montar(nome, pop, def, ctx) : null;
  if (H){
    pop.__cb.aba = a => H.aba(a);
    pop.__cb.acao = (a, el) => H.acao(a, el);
    const abreAntes = pop.__cb.abre;
    pop.__cb.abre = (alvo, el) => (H.abre(alvo, el) || abreAntes(alvo, el));
    for (const x of pop.querySelectorAll('[data-tag="fecha"][data-tagval="seletor-cor"]')) x.addEventListener('click', () => H.fechou?.());   // cancelar devolve a cor de antes
  } else {
    Popup.imagem(pop, 'fundo', './ui/figma/backgrounds/fundo-login-escuro.png');   // sempre escuro (rodada 23)
    Popup.imagem(pop, 'logo', './ui/figma/backgrounds/logo-pokefable.png');
    Popup.texto(pop, 'versao', ctx?.conta ? 'v0.2.0 · alfa' : 'v0.1.0 · prévia');
  }
  for (const inp of (H ? [] : pop.querySelectorAll('input'))){            // Enter = o botão da tela; sem Esc fechando (a tela é obrigatória no login)
    const campo = inp.closest('[data-fig]')?.dataset.fig || '';
    if (inp.type === 'search') inp.type = 'text';                          // o popup cria campo de BUSCA (com o × do Chrome); aqui é formulário
    inp.autocomplete = /senha/.test(campo) ? (nome === 'cadastro' ? 'new-password' : 'current-password') : (/email/.test(campo) ? 'email' : 'username');   // gerenciador de senha e teclado do celular
    inp.autocapitalize = 'none'; inp.spellcheck = false; inp.name = campo.replace(/^campo-/, '');
    inp.addEventListener('keydown', ev => { if (ev.key === 'Enter'){ ev.preventDefault(); acao(nome, nome === 'login' ? 'login' : 'cadastrar', inp, pop); } });
    if (ctx?.conta) inp.addEventListener('keydown', ev => { if (ev.key === 'Escape') ev.stopImmediatePropagation(); }, true);
  }
  Popup.abrir(pop);
  atual = pop;
  setTimeout(() => pop.querySelector('input')?.focus(), 50);
  if (nome === 'cadastro' && ctx?.conta?.alfa) caixaAlphaKey(pop);        // ALPHA KEY (11/09): com o cadastro fechado, a caixa vem antes do formulário
  else if (nome !== 'cadastro') chaveAlfa = null;
  if (nome === 'login' || nome === 'cadastro'){
    barraIdioma(pop, nome);                                              // IDIOMA (11/09): PT · EN · ES no canto da tela
    botaoDiscord(pop);                                                   // DISCORD (20/09): canto de baixo, do lado oposto ao idioma
  }
  return pop;
}
/* O CONVITE DO DISCORD na tela de entrada (20/09). Fica no canto de baixo à direita pra não brigar com o formulário nem com a
   barra de idioma (canto de cima à direita). É um `<a>` de verdade — abre em aba nova, e `rel=noopener` pra página do jogo não
   ficar alcançável pelo `window.opener` de quem abrir. */
function botaoDiscord(pop){
  if (pop.querySelector('.tela-discord')) return;
  const a = document.createElement('a');
  a.className = 'tela-discord';
  a.href = DISCORD; a.target = '_blank'; a.rel = 'noopener noreferrer';
  a.title = tr('Comunidade, novidades e sorteios de chave');
  a.innerHTML = LOGO_DISCORD + '<span>' + tr('Discord') + '</span>';
  pop.appendChild(a);
}
/* IDIOMA (11/09): a escolha é do jogador, na tela de login. Trocar redesenha a tela; a escolha fica no aparelho e vai pra
   conta no login (conta.mjs). Sem arte da Amanda ainda — pedido pra rodada 25 (figma-desvios.md). */
function barraIdioma(pop, nome){
  if (pop.querySelector('.tela-idioma')) return;
  const b = document.createElement('div'); b.className = 'tela-idioma';
  for (const [l, rot] of Object.entries(I18n.IDIOMAS)){
    const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = l.toUpperCase(); bt.title = rot;
    bt.classList.toggle('on', I18n.idioma() === l);
    bt.onclick = async () => { if (I18n.idioma() === l) return; await I18n.definir(l); ctx?.conta?.idioma?.(l); mostrar(nome, layout, ctx); };
    b.appendChild(bt);
  }
  pop.appendChild(b);
}
/** CSS das telas (uma vez): o preenchimento automático do Chrome pintava o campo de branco com texto preto (a "caixa branca" do
    e-mail); o placeholder segue a cor da maquete. */
function estiloTela(){
  if (document.getElementById('tela-css')) return;
  const st = document.createElement('style'); st.id = 'tela-css';
  st.textContent = `
.pf-tela input:-webkit-autofill, .pf-tela input:-webkit-autofill:hover, .pf-tela input:-webkit-autofill:focus, .pf-tela input:autofill{
  -webkit-box-shadow: 0 0 0 1000px #151e30 inset; box-shadow: 0 0 0 1000px #151e30 inset; -webkit-text-fill-color: #b8c2d9; caret-color: #b8c2d9;
  border-radius: 6px; transition: background-color 99999s ease-out 0s; }
.pf-tela input::placeholder{ color: #7f8db0; opacity: 1; }
.tela-extra .btn{ padding: 9px 14px; border: 1px solid #2a3350; border-radius: 10px; background: #151e30; color: #e8eefc; font: 700 14px system-ui, Segoe UI, Roboto, sans-serif; cursor: pointer; }
.tela-extra .btn.ouro{ border-color: #f8c237; background: #13254a; color: #f8c237; }
.tela-extra .btn:disabled{ opacity: .5; cursor: default; }
.tela-idioma{ position: absolute; top: 14px; right: 18px; display: flex; gap: 6px; z-index: 40; }
.tela-idioma button{ min-width: 40px; padding: 6px 10px; border: 1px solid #2a3350; border-radius: 999px; background: #151e30cc; color: #98a4c0; font: 700 12px system-ui, Segoe UI, Roboto, sans-serif; cursor: pointer; }
.tela-idioma button.on{ border-color: #f8c237; background: #13254a; color: #f8c237; }
/* DISCORD (20/09): canto de baixo à ESQUERDA. A direita já é do rótulo de versão ("v0.2.0 · alfa", o pf-txt da maquete) e o
   botão caía exatamente em cima dele — medido, 66x23 sobre 80x13. À esquerda o canto está vazio, e o botão fica na diagonal
   oposta à barra de idioma (canto de cima à direita), que é o outro atalho da tela. O env(safe-area-inset-bottom) é pro
   iPhone: a tela é cheia e o traço da casa come o rodapé. */
/* nowrap + flex 0 0 auto nos filhos: sem isso o flex encolhia o rótulo (o span pedia 43 px e recebia 28,5) e o "Discord"
   saía cortado — a maquete ainda escala a tela por 0,667, o que aperta mais. (Sem crase aqui: isto está DENTRO de um
   template literal, e uma crase no comentário fecha a string — foi o que quebrou a tela na primeira tentativa.) */
.tela-discord{ position: absolute; left: 18px; bottom: calc(14px + env(safe-area-inset-bottom, 0px)); z-index: 40;
  display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border: 1px solid #2a3350; border-radius: 999px;
  background: #151e30cc; color: #98a4c0; font: 700 12px system-ui, Segoe UI, Roboto, sans-serif; text-decoration: none;
  white-space: nowrap; }
.tela-discord > *{ flex: 0 0 auto; }
.tela-discord:hover, .tela-discord:focus-visible{ border-color: #5865f2; background: #1b2545; color: #dfe4fb; }
.tela-alpha-discord{ display: inline-flex; align-items: center; gap: 6px; color: #8ea2ff; text-decoration: none; font-weight: 700; }
.tela-alpha-discord:hover, .tela-alpha-discord:focus-visible{ color: #b9c5ff; text-decoration: underline; }
.pf-tela input::-webkit-search-cancel-button, .pf-tela input::-webkit-credentials-auto-fill-button{ display: none; }`;
  document.head.appendChild(st);
}
export function fechar(){ if (atual){ Popup.fechar(atual); atual.remove(); atual = null; } }
/** JOGO ATUALIZADO (10/09): tela curta enquanto o cliente se recarrega sozinho. O jogador não precisa saber de nada. */
export function atualizando(){
  if (document.getElementById('tela-atualizando')) return;
  const f = painel('<b style="color:#ffe07a;font-size:17px">O jogo foi atualizado</b>'
    + '<p style="color:#98a4c0;margin:10px 0 0">Voltando em um instante…</p>');
  f.id = 'tela-atualizando'; f.style.zIndex = '1200';
}
/** KIKADO (10/09): a conta entrou de outro lugar. Tela por cima de tudo, curta, com o caminho de volta — como em qualquer
    MMO. Nada de explicar save: o jogo daqui parou e ponto. */
export function derrubado(texto = 'Você entrou de outro lugar.'){
  texto = tr(texto);
  if (document.getElementById('tela-derrubado')) return;
  const f = painel('<b style="color:#ffe07a;font-size:17px">' + texto + '</b>'
    + '<p style="color:#98a4c0;margin:10px 0 16px">A sua conta só joga de um lugar por vez.</p>'
    + '<button type="button" class="btn ouro" id="der-voltar" style="width:100%">Ir pro login</button>');
  f.id = 'tela-derrubado'; f.style.zIndex = '1200';
  /* Volta pra TELA DE LOGIN, não pro jogo (pedido dele, 10/09): a sessão daqui acabou, então o certo é sair da conta e
     deixar a pessoa entrar de novo se quiser. Apagar a sessão local basta — no próximo boot o portão mostra o login. */
  f.querySelector('#der-voltar').onclick = () => {
    try { for (const k of ['conta.token', 'conta.usuario', 'conta.rev', 'conta.dono', 'conta.sujo', 'conta.gm']) localStorage.removeItem(k); } catch {}
    location.replace(new URL('?jogar=1', location.href).toString());       // URL limpa: sem `mapa` de antes
  };
}
/** A maquete tem as telas do treinador? (a demo pública pode estar num pacote antigo) */
export const temTelaTreinador = (L = layout) => !!(L?.telas?.pc?.personagem && L?.telas?.pc?.personalizar);
/** FLUXO DE CRIAÇÃO (rodada 23): escolher → personalizar → jogo. Resolve com { tipo, cores, nome }, ou null se cancelar.
    Devolve null (síncrono) quando a maquete não tem as telas — aí quem cria é o `Personagem.abrir` de sempre. */
export function criarTreinador(L, c = {}){
  layout = L || layout;
  if (!temTelaTreinador(layout)) return null;
  TelasP.iniciar(c);
  return new Promise(resolve => {
    let fim = false;
    const acabou = p => { if (fim) return; fim = true; TelasP.encerrar(); fechar(); if (esc) removeEventListener('keydown', esc, true); resolve(p); };
    const esc = c.cancelavel ? (ev => { if (ev.key === 'Escape'){ ev.stopImmediatePropagation(); acabou(null); } }) : null;
    if (esc) addEventListener('keydown', esc, true);
    mostrar('personagem', layout, { ...c, aoPronto: acabou });
  });
}
export const aberta = () => !!atual;

/** Linha de aviso embaixo do botão da tela (a maquete não tem um lugar pra mensagens: nasce aqui, no mesmo grupo do botão). */
function avisar(pop, texto, erro = false){
  texto = tr(texto);
  const btn = pop.querySelector('[data-fig="btn-entrar"],[data-fig="btn-cadastrar"]');
  const pai = btn?.parentElement || pop;
  let el = pai.querySelector(':scope > .tela-aviso');
  if (!el){
    el = document.createElement('div'); el.className = 'tela-aviso';
    const x = parseFloat(btn?.style.left) || 0, y = (parseFloat(btn?.style.top) || 0) + (parseFloat(btn?.style.height) || 0) + 52, w = parseFloat(btn?.style.width) || 300;   // abaixo do link "esqueci / já tenho conta", fora do painel
    Object.assign(el.style, { position: 'absolute', left: (x - 60) + 'px', top: y + 'px', width: (w + 120) + 'px', textAlign: 'center', font: '700 15px/1.3 "Nunito Sans", system-ui, sans-serif', pointerEvents: 'none', textShadow: '0 1px 2px #000', zIndex: '5', padding: '6px 10px', borderRadius: '8px', background: '#06080dcc', display: 'none' });
    pai.appendChild(el);
  }
  el.textContent = texto; el.style.color = erro ? '#ffb3b3' : '#cfe3ff'; el.style.display = texto ? 'block' : 'none';
  return el;
}
const valor = (pop, nome) => (pop.querySelector('[data-fig="' + nome + '"] input')?.value || '').trim();
let ocupado = false;
/* ALPHA KEY (11/09): com o cadastro fechado no servidor, a caixa abre POR CIMA do formulário de cadastro e só sai quando a
   chave é aceita (o servidor confere sem gastar); quem não tem volta pro login. A chave vai junto no `criar`, e se o servidor
   recusar na hora (chave gasta por outra conta no meio do caminho) a caixa volta com o erro. A maquete não tem esse campo
   — pedido pra Amanda (rodada 25); aqui é o painel simples das telas, na paleta dela. */
let chaveAlfa = null;
async function caixaAlphaKey(pop, erroInicial = ''){
  if (!erroInicial){
    const a = await ctx.conta.alfa(); if (!a.chaveObrigatoria){ chaveAlfa = null; return; }
    if (chaveAlfa || atual !== pop) return;
  }
  if (document.getElementById('tela-alpha')) return;
  const f = painel('<b style="color:#ffe07a;font-size:16px">Alpha Key</b>'
    + '<p style="color:#98a4c0;margin:8px 0 12px">O alfa é fechado: pra criar conta você precisa da chave que recebeu. Cole ela aqui:</p>'
    + '<input id="alpha-chave" placeholder="ALPHA-XXXX-XXXX" autocapitalize="characters" autocomplete="off" spellcheck="false" style="width:100%;padding:10px;border:1px solid #2a3350;border-radius:8px;background:#151e30;color:#e8eefc;font:600 18px/1.2 ui-monospace,Consolas,monospace;letter-spacing:2px;text-align:center;box-sizing:border-box">'
    + '<div id="alpha-aviso" style="margin-top:10px;color:#f58e8e;min-height:18px"></div>'
    + '<div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="btn" id="alpha-nao">Voltar</button><button type="button" class="btn ouro" id="alpha-sim" style="flex:1">Continuar</button></div>'
    /* ONDE SE CONSEGUE UMA CHAVE (20/09): a caixa pedia "a chave que recebeu" sem dizer nunca de onde ela vem — e ela vem
       dos sorteios do Discord. Quem chegava no site sem chave batia aqui e não tinha para onde ir. */
    + '<p style="color:#7f8db0;margin:14px 0 0;font-size:13px">' + tr('Não tem uma chave?') + ' '
    + '<a class="tela-alpha-discord" href="' + DISCORD + '" target="_blank" rel="noopener noreferrer">' + LOGO_DISCORD
    + tr('Peça no nosso Discord') + '</a></p>');
  f.id = 'tela-alpha';
  const inp = f.querySelector('#alpha-chave'), botao = f.querySelector('#alpha-sim'), aviso = t => { f.querySelector('#alpha-aviso').textContent = tr(t); };
  if (erroInicial) aviso(erroInicial);
  f.querySelector('#alpha-nao').onclick = () => { f.remove(); chaveAlfa = null; mostrar('login', layout, ctx); };
  const confirmar = async () => {
    const v = inp.value.trim(); if (!v) return aviso('Cole a sua Alpha Key.');
    botao.disabled = true; const r = await ctx.conta.validarChave(v); botao.disabled = false;
    if (!r.ok) return aviso(r.erro || 'Chave inválida.');
    chaveAlfa = r.chave; f.remove();
    avisar(pop, 'Alpha Key aceita ✓ — agora crie a sua conta.');
    pop.querySelector('input')?.focus();
  };
  botao.onclick = confirmar;
  inp.addEventListener('keydown', ev => { if (ev.key === 'Enter'){ ev.preventDefault(); confirmar(); } if (ev.key === 'Escape') ev.stopImmediatePropagation(); }, true);
  setTimeout(() => inp.focus(), 50);
}

function acao(tela, a, el, pop){
  if (!ctx?.conta){                                                       // prévia (?tela=): só conta o que faria
    const aviso = t => { ctx?.Chat?.sistema?.(t); console.log('telas:', t); };
    if (a === 'login') aviso('Prévia: o login de verdade abre quando o jogo está com o servidor no ar (conta por usuário + senha).');
    else if (a === 'cadastrar') aviso('Prévia: o cadastro de verdade abre quando o jogo está com o servidor no ar.');
    else if (a === 'recuperar-senha') aviso('Prévia: recuperação de senha.');
    fechar(); return;
  }
  if (ocupado) return;
  const fim = r => {
    ocupado = false;
    if (!r?.ok && r?.precisaChave){ chaveAlfa = null; avisar(pop, ''); caixaAlphaKey(pop, r.erro || 'Precisa de uma Alpha Key.'); return; }   // a chave foi gasta no meio do caminho (ou nunca houve)
    if (!r?.ok) return avisar(pop, r?.erro || 'Não deu. Tente de novo.', true);
    const cod = ctx.conta.codigoNovo?.();                                 // cadastro: o código de recuperação aparece UMA vez, antes de entrar
    if (cod) return mostrarCodigo(cod, () => { avisar(pop, 'Entrando…'); fechar(); ctx.aoEntrar?.(r); });
    avisar(pop, 'Entrando…'); fechar(); ctx.aoEntrar?.(r);
  };
  if (a === 'login'){
    const u = valor(pop, 'campo-usuario'), s = valor(pop, 'campo-senha');
    if (!u || !s) return avisar(pop, 'Preencha usuário e senha.', true);
    ocupado = true; avisar(pop, 'Entrando…');
    ctx.conta.entrar(u, s).then(fim, e => fim({ ok: false, erro: String(e?.message || e) }));
  } else if (a === 'cadastrar'){
    const u = valor(pop, 'campo-usuario').toLowerCase(), e = valor(pop, 'campo-email'), s = valor(pop, 'campo-senha'), s2 = valor(pop, 'campo-confirmar-senha');
    if (!/^[a-z0-9_.]{3,16}$/.test(u)) return avisar(pop, 'Nome de usuário: 3 a 16 letras minúsculas, números, ponto ou _.', true);
    if (e && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e)) return avisar(pop, 'E-mail inválido (pode deixar em branco).', true);
    if (s.length < 6) return avisar(pop, 'Senha: pelo menos 6 caracteres.', true);
    if (s !== s2) return avisar(pop, 'As duas senhas não batem.', true);
    ocupado = true; avisar(pop, 'Criando a conta…');
    ctx.conta.criar(u, e, s, chaveAlfa).then(fim, err => fim({ ok: false, erro: String(err?.message || err) }));   // com a Alpha Key, se o servidor pediu
  } else if (a === 'recuperar-senha'){
    formRecuperar(pop);
  }
}
