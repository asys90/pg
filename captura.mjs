/* Modo CAPTURA (?captura=1): cena pra TikTok em que o Jaime JOGA de verdade (anda, luta, joga a bola) mas decide
 * antes quem aparece. Os spawns naturais ficam desligados (a URL ganha selvagens=0) e um painel (H esconde) povoa
 * selvagens escolhidos em volta do jogador — espécie, nível, perfil, shiny, quantidade, raio —, troca o seguidor
 * (com shiny), a roupa, dá Pokébolas, teleporta pra uma área e põe textos na tela (F9 = flash). As "receitas" de
 * povoamento e o resto da cena ficam em localStorage `captura.cena` (+ exportar/importar). O index só passa o
 * `ctx` (jogo, criarSelvagem/trocarSeguidor via `jogo`, aplicarShinyCampo, guardarSelvagem, chaoEm, áreas…). */
let ctx = null, painel = null, banner = null, flash = null, cena = null;
let meus = [];                                                            // selvagens que EU povoei (pra listar/tirar)
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CSS = '#cap{position:fixed;right:0;top:0;bottom:0;width:300px;z-index:60;background:#0b1020f2;color:#e6ecff;font:12px/1.4 system-ui,Segoe UI,sans-serif;overflow:auto;padding:10px 12px 30px;border-left:1px solid #2a3550;box-sizing:border-box}'
  + '#cap.esc{display:none}#cap h2{margin:12px 0 6px;font-size:12px;color:#ffe07a;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #2a3550;padding-bottom:3px}'
  + '#cap label{display:flex;align-items:center;gap:6px;margin:4px 0}#cap label span{min-width:58px;color:#9aa5c0}'
  + '#cap input,#cap select{flex:1;min-width:0;padding:4px 6px;border:1px solid #2a3550;border-radius:6px;background:#101624;color:#e6ecff;font:inherit}#cap input[type=checkbox]{flex:0 0 auto}#cap input[type=range]{padding:0}'
  + '#cap button{padding:4px 8px;border:1px solid #2a3550;border-radius:6px;background:#101624;color:#e6ecff;font:inherit;cursor:pointer}#cap button.ok{border-color:#b47622;background:#342317;color:#ffe6b0;font-weight:700}#cap button.perigo{border-color:#a0132f;color:#f58e8e}'
  + '#cap .linha{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0;align-items:center}#cap .k{color:#8a95b0;font-size:11px}#cap .estado{color:#86ef5f}'
  + '#cap ul{list-style:none;margin:4px 0;padding:0}#cap li{display:flex;align-items:center;gap:6px;padding:3px 6px;border:1px solid #2a3550;border-radius:6px;margin-top:3px;font-size:11px}#cap li small{color:#8a95b0;margin-left:auto;white-space:nowrap}#cap li button{padding:1px 6px}'
  + '#cap-topo{position:fixed;left:0;right:0;top:9%;text-align:center;z-index:40;pointer-events:none;font-family:system-ui,Segoe UI,sans-serif;color:#fff;text-shadow:0 2px 8px #000,0 0 18px #000a}'
  + '#cap-topo b{display:block;font-size:min(6vw,46px);letter-spacing:.5px;line-height:1.05;white-space:pre-wrap}#cap-topo span{display:inline-block;margin-top:.7vw;padding:.5vw 2.2vw;border-radius:99px;background:#0b1020cc;border:1px solid #ffd23a88;color:#ffe07a;font-size:min(3.2vw,22px);font-weight:700}#cap-topo span:empty,#cap-topo b:empty{display:none}'
  + '#cap-flash{position:fixed;left:0;right:0;top:40%;text-align:center;z-index:41;pointer-events:none;font-family:system-ui,Segoe UI,sans-serif;font-weight:900;color:#fff;text-shadow:0 3px 10px #000,0 0 30px #000;opacity:0;transform:scale(.7);transition:opacity .22s,transform .22s}'
  + '#cap-flash.on{opacity:1;transform:scale(1)}#cap-flash b{display:block;font-size:min(13vw,96px);line-height:1;color:#ffd23a;white-space:pre-wrap}#cap-flash span{display:block;margin-top:1vw;font-size:min(5.2vw,40px)}'
  + '#cap-dica{position:fixed;right:8px;bottom:6px;z-index:60;color:#ffffffaa;font:11px system-ui,sans-serif;text-shadow:0 1px 3px #000;pointer-events:none}body.cap-escondido #cap-dica{display:none}';
