import test from "node:test";
import assert from "node:assert/strict";

import {
  DIV_ENCAIXE, acharClip, adicionarTrilha, ajustarParam, colarTrecho,
  copiarTrecho, duplicarClip, duplicarTrilha, encaixa, folgaEm, inserirClip,
  moverClip, proximoId, redimensionarClip, removerClip, removerTrilha,
  retargetTrilha, trocarEfeito,
} from "../src/modelo/edicao.js";
import { BEAT, DURATION, EFFECTS, gradePadrao } from "../src/modelo/sequencia.js";

const G = gradePadrao();
const GRADE = BEAT / DIV_ENCAIXE;
const DUR_MIN = BEAT / DIV_ENCAIXE;

// Trilha com dois clips e um vão de 4 batidas no meio.
const base = () => ([{
  id: "t1", target: "g-sup", kind: "pixel", clips: [
    { id: "c1", fx: "wash", t0: BEAT * 0, t1: BEAT * 4, p: { rate: .2 } },
    { id: "c2", fx: "chase", t0: BEAT * 8, t1: BEAT * 12, p: { speed: 1 } },
  ],
}]);
const clipDe = (tr, id) => tr[0].clips.find(c => c.id === id);

test("encaixe cai na semicolcheia e não sai da faixa", () => {
  assert.ok(Math.abs(encaixa(GRADE * 2 + GRADE * 0.4, G) - GRADE * 2) < 1e-9);
  assert.ok(Math.abs(encaixa(GRADE * 2 + GRADE * 0.6, G) - GRADE * 3) < 1e-9);
  assert.equal(encaixa(-5, G), 0);
  assert.ok(Math.abs(encaixa(DURATION + 5, G) - DURATION) < 1e-9);
});

test("mover preserva a duração", () => {
  // beat 3 cabe: termina em 7, e o c2 só começa em 8
  const r = moverClip(base(), 0, "c1", BEAT * 3, G);
  const c = clipDe(r, "c1");
  assert.equal(c.t0, BEAT * 3);
  assert.equal(c.t1 - c.t0, BEAT * 4);
});

test("mover não invade o vizinho, encosta nele", () => {
  const r = moverClip(base(), 0, "c1", BEAT * 100, G);   // joga bem pra frente
  const c = clipDe(r, "c1");
  assert.equal(c.t1, BEAT * 8, "parou colado no começo do c2");
  assert.equal(c.t0, BEAT * 4);
});

test("mover pra trás para no zero", () => {
  const solto = moverClip(base(), 0, "c1", BEAT * 3, G);          // tira do zero
  const c = clipDe(moverClip(solto, 0, "c1", -BEAT * 50, G), "c1");
  assert.equal(c.t0, 0);
  assert.equal(c.t1, BEAT * 4);
});

test("mover pra trás encosta no vizinho de trás, não no zero", () => {
  const c = clipDe(moverClip(base(), 0, "c2", -BEAT * 50, G), "c2");
  assert.equal(c.t0, BEAT * 4, "o c1 termina no 4 e barra a passagem");
  assert.equal(c.t1, BEAT * 8);
});

test("redimensionar respeita duração mínima e vizinho", () => {
  // borda de fim indo longe demais para no vizinho
  assert.equal(clipDe(redimensionarClip(base(), 0, "c1", "fim", BEAT * 99, G), "c1").t1,
    BEAT * 8);
  // borda de início não pode passar do fim
  const c = clipDe(redimensionarClip(base(), 0, "c1", "ini", BEAT * 99, G), "c1");
  assert.equal(c.t1 - c.t0, DUR_MIN);
  assert.equal(c.t1, BEAT * 4, "o fim não se mexeu");
  // borda de início não invade quem está atrás
  assert.equal(clipDe(redimensionarClip(base(), 0, "c2", "ini", -BEAT * 9, G), "c2").t0,
    BEAT * 4);
});

test("clip sobreposto não acontece: o motor pegaria só o primeiro", () => {
  const r = moverClip(base(), 0, "c1", BEAT * 7, G);
  const [a, b] = [...r[0].clips].sort((x, y) => x.t0 - y.t0);
  assert.ok(a.t1 <= b.t0, `${a.t1} invadiu ${b.t0}`);
});

test("inserir cai no vão e nasce com os parâmetros do efeito", () => {
  const r = inserirClip(base(), 0, "pulse", BEAT * 5, G);
  assert.equal(r[0].clips.length, 3);
  const novo = r[0].clips.find(c => c.fx === "pulse");
  assert.equal(novo.t0, BEAT * 5);
  assert.equal(novo.t1, BEAT * 8, "encurtou pra caber até o vizinho");
  assert.deepEqual(novo.p, EFFECTS.pulse.p);
  assert.notEqual(novo.p, EFFECTS.pulse.p, "cópia, não a referência do catálogo");
});

test("inserir em cima de um clip não faz nada", () => {
  assert.equal(inserirClip(base(), 0, "pulse", BEAT * 2, G)[0].clips.length, 2);
});

test("clips ficam ordenados no tempo depois de inserir", () => {
  const r = inserirClip(base(), 0, "pulse", BEAT * 5, G);
  const t0s = r[0].clips.map(c => c.t0);
  assert.deepEqual(t0s, [...t0s].sort((a, b) => a - b));
});

