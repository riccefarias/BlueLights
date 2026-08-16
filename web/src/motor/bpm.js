/* ============================================================
   DETECÇÃO DE ANDAMENTO — puro, sobre amostras cruas.

   Sem dependência: entra Float32Array e taxa de amostragem, sai
   andamento, fase e confiança. Roda no browser, no Node e no teste.

   BPM sozinho não serve pra nada. Sem saber ONDE cai o tempo 1, uma
   grade de 128 certinha põe todo bloco na contratempo. Por isso a
   saída traz `offset` — e é a metade que costuma faltar.
   ============================================================ */

const BPM_MIN = 60, BPM_MAX = 200;

/* Janela de análise. Faixa inteira é desperdício: 60s de miolo pega o
   andamento tão bem quanto 4 minutos e custa um sexto. Começa depois da
   introdução, que é onde mora silêncio, fade e rubato. */
const JANELA_S = 60;
const PULO_S = 20;

/* 10ms por quadro dá resolução de ±5ms na fase, bem abaixo do que
   qualquer pessoa percebe como atraso de luz. */
const QUADRO_MS = 10;

/** Envelope de ataque: energia por quadro, e só o que cresce.
    A compressão é raiz, não log. Log parece mais esperto e é armadilha:
    ele faz um chimbal fraco depois do silêncio saltar tanto quanto um
    bumbo, e aí a colcheia vira o pulso e o detector responde o dobro do
    andamento. Raiz achata a dinâmica sem apagar quem é o grave. */
export function envelopeDeAtaque(canal, sampleRate, quadroMs = QUADRO_MS) {
  const salto = Math.max(1, Math.round(sampleRate * quadroMs / 1000));
  const n = Math.floor(canal.length / salto);
  const taxa = sampleRate / salto;
  if (n < 4) return { onset: new Float32Array(0), taxa };

  const energia = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const ini = i * salto, fim = ini + salto;
    for (let k = ini; k < fim; k++) s += canal[k] * canal[k];
    energia[i] = Math.sqrt(s / salto);
  }

  const onset = new Float32Array(n);
  for (let i = 1; i < n; i++)
    onset[i] = Math.max(0, Math.sqrt(energia[i]) - Math.sqrt(energia[i - 1]));

  // normaliza pra autocorrelação não depender do volume da faixa
  let media = 0;
  for (let i = 0; i < n; i++) media += onset[i];
  media /= n || 1;
  let dp = 0;
  for (let i = 0; i < n; i++) dp += (onset[i] - media) ** 2;
  dp = Math.sqrt(dp / (n || 1)) || 1;
  for (let i = 0; i < n; i++) onset[i] = (onset[i] - media) / dp;

  return { onset, taxa };
}

function autocorrelacao(x, lagMin, lagMax) {
  const r = new Float32Array(lagMax + 1);
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let s = 0;
    for (let i = lag; i < x.length; i++) s += x[i] * x[i - lag];
    r[lag] = s / (x.length - lag);
  }
  return r;
}

/* Prior de andamento: música de paredão vive entre 90 e 150. Sem este
   peso a autocorrelação escolhe metade ou o dobro com a mesma
   convicção — é o erro clássico de detector de BPM. */
function peso(bpm) {
  return Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.65) ** 2);
}

/* Pulso sim, pulso não: se os ímpares são muito mais fracos que os pares,
   o período escolhido é uma subdivisão e o de verdade é o dobro. É o teste
   que resolve erro de oitava — no período certo a razão fica perto de 1,
   na metade dele desaba pra ~0.15. */
/* O pico de ataque tem um quadro de largura. Amostrar o quadro exato faz
   um erro de 10ms — que ninguém enxerga numa luz — zerar a pontuação, e aí
   a busca de período fica num terreno cheio de buraco. Olhar o vizinho
   deixa o objetivo liso sem afrouxar a precisão que importa. */
function noPulso(onset, i) {
  const k = Math.round(i);
  return Math.max(onset[k - 1] || 0, onset[k] || 0, onset[k + 1] || 0);
}

function parImpar(onset, p, fase) {
  let sp = 0, np = 0, si = 0, ni = 0;
  for (let k = 0, i = fase; i < onset.length; k++, i += p) {
    const v = noPulso(onset, i);
    if (k % 2) { si += v; ni++; } else { sp += v; np++; }
  }
  const par = sp / (np || 1);
  return { par, razao: par > 0 ? (si / (ni || 1)) / par : 1 };
}
const LIMIAR_OITAVA = 0.5;

/** Fase que melhor alinha um trem de pulsos de período `p` ao envelope. */
function melhorFase(onset, p) {
  let melhor = 0, top = -Infinity;
  const passos = Math.max(1, Math.round(p));
  for (let f = 0; f < passos; f++) {
    let s = 0, n = 0;
    for (let i = f; i < onset.length; i += p) { s += noPulso(onset, i); n++; }
    const media = n ? s / n : -Infinity;
    if (media > top) { top = media; melhor = f; }
  }
  return { fase: melhor, forca: top };
}

/* Refino do período contra o próprio envelope.
   O comb devolve lag inteiro, e inteiro não basta: 47 quadros em vez de
   46.77 parece nada, mas em 40 segundos são 85 pulsos, e a deriva
   acumulada joga o trem 19 quadros fora da batida. A força do alinhamento
   despenca e a fase vira lixo. Meio BPM importa. */
