/* ============================================================
   EXPORTAR — roda o show inteiro fora do tempo real e empilha
   os quadros. É o mesmo motor do preview: se a pilha diverge do
   que se vê na tela, o bug é do motor, não do exportador.
   ============================================================ */

import { RIG_PADRAO } from "../modelo/rig.js";
import { DURATION, FPS, TRACKS } from "../modelo/sequencia.js";
import { derive } from "./derivar.js";
import { renderFrame } from "./render.js";
import { serializarFrame } from "./canais.js";
import { escreverFseq } from "./fseq.js";

/**
 * Renderiza a faixa toda em bytes de canal.
 * @returns {{canais:number,quadros:number,dados:Uint8Array,stepTimeMs:number}}
 */
export function renderizarSequencia({
  rig = RIG_PADRAO, tracks = TRACKS, fps = FPS,
  t0 = 0, t1 = DURATION, master = 1, offset = 0,
} = {}) {
  const d = derive(rig);
  const stepTimeMs = Math.round(1000 / fps);
  if (stepTimeMs < 1 || stepTimeMs > 255)
    throw new Error(`fps ${fps} dá passo de ${stepTimeMs}ms, que não cabe no formato`);

  const quadros = Math.max(1, Math.round((t1 - t0) * fps));
  const canais = d.totalCh;
  const dados = new Uint8Array(canais * quadros);

  for (let i = 0; i < quadros; i++) {
    // O tempo do quadro vem da grade, nunca de acumular passo: somar
    // 1/40 seiscentas vezes acumula erro de ponto flutuante.
    const t = t0 + i / fps;
    const frame = renderFrame(d, t + offset, master, tracks);
    serializarFrame(d, frame, dados.subarray(i * canais, (i + 1) * canais));
  }
  return { canais, quadros, dados, stepTimeMs, derivado: d };
}

/**
 * Show inteiro num .fseq pronto pra gravar no SD.
 * @returns {Promise<Uint8Array>}
 */
export async function exportarFseq(opcoes = {}) {
  const { compressao = "zlib", midia, uniqueId, ...resto } = opcoes;
  const { canais, quadros, dados, stepTimeMs } = renderizarSequencia(resto);
  return escreverFseq({ canais, quadros, dados, stepTimeMs, compressao, midia, uniqueId });
}
