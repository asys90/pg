/* Mundo compartilhado (cliente) — FASE 3a da rede (06/09/2026): os selvagens vêm do servidor (servidor/mundo.mjs).
 * Com o servidor no ar, o `povoar` do index PROPÕE nascimentos (área, espécie, ponto) e o servidor decide nível/shiny/IVs e
 * manda o registro pra sala inteira; cada cliente cria o corpo quando o selvagem está a menos de ~130 m dele e o guarda no
 * pool quando se afasta (o registro fica). Um cliente por selvagem é o `dono` e roda a IA de sempre (index); os outros só
 * interpolam a posição que chega. Dano vai pro servidor (shp), desmaio/captura/sumiço vêm dele. Sem servidor: nada muda
 * (o index cria os selvagens sozinho, como sempre).
 *   Mundo.instalar(ctx) — ctx: { jogo, enviar, criar(reg) → Promise<entidade>, esconder(s), desmaiar(s), morrer(s), tocarUma(s, anim), guardar(s) }
 *   Mundo.ligar(meuId, lista) / desligar()  — rede.mjs chama no bem-vindo e na queda
 *   Mundo.receber(m)                          — selvagem | spos | shp | dono | sestado | scapt | sumiu | pdano | xp (3c)
 *   Mundo.propor(p) · contar(area) · quadro(dt) · interpolar(s, dt) · dano(s) · capturar(s, bola) · esquecer(id) · atacarParceiro(s, golpe, p)
 * RAID AO VIVO (14/09): o chefe da raid é um registro com `raid:<id>` e `chefe:true`, simulado pelo SERVIDOR (dono sempre nulo): o corpo
 * é SEMPRE remoto, nunca vira selvagem local (nem com a conexão caída) e não entra no 'capturando' da sala. A barra de vida vem do
 * registro — ctx.raidHp(r) em selvagem/shp/sestado, ctx.raidSumiu(r) quando some.
 */
let ctx = null, ativo = false, meuId = null, tCorpos = 0;
const registros = new Map();                  // id → { ...registro do servidor, s: corpo (entidade do index) ou null, alvo: {x,z,giro,anim}, criando }
const capturas = new Map();                   // id → { resolve, timer }
const PERTO = 130, LONGE = 150;
/* PASSE DE PROGRESSO (19/09): o modelo pode ser negado pela borda (403) ou cair na rede. O registro marca `falhou` e o `quadro` só
   tenta de novo depois de ESPERA_FALHA — ou na hora, quando chega um passe novo (evento `passe-novo`, conta.mjs). Antes, a cada
   meio segundo o `quadro` pedia o corpo de novo. */
const ESPERA_FALHA = 15000;
if (typeof addEventListener === 'function') addEventListener('passe-novo', ev => {
  if (ev?.detail && ev.detail.cresceu === false) return;
  for (const r of registros.values()) r.falhou = 0;
});
const ultimoEnvio = new Map();                // id → { x, z, giro, anim, quando }

