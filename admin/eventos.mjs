/* Painel admin — Eventos ao vivo (Fase 3): multiplicador de EXP e de shiny, densidade de selvagens (com janela de início/fim),
 * aviso global e modo manutenção. Fala com /admin/eventos* (servidor_eventos.mjs), que valida, grava public/data/eventos.json
 * com backup e EMPURRA pros jogadores online na hora — não precisa avisar a aba do jogo. */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dataHora = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
/** ISO ↔ valor do <input type="datetime-local"> (hora local). */
const paraCampo = iso => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const doCampo = v => v ? new Date(v).toISOString() : null;
const CSS = `
#v-eventos { overflow: auto; padding: 16px; display: grid; gap: 14px; align-content: start; }
#v-eventos .ev-grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 14px; align-items: start; }
#v-eventos .ev-agora { font-size: 15px; } #v-eventos .ev-agora b { color: var(--acento); }
#v-eventos .ev-mult { display: grid; grid-template-columns: 1fr auto; gap: 6px; align-items: center; }
#v-eventos .ev-mult .rapidos { display: flex; gap: 4px; } #v-eventos .ev-mult .rapidos button { padding: 3px 8px; font-size: 12px; }
#v-eventos textarea { background: #0f131b; border: 1px solid var(--borda); border-radius: 6px; padding: 6px 8px; color: var(--texto); font: inherit; min-height: 64px; resize: vertical; width: 100%; }
#v-eventos input[type=datetime-local] { background: #0f131b; border: 1px solid var(--borda); border-radius: 6px; padding: 5px 8px; color: var(--texto); }
#v-eventos .ev-manut-on { color: var(--erro); font-weight: 700; }
#v-eventos .ev-aviso { font-size: 12px; color: var(--fraco); margin-top: 6px; }`;

