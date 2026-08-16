/* ============================================================
   MODELO — rig, perfis e tipos de equipamento.
   Só dado e tradutores triviais. Sem React, sem DOM.
   ============================================================ */

/* Espaço virtual: tudo é posicionado num palco de 1000x700 e o
   canvas faz letterbox. Redimensionar não move nada de lugar. */
export const VW = 1000, VH = 700;

/* ============================================================
   PERFIS — a "personalidade" de cada fixture.
   O efeito fala em capacidade (tilt, gobo). O perfil traduz
   pra canal. Trocar de cabeça não quebra sequência nenhuma.
   ============================================================ */
export const CAP = {
  pan: "Pan", tilt: "Tilt", dim: "Dimmer", shut: "Shutter / strobo",
  color: "Roda de cor", gobo: "Gobo", grot: "Rotacao de gobo",
  prism: "Prisma", focus: "Foco", r: "Vermelho", g: "Verde", b: "Azul",
  w: "Branco", speed: "Velocidade", fn: "Funcao / reset",
  fog: "Saida de fumaca", fan: "Ventilador",
  pat: "Padrao", x: "Eixo X", y: "Eixo Y", rgb: "Cor RGB",
};

// Gobos sao FORMAS projetadas. A cor vem por outro canal.
export const GOBOS = ["aberto", "pontos", "estrela", "listras", "quebrado", "espiral"];

export const CAT = { head: "Moving head", par: "Par / wash", strobe: "Strobo DMX",
  fog: "Fumaca", laser: "Laser" };

/* `fisica`: curso em graus e velocidade máxima em °/s por eixo. O pan de
   beam vem do dado real (540° em 2,5s = 216°/s); tilt e os outros perfis
   são PROVISÓRIOS até a tabela DMX de cada cabeça chegar — servem pro
   alerta de atropelamento acusar ordem de grandeza, não decimal. */
const FISICA_HEAD = { pan: { curso: 540, vel: 216 }, tilt: { curso: 270, vel: 180 } };

export const PROFILES = {
  "beam-16": { name: "Beam 7R · com gobo", cat: "head", fisica: FISICA_HEAD, ch: [
    "pan","pan+","tilt","tilt+","speed","dim","shut","color",
    "gobo","grot","prism","focus","fn","r","g","b"] },
  "mini-11": { name: "Mini beam · com gobo", cat: "head", fisica: FISICA_HEAD, ch: [
    "pan","tilt","speed","dim","shut","color","gobo","grot","fn","r","g"] },
  "wash-12": { name: "Wash RGBW · sem gobo", cat: "head", fisica: FISICA_HEAD, ch: [
    "pan","pan+","tilt","tilt+","speed","dim","shut","color","r","g","b","w"] },
  "par-4":  { name: "Par LED RGBW", cat: "par", ch: ["r","g","b","w"] },
  "par-7":  { name: "Par LED · com dimmer", cat: "par", ch: ["dim","shut","r","g","b","w","speed"] },
  "stb-2":  { name: "Strobo DMX", cat: "strobe", ch: ["dim","shut"] },
  "fog-2":  { name: "Máquina de fumaça", cat: "fog", ch: ["fan","fog"] },
  "las-8":  { name: "Laser RGB", cat: "laser", ch: ["fn","pat","grot","x","y","speed","r","g"] },
};

export const chKey = c => c.replace("+", "");
export const chLb = c => CAP[chKey(c)] + (c.endsWith("+") ? " fino" : "");
export const profOf = it => PROFILES[it.pf] || PROFILES["mini-11"];
export const footprint = it => it.k === "head" ? profOf(it).ch.length : 0;

export const COLOR_ORDER = ["RGB", "GRB", "BRG", "RGBW"];

export const KIND = {
  cab:   { label: "Caixa",       nodes: 0,  w: 420, h: 150, pixel: false },
  farol: { label: "Farol AJK",   nodes: 3,  w: 88,  h: 24,  pixel: true },
  fita:  { label: "Fita",        nodes: 12, w: 240, h: 14,  pixel: true },
  head:  { label: "Moving head", nodes: 0,  w: 32,  h: 26,  pixel: false, dmx: 14 },
};

export function nodesOf(it) { return it.n ?? KIND[it.k].nodes; }
export function sizeOf(it) { return { w: it.w ?? KIND[it.k].w, h: it.h ?? KIND[it.k].h }; }

/* Ordem de cor é também a largura do node: RGBW ocupa 4 bytes, o resto 3.
   Quem manda é a string — o serializador percorre letra por letra. */
export function ordemDeCor(it) { return it.co || "RGB"; }
export function bytesPorNode(it) { return ordemDeCor(it).length; }

export const RIG_PADRAO = [
  { id: "cab-sup", k: "cab",   lb: "Caixa superior", x: 500, y: 252, w: 420, h: 150 },
  { id: "cab-inf", k: "cab",   lb: "Caixa inferior", x: 500, y: 424, w: 420, h: 150 },
  { id: "f1", k: "farol", lb: "Sup · Kaos L", x: 374, y: 310, n: 3 },
  { id: "f2", k: "farol", lb: "Sup · Bravox", x: 500, y: 310, n: 3 },
  { id: "f3", k: "farol", lb: "Sup · Kaos R", x: 626, y: 310, n: 3 },
  { id: "f4", k: "farol", lb: "Inf · Kaos L", x: 374, y: 482, n: 3 },
  { id: "f5", k: "farol", lb: "Inf · Bravox", x: 500, y: 482, n: 3 },
  { id: "f6", k: "farol", lb: "Inf · Kaos R", x: 626, y: 482, n: 3 },
  { id: "h1", k: "head", lb: "Head esquerda", x: 220, y: 76, pf: "beam-16" },
  { id: "h2", k: "head", lb: "Head centro",   x: 500, y: 76, pf: "wash-12" },
  { id: "h3", k: "head", lb: "Head direita",  x: 780, y: 76, pf: "beam-16" },
];