export function instalar(c){ ctx = c; }
export const estaAtivo = () => ativo;
export function ligar(id, lista){
  /* DUPLICAÇÃO NA RECONEXÃO (15/09, brito_xyz: "o servidor tá caindo muito, aí ele fica duplicando os pokemons, e não deixa
     jogar pokébola quando mata... mas aí você entra no centro pokemon ou atualiza e ele dá rollback em tudo").
     Quando a conexão cai, o `desligar` deixa os selvagens do servidor no chão como LOCAIS pra o mundo não esvaziar, e enquanto
     está fora o `povoar` do index continua criando outros. NENHUM desses existe pro servidor: bater neles gasta Pokébola e item
     à toa e some no save seguinte (o save é do servidor, passo 6) — é o "rollback". E no bem-vindo o servidor manda a lista
     inteira de novo por cima dos que ficaram: cada queda deixava uma cópia fantasma a mais.
     No bem-vindo o servidor é a VERDADE: tudo que está no chão sai ANTES da lista dele voltar. */
  /* 18/09 (chaospider, "o auto-lock sai sozinho em Kanto cheia"; katanarie, "duplica o Pokémon morto"): guardar TUDO no bem-vindo
     fazia toda reconexão recriar os selvagens — o alvo do jogador sumia, o mundo piscava e a bola que estava no ar terminava
     num corpo guardado (fantasma). O journal de 17/09 tem 130+ quedas de conexão no meio do jogo em 6 h (celular, principalmente).
     Agora o corpo que o servidor CONFIRMA na lista nova (mesmo id, mesma ficha — espécie/nível/shiny/natureza —, perto de onde
     estava e num estado que combina com o que ele diz) fica e só é religado; o resto sai como antes: locais criados sem servidor,
     ids que não voltaram, id reciclado com outra ficha (depois de um restart os ids recomeçam em 1 por mapa) e corpo que caiu por
     KO LOCAL durante a queda enquanto o servidor o tem vagando (religado caído ele nunca mais levantaria: na rede quem mata é o
     servidor — e a bola nele voltava "acordado"). */
  const combina = (n, s) => n.estado === 'desmaiado' ? (s.estado !== 'morto' && s.estado !== 'guardado')
    : n.estado === 'capturando' ? (s.estado === 'capturando' || s.estado === 'desmaiado')
    : (s.estado !== 'desmaiado' && s.estado !== 'capturando' && s.estado !== 'morto' && s.estado !== 'guardado');
  const novos = new Map((lista || []).map(r => [r.id, r])), mantidos = new Map();
  for (const s of [...(ctx?.jogo?.selvagens || [])]){
    const n = s.id != null && !s.raid ? novos.get(s.id) : null;
    if (n && n.dex === s.dex && n.lv === s.lv && !!n.shiny === !!s.shiny && (n.natureza == null || n.natureza === s.natureza) && !mantidos.has(s.id) && combina(n, s) && Math.hypot(n.x - s.x, n.z - s.z) < 40) mantidos.set(s.id, s);
    else ctx.guardar(s);
  }
  const lances = new Set([...registros.values()].filter(r => r.meuLance).map(r => r.id));   // a minha bola que capturou e ainda espera o `sumiu capturado`
  for (const r of registros.values()) r.s = null;
  registros.clear();
  meuId = id; ativo = true;
  for (const r of lista || []){
    const s = mantidos.get(r.id);
    if (!s){ chegou(r); continue; }
    const reg = { s, criando: false }; Object.assign(reg, r); reg.alvo = { x: r.x, z: r.z, giro: r.giro || 0, anim: r.anim || 'Idle' }; reg.meuLance = lances.has(r.id);
    registros.set(r.id, reg);
    s.id = r.id; s.rede = true; s.remoto = r.dono !== meuId; s.hp = r.hp; s.maxHp = r.maxHp;
    if (r.estado === 'desmaiado'){ if (s.estado !== 'desmaiado' && s.estado !== 'capturando') ctx.desmaiar(s); s.desmaio = Math.max(0.5, ((r.ate || 0) - Date.now()) / 1000); }
    else if (r.estado === 'capturando' && s.estado !== 'capturando'){ s.estado = 'capturando'; s.alvoX = null; s.investida = null; if (s.rotulo) s.rotulo.style.display = 'none'; }
  }
}
export function desligar(){                                               // servidor caiu: o que tinha corpo vira selvagem local de novo (a IA local assume)
  ativo = false; meuId = null;
  for (const r of registros.values()){
    if (r.raid){ if (r.s){ const s = r.s; r.s = null; ctx.esconder(s); } ctx.raidSumiu?.(r); continue; }   // chefe da raid: some até reconectar (o bem-vindo traz de novo) — virar local deixaria o Mew brigar e cair só na tela de um
    if (r.s){ r.s.rede = false; r.s.remoto = false; r.s.alvoX = null; }
  }
  registros.clear(); for (const c of capturas.values()){ clearTimeout(c.timer); c.resolve(null); } capturas.clear();
}
export const contar = area => { let n = 0; for (const r of registros.values()) if (r.area === area && r.estado !== 'morto' && r.estado !== 'capturado') n++; return n; };
export function propor(p){ if (ativo) ctx.enviar({ t: 'nascer', ...p }); }
export function esquecer(id){ const r = registros.get(id); if (r){ r.s = null; registros.delete(id); } }
const meu = () => ctx?.jogo?.ash;
const distMim = r => { const a = meu(); const x = r.s ? r.s.x : r.x, z = r.s ? r.s.z : r.z; return a ? Math.hypot(x - a.x, z - a.z) : Infinity; };