export function instalarEventos({ api, toast }) {
  let dados = null, efetivo = null, manutAgora = false, online = 0;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  async function carregar() {
    const r = await api('/admin/eventos');
    if (!r.ok) { $('v-eventos').innerHTML = `<div class="caixa">${esc(r.erro || 'Falha ao carregar.')}</div>`; return; }
    ({ dados, efetivo, manutencaoAgora: manutAgora, online } = r);
    render();
  }
  const multTxt = e => [`EXP ×${e.expMult}`, `shiny ×${e.shinyMult}`, `selvagens ×${e.densidade}`].join(' · ');
  const temEvento = e => e.expMult !== 1 || e.shinyMult !== 1 || e.densidade !== 1;

  function render() {
    const m = dados.manutencao || {};
    const agora = temEvento(efetivo)
      ? `🎉 <b>${esc(efetivo.nome || 'Evento sem nome')}</b> valendo agora: ${multTxt(efetivo)}${efetivo.fim ? ' — até ' + dataHora(efetivo.fim) : ''}`
      : efetivo.proximo ? `⏳ Evento agendado pra ${dataHora(efetivo.proximo)} (${multTxt(dados)})` : 'Nenhum evento valendo (tudo ×1).';
    const manut = manutAgora ? '<span class="ev-manut-on">🔧 MANUTENÇÃO LIGADA</span> — só GM entra.'
      : m.ativa && m.inicio ? `🔧 Manutenção agendada pra ${dataHora(m.inicio)} (avisa a 10, 5 e 1 minuto).` : '🟢 Jogo aberto.';
    $('v-eventos').innerHTML = `
      <div class="topo-edit"><h2>Eventos ao vivo</h2><button id="ev-atualizar">Atualizar</button></div>
      <div class="caixa ev-agora">${agora}<br>${manut} <span class="fraco">· ${online} jogador(es) online agora</span></div>
      <div class="ev-grade">
        <div class="caixa"><h3>Evento</h3>
          <div class="form">
            <label class="inteira">Nome (aparece no anúncio) <input type="text" id="ev-nome" maxlength="60" value="${esc(dados.nome)}" placeholder="ex.: Fim de semana de EXP em dobro"></label>
            ${campoMult('expMult', 'EXP ×', 0.1, 10, 0.1, [1, 1.5, 2, 3])}
            ${campoMult('shinyMult', 'Shiny ×', 1, 100, 1, [1, 2, 5, 10])}
            ${campoMult('densidade', 'Selvagens ×', 0.25, 3, 0.25, [1, 1.5, 2])}
            <label>Começa <input type="datetime-local" id="ev-inicio" value="${paraCampo(dados.inicio)}"></label>
            <label>Termina <input type="datetime-local" id="ev-fim" value="${paraCampo(dados.fim)}"></label>
            <label class="chk inteira"><input type="checkbox" id="ev-anunciar" checked> Anunciar no letreiro do topo ao aplicar</label>
          </div>
          <div class="ev-aviso">EXP: a de cada vitória contra selvagem. Shiny: divide a taxa (Configuração do jogo → 1 em ${'N'}) — vale no selvagem e na captura. Selvagens: quantos vivos por área e o ritmo de nascer. Vazio em "Começa" = agora; vazio em "Termina" = até alguém encerrar.</div>
          <div class="acoes" style="margin-top:12px"><button class="prim" id="ev-aplicar">Aplicar evento</button><button id="ev-encerrar">Encerrar (tudo ×1)</button></div>
        </div>
        <div class="caixa"><h3>Aviso global</h3>
          <textarea id="ev-texto" maxlength="200" placeholder="Aparece no letreiro passante do topo e no chat de todo mundo online."></textarea>
          <div class="acoes" style="margin-top:8px"><button class="prim" id="ev-avisar">Enviar a todos agora</button></div>
          <div class="ev-aviso">É o mesmo do comando /aviso no chat do jogo.</div>
        </div>
        <div class="caixa"><h3>Modo manutenção</h3>
          <div class="form">
            <label class="inteira">Texto pro jogador <input type="text" id="ev-mtexto" maxlength="200" value="${esc(m.texto || '')}" placeholder="O jogo está em manutenção. Volte daqui a pouco!"></label>
            <label class="inteira">Ligar em (vazio = agora) <input type="datetime-local" id="ev-minicio" value="${paraCampo(m.ativa ? m.inicio : null)}"></label>
          </div>
          <div class="acoes" style="margin-top:12px">${m.ativa ? '<button class="prim" id="ev-mdesligar">Desligar manutenção</button>' : '<button class="perigo" id="ev-mligar">Ligar manutenção</button>'}</div>
          <div class="ev-aviso">Ligada: quem não é GM é desconectado com o texto acima e não entra (login e jogo). Agendada: todo mundo recebe aviso a 10, 5 e 1 minuto.</div>
        </div>
      </div>`;
    ligar();
  }
  const campoMult = (k, rot, min, max, passo, rapidos) => `<label class="inteira">${rot}
      <div class="ev-mult"><input type="number" id="ev-${k}" min="${min}" max="${max}" step="${passo}" value="${dados[k]}">
      <span class="rapidos">${rapidos.map(v => `<button type="button" data-k="${k}" data-v="${v}">${v}</button>`).join('')}</span></div></label>`;

  async function salvar(novo, extra = {}, ok = 'Salvo.') {
    const r = await api('/admin/eventos', 'POST', { dados: novo, ...extra });
    if (!r.ok) { toast(r.erro || 'Não deu.', true); return false; }
    ({ dados, efetivo, manutencaoAgora: manutAgora } = r);
    toast(ok + (r.jogadores ? ` Chegou em ${r.jogadores} jogador(es).` : '') + (r.derrubou ? ` ${r.derrubou} desconectado(s).` : ''));
    render(); return true;
  }
  function ligar() {
    $('ev-atualizar').onclick = carregar;
    for (const b of document.querySelectorAll('#v-eventos .rapidos button')) b.onclick = () => { $('ev-' + b.dataset.k).value = b.dataset.v; };
    $('ev-aplicar').onclick = () => {
      const novo = { ...dados, nome: $('ev-nome').value.trim(), expMult: +$('ev-expMult').value, shinyMult: +$('ev-shinyMult').value, densidade: +$('ev-densidade').value,
        inicio: doCampo($('ev-inicio').value), fim: doCampo($('ev-fim').value) };
      salvar(novo, { anunciar: $('ev-anunciar').checked }, 'Evento aplicado.');
    };
    $('ev-encerrar').onclick = () => { if (confirm('Encerrar o evento? Tudo volta pra ×1 na hora.')) salvar({ ...dados, nome: '', expMult: 1, shinyMult: 1, densidade: 1, inicio: null, fim: null }, {}, 'Evento encerrado.'); };
    $('ev-avisar').onclick = async () => {
      const texto = $('ev-texto').value.trim(); if (!texto) { toast('Escreva o aviso.', true); return; }
      const r = await api('/admin/eventos/aviso', 'POST', { texto });
      if (!r.ok) { toast(r.erro || 'Não deu.', true); return; }
      $('ev-texto').value = ''; toast(`Aviso enviado pra ${r.jogadores} jogador(es).`);
    };
    if ($('ev-mligar')) $('ev-mligar').onclick = () => {
      const inicio = doCampo($('ev-minicio').value), texto = $('ev-mtexto').value.trim();
      if (inicio && Date.parse(inicio) <= Date.now()) { toast('A hora de ligar já passou — deixe vazio pra ligar agora.', true); return; }
      if (!confirm(inicio ? `Agendar a manutenção pra ${dataHora(inicio)}?` : `Ligar a manutenção AGORA? Os ${online} jogador(es) online que não são GM caem.`)) return;
      salvar({ ...dados, manutencao: { ativa: true, inicio, texto } }, {}, inicio ? 'Manutenção agendada.' : 'Manutenção ligada.');
    };
    if ($('ev-mdesligar')) $('ev-mdesligar').onclick = () => salvar({ ...dados, manutencao: { ...dados.manutencao, ativa: false, inicio: null } }, {}, 'Manutenção desligada — o jogo está aberto.');
  }

  for (const b of document.querySelectorAll('#lado button[data-vista="eventos"]')) b.addEventListener('click', carregar);
  setInterval(() => { if (!$('v-eventos').hidden && !document.activeElement?.closest?.('#v-eventos')) carregar(); }, 20000);   // o relógio do servidor liga/desliga sozinho
}