const DEX_RAND = [1, 4, 7, 10, 13, 16, 19, 21, 23, 25, 27, 29, 32, 35, 37, 39, 41, 43, 46, 48, 50, 52, 54, 56, 58, 60, 63, 66, 69, 72, 74, 77, 79, 81, 83, 84, 86, 88, 90, 92, 95, 96, 98, 100, 102, 104, 108, 109, 111, 114, 116, 118, 120, 123, 127, 128, 129, 131, 133, 137, 138, 140, 142, 143, 147, 152, 155, 158, 252, 255, 258];
const rnd = a => a[Math.floor(Math.random() * a.length)];
const nomeDex = n => ctx.porDex.get(+n)?.name || ('nº ' + n);
const glbDe = n => 'pm' + String(n).padStart(4, '0') + '_00';
const status = t => { const s = $('cap-status'); if (s) s.textContent = t; };
const vivo = s => ctx.jogo.selvagens.includes(s);

/* ---------------------------------------------------------------- selvagens */
function rotular(s){ if (s.rotulo) s.rotulo.innerHTML = `<span>${s.shiny ? '✨ ' : ''}${s.nome} Lv${s.lv} ${s.perfil === 'agressivo' ? '⚔' : '🏃'}</span><i><b></b></i>`; }
/** Povoa `n` selvagens da espécie em volta do jogador (ou na frente dele), no chão, a ≥3 m. Devolve quantos nasceram. */
async function povoar({ dex, lv, perfil, shiny, n, raio, frente }){
  const a = ctx.jogo.ash, esp = { glb: glbDe(dex) + '.glb', dex: +dex, nome: nomeDex(dex) };   // o spawner do jogo espera o nome COM .glb (como em habitats.json)
  let feitos = 0;
  for (let i = 0; i < n; i++){
    let x = 0, z = 0, ok = false;
    for (let k = 0; k < 10 && !ok; k++){
      if (frente){ const d = 5 + i * 1.6; x = a.x + Math.sin(a.giro) * d + (Math.random() - 0.5) * 2.5; z = a.z + Math.cos(a.giro) * d + (Math.random() - 0.5) * 2.5; }
      else { const ang = Math.random() * Math.PI * 2, d = raio * (0.45 + 0.55 * Math.random()); x = a.x + Math.sin(ang) * d; z = a.z + Math.cos(ang) * d; }
      ok = ctx.chaoEm(x, z) != null && ctx.livre(x, z) && Math.hypot(x - a.x, z - a.z) >= 3;   // `livre`: fora de cerca/árvore/parede — nascendo dentro de bloqueio ele nunca sai do lugar
    }
    if (!ok){ status('sem chão livre em volta — anda pra um lugar mais aberto'); continue; }
    try {
      const s = await ctx.jogo.criarSelvagem(esp, x, z, { lv: +lv || null, perfil: perfil || null });
      if (shiny && !s.shiny){ s.shiny = true; ctx.aplicarShinyCampo(s.pivo, true); }
      s.__meu = true; s.giro = Math.atan2(a.x - s.x, a.z - s.z); s.pivo.rotation.y = s.giro;   // nasce olhando pro jogador
      /* Vagar como um spawn natural: a IA do jogo escolhe o próximo destino pelos tiles de grama da ÁREA (aqui é 0, sem
         tiles) ou, se `pertoDeGrama === false`, por pontos andáveis a até 10 m de `casa` — é esse o modo que serve. */
      s.pertoDeGrama = false; s.vagaLivre = true; s.pausa = 0.5 + Math.random() * 2;   // vagaLivre: o jogo não deixa selvagem vagar dentro de cidade; na cena vale
      rotular(s); meus.push(s); feitos++;
    } catch (e){ status(nomeDex(dex) + ' não carregou: ' + (e?.message || e)); break; }
  }
  pintarVivos(); return feitos;
}
function tirar(s){ if (vivo(s)) ctx.guardarSelvagem(s); meus = meus.filter(x => x !== s); pintarVivos(); }
function pintarVivos(){
  const ul = $('cap-vivos'); if (!ul) return;
  const a = ctx.jogo.ash;
  meus = meus.filter(vivo);                                             // capturado / fugiu / morreu: some da lista
  ul.innerHTML = meus.map((s, i) => `<li>${s.shiny ? '✨ ' : ''}<b>${esc(s.nome)}</b> Lv${s.lv} ${s.perfil === 'agressivo' ? '⚔' : '🏃'}<small>${Math.round(Math.hypot(s.x - a.x, s.z - a.z))} m</small><button data-i="${i}" class="perigo" title="tirar da cena">✕</button></li>`).join('') || '<li class="k">nenhum povoado por você</li>';
  ul.querySelectorAll('button[data-i]').forEach(b => b.onclick = () => tirar(meus[+b.dataset.i]));
  $('cap-conta').textContent = meus.length + ' seu(s) · ' + ctx.jogo.selvagens.length + ' no mapa';
}

