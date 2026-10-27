/* Rede do cliente — FASE 1 (05/09/2026): presença e chat de verdade.
 * Conecta no servidor de `servidor/servidor.mjs` (WebSocket), manda a posição/animação do jogador ~10× por segundo quando
 * ela muda, e monta na cena os OUTROS jogadores do mesmo mapa (modelo do treinador com a roupa deles, nome em cima da cabeça,
 * o parceiro seguindo). O chat manda Local/Global/Trade/Help pro servidor e recebe o que os outros falam.
 * Sem servidor no ar o jogo continua igual: tenta reconectar em silêncio (2 s, 4 s… até 30 s).
 *   ?servidor=ws://host:porta  → outro servidor (padrão: ws://<host da página>:5190)
 *   ?rede=0                    → não conecta
 * O `index.html` chama `Rede.instalar(ctx)` depois do nascimento do jogador e `Rede.quadro(dt)` no fim de cada quadro.
 */
let ctx = null, ws = null, url = '', id = null, estado = 'desligado', tentativas = 0, timer = null;
const outros = new Map();                    // id → { id, nome, alvo:{x,y,z,giro}, anim, ent, par, parceiroGlb, removido }
let ultimoEnvio = { x: 0, z: 0, giro: 0, anim: '', quando: 0, area: null, px: 0, pz: 0, pg: 0, pa: '' };
let ping = { enviado: 0, ms: null };
let ultimoPar = null, ultimoUid = null, ultimaRoupa = null, ultimoTitulo = null, tAparencia = 0, ultimaMont = null;   // ultimaMont (14/09): a montaria que a sala já sabe   // ultimoUid: qual Pokémon está em campo (passo 3: o XP e o dano caem nele); ultimoTitulo: o título sob o nome (12/09)
import * as Conta from './conta.mjs';                                    // a bolsa que o servidor manda é escrita por ele (sem depender do ctx)
import * as Evento from './evento.mjs';                                  // Fase 3 do painel: multiplicadores do evento ao vivo ({t:'evento'})
export const VERSAO_REDE = 18;                                            // sobe a cada mudança de protocolo (servidor.mjs tem a dele): aba velha recebe o aviso de recarregar      // o que os outros sabem do MEU parceiro/roupa (troca do inicial, Shift+Z, evolução, ✎ Personagem)

export function instalar(c){
  ctx = c;
  const p = new URLSearchParams(location.search);
  if (p.get('rede') === '0') return;
  url = p.get('servidor') || (location.protocol === 'https:' ? 'wss://' + location.host + '/servidor' : 'ws://' + location.hostname + ':5190');   // no site (HTTPS) o servidor fica atrás de /servidor no mesmo host (12/09); local segue :5190
  conectar();
}
export const estadoRede = () => ({ estado, id, url, outros: outros.size, ping: ping.ms });
let soloWilds = false;                                                       // servidor dev local: os selvagens nascem no aparelho (sem servidor de mundo)
export const selvagensDoAparelho = () => soloWilds && estado === 'ligado';  // aí a captura de selvagem local vale, e quem registra o Pokémon é o servidor (posse_capturar)
export const outroPor = id => outros.get(id) || null;                       // a entidade de outro jogador (a bola dele sai da mão dele)
export const listaOutros = () => [...outros.values()].map(o => ({ id: o.id, nome: o.nome, x: o.ent?.x, z: o.ent?.z, anim: o.anim, pronto: !!o.ent, parceiro: o.parceiroGlb, montaria: o.mont?.glb || null, montariaPedida: o.montaria || null, alturaPar: o.par?.altura, escalaPar: o.par?.pivo.scale.x, px: o.par?.x, pz: o.par?.z, pgiro: o.par?.giro }));

function conectar(){
  if (!url || ws) return;
  estado = 'conectando';
  let s;
  try { s = new WebSocket(url); } catch { agendar(); return; }
  ws = s;
  s.onopen = () => { estado = 'ligado'; tentativas = 0; entrar(); };
  s.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch { return; } receber(m); };
  s.onerror = () => {};
  s.onclose = () => {
    const estava = estado === 'ligado';
    ws = null; id = null; estado = 'desligado';
    if (desligado){ for (const o of [...outros.values()]) remover(o); ctx.mundo?.desligar(); return; }   // saiu de propósito: não reconecta
    for (const o of [...outros.values()]) remover(o);
    ctx.mundo?.desligar();                                              // os selvagens da rede viram locais até reconectar
    /* A VAGA DA BATALHA MORRE COM O SOCKET (revisão de 20/09): desde que o segundo pedido passou a ser recusado com `ocupado`
       (em vez de tomar a vaga do primeiro), uma vaga presa TRANCA a batalha. A jogada que estava no ar quando a conexão caiu
       nunca é respondida, e a vaga só se soltava sozinha 12 s depois: nesse meio-tempo o jogo já reconectou, o jogador volta
       no treinador e o `bat_desafiar` leva "espere a resposta da jogada anterior" — a luta simplesmente não abre. */
    largarBatalha('a conexão caiu no meio da jogada');
    if (estava) ctx.Chat?.sistema('A conexão com o servidor caiu. Tentando de novo…');
    agendar();
  };
}
function agendar(){ if (desligado) return; clearTimeout(timer); const espera = Math.min(30000, 2000 * Math.pow(2, tentativas++)); timer = setTimeout(conectar, espera); }
/* A conta entrou em outro aparelho (10/09): o servidor manda `saia` e daqui em diante NÃO se reconecta — senão os dois
   aparelhos ficam se derrubando em revezamento, cada um gravando o seu save por cima do outro. */
