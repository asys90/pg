/* IDIOMA DO JOGADOR (11/09/2026) — PT (a fonte), EN e ES. Etapa 1: telas, HUD, menus, avisos e os nomes que vieram do
 * dump (itens, golpes, áreas, títulos, roupas, NPCs). Missões e falas dos NPCs ficam pra etapa 2.
 *
 * COMO FUNCIONA: o código continua escrito em português. `t(texto)` procura o texto no dicionário do idioma escolhido e
 * devolve a tradução; sem tradução, devolve o próprio texto. Duas formas de chave:
 *   exata     "Criar conta" → "Create account"
 *   padrão    "Você chegou em {x}." → "You arrived in {x}."   (o {x} casa com qualquer trecho; o que casou também passa
 *             pelo t(), então "Cidade Pallet" dentro da frase vira "Pallet Town")
 * Os pontos de saída (rótulos da maquete, Chat.sistema, flutuar, telaEscura, Popup.texto/botao, avisos das telas) chamam
 * o t() — assim as ~140 chamadas com texto montado por concatenação não precisaram mudar.
 *
 * Dicionários: data/idioma/ui_<l>.json (escritos à mão) + data/idioma/nomes_<l>.json (gerados de LanguageConfig_<l> pelo
 * tools/idioma_nomes.mjs). Escolha: ?idioma=en|es|pt na URL, a barra PT·EN·ES da tela de login (telas.mjs), o localStorage
 * `idioma` e a conta (POST /conta/idioma; volta no login). Padrão: o idioma do navegador, caindo em pt.
 * Nomes dos Pokémon ficam em inglês em todos os idiomas (decisão do Jaime, 11/09). */
export const IDIOMAS = { pt: 'Português', en: 'English', es: 'Español' };
const LS = 'idioma';
let atual = 'pt', exatas = new Map(), padroes = [], carregado = { pt: true };
const cache = new Map();                                                  // idioma → { exatas, padroes }

