import test from "node:test";
import assert from "node:assert/strict";

import {
  DUR_MIN, GRADE, acharClip, adicionarTrilha, ajustarParam, encaixa, folgaEm,
  inserirClip, moverClip, proximoId, redimensionarClip, removerClip, removerTrilha,
  trocarEfeito,
} from "../src/modelo/edicao.js";
import { BEAT, DURATION, EFFECTS } from "../src/modelo/sequencia.js";

// Trilha com dois clips e um vão de 4 batidas no meio.
const base = () => ([{
  id: "t1", target: "g-sup", kind: "pixel", clips: [
    { id: "c1", fx: "wash", t0: BEAT * 0, t1: BEAT * 4, p: { rate: .2 } },
    { id: "c2", fx: "chase", t0: BEAT * 8, t1: BEAT * 12, p: { speed: 1 } },
  ],
}]);
const clipDe = (tr, id) => tr[0].clips.find(c => c.id === id);

test("encaixe cai na semicolcheia e não sai da faixa", () => {
  assert.equal(encaixa(GRADE * 2 + GRADE * 0.4), GRADE * 2);
  assert.equal(encaixa(GRADE * 2 + GRADE * 0.6), GRADE * 3);
  assert.equal(encaixa(-5), 0);
  assert.equal(encaixa(DURATION + 5), DURATION);
});

test("mover preserva a duração", () => {
  // beat 3 cabe: termina em 7, e o c2 só começa em 8
  const r = moverClip(base(), 0, "c1", BEAT * 3);
  const c = clipDe(r, "c1");
  assert.equal(c.t0, BEAT * 3);
  assert.equal(c.t1 - c.t0, BEAT * 4);
});

test("mover não invade o vizinho, encosta nele", () => {
  const r = moverClip(base(), 0, "c1", BEAT * 100);   // joga bem pra frente
  const c = clipDe(r, "c1");
  assert.equal(c.t1, BEAT * 8, "parou colado no começo do c2");
  assert.equal(c.t0, BEAT * 4);
});

test("mover pra trás para no zero", () => {
  const solto = moverClip(base(), 0, "c1", BEAT * 3);          // tira do zero
  const c = clipDe(moverClip(solto, 0, "c1", -BEAT * 50), "c1");
  assert.equal(c.t0, 0);
  assert.equal(c.t1, BEAT * 4);
});

test("mover pra trás encosta no vizinho de trás, não no zero", () => {
  const c = clipDe(moverClip(base(), 0, "c2", -BEAT * 50), "c2");
  assert.equal(c.t0, BEAT * 4, "o c1 termina no 4 e barra a passagem");
  assert.equal(c.t1, BEAT * 8);
});

test("redimensionar respeita duração mínima e vizinho", () => {
  // borda de fim indo longe demais para no vizinho
  assert.equal(clipDe(redimensionarClip(base(), 0, "c1", "fim", BEAT * 99), "c1").t1,
    BEAT * 8);
  // borda de início não pode passar do fim
  const c = clipDe(redimensionarClip(base(), 0, "c1", "ini", BEAT * 99), "c1");
  assert.equal(c.t1 - c.t0, DUR_MIN);
  assert.equal(c.t1, BEAT * 4, "o fim não se mexeu");
  // borda de início não invade quem está atrás
  assert.equal(clipDe(redimensionarClip(base(), 0, "c2", "ini", -BEAT * 9), "c2").t0,
    BEAT * 4);
});

test("clip sobreposto não acontece: o motor pegaria só o primeiro", () => {
  const r = moverClip(base(), 0, "c1", BEAT * 7);
  const [a, b] = [...r[0].clips].sort((x, y) => x.t0 - y.t0);
  assert.ok(a.t1 <= b.t0, `${a.t1} invadiu ${b.t0}`);
});

test("inserir cai no vão e nasce com os parâmetros do efeito", () => {
  const r = inserirClip(base(), 0, "pulse", BEAT * 5);
  assert.equal(r[0].clips.length, 3);
  const novo = r[0].clips.find(c => c.fx === "pulse");
  assert.equal(novo.t0, BEAT * 5);
  assert.equal(novo.t1, BEAT * 8, "encurtou pra caber até o vizinho");
  assert.deepEqual(novo.p, EFFECTS.pulse.p);
  assert.notEqual(novo.p, EFFECTS.pulse.p, "cópia, não a referência do catálogo");
});

