import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";

/* ============================================================
   ESPAÇO VIRTUAL
   Tudo é posicionado num palco de 1000x700 e o canvas
   faz letterbox. Redimensionar não move nada de lugar.
   ============================================================ */
/* ============================================================
   PERFIS — a "personalidade" de cada fixture.
   O efeito fala em capacidade (tilt, gobo). O perfil traduz
   pra canal. Trocar de cabeça não quebra sequência nenhuma.
   ============================================================ */
const CAP = {
  pan: "Pan", tilt: "Tilt", dim: "Dimmer", shut: "Shutter / strobo",
  color: "Roda de cor", gobo: "Gobo", grot: "Rotacao de gobo",
  prism: "Prisma", focus: "Foco", r: "Vermelho", g: "Verde", b: "Azul",
  w: "Branco", speed: "Velocidade", fn: "Funcao / reset",
  fog: "Saida de fumaca", fan: "Ventilador",
  pat: "Padrao", x: "Eixo X", y: "Eixo Y", rgb: "Cor RGB",
};

// Gobos sao FORMAS projetadas. A cor vem por outro canal.
const GOBOS = ["aberto", "pontos", "estrela", "listras", "quebrado", "espiral"];

const CAT = { head: "Moving head", par: "Par / wash", strobe: "Strobo DMX",
  fog: "Fumaca", laser: "Laser" };

const PROFILES = {
  "beam-16": { name: "Beam 7R \u00b7 com gobo", cat: "head", ch: [
    "pan","pan+","tilt","tilt+","speed","dim","shut","color",
    "gobo","grot","prism","focus","fn","r","g","b"] },
  "mini-11": { name: "Mini beam \u00b7 com gobo", cat: "head", ch: [
    "pan","tilt","speed","dim","shut","color","gobo","grot","fn","r","g"] },
  "wash-12": { name: "Wash RGBW \u00b7 sem gobo", cat: "head", ch: [
    "pan","pan+","tilt","tilt+","speed","dim","shut","color","r","g","b","w"] },
  "par-4":  { name: "Par LED RGBW", cat: "par", ch: ["r","g","b","w"] },
  "par-7":  { name: "Par LED \u00b7 com dimmer", cat: "par", ch: ["dim","shut","r","g","b","w","speed"] },
  "stb-2":  { name: "Strobo DMX", cat: "strobe", ch: ["dim","shut"] },
  "fog-2":  { name: "M\u00e1quina de fuma\u00e7a", cat: "fog", ch: ["fan","fog"] },
  "las-8":  { name: "Laser RGB", cat: "laser", ch: ["fn","pat","grot","x","y","speed","r","g"] },
};

const chKey = c => c.replace("+", "");
const chLb = c => CAP[chKey(c)] + (c.endsWith("+") ? " fino" : "");
const profOf = it => PROFILES[it.pf] || PROFILES["mini-11"];
const footprint = it => it.k === "head" ? profOf(it).ch.length : 0;

const VW = 1000, VH = 700;

const COLOR_ORDER = ["RGB", "GRB", "BRG", "RGBW"];

const KIND = {
  cab:   { label: "Caixa",       nodes: 0,  w: 420, h: 150, pixel: false },
  farol: { label: "Farol AJK",   nodes: 3,  w: 88,  h: 24,  pixel: true },
  fita:  { label: "Fita",        nodes: 12, w: 240, h: 14,  pixel: true },
  head:  { label: "Moving head", nodes: 0,  w: 32,  h: 26,  pixel: false, dmx: 14 },
};

