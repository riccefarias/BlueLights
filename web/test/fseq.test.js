import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";

import { conferirRig, escreverFseq, lerFseq, quadroDe, quadrosPorBloco } from "../src/motor/fseq.js";
import { exportarFseq, renderizarSequencia } from "../src/motor/exportar.js";
import { derive, impressaoDoRig } from "../src/motor/derivar.js";
import { RIG_PADRAO } from "../src/modelo/rig.js";
import { DURATION, FPS } from "../src/modelo/sequencia.js";

const ID = 0x0123456789ABCDEFn;

/* Padrão barulhento de propósito: dado repetitivo demais esconde erro
   de offset porque qualquer fatia errada parece certa. */
function padrao(canais, quadros) {
  const d = new Uint8Array(canais * quadros);
  for (let q = 0; q < quadros; q++)
    for (let c = 0; c < canais; c++)
      d[q * canais + c] = (q * 7 + c * 31 + ((q * c) & 0x1F)) & 0xFF;
  return d;
}

test("cabeçalho V2 tem os campos nos offsets do FPP", async () => {
  const canais = 98, quadros = 40;
  const f = await escreverFseq({ canais, quadros, dados: padrao(canais, quadros),
    stepTimeMs: 25, compressao: "nenhuma", uniqueId: ID });
  const dv = new DataView(f.buffer);

  assert.equal(String.fromCharCode(...f.subarray(0, 4)), "PSEQ");
  assert.equal(f[6], 0, "versão menor");
  assert.equal(f[7], 2, "versão maior");
  assert.equal(dv.getUint16(8, true), 32, "sem blocos o cabeçalho é só o fixo");
  assert.equal(dv.getUint32(10, true), canais);
  assert.equal(dv.getUint32(14, true), quadros);
  assert.equal(f[18], 25);
  assert.equal(f[20] & 0x0F, 0, "compressão nenhuma");
  assert.equal(f[22], 0, "sem faixas esparsas");
  assert.equal(dv.getBigUint64(24, true), ID);

  const offset = dv.getUint16(4, true);
  assert.equal(offset % 4, 0, "dado alinhado em múltiplo de 4");
  assert.equal(f.length, offset + canais * quadros);
});

test("compressão zlib marca o tipo e preenche o índice de blocos", async () => {
  const canais = 300, quadros = 900;
  const f = await escreverFseq({ canais, quadros, dados: padrao(canais, quadros),
    compressao: "zlib", uniqueId: ID });
  const dv = new DataView(f.buffer);

  assert.equal(f[20] & 0x0F, 2, "tipo zlib");
  const nBlocos = ((f[20] & 0xF0) << 4) | f[21];
  assert.ok(nBlocos > 1, `esperava vários blocos, veio ${nBlocos}`);
  assert.equal(dv.getUint16(8, true), 32 + nBlocos * 8);

  // índice em ordem, quadro inicial batendo com o tamanho de bloco
  const porBloco = quadrosPorBloco(canais, quadros);
  for (let i = 0; i < nBlocos; i++) {
    assert.equal(dv.getUint32(32 + i * 8, true), i * porBloco);
    assert.ok(dv.getUint32(32 + i * 8 + 4, true) > 0, "bloco vazio no índice");
  }
});

test("bloco zlib é RFC1950, que é o que o deflateInit() do FPP espera", async () => {
  // Cross-check por fora do nosso próprio leitor: quem descomprime aqui é o
  // zlib do Node, não o DecompressionStream que escreveu. Se o bloco saísse
  // como deflate cru (RFC1951), isto quebraria — e o FPP também.
  const canais = 64, quadros = 50;
  const dados = padrao(canais, quadros);
  const f = await escreverFseq({ canais, quadros, dados, compressao: "zlib", uniqueId: ID });
  const dv = new DataView(f.buffer);
  const offset = dv.getUint16(4, true);
  const nBlocos = ((f[20] & 0xF0) << 4) | f[21];
  assert.equal(nBlocos, 1, "50 quadros de 64 canais cabem num bloco só");

  const tam = dv.getUint32(32 + 4, true);
  const cru = inflateSync(Buffer.from(f.subarray(offset, offset + tam)));
  assert.deepEqual([...cru], [...dados]);
});

test("ida e volta preserva byte a byte, comprimido ou não", async () => {
  for (const compressao of ["nenhuma", "zlib"]) {
    const canais = 98, quadros = 137;              // primo, pra não fechar bloco redondo
    const dados = padrao(canais, quadros);
    const f = await escreverFseq({ canais, quadros, dados, compressao, uniqueId: ID,
      midia: "faixa07.mp3" });
    const seq = await lerFseq(f);

    assert.equal(seq.canais, canais);
    assert.equal(seq.quadros, quadros);
    assert.equal(seq.stepTimeMs, 25);
    assert.equal(seq.compressao, compressao);
    assert.equal(seq.uniqueId, ID);
    assert.equal(seq.midia, "faixa07.mp3", "nome da mídia sobrevive sem o NUL");
    assert.deepEqual([...seq.dados], [...dados], `dado divergiu com ${compressao}`);
    assert.deepEqual([...quadroDe(seq, 0)], [...dados.subarray(0, canais)]);
    assert.deepEqual([...quadroDe(seq, quadros - 1)],
      [...dados.subarray((quadros - 1) * canais)]);
  }
});

