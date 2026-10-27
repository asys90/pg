/* Listas do servidor pras prévias do painel (Fase 3): faixas de música, máscaras, modelos e o índice material → modelo
 * (servidor_recursos.mjs, rotas /admin/recursos/*, só GM). As prévias não recebem o `api` do admin.mjs: o token é o mesmo
 * do jogo (localStorage 'conta.token'). Cada lista é buscada uma vez por carga da página. */
const BASE = location.protocol === 'https:' ? location.origin + '/servidor' : 'http://' + location.hostname + ':5190';
const cache = new Map();
export function recurso(nome) {
  if (!cache.has(nome)) {
    let token = ''; try { token = localStorage.getItem('conta.token') || ''; } catch {}
    cache.set(nome, fetch(BASE + '/admin/recursos/' + nome, { headers: token ? { Authorization: 'Bearer ' + token } : {} })
      .then(r => r.ok ? r.json() : null).catch(() => null).then(d => { if (!d) cache.delete(nome); return d || {}; }));
  }
  return cache.get(nome);
}
/** Os cenas.json do jogo: { cenas: { id → nome }, areas: { id → nome } } (nomes que o jogador vê). */
let nomes = null;
export const nomesDeLugares = () => (nomes ||= fetch('/data/cenas.json').then(r => r.json()).then(ce => {
  const cenas = {}, areas = {};
  for (const c of ce?.cenas || []) { cenas[c.id] = c.nome; for (const a of c.areas || []) if (!(a.id in areas)) areas[a.id] = a.nome; }
  return { cenas, areas };
}).catch(() => ({ cenas: {}, areas: {} })));
/** Escreve no campo `k` do formulário do editor genérico (dados.mjs marca o label com data-k) como se o GM tivesse digitado:
    o próprio formulário valida, guarda no registro, marca "não salvo" e chama a prévia de volta. */
export function escreverCampo(caixa, k, valor) {
  const w = caixa.querySelector(`label[data-k="${k}"] textarea, label[data-k="${k}"] input, label[data-k="${k}"] select`);
  if (!w) return false;
  w.value = typeof valor === 'string' ? valor : JSON.stringify(valor, null, 1);
  w.dispatchEvent(new Event(w.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  return true;
}
