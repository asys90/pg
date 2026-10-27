/* Recursos pro painel (Fase 3): listas de arquivos que o navegador não consegue fazer sozinho (a Vite não lista pastas).
 * Só GM (o servidor.mjs confere antes). A Vite serve public/ e a raiz no mesmo caminho, então cada lista junta as duas pastas.
 *   /admin/recursos/faixas            → músicas no formato do musicas.json ("bg/sound_road1" = som/bg/sound_road1.ogg)
 *   /admin/recursos/mascaras          → PNGs de cenario/npc/mask
 *   /admin/recursos/modelos?pasta=pc  → nomes dos .glb (pasta pc | npc | mon), sem extensão
 *   /admin/recursos/materiais         → { material: ['npc/fc2013_00', …] } — lido do JSON dos .glb de npc/ e pc/ (pra prévia da
 *                                       tinta achar um modelo que usa o material). Cache de 60 s. */
import fs from 'node:fs';
import nodePath from 'node:path';

export function criarRecursos(raiz) {
  const pastas = sub => [nodePath.join(raiz, 'public', sub), nodePath.join(raiz, sub)];
  const listar = (sub, re) => {
    const nomes = new Set();
    for (const d of pastas(sub)) { try { for (const f of fs.readdirSync(d)) if (re.test(f)) nomes.add(f); } catch {} }
    return [...nomes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  };
  /** O JSON de um .glb (cabeçalho de 12 bytes + o 1º pedaço, que é o JSON) — lê só isso, não o arquivo inteiro. */
  function jsonDoGlb(arq) {
    let fd;
    try {
      fd = fs.openSync(arq, 'r');
      const cab = Buffer.alloc(20); fs.readSync(fd, cab, 0, 20, 0);
      if (cab.readUInt32LE(0) !== 0x46546C67 || cab.readUInt32LE(16) !== 0x4E4F534A) return null;   // "glTF" + pedaço "JSON"
      const tam = cab.readUInt32LE(12); if (tam > 50 * 1024 * 1024) return null;
      const buf = Buffer.alloc(tam); fs.readSync(fd, buf, 0, tam, 20);
      return JSON.parse(buf.toString('utf8'));
    } catch { return null; } finally { if (fd != null) try { fs.closeSync(fd); } catch {} }
  }
  let materiais = null, materiaisEm = 0;
  function indiceMateriais() {
    if (materiais && Date.now() - materiaisEm < 60000) return materiais;
    const out = {};
    for (const sub of ['npc', 'pc']) for (const f of listar('cenario/' + sub, /\.glb$/i)) {
      const arq = pastas('cenario/' + sub).map(d => nodePath.join(d, f)).find(p => fs.existsSync(p));
      const j = arq && jsonDoGlb(arq); if (!j) continue;
      const modelo = sub + '/' + f.slice(0, -4);
      const nomes = new Set([...(j.materials || []).map(m => m.name), ...(j.images || []).map(i => i.name)].filter(Boolean));
      for (const n of nomes) (out[n] ||= []).includes(modelo) || out[n].push(modelo);
    }
    materiais = out; materiaisEm = Date.now();
    return out;
  }

  /** Devolve true se tratou a rota. */
  return function rota(rota, metodo, url, json) {
    if (metodo !== 'GET') return false;
    if (rota === '/admin/recursos/faixas') {
      const faixas = [];
      for (const sub of ['bg', 'ui']) for (const f of listar('som/' + sub, /\.ogg$/i)) faixas.push(sub + '/' + f.slice(0, -4));
      json(200, { ok: true, faixas }); return true;
    }
    if (rota === '/admin/recursos/mascaras') { json(200, { ok: true, mascaras: listar('cenario/npc/mask', /\.png$/i) }); return true; }
    if (rota === '/admin/recursos/modelos') {
      const pasta = String(url.searchParams.get('pasta') || '');
      if (!['pc', 'npc', 'mon'].includes(pasta)) { json(400, { erro: 'pasta: pc, npc ou mon' }); return true; }
      json(200, { ok: true, modelos: listar('cenario/' + pasta, /\.glb$/i).map(f => f.slice(0, -4)) }); return true;
    }
    if (rota === '/admin/recursos/materiais') { json(200, { ok: true, materiais: indiceMateriais() }); return true; }
    return false;
  };
}