let desligado = false;
export const foiDesligado = () => desligado;
export function enviar(obj){ if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); return true; } catch {} } return false; }   // devolve se FOI (passo 6: a conta segura o que não foi)   // exportado: o mundo compartilhado (mundo.mjs) manda por aqui
function entrar(){
  const a = ctx.jogo?.ash;
  if (!a){ setTimeout(entrar, 500); return; }
  const pk = ctx.jogo.semParceiro ? null : ctx.jogo.pika;              // jogo novo: sem Pokémon até o Carvalho
  enviar({ t: 'entrar', token: ctx.token?.() || null, nome: ctx.nomeJogador(), mapa: ctx.mapa, chegada: ctx.chegada?.() || null, area: ctx.area?.() || null, x: +a.x.toFixed(2), y: +a.y.toFixed(2), z: +a.z.toFixed(2), giro: +(a.giro || 0).toFixed(3),
           anim: a.anim || 'Idle', personagem: ctx.Personagem?.ler?.() || null, parceiro: pk?.glb || null, shiny: !!pk?.shiny, uid: ctx.uidParceiro?.() ?? null, montaria: ctx.jogo?.montaria?.glb || null, titulo: ctx.tituloAtual?.() || '', versao: VERSAO_REDE,
           ...(pk ? { px: +pk.x.toFixed(2), pz: +pk.z.toFixed(2), pg: +(pk.giro || 0).toFixed(3), pa: pk.anim || 'Idle' } : {}) });   // onde o parceiro está DE VERDADE (os outros o desenhavam numa formação fixa)
  ping.enviado = performance.now(); enviar({ t: 'ping', hora: Date.now() });
}

