import test from "node:test";
import assert from "node:assert/strict";

import { detectarBpm, envelopeDeAtaque } from "../src/motor/bpm.js";

const SR = 22050;

/* Faixa sintética: kick no tempo, caixa no 2 e 4, chimbal na colcheia.
   Mesma anatomia da claque do sequenciador, que é a mesma da música que
   toca no carro — grave forte marcando o tempo. */
function faixa({ bpm, segundos = 40, offset = 0, sr = SR, chimbal = true, ruido = 0 }) {
  const n = Math.round(segundos * sr);
  const x = new Float32Array(n);
  const beat = 60 / bpm;

  const bater = (t, dur, f0, f1, amp) => {
    const ini = Math.round(t * sr), len = Math.round(dur * sr);
    for (let k = 0; k < len && ini + k < n; k++) {
      const u = k / len;
      const f = f0 * Math.pow(f1 / f0, u);
      x[ini + k] += Math.sin(2 * Math.PI * f * (k / sr)) * amp * Math.pow(1 - u, 2.5);
    }
  };
  const chiado = (t, dur, amp, semente) => {
    const ini = Math.round(t * sr), len = Math.round(dur * sr);
    let s = semente;
    for (let k = 0; k < len && ini + k < n; k++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;      // ruído reprodutível
      x[ini + k] += ((s / 0x3fffffff) - 1) * amp * Math.pow(1 - k / len, 3);
    }
  };

  for (let i = 0; ; i++) {
    const t = offset + i * beat;
    if (t >= segundos) break;
    bater(t, .13, 150, 45, .9);                        // bumbo
    if (i % 4 === 1 || i % 4 === 3) chiado(t, .10, .30, i + 7);   // caixa
    if (chimbal) {
      chiado(t, .025, .07, i + 101);
      chiado(t + beat / 2, .025, .07, i + 211);        // contratempo
    }
  }
  if (ruido) {
    let s = 99;
    for (let k = 0; k < n; k++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      x[k] += ((s / 0x3fffffff) - 1) * ruido;
    }
  }
  return x;
}

test("envelope de ataque marca os golpes e nada mais", () => {
  const { onset, taxa } = envelopeDeAtaque(faixa({ bpm: 120, segundos: 4, chimbal: false }), SR);
  assert.equal(Math.round(taxa), 100, "10ms por quadro = 100 quadros por segundo");
  // com 120bpm o tempo cai a cada 50 quadros; os picos têm que estar por lá
  const picos = [];
  for (let i = 1; i < onset.length - 1; i++)
    if (onset[i] > 2 && onset[i] >= onset[i - 1] && onset[i] > onset[i + 1]) picos.push(i);
  assert.ok(picos.length >= 6, `esperava vários ataques, achei ${picos.length}`);
  const passos = picos.slice(1).map((p, i) => p - picos[i]);
  assert.ok(passos.every(d => Math.abs(d - 50) <= 3 || Math.abs(d - 25) <= 3),
    `passo entre ataques fora do esperado: ${passos}`);
});

test("acha o andamento de faixas em vários tempos", () => {
  for (const bpm of [92, 100, 115, 128, 140, 150]) {
    const r = detectarBpm(faixa({ bpm }), SR);
    assert.ok(Math.abs(r.bpm - bpm) < 1.5,
      `${bpm} bpm detectado como ${r.bpm}`);
    assert.ok(r.confianca > 0.3, `confiança baixa (${r.confianca.toFixed(2)}) em ${bpm}`);
  }
});

test("não cai no dobro nem na metade por causa do chimbal", () => {
  // chimbal na colcheia é a armadilha clássica: dá pico no dobro do tempo
  const r = detectarBpm(faixa({ bpm: 128, chimbal: true }), SR);
  assert.ok(Math.abs(r.bpm - 128) < 1.5, `saiu ${r.bpm}, provável erro de oitava`);
});

