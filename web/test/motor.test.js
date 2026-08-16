import test from "node:test";
import assert from "node:assert/strict";

import { PROFILES, RIG_PADRAO } from "../src/modelo/rig.js";
import { BEAT, TRACKS } from "../src/modelo/sequencia.js";
import { derive, capsOf, responders } from "../src/motor/derivar.js";
import { renderFrame } from "../src/motor/render.js";
import { serializarFrame, goboParaByte, grotParaByte, rgbw } from "../src/motor/canais.js";

/* O croqui é a fonte da verdade: canal sai da posição, não de cadastro. */

test("numeração de canais vem da posição: pixels por Y depois X, heads por X", () => {
  const d = derive(RIG_PADRAO);
  // 6 faróis × 1 node (medido na bancada) × 3 bytes = 18 canais de pixel
  assert.equal(d.chan.f1, 1);
  assert.equal(d.chan.f2, 4);
  assert.equal(d.chan.f3, 7);
  assert.equal(d.chan.f4, 10);   // caixa inferior vem depois, é Y maior
  assert.equal(d.chan.f6, 16);
  // heads começam onde o pixel acabou, ordenadas por X
  assert.equal(d.chan.h1, 19);
  assert.equal(d.chan.h2, 19 + PROFILES["beam-16"].ch.length);
  assert.equal(d.chan.h3, 35 + PROFILES["wash-12"].ch.length);
  assert.equal(d.totalCh, 62);
  assert.equal(d.totalNodes, 6);
});

test("mover um farol no croqui renumera sem tocar em sequência", () => {
  const movido = RIG_PADRAO.map(i => i.id === "f1" ? { ...i, y: 600 } : i);
  const d = derive(movido);
  assert.equal(d.chan.f2, 1);            // f1 saiu da frente
  assert.equal(d.chan.f1, 16);           // e foi pro fim dos pixels
  assert.equal(d.totalCh, 62);           // o total não muda
});

test("node RGBW ocupa 4 bytes, não 3", () => {
  const rig = RIG_PADRAO.map(i => i.id === "f1" ? { ...i, co: "RGBW" } : i);
  const d = derive(rig);
  assert.equal(d.chan.f2, 1 + 1 * 4);
  assert.equal(d.totalCh, 62 + 1);
});

test("grupos saem da média de Y, sem lista manual de membros", () => {
  const d = derive(RIG_PADRAO);
  const sup = d.groups.find(g => g.id === "g-sup");
  const inf = d.groups.find(g => g.id === "g-inf");
  assert.deepEqual(sup.members, ["f1", "f2", "f3"]);
  assert.deepEqual(inf.members, ["f4", "f5", "f6"]);
});

test("capacidade vem do perfil: a wash central não tem gobo", () => {
  const d = derive(RIG_PADRAO);
  assert.ok(capsOf("h1", d, RIG_PADRAO).has("gobo"));
  assert.ok(!capsOf("h2", d, RIG_PADRAO).has("gobo"));
  // grupo misto não é erro: duas trocam, a central ignora
  assert.deepEqual(responders("gobos", "g-heads", d, RIG_PADRAO), { ok: 2, total: 3 });
  assert.deepEqual(responders("sweep", "g-heads", d, RIG_PADRAO), { ok: 3, total: 3 });
});

/* Passe final: capacidade ausente é zerada no motor. */

test("efeito de gobo não escreve nada na cabeça sem gobo", () => {
  const d = derive(RIG_PADRAO);
  const t = BEAT * 14;                       // gobos e gspin ativos
  const frame = renderFrame(d, t, 1, TRACKS);
  assert.ok(frame.heads.h1.gobo > 0, "a beam com gobo trocou de forma");
  assert.equal(frame.heads.h2.gobo, 0, "a wash sem gobo ficou zerada");
  assert.equal(frame.heads.h2.grot, 0);

  const bytes = serializarFrame(d, frame);
  const baseH2 = d.chan.h2 - 1;
  const chs = PROFILES["wash-12"].ch;
  assert.equal(chs.includes("gobo"), false, "o perfil não tem canal de gobo pra escrever");
  // e o que a wash tem continua sendo escrito
  assert.equal(bytes[baseH2 + chs.indexOf("dim")] > 0, true);
});