function receber(m){
  /* PASSE DE PROGRESSO (fase 2, 19/09): o servidor manda `{t:'passe'}` ANTES da mensagem que faz baixar um modelo ou uma cena
     (bemvindo, selvagem, parceiro, bat…). Grava o cookie aqui, síncrono e antes de tudo: a próxima mensagem já encontra o passe. */
  if (m.t === 'passe'){ Conta.gravarPasse(m); return; }
  if (m.bolsa) Conta.aplicarBolsa(m.bolsa);
  if (m.pago?.bolsa) Conta.aplicarBolsa(m.pago.bolsa);                    // 12/09: a recompensa de missão (`missao` → `pago.bolsa`) vinha aninhada e nunca era aplicada — o novato terminava a 1ª missão sem as 5 Pokébolas até relogar
  if ((m.vidas || m.vida) && m.t !== 'bat' && !(m.t === 'pdano' && m.alvo !== id)) ctx.vidas?.(m.vidas || [m.vida]);   // pdano de OUTRO jogador nunca mexe na minha ficha (13/09: uid é por conta — o "1" dele é o meu inicial)   // passo 3: nível/XP/HP que o servidor acabou de mexer. `bat` fica de fora (12/09): o HP final chegava ANTES dos lances serem animados e o meu golpe era pulado ("atacante com hp 0"); a rodada aplica no fim                              // dinheiro/itens/bolas/insígnias do servidor viajam em várias mensagens (bolsa, posse, scapt)
  switch (m.t){
    case 'bemvindo':
      id = m.id;
      ctx.conta?.entrouNoMundo?.();                                        // a trava de jogo agora é nossa: um 409 daqui em diante é conflito de verdade
      for (const j of m.jogadores || []) adicionar(j);
      soloWilds = !!m.soloWilds;
      if (!m.soloWilds) ctx.mundo?.ligar(m.id, m.selvagens || []);       // fase 3a: selvagens da sala (servidor de mundo). O dev local manda soloWilds → o cliente nasce os selvagens sozinho (index), com batalha/captura locais
      ctx.Chat?.sistema('Conectado ao servidor' + (m.conta ? ' como ' + m.conta : '') + ': ' + (m.online || 1) + ' online, ' + ((m.jogadores || []).length + 1) + ' neste mapa.');
      /* JOGO ATUALIZADO (10/09): o cliente se atualiza sozinho, como um MMO faz — antes ele só pedia "recarregue a
         página", e quem estivesse jogando ficava com uma versão velha falando com o servidor novo. Recarrega UMA vez por
         versão (o carimbo no sessionStorage evita laço se o arquivo servido continuar velho, por cache ou deploy pela metade). */
      if (m.versao && m.versao > VERSAO_REDE){
        /* Falha FECHADA: se o sessionStorage não grava (dados do site bloqueados, cota estourada, aba restaurada), a gente
           NÃO recarrega — senão recarregaria pra sempre, que é justamente o "problema repetidamente" do celular. */
        let jaTentou = true;
        try { jaTentou = sessionStorage.getItem('versao.tentou') === String(m.versao); sessionStorage.setItem('versao.tentou', String(m.versao)); } catch { jaTentou = true; }
        if (jaTentou) ctx.Chat?.sistema('⚠ O jogo foi atualizado no servidor. Feche e abra a página pra pegar a versão nova.');
        else { desligado = true; clearTimeout(timer); import('./telas.mjs').then(T => T.atualizando()).catch(() => {}); setTimeout(() => { try { window.__telaCheia?.lembrar(); } catch {} location.reload(); }, 1400); }
      }
      return;
    case 'entrou': adicionar(m.jogador); return;
    case 'saiu': { const o = outros.get(m.id); if (o) remover(o); return; }
    case 'pos': { const o = outros.get(m.id); if (!o) return; o.alvo = { x: m.x, y: m.y, z: m.z, giro: m.giro || 0 }; o.anim = m.anim || 'Idle'; o.quandoPos = performance.now(); if (m.px != null) o.alvoPar = { x: m.px, z: m.pz, giro: m.pg || 0, anim: m.pa || 'Idle', quando: performance.now() }; return; }
    case 'parceiro': { const o = outros.get(m.id); if (!o) return; o.parceiroGlb = m.parceiro || null; o.pshiny = !!m.pshiny; o.montaria = m.montaria || null; if (o.ent) montarParceiro(o).then(() => montarMontariaOutro(o)).catch(e => console.warn('rede: parceiro novo de ' + o.nome, e)); return; }   // ele trocou de seguidor (inicial, Shift+Z, evolução)
    case 'personagem': { const o = outros.get(m.id); if (!o) return; const ap = o.alvoPar; const j = { id: o.id, nome: o.nome, cargo: o.cargo, titulo: o.titulo, x: o.ent?.x ?? o.alvo.x, y: o.alvo.y, z: o.ent?.z ?? o.alvo.z, giro: o.ent?.giro ?? o.alvo.giro, anim: o.anim, parceiro: o.parceiroGlb, montaria: o.montaria, personagem: m.personagem, ...(ap ? { px: o.par?.x ?? ap.x, pz: o.par?.z ?? ap.z, pg: ap.giro, pa: ap.anim } : {}) }; remover(o); adicionar(j); return; }   // trocou a roupa/skin: remonta (o parceiro fica onde estava; cargo/título seguem junto)
    case 'titulo': { const o = outros.get(m.id); if (!o) return; o.titulo = m.titulo || ''; etiquetar(o); return; }   // mudou o título sob o nome (12/09)
    case 'saia': {                                                       // a conta entrou de outro lugar: este aqui acabou
      desligado = true; clearTimeout(timer);
      ctx.conta?.pararSync?.();                                          // para de gravar, calado (quem explica é a tela)
      import('./telas.mjs').then(T => T.derrubado(m.texto)).catch(() => alert(m.texto || 'Você entrou de outro lugar.'));
      try { ws?.close(); } catch {}
      return;
    }
    case 'save': ctx.conta?.saveDoServidor?.(m.save, m.rev); return;   // passo 6: o servidor montou o save de novo (arranjo corrigido): vale o dele
    case 'chat': ctx.Chat?.publicar(m.canal, m.texto, m.de?.nome || '?', m.de?.cargo || null); return;
    case 'sistema': ctx.Chat?.sistema(m.texto); return;
    case 'invasao': ctx.invasao?.(m.texto); return;                      // INVASÃO (15/09): letreiro passante branco no topo, além do chat
    case 'evento': { const txt = Evento.doServidor(m); if (txt) ctx.Chat?.sistema(txt); return; }   // Fase 3 do painel: EXP/shiny/densidade do evento ao vivo
    case 'elite': ctx.elite?.(m); return;                                // ELITE FOUR (20/09): retrato da corrida (quem já caiu, se ela zerou) — só pra mostrar
    case 'pong': ping.ms = Math.round(performance.now() - ping.enviado); return;
    case 'volta': ctx.volta?.(m); return;                                // 18/09: entrada vetada pelo servidor (cena/chegada não batem com onde a conta parou) — recarrega na cena de antes
    case 'porta_ok': { const e = portaEsperando; if (e && (e.chegada == null || +m.chegada === +e.chegada)){ portaEsperando = null; clearTimeout(e.timer); e.resolve(!!m.ok); } return; }   // resposta à intenção `porta` (passe da cena de destino)
    case 'dm': case 'social': ctx.social?.(m); return;                   // fase 2b: mensagem direta / convite de amizade (menus.mjs)
    case 'selvagem': case 'spos': case 'shp': case 'dono': case 'sestado': case 'scapt': case 'sumiu': case 'pdano': case 'xp': ctx.mundo?.receber(m); return;
    case 'raid': case 'raid_ir': case 'raid_voltar': case 'raid_fim':        // RAID AO VIVO (14/09, protocolo 15): estado da fila/luta, ida e volta da arena, prêmio (raid.mjs)
      if (m.t === 'raid_fim' && m.save) ctx.conta?.saveDoServidor?.(m.save, m.rev);   // o Mew do prêmio entra no time pelo save montado no servidor (bolsa e vidas já foram aplicadas no topo)
      ctx.raid?.receber?.(m); return;
    case 'troca_convite': case 'troca_convidou': case 'troca_recusou': case 'troca_abriu': case 'troca_estado':
    case 'troca_salvar': case 'troca_feita': case 'troca_cancelou': ctx.troca?.receber(m); return;   // fase 4: mesa de troca (troca.mjs)
    case 'posse': case 'posse_erro': {                                   // posse dos Pokémon: resposta do servidor a um pedirPosse
      const pend = posseEsperando.get(m.op); if (!pend) return;
      posseEsperando.delete(m.op); clearTimeout(pend.timer);
      pend.resolve(m.t === 'posse' ? m : { erro: m.erro || 'recusado' });
      return;
    }
    case 'mod': case 'mod_erro': {                                       // moderação (08/09): a resposta vai pro chat de Sistema
      const C = ctx.Chat;
      if (m.t === 'mod_erro') return C?.sistema('⚠ ' + (m.erro || 'não deu') + '.');
      if (m.op === 'online'){
        const l = m.lista || [];
        C?.sistema('👥 ' + l.length + ' online: ' + (l.map(x => x.nome + (x.conta ? ' (' + x.conta + ')' : ' [visitante]') + (x.gm ? ' ★' : '') + (x.mudo ? ' 🔇' : '') + ' · ' + (x.area || x.mapa)).join(' | ') || 'ninguém'));
      } else if (m.op === 'ver'){
        const q = m.banidoAte === -1 ? 'banido pra sempre' : m.banidoAte ? 'banido até ' + new Date(m.banidoAte).toLocaleString('pt-BR') : (m.mudoAte ? 'de mudo até ' + new Date(m.mudoAte).toLocaleTimeString('pt-BR') : 'sem nada');
        C?.sistema('🔎 ' + m.usuario + (m.gm ? ' ★GM' : '') + ': ' + q + (m.motivo ? ' — ' + m.motivo : ''));
      } else if (m.op === 'aviso') C?.sistema('📢 aviso enviado.');
      else if (m.op === 'mudo') C?.sistema('🔇 ' + m.usuario + ' silenciado por ' + m.minutos + ' min.');
      else if (m.op === 'kick') C?.sistema('⛔ ' + m.usuario + ' foi tirado (' + (m.derrubou || 0) + ' conexão).');
      else if (m.op === 'banir') C?.sistema('⛔ ' + m.usuario + ' banido ' + (m.ate === -1 ? 'pra sempre' : 'até ' + new Date(m.ate).toLocaleString('pt-BR')) + '.');
      else if (m.op === 'perdoar') C?.sistema('✅ ' + m.usuario + ' liberado.');
      else if (m.op === 'tp') C?.sistema('🧭 ' + m.usuario + ' levado pra ' + (m.nome || m.mapa) + ' (' + m.x + ', ' + m.z + ')' + (m.derrubou ? ' — a cena dele já está recarregando lá.' : ' — nasce lá na próxima entrada.'));
      else if (m.op === 'puxar') C?.sistema('🧲 ' + m.usuario + ' puxado até você' + (m.derrubou ? ' — a cena dele já está recarregando aqui.' : ' — está offline: nasce do seu lado na próxima entrada.'));
      else if (m.op === 'ir'){                                           // Fase 3: /ir nome — no mesmo mapa, teleporta; noutro, o servidor manda `volta` (recarrega lá)
        C?.sistema('🧭 Indo até ' + m.usuario + ' (' + m.mapa + ', ' + m.x + ', ' + m.z + ').');
        if (m.mesmoMapa) ctx.teleportar?.(+m.x, +m.z);
      }
      return;
    }
    case 'missao': case 'missao_erro': {                                 // passo 5: o servidor conferiu um passo (ou recusou)
      if (m.estado) ctx.missao?.(m);
      else if (m.erro) ctx.Chat?.sistema('⚠ ' + m.erro + '.');
      return;
    }
    case 'bat': case 'bat_erro': {                                       // batalha por turnos conduzida pelo servidor (passo 4)
      const pend = batEsperando; if (!pend) return;
      batEsperando = null; clearTimeout(pend.timer);
      pend.resolve(m.t === 'bat' ? m : { erro: m.erro || 'recusado', codigo: m.codigo || null, vez: m.vez ?? null });   // 17/09: 'vencido' = treinador já vencido (o index marca o ✔); `vez` (20/09) = o turno de agora, na recusa por turno vencido
      return;
    }
    case 'vida': case 'vida_erro': {                                     // resposta da cura completa
      const pend = vidaEsperando; if (!pend) return;
      vidaEsperando = null; clearTimeout(pend.timer);
      pend.resolve(m.t === 'vida' ? m : { erro: m.erro || 'recusado' });
      return;
    }
    case 'bolsa': case 'bolsa_erro': {                                   // bolsa: dinheiro/itens/bolas/insígnias (o retrato vem junto)
      const pend = bolsaEsperando.get(m.op); if (!pend) return;
      bolsaEsperando.delete(m.op); clearTimeout(pend.timer);
      pend.resolve(m.t === 'bolsa' ? m : { erro: m.erro || 'recusado' });
      return;
    }   // fase 3a: mundo compartilhado (mundo.mjs)
    default: return;
  }
}
/** O que o chat manda (chat.mjs chama via ctx.rede): o texto já foi publicado localmente. */
/* POSSE dos Pokémon (o servidor é o dono desde 06/09): o cliente PEDE e espera a resposta. Uma operação de cada tipo por vez;
   6 s sem resposta devolve `{ erro }` e o jogo avisa em vez de inventar Pokémon que o servidor não conhece. */