function chegou(reg){
  const r = registros.get(reg.id) || { s: null, criando: false };
  Object.assign(r, reg); r.alvo = { x: reg.x, z: reg.z, giro: reg.giro || 0, anim: reg.anim || 'Idle' };
  registros.set(reg.id, r);
  if (r.raid) ctx.raidHp?.(r);                                           // raid: a barra do chefe aparece já, com ou sem corpo
  if (distMim(r) < PERTO) corpo(r);
}
async function corpo(r){
  if (r.s || r.criando || !ativo) return;
  r.criando = true;
  try {
    const s = await ctx.criar(r); if (!s){ r.falhou = Date.now(); return; }
    r.falhou = 0;
    if (!registros.has(r.id) || !ativo){ ctx.esconder(s); return; }        // sumiu enquanto o modelo carregava
    s.id = r.id; s.rede = true; s.remoto = r.raid ? true : r.dono !== meuId; r.s = s;   // raid: quem simula é o servidor
    s.raid = r.raid || null;
    s.hp = r.hp; s.maxHp = r.maxHp;
    if (r.estado === 'desmaiado'){ ctx.desmaiar(s); s.desmaio = Math.max(0.5, ((r.ate || 0) - Date.now()) / 1000); }
    else if (r.estado === 'capturando'){ s.estado = 'capturando'; if (s.rotulo) s.rotulo.style.display = 'none'; }
  } catch (e){ r.falhou = Date.now(); console.warn('mundo: não criou ' + r.nome, e); }
  finally { r.criando = false; }
}
function semCorpo(r){ if (r.s){ ctx.esconder(r.s); r.s.rede = false; r.s = null; } }

