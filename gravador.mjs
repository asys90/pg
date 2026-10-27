/**
 * Gravador de vídeo da página: botão 🎥 (ou R) → arrasta um retângulo na tela
 * → "● Gravar" → joga → "■ Parar" (ou R) → o arquivo cai em Downloads.
 *
 * Captura a própria aba (getDisplayMedia + Region Capture) e recorta no
 * retângulo: entra tudo que está na tela, inclusive os rótulos em HTML e o som
 * do jogo — o Chrome pede uma vez "compartilhar esta aba". Onde não há captura
 * de aba (ou com `forcarCanvas`), copia o recorte do canvas WebGL: sem rótulos.
 *
 *   import * as Gravador from './gravador.mjs';
 *   Gravador.instalar({ tela, prefixo: 'kanto', audio: () => stream });
 *   … no laço, logo depois do render:  Gravador.quadro();
 */
const CSS = `
#grav-botao{position:fixed;right:12px;top:12px;z-index:30;padding:7px 12px;border:1px solid #b47622;border-radius:6px;background:linear-gradient(#342317,#10131b);color:#ffe6b0;font:12px/1.4 "Segoe UI",Arial,sans-serif;cursor:pointer;box-shadow:0 8px 18px #000a}
#grav-botao b{display:inline-block;padding:0 5px;margin-left:6px;border:1px solid #b47622;border-radius:3px;font-family:ui-monospace,Consolas,monospace}
#grav-botao.gravando{border-color:#ff5f5f;color:#ffd9d9;background:linear-gradient(#4a1414,#10131b)}
#grav-botao.gravando::before{content:"";display:inline-block;width:8px;height:8px;margin-right:7px;border-radius:50%;background:#ff3b3b;animation:grav-pisca 1s steps(2) infinite}
@keyframes grav-pisca{to{opacity:.2}}
#grav-sel{position:fixed;inset:0;z-index:25;cursor:crosshair;touch-action:none;background:rgba(0,0,0,.3)}
#grav-sel.marcado{background:transparent;cursor:default}
#grav-dica{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:27;padding:6px 12px;border:1px solid #314361;border-radius:6px;background:#101624f2;color:#d6e2ff;font:12px/1.4 "Segoe UI",Arial,sans-serif;pointer-events:none;white-space:nowrap}
#grav-dica b{display:inline-block;padding:0 4px;border:1px solid #314361;border-radius:3px;font-family:ui-monospace,Consolas,monospace}
#grav-caixa{position:fixed;z-index:26;outline:2px dashed #ff5f5f;pointer-events:none;display:none}
#grav-caixa.escolhendo{display:block;box-shadow:0 0 0 100vmax rgba(0,0,0,.45)}
#grav-caixa.gravando{display:block;outline:2px solid #ff3b3bcc}
#grav-menu{position:fixed;z-index:28;display:none;gap:6px;padding:6px;border:1px solid #314361;border-radius:6px;background:#101624f2;font:12px/1.4 "Segoe UI",Arial,sans-serif;white-space:nowrap}
#grav-menu button{padding:6px 12px;border:1px solid #b47622;border-radius:6px;background:linear-gradient(#342317,#10131b);color:#ffe6b0;font:inherit;cursor:pointer}
#grav-menu button.rec{border-color:#ff5f5f;color:#ffd9d9;background:linear-gradient(#4a1414,#10131b)}
#grav-aviso{position:fixed;left:50%;bottom:70px;transform:translateX(-50%);z-index:29;padding:6px 12px;border:1px solid #314361;border-radius:6px;background:#101624f2;color:#ffe07a;font:12px/1.4 "Segoe UI",Arial,sans-serif;pointer-events:none;white-space:nowrap;opacity:0;transition:opacity .3s}
`;
/* Codec. MP4 (H.264) quando o navegador souber gravar — abre em qualquer lugar; senão WebM.
   Com a aceleração da GPU ligada o Chrome 150 grava H.264 pelo NVENC: o perfil **Baseline**
   (42E01E) sai certo; o **High** (640028) sai CORROMPIDO — 712 erros de decodificação em 30 s,
   quadro vira faixas de cor (o "tudo borrado" de 28/08), e ainda estoura 69 Mbps ignorando o
   pedido. Por isso High fica fora da lista; `?codec=webm` força VP9 (software) e `?codec=high`
   só serve pra reproduzir o defeito. */
