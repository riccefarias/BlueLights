/* Gera .fseq de teste usando o ESCRITOR REAL do sequenciador — é isso
   que faz destes testes um teste de contrato, não de espelho. Dado
   determinístico: quadro q, canal c → (q*7 + c*13) & 0xFF. */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const { escreverFseq } = await import(
  join(aqui, "../../../web/src/motor/fseq.js"));

const CANAIS = 98, QUADROS = 4000;      // >64KB de bloco → vários blocos
const dados = new Uint8Array(CANAIS * QUADROS);
for (let q = 0; q < QUADROS; q++)
  for (let c = 0; c < CANAIS; c++)
    dados[q * CANAIS + c] = (q * 7 + c * 13) & 0xFF;

const base = {
  canais: CANAIS, quadros: QUADROS, dados, stepTimeMs: 25,
  uniqueId: 0x123456789ABCn,
  midia: "faixa07.mp3",
  rig: { ch: CANAIS, fp: "b961683a" },
};

const dir = join(aqui, "fixtures");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "demo-zlib.fseq"),
  await escreverFseq({ ...base, compressao: "zlib" }));
writeFileSync(join(dir, "demo-crua.fseq"),
  await escreverFseq({ ...base, compressao: "nenhuma" }));
console.log("fixtures ok");