const posseEsperando = new Map();                                        // op → { resolve, timer }
export function pedirPosse(op, dados = {}){
  if (!ws || ws.readyState !== 1) return Promise.resolve({ erro: 'sem conexão com o servidor' });
  const antigo = posseEsperando.get(op); if (antigo){ clearTimeout(antigo.timer); antigo.resolve({ erro: 'pedido repetido' }); posseEsperando.delete(op); }
  return new Promise(resolve => {
    const timer = setTimeout(() => { posseEsperando.delete(op); resolve({ erro: 'o servidor não respondeu' }); }, 6000);
    posseEsperando.set(op, { resolve, timer });
    enviar({ t: 'posse_' + op, ...dados });
  });
}
/* BOLSA (o servidor é o dono desde 07/09): usar item, recompensa de missão, prêmio de ginásio/treinador. A resposta traz o
   retrato inteiro da bolsa, que o `conta.mjs` escreve no aparelho. */
const bolsaEsperando = new Map();
export function pedirBolsa(op, dados = {}){
  if (!ws || ws.readyState !== 1) return Promise.resolve({ erro: 'sem conexão com o servidor' });
  const antigo = bolsaEsperando.get(op); if (antigo){ clearTimeout(antigo.timer); antigo.resolve({ erro: 'pedido repetido' }); bolsaEsperando.delete(op); }
  return new Promise(resolve => {
    const timer = setTimeout(() => { bolsaEsperando.delete(op); resolve({ erro: 'o servidor não respondeu' }); }, 6000);
    bolsaEsperando.set(op, { resolve, timer });
    enviar({ t: 'bolsa_' + op, ...dados });
  });
}
/* VIDA (passo 3): a cura completa é pedida ao servidor, que confere se você está no Centro Pokémon (ou se o time todo caiu). */
let vidaEsperando = null;
export function pedirVida(op = 'curar'){
  if (!ws || ws.readyState !== 1) return Promise.resolve({ erro: 'sem conexão com o servidor' });
  if (vidaEsperando){ clearTimeout(vidaEsperando.timer); vidaEsperando.resolve({ erro: 'pedido repetido' }); vidaEsperando = null; }
  return new Promise(resolve => {
    const timer = setTimeout(() => { vidaEsperando = null; resolve({ erro: 'o servidor não respondeu' }); }, 6000);
    vidaEsperando = { resolve, timer };
    enviar({ t: 'vida_' + op });
  });
}
/* BATALHA (passo 4): o servidor conduz. `desafiar` abre, `acao` joga, `sair` desiste; a resposta traz o estado e os `lances`. */
let batEsperando = null;
/** Solta a vaga de espera da batalha (a conexão caiu): quem estava esperando recebe o erro na hora, sem os 12 s do relógio. */
function largarBatalha(motivo){
  const pend = batEsperando; if (!pend) return;
  batEsperando = null; clearTimeout(pend.timer);
  pend.resolve({ erro: motivo || 'sem conexão com o servidor', codigo: 'queda' });
}
export function pedirBatalha(op, dados = {}){
  if (!ws || ws.readyState !== 1) return Promise.resolve({ erro: 'sem conexão com o servidor' });
  /* UM PEDIDO DE CADA VEZ (20/09, chaospider "A ganância do homem quebra o jogo"): quando chegava um pedido novo com outro no
     ar, o antigo era respondido com "pedido repetido" e o NOVO ia pro servidor assim mesmo — as duas mensagens chegavam lá,
     duas rodadas aconteciam e as respostas passavam a casar com o pedido errado (só existe uma vaga de espera). A partir daqui
     o segundo pedido é recusado SEM sair da máquina; só o `sair` fura a fila, porque desistir não pode ficar preso. */
  if (batEsperando && op !== 'sair') return Promise.resolve({ erro: 'espere a resposta da jogada anterior', codigo: 'ocupado' });
  if (batEsperando){ clearTimeout(batEsperando.timer); batEsperando.resolve({ erro: 'pedido repetido' }); batEsperando = null; }
  return new Promise(resolve => {
    const timer = setTimeout(() => { batEsperando = null; resolve({ erro: 'o servidor não respondeu' }); }, 12000);
    batEsperando = { resolve, timer };
    enviar({ t: 'bat_' + op, ...dados });
  });
}
/* PORTA (passe de progresso, 19/09): encostou numa porta pra uma cena que o passe ainda não cobre. Avisa o servidor (`{t:'porta'}`),
   que confere a porta e libera o destino; espera até `ms` pelo passe novo que cubra `mapa` (ou pelo `porta_ok`) e resolve de
   qualquer jeito — quem chama segue pra porta, e o boot da cena seguinte ainda tem a rede de segurança dele. */