/* Medido em 28/08 (Chrome 150, RTX 3070): o H.264 do NVENC via MediaRecorder sai LIMPO só com
   bitrate baixo (os vídeos de 27/08, 8 Mbps pedidos → 2–4 reais, 0 erros). Pedindo 60 Mbps —
   Baseline ou High — o arquivo sai com slices truncadas ("bytestream -20", 470 erros em 8 s),
   quadro vira faixas de cor: é o "tudo borrado". VP9 é software (libvpx), aceita qualquer
   bitrate e sai nítido; por isso WebM/VP9 é o padrão e MP4 fica em `?codec=mp4`, com teto
   seguro de 10 Mbps (`?codec=high` reproduz o defeito do High). */
const TIPOS = [
  'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8,opus', 'video/webm',
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"', 'video/mp4;codecs="avc1.42E01E,opus"', 'video/mp4;codecs=avc1', 'video/mp4',
];
function escolherTipo(){
  const q = new URLSearchParams(location.search).get('codec');
  const lista = q === 'webm' ? TIPOS.filter(t => t.startsWith('video/webm'))
    : q === 'high' ? ['video/mp4;codecs="avc1.640028,opus"', 'video/mp4;codecs=avc1.640028']
    : q === 'mp4' ? TIPOS.filter(t => t.startsWith('video/mp4')) : TIPOS;
  return lista.find(t => MediaRecorder.isTypeSupported(t)) || '';
}
/* Bitrate pelo RECORTE gravado (o track ainda informa a aba inteira depois do cropTo):
   ~0,15 bit por pixel por quadro — 1090×640 a 60 fps ≈ 6 Mbps, piso 8, teto 20. O VP9 do
   Chrome pode passar do pedido, mas com 40 Mbps de alvo ele foi a 74 e o arquivo de 30 s deu
   300 MB; pra compartilhar, 8–12 Mbps nessa resolução já é nítido. No H.264 da GPU o teto é
   10 Mbps: acima disso o encoder corrompe. */
function bitrate(track, tipo){
  const s = track?.getSettings?.() || {};
  const k = devicePixelRatio || 1;
  const w = ret ? ret.w * k : (s.width || 1920), h = ret ? ret.h * k : (s.height || 1080), fps = s.frameRate || 30;
  const alvo = w * h * fps * 0.15;
  return Math.round(/mp4/.test(tipo) ? Math.min(10e6, Math.max(6e6, alvo)) : Math.min(20e6, Math.max(8e6, alvo)));
}

let estado = 'parado';                 // parado | escolhendo | pronto | gravando | parando
let ret = null;                        // retângulo escolhido, em px de CSS
let modo = 'aba';                      // aba (Region Capture) | canvas
const cfg = { tela: null, tecla: 'KeyR', prefixo: 'video', audio: null, forcarCanvas: false };
let rec = null, partes = [], stream = null, tipo = '', bps = 0, t0 = 0, relogio = 0, copiar = null, avisoT = 0;
const ui = {};
const criar = (tag, id, pai = document.body) => { const el = document.createElement(tag); el.id = id; pai.appendChild(el); return el; };

export function instalar({ pai = null, ...opcoes } = {}){
  Object.assign(cfg, opcoes);
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  ui.botao = criar('button', 'grav-botao', pai || document.body); ui.botao.type = 'button';
  if (pai) ui.botao.style.position = 'static';           // dentro de uma barra da página, não fixo no canto
  ui.caixa = criar('div', 'grav-caixa');
  ui.menu = criar('div', 'grav-menu');
  ui.menu.innerHTML = '<button class="rec" data-acao="gravar">● Gravar</button><button data-acao="refazer">↺ Refazer</button><button data-acao="cancelar">✕</button>';
  ui.aviso = criar('div', 'grav-aviso');
  ui.botao.addEventListener('click', () => { ui.botao.blur(); alternar(); });
  ui.menu.addEventListener('click', e => {
    const a = e.target.dataset.acao;
    if (a === 'gravar') gravar(); else if (a === 'refazer') escolher(); else if (a === 'cancelar') cancelar();
  });
  addEventListener('keydown', e => {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.code === cfg.tecla && !e.repeat) alternar();
    if (estado === 'escolhendo' && e.code === 'Enter'){ ret = { x: 0, y: 0, w: innerWidth, h: innerHeight }; pronto(); }
    if ((estado === 'escolhendo' || estado === 'pronto') && e.code === 'Escape') cancelar();
  });
  pintarBotao();
}

