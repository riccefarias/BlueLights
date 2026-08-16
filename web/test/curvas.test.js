import test from "node:test";
import assert from "node:assert/strict";

import { interpolar, resolverP } from "../src/motor/curvas.js";
import { BEAT, TRACKS } from "../src/modelo/sequencia.js";
import { RIG_PADRAO } from "../src/modelo/rig.js";
import { derive } from "../src/motor/derivar.js";
import { renderFrame } from "../src/motor/render.js";
import { curvarParam, ajustarKf, trocarEfeito } from "../src/modelo/edicao.js";
import { desserializarDocumento, serializarDocumento } from "../src/modelo/documento.js";
import { gradePadrao } from "../src/modelo/sequencia.js";

/* ---------- interpolação ---------- */

const AB = [{ u: 0, v: 0 }, { u: 1, v: 1 }];

test("linear: meio do caminho é meio do valor, pontas seguram", () => {
  assert.equal(interpolar(AB, .5), .5);
  assert.equal(interpolar(AB, 0), 0);
  assert.equal(interpolar(AB, 1), 1);
  // fora do intervalo não extrapola: clip mais longo que a curva segura a ponta
  assert.equal(interpolar(AB, -1), 0);
  assert.equal(interpolar(AB, 2), 1);
});

test("circular: matiz cruza o zero pelo arco mais curto", () => {
  // distância no círculo: 0.9999... e 0.0 são o mesmo matiz
  const arco = (x, y) => Math.min(Math.abs(x - y), 1 - Math.abs(x - y));
  const kf = [{ u: 0, v: .95 }, { u: 1, v: .05 }];
  // no meio do caminho está em 0.0, não em 0.5
  assert.ok(arco(interpolar(kf, .5, "circular"), 0) < 1e-9);
  // e no sentido contrário também
  const volta = [{ u: 0, v: .05 }, { u: 1, v: .95 }];
  assert.ok(arco(interpolar(volta, .5, "circular"), 0) < 1e-9);
  // arco curto de verdade: um quarto do caminho anda um quarto do arco
  assert.ok(arco(interpolar(kf, .25, "circular"), .975) < 1e-9);
});

test("passo: divisor segura o valor até o keyframe seguinte", () => {
  const kf = [{ u: 0, v: 1 }, { u: .5, v: 2 }, { u: 1, v: 4 }];
  assert.equal(interpolar(kf, .49, "passo"), 1);
  assert.equal(interpolar(kf, .5, "passo"), 2);
  assert.equal(interpolar(kf, .99, "passo"), 2);
  assert.equal(interpolar(kf, 1, "passo"), 4);
});

/* ---------- resolverP ---------- */

test("clip sem curva devolve o próprio p, sem cópia", () => {
  const clip = { t0: 0, t1: 4, p: { hue: .5 } };
  assert.equal(resolverP(clip, 2), clip.p);
});

test("curva resolve no instante e respeita o tipo do parâmetro", () => {
  const clip = { t0: 10, t1: 20, p: { hue: .3, div: 1 },
    kf: { hue: [{ u: 0, v: .95 }, { u: 1, v: .05 }],
          div: [{ u: 0, v: 1 }, { u: .6, v: 4 }] } };
  const meio = resolverP(clip, 15);
  assert.ok(Math.abs(meio.hue) < 1e-9);        // circular via PARAM_META
  assert.equal(meio.div, 1);                   // passo: ainda não chegou no B
  assert.equal(resolverP(clip, 16).div, 4);    // em cima do B, troca
  // antes e depois do clip, as pontas
  assert.ok(Math.abs(resolverP(clip, 9).hue - .95) < 1e-9);
  assert.ok(Math.abs(resolverP(clip, 25).hue - .05) < 1e-9);
});

test("curva atravessa o render: pulso com hue A→B muda de cor no tempo", () => {
  const d = derive(RIG_PADRAO);
  const grade = gradePadrao();
  const tracks = [{ id: "t1", target: "g-todas", kind: "pixel", clips: [
    { id: "c1", fx: "pulse", t0: 0, t1: BEAT * 8, p: { div: 8, hue: 0 },
      kf: { hue: [{ u: 0, v: 0 }, { u: 1, v: .33 }] } } ]}];
  const cedo = renderFrame(d, 0.01, 1, tracks, grade).pixels.f1[0];
  const tarde = renderFrame(d, BEAT * 8 - .01, 1, tracks, grade).pixels.f1[0];
  // vermelho no começo, verde no fim — se a curva não passasse, seriam iguais
  assert.ok(cedo[0] > cedo[1]);
  assert.ok(tarde[1] > tarde[0]);
});

/* ---------- edição ---------- */

test("ligar curva não muda a luz; desligar herda o A", () => {
  let ts = [{ id: "t1", target: "g", kind: "pixel", clips: [
    { id: "c1", fx: "pulse", t0: 0, t1: 4, p: { hue: .58 } } ]}];
  ts = curvarParam(ts, 0, "c1", "hue", true);
  const clip = ts[0].clips[0];
  assert.deepEqual(clip.kf.hue, [{ u: 0, v: .58 }, { u: 1, v: .58 }]);
  assert.equal(resolverP(clip, 2).hue, .58);

  ts = ajustarKf(ts, 0, "c1", "hue", 0, .1);
  assert.equal(ts[0].clips[0].kf.hue[0].v, .1);

  ts = curvarParam(ts, 0, "c1", "hue", false);
  assert.equal(ts[0].clips[0].kf, undefined);
  assert.equal(ts[0].clips[0].p.hue, .1);
});

test("trocar o efeito derruba as curvas junto com os parâmetros", () => {
  let ts = [{ id: "t1", target: "g", kind: "pixel", clips: [
    { id: "c1", fx: "pulse", t0: 0, t1: 4, p: { hue: .5 },
      kf: { hue: [{ u: 0, v: 0 }, { u: 1, v: 1 }] } } ]}];
  ts = trocarEfeito(ts, 0, "c1", "wash");
  assert.equal(ts[0].clips[0].kf, undefined);
});

/* ---------- documento ---------- */

test("curva sobrevive a salvar e abrir; curva quebrada cai fora sem recusar", () => {
  const seq = [{ id: "t1", target: "g-todas", kind: "pixel", clips: [
    { id: "c1", fx: "pulse", t0: 0, t1: 4, p: { hue: .5 },
      kf: { hue: [{ u: 0, v: .2 }, { u: 1, v: .8 }] } },
    { id: "c2", fx: "pulse", t0: 4, t1: 8, p: { hue: .5 },
      kf: { hue: [{ u: 0 }, { u: 1, v: "x" }] } } ]}];
  const doc = serializarDocumento({ rig: RIG_PADRAO, sequencia: seq });
  const lido = desserializarDocumento(JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(lido.sequencia[0].clips[0].kf.hue,
    [{ u: 0, v: .2 }, { u: 1, v: .8 }]);
  assert.equal(lido.sequencia[0].clips[1].kf, undefined);
});
