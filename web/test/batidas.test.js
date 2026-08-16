import test from "node:test";
import assert from "node:assert/strict";

import { bpmAoLongo, rastrearBatidas } from "../src/motor/batidas.js";

const SR = 22050;

/** Faixa com andamento que pode variar ao longo do tempo. */
function faixa({ bpmDe, bpmPara = bpmDe, segundos = 60, sr = SR }) {
  const n = Math.round(segundos * sr);
  const x = new Float32Array(n);
  const bater = (t) => {
    const ini = Math.round(t * sr), len = Math.round(.13 * sr);
    for (let k = 0; k < len && ini + k < n; k++) {
      const u = k / len, f = 150 * Math.pow(45 / 150, u);
      x[ini + k] += Math.sin(2 * Math.PI * f * (k / sr)) * .9 * Math.pow(1 - u, 2.5);
    }
  };
  const marcas = [];
  let t = 0;
  while (t < segundos) {
    bater(t); marcas.push(t);
    const bpm = bpmDe + (bpmPara - bpmDe) * (t / segundos);
    t += 60 / bpm;
  }
  return { x, marcas };
}

/** Quanto cada marca real ficou longe da batida mais próxima do mapa. */
function erroContra(batidas, marcas) {
  let pior = 0, soma = 0, n = 0;
  for (const m of marcas) {
    if (m < 1 || m > marcas[marcas.length - 1] - 1) continue;   // ignora as pontas
    let d = Infinity;
    for (const b of batidas) d = Math.min(d, Math.abs(b - m));
    pior = Math.max(pior, d); soma += d; n++;
  }
  return { pior, medio: soma / (n || 1) };
}

test("marca as batidas de uma faixa de andamento constante", () => {
  const { x, marcas } = faixa({ bpmDe: 128 });
  const r = rastrearBatidas(x, SR);
  assert.ok(Math.abs(r.bpm - 128) < 1.5, `andamento ${r.bpm.toFixed(2)}`);

  const e = erroContra(r.batidas, marcas);
  assert.ok(e.medio < 0.015, `erro médio de ${(e.medio * 1000).toFixed(0)}ms`);
  assert.ok(e.pior < 0.030, `pior erro de ${(e.pior * 1000).toFixed(0)}ms`);
});

test("o mapa cobre a faixa inteira, do zero ao fim", () => {
  const { x } = faixa({ bpmDe: 120, segundos: 45 });
  const r = rastrearBatidas(x, SR);
  assert.ok(r.batidas[0] < 60 / 120, "tem batida antes da primeira nota");
  assert.ok(r.batidas[r.batidas.length - 1] > r.duracao - 60 / 120,
    "o mapa vai até o fim");
  const passos = r.batidas.slice(1).map((b, i) => b - r.batidas[i]);
  assert.ok(passos.every(p => p > 0), "as batidas saem em ordem");
});

test("acompanha faixa acelerando — que é o ponto do mapa existir", () => {
  // 120 subindo pra 132 ao longo de 90s: rubato de baterista humano
  const { x, marcas } = faixa({ bpmDe: 120, bpmPara: 132, segundos: 90 });
  const r = rastrearBatidas(x, SR);
  const mapa = erroContra(r.batidas, marcas);

  // grade rígida no andamento médio, que é o que um BPM escalar daria
  const passo = (r.batidas[r.batidas.length - 1] - r.batidas[0]) / (r.batidas.length - 1);
  const rigida = [];
  for (let t = r.batidas[0]; t < r.duracao; t += passo) rigida.push(t);
  const fixa = erroContra(rigida, marcas);

  assert.ok(mapa.pior < fixa.pior * 0.5,
    `mapa errou ${(mapa.pior * 1000).toFixed(0)}ms no pior caso, grade fixa ${(fixa.pior * 1000).toFixed(0)}ms`);
  assert.ok(mapa.medio < 0.020, `erro médio de ${(mapa.medio * 1000).toFixed(0)}ms`);
});

test("o andamento instantâneo denuncia a aceleração", () => {
  const { x } = faixa({ bpmDe: 110, bpmPara: 130, segundos: 90 });
  const r = rastrearBatidas(x, SR);
  const curva = bpmAoLongo(r.batidas);
  const media = xs => xs.reduce((s, v) => s + v.bpm, 0) / xs.length;
  const inicio = media(curva.slice(5, 25)), fim = media(curva.slice(-25, -5));
  assert.ok(fim > inicio + 8,
    `esperava subir: começou ${inicio.toFixed(1)} e terminou ${fim.toFixed(1)}`);
});

test("silêncio não vira mapa", () => {
  const r = rastrearBatidas(new Float32Array(SR * 30), SR);
  assert.deepEqual(r.batidas, []);
  assert.equal(r.confianca, 0);
});

test("faixa curta demais devolve mapa vazio em vez de inventar", () => {
  const r = rastrearBatidas(new Float32Array(SR), SR);
  assert.deepEqual(r.batidas, []);
});

test("dá pra forçar o andamento e pular a detecção", () => {
  const { x, marcas } = faixa({ bpmDe: 128 });
  const r = rastrearBatidas(x, SR, { bpm: 128 });
  assert.equal(r.bpm, 128);
  assert.ok(erroContra(r.batidas, marcas).medio < 0.015);
});
