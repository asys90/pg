/* Painel admin — Jogadores (Fase 1): buscar conta, ver quem está online e onde, mexer em bolsa e time, cargo, moderação e
 * código de recuperação. Tudo passa pelas rotas /admin/jogador* do servidor, que validam, gravam, registram no admin_log e
 * avisam o jogador online na hora (bolsa e time chegam sem ele reentrar). Senha e token nunca chegam aqui. */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dataHora = ms => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const NATUREZAS = ['Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty', 'Bold', 'Docile', 'Relaxed', 'Impish', 'Lax', 'Timid', 'Hasty', 'Serious',
  'Jolly', 'Naive', 'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash', 'Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky'];
const IVS = [['hp', 'HP'], ['atk', 'Atq'], ['def', 'Def'], ['spa', 'AtE'], ['spd', 'DfE'], ['vel', 'Vel']];
const ivsDe = p => Array.isArray(p?.ivs) ? p.ivs : IVS.map(([k]) => +p?.ivs?.[k] || 0);   // o jogo grava lista de 6; objeto {hp…} é o formato antigo do servidor
// Fase 3: destinos do "Levar" (as chaves são as do /tp do chat — servidor_moderacao.mjs CIDADES)
const CIDADES = [['pallet', 'Pallet (laboratório)'], ['viridian', 'Viridian'], ['pewter', 'Pewter'], ['cerulean', 'Celeste'], ['vermilion', 'Vermilion'],
  ['lavender', 'Lavanda'], ['celadon', 'Celadon'], ['saffron', 'Saffron'], ['fuchsia', 'Fuchsia'], ['cinnabar', 'Cinnabar']];

