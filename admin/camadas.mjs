/* Editor de Mapa — CAMADAS (Fase 1): NPCs, portas e vagas de treinador como PONTOS, e grama / água / piso de caverna no PINCEL.
 *
 * De onde vem cada coisa:
 *   <mapa>.json   npcs[] {cfg, modelo, face, x, y, z, a} · treinadores[] {cfg, tipo, x, y, z, a}
 *                 grama[] {cfg, tipo 41, x, y, z, a} · agua[] {tipo, x, y, z, a} · spawn[] {x, z, y, a} (piso de caverna)
 *   npcs_glb.json[cfg]     QUEM o NPC é: nome, glb (cenario/<glb>.glb), falas, papel, placa — sem cadastro, o jogo não monta o NPC
 *   portas.json[cfg]       ponto de NPC com cfg aqui é PORTA (t 6, leva à chegada n) ou CHEGADA (t 7, onde se nasce ao entrar)
 *   treinadores.json[cfg]  o time de quem nasce na vaga (vaga cujo cfg não está lá não nasce ninguém)
 * O x do arquivo é espelhado (mundo = FLIPX·x), como as caixas. Os tiles são a grade de 1 m (centro em ,5) e a área de um
 * tile novo é a da caixa de área embaixo dele. Salvar: /admin/mapa-camadas (o mapa) + /admin/dados (npcs, portas). */
import { ESQUEMAS, validarCampo } from '/admin/esquemas.mjs';

const CFG_NPC_NOVO = 9100001;   // NPC criado no painel: faixa 91xxxxx (nenhum cfg de 7 dígitos do jogo começa com 9)
const COR = { npc: '#4ff0e0', placa: '#c9c9ff', porta: '#ffd23a', chegada: '#ff9d4d', treinador: '#ff5fd0' };
const TIPO_TILE = { grama: 'Grama (encontros)', agua: 'Água (pesca/surf)', spawn: 'Piso de caverna (encontros)' };
const COR_TILE = { spawn: 'rgba(214,160,90,.5)' };

