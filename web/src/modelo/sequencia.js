/* ============================================================
   MODELO — a sequência: grade de tempo, efeitos, trilhas, cenas.
   ============================================================ */

export const BPM = 128, BEAT = 60 / BPM, BARS = 8, DURATION = BEAT * 4 * BARS;

/* Taxa de quadros do show. 40fps é o que o .fseq carrega e o que o
   ESP toca: 25ms de passo, que é exatamente o campo stepTime do formato. */
export const FPS = 40;

export const EFFECTS = {
  wash:   { label: "Lavagem", color: "#7A5CFF", needs: ["rgb"] },
  chase:  { label: "Corrida", color: "#00C2A8", needs: ["rgb"] },
  pulse:  { label: "Pulso", color: "#2B6BFF", needs: ["rgb"] },
  strobe: { label: "Strobo", color: "#2B6BFF", needs: ["rgb"] },
  sweep:  { label: "Varredura", color: "#FFA023", needs: ["pan", "tilt"] },
  beam:   { label: "Feixe", color: "#FFA023", needs: ["dim"] },
  gobos:  { label: "Troca de gobo", color: "#FFA023", needs: ["gobo"] },
  gspin:  { label: "Gobo girando", color: "#FFA023", needs: ["grot"] },
  wheel:  { label: "Roda de cor", color: "#FFA023", needs: ["color"] },
  prisma: { label: "Prisma", color: "#FFA023", needs: ["prism"] },
  jato:   { label: "Jato de fumaça", color: "#8A97AB", needs: ["fog"] },
  lsweep: { label: "Varredura laser", color: "#FF3B6B", needs: ["x", "y"] },
};

export const TRACKS = [
  { target: "g-todas", kind: "pixel", clips: [
    { id: "c1", fx: "wash", t0: 0, t1: BEAT * 16, p: { rate: 0.18, spread: 1 } },
    { id: "c2", fx: "pulse", t0: BEAT * 16, t1: BEAT * 24, p: { div: 1, hue: 0.58 } } ]},
  { target: "g-sup", kind: "pixel", clips: [
    { id: "c3", fx: "chase", t0: BEAT * 4, t1: BEAT * 16, p: { speed: 1.1, hue: 0.55 } },
    { id: "c4", fx: "strobe", t0: BEAT * 24, t1: BEAT * 32, p: { div: 4, hue: 0, sat: 0 } } ]},
  { target: "g-inf", kind: "pixel", clips: [
    { id: "c5", fx: "chase", t0: BEAT * 4, t1: BEAT * 16, p: { speed: -1.1, hue: 0.88 } },
    { id: "c6", fx: "strobe", t0: BEAT * 24, t1: BEAT * 32, p: { div: 4, hue: 0, sat: 0 } } ]},
  { target: "g-heads", kind: "dmx", clips: [
    { id: "c20", fx: "gobos", t0: BEAT * 8, t1: BEAT * 20, p: { div: 2 } } ]},
  { target: "g-heads", kind: "dmx", clips: [
    { id: "c21", fx: "gspin", t0: BEAT * 12, t1: BEAT * 20, p: { rate: .35 } } ]},
  { target: "h1", kind: "dmx", clips: [
    { id: "c9", fx: "sweep", t0: 0, t1: BEAT * 20, p: { rate: 0.25, range: 0.7, hue: 0.6 } },
    { id: "c10", fx: "beam", t0: BEAT * 24, t1: BEAT * 32, p: { div: 2, hue: 0, sat: 0 } } ]},
  { target: "h2", kind: "dmx", clips: [
    { id: "c11", fx: "sweep", t0: BEAT * 8, t1: BEAT * 24, p: { rate: 0.4, range: 0.35, hue: 0.1 } } ]},
  { target: "h3", kind: "dmx", clips: [
    { id: "c12", fx: "sweep", t0: 0, t1: BEAT * 20, p: { rate: -0.25, range: 0.7, hue: 0.6 } },
    { id: "c13", fx: "beam", t0: BEAT * 24, t1: BEAT * 32, p: { div: 2, hue: 0, sat: 0 } } ]},
];

export const SCENES = [
  { id: "s1", name: "Abertura", sub: "lavagem lenta", t0: 0, t1: BEAT * 16, c: "#7A5CFF" },
  { id: "s2", name: "Corrida", sub: "espelhada", t0: BEAT * 4, t1: BEAT * 16, c: "#00C2A8" },
  { id: "s3", name: "Subida", sub: "pulso no kick", t0: BEAT * 16, t1: BEAT * 24, c: "#2B6BFF" },
  { id: "s4", name: "Drop", sub: "strobo branco", t0: BEAT * 24, t1: BEAT * 32, c: "#FF3B6B" },
  { id: "s5", name: "Faixa toda", sub: "8 compassos", t0: 0, t1: DURATION, c: "#FFA023" },
];