/* Serialização: é aqui, e só aqui, que existe número de canal. */

test("ordem de cor é respeitada byte a byte", () => {
  const rig = [
    { id: "p1", k: "farol", lb: "grb", x: 100, y: 100, n: 1, co: "GRB" },
    { id: "p2", k: "farol", lb: "rgb", x: 200, y: 100, n: 1, co: "RGB" },
  ];
  const d = derive(rig);
  const frame = { pixels: { p1: [[10, 20, 30]], p2: [[10, 20, 30]] }, heads: {} };
  const b = serializarFrame(d, frame);
  assert.deepEqual([...b.subarray(0, 3)], [20, 10, 30]);   // G R B
  assert.deepEqual([...b.subarray(3, 6)], [10, 20, 30]);   // R G B
});

test("RGBW extrai o branco comum, RGB deixa o cinza onde está", () => {
  assert.deepEqual(rgbw([200, 120, 60]), [140, 60, 0, 60]);
  const rig = [{ id: "p1", k: "farol", lb: "w", x: 100, y: 100, n: 1, co: "RGBW" }];
  const d = derive(rig);
  const b = serializarFrame(d, { pixels: { p1: [[200, 120, 60]] }, heads: {} });
  assert.deepEqual([...b.subarray(0, 4)], [140, 60, 0, 60]);
});

test("pan de 16 bits vira par grosso/fino, e o centro é o repouso", () => {
  const rig = [{ id: "h1", k: "head", lb: "b", x: 100, y: 100, pf: "beam-16" }];
  const d = derive(rig);
  const chs = PROFILES["beam-16"].ch;
  const st = { pan: 0, tilt: 0, dim: 0, rgb: [0, 0, 0], gobo: 0, grot: 0 };

  const centro = serializarFrame(d, { pixels: {}, heads: { h1: st } });
  assert.equal(centro[chs.indexOf("pan")], 0x80);      // (0+1)/2 → 0x8000
  assert.equal(centro[chs.indexOf("pan+")], 0x00);

  const ponta = serializarFrame(d, { pixels: {}, heads: { h1: { ...st, pan: 1 } } });
  assert.equal(ponta[chs.indexOf("pan")], 0xFF);
  assert.equal(ponta[chs.indexOf("pan+")], 0xFF);

  // canal sem par fino é 8 bits puro
  assert.equal(chs.indexOf("dim") >= 0, true);
  const aceso = serializarFrame(d, { pixels: {}, heads: { h1: { ...st, dim: 1 } } });
  assert.equal(aceso[chs.indexOf("dim")], 255);
});

test("gobo cai no centro da fatia e a rotação fica na metade indexada", () => {
  assert.equal(goboParaByte(0, 6), 21);
  assert.equal(goboParaByte(5, 6), 234);
  assert.equal(grotParaByte(0), 0);
  assert.equal(grotParaByte(Math.PI), 64);
  assert.ok(grotParaByte(Math.PI * 2 - 0.001) <= 127, "nunca invade a faixa de velocidade");
  assert.equal(grotParaByte(Math.PI * 4), 0, "ângulo acumulado dá a volta");
});

test("master zero apaga tudo que é luz", () => {
  const d = derive(RIG_PADRAO);
  const frame = renderFrame(d, BEAT * 2, 0, TRACKS);
  const b = serializarFrame(d, frame);
  const pixelEmCima = b.subarray(0, 18);
  assert.ok(pixelEmCima.every(v => v === 0), "nenhum pixel aceso");
  const chs = PROFILES["beam-16"].ch;
  assert.equal(b[d.chan.h1 - 1 + chs.indexOf("dim")], 0, "dimmer da head no chão");
});
