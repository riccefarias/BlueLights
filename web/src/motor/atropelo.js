/* ============================================================
   ATROPELAMENTO — o show pede mais do que o motor da cabeça dá?

   Varre a faixa quadro a quadro (o mesmo passo do .fseq) e compara a
   velocidade de pan/tilt exigida com a ficha física do perfil. Cabeça
   atropelada não dá erro: ela chega atrasada, e o movimento sai do
   tempo da música — exatamente o tipo de defeito que só aparece no
   show. Melhor a timeline acusar antes.

   Só o caminho DMX é simulado (pan/tilt por trilha, com curva
   resolvida): o renderFrame completo pinta pixels e custaria segundos
   por varredura; aqui são só as cabeças.

   Salto seco de posição (corte entre clips, fim de clip voltando ao
   centro) NÃO é atropelamento: corte é linguagem de show, a cabeça
   desliza até lá na velocidade que tem. O que se acusa é exigência
   SUSTENTADA — três quadros seguidos (75ms) acima da ficha, que é
   coreografia fisicamente impossível, não corte.
   ============================================================ */

import { FPS } from "../modelo/sequencia.js";
import { profOf } from "../modelo/rig.js";
import { renderDmxFx } from "./efeitos.js";
import { resolverP } from "./curvas.js";

/* Pan/tilt de cada head num instante, com o clip que escreveu cada eixo
   — a culpa do aviso vai no bloco certo, não na cabeça em geral. */
function poseEm(d, tracks, t, grade) {
  const st = {};
  d.heads.forEach(h => { st[h.id] = { pan: 0, tilt: 0, dono: {} }; });
  for (const tr of tracks) {
    if (tr.kind !== "dmx") continue;
    const clip = tr.clips.find(c => t >= c.t0 && t < c.t1);
    if (!clip) continue;
    const out = renderDmxFx(clip.fx, resolverP(clip, t), t - clip.t0, t, grade);
    if (out.pan === undefined && out.tilt === undefined) continue;
    const grp = d.groups.find(g => g.id === tr.target);
    for (const id of grp ? grp.members : [tr.target]) {
      const s = st[id]; if (!s) continue;
      if (out.pan !== undefined) { s.pan = out.pan; s.dono.pan = clip.id; }
      if (out.tilt !== undefined) { s.tilt = out.tilt; s.dono.tilt = clip.id; }
    }
  }
  return st;
}

/** Pior violação por clip: [{ clipId, head, eixo, t, vel, max }]. */
export function atropelos(d, tracks, grade) {
  const dt = 1 / FPS;
  const piores = new Map();
  const seguidos = new Map();
  let prev = poseEm(d, tracks, 0, grade);

  for (let t = dt; t <= grade.duracao; t += dt) {
    const cur = poseEm(d, tracks, t, grade);
    for (const h of d.heads) {
      const fis = profOf(h).fisica; if (!fis) continue;
      for (const eixo of ["pan", "tilt"]) {
        const f = fis[eixo]; if (!f) continue;
        // valor é bipolar (-1..1): a excursão inteira (2) é o curso todo
        const vel = (Math.abs(cur[h.id][eixo] - prev[h.id][eixo]) / 2) * f.curso / dt;
        const k = h.id + eixo;
        if (vel <= f.vel * 1.02) { seguidos.set(k, 0); continue; }
        const n = (seguidos.get(k) || 0) + 1;
        seguidos.set(k, n);
        if (n < 3) continue;
        const clipId = cur[h.id].dono[eixo];
        if (!clipId) continue;
        const j = piores.get(clipId);
        if (!j || vel > j.vel)
          piores.set(clipId, { clipId, head: h.id, eixo, t, vel, max: f.vel });
      }
    }
    prev = cur;
  }
  return [...piores.values()];
}
