/* ============================================================
   RENDER — compõe um quadro do show num tempo t.
   Devolve estado semântico (cores por node, capacidades por head),
   ainda sem número de canal nenhum. Quem vira byte é canais.js.
   ============================================================ */

import { chKey, nodesOf, profOf } from "../modelo/rig.js";
import { TRACKS } from "../modelo/sequencia.js";
import { gradePadrao } from "../modelo/sequencia.js";
import { renderPixelFx, renderDmxFx } from "./efeitos.js";

export function estadoInicialDeHead() {
  return { pan: 0, tilt: 0, dim: 0, rgb: [0, 0, 0], gobo: 0, grot: 0 };
}

export function renderFrame(d, t, master = 1, tracks = TRACKS, grade = gradePadrao()) {
  const pixels = {}, heads = {};
  d.pix.forEach(i => { pixels[i.id] = Array.from({ length: nodesOf(i) }, () => [0, 0, 0]); });
  d.heads.forEach(h => { heads[h.id] = estadoInicialDeHead(); });

  for (const track of tracks) {
    const clip = track.clips.find(c => t >= c.t0 && t < c.t1);
    if (!clip) continue;
    const tL = t - clip.t0;

    if (track.kind === "dmx") {
      const hg = d.groups.find(g => g.id === track.target);
      const ids = (hg ? hg.members : [track.target]).filter(i => heads[i]);
      const st = renderDmxFx(clip.fx, clip.p, tL, t, grade);
      ids.forEach(i => {
        const cur = heads[i];
        // merge por campo: sweep escreve pan, gobos escreve gobo.
        // Compõem sem se atropelar.
        const nx = { ...cur, ...st };
        if (st.dim !== undefined) nx.dim = Math.max(cur.dim, st.dim);
        heads[i] = nx;
      });
      continue;
    }
    const grp = d.groups.find(g => g.id === track.target);
    const members = (grp ? grp.members : [track.target]).filter(id => pixels[id]);
    if (!members.length) continue;
    const total = members.reduce((s, id) => s + pixels[id].length, 0);
    const buf = renderPixelFx(clip.fx, clip.p, total, tL, t, grade);
    let k = 0;
    for (const id of members)
      for (let i = 0; i < pixels[id].length; i++, k++) {
        const s = buf[k], p = pixels[id][i];
        // pixel compõe aditivo entre camadas
        pixels[id][i] = [
          Math.min(255, p[0] + s[0] * master),
          Math.min(255, p[1] + s[1] * master),
          Math.min(255, p[2] + s[2] * master)];
      }
  }
  // Passe final: o perfil manda. Capacidade ausente é zerada aqui, no motor,
  // e não em caso especial dentro de cada efeito.
  d.heads.forEach(h => {
    const caps = new Set(profOf(h).ch.map(chKey));
    const st = heads[h.id];
    if (!caps.has("gobo")) st.gobo = 0;
    if (!caps.has("grot")) st.grot = 0;
    if (!caps.has("pan")) st.pan = 0;
    if (!caps.has("tilt")) st.tilt = 0;
    st.dim *= master;
  });
  return { pixels, heads };
}
