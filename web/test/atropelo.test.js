import test from "node:test";
import assert from "node:assert/strict";

import { atropelos } from "../src/motor/atropelo.js";
import { derive } from "../src/motor/derivar.js";
import { RIG_PADRAO, PROFILES } from "../src/modelo/rig.js";
import { BEAT, TRACKS, gradePadrao } from "../src/modelo/sequencia.js";

const d = derive(RIG_PADRAO);
const grade = gradePadrao();
const trilha = clips => [{ id: "t1", target: "h1", kind: "dmx", clips }];

test("varredura rápida demais numa beam é acusada, com a física certa", () => {
  const avisos = atropelos(d, trilha([
    { id: "c1", fx: "sweep", t0: 0, t1: BEAT * 8, p: { rate: .5, range: 1 } }]), grade);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].clipId, "c1");
  assert.equal(avisos[0].eixo, "pan");
  assert.equal(avisos[0].max, PROFILES["beam-16"].fisica.pan.vel);
  assert.ok(avisos[0].vel > avisos[0].max);
});

test("varredura calma passa limpa", () => {
  const avisos = atropelos(d, trilha([
    { id: "c1", fx: "sweep", t0: 0, t1: BEAT * 8, p: { rate: .03, range: .5 } }]), grade);
  assert.equal(avisos.length, 0);
});

test("pose A→B curta demais atropela; a mesma viagem com tempo passa", () => {
  const kf = { pan: [{ u: 0, v: -1 }, { u: 1, v: 1 }] };
  const p = { pan: 0, tilt: 0, dim: 1, hue: 0, sat: 0, gobo: 0 };
  const curta = atropelos(d, trilha([
    { id: "c1", fx: "pose", t0: 0, t1: BEAT, p, kf }]), grade);
  assert.equal(curta.length, 1);
  const longa = atropelos(d, trilha([
    { id: "c1", fx: "pose", t0: 0, t1: BEAT * 16, p, kf }]), grade);
  assert.equal(longa.length, 0);
});

test("corte seco entre poses não é atropelamento", () => {
  const p = (pan) => ({ pan, tilt: 0, dim: 1, hue: 0, sat: 0, gobo: 0 });
  const avisos = atropelos(d, trilha([
    { id: "c1", fx: "pose", t0: 0, t1: BEAT * 4, p: p(-1) },
    { id: "c2", fx: "pose", t0: BEAT * 4, t1: BEAT * 8, p: p(1) }]), grade);
  assert.equal(avisos.length, 0);
});

test("o show de demonstração viola — e o alerta sabe", () => {
  const avisos = atropelos(d, TRACKS, grade);
  assert.ok(avisos.length >= 1);
  assert.ok(avisos.some(a => a.eixo === "pan"));
});
