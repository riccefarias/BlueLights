/* ============================================================
   EFEITOS — funções puras.
   Um efeito NUNCA sabe onde os LEDs estão nem em que canal caem.
   Pixel: desenha numa matriz abstrata de n posições.
   DMX: devolve capacidades ("tilt = 0.3"), nunca número de canal.
   ============================================================ */

import { GOBOS } from "../modelo/rig.js";
import { BEAT } from "../modelo/sequencia.js";

export function hsv(h, s, v) {
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const m = [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i % 6];
  return [(m[0] * 255) | 0, (m[1] * 255) | 0, (m[2] * 255) | 0];
}

export function renderPixelFx(fx, p, n, tL, tG) {
  const out = Array.from({ length: n }, () => [0, 0, 0]);
  if (fx === "wash") {
    for (let i = 0; i < n; i++)
      out[i] = hsv(tG * (p.rate ?? .2) + (i / n) * (p.spread ?? 1), .85, .9);
  } else if (fx === "chase") {
    const pos = (((tL * (p.speed ?? 1) * n) % n) + n) % n;
    for (let i = 0; i < n; i++) {
      let d = Math.abs(i - pos); d = Math.min(d, n - d);
      const b = Math.max(0, 1 - d * .75);
      out[i] = hsv(p.hue ?? .55, .8, b * b);
    }
  } else if (fx === "strobe") {
    const per = BEAT / (p.div ?? 2);
    const b = Math.exp((-(tG % per) / per) * 9);
    for (let i = 0; i < n; i++) out[i] = hsv(p.hue ?? 0, p.sat ?? 0, b);
  } else if (fx === "pulse") {
    const per = BEAT / (p.div ?? 1);
    const b = Math.pow(1 - (tG % per) / per, 2.2);
    for (let i = 0; i < n; i++) out[i] = hsv(p.hue ?? .58, .9, b);
  }
  return out;
}

export function renderDmxFx(fx, p, tL, tG) {
  if (fx === "sweep") return {
    pan: Math.sin(tG * Math.PI * 2 * (p.rate ?? .25)) * (p.range ?? .6),
    tilt: p.tilt ?? 0,
    dim: .85, rgb: hsv(p.hue ?? .6, .8, 1) };
  if (fx === "gobos") {
    const per = BEAT / (p.div ?? 2);
    return { gobo: 1 + (Math.floor(tG / per) % (GOBOS.length - 1)) };
  }
  if (fx === "gspin") return { grot: tG * (p.rate ?? .6) * Math.PI * 2 };
  if (fx === "beam") {
    const per = BEAT / (p.div ?? 2);
    return { pan: 0, gobo: 0, dim: Math.exp((-(tG % per) / per) * 7),
             rgb: hsv(p.hue ?? 0, p.sat ?? 0, 1) };
  }
  return {};
}