const RIG_PADRAO = [
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

const BPM = 128, BEAT = 60 / BPM, BARS = 8, DURATION = BEAT * 4 * BARS;

const EFFECTS = {
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
  jato:   { label: "Jato de fuma\u00e7a", color: "#8A97AB", needs: ["fog"] },
  lsweep: { label: "Varredura laser", color: "#FF3B6B", needs: ["x", "y"] },
};

// Capacidades de um alvo: fixture solta ou grupo inteiro.
function capsOf(id, d, rig) {
  const grp = d.groups.find(g => g.id === id);
  const ids = grp ? grp.members : [id];
  const set = new Set();
  ids.forEach(i => {
    const it = rig.find(x => x.id === i); if (!it) return;
    if (KIND[it.k].pixel) set.add("rgb");
    else if (it.k === "head") profOf(it).ch.forEach(c => set.add(chKey(c)));
  });
  return set;
}

// Quantos membros do alvo realmente respondem a um efeito.
function responders(fxKey, id, d, rig) {
  const grp = d.groups.find(g => g.id === id);
  const ids = grp ? grp.members : [id];
  const need = EFFECTS[fxKey].needs;
  const ok = ids.filter(i => { const c = capsOf(i, d, rig); return need.every(n => c.has(n)); });
  return { ok: ok.length, total: ids.length };
}

const TRACKS = [
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

const SCENES = [
  { id: "s1", name: "Abertura", sub: "lavagem lenta", t0: 0, t1: BEAT * 16, c: "#7A5CFF" },
  { id: "s2", name: "Corrida", sub: "espelhada", t0: BEAT * 4, t1: BEAT * 16, c: "#00C2A8" },
  { id: "s3", name: "Subida", sub: "pulso no kick", t0: BEAT * 16, t1: BEAT * 24, c: "#2B6BFF" },
  { id: "s4", name: "Drop", sub: "strobo branco", t0: BEAT * 24, t1: BEAT * 32, c: "#FF3B6B" },
  { id: "s5", name: "Faixa toda", sub: "8 compassos", t0: 0, t1: DURATION, c: "#FFA023" },
];

/* ============================================================
   DERIVADOS DO CROQUI — canais e grupos saem da posição.
   ============================================================ */

function nodesOf(it) { return it.n ?? KIND[it.k].nodes; }
function sizeOf(it) { return { w: it.w ?? KIND[it.k].w, h: it.h ?? KIND[it.k].h }; }

function derive(rig) {
  const pix = rig.filter(i => KIND[i.k].pixel)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const heads = rig.filter(i => i.k === "head").sort((a, b) => a.x - b.x);

  const chan = {};
  let c = 1;
  pix.forEach(i => { chan[i.id] = c; c += nodesOf(i) * 3; });
  heads.forEach(h => { chan[h.id] = c; c += footprint(h); });

  const mid = pix.length ? pix.reduce((s, i) => s + i.y, 0) / pix.length : VH / 2;
  const groups = [
    { id: "g-todas", label: "Todas as caixas", members: pix.map(i => i.id) },
    { id: "g-sup", label: "Caixa superior", members: pix.filter(i => i.y < mid).map(i => i.id) },
    { id: "g-inf", label: "Caixa inferior", members: pix.filter(i => i.y >= mid).map(i => i.id) },
    { id: "g-heads", label: "Todas as heads", members: heads.map(h => h.id) },
  ];
  const totalNodes = pix.reduce((s, i) => s + nodesOf(i), 0);
  return { pix, heads, chan, groups, totalNodes, totalCh: c - 1 };
}

/* ============================================================
   MOTOR — puro, sem React.
   ============================================================ */

function hsv(h, s, v) {
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const m = [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i % 6];
  return [(m[0] * 255) | 0, (m[1] * 255) | 0, (m[2] * 255) | 0];
}

function renderPixelFx(fx, p, n, tL, tG) {
  const out = Array.from({ length: n }, () => [0, 0, 0]);
  if (fx === "wash") {
    for (let i = 0; i < n; i++)
      out[i] = hsv(tG * (p.rate ?? .2) + (i / n) * (p.spread ?? 1), .85, .9);
  } else if (fx === "chase") {
    const pos = (((tL * (p.speed ?? 1) * n) % n) + n) % n;
    for (let i = 0; i < n; i++) {
      let d = Math.abs(i - pos); d = Math.min(d, n - d);
      const b = Math.max(0, 1 - d * .75);
      out[i] = hsv(p.hue ?? .55, .8, b * b);
    }
  } else if (fx === "strobe") {
    const per = BEAT / (p.div ?? 2);
    const b = Math.exp((-(tG % per) / per) * 9);
    for (let i = 0; i < n; i++) out[i] = hsv(p.hue ?? 0, p.sat ?? 0, b);
  } else if (fx === "pulse") {
    const per = BEAT / (p.div ?? 1);
    const b = Math.pow(1 - (tG % per) / per, 2.2);
    for (let i = 0; i < n; i++) out[i] = hsv(p.hue ?? .58, .9, b);
  }
  return out;
}

function renderDmxFx(fx, p, tL, tG) {
  if (fx === "sweep") return {
    pan: Math.sin(tG * Math.PI * 2 * (p.rate ?? .25)) * (p.range ?? .6),
    dim: .85, rgb: hsv(p.hue ?? .6, .8, 1) };
  if (fx === "gobos") {
    const per = BEAT / (p.div ?? 2);
    return { gobo: 1 + (Math.floor(tG / per) % (GOBOS.length - 1)) };
  }
  if (fx === "gspin") return { grot: tG * (p.rate ?? .6) * Math.PI * 2 };
  if (fx === "beam") {
    const per = BEAT / (p.div ?? 2);
    return { pan: 0, gobo: 0, dim: Math.exp((-(tG % per) / per) * 7),
             rgb: hsv(p.hue ?? 0, p.sat ?? 0, 1) };
  }
  return {};
}

function renderFrame(d, t, master = 1) {
  const pixels = {}, heads = {};
  d.pix.forEach(i => { pixels[i.id] = Array.from({ length: nodesOf(i) }, () => [0, 0, 0]); });
  d.heads.forEach(h => { heads[h.id] = { pan: 0, dim: 0, rgb: [0, 0, 0], gobo: 0, grot: 0 }; });

  for (const track of TRACKS) {
    const clip = track.clips.find(c => t >= c.t0 && t < c.t1);
    if (!clip) continue;
    const tL = t - clip.t0;

    if (track.kind === "dmx") {
      const hg = d.groups.find(g => g.id === track.target);
      const ids = (hg ? hg.members : [track.target]).filter(i => heads[i]);
      const st = renderDmxFx(clip.fx, clip.p, tL, t);
      ids.forEach(i => {
        const cur = heads[i];
        const nx = { ...cur, ...st };
        if (st.dim !== undefined) nx.dim = Math.max(cur.dim, st.dim);
        heads[i] = nx;
      });
      continue;
    }
    const grp = d.groups.find(g => g.id === track.target);
    const members = (grp ? grp.members : [track.target]).filter(id => pixels[id]);
    if (!members.length) continue;
    const total = members.reduce((s, id) => s + pixels[id].length, 0);
    const buf = renderPixelFx(clip.fx, clip.p, total, tL, t);
    let k = 0;
    for (const id of members)
      for (let i = 0; i < pixels[id].length; i++, k++) {
        const s = buf[k], p = pixels[id][i];
        pixels[id][i] = [
          Math.min(255, p[0] + s[0] * master),
          Math.min(255, p[1] + s[1] * master),
          Math.min(255, p[2] + s[2] * master)];
      }
  }
  // O perfil manda: capacidade ausente e zerada aqui, no motor.
  d.heads.forEach(h => {
    const caps = new Set(profOf(h).ch.map(chKey));
    const st = heads[h.id];
    if (!caps.has("gobo")) st.gobo = 0;
    if (!caps.has("grot")) st.grot = 0;
    if (!caps.has("pan")) st.pan = 0;
    st.dim *= master;
  });
  return { pixels, heads };
}

/* ============================================================
   PALCO — um canvas, dois modos de desenho.
   ============================================================ */

/* Poça projetada no fim do feixe. A forma vem do gobo,
   a cor vem do RGB — coisas separadas de propósito. */
function drawGobo(g, cx, cy, R, rot, idx, col, alpha) {
  const [r, gg, b] = col;
  g.save();
  g.translate(cx, cy);
  g.scale(1, 0.38);          // perspectiva: a poça é elipse
  g.rotate(rot);
  g.fillStyle = `rgba(${r},${gg},${b},${alpha})`;

  const dot = (x, y, rr) => { g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); };

  if (idx === 0) {
    dot(0, 0, R);
  } else if (idx === 1) {            // pontos
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      dot(Math.cos(a) * R * .62, Math.sin(a) * R * .62, R * .15);
    }
    dot(0, 0, R * .17);
  } else if (idx === 2) {            // estrela
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? R * .42 : R;
      i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
        : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
  } else if (idx === 3) {            // listras
    for (let i = -2; i <= 2; i++) {
      const y = i * R * .34;
      const half = Math.sqrt(Math.max(0, R * R - y * y));
      g.fillRect(-half, y - R * .09, half * 2, R * .18);
    }
  } else if (idx === 4) {            // quebrado
    const pts = [[.1,-.5,.30],[-.45,-.15,.22],[.5,.2,.26],[-.2,.5,.20],[.0,.05,.17],[-.6,.4,.14]];
    pts.forEach(([x, y, rr]) => dot(x * R, y * R, rr * R));
  } else {                            // espiral
    g.lineWidth = R * .16; g.lineCap = "round";
    g.strokeStyle = `rgba(${r},${gg},${b},${alpha})`;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      for (let i = 0; i <= 26; i++) {
        const a = (i / 26) * Math.PI * 1.5 + (k / 3) * Math.PI * 2;
        const rr = R * (.18 + (i / 26) * .74);
        i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
          : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.stroke();
    }
  }
  g.restore();
}

/* ============================================================
   ÁUDIO — o relógio master.
   O playhead NÃO acumula dt de rAF: ele lê ctx.currentTime.
   rAF só desenha. É a mesma regra do FPP: uma timeline, um clock.
   ============================================================ */

function makeAudio() {
  return { ctx: null, t0: 0, src: null, buf: null, gain: null,
           nextBeat: 0, timer: 0, click: true, peaks: null };
}

function ensureCtx(A) {
  if (!A.ctx) {
    A.ctx = new (window.AudioContext || window.webkitAudioContext)();
    A.gain = A.ctx.createGain();
    A.gain.gain.value = .5;
    A.gain.connect(A.ctx.destination);
  }
  if (A.ctx.state === "suspended") A.ctx.resume();
  return A.ctx;
}

// Claque sintetizada: bumbo no tempo, caixa no 2 e 4, chimbal na colcheia.
function schedBeat(A, i, when) {
  const ctx = A.ctx, g = A.gain;
  const kick = () => {
    const o = ctx.createOscillator(), e = ctx.createGain();
    o.frequency.setValueAtTime(140, when);
    o.frequency.exponentialRampToValueAtTime(45, when + .11);
    e.gain.setValueAtTime(.9, when);
    e.gain.exponentialRampToValueAtTime(.001, when + .17);
    o.connect(e); e.connect(g); o.start(when); o.stop(when + .2);
  };
  const snare = () => {
    const len = ctx.sampleRate * .12;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / len);
    const s = ctx.createBufferSource(); s.buffer = b;
    const e = ctx.createGain(); e.gain.value = .28;
    s.connect(e); e.connect(g); s.start(when);
  };
  const hat = (t) => {
    const len = ctx.sampleRate * .03;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / len) ** 3;
    const s = ctx.createBufferSource(); s.buffer = b;
    const e = ctx.createGain(); e.gain.value = .09;
    s.connect(e); e.connect(g); s.start(t);
  };
  kick();
  if (i % 4 === 1 || i % 4 === 3) snare();
  hat(when); hat(when + BEAT / 2);
}

function peaksOf(buf, n = 900) {
  const d = buf.getChannelData(0), step = Math.floor(d.length / n), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let k = 0; k < step; k += 8) { const v = Math.abs(d[i * step + k] || 0); if (v > m) m = v; }
    out[i] = m;
  }
  return out;
}