test("folga enxerga o vão e o fim da faixa", () => {
  assert.deepEqual(folgaEm(base()[0], BEAT * 5, G), { ini: BEAT * 4, fim: BEAT * 8 });
  assert.equal(folgaEm(base()[0], BEAT * 2, G), null, "em cima de clip não tem folga");
  assert.deepEqual(folgaEm(base()[0], BEAT * 20, G), { ini: BEAT * 12, fim: DURATION });
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
  const r = inserirClip(tracks, 0, "pulse", BEAT * 5, G);
  assert.equal(proximoId(r), "c4");
  const ids = r[0].clips.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("tudo é imutável — é o que faz o undo ser só guardar o anterior", () => {
  const antes = base();
  const copia = JSON.parse(JSON.stringify(antes));
  moverClip(antes, 0, "c1", BEAT * 5, G);
  redimensionarClip(antes, 0, "c1", "fim", BEAT * 6, G);
  inserirClip(antes, 0, "pulse", BEAT * 5, G);
  removerClip(antes, 0, "c1");
  trocarEfeito(antes, 0, "c1", "gobos");
  ajustarParam(antes, 0, "c1", "rate", 9);
  assert.deepEqual(antes, copia, "alguma função mutou o estado original");
});

test("operação que não muda nada devolve o mesmo objeto", () => {
  const tracks = base();
  assert.equal(moverClip(tracks, 0, "c1", 0, G), tracks, "mover pro mesmo lugar");
  assert.equal(removerClip(tracks, 0, "inexistente"), tracks);
  assert.equal(moverClip(tracks, 9, "c1", 0, G), tracks, "trilha que não existe");
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

test("retarget desacopla linha de equipamento: troca alvo e kind, clips ficam", () => {
  const tracks = adicionarTrilha(base(), "g-sup", "pixel");
  const ti = tracks.length - 1;
  const com = inserirClip(tracks, ti, "cor", BEAT * 4, G);
  const re = retargetTrilha(com, ti, "h2", "dmx");
  assert.equal(re[ti].target, "h2");
  assert.equal(re[ti].kind, "dmx");
  assert.equal(re[ti].clips.length, 1);          // o bloco sobreviveu à troca
  assert.equal(re[ti].id, com[ti].id);           // é a mesma linha
  assert.equal(re[0].target, com[0].target);     // vizinhas intactas
});

/* O caso do giroflex: pisca alternada em 2 linhas, copiada como trecho
   e colada em sequência pra alongar a animação. */
const giroflex = () => ([
  { id: "t1", target: "f1", kind: "pixel", clips: [
    { id: "c1", fx: "cor", t0: 0, t1: BEAT, p: { hue: 0 } }] },
  { id: "t2", target: "f2", kind: "pixel", clips: [
    { id: "c2", fx: "cor", t0: BEAT, t1: BEAT * 2, p: { hue: .66 },
      kf: { hue: [{ u: 0, v: 0 }, { u: 1, v: .5 }] } }] },
]);

test("copiar trecho guarda trilha, offset relativo e curvas", () => {
  const tr = copiarTrecho(giroflex(), ["c1", "c2"]);
  assert.equal(tr.span, BEAT * 2);
  assert.equal(tr.fim, BEAT * 2);
  const [a, b] = tr.itens;
  assert.deepEqual([a.ti, a.dt, a.dur], [0, 0, BEAT]);
  assert.deepEqual([b.ti, b.dt, b.dur], [1, BEAT, BEAT]);
  assert.equal(b.kf.hue[1].v, .5);                 // a curva veio junto
});

test("colar em sequência alonga o padrão sem colidir", () => {
  const base2 = giroflex();
  const tr = copiarTrecho(base2, ["c1", "c2"]);
  let ts = colarTrecho(base2, tr, tr.fim, G);      // 1ª colada: emenda no fim
  ts = colarTrecho(ts, tr, tr.fim + tr.span, G);   // 2ª: emenda de novo
  assert.equal(ts[0].clips.length, 3);
  assert.equal(ts[1].clips.length, 3);
  // a alternância continua: t1 pisca nos beats pares, t2 nos ímpares
  assert.deepEqual(ts[0].clips.map(c => c.t0 / BEAT), [0, 2, 4]);
  assert.deepEqual(ts[1].clips.map(c => c.t0 / BEAT), [1, 3, 5]);
  // cópia é independente: mexer nela não muda o original
  const novo = ts[1].clips[1];
  novo.kf.hue[1].v = .9;
  assert.equal(ts[1].clips[0].kf.hue[1].v, .5);
  // ids únicos no documento inteiro
  const ids = ts.flatMap(t => t.clips.map(c => c.id));
  assert.equal(new Set(ids).size, ids.length);
});

test("colar onde não cabe pula o item e cola o resto", () => {
  const base2 = giroflex();
  // obstáculo na t2 exatamente onde o item dela cairia
  base2[1].clips.push({ id: "c9", fx: "cor", t0: BEAT * 3, t1: BEAT * 4, p: {} });
  const tr = copiarTrecho(base2, ["c1", "c2"]);
  const ts = colarTrecho(base2, tr, BEAT * 2, G);
  assert.deepEqual(ts[0].clips.map(c => c.t0 / BEAT), [0, 2]);   // colou
  assert.deepEqual(ts[1].clips.map(c => c.t0 / BEAT), [1, 3]);   // pulou o ocupado
});

test("duplicar clip cola logo depois; duplicar trilha copia blocos com ids novos", () => {
  const ts = duplicarClip(giroflex(), 0, "c1", G);
  assert.deepEqual(ts[0].clips.map(c => c.t0 / BEAT), [0, 1]);
  const td = duplicarTrilha(giroflex(), 1);
  assert.equal(td.length, 3);
  assert.equal(td[2].target, "f2");
  assert.equal(td[2].clips[0].kf.hue[1].v, .5);
  assert.notEqual(td[2].clips[0].id, td[1].clips[0].id);
  assert.notEqual(td[2].id, td[1].id);
});
