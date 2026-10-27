/**
 * Som do jogo, com os áudios do próprio Fairy Tamer.
 *
 * Web Audio em vez de <audio>: num idle o combate dispara vários golpes por
 * segundo, e o `<audio>` engasga porque cada tag só toca uma instância. Aqui o
 * buffer é decodificado uma vez e cada disparo é um source novo, que é barato.
 *
 * O navegador só libera áudio depois de um gesto do usuário. Em vez de tentar
 * tocar e falhar em silêncio, o contexto nasce suspenso e o primeiro clique em
 * qualquer lugar o destrava — `pronto()` diz se já dá para ouvir.
 */

const BASE = './som';
const ctx = new (window.AudioContext || window.webkitAudioContext)();

const mestre = ctx.createGain();
mestre.connect(ctx.destination);
const canalSfx = ctx.createGain(); canalSfx.connect(mestre);
const canalMus = ctx.createGain(); canalMus.connect(mestre);
/* Terceiro canal, pedido da maquete da Amanda (rodada 24): SONS DA INTERFACE separados dos efeitos do mundo. Não precisou
   mexer em nenhuma chamada — o caminho do arquivo já diz o que é (`ui/...` é interface, `skill/...` e o resto é mundo). */
const canalUi = ctx.createGain(); canalUi.connect(mestre);
const daInterface = caminho => String(caminho || '').startsWith('ui/');

const CHAVE = 'campo-sul-som';
const guardado = (() => {
  try { return JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch { return {}; }
})();
let volSfx = guardado.sfx ?? 0.55;
let volMus = guardado.mus ?? 0.22;
let volUi = guardado.ui ?? 0.6;
let mudo = guardado.mudo ?? false;
let fundo = guardado.fundo ?? false;             // tocar com a aba escondida? padrão NÃO (bateria no celular)
let escondido = false;

function aplicar(){
  mestre.gain.value = (mudo || (escondido && !fundo)) ? 0 : 1;
  canalSfx.gain.value = volSfx;
  canalMus.gain.value = volMus;
  canalUi.gain.value = volUi;
  try { localStorage.setItem(CHAVE, JSON.stringify({ sfx: volSfx, mus: volMus, ui: volUi, mudo, fundo })); } catch {}
}
aplicar();
/* Com a aba escondida o áudio continuava tocando. Agora só continua se o jogador pedir (aba Som). */
try { document.addEventListener('visibilitychange', () => { escondido = document.hidden; aplicar(); }); } catch {}

/* ------------------------------------------------------------ carregamento */
const cache = new Map();     // caminho -> Promise<AudioBuffer>
function carregar(caminho){
  if (!cache.has(caminho)){
    cache.set(caminho, fetch(`${BASE}/${caminho}.ogg`)
      .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(caminho)))
      .then(b => ctx.decodeAudioData(b))
      .catch(e => { console.warn('som ausente:', caminho); return null; }));
  }
  return cache.get(caminho);
}

/** Carrega antes de precisar. Sem isso o primeiro golpe de cada tipo atrasa. */
export function preparar(caminhos){ for (const c of caminhos) carregar(c); }

/* ------------------------------------------------------------- disparo */
/* Dois freios, porque um só não basta:
   - por NOME, para o mesmo som não se empilhar sobre si mesmo;
   - GLOBAL, porque num idle há uma dúzia de selvagens batendo ao mesmo tempo, e
     mesmo sons diferentes viram uma parede de ruído. O teto global deixa passar
     os primeiros de cada janela, e quem chega depois fica de fora.
   Quem tem prioridade (`prio`) fura o teto global — é o golpe do próprio
   jogador, que nunca pode sumir no meio da bagunça. */
const ultimo = new Map();
const INTERVALO = 60;        // ms, por nome
const JANELA = 140;          // ms, do teto global
const TETO = 3;              // sons simultâneos por janela
let janelaInicio = 0, naJanela = 0;

export async function tocar(caminho, { volume = 1, tom = 1, variacao = 0.06, prio = false } = {}){
  if (mudo || !caminho) return;
  const agora = performance.now();
  if (agora - (ultimo.get(caminho) || 0) < INTERVALO) return;

  if (agora - janelaInicio > JANELA){ janelaInicio = agora; naJanela = 0; }
  if (!prio && naJanela >= TETO) return;
  naJanela++;
  ultimo.set(caminho, agora);

  const buf = await carregar(caminho);
  if (!buf || mudo) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  // variação de tom: sem isso, trinta Rattata batendo soam como um clique só
  src.playbackRate.value = tom * (1 - variacao / 2 + Math.random() * variacao);
  const g = ctx.createGain();
  g.gain.value = volume;
  src.connect(g); g.connect(daInterface(caminho) ? canalUi : canalSfx);
  src.start();
}