export const idioma = () => atual;
export const ehPt = () => atual === 'pt';
/** O que o navegador sugere, sem consultar nada guardado. */
export function doNavegador(){
  const n = String((navigator.languages && navigator.languages[0]) || navigator.language || 'pt').toLowerCase();
  return n.startsWith('es') ? 'es' : n.startsWith('en') ? 'en' : 'pt';
}
/** O idioma a usar nesta carga: URL > guardado no aparelho > navegador. */
export function detectar(url = null){
  if (url && IDIOMAS[url]) return url;
  try { const v = localStorage.getItem(LS); if (IDIOMAS[v]) return v; } catch {}
  return doNavegador();
}
function compilar(chave, valor){
  const partes = chave.split(/(\{\w+\})/); let re = '^'; const vars = [];
  for (const p of partes){
    const m = /^\{(\w+)\}$/.exec(p);
    if (m){ vars.push(m[1]); re += '([\\s\\S]+?)'; } else re += p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return { re: new RegExp(re + '$'), saida: valor, vars, tam: chave.length };
}
function montar(dics){
  const ex = new Map(), pa = [];
  for (const d of dics) for (const [k, v] of Object.entries(d || {})){
    if (typeof v !== 'string' || !k) continue;
    if (/\{\w+\}/.test(k)){ if (!/^\{\w+\}$/.test(k.trim())) pa.push(compilar(k, v)); }   // chave que é SÓ variável casaria com tudo
    else ex.set(k, v);
  }
  pa.sort((a, b) => b.tam - a.tam);                                        // o padrão mais específico (mais longo) primeiro
  return { exatas: ex, padroes: pa };
}
async function baixar(l, bust = ''){
  if (cache.has(l)) return cache.get(l);
  const pega = async n => { try { const r = await fetch('./data/idioma/' + n + '_' + l + '.json'); return r.ok ? await r.json() : {}; } catch { return {}; } };
  /* PAINEL (Fase 3 → Traduções): data/traducoes.json = [{ pt, en, es }] editado pelo GM — vence tudo (é a correção mais recente). */
  const painel = async () => { try { const r = await fetch('./data/traducoes.json' + bust, { cache: 'no-cache' }); const lista = r.ok ? await r.json() : []; return Object.fromEntries((Array.isArray(lista) ? lista : []).filter(x => x?.pt && typeof x[l] === 'string' && x[l].trim()).map(x => [String(x.pt).trim(), x[l]])); } catch { return {}; } };
  const [ui, conteudo, nomes, doPainel] = await Promise.all([pega('ui'), pega('conteudo'), pega('nomes'), painel()]);
  const d = montar([nomes, conteudo, ui, doPainel]);                       // a mão (ui, conteudo = missões/ginásios) vence o gerado (nomes); o painel vence tudo
  cache.set(l, d); return d;
}
/** O painel salvou as traduções: relê o idioma atual (pt não traduz, não precisa). */
export async function recarregar(){
  cache.clear();
  if (atual === 'pt') return atual;
  const d = await baixar(atual, '?t=' + Date.now());
  exatas = d.exatas; padroes = d.padroes;
  return atual;
}
/* DESCRIÇÕES DA POKÉDEX (etapa 3): data/idioma/dex_<l>.json, por número da dex, geradas do jogo original pelo
   tools/idioma_dex.mjs — inclusive em pt (o `d` do dex_extra.json veio da WikiDex em espanhol). Carrega junto com o idioma. */
let dex = {}; const dexCache = new Map();
async function baixarDex(l){
  if (dexCache.has(l)) return dexCache.get(l);
  let d = {}; try { const r = await fetch('./data/idioma/dex_' + l + '.json'); if (r.ok) d = await r.json(); } catch {}
  dexCache.set(l, d); return d;
}
/** Descrição da espécie `n` (número da dex) no idioma atual, ou null se ainda não carregou / não houver. */
export const descricaoDex = n => dex[String(n)] || null;
export const dexPronto = () => dexCache.has(atual);
/** As descrições são pesadas (0,7–1,4 MB) e a Pokédex do Figma nem as mostra: só baixa quando alguém pede. */
export async function carregarDex(){ dex = await baixarDex(atual); return dex; }
/** Carrega o idioma e passa a usá-lo. Devolve o idioma que ficou (cai em pt se o dicionário não vier). */
export async function carregar(l){
  if (!IDIOMAS[l]) l = 'pt';
  dex = dexCache.get(l) || {};
  if (l === 'pt'){ atual = 'pt'; exatas = new Map(); padroes = []; document.documentElement.lang = 'pt-BR'; return atual; }
  const d = await baixar(l);
  atual = l; exatas = d.exatas; padroes = d.padroes; carregado[l] = true;
  document.documentElement.lang = l;
  return atual;
}
/** Escolha do jogador: guarda no aparelho e carrega. Quem avisa a conta é o conta.mjs. */
export async function definir(l){
  if (!IDIOMAS[l]) return atual;
  try { localStorage.setItem(LS, l); } catch {}
  return carregar(l);
}
/** Início: decide e carrega antes de qualquer tela. `daUrl` = ?idioma= (também fica guardado). */
export async function iniciar(daUrl = null){
  const l = detectar(daUrl);
  if (daUrl && IDIOMAS[daUrl]) { try { localStorage.setItem(LS, daUrl); } catch {} }
  return carregar(l);
}
/* 15/09 (xspartanz: o Abra aparecia como "Open"): o "Traduzir página" do Chrome/Edge lia o nome como a palavra portuguesa "abra". O jogo tem
   tradução própria (PT/EN/ES) e nome de Pokémon nunca se traduz: a página inteira pede pro navegador não traduzir. */
try { document.documentElement.setAttribute('translate', 'no'); document.documentElement.classList.add('notranslate'); } catch {}
const TEM_LETRA = /[A-Za-zÀ-ú]/;
/** Traduz. `vars` preenche {x} no resultado (e no original, quando não há tradução). Nunca lança; texto que não é string volta igual. */
export function t(s, vars = null){
  if (typeof s !== 'string' || !s) return s;
  let r = s;
  if (atual !== 'pt' && TEM_LETRA.test(s)){
    const k = s.trim(), e = exatas.get(k);
    if (e != null) r = k === s ? e : s.replace(k, e);
    else for (const p of padroes){
      const m = p.re.exec(s);
      if (m){ r = p.saida.replace(/\{(\w+)\}/g, (tudo, nome) => { const i = p.vars.indexOf(nome); return i >= 0 ? t(m[i + 1]) : tudo; }); break; }
    }
  }
  if (vars) r = r.replace(/\{(\w+)\}/g, (tudo, nome) => (nome in vars ? String(vars[nome]) : tudo));
  return r;
}
/** Traduz um HTML pequeno trocando só os textos entre as tags (pra templates antigos). */
export function tHtml(html){
  if (atual === 'pt' || typeof html !== 'string') return html;
  return html.replace(/>([^<>]+)</g, (tudo, txt) => '>' + t(txt) + '<');
}