/** `canal` = BroadcastChannel do painel (pra levar o seu personagem até o jogador); `resolverEspecie` vem do admin.mjs. */
export function instalarJogadores({ api, toast, canal, resolverEspecie }) {
  let sel = null, det = null, ref = null, edTime = null, sujoBolsa = false, sujoTime = false;

  async function referencia() {
    if (ref) return ref;
    const d = await fetch('/data/menus_dados.json').then(r => r.json()).catch(() => ({}));
    const itens = d.itens || {};
    ref = { itens, tipos: d.tipos || {}, insignias: d.insignias || [],
      bolas: Object.entries(itens).filter(([, i]) => i.t === 7).map(([id, i]) => ({ id, nome: i.n })).sort((a, b) => a.id - b.id) };
    $('dl-itens').innerHTML = Object.entries(itens).filter(([, i]) => i.t !== 7).map(([id, i]) => `<option value="${id} ${esc(i.n)}">`).join('');
    return ref;
  }
  const nomeItem = id => ref?.itens[id]?.n || ('item ' + id);

  // ── Lista ────────────────────────────────────────────────────────────────────
  async function renderLista() {
    const q = $('j-busca').value.trim(), online = $('j-online').checked;
    const r = await api('/admin/jogadores?q=' + encodeURIComponent(q) + (online ? '&online=1' : ''));
    if (!r.ok) { toast(r.erro || 'Falha ao listar.', true); return; }
    $('j-qtd').textContent = `${r.total} conta(s) · ${r.online} conexão(ões) agora`;
    $('j-lista').innerHTML = r.jogadores.map(j => `<button data-u="${esc(j.usuario)}" class="${j.usuario === sel ? 'atual' : ''}">
        <span class="bola" style="background:${j.online ? '#3ecf8e' : '#3a4256'}" title="${j.online ? 'online' : 'offline'}"></span>
        <span style="flex:1;min-width:0"><b>${esc(j.nome || j.usuario)}</b> <span class="fraco">${esc(j.usuario)}</span>
          ${j.online ? `<br><small class="fraco">${esc(j.online.mapa)} · x ${j.online.x} z ${j.online.z}</small>` : ''}</span>
        ${j.gm ? '<span class="selo gm">GM</span>' : ''}${j.banidoAte ? '<span class="selo ban">banido</span>' : ''}${j.mudoAte ? '<span class="selo mudo">mudo</span>' : ''}
      </button>`).join('')
      + (r.visitantes.length ? `<div class="fraco" style="margin-top:8px;font-size:12px">Sem conta: ${r.visitantes.map(v => esc(v.usuario) + ' (' + esc(v.online.mapa) + ')').join(', ')}</div>` : '')
      || '<span class="fraco">Ninguém encontrado.</span>';
    for (const b of $('j-lista').querySelectorAll('button')) b.onclick = () => abrir(b.dataset.u);
  }

  // ── Ficha ────────────────────────────────────────────────────────────────────
  async function abrir(u) {
    if ((sujoBolsa || sujoTime) && u !== sel && !confirm('Há alterações não salvas na bolsa/time deste jogador. Descartar?')) return;
    const [r] = await Promise.all([api('/admin/jogador?u=' + encodeURIComponent(u)), referencia()]);
    if (!r.ok) { toast(r.erro || 'Falha ao abrir.', true); return; }
    sel = u; aplicar(r); renderLista();
  }
  function aplicar(r) {                                                   // resposta do servidor (abrir ou depois de qualquer ação)
    det = r; sujoBolsa = sujoTime = false;
    edTime = { time: (r.save.time || []).map(p => ({ ...p })), caixa: (r.save.caixa || []).map(p => ({ ...p })) };
    renderFicha();
  }
  async function acao(nome, corpo, ok) {
    const r = await api('/admin/jogador/' + nome, 'POST', { u: sel, ...corpo });
    if (!r.ok) { toast(r.erro || 'Não deu.', true); return null; }
    aplicar(r); renderLista(); if (ok) toast(ok);
    return r;
  }

  function renderFicha() {
    const c = det.conta, s = det.save;
    const status = [c.online ? `🟢 online em <b>${esc(c.online.mapa)}</b> (x ${c.online.x}, z ${c.online.z})` : '⚪ offline',
      c.banidoAte ? `⛔ banido ${c.banidoAte === -1 ? 'para sempre' : 'até ' + dataHora(c.banidoAte)}${c.banMotivo ? ' — ' + esc(c.banMotivo) : ''}` : '',
      c.mudoAte ? `🔇 silenciado até ${dataHora(c.mudoAte)}` : ''].filter(Boolean).join(' · ');
    $('j-ficha').innerHTML = `
      <div class="topo-edit"><h2>${esc(c.nome || c.usuario)} <span class="fraco" style="font-size:14px">${esc(c.usuario)}</span></h2>
        <button id="j-atualizar">Atualizar</button>
        ${c.online ? '<button id="j-ir" title="Leva o SEU personagem até ele (o jogo precisa estar aberto em outra aba, no mesmo mapa)">Ir até lá no jogo</button><button id="j-recado">Mandar recado</button><button id="j-kick" class="perigo">Desconectar</button>' : ''}</div>
      <div class="fraco">${status}</div>
      <div class="j-grade">
        <div class="caixa"><h3>Conta</h3>
          <div class="form">
            <label class="inteira">E-mail <input type="text" value="${esc(c.email)}" readonly></label>
            <label class="chk"><input type="checkbox" id="j-gm" ${c.gm ? 'checked' : ''}> GM (abre o painel)</label>
            <label>Cargo no chat <select id="j-cargo"><option value="">nenhum</option><option value="staff"${c.cargo === 'staff' ? ' selected' : ''}>[STAFF]</option><option value="mod"${c.cargo === 'mod' ? ' selected' : ''}>[MOD]</option></select></label>
          </div>
          <div class="acoes" style="margin-top:10px"><button id="j-cargo-ok">Salvar cargo</button><button id="j-codigo" title="Gera um código novo pro jogador trocar a senha (o antigo para de valer)">Gerar código de recuperação</button></div>
          <div id="j-codigo-caixa"></div>
        </div>
        <div class="caixa"><h3>Moderação</h3>
          <div class="form">
            <label class="inteira">Motivo (aparece pro jogador) <input type="text" id="j-motivo" maxlength="120" placeholder="opcional"></label>
            <label>Silenciar por <select id="j-mudo-min"><option value="5">5 min</option><option value="30">30 min</option><option value="60">1 hora</option><option value="1440">1 dia</option></select></label>
            <label>Banir por <select id="j-ban-min"><option value="60">1 hora</option><option value="1440">1 dia</option><option value="10080">7 dias</option><option value="43200">30 dias</option><option value="-1">para sempre</option></select></label>
          </div>
          <div class="acoes" style="margin-top:10px">
            ${c.mudoAte ? '<button id="j-desmutar">Tirar silêncio</button>' : '<button id="j-mudo">Silenciar</button>'}
            ${c.banidoAte ? '<button id="j-perdoar">Perdoar banimento</button>' : '<button id="j-banir" class="perigo">Banir</button>'}
          </div>
          <div class="acoes" style="margin-top:8px" title="O mesmo que /tp nome cidade no chat: online, a cena dele recarrega lá; offline, nasce lá na próxima entrada">
            <select id="j-levar-cidade">${CIDADES.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select><button id="j-levar">Levar pra frente do Centro</button>
          </div>
          <div class="fraco" style="font-size:11px;margin-top:6px">No chat do jogo (GM): /ver /mudo /kick /banir /perdoar /tp /ir /puxar /aviso — dão o mesmo resultado destes botões.</div>
        </div>
        <div class="caixa j-larga"><h3>Bolsa <span class="sujo" id="j-sujo-bolsa" hidden>● não salvo</span></h3>
          <div class="form">
            <label>Dinheiro <input type="number" id="j-dinheiro" min="0" step="1" value="${s.dinheiro ?? ''}" placeholder="padrão do jogo"></label>
          </div>
          <h4>Pokébolas</h4>
          <div class="j-bolas">${ref.bolas.map(b => `<label>${esc(b.nome)} <input type="number" min="0" max="999999" data-bola="${b.id}" value="${s.bolas?.[b.id] || 0}"></label>`).join('')}</div>
          <h4>Itens</h4>
          <table class="esp"><thead><tr><th>Item</th><th>Qtd</th><th></th></tr></thead><tbody id="j-itens">
            ${Object.entries(s.itens || {}).map(([id, q]) => linhaItem(id, q)).join('') || ''}</tbody></table>
          <div class="add-esp"><input type="text" list="dl-itens" id="j-item-add" placeholder="adicionar item (nome ou nº)…"><button id="j-item-ok">Adicionar</button></div>
          <h4>Insígnias</h4>
          <div class="j-insignias">${ref.insignias.map(i => `<label class="chk" title="geração ${i.gen}"><input type="checkbox" data-ins="${i.id}" ${(s.insignias || []).includes(i.id) ? 'checked' : ''}> ${esc(i.n)}</label>`).join('')}</div>
          <div class="acoes" style="margin-top:12px"><button class="prim" id="j-bolsa-ok">Salvar bolsa</button></div>
        </div>
        <div class="caixa j-larga"><h3>Time e caixa <span class="sujo" id="j-sujo-time" hidden>● não salvo</span></h3>
          <div id="j-time"></div>
          <h4>Dar Pokémon</h4>
          <div class="add-esp" style="grid-template-columns:1fr 70px auto auto"><input type="text" list="dl-especies" id="j-dar-esp" placeholder="espécie (nome ou nº)…">
            <input type="number" id="j-dar-lv" min="1" max="100" value="5" title="nível"><label class="chk"><input type="checkbox" id="j-dar-shiny"> shiny</label><button id="j-dar-ok">Dar</button></div>
          <div class="fraco" style="font-size:12px;margin-top:6px">IVs e natureza são sorteados pelo servidor, como numa captura. Vai pro time (ou pra caixa, se o time estiver cheio).</div>
          <div class="acoes" style="margin-top:12px"><button class="prim" id="j-time-ok">Salvar time</button></div>
        </div>
        <div class="caixa j-larga"><h3>Histórico do painel</h3>
          ${det.log.length ? `<table class="dados backups"><tbody>${det.log.map(e => `<tr><td>${esc(dataHora(e.quando))}</td><td>${esc(e.gm)}</td><td><b>${esc(e.acao)}</b> ${esc(resumoLog(e))}</td></tr>`).join('')}</tbody></table>` : '<span class="fraco">Nenhuma ação do painel nesta conta ainda.</span>'}
        </div>
      </div>`;
    renderTime(); ligarFicha();
  }
  const linhaItem = (id, q) => `<tr data-item="${esc(id)}"><td>${esc(nomeItem(id))} <span class="fraco">${esc(id)}</span></td><td><input type="number" min="0" max="999999" value="${q}"></td><td><button class="perigo rem" title="Tirar">✕</button></td></tr>`;
  function resumoLog(e) {
    const d = e.depois || {};
    if (e.acao === 'bolsa') return 'dinheiro ' + (e.antes?.dinheiro ?? '—') + ' → ' + (d.dinheiro ?? '—');
    if (e.acao === 'time') return (e.antes?.time?.length ?? 0) + '+' + (e.antes?.caixa?.length ?? 0) + ' → ' + (d.time?.length ?? 0) + '+' + (d.caixa?.length ?? 0) + ' (time+caixa)';
    if (e.acao === 'deu pokemon') return (d.nome || '#' + d.dex) + ' Nv ' + d.lv + (d.shiny ? ' ✨' : '') + ' → ' + d.lugar;
    if (e.acao === 'cargo') return (d.gm ? 'GM' : 'sem GM') + (d.cargo ? ' · ' + d.cargo : '');
    if (e.acao === 'banir') return (d.banidoAte === -1 ? 'para sempre' : 'até ' + dataHora(d.banidoAte)) + (d.motivo ? ' — ' + d.motivo : '');
    if (e.acao === 'silenciar') return 'até ' + dataHora(d.mudoAte) + (d.motivo ? ' — ' + d.motivo : '');
    if (e.acao === 'recado') return '"' + (d.texto || '') + '"';
    if (/^(levar|tp|puxar|ir até)/.test(e.acao)) return (d.nome ? d.nome + ' · ' : '') + d.mapa + ' (' + d.x + ', ' + d.z + ')';   // Fase 3 (também os do chat)
    if (/^aviso/.test(e.acao)) return '"' + (d.texto || '') + '"';
    return '';
  }

  function renderTime() {
    const linha = (p, onde, i) => `<tr data-onde="${onde}" data-i="${i}">
      <td><b>${esc(p.nome || '#' + p.dex)}</b> <span class="fraco">${String(p.dex).padStart(4, '0')}</span>${p.inicial ? ' <span class="selo">inicial</span>' : ''}</td>
      <td><input type="number" class="lv" min="1" max="100" value="${p.lv || 1}"></td>
      <td><label class="chk"><input type="checkbox" class="shiny" ${p.shiny ? 'checked' : ''}> ✨</label></td>
      <td><select class="nat">${NATUREZAS.map(n => `<option${n === p.natureza ? ' selected' : ''}>${n}</option>`).join('')}</select></td>
      <td class="j-ivs">${IVS.map(([k, r], i) => `<input type="number" min="0" max="31" data-iv="${i}" value="${ivsDe(p)[i]}" title="${r}">`).join('')}</td>
      <td><button class="mover" title="${onde === 'time' ? 'Mandar pra caixa' : 'Trazer pro time'}">${onde === 'time' ? '↓' : '↑'}</button><button class="perigo rem" title="Soltar">✕</button></td></tr>`;
    const tabela = (lista, onde) => lista.length
      ? `<table class="esp j-mons"><thead><tr><th>${onde === 'time' ? 'Time' : 'Caixa'} (${lista.length})</th><th>Nv</th><th></th><th>Natureza</th><th>IVs (HP Atq Def AtE DfE Vel)</th><th></th></tr></thead><tbody>${lista.map((p, i) => linha(p, onde, i)).join('')}</tbody></table>`
      : `<div class="fraco" style="margin:6px 0">${onde === 'time' ? 'Time vazio.' : 'Caixa vazia.'}</div>`;
    const el = $('j-time'); if (!el) return;
    el.innerHTML = tabela(edTime.time, 'time') + tabela(edTime.caixa, 'caixa');
    for (const tr of el.querySelectorAll('tr[data-onde]')) {
      const lista = edTime[tr.dataset.onde], p = lista[+tr.dataset.i];
      const mexeu = () => { sujoTime = true; $('j-sujo-time').hidden = false; };
      tr.querySelector('.lv').oninput = e => { p.lv = Math.round(+e.target.value); mexeu(); };
      tr.querySelector('.shiny').onchange = e => { p.shiny = e.target.checked; mexeu(); };
      tr.querySelector('.nat').onchange = e => { p.natureza = e.target.value; mexeu(); };
      for (const inp of tr.querySelectorAll('[data-iv]')) inp.oninput = () => { p.ivs = ivsDe(p).slice(); p.ivs[+inp.dataset.iv] = Math.round(+inp.value); mexeu(); };
      tr.querySelector('.mover').onclick = () => {
        const destino = tr.dataset.onde === 'time' ? 'caixa' : 'time';
        if (destino === 'time' && edTime.time.length >= 6) { toast('O time já tem 6.', true); return; }
        lista.splice(+tr.dataset.i, 1); edTime[destino].push(p); mexeu(); renderTime(); $('j-sujo-time').hidden = false;
      };
      tr.querySelector('.rem').onclick = () => {
        if (!confirm(`Soltar ${p.nome || 'este Pokémon'} (Nv ${p.lv})? Some da conta quando você salvar.`)) return;
        lista.splice(+tr.dataset.i, 1); mexeu(); renderTime(); $('j-sujo-time').hidden = false;
      };
    }
  }

  function ligarFicha() {
    const mexeuBolsa = () => { sujoBolsa = true; $('j-sujo-bolsa').hidden = false; };
    $('j-atualizar').onclick = () => abrir(sel);
    if ($('j-ir')) $('j-ir').onclick = () => { const o = det.conta.online; canal.postMessage({ t: 'tp', x: o.x, z: o.z, mapa: o.mapa }); toast('Pedido enviado ao seu jogo (se estiver aberto no mapa ' + o.mapa + ').'); };
    if ($('j-recado')) $('j-recado').onclick = () => { const texto = prompt('Recado pro jogador (aparece no chat dele como mensagem do GM):'); if (texto?.trim()) acao('moderar', { acao: 'recado', texto }, 'Recado enviado.'); };
    if ($('j-kick')) $('j-kick').onclick = () => { if (confirm('Desconectar ' + det.conta.usuario + ' agora? (ele pode entrar de novo)')) acao('moderar', { acao: 'desconectar', motivo: $('j-motivo').value }, 'Desconectado.'); };
    $('j-cargo-ok').onclick = () => acao('cargo', { gm: $('j-gm').checked, cargo: $('j-cargo').value || null }, 'Cargo salvo.');
    $('j-codigo').onclick = async () => {
      if (!confirm('Gerar um código novo de recuperação de senha? O código antigo deixa de valer.')) return;
      const r = await acao('codigo', {}, 'Código gerado.');
      if (!r?.codigo) return;
      $('j-codigo-caixa').innerHTML = `<div class="j-codigo">Código: <code>${esc(r.codigo)}</code> <button id="j-copiar">Copiar</button><div class="fraco" style="font-size:12px">Passe pro jogador: ele usa em "Esqueci a senha" com o usuário <b>${esc(sel)}</b>. Só aparece agora.</div></div>`;
      $('j-copiar').onclick = () => navigator.clipboard?.writeText(r.codigo).then(() => toast('Copiado.'), () => toast('Não deu pra copiar.', true));
    };
    if ($('j-mudo')) $('j-mudo').onclick = () => acao('moderar', { acao: 'mudo', minutos: +$('j-mudo-min').value, motivo: $('j-motivo').value }, 'Silenciado.');
    if ($('j-desmutar')) $('j-desmutar').onclick = () => acao('moderar', { acao: 'desmutar' }, 'Pode falar de novo.');
    if ($('j-banir')) $('j-banir').onclick = () => {
      const min = +$('j-ban-min').value, txt = min === -1 ? 'para sempre' : $('j-ban-min').selectedOptions[0].textContent;
      if (confirm(`Banir ${det.conta.usuario} por ${txt}? Ele é desconectado e não consegue entrar até lá.`)) acao('moderar', { acao: 'banir', minutos: min, motivo: $('j-motivo').value }, 'Banido.');
    };
    if ($('j-perdoar')) $('j-perdoar').onclick = () => acao('moderar', { acao: 'perdoar' }, 'Banimento retirado.');
    $('j-levar').onclick = () => {                                       // Fase 3: o mesmo do /tp nome cidade
      const cid = $('j-levar-cidade').value, nome = $('j-levar-cidade').selectedOptions[0].textContent;
      if (confirm(`Levar ${det.conta.usuario} pra ${nome}?` + (det.conta.online ? ' A cena dele recarrega agora.' : ' Ele nasce lá na próxima entrada.'))) acao('moderar', { acao: 'levar', cidade: cid }, 'Levado pra ' + nome + '.');
    };
    // bolsa
    $('j-dinheiro').oninput = mexeuBolsa;
    for (const i of document.querySelectorAll('#j-ficha [data-bola], #j-ficha [data-ins]')) i.addEventListener(i.type === 'checkbox' ? 'change' : 'input', mexeuBolsa);
    const ligarItens = () => {
      for (const tr of $('j-itens').querySelectorAll('tr')) {
        tr.querySelector('input').oninput = mexeuBolsa;
        tr.querySelector('.rem').onclick = () => { tr.remove(); mexeuBolsa(); };
      }
    };
    ligarItens();
    const addItem = () => {
      const v = $('j-item-add').value.trim(), id = (v.match(/^(\d+)/) || [])[1] || Object.keys(ref.itens).find(k => ref.itens[k].n.toLowerCase() === v.toLowerCase());
      if (!id || !ref.itens[id]) { toast('Item não encontrado.', true); return; }
      if (ref.itens[id].t === 7) { toast('Pokébola entra na lista de Pokébolas acima.', true); return; }
      const tr = $('j-itens').querySelector(`tr[data-item="${id}"]`);
      if (tr) { const inp = tr.querySelector('input'); inp.value = +inp.value + 1; }
      else $('j-itens').insertAdjacentHTML('beforeend', linhaItem(id, 1));
      $('j-item-add').value = ''; ligarItens(); mexeuBolsa();
    };
    $('j-item-ok').onclick = addItem;
    $('j-item-add').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } };
    $('j-bolsa-ok').onclick = () => {
      const corpo = { bolas: {}, itens: {}, insignias: [] }, din = $('j-dinheiro').value.trim();
      if (din !== '') corpo.dinheiro = Number(din);
      for (const i of document.querySelectorAll('#j-ficha [data-bola]')) if (+i.value > 0) corpo.bolas[i.dataset.bola] = Number(i.value);
      for (const tr of $('j-itens').querySelectorAll('tr')) { const q = Number(tr.querySelector('input').value); if (q > 0) corpo.itens[tr.dataset.item] = q; }
      for (const i of document.querySelectorAll('#j-ficha [data-ins]:checked')) corpo.insignias.push(+i.dataset.ins);
      acao('bolsa', corpo, 'Bolsa salva' + (det.conta.online ? ' — já chegou no jogo dele.' : '.'));
    };
    // time
    $('j-time-ok').onclick = () => {
      const enx = p => ({ uid: p.uid, lv: p.lv, shiny: !!p.shiny, natureza: p.natureza, ivs: p.ivs });
      acao('time', { time: edTime.time.map(enx), caixa: edTime.caixa.map(enx) }, 'Time salvo' + (det.conta.online ? ' — já chegou no jogo dele.' : '.'));
    };
    $('j-dar-ok').onclick = () => {
      const e = resolverEspecie($('j-dar-esp').value);
      if (!e) { toast('Espécie não encontrada ou sem modelo.', true); return; }
      if (sujoTime && !confirm('Dar o Pokémon agora descarta as mudanças não salvas no time. Continuar?')) return;
      acao('pokemon', { dex: e.dex, glb: e.glb.replace(/\.glb$/, ''), nome: e.nome, lv: +$('j-dar-lv').value, shiny: $('j-dar-shiny').checked }, e.nome + ' entregue.');
    };
  }

  // ── Ligar a tela ─────────────────────────────────────────────────────────────
  $('j-busca').addEventListener('input', () => { clearTimeout(renderLista.t); renderLista.t = setTimeout(renderLista, 250); });
  $('j-online').addEventListener('change', renderLista);
  $('j-recarregar').addEventListener('click', renderLista);
  for (const b of document.querySelectorAll('#lado button[data-vista="jogadores"]')) b.addEventListener('click', () => { referencia(); renderLista(); });
  setInterval(() => { if (!$('v-jogadores').hidden) renderLista(); }, 15000);   // quem entrou/saiu, sem precisar clicar
  addEventListener('beforeunload', e => { if (sujoBolsa || sujoTime) { e.preventDefault(); e.returnValue = ''; } });
}