/* -------------------------------------------------------------- música */
/* MÚSICA (11/09): por <audio> em STREAMING, não por buffer. O caminho dos efeitos (decodificar tudo pra memória) custa
   ~35 MB por faixa de 100 s em estéreo — os 16 temas de Kanto seriam meio giga no celular. O <audio> entra no grafo pelo
   MediaElementSource e passa pelo mesmo canal de música (volume, mudo, segundo plano). Crossfade entre faixas; `loop`
   falso vira JINGLE (vitória, derrota): toca uma vez, com teto `duracaoMax` em segundos, e chama `depois`. */
let musAtual = null, musNome = null;
const acabar = (m, fade) => { if (!m) return; m.ganho.gain.setTargetAtTime(0, ctx.currentTime, Math.max(0.05, fade / 3)); setTimeout(() => { try { m.el.pause(); m.el.src = ''; m.src.disconnect(); } catch {} }, fade * 1000 + 50); };
export function musica(caminho, { fade = 1.5, loop = true, duracaoMax = 0, depois = null } = {}){
  if (!caminho){ if (musAtual){ acabar(musAtual, fade); musAtual = null; musNome = null; } return; }
  if (musNome === caminho && musAtual && !musAtual.fim) return;         // já é essa (um jingle igual não reinicia)
  if (musAtual) acabar(musAtual, fade);
  const el = new Audio(`${BASE}/${caminho}.ogg`);
  el.loop = loop; el.preload = 'auto';
  const src = ctx.createMediaElementSource(el);
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(g); g.connect(canalMus);
  const m = { el, src, ganho: g, nome: caminho, fim: !loop, depois };
  musAtual = m; musNome = caminho;
  const terminou = () => { if (musAtual !== m) return; acabar(m, 0.4); musAtual = null; musNome = null; try { m.depois?.(); } catch (e){ console.warn('música:', e); } };
  if (!loop) el.addEventListener('ended', terminou, { once: true });
  if (duracaoMax > 0) setTimeout(terminou, duracaoMax * 1000);
  el.addEventListener('error', () => { console.warn('música ausente:', caminho); if (musAtual === m){ musAtual = null; musNome = null; } }, { once: true });
  const soltar = () => el.play().then(() => { if (musAtual === m) g.gain.setTargetAtTime(1, ctx.currentTime, fade / 3); }).catch(() => {});   // sem gesto ainda: destravar() tenta de novo
  soltar(); m.soltar = soltar;
}
/** O que está tocando ('bg/sound_map1101'…) ou null. */
export const musicaAtual = () => musNome;
export function pararMusica(fade = 1){ musica(null, { fade }); }

/* ------------------------------------------------------------- controle */
export const pronto = () => ctx.state === 'running';
export function destravar(){ if (ctx.state !== 'running'){ const p = ctx.resume(); p?.then?.(() => musAtual?.soltar?.()); return p; } musAtual?.el?.paused && musAtual.soltar?.(); }   // o <audio> da música também espera o gesto
export const estado = () => ({ sfx: volSfx, mus: volMus, ui: volUi, mudo, fundo, pronto: pronto() });
export function ajustar({ sfx, mus, ui, mudo: m, fundo: f }){
  if (sfx !== undefined) volSfx = sfx;
  if (mus !== undefined) volMus = mus;
  if (ui !== undefined) volUi = ui;
  if (m !== undefined) mudo = m;
  if (f !== undefined) fundo = f;
  aplicar();
  return estado();
}

// o primeiro gesto em qualquer lugar destrava; depois disso o ouvinte sai
for (const ev of ['pointerdown', 'keydown']){
  addEventListener(ev, function uma(){
    destravar();
    for (const e of ['pointerdown', 'keydown']) removeEventListener(e, uma);
  }, { once: false });
}

/** Saída paralela do mixer para gravar o som do jogo junto com o vídeo (gravador.mjs). */
let captado = null;
export function captura(){
  if (!captado){ captado = ctx.createMediaStreamDestination(); mestre.connect(captado); }
  return captado.stream;
}