export function receber(m){
  if (!ativo) return;
  const r = registros.get(m.id);
  switch (m.t){
    case 'selvagem': chegou(m.s); return;
    case 'spos': if (r){ r.x = m.x; r.z = m.z; r.giro = m.giro; r.anim = m.anim; r.alvo = { x: m.x, z: m.z, giro: m.giro || 0, anim: m.anim || 'Idle' }; if (r.s && !r.s.remoto && r.dono !== meuId) r.s.remoto = true; } return;
    case 'dono': if (r){ r.dono = m.dono; if (r.s){ const era = r.s.remoto; r.s.remoto = r.raid ? true : m.dono !== meuId; if (era && !r.s.remoto){ r.s.alvoX = null; r.s.pausa = 0.4; r.s.investida = null; } } } return;
    case 'shp':                                                          // fase 3b: dano calculado no servidor (com dano/eff/golpe/de); sem `dano` é página antiga relatando HP
      if (!r) return; r.hp = m.hp;
      if (m.maxHp > 0){ r.maxHp = m.maxHp; if (r.s) r.s.maxHp = m.maxHp; }   // INTEGRAÇÃO da raid (14/09): `/raid hp N` no meio da luta muda a vida MÁXIMA do chefe (vidaChefe manda shp com maxHp) — sem isto a barra ficava "1 / 1.500"
      if (r.raid) ctx.raidHp?.(r);
      if (r.s){
        if (m.dano != null && ctx.golpeRemoto) ctx.golpeRemoto(r.s, { ...m, meu: m.de === meuId });
        else { r.s.hp = m.hp; if (m.hp > 0 && r.s.estado !== 'desmaiado') ctx.tocarUma(r.s, 'Wound'); }
      }
      return;
    case 'sestado':
      if (!r) return;
      if (r.raid && m.estado === 'capturando') return;                   // chefe da raid não se captura: nunca trava a sala
      r.estado = m.estado; if (m.ate) r.ate = m.ate; if (m.hp != null) r.hp = m.hp;
      if (r.raid) ctx.raidHp?.(r);
      if (r.s){
        if (m.estado === 'desmaiado'){
          if (r.s.estado === 'capturando' && r.s.emVoo){ r.s.hp = 0; r.s.desmaio = Math.max(0.5, (m.ate - Date.now()) / 1000); return; }   // 18/09: a MINHA bola ainda está no ar (aparelho lento: os 8 s do servidor venceram antes do fim do voo) — o jogarBola termina; desmaiar aqui mostrava "F joga a bola" com o corpo dentro da bola e deixava jogar outra em cima
          r.s.hp = 0; if (r.s.estado !== 'desmaiado') ctx.desmaiar(r.s); r.s.desmaio = Math.max(0.5, (m.ate - Date.now()) / 1000); if (r.s.rotulo) r.s.rotulo.style.display = '';
        }
        else if (m.estado === 'capturando' && r.s.estado !== 'capturando'){
          r.s.estado = 'capturando'; r.s.alvoX = null; r.s.investida = null; if (r.s.rotulo) r.s.rotulo.style.display = 'none';
          if (m.porId != null && m.porId !== meuId && ctx.espectar) ctx.espectar(r.s, m);   // a bola do outro jogador voando (index: verBolaDoOutro)
        }
      }
      return;
    case 'pdano':                                                        // fase 3c: o selvagem bateu no parceiro de alguém; o dano é do servidor
      if (m.alvo === meuId) ctx.golpeNoParceiro?.(r?.s || null, m); else ctx.golpeNoOutro?.(r?.s || null, m);
      return;
    case 'xp': ctx.xp?.(m); return;                                      // fase 3c: XP contado pelo servidor (todo mundo que bateu no selvagem)
    case 'scapt': { const c = capturas.get(m.id); if (c){ clearTimeout(c.timer); capturas.delete(m.id); c.resolve(m); } if (r && !m.ok) r.meuLance = false; return; }
    case 'sumiu':
      if (!r) return;
      registros.delete(m.id);
      if (r.raid) ctx.raidSumiu?.(r, m);
      if (r.s){
        const s = r.s; r.s = null;
        if (m.motivo === 'morreu'){ if (s.estado !== 'morto' && s.estado !== 'guardado') ctx.morrer(s); }
        else if (m.motivo === 'capturado'){ if (r.meuLance) return; if (s.estado !== 'guardado') ctx.guardar(s); }   // quem capturou já cuida do próprio corpo (jogarBola)
        else ctx.esconder(s);
      }
      return;
  }
}
/** Corpo perto/longe e a posição dos que EU simulo (a cada quadro do jogo). */
export function quadro(dt){
  if (!ativo || !ctx?.jogo?.ash) return;
  tCorpos += dt;
  if (tCorpos > 0.5){
    tCorpos = 0;
    for (const r of registros.values()){
      const d = distMim(r);
      if (!r.s && d < PERTO && !(r.falhou && Date.now() - r.falhou < ESPERA_FALHA)) corpo(r);
      else if (r.s && d > LONGE && r.s.estado !== 'capturando') semCorpo(r);
    }
  }
  const agora = performance.now();
  for (const r of registros.values()){
    const s = r.s; if (!s || s.remoto || s.estado === 'guardado') continue;
    const u = ultimoEnvio.get(r.id) || { x: 0, z: 0, giro: 0, anim: '', quando: 0 };
    const anim = s.anim || 'Idle', giro = s.giro || 0;
    const mudou = Math.hypot(s.x - u.x, s.z - u.z) > 0.02 || Math.abs(giro - u.giro) > 0.02 || anim !== u.anim;
    if ((mudou && agora - u.quando > 90) || agora - u.quando > 3000){
      ctx.enviar({ t: 'spos', id: r.id, x: +s.x.toFixed(2), z: +s.z.toFixed(2), giro: +giro.toFixed(3), anim });
      ultimoEnvio.set(r.id, { x: s.x, z: s.z, giro, anim, quando: agora });
    }
  }
}
/** Selvagem que OUTRO cliente simula: vai suavemente até a última posição recebida. Devolve se está andando. */
export function interpolar(s, dt){
  const r = registros.get(s.id); if (!r) return false;
  const a = r.alvo, d = Math.hypot(a.x - s.x, a.z - s.z);
  if (d > 12){ s.x = a.x; s.z = a.z; }
  else if (d > 0.01){ const k = 1 - Math.exp(-dt / 0.11); s.x += (a.x - s.x) * k; s.z += (a.z - s.z) * k; }
  s.giro = a.giro;
  if (a.anim && a.anim !== 'Idle' && a.anim !== 'Run' && s.__animRede !== a.anim){ s.__animRede = a.anim; ctx.tocarUma(s, a.anim); }
  if (a.anim === 'Idle' || a.anim === 'Run') s.__animRede = null;
  return d > 0.05 || a.anim === 'Run';
}
/** Fase 3b: intenção de golpe num selvagem da rede — o servidor calcula e devolve o dano pra sala (shp). */
export function atacar(s, golpe, atacante){
  if (!ativo || !s.rede || s.id == null || !golpe) return false;
  ctx.enviar({ t: 'ataque', id: s.id, golpe: golpe.id, atacante: atacante ? { glb: atacante.glb, dex: atacante.dex, lv: atacante.lv, ivs: atacante.ivs, natureza: atacante.natureza, uid: ctx.uidParceiro?.() ?? null } : null });   // uid (13/09): quem está em campo viaja com o golpe
  return true;
}
/** Fase 3c: o selvagem que EU simulo bate no parceiro de um jogador (hoje, o meu): o servidor calcula e manda `pdano` pra sala. */
export function atacarParceiro(s, golpe, p, alvoId = null){
  if (!ativo || !s.rede || s.id == null || !golpe || !p) return false;
  ctx.enviar({ t: 'sataque', id: s.id, golpe: golpe.id, alvo: alvoId, defensor: { glb: p.glb, dex: p.dex, lv: p.lv, ivs: p.ivs, natureza: p.natureza, hp: Math.max(0, Math.round(p.hp)), maxHp: p.maxHp, uid: alvoId == null ? (ctx.uidParceiro?.() ?? null) : null } });   // uid (13/09): no MEU parceiro, diz qual está em campo
  return true;
}
/** (página antiga) HP relatado; o servidor só aceita de cliente < v4. */
export function dano(s){ if (ativo && s.rede && s.id != null) ctx.enviar({ t: 'shp', id: s.id, hp: Math.max(0, Math.round(s.hp)) }); }
/** Há uma bola minha esperando a resposta do servidor pra este id? (18/09: uma bola por vez no mesmo selvagem — a 2ª sobrescrevia a espera da 1ª) */
export const capturaPendente = id => capturas.has(id);
/** Pede a captura ao servidor; resolve com { chac, ok, erro } (ou null se o servidor não respondeu em 5 s). */
export function capturar(s, bola){
  if (!ativo || !s.rede) return Promise.resolve(null);
  const r = registros.get(s.id); if (r) r.meuLance = true;
  return new Promise(resolve => {
    const timer = setTimeout(() => { capturas.delete(s.id); resolve(null); }, 8000);   // 14/09: 8 s (era 5) — celular com lag perdia a resposta e a bola 'capturava' sem registro
    capturas.set(s.id, { resolve, timer });
    ctx.enviar({ t: 'capturar', id: s.id, bola });
  });
}
/** O registro do chefe da raid nesta sala (ou null). */
export function registroRaid(){ for (const r of registros.values()) if (r.raid) return r; return null; }
export const estado = () => ({ ativo, meuId, registros: registros.size, corpos: [...registros.values()].filter(r => r.s).length, meus: [...registros.values()].filter(r => r.s && !r.s.remoto).length });