test("inserir em cima de um clip não faz nada", () => {
  assert.equal(inserirClip(base(), 0, "pulse", BEAT * 2)[0].clips.length, 2);
});

test("clips ficam ordenados no tempo depois de inserir", () => {
  const r = inserirClip(base(), 0, "pulse", BEAT * 5);
  const t0s = r[0].clips.map(c => c.t0);
  assert.deepEqual(t0s, [...t0s].sort((a, b) => a - b));
});

test("folga enxerga o vão e o fim da faixa", () => {
  assert.deepEqual(folgaEm(base()[0], BEAT * 5), { ini: BEAT * 4, fim: BEAT * 8 });
  assert.equal(folgaEm(base()[0], BEAT * 2), null, "em cima de clip não tem folga");
  assert.deepEqual(folgaEm(base()[0], BEAT * 20), { ini: BEAT * 12, fim: DURATION });
});

test("trocar efeito troca os parâmetros junto", () => {
  const r = trocarEfeito(base(), 0, "c1", "gobos");
  const c = clipDe(r, "c1");
  assert.equal(c.fx, "gobos");
  assert.deepEqual(c.p, EFFECTS.gobos.p);
  assert.equal(c.p.rate, undefined, "não sobrou parâmetro da lavagem");
  assert.equal(c.t0, 0, "tempo não se mexeu");
});

test("ajustar parâmetro não mexe em mais nada", () => {
  const r = ajustarParam(base(), 0, "c1", "rate", 1.5);
  assert.equal(clipDe(r, "c1").p.rate, 1.5);
  assert.deepEqual(clipDe(r, "c2"), clipDe(base(), "c2"));
});

test("remover tira só o clip pedido", () => {
  const r = removerClip(base(), 0, "c1");
  assert.deepEqual(r[0].clips.map(c => c.id), ["c2"]);
});

test("id novo não colide com o que já existe", () => {
  const tracks = base();
  assert.equal(proximoId(tracks), "c3");
  const r = inserirClip(tracks, 0, "pulse", BEAT * 5);
  assert.equal(proximoId(r), "c4");
  const ids = r[0].clips.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("tudo é imutável — é o que faz o undo ser só guardar o anterior", () => {
  const antes = base();
  const copia = JSON.parse(JSON.stringify(antes));
  moverClip(antes, 0, "c1", BEAT * 5);
  redimensionarClip(antes, 0, "c1", "fim", BEAT * 6);
  inserirClip(antes, 0, "pulse", BEAT * 5);
  removerClip(antes, 0, "c1");
  trocarEfeito(antes, 0, "c1", "gobos");
  ajustarParam(antes, 0, "c1", "rate", 9);
  assert.deepEqual(antes, copia, "alguma função mutou o estado original");
});

test("operação que não muda nada devolve o mesmo objeto", () => {
  const tracks = base();
  assert.equal(moverClip(tracks, 0, "c1", 0), tracks, "mover pro mesmo lugar");
  assert.equal(removerClip(tracks, 0, "inexistente"), tracks);
  assert.equal(moverClip(tracks, 9, "c1", 0), tracks, "trilha que não existe");
});

test("trilha entra e sai", () => {
  const r = adicionarTrilha(base(), "h1", "dmx");
  assert.equal(r.length, 2);
  assert.equal(r[1].target, "h1");
  assert.deepEqual(r[1].clips, []);
  assert.notEqual(r[1].id, r[0].id);
  assert.deepEqual(removerTrilha(r, 1), base());
});

test("achar clip diz em que trilha ele está", () => {
  const tracks = adicionarTrilha(base(), "h1", "dmx");
  assert.equal(acharClip(tracks, "c2").ti, 0);
  assert.equal(acharClip(tracks, "c2").clip.fx, "chase");
  assert.equal(acharClip(tracks, "nada"), null);
});