test("acha onde cai o tempo 1, não só a que velocidade", () => {
  const bpm = 128, beat = 60 / bpm;
  for (const off of [0, 0.12, 0.3]) {
    const r = detectarBpm(faixa({ bpm, offset: off }), SR);
    // a fase é módulo uma batida: 0 e `beat` são a mesma coisa
    const erro = Math.min(
      Math.abs(r.offset - off),
      Math.abs(r.offset - off - beat),
      Math.abs(r.offset - off + beat));
    assert.ok(erro < 0.025, `offset ${off}s detectado como ${r.offset.toFixed(3)}s`);
  }
});

test("aguenta ruído por cima", () => {
  const r = detectarBpm(faixa({ bpm: 128, ruido: 0.05 }), SR);
  assert.ok(Math.abs(r.bpm - 128) < 1.5, `com ruído saiu ${r.bpm}`);
});

test("faixa curta demais devolve zero em vez de inventar", () => {
  const r = detectarBpm(new Float32Array(SR * 2), SR);
  assert.equal(r.bpm, 0);
  assert.equal(r.confianca, 0);
});

test("silêncio não vira andamento confiante", () => {
  const r = detectarBpm(new Float32Array(SR * 30), SR);
  assert.ok(r.confianca < 0.3, `silêncio deu confiança ${r.confianca}`);
});

test("o offset volta em tempo do arquivo, mesmo analisando o miolo", () => {
  // faixa longa: a análise pula a introdução, e a fase tem que ser corrigida
  const bpm = 120;
  const r = detectarBpm(faixa({ bpm, segundos: 120, offset: 0.25 }), SR);
  assert.ok(Math.abs(r.bpm - bpm) < 1.5);
  const beat = 60 / bpm;
  const erro = Math.min(Math.abs(r.offset - 0.25), Math.abs(r.offset - 0.25 - beat));
  assert.ok(erro < 0.03, `offset saiu ${r.offset.toFixed(3)}`);
});

test("a grade ainda cola no FIM de uma faixa longa", () => {
  /* Regressão da lição mais cara deste módulo: arredondar o BPM em 0.1
     custa ~15 quadros de deriva em 4 minutos. O ataque tem 1 a 2 quadros
     de largura, então a grade decorrelaciona inteira — e o começo continua
     parecendo certo, que é o que faz não perceber. Andamento quebrado de
     propósito, pra nenhum arredondamento salvar. */
  const bpm = 128.37, segundos = 180;
  const x = faixa({ bpm, segundos, chimbal: false });
  const r = detectarBpm(x, SR);
  assert.ok(Math.abs(r.bpm - bpm) < 0.5, `andamento saiu ${r.bpm.toFixed(3)}`);

  const { onset, taxa } = envelopeDeAtaque(x, SR);
  const p = (60 / r.bpm) * taxa;
  const media = (de, ate) => {
    let s = 0, n = 0;
    for (let i = r.offset * taxa + Math.ceil((de * taxa - r.offset * taxa) / p) * p;
         i < ate * taxa && i < onset.length; i += p) {
      const k = Math.round(i);
      s += Math.max(onset[k - 1] || 0, onset[k] || 0, onset[k + 1] || 0); n++;
    }
    return n ? s / n : 0;
  };
  const inicio = media(0, 20), fim = media(segundos - 20, segundos);
  assert.ok(inicio > 1, `nem no começo alinhou (${inicio.toFixed(2)})`);
  assert.ok(fim > inicio * 0.7,
    `deriva: alinhava ${inicio.toFixed(2)} no começo e ${fim.toFixed(2)} no fim`);
});

test("a votação estabiliza faixa que muda de meio-tempo", () => {
  // primeira metade marcando a batida, segunda metade marcando a colcheia
  const bpm = 120, sec = 60;
  const a = faixa({ bpm, segundos: sec, chimbal: false });
  const b = faixa({ bpm: bpm * 2, segundos: sec, chimbal: false });
  const x = new Float32Array(a.length + b.length);
  x.set(a); x.set(b, a.length);
  const r = detectarBpm(x, SR);
  assert.ok(Math.abs(r.bpm - bpm) < 2 || Math.abs(r.bpm - bpm * 2) < 3,
    `saiu ${r.bpm.toFixed(1)}, esperava ${bpm} ou ${bpm * 2}`);
  assert.ok(r.votos.length >= 2, "tem que votar em mais de uma janela");
});