/** Chame logo depois do render: no modo canvas copia o recorte para o vídeo. */
export function quadro(){ if (copiar && estado === 'gravando') copiar(); }
export const gravando = () => estado === 'gravando';

function alternar(){
  if (estado === 'gravando') parar();
  else if (estado === 'parado') escolher();
  else if (estado !== 'parando') cancelar();
}

function escolher(){
  cancelar();
  estado = 'escolhendo'; ret = null;
  ui.sel = criar('div', 'grav-sel');
  ui.dica = criar('div', 'grav-dica');
  ui.dica.innerHTML = 'Arraste para marcar a área do vídeo · <b>Enter</b> tela inteira · <b>Esc</b> cancelar';
  ui.caixa.className = '';
  let inicio = null;
  const norm = e => {
    const x0 = Math.max(0, Math.min(inicio.x, e.clientX)), y0 = Math.max(0, Math.min(inicio.y, e.clientY));
    const x1 = Math.min(innerWidth, Math.max(inicio.x, e.clientX)), y1 = Math.min(innerHeight, Math.max(inicio.y, e.clientY));
    return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
  };
  ui.sel.addEventListener('pointerdown', e => {
    if (e.button !== 0 || estado !== 'escolhendo') return;
    inicio = { x: e.clientX, y: e.clientY }; ui.sel.setPointerCapture(e.pointerId); e.preventDefault();
    ui.caixa.className = 'escolhendo'; ui.sel.classList.add('marcado');
  });
  ui.sel.addEventListener('pointermove', e => { if (inicio){ ret = norm(e); posicionar(ret); } });
  ui.sel.addEventListener('pointerup', e => {
    if (!inicio) return;
    ret = norm(e); inicio = null;
    if (ret.w < 40 || ret.h < 40){ ret = null; ui.caixa.className = ''; ui.sel.classList.remove('marcado'); avisar('área muito pequena — arraste de novo'); return; }
    pronto();
  });
  pintarBotao();
}

function pronto(){
  estado = 'pronto';
  ui.sel?.classList.add('marcado');
  ui.caixa.className = 'escolhendo'; posicionar(ret);
  ui.menu.style.display = 'flex';
  const abaixo = ret.y + ret.h + 46 < innerHeight;
  ui.menu.style.left = Math.min(ret.x, innerWidth - 230) + 'px';
  ui.menu.style.top = (abaixo ? ret.y + ret.h + 8 : Math.max(8, ret.y - 46)) + 'px';
  if (ui.dica) ui.dica.innerHTML = `Área ${ret.w}×${ret.h} · <b>● Gravar</b> começa${cfg.forcarCanvas ? '' : ' (o Chrome pergunta uma vez se pode capturar a aba)'} · <b>Esc</b> cancelar`;
  pintarBotao();
}

function cancelar(){
  ui.sel?.remove(); ui.dica?.remove(); ui.sel = ui.dica = null;
  ui.menu.style.display = 'none'; ui.caixa.className = '';
  if (estado !== 'gravando' && estado !== 'parando'){ estado = 'parado'; ret = null; }
  pintarBotao();
}

async function gravar(){
  if (estado !== 'pronto' || !ret) return;
  ui.menu.style.display = 'none';
  try { stream = await capturar(); }
  catch (e){ avisar('não deu para capturar: ' + (e.message || e)); ui.menu.style.display = 'flex'; return; }
  tipo = escolherTipo();
  bps = bitrate(stream.getVideoTracks()[0], tipo);
  rec = new MediaRecorder(stream, { ...(tipo && { mimeType: tipo }), videoBitsPerSecond: bps });
  partes = [];
  rec.ondataavailable = e => { if (e.data.size) partes.push(e.data); };
  rec.onstop = salvar;
  rec.start(500);
  estado = 'gravando'; t0 = performance.now();
  ui.sel?.remove(); ui.dica?.remove(); ui.sel = ui.dica = null;
  ui.caixa.className = 'gravando';
  // parou de compartilhar pela barra do Chrome → encerra e salva do mesmo jeito
  stream.getVideoTracks()[0].addEventListener('ended', () => { if (estado === 'gravando') parar(); });
  relogio = setInterval(pintarBotao, 500);
  pintarBotao();
}