let portaEsperando = null;
export function pedirPorta(porta, chegada, mapa, ms = 1500){
  if (!ws || ws.readyState !== 1) return Promise.resolve(false);
  if (portaEsperando){ clearTimeout(portaEsperando.timer); portaEsperando.resolve(false); portaEsperando = null; }
  return new Promise(resolve => {
    const fim = ok => { removeEventListener('passe-novo', ouvir); if (portaEsperando?.resolve === fim){ clearTimeout(portaEsperando.timer); portaEsperando = null; } resolve(ok); };
    const ouvir = () => { if (Conta.cobreCena(mapa)) fim(true); };
    addEventListener('passe-novo', ouvir);
    portaEsperando = { chegada, resolve: fim, timer: setTimeout(() => fim(false), ms) };
    enviar({ t: 'porta', porta: +porta || porta, chegada: +chegada || chegada });
  });
}
export function enviarChat(canal, texto){ if (estado === 'ligado') enviar({ t: 'chat', canal, texto }); }

/* ------------------------------------------------------------------ os outros na cena */
function adicionar(j){
  if (!j || j.id === id || outros.has(j.id)) return;
  const o = { id: j.id, nome: j.nome || 'Jogador', cargo: j.cargo || null, titulo: j.titulo || '', alvo: { x: j.x || 0, y: j.y || 0, z: j.z || 0, giro: j.giro || 0 }, anim: j.anim || 'Idle', ent: null, par: null, pshiny: !!j.pshiny, parceiroGlb: j.parceiro || null, montaria: j.montaria || null, mont: null, quandoPos: performance.now(),
    alvoPar: j.px != null ? { x: j.px, z: j.pz, giro: j.pg || 0, anim: j.pa || 'Idle', quando: performance.now() } : null };   // cargo/titulo (12/09): o `cargo` nunca era copiado pra `o` — o [STAFF]/[MOD] dos OUTROS não aparecia; agora vem junto do título
  outros.set(o.id, o);
  montar(o, j.personagem).catch(e => console.warn('rede: não montou ' + o.nome, e));
}
async function montar(o, personagem){
  const P = ctx.Personagem;
  const p = personagem || P?.PADRAO || null;
  const arq = './cenario/pc/' + (P?.glbDe?.(p) || 'Ash') + '.glb';
  const ent = await ctx.montarPersonagem(arq, null, 0);
  if (o.removido){ ctx.cena.remove(ent.pivo); return; }
  try { if (p && P?.aplicar) await P.aplicar(ent.pivo, p); } catch (e){ console.warn('rede: roupa de ' + o.nome, e); }
  const y = ctx.chaoEm?.(o.alvo.x, o.alvo.z) ?? o.alvo.y;
  ent.x = ent.vx = o.alvo.x; ent.z = ent.vz = o.alvo.z; ent.y = ent.vy = y; ent.giro = o.alvo.giro;
  ent.pivo.position.set(ent.x, ent.y, ent.z); ent.pivo.rotation.y = ent.giro;
  ctx.tocarAnim(ent, 'Idle');
  o.ent = ent;
  etiquetar(o);                                                          // plaquinha: nome + [cargo] em cima, <título> embaixo (12/09)
  await montarParceiro(o);
  await montarMontariaOutro(o);                                          // 14/09: chegou montado
}
/** (Re)desenha a plaquinha de um outro jogador: nome + [STAFF]/[MOD] em cima, <título> embaixo. Chamada ao montar e quando o título muda. */
function etiquetar(o){
  const ent = o.ent; if (!ent) return;
  if (ent.rotulo){ ent.pivo.remove(ent.rotulo); ent.rotulo.material?.map?.dispose(); ent.rotulo.material?.dispose(); }
  const eti = Conta.comCargo(o.nome, o.cargo, '#8ec5ff');                 // cargos (09/09): [STAFF]/[MOD] também na cabeça dos outros
  const rotulo = ctx.rotuloSprite(eti.texto, eti.cor, 2.0, o.titulo || '');
  rotulo.position.y = ent.altura + 0.35 + (o.titulo ? 0.16 : 0); ent.pivo.add(rotulo); ent.rotulo = rotulo;
}
/** O parceiro que anda atrás do outro jogador (monta, ou troca quando ele muda de seguidor). */
async function montarParceiro(o){
  if (o.par){ ctx.cena.remove(o.par.pivo); o.par = null; }
  const ent = o.ent; if (!ent || !o.parceiroGlb || !ctx.modeloMon || !ctx.montarCorpo || !ctx.clonar) return;
  const pedido = o.parceiroGlb;
  try {
    const glb = pedido.endsWith('.glb') ? pedido : pedido + '.glb';
    const g = await ctx.modeloMon(glb);
    if (o.removido || o.parceiroGlb !== pedido) return;                  // trocou de novo enquanto carregava
    const par = ctx.montarCorpo(g, ctx.clonar(g.scene), null, 0, glb);
    par.glb = glb; ctx.escalarSeguidor?.(par); if (o.pshiny) ctx.aplicarShinyCampo?.(par.pivo, true);   // shiny (14/09): o parceiro do outro veste a textura _1 como o seu                            // MESMA régua de tamanho do seu parceiro (proporcional/jogo/nativo): sem isto o Pikachu do outro vinha no tamanho nativo
    par.x = par.vx = ent.x - 1.1; par.z = par.vz = ent.z + 0.6; par.y = par.vy = ent.y;
    par.pivo.position.set(par.x, par.y, par.z); ctx.tocarAnim(par, 'Idle');
    if (o.par){ ctx.cena.remove(o.par.pivo); }
    o.par = par;
    o.parFalhou = false;
  } catch (e){ o.parFalhou = true; console.warn('rede: parceiro de ' + o.nome, e); }   // passe de progresso: o passe-novo tenta de novo
}
/* MONTARIA DOS OUTROS (14/09): o modelo da montaria com o corpo do outro sentado na sela — a mesma conta do montar() do index
   (montarCorpo + pontoDeSela + escala do MONTARIAS). Enquanto montado, o parceiro dele some (está na bola). */