/* ---------------------------------------------------------------- seguidor, roupa, teleporte, bolas */
async function trocarSeguidor(dex, shiny){
  status('carregando ' + nomeDex(dex) + '…');
  const p = await ctx.jogo.trocarSeguidor(glbDe(dex));
  p.shiny = !!shiny; ctx.aplicarShinyCampo(p.pivo, !!shiny);
  cena.seguidor = { dex: +dex, shiny: !!shiny }; salvar();
  status('seguidor: ' + (shiny ? '✨ ' : '') + nomeDex(dex));
}
function irPara(area){
  const c = ctx.centroArea.get(+area); if (!c) return status('área sem centro conhecido');
  let x = c.cx, z = c.cz, y = ctx.livre(x, z) ? ctx.chaoEm(x, z) : null;
  for (let k = 0; k < 24 && y == null; k++){ const ang = k * 1.1, d = 3 + k * 1.5; x = c.cx + Math.sin(ang) * d; z = c.cz + Math.cos(ang) * d; y = ctx.livre(x, z) ? ctx.chaoEm(x, z) : null; }
  if (y == null) return status('não achei chão nessa área');
  const a = ctx.jogo.ash, p = ctx.jogo.pika;
  for (const e of [a, p]){ if (!e) continue; const dx = e === a ? 0 : 1.2, dz = e === a ? 0 : 1; e.x = x + dx; e.z = z + dz; e.y = ctx.chaoEm(e.x, e.z) ?? y; e.vx = e.x; e.vz = e.z; e.vy = e.y; e.pivo.position.set(e.x, e.y, e.z); e.alvoClique = null; }
  status('teleportado pra ' + ctx.nomeArea(+area));
}
function darBolas(id, n){ const b = ctx.jogo.bolas; b[id] = (b[id] || 0) + n; ctx.gravarLS('bolas', b); ctx.pintarHud(); status(`+${n} ${({ 1001: 'Pokébola', 1002: 'Grande Bola', 1003: 'Ultra Bola', 1004: 'Bola Mestra' })[id]} (tem ${b[id]})`); }

/* ---------------------------------------------------------------- textos */
function pintarBanner(){ banner.innerHTML = '<b>' + esc(cena.banner.titulo) + '</b><span>' + esc(cena.banner.sub) + '</span>'; }
let flashT = 0;
function mostrarFlash(a, b, seg){ flash.innerHTML = '<b>' + esc(a) + '</b><span>' + esc(b) + '</span>'; flash.classList.add('on'); const meu = ++flashT; setTimeout(() => { if (meu === flashT) flash.classList.remove('on'); }, (seg || 1.6) * 1000); }

