import test from "node:test";
import assert from "node:assert/strict";

import { gradeDeBatidas, moverBatida } from "../src/modelo/grade.js";

const grade = () => gradeDeBatidas([0, 1, 2, 3, 4], 5, { confianca: .8 });

test("mover uma batida reinterpola os trechos vizinhos", () => {
  const g = moverBatida(grade(), 2, 2.5);
  assert.equal(g.batidas[2], 2.5);
  // o meio do trecho esticado é meia batida — a grade É a interpolação
  assert.ok(Math.abs(g.indiceEm(1.75) - 1.5) < 1e-9);   // 1..2.5 esticou
  assert.ok(Math.abs(g.indiceEm(2.75) - 2.5) < 1e-9);   // 2.5..3 encolheu
  // fora do trecho mexido, nada muda
  assert.equal(g.indiceEm(.5), .5);
  assert.equal(g.indiceEm(3.5), 3.5);
});

test("batida não passa por cima da vizinha", () => {
  const g = moverBatida(grade(), 2, 9);
  assert.ok(g.batidas[2] < g.batidas[3]);
  const g2 = moverBatida(grade(), 2, -9);
  assert.ok(g2.batidas[2] > g2.batidas[1]);
});

test("pontas: primeira não vai antes do zero, última não passa da duração", () => {
  assert.ok(moverBatida(grade(), 0, -3).batidas[0] >= 0);
  assert.ok(moverBatida(grade(), 4, 99).batidas[4] <= 5);
});

test("índice fora da lista devolve a grade intacta; confiança sobrevive", () => {
  const g = grade();
  assert.equal(moverBatida(g, 99, 1), g);
  assert.equal(moverBatida(g, 1, 1.2).confianca, .8);
});
