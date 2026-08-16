import { gradeFixa } from "./grade.js";
import { GOBOS } from "./rig.js";

/* ============================================================
   MODELO — a sequência: grade de tempo, efeitos, trilhas, cenas.
   ============================================================ */

export const BPM = 128, BEAT = 60 / BPM, BARS = 8, DURATION = BEAT * 4 * BARS;

/* Taxa de quadros do show. 40fps é o que o .fseq carrega e o que o
   ESP toca: 25ms de passo, que é exatamente o campo stepTime do formato. */
export const FPS = 40;

/* Grade padrão do documento novo: 8 compassos a 128, sem áudio ainda.
   É só um mapa regular — quem manda de verdade passa a ser o arquivo. */
export function gradePadrao() { return gradeFixa({ bpm: BPM, duracao: DURATION }); }

/* Cada efeito declara as capacidades que exige e os parâmetros com que
   nasce. Os padrões aqui são os mesmos `??` de `motor/efeitos.js` — o
   clip carrega o valor explícito, o motor continua tolerando a falta. */
export const EFFECTS = {
  wash:   { label: "Lavagem", color: "#7A5CFF", needs: ["rgb"],
            p: { rate: .0625, spread: 1 } },
  chase:  { label: "Corrida", color: "#00C2A8", needs: ["rgb"],
            p: { speed: .5, hue: .55 } },
  pulse:  { label: "Pulso", color: "#2B6BFF", needs: ["rgb"],
            p: { div: 1, hue: .58 } },
  /* Blocos manuais: aqui quem manda é a pessoa, não uma fórmula. `cor`
     pinta os pixels parado; `pose` posiciona a cabeça. Com curva A→B em
     cima, pose vira movimento keyframado — é o "sequência manual". */
  cor:    { label: "Cor fixa", color: "#5CC8FF", needs: ["rgb"],
            p: { hue: .6, sat: .9, dim: 1 } },
  strobe: { label: "Strobo", color: "#2B6BFF", needs: ["rgb"],
            p: { div: 2, hue: 0, sat: 0 } },
  pose:   { label: "Pose", color: "#8FB4FF", needs: ["dim"],
            p: { pan: 0, tilt: -.3, dim: 1, hue: 0, sat: 0, gobo: 0 } },
  sweep:  { label: "Varredura", color: "#FFA023", needs: ["pan", "tilt"],
            p: { rate: .125, range: .6, tilt: 0, hue: .6 } },
  beam:   { label: "Feixe", color: "#FFA023", needs: ["dim"],
            p: { div: 2, hue: 0, sat: 0 } },
  gobos:  { label: "Troca de gobo", color: "#FFA023", needs: ["gobo"],
            p: { div: 2 } },
  gspin:  { label: "Gobo girando", color: "#FFA023", needs: ["grot"],
            p: { rate: .25 } },
  wheel:  { label: "Roda de cor", color: "#FFA023", needs: ["color"],
            p: { pos: .3, div: 0 } },
  prisma: { label: "Prisma", color: "#FFA023", needs: ["prism"],
            p: { forca: 1 } },
  jato:   { label: "Jato de fumaça", color: "#8A97AB", needs: ["fog"],
            p: { forca: 1, vento: .5 } },
  lsweep: { label: "Varredura laser", color: "#FF3B6B", needs: ["x", "y"],
            p: { rate: .25, range: .8 } },
};

/* Faixa de cada parâmetro, pro inspetor virar slider de verdade em vez
   de barrinha decorativa. Parâmetro sem entrada aqui cai no padrão.

   `interp` é como uma value curve anda entre keyframes (motor/curvas.js):
   matiz é circular (0.95→0.05 cruza o zero), divisor é passo (não existe
   "divisão 2.37" — segura e pula). Quem não declara interpola linear. */
/* `tipo`/`uni`/`cor` são dicas de apresentação: o VALOR continua
   normalizado (ciclos por batida, 0..1) — quem exporta e quem renderiza
   não muda. `tipo: "ciclo"` diz que o número cru é ilegível ("0.12") e o
   inspetor deve falar em período musical ("a cada 8 bt") com sentido. */
