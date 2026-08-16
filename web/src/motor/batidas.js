/* ============================================================
   MAPA DE BATIDAS — onde cada tempo cai, em segundos.

   BPM escalar tem orçamento de precisão: o erro acumula, e 0,1 BPM
   custa ~15 quadros de deriva numa faixa de 4 minutos. Aqui não
   existe acúmulo, porque cada batida está ancorada onde a música
   realmente está — e de quebra o rubato deixa de ser problema.

   O rastreamento é programação dinâmica no envelope de ataque, na
   linha do Ellis 2007: maximiza a soma dos ataques escolhidos,
   penalizando quem se afasta do período esperado. Um parâmetro só,
   a rigidez, decide se a grade é metrônomo ou baterista humano.
   ============================================================ */

import { envelopeDeAtaque, detectarBpm } from "./bpm.js";

/* Rigidez alta gruda no andamento médio e ignora o rubato; baixa segue
   cada ataque e aceita qualquer bobagem como batida. 90 segura a métrica
   e ainda acompanha a faixa acelerando de leve ao longo do refrão. */
const RIGIDEZ = 90;

/**
 * Rastreia as batidas de um envelope já calculado.
 *
 * @param {Float32Array} onset
 * @param {number} periodoAlvo  em quadros, vindo do detector de andamento
 * @param {number} [rigidez]
 * @returns {number[]} índices de quadro, em ordem
 */
export function rastrearNoEnvelope(onset, periodoAlvo, rigidez = RIGIDEZ) {
  const n = onset.length;
  if (n < 4 || !(periodoAlvo > 1)) return [];

  /* Só vale procurar a batida anterior entre meio período e dois: fora
     disso não é hesitação de músico, é outra batida no meio. */
  const menor = Math.max(1, Math.round(periodoAlvo * 0.5));
  const maior = Math.min(n - 1, Math.round(periodoAlvo * 2));
  if (maior <= menor) return [];

  // penalidade log-quadrática: simétrica entre acelerar e atrasar
  const multa = new Float32Array(maior + 1);
  for (let d = menor; d <= maior; d++)
    multa[d] = -rigidez * Math.log(d / periodoAlvo) ** 2;

  const nota = new Float32Array(n);
  const veioDe = new Int32Array(n).fill(-1);

  for (let t = 0; t < n; t++) {
    let melhor = -Infinity, arg = -1;
    const limite = Math.min(maior, t);
    for (let d = menor; d <= limite; d++) {
      const s = nota[t - d] + multa[d];
      if (s > melhor) { melhor = s; arg = t - d; }
    }
    nota[t] = onset[t] + (arg < 0 ? 0 : melhor);
    veioDe[t] = arg;
  }

  /* Volta a partir da melhor pontuação do trecho final. A nota é
     acumulada, então o máximo global mora perto do fim — mas olhar só a
     cauda evita terminar numa batida que o silêncio final inventou. */
  let fim = -1, top = -Infinity;
  for (let t = Math.max(0, n - maior); t < n; t++)
    if (nota[t] > top) { top = nota[t]; fim = t; }
  if (fim < 0) return [];

  const batidas = [];
  for (let t = fim; t >= 0; t = veioDe[t]) {
    batidas.push(t);
    if (veioDe[t] < 0) break;
  }
  return batidas.reverse();
}

/**
 * Mapa de batidas de um áudio, do começo ao fim.
 *
 * @param {Float32Array} canal   amostras mono
 * @param {number} sampleRate
 * @param {{rigidez?:number, bpm?:number}} [op]  `bpm` pula a detecção
 * @returns {{batidas:number[], bpm:number, confianca:number, duracao:number}}
 *   `batidas` em segundos.
 */
export function rastrearBatidas(canal, sampleRate, op = {}) {
  const duracao = canal.length / sampleRate;
  const { onset, taxa } = envelopeDeAtaque(canal, sampleRate);
  const vazio = { batidas: [], bpm: 0, confianca: 0, duracao };
  if (onset.length < taxa * 4) return vazio;

  const det = op.bpm ? { bpm: op.bpm, confianca: 1 } : detectarBpm(canal, sampleRate);
  if (!det.bpm) return vazio;

  const periodo = taxa * 60 / det.bpm;
  const quadros = rastrearNoEnvelope(onset, periodo, op.rigidez);
  if (quadros.length < 2) return { ...vazio, bpm: det.bpm, confianca: det.confianca };

  const batidas = quadros.map(q => q / taxa);

  /* O DP começa a marcar onde tem ataque, então intro silenciosa fica de
     fora. Estender pra trás e pra frente no passo local mantém a grade
     cobrindo a faixa toda — o sequenciador precisa de compasso 1 mesmo
     onde a música ainda não entrou. */
  const passoIni = batidas[1] - batidas[0];
  for (let t = batidas[0] - passoIni; t > 0; t -= passoIni) batidas.unshift(t);
  const passoFim = batidas[batidas.length - 1] - batidas[batidas.length - 2];
  for (let t = batidas[batidas.length - 1] + passoFim; t < duracao; t += passoFim)
    batidas.push(t);

  return { batidas, bpm: det.bpm, confianca: det.confianca, duracao };
}

/** Andamento instantâneo, batida a batida. Serve pra ver rubato na UI. */
export function bpmAoLongo(batidas) {
  const out = [];
  for (let i = 1; i < batidas.length; i++)
    out.push({ t: batidas[i - 1], bpm: 60 / (batidas[i] - batidas[i - 1]) });
  return out;
}