export function criarCamadas(dep) {
  const { $, esc, api, toast, avisarJogo, canal, FLIPX, cam, w2t, t2w, redesenhar, dados, mapa, camadas, areaEm, nomeArea, aoMudar, mapas, trocarMapa } = dep;
  let ferramenta = 'zonas', sel = null, arraste = null, colocar = null, ref = null, pintando = false, hover = null, indice = null, avisouSemArea = false;
  const pincel = { tipo: 'grama', modo: 'pintar', raio: 1 };
  const sujo = { npcs: false, treinadores: false, grama: false, agua: false, spawn: false }, glbSujos = new Set(), portasSujas = new Set();
  const marcar = k => { if (k) sujo[k] = true; aoMudar(); };

  async function carregarRef() {
    if (ref) return ref;
    const ler = f => fetch('/data/' + f + '.json?t=' + Date.now()).then(r => r.ok ? r.json() : {}).catch(() => ({}));
    const [npcs, portas, treinadores, cenas] = await Promise.all(['npcs_glb', 'portas', 'treinadores', 'cenas'].map(ler));
    ref = { npcs, portas, treinadores, cenas: Object.fromEntries((cenas.cenas || []).map(c => [c.id, c.nome])) };
    const dl = (id, html) => { let d = document.getElementById(id); if (!d) { d = document.createElement('datalist'); d.id = id; document.body.append(d); } d.innerHTML = html; };
    dl('dl-c-npcs', Object.entries(npcs).map(([cfg, n]) => `<option value="${cfg}" label="${esc(n.nome || (n.placa ? 'Placa' : 'NPC'))}">`).join(''));
    dl('dl-c-treinadores', Object.entries(treinadores).map(([cfg, t]) => `<option value="${cfg}" label="${esc(t.nome)}">`).join(''));
    redesenhar();
    return ref;
  }

  // ── Pontos ──────────────────────────────────────────────────────────────────
  const tipoDe = (lista, o) => {
    if (lista === 'treinadores') return 'treinador';
    const p = ref?.portas[o.cfg];
    return p?.t === 6 ? 'porta' : p?.t === 7 ? 'chegada' : ref?.npcs[o.cfg]?.placa ? 'placa' : 'npc';
  };
  const temDados = (lista, o) => lista === 'treinadores' ? !!ref?.treinadores[o.cfg] : !!(ref?.npcs[o.cfg] || ref?.portas[o.cfg]);
  function* pontosVisiveis() {
    const d = dados(); if (!d) return;
    if (camadas.npcs) for (const o of d.npcs || []) yield ['npcs', o];
    if (camadas.treinadores) for (const o of d.treinadores || []) yield ['treinadores', o];
  }
  const tamanho = () => Math.max(3, Math.min(8, cam.esc * 0.45));
  function pontoEm(px, py) {
    let melhor = null, dMin = Math.max(8, tamanho() + 3);
    for (const [lista, o] of pontosVisiveis()) {
      const [x, y] = w2t(FLIPX * o.x, o.z), dd = Math.hypot(px - x, py - y);
      if (dd < dMin || (dd <= dMin && sel?.obj === o)) { dMin = dd; melhor = { lista, obj: o }; }
    }
    return melhor;
  }
  function desenharPonto(ctx, lista, o) {
    const [x, y] = w2t(FLIPX * o.x, o.z), s = tamanho(), tipo = tipoDe(lista, o), cheio = temDados(lista, o), cor = COR[tipo];
    ctx.beginPath();
    if (tipo === 'porta' || tipo === 'placa') ctx.rect(x - s, y - s, 2 * s, 2 * s);
    else if (tipo === 'chegada') { ctx.moveTo(x, y - s * 1.2); ctx.lineTo(x + s * 1.2, y); ctx.lineTo(x, y + s * 1.2); ctx.lineTo(x - s * 1.2, y); ctx.closePath(); }
    else if (tipo === 'treinador') { ctx.moveTo(x, y - s * 1.2); ctx.lineTo(x + s * 1.1, y + s * 0.9); ctx.lineTo(x - s * 1.1, y + s * 0.9); ctx.closePath(); }
    else ctx.arc(x, y, s, 0, Math.PI * 2);
    if (cheio) { ctx.fillStyle = cor; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1; ctx.stroke(); }
    else { ctx.strokeStyle = cor; ctx.globalAlpha = .7; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1; }
    if (lista === 'npcs' && tipo === 'npc' && cheio && cam.esc > 3) {                   // pra onde o NPC olha
      const g = -(o.face || 0) * Math.PI / 180, dx = Math.sin(g) * FLIPX, dz = Math.cos(g);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx * s * 2, y + dz * s * 2); ctx.strokeStyle = cor; ctx.lineWidth = 1.5; ctx.stroke();
    }
    const eSel = sel?.obj === o;
    if (eSel) { ctx.beginPath(); ctx.arc(x, y, s + 5, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    if (eSel || cam.esc > 6) {
      const nome = rotuloPonto(lista, o); if (!nome) return;
      ctx.font = (eSel ? 'bold ' : '') + '11px system-ui'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(10,13,18,.75)'; const w = ctx.measureText(nome).width + 8; ctx.fillRect(x - w / 2, y - s - 19, w, 14);
      ctx.fillStyle = eSel ? '#fff' : cor; ctx.fillText(nome, x, y - s - 8); ctx.textAlign = 'left';
    }
  }
  function rotuloPonto(lista, o) {
    if (lista === 'treinadores') return ref?.treinadores[o.cfg]?.nome || '';
    const p = ref?.portas[o.cfg];
    if (p?.t === 6) return '→ ' + destinoTexto(p.n, true);
    if (p?.t === 7) return 'chegada';
    return ref?.npcs[o.cfg]?.nome || '';
  }
  function destinoTexto(n, curto) {
    if (!n) return 'sem saída';
    const dest = ref?.portas[n]; if (!dest) return 'cfg ' + n + ' (não existe)';
    const area = dest.a ? nomeArea(dest.a) : '', cena = ref.cenas[dest.c] || 'cena ' + dest.c;
    return curto ? (area && !/^Área \d/.test(area) ? area : cena) : `${cena}${area ? ' · ' + area : ''} (chegada ${n})`;
  }
  const arquivoDaCena = c => { const nome = +c === 1000001 ? 'kanto' : String(c); return mapas().includes(nome) ? nome : null; };

  // ── Tiles (pincel) ──────────────────────────────────────────────────────────
  const celula = (x, z) => Math.floor(x) + ',' + Math.floor(z);
  function cfgGrama(a) {                                   // o cfg mais comum da grama dessa área (o jogo original numera por área)
    const n = {}; for (const t of dados().grama || []) if (t.a === a) n[t.cfg] = (n[t.cfg] || 0) + 1;
    const melhor = Object.entries(n).sort((p, q) => q[1] - p[1])[0];
    return melhor ? +melhor[0] : a * 100 + 1;
  }
  function tileNovo(x, z, a) {
    if (pincel.tipo === 'grama') return { cfg: cfgGrama(a), tipo: 41, x, y: 0, z, a };
    if (pincel.tipo === 'agua') return { tipo: 33, x, y: 0, z, a };
    return { x, z, y: 0, a };
  }
  function aplicarPincel(px, py) {
    const d = dados(); if (!d) return;
    const [wx, wz] = t2w(px, py), cx = Math.floor(FLIPX * wx), cz = Math.floor(wz), r = pincel.raio;
    const lista = (d[pincel.tipo] ||= []);
    if (!indice || indice.lista !== lista) indice = { lista, mapa: new Map(lista.map(t => [celula(t.x, t.z), t])) };
    const tirar = new Set(); let mudou = false;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (dx * dx + dz * dz > r * r + r) continue;                                   // pincel redondo
      const k = (cx + dx) + ',' + (cz + dz);
      if (pincel.modo === 'pintar') {
        if (indice.mapa.has(k)) continue;
        const x = cx + dx + 0.5, z = cz + dz + 0.5, a = areaEm(FLIPX * x, z);
        if (a == null) { if (!avisouSemArea) { toast('Fora de qualquer área: pinte dentro de uma caixa de área (o tile precisa de uma).', true); avisouSemArea = true; } continue; }
        const t = tileNovo(x, z, a); lista.push(t); indice.mapa.set(k, t); mudou = true;
      } else {
        const t = indice.mapa.get(k); if (!t) continue;
        indice.mapa.delete(k); tirar.add(t); mudou = true;
      }
    }
    if (tirar.size) { const fica = lista.filter(t => !tirar.has(t)); lista.length = 0; lista.push(...fica); }
    if (mudou) { marcar(pincel.tipo); atualizarContagem(); redesenhar(); }
  }

  // ── Desenho (chamado pelo desenhar() do admin) ─────────────────────────────
  function desenhar(ctx) {
    const d = dados(); if (!d) return;
    if (camadas.piso && d.spawn?.length) {
      const tile = Math.max(1.2, cam.esc * 0.9); ctx.fillStyle = COR_TILE.spawn;
      for (const t of d.spawn) { const [x, y] = w2t(FLIPX * t.x, t.z); ctx.fillRect(x - tile / 2, y - tile / 2, tile, tile); }
    }
    for (const [lista, o] of pontosVisiveis()) desenharPonto(ctx, lista, o);
    if (ferramenta === 'pincel' && hover) {                                          // o tamanho do pincel embaixo do cursor
      const [wx, wz] = t2w(hover[0], hover[1]), cx = Math.floor(FLIPX * wx) + 0.5, cz = Math.floor(wz) + 0.5, r = pincel.raio + 0.5;
      const [x0, y0] = w2t(FLIPX * cx - r, cz - r), [x1, y1] = w2t(FLIPX * cx + r, cz + r);
      ctx.strokeStyle = pincel.modo === 'pintar' ? '#ffcf3a' : '#ff5d5d'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // ── Mouse (o admin chama antes do dele; true = foi meu) ──────────────────────
  function mousedown(px, py, e) {
    if (ferramenta === 'zonas' || !dados()) return false;
    if (ferramenta === 'pincel') {
      if (e.shiftKey) return false;                                                  // Shift+arrastar = mover o mapa
      pintando = true; indice = null; avisouSemArea = false; aplicarPincel(px, py); return true;
    }
    if (colocar) { colocarPonto(px, py); return true; }
    const alvo = pontoEm(px, py);
    if (!alvo) return false;
    selecionar(alvo);
    const [wx, wz] = t2w(px, py);
    arraste = { o: alvo.obj, lista: alvo.lista, dx: FLIPX * alvo.obj.x - wx, dz: alvo.obj.z - wz, sx: e.clientX, sy: e.clientY, mexeu: false };
    return true;
  }
  function mousemove(px, py, e) {
    if (ferramenta === 'pincel') { hover = [px, py]; if (pintando) aplicarPincel(px, py); else redesenhar(); return pintando; }
    if (!arraste) return false;
    if (!arraste.mexeu && Math.hypot(e.clientX - arraste.sx, e.clientY - arraste.sy) < 3) return true;
    arraste.mexeu = true;
    const [wx, wz] = t2w(px, py);
    arraste.o.x = +(FLIPX * (wx + arraste.dx)).toFixed(2); arraste.o.z = +(wz + arraste.dz).toFixed(2);
    const a = areaEm(FLIPX * arraste.o.x, arraste.o.z); if (a != null) arraste.o.a = a;  // mudou de área: o ponto passa a ser dela
    marcar(arraste.lista); atualizarPosicao(); redesenhar();
    return true;
  }
  function mouseup() {
    if (pintando) { pintando = false; return true; }
    if (arraste) { arraste = null; return true; }
    return false;
  }
  function cliqueVazio() { if (ferramenta === 'pontos' && sel) { sel = null; renderPainel(); redesenhar(); } }

  // ── Criar, selecionar, apagar ──────────────────────────────────────────────
  function colocarPonto(px, py) {
    const [wx, wz] = t2w(px, py), x = +(FLIPX * wx).toFixed(2), z = +wz.toFixed(2), a = areaEm(wx, wz), d = dados();
    if (a == null) { toast('Coloque dentro de uma área do mapa.', true); return; }
    let novo;
    if (colocar === 'npc') {
      let cfg = CFG_NPC_NOVO; while (ref.npcs[cfg] || ref.portas[cfg] || (d.npcs || []).some(n => n.cfg === cfg)) cfg++;
      ref.npcs[cfg] = { nome: 'Novo NPC', glb: 'npc/fc1004_00', falas: ['Olá!'], cena: +d.mapa || undefined, tipo: 1 }; glbSujos.add(cfg);
      novo = { lista: 'npcs', obj: { cfg, modelo: 0, face: 0, x, y: 0, z, a } };
    } else {
      const cfg = +Object.keys(ref.treinadores)[0] || 0;
      novo = { lista: 'treinadores', obj: { cfg, tipo: 51, x, y: 0, z, a } };
    }
    (d[novo.lista] ||= []).push(novo.obj);
    colocar = null; dep.tela.classList.remove('colocando');
    marcar(novo.lista); selecionar(novo); redesenhar();
    toast(novo.lista === 'npcs' ? 'NPC criado — dê nome, modelo e falas ao lado.' : 'Vaga criada — escolha qual treinador nasce nela.');
  }
  function selecionar(s) { sel = s; renderPainel(); redesenhar(); }
  function centralizar(o) { cam.x = FLIPX * o.x; cam.z = o.z; cam.esc = Math.max(cam.esc, 6); redesenhar(); }

  // ── Painel ──────────────────────────────────────────────────────────────────
  const atualizarContagem = () => { const el = $('c-contagem'); if (el) { const d = dados() || {}; el.textContent = `${(d.grama || []).length} grama · ${(d.agua || []).length} água · ${(d.spawn || []).length} piso`; } };
  function atualizarPosicao() { if (!sel) return; const x = $('c-x'), z = $('c-z'); if (x && document.activeElement !== x) x.value = +(FLIPX * sel.obj.x).toFixed(2); if (z && document.activeElement !== z) z.value = +sel.obj.z.toFixed(2); }
  function renderPainel() {
    const el = $('c-painel'); if (!el) return;
    el.hidden = ferramenta === 'zonas';
    if (ferramenta === 'pincel') {
      el.innerHTML = `<h3>Pincel</h3>
        <div class="form">
          <label class="inteira">O que pintar <select id="c-p-tipo">${Object.entries(TIPO_TILE).map(([k, r]) => `<option value="${k}"${k === pincel.tipo ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
          <label>Ação <select id="c-p-modo"><option value="pintar"${pincel.modo === 'pintar' ? ' selected' : ''}>Pintar</option><option value="apagar"${pincel.modo === 'apagar' ? ' selected' : ''}>Apagar</option></select></label>
          <label>Tamanho <input type="range" id="c-p-raio" min="0" max="5" value="${pincel.raio}"></label>
        </div>
        <div class="fraco" style="font-size:12px;margin-top:8px">Clique e arraste no mapa. <b>Shift+arrastar</b> move o mapa. O tile novo fica na área da caixa embaixo dele (fora de área não pinta). É onde os selvagens nascem: grama e piso pra Pokémon de terra, água pra quem tem "água" no habitat.</div>
        <div class="fraco" id="c-contagem" style="margin-top:6px"></div>`;
      $('c-p-tipo').onchange = e => { pincel.tipo = e.target.value; indice = null; if (pincel.tipo === 'spawn' && !camadas.piso) dep.ligarCamada('piso'); };
      $('c-p-modo').onchange = e => { pincel.modo = e.target.value; redesenhar(); };
      $('c-p-raio').oninput = e => { pincel.raio = +e.target.value; redesenhar(); };
      atualizarContagem(); return;
    }
    if (ferramenta !== 'pontos') return;
    el.innerHTML = `<h3>Pontos do mapa</h3>
      <div class="acoes"><button id="c-add-npc" class="${colocar === 'npc' ? 'on' : ''}">＋ NPC</button><button id="c-add-tr" class="${colocar === 'treinador' ? 'on' : ''}">＋ Vaga de treinador</button></div>
      <div class="c-legenda"><span style="color:${COR.npc}">●</span> NPC <span style="color:${COR.npc}">○</span> sem cadastro (não aparece) <span style="color:${COR.porta}">■</span> porta <span style="color:${COR.chegada}">◆</span> chegada <span style="color:${COR.treinador}">▲</span> treinador <span style="color:${COR.treinador}">△</span> vaga sem treinador</div>
      <div id="c-sel" style="margin-top:10px">${sel ? '' : '<div class="fraco">Clique num ponto pra editar; arraste pra mover. Ligue as camadas "npcs" e "treinadores" lá em cima.</div>'}</div>`;
    $('c-add-npc').onclick = () => { colocar = colocar === 'npc' ? null : 'npc'; dep.tela.classList.toggle('colocando', !!colocar); renderPainel(); if (colocar) toast('Clique no mapa onde o NPC fica.'); };
    $('c-add-tr').onclick = () => { colocar = colocar === 'treinador' ? null : 'treinador'; dep.tela.classList.toggle('colocando', !!colocar); renderPainel(); if (colocar) toast('Clique no mapa onde a vaga fica.'); };
    if (sel) renderSel();
  }
  function campoNum(id, rot, v, extra = '') { return `<label>${rot} <input type="number" id="${id}" value="${v ?? ''}" ${extra}></label>`; }
  function renderSel() {
    const { lista, obj: o } = sel, tipo = tipoDe(lista, o), cont = $('c-sel'), d = dados();
    let html = '';
    if (lista === 'treinadores') {
      const t = ref.treinadores[o.cfg];
      html = `<h4>Vaga de treinador</h4><div class="form">
        <label class="inteira">Treinador (cfg) <input type="number" id="c-cfg" list="dl-c-treinadores" value="${o.cfg}"></label>
        <div class="inteira ${t ? 'fraco' : 'aviso-c'}" id="c-cfg-info">${t ? esc(t.nome) + ' — time: ' + esc((t.time || []).map(p => '#' + p.dex + ' Nv' + p.lv).join(', ')) : 'Sem dados em Treinadores NPC: ninguém nasce nesta vaga.'}</div>
        ${campoNum('c-x', 'X', +(FLIPX * o.x).toFixed(2), 'step="0.5"')}${campoNum('c-z', 'Z', +o.z.toFixed(2), 'step="0.5"')}</div>`;
    } else if (tipo === 'porta' || tipo === 'chegada') {
      const p = ref.portas[o.cfg];
      html = `<h4>${tipo === 'porta' ? 'Porta' : 'Chegada'} <span class="fraco">cfg ${o.cfg}</span></h4><div class="form">
        <label class="inteira">Tipo <select id="c-pt-t"><option value="6"${p.t === 6 ? ' selected' : ''}>Porta (leva a…)</option><option value="7"${p.t === 7 ? ' selected' : ''}>Chegada (onde se nasce ao entrar)</option></select></label>
        ${p.t === 6 ? `<label class="inteira">Destino (cfg da chegada) <input type="number" id="c-pt-n" min="0" value="${p.n ?? 0}"></label>
        <div class="inteira fraco" id="c-pt-info">${esc(destinoTexto(p.n))}</div>` : `<div class="inteira fraco">Portas que chegam aqui: ${Object.entries(ref.portas).filter(([, q]) => q.t === 6 && q.n === o.cfg).map(([c]) => c).join(', ') || 'nenhuma'}.</div>`}
        ${campoNum('c-x', 'X', +(FLIPX * o.x).toFixed(2), 'step="0.5"')}${campoNum('c-z', 'Z', +o.z.toFixed(2), 'step="0.5"')}</div>
        ${p.t === 6 && p.n ? '<div class="acoes" style="margin-top:8px"><button id="c-pt-ir">Ir até o destino</button></div>' : ''}`;
    } else {
      const n = ref.npcs[o.cfg];
      html = `<h4>${n ? esc(n.nome || (n.placa ? 'Placa' : 'NPC')) : 'NPC sem cadastro'} <span class="fraco">cfg ${o.cfg}</span></h4><div class="form">
        <label class="inteira">Quem é (cfg) <input type="number" id="c-cfg" list="dl-c-npcs" value="${o.cfg}"></label>
        <label class="inteira">Direção (°) <div class="raio"><input type="range" id="c-face" min="0" max="359" value="${Math.round(o.face || 0)}"><input type="number" id="c-face-n" min="0" max="359" value="${Math.round(o.face || 0)}"></div></label>
        ${campoNum('c-x', 'X', +(FLIPX * o.x).toFixed(2), 'step="0.5"')}${campoNum('c-z', 'Z', +o.z.toFixed(2), 'step="0.5"')}
        ${n ? `<label class="inteira">Nome <input type="text" id="c-nome" maxlength="60" value="${esc(n.nome || '')}"></label>
        ${n.placa ? '' : `<label class="inteira">Modelo <input type="text" id="c-glb" value="${esc(n.glb || '')}" placeholder="npc/fc1004_00"><span class="erro-campo" id="c-glb-erro"></span></label>`}
        <label class="inteira">Falas (uma por linha) <textarea id="c-falas" rows="4">${esc((n.falas || []).join('\n'))}</textarea></label>
        <label class="inteira">Papel <select id="c-papel"><option value="">nenhum</option>${['cura', 'loja', 'caixa'].map(v => `<option${n.papel === v ? ' selected' : ''}>${v}</option>`).join('')}</select></label>`
        : '<div class="inteira aviso-c">Sem cadastro em NPCs: este ponto não aparece no jogo.</div><div class="inteira"><button id="c-cadastrar">Cadastrar este NPC</button></div>'}
        </div>
        ${n ? '<div class="fraco" style="font-size:11px;margin-top:4px">Nome, modelo e falas valem pra TODOS os pontos com este cfg.</div>' : ''}`;
    }
    html += `<div class="acoes" style="margin-top:10px"><button id="c-centro">Centralizar</button><button id="c-tp" title="Leva o seu personagem até o ponto (jogo aberto em outra aba, no mesmo mapa)">Ir até lá no jogo</button>
      <button id="c-dup">Duplicar</button><button id="c-del" class="perigo">Excluir</button></div>`;
    cont.innerHTML = html;
    ligarSel(lista, o, tipo, d);
  }
  function ligarSel(lista, o, tipo, d) {
    const re = () => { renderSel(); redesenhar(); };
    const pos = () => { const x = Number($('c-x').value), z = Number($('c-z').value); if (!Number.isFinite(x) || !Number.isFinite(z)) return; o.x = +(FLIPX * x).toFixed(2); o.z = +z.toFixed(2); const a = areaEm(x, z); if (a != null) o.a = a; marcar(lista); redesenhar(); };
    $('c-x').oninput = pos; $('c-z').oninput = pos;
    $('c-centro').onclick = () => centralizar(o);
    $('c-tp').onclick = () => { canal.postMessage({ t: 'tp', x: FLIPX * o.x, z: o.z, mapa: mapa() }); toast('Pedido enviado ao jogo (se estiver aberto neste mapa).'); };
    $('c-dup').onclick = () => { const c = { ...o, x: +(o.x + FLIPX * 1.5).toFixed(2) }; d[lista].push(c); marcar(lista); selecionar({ lista, obj: c }); };
    $('c-del').onclick = () => {
      if (!confirm('Excluir este ponto do mapa?' + (tipo === 'porta' ? ' (a porta deixa de existir neste lugar)' : ''))) return;
      d[lista].splice(d[lista].indexOf(o), 1); sel = null; marcar(lista); renderPainel(); redesenhar();
    };
    if ($('c-cfg')) $('c-cfg').oninput = e => {
      const v = Number(e.target.value); if (!Number.isInteger(v) || v < 1) return;
      o.cfg = v; marcar(lista);
      const info = $('c-cfg-info');
      if (info) { const t = ref.treinadores[v]; info.className = 'inteira ' + (t ? 'fraco' : 'aviso-c'); info.textContent = t ? t.nome : 'Sem dados em Treinadores NPC: ninguém nasce nesta vaga.'; redesenhar(); }
      else { clearTimeout(ligarSel.t); ligarSel.t = setTimeout(re, 500); }                // NPC: o painel muda (outro cadastro)
    };
    if ($('c-face')) {
      const face = v => { o.face = Math.max(0, Math.min(359, Math.round(+v || 0))); $('c-face').value = $('c-face-n').value = o.face; marcar(lista); redesenhar(); };
      $('c-face').oninput = e => face(e.target.value); $('c-face-n').oninput = e => face(e.target.value);
    }
    const n = ref.npcs[o.cfg], mexeuNpc = () => { glbSujos.add(o.cfg); marcar(); redesenhar(); };
    if ($('c-nome')) $('c-nome').oninput = e => { n.nome = e.target.value.slice(0, 60); mexeuNpc(); };
    if ($('c-glb')) $('c-glb').oninput = e => {
      const r = validarCampo(ESQUEMAS.npcs.campos.find(c => c.k === 'glb'), e.target.value.trim());
      $('c-glb-erro').textContent = r.ok ? '' : r.erro; e.target.classList.toggle('invalido', !r.ok);
      if (r.ok) { n.glb = r.v; mexeuNpc(); }
    };
    if ($('c-falas')) $('c-falas').oninput = e => { n.falas = e.target.value.split('\n').map(s => s.trim()).filter(Boolean); mexeuNpc(); };
    if ($('c-papel')) $('c-papel').onchange = e => { if (e.target.value) n.papel = e.target.value; else delete n.papel; mexeuNpc(); };
    if ($('c-cadastrar')) $('c-cadastrar').onclick = () => { ref.npcs[o.cfg] = { nome: 'NPC', glb: 'npc/fc1004_00', falas: [], cena: +d.mapa || undefined, tipo: 1 }; glbSujos.add(o.cfg); marcar(); re(); };
    if ($('c-pt-t')) $('c-pt-t').onchange = e => { const p = ref.portas[o.cfg]; p.t = +e.target.value; if (p.t === 6 && p.n === undefined) p.n = 0; portasSujas.add(o.cfg); marcar(); re(); };
    if ($('c-pt-n')) $('c-pt-n').oninput = e => { const v = Number(e.target.value); if (!Number.isInteger(v) || v < 0) return; ref.portas[o.cfg].n = v; portasSujas.add(o.cfg); marcar(); $('c-pt-info').textContent = destinoTexto(v); redesenhar(); };
    if ($('c-pt-ir')) $('c-pt-ir').onclick = async () => {
      const p = ref.portas[o.cfg], dest = ref.portas[p.n], arq = dest && arquivoDaCena(dest.c);
      if (!arq) { toast('O destino fica numa cena sem mapa aqui (' + destinoTexto(p.n) + ').', true); return; }
      if (arq !== mapa()) { if (sujo_() && !confirm('Há alterações não salvas neste mapa. Ir mesmo assim (elas se perdem)?')) return; await trocarMapa(arq, true); }
      const alvo = (dados().npcs || []).find(q => q.cfg === p.n);
      if (alvo) { selecionar({ lista: 'npcs', obj: alvo }); centralizar(alvo); } else toast('A chegada ' + p.n + ' não está neste mapa.', true);
    };
  }

  // ── Salvar / descartar ──────────────────────────────────────────────────────
  const sujo_ = () => Object.values(sujo).some(Boolean) || glbSujos.size > 0 || portasSujas.size > 0;
  async function salvarArquivo(nome, chaves, fonte) {
    const r = await api('/admin/dados/' + nome);
    if (!r.ok) { toast(r.erro || 'Falha ao ler ' + nome + '.', true); return false; }
    const tudo = r.dados || {};
    for (const k of chaves) { if (fonte[k]) tudo[k] = fonte[k]; else delete tudo[k]; }
    const s = await api('/admin/dados/' + nome, 'POST', { dados: tudo });
    if (!s.ok) { toast(ESQUEMAS[nome].titulo + ': ' + (s.erro || 'falha ao salvar'), true); return false; }
    return true;
  }
  async function salvar() {
    const corpo = { mapa: mapa() }, d = dados();
    for (const k of Object.keys(sujo)) if (sujo[k]) corpo[k] = d[k] || [];
    if (Object.keys(corpo).length > 1) {
      const r = await api('/admin/mapa-camadas', 'POST', corpo);
      if (!r.ok) { toast(r.erro || 'Falha ao salvar as camadas.', true); return false; }
    }
    if (glbSujos.size && !await salvarArquivo('npcs', [...glbSujos], ref.npcs)) return false;
    if (portasSujas.size && !await salvarArquivo('portas', [...portasSujas], ref.portas)) return false;
    const partes = [...Object.keys(sujo).filter(k => sujo[k]), glbSujos.size ? glbSujos.size + ' cadastro(s) de NPC' : '', portasSujas.size ? portasSujas.size + ' porta(s)' : ''].filter(Boolean);
    for (const k of Object.keys(sujo)) sujo[k] = false;
    glbSujos.clear(); portasSujas.clear(); aoMudar();
    toast('Camadas salvas: ' + partes.join(', ') + '.');
    avisarJogo(mapa(), true);
    return true;
  }
  function reset() {                                         // trocou de mapa ou descartou: a seleção e o pendente vão embora
    sel = null; arraste = null; colocar = null; pintando = false; indice = null;
    for (const k of Object.keys(sujo)) sujo[k] = false;
    if (glbSujos.size || portasSujas.size) ref = null;        // cadastro editado e não salvo: relê dos arquivos
    glbSujos.clear(); portasSujas.clear();
    renderPainel();
  }
  function usarFerramenta(f) {
    ferramenta = f; colocar = null; hover = null; dep.tela.classList.remove('colocando');
    if (f !== 'zonas') carregarRef().then(renderPainel);
    if (f === 'pontos') { if (!camadas.npcs) dep.ligarCamada('npcs'); if (!camadas.treinadores) dep.ligarCamada('treinadores'); }
    renderPainel(); redesenhar();
  }
  carregarRef();

  return { desenhar, mousedown, mousemove, mouseup, cliqueVazio, salvar, reset, usarFerramenta, sujo: sujo_, ferramenta: () => ferramenta, atualizarContagem };
}