async function montarMontariaOutro(o){
  const ent = o.ent; if (!ent) return;
  if (!o.montaria){ soltarMontariaOutro(o); return; }
  if (o.mont && o.mont.glb === o.montaria) return;
  if (!ctx.modeloMon || !ctx.montarCorpo || !ctx.clonar || !ctx.pontoDeSela) return;
  const pedido = o.montaria;
  try {
    const g = await ctx.modeloMon(pedido + '.glb');
    if (o.removido || o.montaria !== pedido || !o.ent) return;              // desmontou/trocou enquanto carregava
    soltarMontariaOutro(o);
    const def = ctx.montariaDef?.(pedido) || [pedido, pedido, 'RideIdle1', 'Ride1', true, 0.6, 25000, 'anfibia'];
    const m = ctx.montarCorpo(g, ctx.clonar(g.scene), null, 0, pedido);
    m.glb = pedido; m.poseIdle = def[2]; m.poseRun = def[3]; m.voa = def[4]; const fator = def[5] || 0.6; m.pivo.scale.setScalar(fator); m.altura *= fator;
    m.ponto = ctx.pontoDeSela(m);
    m.pivo.position.set(ent.x, ent.y, ent.z); m.pivo.rotation.y = ent.giro; ctx.cena.add(m.pivo);
    const esc = new (ent.pivo.position.constructor)(); m.pivo.updateMatrixWorld(true); m.ponto.getWorldScale(esc);
    m.ponto.add(ent.pivo); ent.pivo.position.set(0, 0, 0); ent.pivo.rotation.set(0, 0, 0); ent.pivo.scale.setScalar(1 / (esc.x || 1));
    ctx.tocarAnim(ent, m.poseIdle); ctx.soEsta?.(ent, m.poseIdle); ctx.tocarAnim(m, 'Idle');
    if (o.par) o.par.pivo.visible = false;
    o.mont = m; o.montFalhou = false;
  } catch (e){ o.montFalhou = true; console.warn('rede: montaria de ' + o.nome, e); }
}
/* O passe cresceu (liberou espécie/skin): o parceiro ou a montaria de outro jogador que a borda tinha negado monta agora.
   Numa volta SEGUINTE do laço (setTimeout 0), não aqui dentro: este ouvinte foi registrado antes do ouvinte do index que zera a lista
   de modelos negados (`glbNegados`), e o `ctx.modeloMon` é chamado de forma síncrona pelo montarParceiro — tentando já, o modelo
   ainda estaria na lista, seria recusado na hora e a nova tentativa se perdia até o passe crescer de novo. */