/* ---------------------------------------------------------------- persistência */
function salvar(){ ctx.gravarLS('captura.cena', cena); }
function pintarReceitas(){
  const ul = $('cap-receitas');
  ul.innerHTML = cena.receitas.map((r, i) => `<li>${r.shiny ? '✨ ' : ''}<b>${esc(nomeDex(r.dex))}</b> ×${r.n} Lv${r.lv || '?'} ${r.perfil === 'agressivo' ? '⚔' : r.perfil === 'arisco' ? '🏃' : '🎲'} <small>${r.frente ? 'na frente' : r.raio + ' m'}</small><button data-run="${i}" title="povoar agora">▶</button><button data-del="${i}" class="perigo">✕</button></li>`).join('') || '<li class="k">nenhuma receita salva</li>';
  ul.querySelectorAll('[data-run]').forEach(b => b.onclick = () => povoar(cena.receitas[+b.dataset.run]).then(k => status(k + ' nasceram')));
  ul.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { cena.receitas.splice(+b.dataset.del, 1); pintarReceitas(); salvar(); });
}

/* ---------------------------------------------------------------- painel */
function montarPainel(){
  const skins = ctx.Personagem.SKINS.map(s => `<option value="${s.id}">${esc(s.nome)} (${s.sexo})</option>`).join('');
  const areas = [...ctx.centroArea.keys()].sort((a, b) => a - b).map(a => `<option value="${a}">${esc(ctx.nomeArea(a))}</option>`).join('');
  painel = document.createElement('div'); painel.id = 'cap';
  painel.innerHTML = `
    <div class="linha"><b style="color:#ffe07a">🎥 Cena de captura</b> <span class="k">H esconde · F9 flash</span></div>
    <div id="cap-status" class="k">spawn natural desligado: só aparece quem você povoar</div>
    <h2>Cena</h2>
    <label><span>mapa</span><select id="c-mapa"><option value="pallet_rota1">Pallet + Rota 1 (leve)</option><option value="kanto">Kanto inteira</option><option value="casa">Terreno (lote)</option></select><button id="c-ir">ir</button></label>
    <label><span>teleporte</span><select id="c-area">${areas}</select><button id="c-tele">ir</button></label>
    <div class="linha"><button id="c-exportar">Exportar cena</button><button id="c-importar">Importar</button><input type="file" id="c-arq" accept="application/json" hidden><button id="c-limpar" class="perigo">Limpar receitas</button></div>
    <h2>Você</h2>
    <label><span>roupa</span><select id="v-skin">${skins}</select><button id="v-rand" title="skin e cores aleatórias">🎲</button><button id="v-ok">trocar</button></label>
    <label><span>seguidor</span><input type="number" id="v-dex" value="25" min="1" max="1025" style="flex:.6"><span id="v-nome" style="min-width:0;flex:1"></span><button id="v-dex-rand">🎲</button></label>
    <label><input type="checkbox" id="v-shiny"> seguidor shiny <button id="v-seg-ok" class="ok" style="margin-left:auto">trocar seguidor</button></label>
    <h2>Selvagens</h2>
    <label><span>Pokémon</span><input type="number" id="s-dex" value="16" min="1" max="1025" style="flex:.6"><span id="s-nome" style="min-width:0;flex:1"></span><button id="s-dex-rand">🎲</button></label>
    <label><span>nível</span><input type="number" id="s-lv" value="5" min="1" max="100" style="flex:.5"><span>perfil</span><select id="s-perfil" style="flex:1"><option value="">sorteia</option><option value="agressivo">⚔ agressivo (vem pra cima)</option><option value="arisco">🏃 arisco (foge)</option></select></label>
    <label><span>quantos</span><input type="number" id="s-n" value="3" min="1" max="12" style="flex:.5"><span>raio m</span><input type="number" id="s-raio" value="10" min="4" max="30" style="flex:.5"><input type="checkbox" id="s-shiny"> ✨ shiny</label>
    <div class="linha"><button id="s-volta" class="ok">povoar em volta</button><button id="s-frente">1 na frente</button><button id="s-guardar" title="guarda esta configuração pra repetir depois">+ receita</button></div>
    <div class="k">receitas (▶ povoa de novo; tudo fica salvo):</div>
    <ul id="cap-receitas"></ul>
    <div class="linha"><button id="s-tudo">▶ povoar todas as receitas</button><button id="s-limpar" class="perigo">tirar os meus</button></div>
    <div class="k" id="cap-conta"></div>
    <ul id="cap-vivos"></ul>
    <h2>Mochila</h2>
    <div class="linha"><button id="b-1001">+10 Pokébola</button><button id="b-1002">+10 Grande</button><button id="b-1003">+10 Ultra</button><button id="b-1004">+1 Mestra</button></div>
    <h2>Textos</h2>
    <label><span>título</span><input id="t-titulo"></label>
    <label><span>subtítulo</span><input id="t-sub"></label>
    <label><span>flash</span><input id="t-fa" placeholder="grande"><input id="t-fb" placeholder="pequeno" style="flex:.8"><button id="t-flash">▶</button></label>
    <h2>Câmera</h2>
    <label><span>zoom</span><input type="range" id="c-zoom" min="0.35" max="3" step="0.05"><span id="c-zoomv"></span></label>
    <div class="k">a câmera é a do jogo (botão direito arrasta, roda dá zoom). Tab mira o selvagem mais perto; golpes nos atalhos; bola no atalho da Pokébola.</div>
    <div class="k" style="margin-top:10px">OBS: monta a cena, aperta H pra sumir o painel e grava jogando.</div>`;
  document.body.appendChild(painel);
  const dica = document.createElement('div'); dica.id = 'cap-dica'; dica.textContent = 'H: painel · F9: flash'; document.body.appendChild(dica);
  // cena
  $('c-mapa').value = ctx.mapaNome === 'kanto' ? 'kanto' : ctx.mapaNome === 'casa' ? 'casa' : 'pallet_rota1';
  $('c-ir').onclick = () => { const u = new URL(location.href); u.searchParams.set('mapa', $('c-mapa').value); u.searchParams.delete('chegada'); location.href = u.toString(); };
  $('c-tele').onclick = () => irPara($('c-area').value);
  $('c-exportar').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(cena, null, 1)], { type: 'application/json' })); a.download = 'cena_captura.json'; a.click(); };
  $('c-importar').onclick = () => $('c-arq').click();
  $('c-arq').onchange = () => { const f = $('c-arq').files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const d = JSON.parse(String(r.result)); cena.receitas = d.receitas || []; cena.banner = d.banner || cena.banner; cena.seguidor = d.seguidor || cena.seguidor; salvar(); pintarReceitas(); pintarBanner(); status('cena importada'); } catch { status('JSON inválido'); } }; r.readAsText(f); };
  $('c-limpar').onclick = () => { cena.receitas = []; pintarReceitas(); salvar(); };
  // você
  $('v-rand').onclick = () => { const s = rnd(ctx.Personagem.SKINS); const p = { tipo: s.id }; if (s.tinta){ p.cores = {}; for (const k of Object.keys(ctx.Personagem.PADRAO[s.tinta] || {})) p.cores[k] = k === 'pele' ? rnd(['#ffcbaa', '#f2b58e', '#c98c62', '#8d5a3c']) : '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'); } $('v-skin').value = p.tipo; $('v-skin').dataset.cores = JSON.stringify(p.cores || null); status('roupa sorteada: ' + ctx.Personagem.nomeDe(p) + ' — clique em trocar'); };
  $('v-skin').onchange = () => { delete $('v-skin').dataset.cores; };
  $('v-ok').onclick = async () => { const cores = $('v-skin').dataset.cores ? JSON.parse($('v-skin').dataset.cores) : null; const p = { tipo: $('v-skin').value, ...(cores ? { cores } : {}) }; status('trocando roupa…'); await ctx.jogo.trocarJogador(p); cena.roupa = p; salvar(); status('roupa: ' + ctx.Personagem.nomeDe(p)); };
  const nomes = () => { $('v-nome').textContent = nomeDex($('v-dex').value); $('s-nome').textContent = nomeDex($('s-dex').value); };
  if (cena.seguidor){ $('v-dex').value = cena.seguidor.dex; $('v-shiny').checked = !!cena.seguidor.shiny; }
  nomes(); $('v-dex').oninput = nomes; $('s-dex').oninput = nomes;
  $('v-dex-rand').onclick = () => { $('v-dex').value = rnd(DEX_RAND); nomes(); };
  $('v-seg-ok').onclick = () => trocarSeguidor(+$('v-dex').value, $('v-shiny').checked).catch(e => status('seguidor não carregou: ' + (e?.message || e)));
  // selvagens
  const receita = frente => ({ dex: +$('s-dex').value, lv: +$('s-lv').value || 0, perfil: $('s-perfil').value, shiny: $('s-shiny').checked, n: frente ? 1 : Math.max(1, Math.min(12, +$('s-n').value || 1)), raio: Math.max(4, Math.min(30, +$('s-raio').value || 10)), frente: !!frente });
  $('s-dex-rand').onclick = () => { $('s-dex').value = rnd(DEX_RAND); nomes(); };
  $('s-volta').onclick = () => { status('povoando…'); povoar(receita(false)).then(k => status(k + ' ' + nomeDex($('s-dex').value) + ' em volta de você')); };
  $('s-frente').onclick = () => { status('povoando…'); povoar(receita(true)).then(k => status(k ? nomeDex($('s-dex').value) + ' na sua frente' : 'não coube na frente')); };
  $('s-guardar').onclick = () => { cena.receitas.push(receita(false)); pintarReceitas(); salvar(); status('receita guardada'); };
  $('s-tudo').onclick = async () => { let t = 0; for (const r of cena.receitas) t += await povoar(r); status(t + ' nasceram (todas as receitas)'); };
  $('s-limpar').onclick = () => { for (const s of [...meus]) tirar(s); status('seus selvagens saíram de cena'); };
  // mochila
  for (const [id, n] of [[1001, 10], [1002, 10], [1003, 10], [1004, 1]]) $('b-' + id).onclick = () => darBolas(id, n);
  // textos
  $('t-titulo').value = cena.banner.titulo; $('t-sub').value = cena.banner.sub;
  $('t-titulo').oninput = () => { cena.banner.titulo = $('t-titulo').value; pintarBanner(); salvar(); };
  $('t-sub').oninput = () => { cena.banner.sub = $('t-sub').value; pintarBanner(); salvar(); };
  $('t-flash').onclick = () => mostrarFlash($('t-fa').value, $('t-fb').value, 1.6);
  // câmera
  $('c-zoom').oninput = () => { ctx.cam.zoom = +$('c-zoom').value; };
  pintarReceitas(); pintarVivos();
}

