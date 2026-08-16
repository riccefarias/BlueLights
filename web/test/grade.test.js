import test from "node:test";
import assert from "node:assert/strict";

import {
  gradeDeBatidas, gradeDeDoc, gradeFixa, gradeParaDoc,
} from "../src/modelo/grade.js";

const perto = (a, b, tol = 1e-6, msg) =>
  assert.ok(Math.abs(a - b) < tol, msg || `${a} != ${b}`);

test("grade fixa é um mapa regular, não um modo separado", () => {
  const g = gradeFixa({ bpm: 120, duracao: 10 });
  perto(g.bpm, 120, 1e-9);
  perto(g.batidas[1] - g.batidas[0], 0.5, 1e-9);
  assert.equal(g.compassos, 5, "10s a 120bpm são 20 batidas = 5 compassos");
});

test("segundo vira batida e batida vira segundo, nos dois sentidos", () => {
  const g = gradeFixa({ bpm: 120, duracao: 20 });
  perto(g.indiceEm(0), 0);
  perto(g.indiceEm(0.5), 1);
  perto(g.indiceEm(0.75), 1.5, 1e-9, "meio caminho entre batidas");
  perto(g.tempoDe(4), 2);
  perto(g.tempoDe(4.5), 2.25);
  for (const t of [0, 1.3, 7.77, 19]) perto(g.tempoDe(g.indiceEm(t)), t, 1e-9);
});

test("fase é o que os efeitos usam: 0 a 1 dentro da subdivisão", () => {
  const g = gradeFixa({ bpm: 120, duracao: 20 });   // batida de 0.5s
  perto(g.faseEm(0, 1), 0);
  perto(g.faseEm(0.25, 1), 0.5, 1e-9, "meio da batida");
  perto(g.faseEm(0.25, 2), 0, 1e-9, "mas começo da colcheia seguinte");
  perto(g.faseEm(0.125, 2), 0.5, 1e-9);
  perto(g.faseEm(0.0625, 4), 0.5, 1e-9, "semicolcheia");
});

test("num mapa que acelera, a fase acompanha sem deriva", () => {
  // batidas encurtando: 0.60, 0.55, 0.50, 0.45...
  const batidas = [0];
  let passo = 0.60;
  for (let i = 0; i < 20; i++) { batidas.push(batidas[batidas.length - 1] + passo); passo -= 0.005; }
  const g = gradeDeBatidas(batidas, batidas[batidas.length - 1]);

  // em CADA batida a fase é zero, não importa quanto o andamento mudou
  for (let i = 0; i < batidas.length; i++)
    perto(g.faseEm(batidas[i], 1), 0, 1e-6, `batida ${i} fora de fase`);
  // e no meio de qualquer batida é meio
  for (let i = 0; i < batidas.length - 1; i++)
    perto(g.faseEm((batidas[i] + batidas[i + 1]) / 2, 1), 0.5, 1e-6);
});

test("encaixe cai na subdivisão mais próxima", () => {
  const g = gradeFixa({ bpm: 120, duracao: 20 });    // batida 0.5s, 1/4 = 0.125s
  perto(g.encaixar(0.13, 4), 0.125);
  perto(g.encaixar(0.19, 4), 0.25);
  perto(g.encaixar(1.24, 2), 1.25);
  perto(g.encaixar(1.24, 1), 1.0, 1e-9, "com div 1 vai pra batida cheia");
});

test("encaixe num mapa irregular usa o passo local, não a média", () => {
  const batidas = [0, 1, 2, 2.5, 3, 3.5];            // dobra de andamento no meio
  const g = gradeDeBatidas(batidas, 4);
  perto(g.encaixar(1.9, 1), 2, 1e-9);
  perto(g.encaixar(2.6, 1), 2.5, 1e-9, "no trecho rápido, encaixa no rápido");
  perto(g.duracaoDaBatida(0.5), 1);
  perto(g.duracaoDaBatida(2.7), 0.5);
});

test("fora do mapa extrapola no passo da ponta em vez de explodir", () => {
  const g = gradeDeBatidas([2, 2.5, 3], 10);
  perto(g.indiceEm(1.5), -1, 1e-9, "antes da primeira batida");
  perto(g.tempoDe(-2), 1);
  perto(g.indiceEm(4), 4, 1e-9, "depois da última");
  assert.ok(Number.isFinite(g.encaixar(9.9, 4)));
});

test("ida e volta pelo documento preserva a grade", () => {
  const g = gradeFixa({ bpm: 131.7, duracao: 143.1, confianca: 0.62 });
  const volta = gradeDeDoc(gradeParaDoc(g));
  perto(volta.bpm, g.bpm, 1e-3);
  perto(volta.duracao, g.duracao, 1e-3);
  assert.equal(volta.confianca, 0.62);
  assert.equal(volta.batidas.length, g.batidas.length);
  for (let i = 0; i < g.batidas.length; i++) perto(volta.batidas[i], g.batidas[i], 1e-3);
});

test("documento sem grade cai numa fixa em vez de quebrar", () => {
  const g = gradeDeDoc(undefined);
  perto(g.bpm, 128, 1e-9);
  assert.equal(g.confianca, 0);
  assert.ok(g.batidas.length > 2);
});

test("mapa com menos de duas batidas é recusado", () => {
  assert.throws(() => gradeDeBatidas([1], 10), /duas batidas/);
});