if (typeof addEventListener === 'function') addEventListener('passe-novo', ev => {
  if (ev?.detail && ev.detail.cresceu === false) return;
  setTimeout(remontarNegados, 0);
});
function remontarNegados(){
  for (const o of outros.values()){
    if (o.removido || !o.ent) continue;
    if (o.parFalhou && o.parceiroGlb){ o.parFalhou = false; montarParceiro(o).then(() => { if (o.par && o.mont) o.par.pivo.visible = false; }).catch(() => {}); }
    if (o.montFalhou && o.montaria){ o.montFalhou = false; montarMontariaOutro(o).catch(() => {}); }
  }
}
function soltarMontariaOutro(o){
  const m = o.mont; if (!m) return; const ent = o.ent;
  if (ent){ ctx.cena.add(ent.pivo); ent.pivo.scale.setScalar(1); ent.pivo.position.set(ent.x, ent.y, ent.z); ent.pivo.rotation.set(0, ent.giro, 0); ctx.tocarAnim(ent, 'Idle'); ctx.soEsta?.(ent, 'Idle'); }
  ctx.cena.remove(m.pivo); o.mont = null;
  if (o.par) o.par.pivo.visible = true;
}
function remover(o){
  o.removido = true;
  if (o.mont){ ctx.cena.remove(o.mont.pivo); o.mont = null; }              // 14/09: a montaria dele (o corpo está na sela: sai junto)
  if (o.ent){ ctx.cena.remove(o.ent.pivo); o.ent.rotulo?.material?.map?.dispose(); o.ent = null; }
  if (o.par){ ctx.cena.remove(o.par.pivo); o.par = null; }
  outros.delete(o.id);
}
const voltaCurta = (de, para) => { let d = para - de; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

/** Trocou de Pokémon em campo (13/09): a sala e o servidor ficam sabendo no próximo quadro, não dali a até 1 s. */
let ultimoShiny = null;                                                 // shiny do parceiro (14/09)
export function parceiroAgora(){ tAparencia = 0; }
/** Chamado no fim de cada quadro do jogo: manda a nossa posição quando muda e move os outros suavemente até a última posição recebida. */
export function quadro(dt){
  if (!ctx) return;
  const a = ctx.jogo?.ash, agora = performance.now();
  if (a && estado === 'ligado' && id != null && agora - tAparencia > 1000){   // 1× por segundo: mudou de seguidor ou de roupa? avisa a sala
    tAparencia = agora;
    const par = ctx.jogo.semParceiro ? null : (ctx.jogo.pika?.glb || null);
    const uidPar = ctx.uidParceiro?.() ?? null, mont = ctx.jogo.montaria?.glb || null, shi = !!(par && ctx.jogo.pika?.shiny);
    if (par !== ultimoPar || uidPar !== ultimoUid || mont !== ultimaMont || shi !== ultimoShiny){ if (ultimoPar !== null || par || mont) enviar({ t: 'parceiro', parceiro: par, shiny: shi, uid: uidPar, montaria: mont }); ultimoPar = par; ultimoUid = uidPar; ultimaMont = mont; ultimoShiny = shi; }   // shiny (14/09): o parceiro do outro monta com a textura shiny   // montaria (14/09): montou/desmontou → a sala sabe
    let roupa = null; try { roupa = JSON.stringify(ctx.Personagem?.ler?.() || null); } catch {}
    if (roupa !== ultimaRoupa){ if (ultimaRoupa !== null) enviar({ t: 'personagem', personagem: ctx.Personagem?.ler?.() || null }); ultimaRoupa = roupa; }
    const tit = ctx.tituloAtual?.() || '';                               // título sob o nome (12/09): ganhou um, ou trocou de idioma → a sala reescreve a plaquinha
    if (tit !== ultimoTitulo){ if (ultimoTitulo !== null) enviar({ t: 'titulo', titulo: tit }); ultimoTitulo = tit; }
  }
  if (a && estado === 'ligado' && id != null){
    const anim = a.anim || 'Idle', giro = a.giro || 0, pk = ctx.jogo.semParceiro ? null : ctx.jogo.pika;
    const px = pk ? pk.x : 0, pz = pk ? pk.z : 0, pg = pk ? (pk.giro || 0) : 0, pa = pk ? (pk.anim || 'Idle') : '';
    const mudou = Math.hypot(a.x - ultimoEnvio.x, a.z - ultimoEnvio.z) > 0.02 || Math.abs(giro - ultimoEnvio.giro) > 0.005 || anim !== ultimoEnvio.anim
      || Math.hypot(px - ultimoEnvio.px, pz - ultimoEnvio.pz) > 0.05 || Math.abs(pg - ultimoEnvio.pg) > 0.02 || pa !== ultimoEnvio.pa;   // o parceiro também conta (os outros o veem onde ele está)
    const area = ctx.area?.() || null;
    if ((mudou && agora - ultimoEnvio.quando > 90) || agora - ultimoEnvio.quando > 4000 || area !== ultimoEnvio.area){
      enviar({ t: 'pos', x: +a.x.toFixed(2), y: +a.y.toFixed(2), z: +a.z.toFixed(2), giro: +giro.toFixed(3), anim, ...(area !== ultimoEnvio.area ? { area } : {}),
        ...(pk ? { px: +px.toFixed(2), pz: +pz.toFixed(2), pg: +pg.toFixed(3), pa } : {}) });
      ultimoEnvio = { x: a.x, z: a.z, giro, anim, quando: agora, area, px, pz, pg, pa };
    }
  }
  for (const o of outros.values()){
    const e = o.ent; if (!e) continue;
    const longe = Math.hypot(o.alvo.x - e.x, o.alvo.z - e.z);
    if (longe > 12){ e.x = o.alvo.x; e.z = o.alvo.z; }                    // teleporte: não atravessa o mapa correndo
    else { const k = 1 - Math.exp(-dt / 0.11); e.x += (o.alvo.x - e.x) * k; e.z += (o.alvo.z - e.z) * k; }
    e.y = o.mont?.voa ? o.alvo.y : (ctx.chaoEm?.(e.x, e.z) ?? o.alvo.y);   // voando (Lugia): a altura é a que ele mandou
    e.giro += voltaCurta(e.giro, o.alvo.giro) * (1 - Math.exp(-dt / 0.08));
    const parado = longe < 0.03 && agora - o.quandoPos > 250;
    if (o.mont){                                                           // 14/09: montado — quem anda é a montaria; o corpo está na sela (filho do ponto)
      const m = o.mont; m.pivo.position.set(e.x, e.y, e.z); m.pivo.rotation.y = e.giro;
      ctx.tocarAnim(m, parado ? 'Idle' : (m.acoes?.has('Run') ? 'Run' : 'Idle')); m.mix?.update(dt);
      ctx.tocarAnim(e, parado ? m.poseIdle : (e.acoes?.has(m.poseRun) ? m.poseRun : m.poseIdle)); e.mix?.update(dt);
      continue;                                                            // o parceiro dele está na bola
    }
    e.pivo.position.set(e.x, e.y, e.z); e.pivo.rotation.y = e.giro;
    ctx.tocarAnim(e, parado ? 'Idle' : (e.acoes?.has(o.anim) ? o.anim : 'Run'));
    e.mix?.update(dt);
    const p = o.par;
    if (p) p.travaAnim = Math.max(0, (p.travaAnim || 0) - dt);            // o "Wound" (tocarUma) do golpe que ele levou segura a troca só pela duração do clipe (3c)
    if (p && o.alvoPar){                                                 // o parceiro vai pra onde ele está DE VERDADE na tela do dono
      const ap = o.alvoPar, d = Math.hypot(ap.x - p.x, ap.z - p.z);
      if (d > 12){ p.x = ap.x; p.z = ap.z; }
      else if (d > 0.01){ const k = 1 - Math.exp(-dt / 0.11); p.x += (ap.x - p.x) * k; p.z += (ap.z - p.z) * k; }
      p.giro = (p.giro || 0) + voltaCurta(p.giro || 0, ap.giro) * (1 - Math.exp(-dt / 0.08));
      p.y = ctx.chaoEm?.(p.x, p.z) ?? e.y;
      p.pivo.position.set(p.x, p.y, p.z); p.vx = p.x; p.vy = p.y; p.vz = p.z; p.pivo.rotation.y = p.giro;
      const paradoP = d < 0.03 && agora - ap.quando > 250;
      ctx.tocarAnim(p, paradoP ? 'Idle' : (p.acoes?.has(ap.anim) ? ap.anim : 'Run')); p.mix?.update(dt);
    } else if (p){                                                       // cliente antigo sem posição do parceiro: anda atrás, um pouco de lado
      const ax = e.x - Math.sin(e.giro) * 1.1 + Math.cos(e.giro) * 0.5, az = e.z - Math.cos(e.giro) * 1.1 - Math.sin(e.giro) * 0.5;
      const d = Math.hypot(ax - p.x, az - p.z);
      if (d > 10){ p.x = ax; p.z = az; }
      else if (d > 0.25){ const k = 1 - Math.exp(-dt / 0.18); p.x += (ax - p.x) * k; p.z += (az - p.z) * k; p.giro = Math.atan2(ax - p.x, az - p.z); }
      p.y = ctx.chaoEm?.(p.x, p.z) ?? e.y;
      p.pivo.position.set(p.x, p.y, p.z); p.vx = p.x; p.vy = p.y; p.vz = p.z; p.pivo.rotation.y = p.giro || e.giro;
      ctx.tocarAnim(p, d > 0.3 ? 'Run' : 'Idle'); p.mix?.update(dt);
    }
  }
}
