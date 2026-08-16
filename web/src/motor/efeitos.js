/* ============================================================
   EFEITOS — funções puras.

   Um efeito NUNCA sabe onde os LEDs estão nem em que canal caem.
   Pixel: desenha numa matriz abstrata de n posições.
   DMX: devolve capacidades ("tilt = 0.3"), nunca número de canal.

   E, desde a grade existir, ele também não sabe em que segundo está:
   fala em **batida**, e a grade traduz. É a mesma regra do perfil de
   fixture, aplicada ao tempo — e é o que faz um pattern não derivar
   nem quando a faixa acelera.

   Parâmetro de taxa é sempre "por batida". `rate: 0.125` numa
   varredura é um ciclo de pan a cada 8 batidas, em qualquer andamento.
   ============================================================ */

import { GOBOS } from "../modelo/rig.js";

export function hsv(h, s, v) {
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const m = [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i % 6];
  return [(m[0] * 255) | 0, (m[1] * 255) | 0, (m[2] * 255) | 0];
}

export function renderPixelFx(fx, p, n, tL, tG, grade) {
  const out = Array.from({ length: n }, () => [0, 0, 0]);
  const bG = grade.indiceEm(tG);                        // batidas desde o início
  const bL = bG - grade.indiceEm(tG - tL);              // batidas desde o clip

  if (fx === "wash") {
    for (let i = 0; i < n; i++)
      out[i] = hsv(bG * (p.rate ?? .0625) + (i / n) * (p.spread ?? 1), .85, .9);
  } else if (fx === "chase") {
    const pos = (((bL * (p.speed ?? .5) * n) % n) + n) % n;
    for (let i = 0; i < n; i++) {
      let d = Math.abs(i - pos); d = Math.min(d, n - d);
      const b = Math.max(0, 1 - d * .75);
      out[i] = hsv(p.hue ?? .55, .8, b * b);
    }
  } else if (fx === "strobe") {
    const b = Math.exp(-grade.faseEm(tG, p.div ?? 2) * 9);
    for (let i = 0; i < n; i++) out[i] = hsv(p.hue ?? 0, p.sat ?? 0, b);
  } else if (fx === "pulse") {
    const b = Math.pow(1 - grade.faseEm(tG, p.div ?? 1), 2.2);
    for (let i = 0; i < n; i++) out[i] = hsv(p.hue ?? .58, .9, b);
  }
  return out;
}

export function renderDmxFx(fx, p, tL, tG, grade) {
  const bG = grade.indiceEm(tG);

  if (fx === "sweep") return {
    pan: Math.sin(bG * Math.PI * 2 * (p.rate ?? .125)) * (p.range ?? .6),
    tilt: p.tilt ?? 0,
    dim: .85, rgb: hsv(p.hue ?? .6, .8, 1) };

  // troca de gobo é passo discreto: ela pula, não interpola
  if (fx === "gobos")
    return { gobo: 1 + (grade.passoEm(tG, p.div ?? 2) % (GOBOS.length - 1)) };

  if (fx === "gspin") return { grot: bG * (p.rate ?? .25) * Math.PI * 2 };

  if (fx === "beam") {
    return { pan: 0, gobo: 0,
             dim: Math.exp(-grade.faseEm(tG, p.div ?? 2) * 7),
             rgb: hsv(p.hue ?? 0, p.sat ?? 0, 1) };
  }
  /* Roda de cor: posição fixa, ou girando quando `div` > 0. Diferente do
     RGB — aqui a cor vem de um filtro físico, não de misturar emissor. */
  if (fx === "wheel") {
    const div = p.div ?? 0;
    return { color: div > 0 ? grade.faseEm(tG, div) : (p.pos ?? .3) };
  }
  if (fx === "prisma") return { prism: p.forca ?? 1 };
  if (fx === "jato") return { fog: p.forca ?? 1, fan: p.vento ?? .5 };
  if (fx === "lsweep") {
    const a = bG * Math.PI * 2 * (p.rate ?? .25), r = p.range ?? .8;
    return { x: .5 + Math.sin(a) * r * .5, y: .5 + Math.cos(a * .5) * r * .5 };
  }
  return {};
}