function refinarPeriodo(onset, p0, raio = 1.2, passo = 0.02) {
  let melhor = { p: p0, ...melhorFase(onset, p0) };
  for (let p = p0 - raio; p <= p0 + raio; p += passo) {
    if (p < 4) continue;
    const r = melhorFase(onset, p);
    if (r.forca > melhor.forca) melhor = { p, ...r };
  }
  return melhor;
}

/* Dobra ou divide até cair na faixa onde mora quase toda música de pista.
   Serve pra votar: 84 e 168 são a mesma música, e sem reduzir a um
   representante comum a mediana entre janelas não quer dizer nada. */
const VOTO_MIN = 80, VOTO_MAX = 160;
function dobrarPraFaixa(bpm) {
  let b = bpm;
  for (let i = 0; i < 4 && b < VOTO_MIN; i++) b *= 2;
  for (let i = 0; i < 4 && b >= VOTO_MAX; i++) b /= 2;
  return b;
}

/** Melhor período de um pedaço do envelope, sem decidir oitava. */
function periodoBruto(onset, taxa) {
  const lagMin = Math.floor(taxa * 60 / BPM_MAX);
  const lagMax = Math.ceil(taxa * 60 / BPM_MIN);
  if (lagMax >= onset.length) return 0;
  const r = autocorrelacao(onset, lagMin, lagMax);
  let melhorLag = 0, melhorNota = -Infinity;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let nota = r[lag];
    for (const h of [2, 3, 4]) {
      const l = lag * h;
      if (l <= lagMax) nota += r[l] / h;
    }
    nota *= peso(taxa * 60 / lag);
    if (nota > melhorNota) { melhorNota = nota; melhorLag = lag; }
  }
  return melhorLag;
}

const mediana = xs => {
  const o = [...xs].sort((a, b) => a - b);
  return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
};

/** Mistura os canais. Detecção num canal só perde o que estiver panoramizado. */
export function paraMono(audioBuffer) {
  const n = audioBuffer.length, c = audioBuffer.numberOfChannels;
  const mono = new Float32Array(n);
  for (let k = 0; k < c; k++) {
    const d = audioBuffer.getChannelData(k);
    for (let i = 0; i < n; i++) mono[i] += d[i] / c;
  }
  return mono;
}

/**
 * Andamento, fase e confiança de um trecho de áudio.
 *
 * @param {Float32Array} canal   amostras mono
 * @param {number} sampleRate
 * @param {{janela?:number, pulo?:number}} [op]
 * @returns {{bpm:number, offset:number, confianca:number, beat:number}}
 *   `offset` é onde cai o primeiro tempo, em segundos.
 *   `confianca` vai de 0 a 1; abaixo de ~0.3 é chute.
 */
export function detectarBpm(canal, sampleRate, op = {}) {
  const vazio = { bpm: 0, offset: 0, confianca: 0, beat: 0, votos: [] };
  const { onset, taxa } = envelopeDeAtaque(canal, sampleRate);
  if (onset.length < taxa * 8) return vazio;        // menos de 8s: não dá

  /* Votação por janelas. Uma janela só não decide: música de verdade tem
     trecho em meio-tempo, e a autocorrelação responde 84 num pedaço e 168
     no outro — os dois certos. Quem desempata é a maioria da faixa. */
  const jan = Math.round((op.janela ?? 30) * taxa);
  const margem = Math.round(Math.min(10, onset.length / taxa / 6) * taxa);
  const votos = [];
  for (let ini = margem; ini + jan <= onset.length - margem; ini += jan) {
    const lag = periodoBruto(onset.subarray(ini, ini + jan), taxa);
    if (lag) votos.push(dobrarPraFaixa(taxa * 60 / lag));
  }
  if (!votos.length) {
    const lag = periodoBruto(onset, taxa);
    if (!lag) return vazio;
    votos.push(dobrarPraFaixa(taxa * 60 / lag));
  }

  /* Período e fase são refinados contra a faixa INTEIRA, não contra a
     janela: erro de meio BPM não aparece em 30s e desalinha 4 minutos. */
  const alvo = taxa * 60 / mediana(votos);
  let { p: periodo, fase, forca } = refinarPeriodo(onset, alvo, 1.5);

  for (let i = 0; i < 2; i++) {
    if (parImpar(onset, periodo, fase).razao >= LIMIAR_OITAVA) break;
    const dobro = periodo * 2;
    if (taxa * 60 / dobro < BPM_MIN || dobro >= onset.length) break;
    ({ p: periodo, fase, forca } = refinarPeriodo(onset, dobro, 0.6));
  }

  const bpm = taxa * 60 / periodo;
  const beat = 60 / bpm;

  /* Confiança junta duas coisas: o quanto o pulso se destaca do envelope,
     e o quanto as janelas concordaram entre si. Faixa com rubato acerta o
     andamento médio e merece confiança baixa mesmo assim. */
  const alvoV = mediana(votos);
  const acordo = votos.filter(v => Math.abs(v - alvoV) / alvoV < 0.03).length / votos.length;
  const confianca = Math.max(0, Math.min(1, (forca / 4) * acordo));

  let offset = (fase / taxa) % beat;
  if (offset < 0) offset += beat;

  /* BPM sai SEM arredondar, de propósito. Arredondar em 0.1 parece
     inofensivo e custa 15 quadros de deriva numa faixa de 4 minutos —
     mais que a largura de um ataque, o que decorrelaciona a grade
     inteira. Quem arredonda é a tela, na hora de escrever "84,2". */
  return {
    bpm, offset, confianca, beat,
    votos: votos.map(v => Math.round(v * 10) / 10),
  };
}