/* ---------------------------------------------------------------- teclas e laço */
function controles(){
  const digitando = e => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName);
  window.addEventListener('keydown', e => {
    if (digitando(e)) return;
    if (e.code === 'KeyH'){ painel.classList.toggle('esc'); document.body.classList.toggle('cap-escondido', painel.classList.contains('esc')); e.preventDefault(); e.stopImmediatePropagation(); }
    if (e.code === 'F9'){ mostrarFlash($('t-fa').value, $('t-fb').value, 1.6); e.preventDefault(); }
  }, true);
  setInterval(() => {
    if ($('c-zoom') && document.activeElement !== $('c-zoom')){ $('c-zoom').value = ctx.cam.zoom; $('c-zoomv').textContent = (+ctx.cam.zoom).toFixed(2); }
    if (!painel.classList.contains('esc')) pintarVivos();
  }, 1000);
}

export async function abrir(c){
  ctx = c;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  banner = document.createElement('div'); banner.id = 'cap-topo'; document.body.appendChild(banner);
  flash = document.createElement('div'); flash.id = 'cap-flash'; document.body.appendChild(flash);
  const salvo = ctx.lerLS('captura.cena', null);
  cena = { banner: salvo?.banner || { titulo: '', sub: '' }, seguidor: salvo?.seguidor || null, roupa: salvo?.roupa || null, receitas: salvo?.receitas || [] };
  montarPainel(); pintarBanner(); controles();
  // o seguidor salvo já nasce pelo jogo (LS `seguidor`); aqui só devolvo o shiny dele
  if (cena.seguidor?.shiny && ctx.jogo.pika && ctx.jogo.pika.glb === glbDe(cena.seguidor.dex)){ ctx.jogo.pika.shiny = true; ctx.aplicarShinyCampo(ctx.jogo.pika.pivo, true); }
  window.__captura = { cena: () => cena, meus: () => meus, povoar, trocarSeguidor, irPara, darBolas, mostrarFlash, ctx };   // ctx exposto pra depuração/varreduras headless
}
