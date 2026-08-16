import test from "node:test";
import assert from "node:assert/strict";

import { renderDmxFx, renderPixelFx } from "../src/motor/efeitos.js";
import { resolverP } from "../src/motor/curvas.js";
import { gradePadrao, EFFECTS } from "../src/modelo/sequencia.js";

const grade = gradePadrao();

test("pose: a cabeça vai pra onde a pessoa apontou e fica", () => {
  const p = { pan: .4, tilt: -.2, dim: .8, hue: 0, sat: 0, gobo: 2 };
  const a = renderDmxFx("pose", p, 0, 1, grade);
  const b = renderDmxFx("pose", p, 3, 7, grade);   // outro instante, mesmo lugar
  assert.deepEqual(a, b);
  assert.equal(a.pan, .4);
  assert.equal(a.gobo, 2);
  assert.deepEqual(a.rgb, [255, 255, 255]);        // sat 0 = branco
});

test("pose com curva A→B keyframa movimento", () => {
  const clip = { fx: "pose", t0: 0, t1: 10, p: { ...EFFECTS.pose.p },
    kf: { pan: [{ u: 0, v: -.4 }, { u: 1, v: .4 }] } };
  assert.equal(renderDmxFx("pose", resolverP(clip, 5), 5, 5, grade).pan, 0);
  assert.equal(renderDmxFx("pose", resolverP(clip, 10), 10, 10, grade).pan, .4);
});

test("cor fixa pinta todos os pixels iguais, parados no tempo", () => {
  const p = { hue: .6, sat: .9, dim: 1 };
  const a = renderPixelFx("cor", p, 5, 0, 1, grade);
  const b = renderPixelFx("cor", p, 5, 2, 9, grade);
  assert.deepEqual(a[0], a[4]);
  assert.deepEqual(a[0], b[0]);
  assert.ok(a[0][2] > a[0][0]);                    // hue .6 pende pro azul
});