function AudioBar({ A, hasFile, onFile, click, setClick, offset, setOffset, compact }) {
  const inp = useRef(null);
  return (
    <div className={`ab ${compact ? "ab-c" : ""}`}>
      <button className="ab-b" onClick={() => inp.current?.click()}>
        {hasFile ? "Trocar faixa" : "Carregar faixa"}
      </button>
      <input ref={inp} type="file" accept="audio/*" style={{ display: "none" }}
        onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
      <button className={`ab-b ${click ? "on" : ""}`} onClick={() => setClick(c => !c)}
        title="Claque de referência">claque</button>
      <div className="ab-off">
        <span className="mono">atraso {offset > 0 ? "+" : ""}{Math.round(offset * 1000)}ms</span>
        <input type="range" min="-0.3" max="0.3" step="0.005" value={offset}
          aria-label="Compensação de atraso" onChange={e => setOffset(parseFloat(e.target.value))} />
      </div>
    </div>
  );
}

function Stage({ rig, frame, edit, sel, onPick, onMove, chan }) {
  const ref = useRef(null);
  const view = useRef({ s: 1, ox: 0, oy: 0 });
  const drag = useRef(null);

  const draw = useCallback(() => {
    const cv = ref.current; if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const s = Math.min(W / VW, H / VH);
    const ox = (W - VW * s) / 2, oy = (H - VH * s) / 2;
    view.current = { s, ox, oy };
    const X = v => ox + v * s, Y = v => oy + v * s, S = v => v * s;

    g.fillStyle = edit ? "#080C15" : "#05070D";
    g.fillRect(0, 0, W, H);

    if (edit) {
      g.strokeStyle = "#121B2A"; g.lineWidth = 1;
      for (let x = 0; x <= VW; x += 50) {
        g.beginPath(); g.moveTo(X(x), Y(0)); g.lineTo(X(x), Y(VH)); g.stroke();
      }
      for (let y = 0; y <= VH; y += 50) {
        g.beginPath(); g.moveTo(X(0), Y(y)); g.lineTo(X(VW), Y(y)); g.stroke();
      }
      g.strokeStyle = "#1E2A3F";
      g.strokeRect(X(0), Y(0), S(VW), S(VH));
    } else {
      const fl = g.createLinearGradient(0, H * .55, 0, H);
      fl.addColorStop(0, "rgba(20,28,44,0)");
      fl.addColorStop(1, "rgba(24,34,56,.5)");
      g.fillStyle = fl; g.fillRect(0, H * .55, W, H * .45);
    }

    // feixes primeiro (só na apresentação)
    if (!edit) {
      g.globalCompositeOperation = "lighter";
      rig.filter(i => i.k === "head").forEach(h => {
        const st = frame.heads[h.id]; if (!st || st.dim < .01) return;
        const bx = X(h.x), by = Y(h.y + 14);
        const tx = bx + st.pan * S(400), ty = Y(VH - 40);
        const [r, gg, b] = st.rgb;
        const blocked = st.gobo > 0 ? .5 : 1;   // gobo bloqueia parte da luz
        const gr = g.createLinearGradient(bx, by, tx, ty);
        gr.addColorStop(0, `rgba(${r},${gg},${b},${.5 * st.dim * blocked})`);
        gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(bx - S(6), by); g.lineTo(tx - S(58), ty);
        g.lineTo(tx + S(58), ty); g.lineTo(bx + S(6), by);
        g.closePath(); g.fill();

        drawGobo(g, tx, ty, S(58), st.grot || 0, st.gobo || 0,
          st.rgb, .5 * st.dim);
      });
      g.globalCompositeOperation = "source-over";
    }

    const rrect = (x, y, w, h, r) => {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    };

    // caixas primeiro (fundo)
    [...rig].sort((a, b) => (a.k === "cab" ? -1 : 1) - (b.k === "cab" ? -1 : 1)).forEach(it => {
      const { w, h } = sizeOf(it);
      const x = X(it.x - w / 2), y = Y(it.y - h / 2), ww = S(w), hh = S(h);
      const on = sel === it.id;

      if (it.k === "cab") {
        g.fillStyle = "#111826"; g.strokeStyle = on ? "#2B6BFF" : "#232F44";
        g.lineWidth = on ? 2 : 1;
        rrect(x, y, ww, hh, S(10)); g.fill(); g.stroke();
        for (let i = 0; i < 3; i++) {
          const cx = x + ww * (.2 + i * .3), cy = y + hh * .42;
          const rr = Math.min(ww * .105, hh * .3);
          g.strokeStyle = "#1E2A3C"; g.lineWidth = 1;
          g.beginPath(); g.arc(cx, cy, rr, 0, 7); g.stroke();
          g.beginPath(); g.arc(cx, cy, rr * .34, 0, 7); g.stroke();
        }
        if (edit) {
          g.fillStyle = "#4A5B77";
          g.font = `600 ${Math.max(9, S(13))}px 'IBM Plex Mono',monospace`;
          g.fillText(it.lb, x + S(10), y + S(20));
        }
        return;
      }

      if (it.k === "head") {
        const st = frame.heads[it.id] || { dim: 0, rgb: [0, 0, 0] };
        g.fillStyle = on ? "#1E2E4C" : "#1A2334";
        g.strokeStyle = on ? "#FFA023" : "#26324a"; g.lineWidth = on ? 2 : 1;
        rrect(x, y, ww, hh, S(5)); g.fill(); g.stroke();
        if (!edit && st.dim > .02) {
          const [r, gg, b] = st.rgb;
          g.fillStyle = `rgba(${r},${gg},${b},${st.dim})`;
          g.beginPath(); g.arc(x + ww / 2, y + hh, S(6), 0, 7); g.fill();
        }
        if (edit) {
          g.fillStyle = "#FFA023";
          g.font = `600 ${Math.max(8, S(11))}px 'IBM Plex Mono',monospace`;
          g.fillText(`ch${chan[it.id] ?? "?"}`, x, y - S(7));
        }
        return;
      }

      // farol / fita
      const n = nodesOf(it);
      g.fillStyle = "#0A0F19";
      g.strokeStyle = on ? "#2B6BFF" : "#1B2534"; g.lineWidth = on ? 2 : 1;
      rrect(x, y, ww, hh, S(4)); g.fill(); g.stroke();

      const cols = frame.pixels[it.id] || [];
      for (let i = 0; i < n; i++) {
        const lx = x + ww * ((i + .5) / n), ly = y + hh / 2;
        const c = cols[i] || [0, 0, 0];
        const lum = (c[0] + c[1] + c[2]) / 765;
        if (!edit && lum > .02) {
          g.globalCompositeOperation = "lighter";
          const gl = g.createRadialGradient(lx, ly, 0, lx, ly, S(46));
          gl.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${.85 * lum})`);
          gl.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
          g.fillStyle = gl;
          g.beginPath(); g.arc(lx, ly, S(46), 0, 7); g.fill();
          g.globalCompositeOperation = "source-over";
        }
        g.fillStyle = edit ? "#2E3E58"
          : `rgb(${Math.max(18, c[0])},${Math.max(20, c[1])},${Math.max(26, c[2])})`;
        g.beginPath(); g.arc(lx, ly, Math.max(2, S(hh > S(20) ? 5 : 4)), 0, 7); g.fill();
      }

      if (edit) {
        g.fillStyle = on ? "#8FB4FF" : "#46587A";
        g.font = `600 ${Math.max(8, S(11))}px 'IBM Plex Mono',monospace`;
        g.fillText(`ch${chan[it.id] ?? "?"} · ${n}n`, x, y - S(7));
      }
    });
  }, [rig, frame, edit, sel, chan]);

  useEffect(draw, [draw]);
  useEffect(() => {
    const ro = new ResizeObserver(draw);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [draw]);

  const toV = (e) => {
    const r = ref.current.getBoundingClientRect();
    const { s, ox, oy } = view.current;
    return { x: (e.clientX - r.left - ox) / s, y: (e.clientY - r.top - oy) / s };
  };

  const down = (e) => {
    if (!edit) return;
    const p = toV(e);
    const hit = [...rig].reverse().find(it => {
      const { w, h } = sizeOf(it);
      return Math.abs(p.x - it.x) < w / 2 && Math.abs(p.y - it.y) < Math.max(h / 2, 14);
    });
    onPick(hit ? hit.id : null);
    if (hit) {
      drag.current = { id: hit.id, dx: p.x - hit.x, dy: p.y - hit.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };
  const move = (e) => {
    if (!drag.current) return;
    const p = toV(e);
    const snap = v => Math.round(v / 2) * 2;
    onMove(drag.current.id,
      Math.max(0, Math.min(VW, snap(p.x - drag.current.dx))),
      Math.max(0, Math.min(VH, snap(p.y - drag.current.dy))));
  };
  const up = () => { drag.current = null; };

  return <canvas ref={ref} className={`stage ${edit ? "stage-e" : ""}`}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />;
}

/* ============================================================
   PAINÉIS
   ============================================================ */

function Timeline({ t, sel, setSel, scrub, compact, labelFor, peaks }) {
  const pct = v => `${(v / DURATION) * 100}%`;
  return (
    <section className={`tl ${compact ? "tl-c" : ""}`}>
      <div className="tl-gut">
        <div className="tl-sp mono">compasso</div>
        {TRACKS.map(tr => (
          <div key={tr.target} className="tl-lb">
            <span className={`bar ${tr.kind}`} />
            <span className="tl-lb-t">{labelFor(tr.target)}</span>
          </div>
        ))}
      </div>
      <div className="tl-scroll">
        <div className="tl-ruler" onPointerDown={scrub}>
          {peaks && (
            <svg className="wf" viewBox={`0 0 ${peaks.length} 100`} preserveAspectRatio="none">
              <path d={Array.from(peaks).map((v, i) =>
                `M${i},${50 - v * 46} L${i},${50 + v * 46}`).join("")}
                stroke="#22406E" strokeWidth="1" />
            </svg>)}
          {Array.from({ length: BARS }, (_, i) => (
            <div key={i} className="tl-bar" style={{ left: `${(i / BARS) * 100}%`, width: `${100 / BARS}%` }}>
              <span className="mono">{i + 1}</span>
            </div>))}
          {Array.from({ length: BARS * 4 }, (_, i) => (
            <div key={i} className="tl-beat" style={{ left: `${(i / (BARS * 4)) * 100}%` }} />))}
        </div>
        <div className="tl-rows" onPointerDown={scrub}>
          {TRACKS.map(tr => (
            <div key={tr.target} className="tl-row">
              {tr.clips.map(c => (
                <button key={c.id}
                  className={`clip ${sel === c.id ? "sel" : ""} ${t >= c.t0 && t < c.t1 ? "act" : ""}`}
                  style={{ left: pct(c.t0), width: pct(c.t1 - c.t0), "--fx": EFFECTS[c.fx].color }}
                  onPointerDown={e => { e.stopPropagation(); setSel(c.id); }}>
                  <span>{EFFECTS[c.fx].label}</span>
                </button>))}
            </div>))}
        </div>
        <div className="ph" style={{ left: pct(t) }}><span className="ph-hd" /></div>
      </div>
    </section>
  );
}

function EffectInsp({ selClip, labelFor, d, rig }) {
  if (!selClip) return <div className="empty">Escolha um bloco na linha do tempo.</div>;
  const { clip, track } = selClip;
  const caps = capsOf(track.target, d, rig);
  return (<>
    <div className="insp-hero" style={{ borderColor: EFFECTS[clip.fx].color }}>
      <div className="insp-fx">{EFFECTS[clip.fx].label}</div>
      <div className="insp-tg">{labelFor(track.target)}</div>
    </div>
    <div className="kv"><span>Início</span><span className="mono">{(clip.t0 / BEAT).toFixed(0)} bt</span></div>
    <div className="kv"><span>Duração</span><span className="mono">{((clip.t1 - clip.t0) / BEAT).toFixed(0)} bt</span></div>
    {Object.entries(clip.p).map(([k, v]) => (
      <div key={k} className="slider">
        <div className="slider-h"><span>{PARAM_PT[k] || k}</span><span className="mono">{Number(v).toFixed(2)}</span></div>
        <div className="slider-tr"><div className="slider-fl" style={{ width: `${Math.min(100, Math.abs(v) * 70 + 12)}%` }} /></div>
      </div>))}

    {clip.fx === "gobos" && (
      <div className="hint">Formas do catálogo: {GOBOS.slice(1).join(", ")}.
        A cor não vem daqui — vem do RGB da fixture.</div>)}
    <div className="sec">O que este alvo aceita</div>
    <div className="caps">
      {[...caps].map(c => <span key={c} className="cap">{CAP[c] || c}</span>)}
    </div>
    <div className="fxl">
      {Object.entries(EFFECTS).map(([k, e]) => {
        const r = responders(k, track.target, d, rig);
        const cls = r.ok === 0 ? "no" : r.ok < r.total ? "part" : "yes";
        return (
          <div key={k} className={`fxr ${cls} ${k === clip.fx ? "cur" : ""}`}>
            <span className="fxd" style={{ background: e.color }} />
            <span className="fxn">{e.label}</span>
            <span className="mono fxc">
              {r.ok === 0 ? "—" : r.ok === r.total ? "todos" : `${r.ok}/${r.total}`}
            </span>
          </div>);
      })}
    </div>
    <div className="hint">A paleta é derivada do perfil de cada equipamento.
      Efeito que o alvo não suporta some da lista de opções.</div>
  </>);
}

function CroquiInsp({ item, chan, onEdit, onDel, onAdd }) {
  return (<>
    <div className="palette">
      {["cab", "farol", "fita", "head"].map(k => (
        <button key={k} className="pl-btn" onClick={() => onAdd(k)}>
          <span className={`pl-ic pl-${k}`} />{KIND[k].label}
        </button>))}
    </div>
    {!item ? (
      <div className="empty">Toque num equipamento pra editar, ou adicione um acima.<br /><br />
        Arraste pra posicionar. Os canais são recalculados de cima pra baixo.</div>
    ) : (<>
      <div className="insp-hero" style={{ borderColor: item.k === "head" ? "#FFA023" : "#2B6BFF" }}>
        <div className="insp-fx">{item.lb}</div>
        <div className="insp-tg">{KIND[item.k].label}</div>
      </div>
      <div className="kv"><span>Posição</span><span className="mono">{Math.round(item.x)} , {Math.round(item.y)}</span></div>
      <div className="kv"><span>Canal inicial</span><span className="mono">{chan[item.id] ?? "—"}</span></div>
      {item.k === "head" && (
        <div className="kv"><span>Ocupa</span>
          <span className="mono">{footprint(item)} canais</span></div>)}
      {KIND[item.k].pixel && (<>
        <div className="kv"><span>Nodes</span><span className="mono">{nodesOf(item)}</span></div>
        <div className="steps">
          {item.k === "farol"
            ? [1, 3].map(v => (
                <button key={v} className={`step ${nodesOf(item) === v ? "on" : ""}`}
                  onClick={() => onEdit(item.id, { n: v })}>
                  {v} node{v > 1 ? "s" : ""}
                </button>))
            : [6, 12, 24, 48].map(v => (
                <button key={v} className={`step ${nodesOf(item) === v ? "on" : ""}`}
                  onClick={() => onEdit(item.id, { n: v })}>{v}</button>))}
        </div>
        <div className="sec">Ordem de cor</div>
        <div className="steps">
          {COLOR_ORDER.map(o => (
            <button key={o} className={`step ${(item.co || "RGB") === o ? "on" : ""}`}
              onClick={() => onEdit(item.id, { co: o })}>{o}</button>))}
        </div>
        {item.k === "farol" && (
          <div className="hint">1 node = farol inteiro numa cor. 3 nodes = cada lente independente.
            É o teste que decide quando os faróis chegarem.</div>)}
      </>)}

      {item.k === "head" && (<>
        <div className="sec">Perfil da fixture</div>
        <div className="profs">
          {Object.entries(CAT).map(([ck, cl]) => {
            const list = Object.entries(PROFILES).filter(([, p]) => p.cat === ck);
            if (!list.length) return null;
            return (
              <div key={ck} className="pcat">
                <div className="pcat-h">{cl}</div>
                {list.map(([k, p]) => (
                  <button key={k} className={`prof ${(item.pf || "mini-11") === k ? "on" : ""}`}
                    onClick={() => onEdit(item.id, { pf: k })}>
                    <span>{p.name}</span>
                    <span className="mono dim">{p.ch.length}ch</span>
                  </button>))}
              </div>);
          })}
        </div>
        <div className="sec">Mapa de canais</div>
        <div className="chmap">
          {(PROFILES[item.pf] || PROFILES["mini-11"]).ch.map((c, i) => (
            <div key={i} className={`chrow ${c.endsWith("+") ? "fine" : ""}`}>
              <span className="mono chn">{(chan[item.id] ?? 1) + i}</span>
              <span className="chl">{chLb(c)}</span>
            </div>))}
        </div>
        <div className="hint">Sem gobo no perfil, um efeito que peça gobo simplesmente
          não faz nada nessa cabeça. O efeito fala em capacidade, não em número de canal.</div>
      </>)}
      <button className="del" onClick={() => onDel(item.id)}>Remover do croqui</button>
    </>)}
  </>);
}

function RigList({ d, frame, sel, onPick }) {
  return (<>
    {d.groups.map(g => (
      <div key={g.id} className="rig-grp">
        <div className="rig-grp-h">
          <span>{g.label}</span>
          <span className="mono dim">{g.members.reduce((s, id) =>
            s + (frame.pixels[id]?.length || 0), 0)}n</span>
        </div>
        {g.id !== "g-todas" && g.members.map(id => {
          const it = d.pix.find(p => p.id === id); if (!it) return null;
          const lit = (frame.pixels[id] || []).some(c => c[0] + c[1] + c[2] > 30);
          return (
            <button key={id} className={`rig-item ${sel === id ? "on" : ""}`} onClick={() => onPick(id)}>
              <span className={`dot ${lit ? "on" : ""}`} />
              <span className="rig-lb">{it.lb}</span>
              <span className="mono dim">ch{d.chan[id]}</span>
            </button>);
        })}
      </div>))}
    <div className="rig-grp">
      <div className="rig-grp-h amber"><span>Moving heads</span>
        <span className="mono dim">{d.heads.reduce((s, h) => s + footprint(h), 0)}ch</span></div>
      {d.heads.map(h => (
        <button key={h.id} className={`rig-item ${sel === h.id ? "on" : ""}`} onClick={() => onPick(h.id)}>
          <span className={`dot amber ${frame.heads[h.id]?.dim > .05 ? "on" : ""}`} />
          <span className="rig-lb">{h.lb}</span>
          <span className="mono dim">ch{d.chan[h.id]}</span>
        </button>))}
    </div>
  </>);
}

const PARAM_PT = { rate: "taxa", spread: "espalhamento", speed: "velocidade",
  hue: "matiz", sat: "saturação", div: "divisão", range: "amplitude" };
const MODE_LB = { palco: "Palco", mesa: "Mesa", estudio: "Estúdio" };

/* ============================================================
   APP
   ============================================================ */

export default function App() {
  const [mode, setMode] = useState("estudio");
  const palco = mode === "palco", mesa = mode === "mesa", estudio = mode === "estudio";

  const [rig, setRig] = useState(RIG_PADRAO);
  const [view, setView] = useState("show");      // show | croqui
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState("c4");
  const [pick, setPick] = useState(null);
  const [tab, setTab] = useState("palco");
  const [scene, setScene] = useState("s5");
  const [master, setMaster] = useState(1);
  const [black, setBlack] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [click, setClick] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasFile, setHasFile] = useState(false);
  const [peaks, setPeaks] = useState(null);
  const raf = useRef(0), seq = useRef(100), au = useRef(makeAudio());

  useEffect(() => {
    const on = () => {
      const w = window.innerWidth;
      setMode(w < 700 ? "palco" : w < 1150 ? "mesa" : "estudio");
    };
    on(); window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  const loop = SCENES.find(s => s.id === scene) || SCENES[4];

  const stopSrc = useCallback(() => {
    const A = au.current;
    if (A.src) { try { A.src.stop(); } catch (e) {} A.src = null; }
    if (A.timer) { clearInterval(A.timer); A.timer = 0; }
  }, []);

  // Começa/reinicia o transporte ancorado no relógio de áudio.
  const startAt = useCallback((from) => {
    const A = au.current;
    const ctx = ensureCtx(A);
    stopSrc();
    A.t0 = ctx.currentTime - (from - loop.t0);
    A.nextBeat = Math.floor((from - loop.t0) / BEAT);

    if (A.buf) {
      const s = ctx.createBufferSource();
      s.buffer = A.buf; s.loop = true;
      s.loopStart = Math.min(loop.t0, A.buf.duration);
      s.loopEnd = Math.min(loop.t1, A.buf.duration);
      s.connect(A.gain);
      s.start(0, Math.min(from, A.buf.duration));
      A.src = s;
    }
    if (!A.buf || A.click) {
      // agendador com lookahead: nunca depende de setInterval pontual
      A.timer = setInterval(() => {
        const span = loop.t1 - loop.t0;
        const ahead = ctx.currentTime + .12;
        while (A.t0 + A.nextBeat * BEAT < ahead) {
          const when = A.t0 + A.nextBeat * BEAT;
          if (when > ctx.currentTime) schedBeat(A, A.nextBeat % 4, when);
          A.nextBeat++;
          if (A.nextBeat * BEAT >= span) { A.nextBeat = 0; A.t0 += span; }
        }
      }, 25);
    }
  }, [loop.t0, loop.t1, stopSrc]);

  useEffect(() => {
    if (!playing) { stopSrc(); return; }
    startAt(t < loop.t0 || t >= loop.t1 ? loop.t0 : t);
    const span = loop.t1 - loop.t0;
    const step = () => {
      const A = au.current;
      if (A.ctx) {
        const raw = A.ctx.currentTime - A.t0;
        setT(loop.t0 + ((raw % span) + span) % span);
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf.current); stopSrc(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, scene, click]);

  const loadFile = useCallback(async (file) => {
    const A = au.current;
    const ctx = ensureCtx(A);
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    A.buf = buf;
    A.peaks = peaksOf(buf);
    setHasFile(true);
    setPeaks(A.peaks);
    if (playing) startAt(loop.t0);
  }, [playing, startAt, loop.t0]);

  const d = useMemo(() => derive(rig), [rig]);
  const eff = black ? 0 : master;
  const tLuz = t + offset;
  const frame = useMemo(() => renderFrame(d, tLuz, eff), [d, tLuz, eff]);

  const labelFor = useCallback(id =>
    d.groups.find(g => g.id === id)?.label ||
    rig.find(i => i.id === id)?.lb || id, [d, rig]);

  const selClip = useMemo(() => {
    for (const tr of TRACKS) {
      const c = tr.clips.find(c => c.id === sel);
      if (c) return { clip: c, track: tr };
    }
    return null;
  }, [sel]);

  const scrub = useCallback(e => {
    const r = e.currentTarget.getBoundingClientRect();
    setT(Math.max(0, Math.min(DURATION, ((e.clientX - r.left) / r.width) * DURATION)));
  }, []);
  const pickClip = useCallback(id => { setSel(id); if (mode !== "estudio") setSheet(true); }, [mode]);

  const moveItem = useCallback((id, x, y) =>
    setRig(r => r.map(i => i.id === id ? { ...i, x, y } : i)), []);
  const editItem = useCallback((id, patch) =>
    setRig(r => r.map(i => i.id === id ? { ...i, ...patch } : i)), []);
  const delItem = useCallback(id => {
    setRig(r => r.filter(i => i.id !== id)); setPick(null);
  }, []);
  const addItem = useCallback(k => {
    const id = `${k}-${seq.current++}`;
    const count = rig.filter(i => i.k === k).length + 1;
    setRig(r => [...r, { id, k, lb: `${KIND[k].label} ${count}`,
      ...(k === "head" ? { pf: "mini-11" } : {}), ...(KIND[k].pixel ? { co: "RGB" } : {}),
      x: VW / 2 + (count % 3) * 24, y: VH / 2 + (count % 3) * 24 }]);
    setPick(id); setView("croqui");
  }, [rig]);

  const croqui = view === "croqui";
  const pickItem = rig.find(i => i.id === pick) || null;

  const stage = (
    <Stage rig={rig} frame={frame} edit={croqui} sel={pick} chan={d.chan}
      onPick={id => { setPick(id); if (id && mode !== "estudio") setSheet(true); }}
      onMove={moveItem} />
  );

  const viewToggle = (
    <div className="seg">
      {[["show", "Apresentação"], ["croqui", "Croqui"]].map(([k, l]) => (
        <button key={k} className={`seg-b ${view === k ? "on" : ""}`}
          onClick={() => setView(k)}>{l}</button>))}
    </div>
  );

  const tc = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}.${String(Math.floor((t % 1) * 100)).padStart(2, "0")}`;

  return (
    <div className="app" data-mode={mode}>
      <style>{CSS}</style>

      <header className="hd">
        <div className="hd-brand">
          <span className="hd-mark" />
          <div>
            <div className="hd-name">PAREDÃO</div>
            <div className="hd-sub">{MODE_LB[mode]} · Corsa Blue Label</div>
          </div>
        </div>
        <div className="hd-transport">
          <button className="btn" onClick={() => setT(loop.t0)} aria-label="Voltar ao início">⏮</button>
          <button className="btn btn-primary" onClick={() => setPlaying(p => !p)}
            aria-label={playing ? "Pausar" : "Tocar"}>{playing ? "❚❚" : "▶"}</button>
          <div className="tc">{tc}</div>
          {!palco && <div className="hd-meta">
            <span><b>{BPM}</b> bpm</span><span><b>{Math.floor(t / BEAT) % 4 + 1}</b>/4</span></div>}
        </div>
        {estudio && (
          <div className="hd-out">
            <span className="chip chip-blue">{d.totalNodes} nodes</span>
            <span className="chip chip-amber">{d.heads.length} heads</span>
            <span className="chip">{d.totalCh} canais</span>
            <button className="btn btn-ghost">Gravar no SD</button>
          </div>)}
      </header>

      {estudio && (<>
        <div className="body">
          <aside className="rig">
            <div className="pane-t">Rig</div>
            <RigList d={d} frame={frame} sel={pick} onPick={id => { setPick(id); setView("croqui"); }} />
          </aside>
          <main className="pv">
            <div className="pv-head">
              {viewToggle}
              <AudioBar A={au.current} hasFile={hasFile} onFile={loadFile}
                click={click} setClick={setClick} offset={offset} setOffset={setOffset} />
            </div>
            {stage}
          </main>
          <aside className="insp">
            <div className="pane-t">{croqui ? "Equipamento" : "Efeito"}</div>
            {croqui
              ? <CroquiInsp item={pickItem} chan={d.chan} onEdit={editItem} onDel={delItem} onAdd={addItem} />
              : <EffectInsp selClip={selClip} labelFor={labelFor} d={d} rig={rig} />}
          </aside>
        </div>
        <Timeline t={t} sel={sel} setSel={pickClip} scrub={scrub} labelFor={labelFor} peaks={peaks} />
      </>)}

      {!estudio && (<>
        <div className={`m-pv ${mesa ? "m-pv-l" : ""}`}>{stage}</div>
        <AudioBar A={au.current} hasFile={hasFile} onFile={loadFile} compact
          click={click} setClick={setClick} offset={offset} setOffset={setOffset} />

        {mesa && (
          <div className="strip">
            {SCENES.map(s => (
              <button key={s.id} className={`spad ${scene === s.id ? "on" : ""}`} style={{ "--c": s.c }}
                onClick={() => { setScene(s.id); setT(s.t0); setPlaying(true); }}>
                <span className="pad-n">{s.name}</span><span className="pad-s">{s.sub}</span>
              </button>))}
            <div className="strip-m">
              <div className="master-h"><span>Master</span><span className="mono">{Math.round(master * 100)}%</span></div>
              <input type="range" min="0" max="1" step="0.01" value={master}
                aria-label="Intensidade master" onChange={e => setMaster(parseFloat(e.target.value))} />
            </div>
            <button className={`sblack ${black ? "on" : ""}`} onPointerDown={() => setBlack(true)}
              onPointerUp={() => setBlack(false)} onPointerLeave={() => setBlack(false)}
              aria-label="Apagar tudo">◼</button>
          </div>)}

        <nav className="tabs" role="tablist">
          {[["palco", "Palco"], ["linha", "Linha"], ["croqui", "Croqui"], ["rig", "Rig"]]
            .filter(([k]) => !(mesa && k === "linha"))
            .map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k}
                className={`tab ${tab === k ? "on" : ""}`}
                onClick={() => { setTab(k); setView(k === "croqui" ? "croqui" : "show"); }}>{l}</button>))}
        </nav>

        <div className="m-body">
          {mesa && tab !== "croqui" && tab !== "rig" &&
            <Timeline t={t} sel={sel} setSel={pickClip} scrub={scrub} compact labelFor={labelFor} />}
          {palco && tab === "palco" && (
            <div className="pads">
              {SCENES.map(s => (
                <button key={s.id} className={`pad ${scene === s.id ? "on" : ""}`} style={{ "--c": s.c }}
                  onClick={() => { setScene(s.id); setT(s.t0); setPlaying(true); }}>
                  <span className="pad-n">{s.name}</span><span className="pad-s">{s.sub}</span>
                </button>))}
              <div className="master">
                <div className="master-h"><span>Master</span><span className="mono">{Math.round(master * 100)}%</span></div>
                <input type="range" min="0" max="1" step="0.01" value={master}
                  aria-label="Intensidade master" onChange={e => setMaster(parseFloat(e.target.value))} />
              </div>
              <button className={`black ${black ? "on" : ""}`} onPointerDown={() => setBlack(true)}
                onPointerUp={() => setBlack(false)} onPointerLeave={() => setBlack(false)}>
                Segure para apagar tudo
              </button>
            </div>)}
          {palco && tab === "linha" &&
            <Timeline t={t} sel={sel} setSel={pickClip} scrub={scrub} compact labelFor={labelFor} />}
          {tab === "croqui" && (
            <div className="m-croqui">
              <CroquiInsp item={pickItem} chan={d.chan} onEdit={editItem} onDel={delItem} onAdd={addItem} />
            </div>)}
          {tab === "rig" && (
            <div className="m-rig">
              <RigList d={d} frame={frame} sel={pick}
                onPick={id => { setPick(id); setTab("croqui"); setView("croqui"); }} />
            </div>)}
        </div>

        {sheet && view !== "croqui" && (<>
          <div className="scrim" onClick={() => setSheet(false)} />
          <div className="sheet" role="dialog" aria-label="Efeito">
            <button className="sheet-grab" onClick={() => setSheet(false)} aria-label="Fechar" />
            <EffectInsp selClip={selClip} labelFor={labelFor} d={d} rig={rig} />
          </div>
        </>)}
      </>)}
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;700&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
.app{--void:#070A12;--panel:#0E1420;--line:#1C2534;--line2:#141C29;
  --ink:#E8EEF7;--chrome:#7D8AA0;--blue:#2B6BFF;--amber:#FFA023;--hot:#FF3B6B;
  position:absolute;inset:0;display:flex;flex-direction:column;background:var(--void);
  color:var(--ink);font-family:'IBM Plex Sans',system-ui,sans-serif;font-size:13px;overflow:hidden}
.mono{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
.dim{color:var(--chrome)}
button{font:inherit;color:inherit;background:none;border:none;cursor:pointer}
button:focus-visible{outline:2px solid var(--blue);outline-offset:2px}

.hd{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:0 14px;
  height:58px;flex:0 0 58px;border-bottom:1px solid var(--line);background:var(--panel)}
.hd-brand{display:flex;align-items:center;gap:10px;min-width:0}
.hd-mark{width:5px;height:28px;border-radius:3px;background:linear-gradient(180deg,var(--blue),#0B3AAE);
  box-shadow:0 0 14px rgba(43,107,255,.55)}
.hd-name{font-family:'Archivo',sans-serif;font-weight:700;font-size:14px;letter-spacing:.16em;line-height:1.1}
.hd-sub{font-size:10px;color:var(--chrome);white-space:nowrap}
.hd-transport{display:flex;align-items:center;gap:9px}
.btn{min-width:38px;height:36px;border-radius:8px;background:#161F2E;border:1px solid var(--line);
  display:grid;place-items:center;font-size:11px;transition:.14s}
.btn:hover{background:#1D2839}
.btn-primary{background:var(--blue);border-color:var(--blue);color:#fff;box-shadow:0 0 18px rgba(43,107,255,.35)}
.btn-ghost{padding:0 13px;font-size:11.5px;font-weight:600}
.tc{font-family:'IBM Plex Mono',monospace;font-size:18px;font-weight:600;padding:0 4px}
.hd-meta{display:flex;gap:11px;font-size:10.5px;color:var(--chrome)}
.hd-meta b{color:var(--ink);font-weight:600}
.hd-out{display:flex;align-items:center;gap:7px}
.chip{padding:4px 9px;border-radius:20px;background:#141C29;border:1px solid var(--line);
  font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--chrome);white-space:nowrap}
.chip-blue{color:#8FB4FF;border-color:#1D2E52;background:#0E1830}
.chip-amber{color:#FFC97A;border-color:#3D2E14;background:#1E1608}

.body{flex:1;display:grid;grid-template-columns:206px 1fr 226px;min-height:0}
.pane-t{font-family:'Archivo',sans-serif;font-size:9.5px;font-weight:700;letter-spacing:.19em;
  text-transform:uppercase;color:var(--chrome);padding:11px 13px 8px;display:block}
.rig{background:var(--panel);border-right:1px solid var(--line);overflow-y:auto;padding-bottom:12px}
.rig-grp-h{display:flex;justify-content:space-between;padding:6px 13px;font-size:11px;font-weight:600;
  color:#B7C4D8;border-left:2px solid var(--blue);background:#0B111C}
.rig-grp-h.amber{border-left-color:var(--amber)}
.rig-item{display:flex;align-items:center;gap:8px;padding:7px 13px 7px 22px;font-size:11.5px;width:100%;text-align:left}
.rig-item:hover{background:#111A28}
.rig-item.on{background:#122140}
.rig-lb{flex:1;color:#9FADC2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dot{width:6px;height:6px;border-radius:50%;background:#26324a;flex:0 0 auto;transition:.08s}
.dot.on{background:var(--blue);box-shadow:0 0 9px var(--blue)}
.dot.amber.on{background:var(--amber);box-shadow:0 0 9px var(--amber)}

.pv{display:flex;flex-direction:column;min-width:0;background:#05070D}
.pv-head{display:flex;align-items:center;justify-content:space-between;padding:8px 14px 8px 10px;
  border-bottom:1px solid var(--line2);gap:10px}
.pv-head .mono{font-size:10px}
.seg{display:flex;gap:2px;padding:2px;border-radius:8px;background:#0D1420;border:1px solid var(--line)}
.seg-b{padding:5px 11px;border-radius:6px;font-size:11px;font-weight:600;color:var(--chrome)}
.seg-b.on{background:#1B2942;color:var(--ink)}
.stage{flex:1;width:100%;display:block;min-height:0;touch-action:none}
.stage-e{cursor:grab}

.insp{background:var(--panel);border-left:1px solid var(--line);overflow-y:auto;padding-bottom:14px}
.insp-hero{margin:0 13px 12px;padding:11px;border-radius:9px;background:#0B111C;border:1px solid;border-left-width:3px}
.insp-fx{font-family:'Archivo',sans-serif;font-weight:700;font-size:14px}
.insp-tg{font-size:10.5px;color:var(--chrome);margin-top:2px}
.kv{display:flex;justify-content:space-between;padding:6px 13px;font-size:11.5px;color:#9FADC2}
.kv .mono{color:var(--ink)}
.slider{padding:8px 13px 4px}
.slider-h{display:flex;justify-content:space-between;font-size:10.5px;color:var(--chrome);margin-bottom:5px}
.slider-tr{height:3px;border-radius:2px;background:#1A2434;overflow:hidden}
.slider-fl{height:100%;background:var(--blue)}
.empty{padding:0 13px;font-size:11.5px;color:var(--chrome);line-height:1.55}

.palette{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:0 13px 13px}
.pl-btn{display:flex;align-items:center;gap:7px;padding:9px;border-radius:8px;background:#0D1420;
  border:1px solid var(--line);font-size:11px;color:#B7C4D8;transition:.13s}
.pl-btn:hover{background:#152136;border-color:#2C3A52}
.pl-ic{width:13px;height:11px;border-radius:2px;flex:0 0 auto;background:#2E3E58}
.pl-cab{height:13px;border:1px solid #46587A;background:transparent}
.pl-farol{background:var(--blue)}
.pl-fita{height:4px;background:linear-gradient(90deg,var(--blue),#00C2A8)}
.pl-head{background:var(--amber)}
.steps{display:flex;gap:6px;padding:4px 13px 8px}
.step{flex:1;padding:8px 0;border-radius:7px;background:#0D1420;border:1px solid var(--line);
  font-size:11px;font-weight:600;color:var(--chrome)}
.step.on{background:#122140;border-color:var(--blue);color:#8FB4FF}
.hint{margin:4px 13px 0;padding:9px;border-radius:8px;background:#0B111C;border:1px solid var(--line);
  font-size:10.5px;color:var(--chrome);line-height:1.5}
.del{margin:14px 13px 0;width:calc(100% - 26px);padding:10px;border-radius:8px;background:#160B10;
  border:1px solid #3A1622;color:#FF7A9C;font-size:11.5px;font-weight:600}
.del:hover{background:#1E0D14}

.tl{flex:0 0 250px;display:grid;grid-template-columns:206px 1fr;border-top:1px solid var(--line);
  background:var(--panel);min-height:0}
.tl-c{flex:1;grid-template-columns:112px 1fr;border-top:none}
.tl-gut{border-right:1px solid var(--line);overflow:hidden}
.tl-sp{height:26px;display:flex;align-items:center;padding:0 13px;font-size:9.5px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--chrome);border-bottom:1px solid var(--line2)}
.tl-lb{height:27px;display:flex;align-items:center;gap:7px;padding:0 10px;font-size:11px;
  color:#9FADC2;border-bottom:1px solid var(--line2)}
.tl-lb-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar{width:2px;height:13px;border-radius:2px;background:var(--blue);flex:0 0 auto}
.bar.dmx{background:var(--amber)}
.tl-scroll{position:relative;overflow:hidden}
.tl-ruler{position:relative;height:26px;border-bottom:1px solid var(--line2);cursor:ew-resize;background:#0B111C}
.tl-bar{position:absolute;top:0;height:100%;border-left:1px solid #223049;display:flex;align-items:center;padding-left:5px}
.tl-bar .mono{font-size:9.5px;color:#54637C}
.tl-beat{position:absolute;top:16px;bottom:0;width:1px;background:#18222F}
.tl-row{position:relative;height:27px;border-bottom:1px solid var(--line2)}
.tl-row:nth-child(odd){background:#0A101A}
.clip{position:absolute;top:3px;height:21px;border-radius:5px;
  background:color-mix(in srgb,var(--fx) 17%,#0E1420);
  border:1px solid color-mix(in srgb,var(--fx) 48%,transparent);border-left:2px solid var(--fx);
  display:flex;align-items:center;padding:0 6px;overflow:hidden;transition:.12s}
.clip span{font-size:10px;color:#C6D3E6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.clip.act{box-shadow:0 0 13px color-mix(in srgb,var(--fx) 42%,transparent)}
.clip.sel{border-color:var(--fx);background:color-mix(in srgb,var(--fx) 32%,#0E1420)}
.clip.sel span{color:#fff}
.ph{position:absolute;top:0;bottom:0;width:1px;background:var(--hot);pointer-events:none;
  box-shadow:0 0 9px rgba(255,59,107,.8)}
.ph-hd{position:absolute;top:0;left:-4px;width:9px;height:9px;border-radius:2px;background:var(--hot);transform:rotate(45deg)}

.m-pv{flex:0 0 38%;min-height:170px;background:#05070D;display:flex}
.m-pv-l{flex:1 1 auto;min-height:200px}
.tabs{display:flex;flex:0 0 46px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--panel)}
.tab{flex:1;font-family:'Archivo',sans-serif;font-size:10px;font-weight:700;letter-spacing:.13em;
  text-transform:uppercase;color:var(--chrome);position:relative}
.tab.on{color:var(--ink)}
.tab.on::after{content:"";position:absolute;left:20%;right:20%;bottom:0;height:2px;background:var(--blue);
  border-radius:2px;box-shadow:0 0 10px var(--blue)}
.m-body{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column}
.m-croqui,.m-rig{padding-top:12px;padding-bottom:20px}
.pads{display:grid;grid-template-columns:1fr 1fr;gap:9px;padding:13px}
.pad{min-height:74px;border-radius:12px;padding:12px;text-align:left;background:#0D1420;
  border:1px solid var(--line);border-left:3px solid var(--c);transition:.15s}
.pad:last-of-type{grid-column:span 2;min-height:58px}
.pad.on{background:color-mix(in srgb,var(--c) 20%,#0D1420);border-color:var(--c);
  box-shadow:0 0 22px color-mix(in srgb,var(--c) 32%,transparent)}
.pad-n{display:block;font-family:'Archivo',sans-serif;font-weight:700;font-size:14px}
.pad-s{display:block;font-size:10.5px;color:var(--chrome);margin-top:3px}
.master{grid-column:span 2;padding:12px 13px;border-radius:12px;background:#0B111C;border:1px solid var(--line)}
.master-h{display:flex;justify-content:space-between;font-size:11px;color:var(--chrome);margin-bottom:9px}
.master input,.strip-m input{width:100%;height:26px;-webkit-appearance:none;background:transparent}
.master input::-webkit-slider-runnable-track,.strip-m input::-webkit-slider-runnable-track{height:5px;border-radius:3px;background:#1A2434}
.master input::-webkit-slider-thumb,.strip-m input::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;
  margin-top:-9px;border-radius:50%;background:var(--blue);border:3px solid #0B111C;box-shadow:0 0 14px rgba(43,107,255,.7)}
.master input::-moz-range-track,.strip-m input::-moz-range-track{height:5px;border-radius:3px;background:#1A2434}
.master input::-moz-range-thumb,.strip-m input::-moz-range-thumb{width:22px;height:22px;border-radius:50%;
  background:var(--blue);border:3px solid #0B111C}
.black{grid-column:span 2;min-height:52px;border-radius:12px;background:#160B10;border:1px solid #3A1622;
  color:#FF7A9C;font-family:'Archivo',sans-serif;font-weight:700;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase}
.black.on{background:var(--hot);color:#fff;border-color:var(--hot)}

.strip{flex:0 0 auto;display:flex;gap:8px;padding:10px 12px;overflow-x:auto;border-top:1px solid var(--line);
  background:var(--panel);scrollbar-width:none}
.strip::-webkit-scrollbar{display:none}
.spad{flex:0 0 132px;min-height:56px;border-radius:11px;padding:9px 11px;text-align:left;background:#0D1420;
  border:1px solid var(--line);border-left:3px solid var(--c);transition:.15s}
.spad.on{background:color-mix(in srgb,var(--c) 20%,#0D1420);border-color:var(--c);
  box-shadow:0 0 20px color-mix(in srgb,var(--c) 30%,transparent)}
.strip-m{flex:0 0 168px;padding:8px 11px;border-radius:11px;background:#0B111C;border:1px solid var(--line)}
.sblack{flex:0 0 56px;border-radius:11px;background:#160B10;border:1px solid #3A1622;color:#FF7A9C;font-size:17px}
.sblack.on{background:var(--hot);color:#fff;border-color:var(--hot)}
.app[data-mode="mesa"] .m-body{flex:0 0 auto;max-height:52%}

.scrim{position:absolute;inset:0;background:rgba(3,6,12,.66);z-index:5}
.sheet{position:absolute;left:0;right:0;bottom:0;z-index:6;background:var(--panel);border-top:1px solid var(--line);
  border-radius:18px 18px 0 0;padding:0 0 22px;max-height:66%;overflow-y:auto;box-shadow:0 -18px 44px rgba(0,0,0,.6)}
.sheet-grab{display:block;width:40px;height:4px;border-radius:3px;background:#2A3549;margin:11px auto 15px}
.sec{padding:12px 13px 6px;font-size:9.5px;font-weight:700;letter-spacing:.15em;
  text-transform:uppercase;color:#54637C}
.profs{display:flex;flex-direction:column;gap:5px;padding:0 13px}
.prof{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 10px;
  border-radius:8px;background:#0D1420;border:1px solid var(--line);font-size:11px;
  color:#9FADC2;text-align:left;transition:.13s}
.prof:hover{background:#152136}
.prof.on{background:#1E1608;border-color:var(--amber);color:#FFC97A}
.prof.on .dim{color:#C79A5A}
.chmap{margin:0 13px;border-radius:8px;border:1px solid var(--line);overflow:hidden}
.chrow{display:flex;align-items:center;gap:9px;padding:5px 9px;font-size:10.5px;
  background:#0B111C;border-bottom:1px solid #131C2A}
.chrow:last-child{border-bottom:none}
.chrow.fine{opacity:.55}
.chn{flex:0 0 26px;color:var(--amber);font-size:10px}
.chl{color:#9FADC2}

.caps{display:flex;flex-wrap:wrap;gap:4px;padding:0 13px 10px}
.cap{padding:3px 7px;border-radius:5px;background:#101A2B;border:1px solid #1E2C44;
  font-size:9.5px;color:#8FA3C2}
.fxl{margin:0 13px;border-radius:8px;border:1px solid var(--line);overflow:hidden}
.fxr{display:flex;align-items:center;gap:8px;padding:6px 9px;font-size:10.5px;
  background:#0B111C;border-bottom:1px solid #131C2A}
.fxr:last-child{border-bottom:none}
.fxr.no{opacity:.3}
.fxr.cur{background:#122140}
.fxd{width:6px;height:6px;border-radius:50%;flex:0 0 auto}
.fxn{flex:1;color:#B7C4D8}
.fxc{font-size:9.5px;color:var(--chrome)}
.fxr.part .fxc{color:var(--amber)}
.fxr.yes .fxc{color:#6FD3B4}
.pcat{margin-bottom:9px}
.pcat-h{font-size:9.5px;letter-spacing:.11em;text-transform:uppercase;color:#3F4E68;
  padding:3px 2px 5px}
.ab{display:flex;align-items:center;gap:8px}
.ab-c{padding:8px 12px;border-top:1px solid var(--line);background:var(--panel);overflow-x:auto;
  scrollbar-width:none;flex:0 0 auto}
.ab-c::-webkit-scrollbar{display:none}
.ab-b{padding:6px 11px;border-radius:7px;background:#0D1420;border:1px solid var(--line);
  font-size:10.5px;font-weight:600;color:var(--chrome);white-space:nowrap;transition:.13s}
.ab-b:hover{background:#152136;color:var(--ink)}
.ab-b.on{background:#122140;border-color:var(--blue);color:#8FB4FF}
.ab-off{display:flex;flex-direction:column;gap:2px;min-width:132px}
.ab-off .mono{font-size:9.5px;color:var(--chrome)}
.ab-off input{width:100%;height:14px;-webkit-appearance:none;background:transparent}
.ab-off input::-webkit-slider-runnable-track{height:3px;border-radius:2px;background:#1A2434}
.ab-off input::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;margin-top:-6px;
  border-radius:50%;background:var(--hot);border:2px solid #0B111C}
.ab-off input::-moz-range-track{height:3px;border-radius:2px;background:#1A2434}
.ab-off input::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:var(--hot);border:2px solid #0B111C}
.wf{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:.85}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;