async function capturar(){
  copiar = null;
  if (!cfg.forcarCanvas && navigator.mediaDevices?.getDisplayMedia){
    /* Resolução pedida explicitamente na escala do dispositivo: sem `width/height` o Chrome
       pode capturar a aba menor que ela é (e o recorte herda isso). `contentHint = 'detail'`
       diz pro capturador preferir resolução a fps quando tiver que ceder. */
    const s = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser', frameRate: 60,
               width: { ideal: Math.round(screen.width * devicePixelRatio) }, height: { ideal: Math.round(screen.height * devicePixelRatio) } },
      audio: true,
      preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', systemAudio: 'exclude',
    });
    const v = s.getVideoTracks()[0];
    try { v.contentHint = 'detail'; } catch {}
    const inteira = ret.x === 0 && ret.y === 0 && ret.w >= innerWidth && ret.h >= innerHeight;
    if (!inteira && typeof CropTarget !== 'undefined' && v.cropTo){
      try { await v.cropTo(await CropTarget.fromElement(ui.caixa)); }
      catch (e){ avisar('sem recorte (gravando a aba inteira): ' + e.message); }
    } else if (!inteira) avisar('este navegador não recorta a captura — gravando a aba inteira');
    modo = 'aba';
    return s;
  }
  // sem captura de aba: copia o recorte do canvas WebGL (sem os rótulos em HTML)
  const tela = cfg.tela, k = tela.width / tela.clientWidth, rc = tela.getBoundingClientRect();   // o canvas pode não começar no canto da página
  const sx = Math.round((ret.x - rc.left) * k), sy = Math.round((ret.y - rc.top) * k), sw = Math.round(ret.w * k) & ~1, sh = Math.round(ret.h * k) & ~1;
  const c = document.createElement('canvas'); c.width = sw; c.height = sh;
  const ctx = c.getContext('2d');
  copiar = () => ctx.drawImage(tela, sx, sy, sw, sh, 0, 0, sw, sh);
  const s = c.captureStream(30);
  const audio = cfg.audio?.();
  if (audio) for (const t of audio.getAudioTracks()) s.addTrack(t);
  modo = 'canvas';
  return s;
}

function parar(){
  if (estado !== 'gravando') return;
  estado = 'parando'; clearInterval(relogio);
  rec.stop();
}

function salvar(){
  for (const t of stream.getTracks()) t.stop();
  const blob = new Blob(partes, { type: (tipo || 'video/webm').split(';')[0] });
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const nome = `${cfg.prefixo}_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.${/mp4/.test(tipo) ? 'mp4' : 'webm'}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  const st = stream.getVideoTracks()[0]?.getSettings?.() || {};
  avisar(`salvo em Downloads: ${nome} (${(blob.size / 1048576).toFixed(1)} MB · ${st.width || '?'}×${st.height || '?'} · ${(tipo || 'webm').replace(/^video\//, '').split(';')[0]} ${tipo.includes('640028') ? 'High' : tipo.includes('42E01E') || /avc1$|mp4$/.test(tipo) ? 'Baseline' : ''} · ${Math.round(bps / 1e6)} Mbps${modo === 'canvas' ? ' · sem os rótulos' : ''})`, 12000);
  estado = 'parado'; ret = null; copiar = null; rec = null; stream = null;
  ui.caixa.className = '';
  pintarBotao();
}

function posicionar(r){
  if (!r){ ui.caixa.className = ''; return; }
  Object.assign(ui.caixa.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
}
function pintarBotao(){
  const b = ui.botao;
  b.classList.toggle('gravando', estado === 'gravando');
  if (estado === 'gravando'){
    const s = Math.floor((performance.now() - t0) / 1000);
    b.innerHTML = `Parar ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}<b>R</b>`;
  } else if (estado === 'parado') b.innerHTML = '🎥 Gravar vídeo<b>R</b>';
  else if (estado === 'parando') b.innerHTML = 'salvando…';
  else b.innerHTML = '✕ Cancelar<b>Esc</b>';
}
function avisar(msg, ms = 4000){
  ui.aviso.textContent = msg; ui.aviso.style.opacity = 1;
  clearTimeout(avisoT); avisoT = setTimeout(() => { ui.aviso.style.opacity = 0; }, ms);
}
