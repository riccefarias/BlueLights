import test from "node:test";
import assert from "node:assert/strict";

import { profOf, footprint, chLb, PROFILES } from "../src/modelo/rig.js";
import { derive } from "../src/motor/derivar.js";
import { serializarFrame } from "../src/motor/canais.js";
import { estadoInicialDeHead } from "../src/motor/render.js";
import { RIG_PADRAO } from "../src/modelo/rig.js";
import { desserializarDocumento, serializarDocumento } from "../src/modelo/documento.js";
import { TRACKS } from "../src/modelo/sequencia.js";

test("tabela da sonda vence o perfil de catálogo", () => {
  const h = { id: "h9", k: "head", pf: "beam-16", chs: ["pan", "tilt", "dim", "?"] };
  assert.deepEqual(profOf(h).ch, ["pan", "tilt", "dim", "?"]);
  assert.equal(footprint(h), 4);
  // sem chs, catálogo como sempre
  assert.equal(profOf({ id: "h9", k: "head", pf: "beam-16" }), PROFILES["beam-16"]);
  assert.equal(chLb("?"), "Desconhecido");
});

test("canal ? serializa zero; os rotulados serializam normal", () => {
  const rig = RIG_PADRAO.map(i =>
    i.id === "h1" ? { ...i, chs: ["dim", "?", "pan"] } : i);
  const d = derive(rig);
  const st = { ...estadoInicialDeHead(), dim: 1, pan: 1 };
  const buf = serializarFrame(d, { pixels: {}, heads: { h1: st } });
  const base = d.chan.h1 - 1;
  assert.equal(buf[base], 255);       // dim
  assert.equal(buf[base + 1], 0);     // ? sempre zero
  assert.equal(buf[base + 2], 255);   // pan +1 = ponta da faixa
});

test("a descoberta sobrevive a salvar e abrir", () => {
  const rig = RIG_PADRAO.map(i =>
    i.id === "h2" ? { ...i, chs: ["pan", "tilt", "dim", "shut", "r", "g", "b"] } : i);
  const doc = serializarDocumento({ rig, sequencia: TRACKS });
  const lido = desserializarDocumento(JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(lido.rig.find(i => i.id === "h2").chs,
    ["pan", "tilt", "dim", "shut", "r", "g", "b"]);
});
