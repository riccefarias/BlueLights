import test from "node:test";
import assert from "node:assert/strict";

import {
  TIPO, VERSAO, desserializarDocumento, documentoPadrao, paraJson, serializarDocumento,
} from "../src/modelo/documento.js";
import { RIG_PADRAO } from "../src/modelo/rig.js";
import { TRACKS } from "../src/modelo/sequencia.js";
import { derive } from "../src/motor/derivar.js";
import { gradeDeBatidas } from "../src/modelo/grade.js";

test("ida e volta preserva o croqui e o que ele deriva", () => {
  const movido = RIG_PADRAO.map(i => i.id === "f1" ? { ...i, x: 300, y: 600, co: "GRB" } : i);
  const texto = paraJson(serializarDocumento({ rig: movido, midia: "faixa07.mp3" }));
  const volta = desserializarDocumento(texto);

  assert.deepEqual(volta.rig, movido);
  assert.equal(volta.midia, "faixa07.mp3");
  // o que importa de verdade: a numeração de canais sobrevive ao arquivo
  assert.deepEqual(derive(volta.rig).chan, derive(movido).chan);
});

test("o documento é JSON de texto mesmo, legível e versionável", () => {
  const texto = paraJson(documentoPadrao());
  assert.match(texto, /"tipo": "bluelights"/);
  assert.match(texto, /"v": 1/);
  assert.equal(JSON.parse(texto).rig.length, RIG_PADRAO.length);
});

test("versão vem no arquivo desde o começo", () => {
  const doc = serializarDocumento({ rig: RIG_PADRAO });
  assert.equal(doc.v, VERSAO);
  assert.equal(doc.tipo, TIPO);
});

test("arquivo do futuro é recusado com mensagem, não com estrago", () => {
  const doc = { ...documentoPadrao(), v: VERSAO + 7 };
  assert.throws(() => desserializarDocumento(doc), /versão 8.*entende até a 1/);
});

test("recusa arquivo que não é nosso antes de aplicar qualquer coisa", () => {
  assert.throws(() => desserializarDocumento("{}"), /não é do BlueLights/);
  assert.throws(() => desserializarDocumento("não é json"), /não é JSON válido/);
  assert.throws(() => desserializarDocumento({ tipo: "xlights", v: 1 }),
    /diz ser "xlights"/);
  assert.throws(() => desserializarDocumento({ tipo: TIPO }), /sem versão/);
});

test("croqui quebrado é recusado inteiro, com o motivo", () => {
  const base = { tipo: TIPO, v: 1, sequencia: TRACKS };
  assert.throws(() => desserializarDocumento({ ...base, rig: [] }), /croqui vazio/);
  assert.throws(() => desserializarDocumento({ ...base,
    rig: [{ id: "a", k: "ovni", x: 1, y: 1 }] }), /tipo de equipamento desconhecido.*ovni/);
  assert.throws(() => desserializarDocumento({ ...base,
    rig: [{ id: "a", k: "farol", x: 1 }] }), /sem posição no palco: a/);
  assert.throws(() => desserializarDocumento({ ...base,
    rig: [{ id: "a", k: "farol", x: 1, y: 1 }, { id: "a", k: "farol", x: 2, y: 2 }] }),
    /id repetido no croqui: a/);
});

test("sequência inválida também é recusada", () => {
  const base = { tipo: TIPO, v: 1, rig: RIG_PADRAO };
  assert.throws(() => desserializarDocumento({ ...base,
    sequencia: [{ target: "g-sup", clips: [{ fx: "chase", t0: 5, t1: 5 }] }] }),
    /tempo inválido/);
  assert.throws(() => desserializarDocumento({ ...base,
    sequencia: [{ target: "g-sup" }] }), /sem clips/);
});

test("documento sem sequência cai na padrão em vez de quebrar", () => {
  const doc = desserializarDocumento({ tipo: TIPO, v: 1, rig: RIG_PADRAO });
  assert.deepEqual(doc.sequencia, TRACKS);
  assert.notEqual(doc.sequencia, TRACKS, "cópia, pra edição não mexer na constante");
  assert.equal(doc.midia, null);
});

test("trilha e clip sem id entram completados, não quebram", () => {
  const doc = desserializarDocumento({
    tipo: TIPO, v: 1, rig: RIG_PADRAO,
    sequencia: [
      { target: "g-sup", kind: "pixel", clips: [{ fx: "wash", t0: 0, t1: 1 }] },
      { target: "g-inf", kind: "pixel", clips: [{ fx: "chase", t0: 0, t1: 1 }] },
    ],
  });
  const ids = doc.sequencia.map(tr => tr.id);
  assert.equal(new Set(ids).size, 2, "ids de trilha únicos");
  assert.ok(ids.every(Boolean));
  const clips = doc.sequencia.flatMap(tr => tr.clips.map(c => c.id));
  assert.equal(new Set(clips).size, 2, "ids de clip únicos");
  assert.deepEqual(doc.sequencia[0].clips[0].p, {}, "clip sem parâmetros ganha objeto vazio");
});

test("id existente não é sobrescrito nem colide com o gerado", () => {
  const doc = desserializarDocumento({
    tipo: TIPO, v: 1, rig: RIG_PADRAO,
    sequencia: [
      { id: "t1", target: "g-sup", kind: "pixel", clips: [{ id: "c1", fx: "wash", t0: 0, t1: 1 }] },
      { target: "g-inf", kind: "pixel", clips: [{ fx: "chase", t0: 0, t1: 1 }] },
    ],
  });
  assert.equal(doc.sequencia[0].id, "t1");
  assert.notEqual(doc.sequencia[1].id, "t1");
  assert.equal(doc.sequencia[0].clips[0].id, "c1");
  assert.notEqual(doc.sequencia[1].clips[0].id, "c1");
});

test("a grade viaja no documento, com o mapa de batidas", () => {
  const grade = gradeDeBatidas([0, 0.5, 1.02, 1.5, 2.01], 3);
  const doc = desserializarDocumento(paraJson(serializarDocumento({ rig: RIG_PADRAO, grade })));
  assert.equal(doc.grade.batidas.length, 5);
  assert.ok(Math.abs(doc.grade.duracao - 3) < 1e-3);
  // o passo irregular sobrevive — é o que carrega o rubato
  assert.ok(Math.abs(doc.grade.duracaoDaBatida(0.7) - 0.52) < 1e-3);
});

test("documento antigo sem grade cai numa fixa em vez de quebrar", () => {
  const doc = desserializarDocumento({ tipo: TIPO, v: 1, rig: RIG_PADRAO });
  assert.ok(doc.grade.batidas.length > 2);
  assert.equal(doc.grade.confianca, 0, "marcada como não detectada");
});