export const PARAM_META = {
  rate:   { min: -1, max: 1, step: .005, lb: "ritmo", tipo: "ciclo" },
  speed:  { min: -2, max: 2, step: .01, lb: "ritmo", tipo: "ciclo" },
  spread: { min: 0, max: 4, step: .05, lb: "espalhamento" },
  hue:    { min: 0, max: 1, step: .005, lb: "matiz", interp: "circular", cor: true },
  sat:    { min: 0, max: 1, step: .01, lb: "saturação", uni: "%" },
  div:    { min: 0, max: 8, step: .25, lb: "divisão", interp: "passo", tipo: "div" },
  range:  { min: 0, max: 1, step: .01, lb: "abertura", uni: "%" },
  pan:    { min: -1, max: 1, step: .01, lb: "pan", uni: "%±" },
  tilt:   { min: -1, max: 1, step: .01, lb: "inclinação", uni: "%±" },
  dim:    { min: 0, max: 1, step: .01, lb: "brilho", uni: "%" },
  gobo:   { min: 0, max: GOBOS.length - 1, step: 1, lb: "gobo",
            interp: "passo", tipo: "gobo" },
  pos:    { min: 0, max: 1, step: .01, lb: "posição na roda", uni: "%" },
  forca:  { min: 0, max: 1, step: .01, lb: "força", uni: "%" },
  vento:  { min: 0, max: 1, step: .01, lb: "ventilador", uni: "%" },
};
export const PARAM_PADRAO = { min: 0, max: 1, step: .01 };

export const TRACKS = [
  { id: "t1", target: "g-todas", kind: "pixel", clips: [
    { id: "c1", fx: "wash", t0: 0, t1: BEAT * 16, p: { rate: 0.08, spread: 1 } },
    { id: "c2", fx: "pulse", t0: BEAT * 16, t1: BEAT * 24, p: { div: 1, hue: 0.58 } } ]},
  { id: "t2", target: "g-sup", kind: "pixel", clips: [
    { id: "c3", fx: "chase", t0: BEAT * 4, t1: BEAT * 16, p: { speed: 0.5, hue: 0.55 } },
    { id: "c4", fx: "strobe", t0: BEAT * 24, t1: BEAT * 32, p: { div: 4, hue: 0, sat: 0 } } ]},
  { id: "t3", target: "g-inf", kind: "pixel", clips: [
    { id: "c5", fx: "chase", t0: BEAT * 4, t1: BEAT * 16, p: { speed: -0.5, hue: 0.88 } },
    { id: "c6", fx: "strobe", t0: BEAT * 24, t1: BEAT * 32, p: { div: 4, hue: 0, sat: 0 } } ]},
  { id: "t4", target: "g-heads", kind: "dmx", clips: [
    { id: "c20", fx: "gobos", t0: BEAT * 8, t1: BEAT * 20, p: { div: 2 } } ]},
  { id: "t5", target: "g-heads", kind: "dmx", clips: [
    { id: "c21", fx: "gspin", t0: BEAT * 12, t1: BEAT * 20, p: { rate: .16 } } ]},
  { id: "t6", target: "h1", kind: "dmx", clips: [
    { id: "c9", fx: "sweep", t0: 0, t1: BEAT * 20, p: { rate: 0.12, range: 0.7, hue: 0.6 } },
    { id: "c10", fx: "beam", t0: BEAT * 24, t1: BEAT * 32, p: { div: 2, hue: 0, sat: 0 } } ]},
  { id: "t7", target: "h2", kind: "dmx", clips: [
    { id: "c11", fx: "sweep", t0: BEAT * 8, t1: BEAT * 24, p: { rate: 0.19, range: 0.35, hue: 0.1 } } ]},
  { id: "t8", target: "h3", kind: "dmx", clips: [
    { id: "c12", fx: "sweep", t0: 0, t1: BEAT * 20, p: { rate: -0.12, range: 0.7, hue: 0.6 } },
    { id: "c13", fx: "beam", t0: BEAT * 24, t1: BEAT * 32, p: { div: 2, hue: 0, sat: 0 } } ]},
];

export const SCENES = [
  { id: "s1", name: "Abertura", sub: "lavagem lenta", t0: 0, t1: BEAT * 16, c: "#7A5CFF" },
  { id: "s2", name: "Corrida", sub: "espelhada", t0: BEAT * 4, t1: BEAT * 16, c: "#00C2A8" },
  { id: "s3", name: "Subida", sub: "pulso no kick", t0: BEAT * 16, t1: BEAT * 24, c: "#2B6BFF" },
  { id: "s4", name: "Drop", sub: "strobo branco", t0: BEAT * 24, t1: BEAT * 32, c: "#FF3B6B" },
  { id: "s5", name: "Faixa toda", sub: "8 compassos", t0: 0, t1: DURATION, c: "#FFA023" },
];
