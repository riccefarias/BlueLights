import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";

import {
  CAP, CAT, COLOR_ORDER, GOBOS, KIND, PROFILES, RIG_PADRAO, VH, VW,
  chLb, footprint, nodesOf, sizeOf,
} from "./modelo/rig.js";
import {
  BARS, BEAT, BPM, DURATION, EFFECTS, FPS, PARAM_META, PARAM_PADRAO, SCENES, TRACKS,
} from "./modelo/sequencia.js";
import {
  acharClip, adicionarTrilha, ajustarParam, inserirClip, moverClip,
  redimensionarClip, removerClip, removerTrilha, trocarEfeito,
} from "./modelo/edicao.js";
import { capsOf, derive, responders } from "./motor/derivar.js";
import { renderFrame } from "./motor/render.js";
import { exportarFseq } from "./motor/exportar.js";
import {
  EXTENSAO, desserializarDocumento, paraJson, serializarDocumento,
} from "./modelo/documento.js";
import {
  abrirComInput, abrirComPicker, baixar, escolherDestino, esquecerHandle,
  gravar, handleLembrado, podeEscrever, temFSA,
} from "./ui/arquivo.js";
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

function Timeline({ t, tracks, sel, setSel, scrub, compact, labelFor, peaks, ed, insercao }) {
  const pct = v => `${(v / DURATION) * 100}%`;
  const drag = useRef(null);

  /* Um arrasto = um ponto de undo. O ponto é marcado no primeiro movimento
     de verdade, não no pointerdown: senão todo clique de seleção empilha
     estado e o Ctrl+Z passa a não fazer nada visível. */
  const pegar = (e, ti, clip, borda) => {
    e.stopPropagation();
    setSel(clip.id);
    const linha = e.currentTarget.closest(".tl-row");
    const w = linha?.getBoundingClientRect().width || 1;
    drag.current = { ti, id: clip.id, borda, x0: e.clientX, w,
                     t0: clip.t0, t1: clip.t1, mexeu: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const arrastar = (e) => {
    const dr = drag.current; if (!dr) return;
    if (!dr.mexeu) {
      if (Math.abs(e.clientX - dr.x0) < 3) return;
      dr.mexeu = true;
      ed.marcar();
    }
    // Sempre a partir do tempo original: somar delta a cada evento acumula
    // erro e o clip escorrega debaixo do dedo.
    const dt = ((e.clientX - dr.x0) / dr.w) * DURATION;
    if (dr.borda) ed.redimensionar(dr.ti, dr.id, dr.borda,
      (dr.borda === "ini" ? dr.t0 : dr.t1) + dt);
    else ed.mover(dr.ti, dr.id, dr.t0 + dt);
  };

  const soltar = () => { drag.current = null; };

  const vazioNaLinha = (e, ti) => {
    const r = e.currentTarget.getBoundingClientRect();
    ed.apontar(ti, ((e.clientX - r.left) / r.width) * DURATION);
    scrub(e);
  };

  return (
    <section className={`tl ${compact ? "tl-c" : ""}`}>
      <div className="tl-gut">
        <div className="tl-sp mono">compasso</div>
        {tracks.map((tr, ti) => (
          <div key={tr.id} className={`tl-lb ${insercao?.ti === ti ? "alvo" : ""}`}>
            <span className={`bar ${tr.kind}`} />
            <span className="tl-lb-t">{labelFor(tr.target)}</span>
            {!tr.clips.length && (
              <button className="tl-x" title="Remover trilha vazia"
                onClick={() => ed.removerTrilha(ti)}>×</button>)}
          </div>
        ))}
        <button className="tl-add" onClick={ed.pedirTrilha}>+ trilha</button>
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
        <div className="tl-rows">
          {tracks.map((tr, ti) => (
            <div key={tr.id} className="tl-row" onPointerDown={e => vazioNaLinha(e, ti)}>
              {insercao?.ti === ti && (
                <div className="tl-ins" style={{ left: pct(insercao.t) }} />)}
              {tr.clips.map(c => (
                <div key={c.id}
                  className={`clip ${sel === c.id ? "sel" : ""} ${t >= c.t0 && t < c.t1 ? "act" : ""}`}
                  style={{ left: pct(c.t0), width: pct(c.t1 - c.t0), "--fx": EFFECTS[c.fx].color }}
                  onPointerDown={e => pegar(e, ti, c, null)}
                  onPointerMove={arrastar} onPointerUp={soltar} onPointerCancel={soltar}>
                  <span className="clip-hd ini"
                    onPointerDown={e => pegar(e, ti, c, "ini")} />
                  <span className="clip-t">{EFFECTS[c.fx].label}</span>
                  <span className="clip-hd fim"
                    onPointerDown={e => pegar(e, ti, c, "fim")} />
                </div>))}
            </div>))}
        </div>
        <div className="ph" style={{ left: pct(t) }}><span className="ph-hd" /></div>
      </div>
    </section>
  );
}

function EffectInsp({ selClip, insercao, tracks, labelFor, d, rig, ed }) {
  const alvoTrilha = selClip?.track || (insercao ? tracks[insercao.ti] : null);
  if (!alvoTrilha)
    return <div className="empty">Escolha um bloco na linha do tempo,
      ou toque num espaço vazio de uma trilha pra criar um.</div>;

  const caps = capsOf(alvoTrilha.target, d, rig);
  const clip = selClip?.clip || null;
  const inserindo = !clip && !!insercao;

  return (<>
    <div className="insp-hero" style={{ borderColor: clip ? EFFECTS[clip.fx].color : "#2E3E58" }}>
      <div className="insp-fx">{clip ? EFFECTS[clip.fx].label : "Novo bloco"}</div>
      <div className="insp-tg">{labelFor(alvoTrilha.target)}</div>
    </div>

    {clip ? (<>
      <div className="kv"><span>Início</span>
        <span className="mono">{(clip.t0 / BEAT).toFixed(2)} bt</span></div>
      <div className="kv"><span>Duração</span>
        <span className="mono">{((clip.t1 - clip.t0) / BEAT).toFixed(2)} bt</span></div>

      {Object.entries(clip.p).map(([k, v]) => {
        const m = PARAM_META[k] || PARAM_PADRAO;
        return (
          <div key={k} className="slider">
            <div className="slider-h">
              <span>{m.lb || k}</span><span className="mono">{Number(v).toFixed(2)}</span>
            </div>
            <input type="range" min={m.min} max={m.max} step={m.step} value={v}
              aria-label={m.lb || k}
              onPointerDown={ed.marcar}
              onChange={e => ed.param(k, parseFloat(e.target.value))} />
          </div>);
      })}
      {!Object.keys(clip.p).length &&
        <div className="hint">Este efeito não tem parâmetro pra ajustar.</div>}
    </>) : (
      <div className="kv"><span>Entra em</span>
        <span className="mono">{(insercao.t / BEAT).toFixed(2)} bt</span></div>
    )}

    {clip?.fx === "gobos" && (
      <div className="hint">Formas do catálogo: {GOBOS.slice(1).join(", ")}.
        A cor não vem daqui — vem do RGB da fixture.</div>)}

    <div className="sec">O que este alvo aceita</div>
    <div className="caps">
      {[...caps].map(c => <span key={c} className="cap">{CAP[c] || c}</span>)}
    </div>

    <div className="sec">{inserindo ? "Criar qual efeito" : "Trocar o efeito"}</div>
    <div className="fxl">
      {Object.entries(EFFECTS).map(([k, e]) => {
        const r = responders(k, alvoTrilha.target, d, rig);
        const cls = r.ok === 0 ? "no" : r.ok < r.total ? "part" : "yes";
        return (
          <button key={k} className={`fxr ${cls} ${k === clip?.fx ? "cur" : ""}`}
            disabled={r.ok === 0}
            onClick={() => inserindo ? ed.inserir(k) : ed.trocar(k)}>
            <span className="fxd" style={{ background: e.color }} />
            <span className="fxn">{e.label}</span>
            <span className="mono fxc">
              {r.ok === 0 ? "—" : r.ok === r.total ? "todos" : `${r.ok}/${r.total}`}
            </span>
          </button>);
      })}
    </div>
    <div className="hint">A paleta é derivada do perfil de cada equipamento.
      Grupo misto não é erro: quem não tem a capacidade ignora aquele efeito.</div>

    {clip && <button className="del" onClick={ed.remover}>Remover bloco</button>}
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

const MODE_LB = { palco: "Palco", mesa: "Mesa", estudio: "Estúdio" };

/* Barra de arquivo. Mesma peça no Estúdio e na aba Croqui do celular,
   porque o croqui é editável nos dois e perder edição é igual nos dois. */
function BarraArquivo({ nome, estado, precisaPerm, onAbrir, onSalvar, onRetomar, compact }) {
  const rotulo = { salvando: "salvando…", salvo: "salvo", sujo: "não salvo" }[estado] || estado;
  const cor = estado === "salvo" ? "chip-ok" : estado === "sujo" ? "chip-warn" : "";
  return (
    <div className={`ar ${compact ? "ar-c" : ""}`}>
      {precisaPerm ? (
        <button className="ar-b on" onClick={onRetomar}
          title="O browser não guarda a permissão de escrita entre sessões">
          continuar em {nome}
        </button>
      ) : (
        <span className={`chip ${cor}`}
          title={temFSA ? "gravando no arquivo vinculado"
                        : "este browser não dá acesso a arquivo — salve baixando"}>
          {nome ? `${nome} · ` : ""}{rotulo}
        </span>
      )}
      <button className="ar-b" onClick={onAbrir}>Abrir</button>
      <button className="ar-b" onClick={onSalvar}>
        {temFSA ? "Salvar como" : "Baixar"}
      </button>
    </div>
  );
}

/* Único ponto do exportador que toca o DOM — o resto roda headless. */
function baixarArquivo(bytes, nome) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url; a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ============================================================
   APP
   ============================================================ */

export default function App() {
  const [mode, setMode] = useState("estudio");
  const palco = mode === "palco", mesa = mode === "mesa", estudio = mode === "estudio";

  const [rig, setRig] = useState(RIG_PADRAO);
  const [tracks, setTracks] = useState(TRACKS);
  const [insercao, setInsercao] = useState(null);   // {ti, t} — onde criar bloco
  const [novaTrilha, setNovaTrilha] = useState(false);
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
  const [midia, setMidia] = useState(null);
  const [exp, setExp] = useState(null);          // null | "indo" | texto do resultado
  const [arq, setArq] = useState(null);          // nome do arquivo vinculado
  const [salvo, setSalvo] = useState("salvo");   // salvo | sujo | salvando | erro
  const [precisaPerm, setPrecisaPerm] = useState(false);
  const handle = useRef(null);
  const pronto = useRef(false);                  // trava autosave até o boot terminar
  const hist = useRef({ pas: [], fut: [] });
  const [, setHistN] = useState(0);              // só força re-render dos botões
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
    setMidia(file.name);
    setPeaks(A.peaks);
    if (playing) startAt(loop.t0);
  }, [playing, startAt, loop.t0]);

  const d = useMemo(() => derive(rig), [rig]);
  const eff = black ? 0 : master;
  const tLuz = t + offset;
  const frame = useMemo(() => renderFrame(d, tLuz, eff, tracks), [d, tLuz, eff, tracks]);

  const labelFor = useCallback(id =>
    d.groups.find(g => g.id === id)?.label ||
    rig.find(i => i.id === id)?.lb || id, [d, rig]);

  const selClip = useMemo(() => acharClip(tracks, sel), [tracks, sel]);

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

  /* Exporta a faixa inteira em .fseq. O master e o blackout são controle
     ao vivo e ficam de fora — o arquivo carrega o show como foi autorado.
     O atraso entra, porque é constante da instalação e não da execução. */
  const exportar = useCallback(async () => {
    setExp("indo");
    try {
      const bytes = await exportarFseq({ rig, tracks, offset,
        midia: midia || undefined });
      const nome = (midia ? midia.replace(/\.[^.]+$/, "") : "paredao") + ".fseq";
      baixarArquivo(bytes, nome);
      setExp(`${nome} · ${(bytes.length / 1024).toFixed(1)} KB`);
    } catch (e) {
      setExp(`falhou: ${e.message}`);
    }
  }, [rig, tracks, offset, midia]);

  /* ---------- histórico ----------
     Snapshot do documento, não patch de campo: com ~18 nodes e uma dúzia de
     clips o estado inteiro são poucos KB, e guardar o anterior por completo
     não tem como divergir do que a tela mostra. Quem chama `marcar` é sempre
     quem está prestes a mudar algo — arrasto marca uma vez só, no primeiro
     movimento de verdade. */
  const LIMITE_HIST = 80;

  const marcar = useCallback(() => {
    const h = hist.current;
    h.pas.push({ rig, tracks });
    if (h.pas.length > LIMITE_HIST) h.pas.shift();
    h.fut = [];
    setHistN(n => n + 1);
  }, [rig, tracks]);

  const andar = useCallback((de, para) => {
    const h = hist.current;
    if (!h[de].length) return;
    h[para].push({ rig, tracks });
    const est = h[de].pop();
    setRig(est.rig); setTracks(est.tracks);
    setInsercao(null);
    setHistN(n => n + 1);
  }, [rig, tracks]);

  const desfazer = useCallback(() => andar("pas", "fut"), [andar]);
  const refazer = useCallback(() => andar("fut", "pas"), [andar]);

  /* ---------- edição da timeline ---------- */

  const ed = useMemo(() => ({
    marcar,
    mover: (ti, id, t0) => setTracks(ts => moverClip(ts, ti, id, t0)),
    redimensionar: (ti, id, borda, t) =>
      setTracks(ts => redimensionarClip(ts, ti, id, borda, t)),
    apontar: (ti, t) => { setInsercao({ ti, t }); setSel(null); },
    inserir: (fx) => {
      if (!insercao) return;
      marcar();
      const ts = inserirClip(tracks, insercao.ti, fx, insercao.t);
      setTracks(ts);
      // seleciona o que acabou de nascer, pra já poder ajustar
      const novo = ts[insercao.ti].clips.find(c =>
        !tracks[insercao.ti].clips.some(v => v.id === c.id));
      if (novo) { setSel(novo.id); setInsercao(null); }
    },
    trocar: (fx) => {
      if (!selClip) return;
      marcar(); setTracks(ts => trocarEfeito(ts, selClip.ti, selClip.clip.id, fx));
    },
    param: (k, v) => {
      if (!selClip) return;
      setTracks(ts => ajustarParam(ts, selClip.ti, selClip.clip.id, k, v));
    },
    remover: () => {
      if (!selClip) return;
      marcar(); setTracks(ts => removerClip(ts, selClip.ti, selClip.clip.id));
      setSel(null);
    },
    removerTrilha: (ti) => { marcar(); setTracks(ts => removerTrilha(ts, ti)); },
    pedirTrilha: () => setNovaTrilha(true),
  }), [marcar, insercao, tracks, selClip]);

  /* Alvo é grupo ou fixture solta — o motor resolve os dois igual. */
  const alvos = useMemo(() => [
    ...d.groups.map(g => ({ id: g.id, lb: g.label, kind: g.id === "g-heads" ? "dmx" : "pixel" })),
    ...d.heads.map(h => ({ id: h.id, lb: h.lb, kind: "dmx" })),
    ...d.pix.map(i => ({ id: i.id, lb: i.lb, kind: "pixel" })),
  ], [d]);

  const criarTrilha = useCallback((target, kind) => {
    marcar();
    setTracks(ts => adicionarTrilha(ts, target, kind));
    setNovaTrilha(false);
  }, [marcar]);

  /* Atalhos de teclado. Não capturar quando o foco está num input:
     Ctrl+Z dentro de um campo é do campo, não da timeline. */
  useEffect(() => {
    const onKey = (e) => {
      const alvo = e.target;
      if (alvo && (/^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName) || alvo.isContentEditable)) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? refazer() : desfazer();
      } else if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault(); refazer();
      } else if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        e.preventDefault(); ed.remover();
      } else if (e.key === " ") {
        e.preventDefault(); setPlaying(pl => !pl);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desfazer, refazer, ed, sel]);

  /* ---------- arquivo ---------- */

  const aplicarDoc = useCallback(texto => {
    const doc = desserializarDocumento(texto);   // valida tudo antes de aplicar nada
    setRig(doc.rig);
    setTracks(doc.sequencia);
    setMidia(doc.midia);
    setPick(null); setInsercao(null);
    hist.current = { pas: [], fut: [] }; setHistN(n => n + 1);
  }, []);

  /* Retoma o arquivo da sessão passada. O handle sobrevive no IndexedDB,
     a permissão não — sem ela, `pronto` fica falso de propósito, senão o
     autosave gravaria o rig padrão por cima do trabalho salvo. */
  useEffect(() => {
    (async () => {
      const h = await handleLembrado();
      if (h) {
        handle.current = h;
        setArq(h.name);
        if (await podeEscrever(h)) {
          try { aplicarDoc(await (await h.getFile()).text()); setSalvo("salvo"); }
          catch (e) { setSalvo(`erro: ${e.message}`); }
        } else {
          setPrecisaPerm(true);
          return;                                 // sem autosave até reconceder
        }
      }
      pronto.current = true;
    })();
  }, [aplicarDoc]);

  // Autosave com folga: gravar a cada pixel arrastado torra o disco à toa.
  useEffect(() => {
    if (!pronto.current) return;
    if (!handle.current) { setSalvo("sujo"); return; }
    setSalvo("sujo");
    const id = setTimeout(async () => {
      setSalvo("salvando");
      try {
        await gravar(handle.current, paraJson(serializarDocumento({ rig, sequencia: tracks, midia })));
        setSalvo("salvo");
      } catch (e) { setSalvo(`erro: ${e.message}`); }
    }, 700);
    return () => clearTimeout(id);
  }, [rig, tracks, midia]);

  const abrir = useCallback(async () => {
    try {
      const r = temFSA ? await abrirComPicker() : await abrirComInput();
      if (!r) return;
      aplicarDoc(r.texto);                        // se o arquivo for inválido, para aqui
      handle.current = r.handle;
      setArq(r.nome);
      setPrecisaPerm(false);
      pronto.current = true;
      setSalvo(r.handle ? "salvo" : "sujo");
    } catch (e) {
      if (e.name !== "AbortError") setSalvo(`erro: ${e.message}`);
    }
  }, [aplicarDoc]);

  const salvarComo = useCallback(async () => {
    const nome = arq || `corsa${EXTENSAO}`;
    const texto = paraJson(serializarDocumento({ rig, sequencia: tracks, midia }));
    if (!temFSA) { baixar(texto, nome); setArq(nome); setSalvo("salvo"); return; }
    try {
      const h = await escolherDestino(nome);
      handle.current = h;
      setArq(h.name);
      setPrecisaPerm(false);
      pronto.current = true;
      setSalvo("salvando");
      await gravar(h, texto);
      setSalvo("salvo");
    } catch (e) {
      if (e.name !== "AbortError") setSalvo(`erro: ${e.message}`);
    }
  }, [arq, rig, tracks, midia]);

  const retomar = useCallback(async () => {
    const h = handle.current;
    if (!h) return;
    if (!(await podeEscrever(h, true))) {        // negou: solta o vínculo
      await esquecerHandle();
      handle.current = null; setArq(null); setPrecisaPerm(false); pronto.current = true;
      return;
    }
    try {
      aplicarDoc(await (await h.getFile()).text());
      setPrecisaPerm(false);
      pronto.current = true;
      setSalvo("salvo");
    } catch (e) { setSalvo(`erro: ${e.message}`); }
  }, [aplicarDoc]);

  const barraArquivo = (compact) => (
    <BarraArquivo nome={arq} estado={salvo} precisaPerm={precisaPerm}
      onAbrir={abrir} onSalvar={salvarComo} onRetomar={retomar} compact={compact} />
  );

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
          <button className="btn btn-sm" onClick={desfazer} disabled={!hist.current.pas.length}
            title="Desfazer (Ctrl+Z)" aria-label="Desfazer">↶</button>
          <button className="btn btn-sm" onClick={refazer} disabled={!hist.current.fut.length}
            title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer">↷</button>
          {!palco && <div className="hd-meta">
            <span><b>{BPM}</b> bpm</span><span><b>{Math.floor(t / BEAT) % 4 + 1}</b>/4</span></div>}
        </div>
        {estudio && (
          <div className="hd-out">
            <span className="chip chip-blue">{d.totalNodes} nodes</span>
            <span className="chip chip-amber">{d.heads.length} heads</span>
            <span className="chip">{d.totalCh} canais</span>
            {exp && exp !== "indo" && <span className="chip chip-ok">{exp}</span>}
            <button className="btn btn-ghost" onClick={exportar} disabled={exp === "indo"}
              title={`${Math.round(DURATION * FPS)} quadros a ${FPS}fps · zlib`}>
              {exp === "indo" ? "Exportando…" : "Exportar .fseq"}
            </button>
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
              {barraArquivo()}
              <AudioBar A={au.current} hasFile={hasFile} onFile={loadFile}
                click={click} setClick={setClick} offset={offset} setOffset={setOffset} />
            </div>
            {stage}
          </main>
          <aside className="insp">
            <div className="pane-t">{croqui ? "Equipamento" : "Efeito"}</div>
            {croqui
              ? <CroquiInsp item={pickItem} chan={d.chan} onEdit={editItem} onDel={delItem} onAdd={addItem} />
              : <EffectInsp selClip={selClip} insercao={insercao} tracks={tracks}
                  labelFor={labelFor} d={d} rig={rig} ed={ed} />}
          </aside>
        </div>
        <Timeline t={t} tracks={tracks} sel={sel} setSel={pickClip} scrub={scrub}
          labelFor={labelFor} peaks={peaks} ed={ed} insercao={insercao} />
      </>)}

      {novaTrilha && (<>
        <div className="scrim" onClick={() => setNovaTrilha(false)} />
        <div className="alvos" role="dialog" aria-label="Nova trilha">
          <div className="sec">Trilha nova pra qual alvo</div>
          {alvos.map(a => (
            <button key={a.id} className="alvo" onClick={() => criarTrilha(a.id, a.kind)}>
              <span className={`bar ${a.kind}`} />
              <span className="alvo-lb">{a.lb}</span>
              <span className="mono dim">{a.kind}</span>
            </button>))}
          <div className="hint">Pode repetir alvo: cada trilha é uma camada, e no
            DMX elas compõem por campo — varredura escreve pan, gobo escreve gobo.</div>
        </div>
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
            <Timeline t={t} tracks={tracks} sel={sel} setSel={pickClip} scrub={scrub} compact
              labelFor={labelFor} ed={ed} insercao={insercao} />}
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
            <Timeline t={t} tracks={tracks} sel={sel} setSel={pickClip} scrub={scrub} compact
              labelFor={labelFor} ed={ed} insercao={insercao} />}
          {tab === "croqui" && (
            <div className="m-croqui">
              {barraArquivo(true)}
              <CroquiInsp item={pickItem} chan={d.chan} onEdit={editItem} onDel={delItem} onAdd={addItem} />
            </div>)}
          {tab === "rig" && (
            <div className="m-rig">
              <RigList d={d} frame={frame} sel={pick}
                onPick={id => { setPick(id); setTab("croqui"); setView("croqui"); }} />
            </div>)}
        </div>

        {(sheet || insercao) && view !== "croqui" && (<>
          <div className="scrim" onClick={() => { setSheet(false); setInsercao(null); }} />
          <div className="sheet" role="dialog" aria-label="Efeito">
            <button className="sheet-grab" aria-label="Fechar"
              onClick={() => { setSheet(false); setInsercao(null); }} />
            <EffectInsp selClip={selClip} insercao={insercao} tracks={tracks}
                  labelFor={labelFor} d={d} rig={rig} ed={ed} />
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
.chip-ok{color:#6FD3B4;border-color:#14382E;background:#081A15}
.chip-warn{color:#FFC97A;border-color:#3D2E14;background:#1E1608}
.btn:disabled{opacity:.5;cursor:progress}
.ar{display:flex;align-items:center;gap:6px;min-width:0}
.ar .chip{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px}
.ar-b{padding:5px 10px;border-radius:7px;background:#0D1420;border:1px solid var(--line);
  font-size:10.5px;font-weight:600;color:var(--chrome);white-space:nowrap;transition:.13s}
.ar-b:hover{background:#152136;color:var(--ink)}
.ar-b.on{background:#122140;border-color:var(--blue);color:#8FB4FF}
.ar-c{padding:0 13px 12px;flex-wrap:wrap}

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
.slider input{width:100%;height:18px;-webkit-appearance:none;background:transparent}
.slider input::-webkit-slider-runnable-track{height:3px;border-radius:2px;background:#1A2434}
.slider input::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;margin-top:-6px;
  border-radius:50%;background:var(--blue);border:2px solid #0B111C}
.slider input::-moz-range-track{height:3px;border-radius:2px;background:#1A2434}
.slider input::-moz-range-thumb{width:13px;height:13px;border-radius:50%;
  background:var(--blue);border:2px solid #0B111C}
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
  display:flex;align-items:center;overflow:hidden;transition:background .12s,box-shadow .12s;
  cursor:grab;touch-action:none;user-select:none}
.clip:active{cursor:grabbing}
.clip-t{flex:1;font-size:10px;color:#C6D3E6;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;padding:0 2px;pointer-events:none}
.clip-hd{flex:0 0 9px;align-self:stretch;cursor:ew-resize;touch-action:none}
.clip-hd:hover{background:color-mix(in srgb,var(--fx) 55%,transparent)}
.tl-ins{position:absolute;top:0;bottom:0;width:2px;background:#6FD3B4;
  box-shadow:0 0 8px rgba(111,211,180,.8);pointer-events:none}
.tl-lb.alvo{background:#0B1A18;border-left:2px solid #6FD3B4}
.tl-x{margin-left:auto;padding:0 5px;font-size:13px;line-height:1;color:#4A5B77;border-radius:4px}
.tl-x:hover{color:#FF7A9C;background:#1B0E14}
.tl-add{display:block;width:100%;padding:7px 10px;text-align:left;font-size:10.5px;
  font-weight:600;color:var(--chrome);border-top:1px solid var(--line2)}
.tl-add:hover{background:#111A28;color:#8FB4FF}
.btn-sm{min-width:30px;height:30px;font-size:13px}
.alvos{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:7;
  width:min(320px,90vw);max-height:70%;overflow-y:auto;background:var(--panel);
  border:1px solid var(--line);border-radius:14px;padding-bottom:12px;
  box-shadow:0 18px 50px rgba(0,0,0,.6)}
.alvo{display:flex;align-items:center;gap:8px;width:100%;padding:9px 13px;
  text-align:left;font-size:11.5px;color:#9FADC2}
.alvo:hover{background:#152136;color:var(--ink)}
.alvo-lb{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
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
.fxr{display:flex;align-items:center;gap:8px;padding:7px 9px;font-size:10.5px;width:100%;
  text-align:left;background:#0B111C;border-bottom:1px solid #131C2A;transition:.12s}
.fxr:not(:disabled):hover{background:#152136}
.fxr:disabled{cursor:default}
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
