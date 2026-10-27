/**
 * Botão "☰ Páginas": o menu com tudo que existe no gameweb — modos de jogar, as cenas prontas pra gravar
 * (diretor do campeonato, RAID, abertura), as bancadas/editores e os documentos. Desde 19/09 a lista NÃO fica no código:
 * mora em docs/paginas.json (grupos em `paginas`; cada item é { url, nome, desc }, url relativa à raiz do site), que o
 * nginx do site não serve — no site o botão nem aparece e os nomes das páginas internas não saem no código público. Revisada em 01/09: saiu o grupo do tibiaidle
 * (protótipo antigo, só leitura, servidor 5174 desligado), a "folha dos efeitos" (script de dev que dependia
 * de um global que não existe mais) e o "?qualidade=alta" (a qualidade é automática desde 30/08).
 *
 *   import * as Nav from './navegacao.mjs';   Nav.instalar();
 */
let PAGINAS = [];   /* preenchida por carregar() a partir de docs/paginas.json; vazia = botão escondido */
const LISTA = new URL('./docs/paginas.json', import.meta.url);
async function carregar(){
  try {
    const r = await fetch(LISTA, { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    PAGINAS = Array.isArray(j?.paginas) ? j.paginas : [];
  } catch {}
  if (!ui.botao) return;
  ui.botao.hidden = !PAGINAS.length;
  pintar();
}

const CSS = `
#nav-botao{position:fixed;right:170px;top:12px;z-index:30;padding:7px 12px;border:1px solid #314361;border-radius:6px;background:#101624f2;color:#d6e2ff;font:12px/1.4 "Segoe UI",Arial,sans-serif;cursor:pointer;box-shadow:0 8px 18px #000a}
#nav-botao.aberto,#nav-botao:hover{border-color:#f4aa35;color:#ffe07a}
#nav-painel{position:fixed;right:12px;top:48px;z-index:31;width:420px;max-height:calc(100vh - 60px);overflow:auto;padding:10px 12px;border:1px solid #314361;border-radius:8px;background:#101624f8;color:#d6e2ff;font:12px/1.4 "Segoe UI",Arial,sans-serif;box-shadow:0 8px 18px #000a}
#nav-painel[hidden]{display:none}
#nav-painel h2{margin:10px 0 2px;font-size:12px;color:#ffe07a}
#nav-painel h2:first-child{margin-top:0}
#nav-painel h2 small{font-weight:400;color:#8c9ab7;margin-left:6px}
#nav-painel .caminho{margin:0 0 4px;color:#8c9ab7;font:11px ui-monospace,Consolas,monospace;word-break:break-all;user-select:all}
#nav-painel a,#nav-painel button.acao{display:block;width:100%;text-align:left;padding:4px 8px;margin:1px 0;border:1px solid transparent;border-radius:5px;color:#d6e2ff;text-decoration:none;background:none;font:inherit;cursor:pointer}
#nav-painel a:hover,#nav-painel button.acao:hover{border-color:#314361;background:#182238}
#nav-painel a.aqui{border-color:#f4aa35;color:#ffe07a}
#nav-painel a span,#nav-painel button.acao span{color:#8c9ab7;margin-left:6px}
#nav-painel .dica{margin:3px 0 0 8px;color:#8c9ab7;font-style:italic}
#nav-painel .pt{display:inline-block;width:8px;height:8px;margin-right:6px;border-radius:50%;background:#6a7590;vertical-align:middle}
#nav-painel .pt.on{background:#86ef5f} #nav-painel .pt.off{background:#ff5f5f}
`;

const RAIZ = new URL('./', import.meta.url);   // os links da lista são relativos à raiz do site, não à página
const ui = {};
/** `pai`: onde pôr o botão (senão fica fixo no canto superior direito). */
export function instalar({ pai = null } = {}){
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  ui.botao = document.createElement('button'); ui.botao.id = 'nav-botao'; ui.botao.type = 'button'; ui.botao.textContent = '☰ Páginas';
  ui.botao.hidden = true;   /* só aparece quando docs/paginas.json existe (local); no site fica escondido */
  ui.painel = document.createElement('div'); ui.painel.id = 'nav-painel'; ui.painel.hidden = true;
  if (pai){ ui.botao.style.position = 'static'; pai.appendChild(ui.botao); } else document.body.appendChild(ui.botao);
  document.body.appendChild(ui.painel);
  ui.botao.addEventListener('click', () => { ui.botao.blur(); abrir(ui.painel.hidden); });
  addEventListener('keydown', e => { if (e.code === 'Escape' && !ui.painel.hidden) abrir(false); });
  addEventListener('pointerdown', e => { if (!ui.painel.hidden && !ui.painel.contains(e.target) && e.target !== ui.botao) abrir(false); });
  pintar();
  carregar();
}

function abrir(sim){
  ui.painel.hidden = !sim; ui.botao.classList.toggle('aberto', sim);
  if (!sim) return;
  pintar();                                   // na hora de abrir: "você está aqui" e o que só existe no mapa
  // o painel abre colado no botão, para o lado em que há espaço
  const r = ui.botao.getBoundingClientRect(), st = ui.painel.style;
  st.left = st.right = st.top = st.bottom = 'auto';
  if (r.right > innerWidth / 2) st.right = Math.max(8, innerWidth - r.right) + 'px'; else st.left = r.left + 'px';
  if (r.top > innerHeight / 2) st.bottom = (innerHeight - r.top + 6) + 'px'; else st.top = (r.bottom + 6) + 'px';
  for (const g of PAGINAS) if (g.checar) checar(g);
}

// "você está aqui": mesma página e mesmos parâmetros que importam (mapa, jogar, qualidade)
const pagina = p => p.replace(/\/$/, '/index.html');
function aqui(url){
  const u = new URL(url, RAIZ);
  if (u.origin !== location.origin || pagina(u.pathname) !== pagina(location.pathname)) return false;
  const a = u.searchParams, b = new URLSearchParams(location.search);
  return ['mapa', 'jogar', 'diretor', 'captura', 'raid', 'intro', 'pele', 'mobile', 'personagem', 'clima', 'chefe', 'montaria'].every(k => (a.get(k) || '') === (b.get(k) || ''));
}

function pintar(){
  ui.painel.innerHTML = '';
  for (const g of PAGINAS){
    const h = document.createElement('h2');
    h.innerHTML = `${g.checar ? '<i class="pt" id="pt-' + g.titulo + '"></i>' : ''}${g.titulo}<small>${g.sub}</small>`;
    ui.painel.append(h);
    if (g.caminho){ const c = document.createElement('div'); c.className = 'caminho'; c.textContent = g.caminho; ui.painel.append(c); }
    for (const it of g.itens){
      if (it.soJogo && typeof window.jogo === 'undefined') continue;   // só faz sentido dentro do mapa
      let el;
      if (it.acao){
        el = document.createElement('button'); el.type = 'button'; el.className = 'acao';
        el.addEventListener('click', () => { abrir(false); ACOES[it.acao]?.(); });
      } else {
        el = document.createElement('a'); el.href = new URL(it.url, RAIZ).href;
        if (aqui(it.url)) el.classList.add('aqui');
      }
      el.innerHTML = `${it.nome}<span>${it.desc}</span>${el.classList?.contains('aqui') ? '<span>◂ você está aqui</span>' : ''}`;
      ui.painel.appendChild(el);
    }
    if (g.dica){ const d = document.createElement('div'); d.className = 'dica'; d.textContent = g.dica; ui.painel.appendChild(d); }
  }
}

async function checar(g){
  const pt = document.getElementById('pt-' + g.titulo); if (!pt) return;
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 1500);
  let ok = false;
  try { await fetch(g.checar, { mode: 'no-cors', cache: 'no-store', signal: c.signal }); ok = true; } catch {}
  clearTimeout(t);
  pt.className = 'pt ' + (ok ? 'on' : 'off'); pt.title = ok ? 'servidor no ar' : 'servidor fora do ar';
}

const ACOES = {};                                 // (a folha dos efeitos, tools/bancada_efeitos.js, saiu do menu em 01/09: dependia de um global `jogo` que não existe mais)