test("luz é repetitiva: zlib tem que encolher de verdade", async () => {
  const { canais, quadros, dados, stepTimeMs } = renderizarSequencia();
  const cru = await escreverFseq({ canais, quadros, dados, stepTimeMs, compressao: "nenhuma", uniqueId: ID });
  const zip = await escreverFseq({ canais, quadros, dados, stepTimeMs, compressao: "zlib", uniqueId: ID });
  const razao = cru.length / zip.length;
  assert.ok(razao > 3, `esperava compressão folgada, veio ${razao.toFixed(1)}×`);
});

test("o show padrão exporta com a duração e a taxa certas", async () => {
  const f = await exportarFseq({ midia: "faixa07.mp3" });
  const seq = await lerFseq(f);
  assert.equal(seq.canais, 98);
  assert.equal(seq.quadros, Math.round(DURATION * FPS));
  assert.equal(seq.stepTimeMs, 25, "40fps = 25ms de passo");
  assert.equal(seq.quadros * seq.stepTimeMs, Math.round(DURATION * 1000));
});

test("o quadro exportado é o mesmo que o preview desenha", async () => {
  // Mesma fonte de verdade dos dois lados: se divergir, o bug é do motor.
  const { canais, dados } = renderizarSequencia();
  const f = await exportarFseq();
  const seq = await lerFseq(f);
  for (const i of [0, 1, 137, 400, seq.quadros - 1]) {
    assert.deepEqual([...quadroDe(seq, i)],
      [...dados.subarray(i * canais, (i + 1) * canais)], `quadro ${i} divergiu`);
  }
});

/* Carimbo do croqui: tocar um fseq velho não dá erro, só manda pan
   pro canal de gobo. O aviso tem que vir do arquivo. */

test("o fseq exportado carrega o carimbo do croqui", async () => {
  const seq = await lerFseq(await exportarFseq());
  const atual = impressaoDoRig(derive(RIG_PADRAO));
  assert.equal(seq.rig.ch, 98);
  assert.equal(seq.rig.fp, atual.fp);
  assert.deepEqual(conferirRig(seq, atual), { ok: true, aviso: null });
});

test("mudança que desloca canal reprova o arquivo antigo", async () => {
  const seq = await lerFseq(await exportarFseq());

  // trocar a wash central por uma beam muda footprint e desloca a head seguinte
  const outroPerfil = RIG_PADRAO.map(i => i.id === "h2" ? { ...i, pf: "beam-16" } : i);
  const r1 = conferirRig(seq, impressaoDoRig(derive(outroPerfil)));
  assert.equal(r1.ok, false);
  assert.match(r1.aviso, /98 canais.*102/);

  // farol de 3 pra 1 node: mesmo tipo de estrago, sem trocar equipamento
  const menosNodes = RIG_PADRAO.map(i => i.id === "f1" ? { ...i, n: 1 } : i);
  assert.equal(conferirRig(seq, impressaoDoRig(derive(menosNodes))).ok, false);

  // reordenar no croqui mantém o total de canais mas troca o significado
  const trocado = RIG_PADRAO.map(i => i.id === "h1" ? { ...i, x: 900 } : i);
  const r2 = conferirRig(seq, impressaoDoRig(derive(trocado)));
  assert.equal(r2.ok, false);
  assert.match(r2.aviso, /croqui mudou/);
});

test("mexer no croqui sem deslocar canal não invalida nada", async () => {
  const seq = await lerFseq(await exportarFseq());
  // arrastar dois pixels e renomear não muda o significado de byte nenhum
  const nudge = RIG_PADRAO.map(i =>
    i.id === "f2" ? { ...i, x: i.x + 2, lb: "outro nome" } : i);
  assert.deepEqual(conferirRig(seq, impressaoDoRig(derive(nudge))), { ok: true, aviso: null });
});

test("arquivo sem carimbo passa com aviso, não com reprovação", async () => {
  const { canais, quadros, dados, stepTimeMs } = renderizarSequencia();
  const seq = await lerFseq(await escreverFseq({ canais, quadros, dados, stepTimeMs,
    uniqueId: ID }));                                   // sem `rig`
  assert.equal(seq.rig, null);
  const r = conferirRig(seq, impressaoDoRig(derive(RIG_PADRAO)));
  assert.equal(r.ok, true);
  assert.match(r.aviso, /sem carimbo/);
});

test("o carimbo convive com o nome da mídia no mesmo arquivo", async () => {
  const seq = await lerFseq(await exportarFseq({ midia: "faixa07.mp3" }));
  assert.equal(seq.midia, "faixa07.mp3");
  assert.equal(seq.rig.fp, impressaoDoRig(derive(RIG_PADRAO)).fp);
});

test("o exportador recusa o que não cabe no formato", async () => {
  await assert.rejects(() => escreverFseq({ canais: 10, quadros: 2,
    dados: new Uint8Array(19), compressao: "nenhuma" }), /esperado 20/);
  await assert.rejects(() => escreverFseq({ canais: 10, quadros: 2,
    dados: new Uint8Array(20), stepTimeMs: 300 }), /1 byte/);
  await assert.rejects(() => escreverFseq({ canais: 10, quadros: 2,
    dados: new Uint8Array(20), compressao: "zstd" }), /zstd/);
  await assert.rejects(() => lerFseq(new Uint8Array(64)), /não é um arquivo fseq/);
});
