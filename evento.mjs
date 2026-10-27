/* Evento ao vivo (Fase 3 do painel → 🎉 Eventos ao vivo): os multiplicadores que o servidor empurra ({t:'evento'}, rede.mjs) —
 * EXP, shiny e densidade de selvagens. Sem servidor, ou sem evento, tudo vale 1. Quem usa lê na hora (index.html: a EXP da
 * vitória, a chance de shiny do selvagem e quantos selvagens nascem), então salvar no painel vale sem recarregar o jogo. */
let atual = { nome: '', expMult: 1, shinyMult: 1, densidade: 1, fim: null };
const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 1; };   // os limites do servidor_eventos.mjs

export const expMult = () => atual.expMult;
export const shinyMult = () => atual.shinyMult;
export const densidade = () => atual.densidade;
export const agora = () => ({ ...atual });

/** {t:'evento'} do servidor. Devolve a linha pro chat de Sistema, ou null se nada mudou. */
export function doServidor(m) {
  const novo = { nome: String(m.nome || '').slice(0, 60), expMult: num(m.expMult, 0.1, 10), shinyMult: num(m.shinyMult, 1, 100), densidade: num(m.densidade, 0.25, 3), fim: m.fim || null };
  const antes = JSON.stringify(atual);
  atual = novo;
  if (JSON.stringify(novo) === antes) return null;
  const partes = [novo.expMult !== 1 ? 'EXP ×' + novo.expMult : '', novo.shinyMult !== 1 ? 'shiny ×' + novo.shinyMult : '', novo.densidade !== 1 ? 'selvagens ×' + novo.densidade : ''].filter(Boolean);
  if (!partes.length) return JSON.parse(antes).nome || JSON.parse(antes).expMult !== 1 || JSON.parse(antes).shinyMult !== 1 || JSON.parse(antes).densidade !== 1 ? '🎉 Evento encerrado.' : null;
  const ate = novo.fim ? ' — até ' + new Date(novo.fim).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  return '🎉 ' + (novo.nome || 'Evento') + ': ' + partes.join(' · ') + ate;
}
