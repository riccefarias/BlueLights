/* ============================================================
   FSEQ V2 — escrita e leitura.

   Formato aberto do FPP/xLights. Escrever nele é o que tira o
   sequenciador da tela e põe luz no carro, e de quebra deixa usar
   o xLights como validador: sequencia lá, exporta, compara aqui.

   Layout do cabeçalho (32 bytes), conferido contra
   FalconChristmas/fpp — src/fseq/FSEQFile.cpp:

     0..3   "PSEQ"
     4..5   u16  offset onde começa o dado de canal
     6      u8   versão menor
     7      u8   versão maior (2)
     8..9   u16  tamanho do cabeçalho: 32 + blocos*8 + esparsos*6
     10..13 u32  canais por quadro
     14..17 u32  número de quadros
     18     u8   passo em ms
     19     u8   flags (0)
     20     u8   (blocos >> 4 & 0xF0) | tipo de compressão
     21     u8   blocos & 0xFF
     22     u8   número de faixas esparsas
     23     u8   reservado (0)
     24..31 u64  id único
     -->    índice de blocos: blocos × (u32 primeiro quadro, u32 bytes)
     -->    faixas esparsas: esparsos × (u24 canal inicial, u24 tamanho)
     -->    cabeçalhos variáveis: u16 tamanho (com estes 4 bytes), 2 bytes de
            código, dado. "mf" é o nome do arquivo de mídia
     -->    dado de canal, alinhado em múltiplo de 4
   ============================================================ */

export const COMPRESSAO = { nenhuma: 0, zstd: 1, zlib: 2 };
const NOME_COMPRESSAO = ["nenhuma", "zstd", "zlib"];

const CABECALHO = 32;
const BLOCO_INDICE = 8;
const FAIXA_ESPARSA = 6;
const VAR_CABECALHO = 4;

/* Alvo de 64KB descomprimidos por bloco, o mesmo do FPP. Bloco é a
   unidade de leitura do player: menor que isso desperdiça índice,
   maior faz o ESP segurar RAM à toa e aumenta o custo de um seek. */
const BLOCO_ALVO = 64 * 1024;
const MAX_BLOCOS = 255;

/* Carimbo do croqui: `versão;canais;impressão`. Código de duas letras
   nosso, no espaço de cabeçalho variável do próprio formato. */
export const CODIGO_RIG = "bl";
const VERSAO_RIG = 1;

const arredonda4 = v => (v + 3) & ~3;

/* zlib pelo padrão da plataforma: CompressionStream existe no browser
   e no Node 18+. "deflate" aqui é RFC1950 (com cabeçalho zlib), que é
   exatamente o que o deflateInit() do FPP produz e espera. */
async function zlibComprime(u8) {
  const s = new Blob([u8]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

async function zlibDescomprime(u8) {
  const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/* Quantos quadros cabem num bloco, respeitando o teto de blocos que
   o cabeçalho consegue endereçar. */
export function quadrosPorBloco(canais, quadros) {
  let porBloco = Math.max(2, Math.floor(BLOCO_ALVO / Math.max(1, canais)));
  porBloco = Math.min(porBloco, Math.max(2, quadros));
  while (Math.ceil(quadros / porBloco) > MAX_BLOCOS) porBloco++;
  return porBloco;
}

/**
 * Monta o arquivo .fseq inteiro na memória.
 *
 * @param {object} o
 * @param {number} o.canais       canais por quadro
 * @param {number} o.quadros      número de quadros
 * @param {Uint8Array} o.dados    quadros × canais bytes, quadro a quadro
 * @param {number} [o.stepTimeMs] passo entre quadros (25 = 40fps)
 * @param {"nenhuma"|"zlib"} [o.compressao]
 * @param {bigint} [o.uniqueId]   id do arquivo; padrão é o relógio
 * @param {string} [o.midia]      nome do arquivo de áudio ("mf")
 * @param {{ch:number,fp:string}} [o.rig] carimbo do croqui ("bl")
 * @returns {Promise<Uint8Array>}
 */
export async function escreverFseq({
  canais, quadros, dados, stepTimeMs = 25,
  compressao = "zlib", uniqueId, midia, rig,
}) {
  if (!Number.isInteger(canais) || canais <= 0) throw new Error("canais inválido");
  if (!Number.isInteger(quadros) || quadros <= 0) throw new Error("quadros inválido");
  if (dados.length !== canais * quadros)
    throw new Error(`dados tem ${dados.length} bytes, esperado ${canais * quadros}`);
  if (stepTimeMs < 1 || stepTimeMs > 255) throw new Error("stepTimeMs cabe em 1 byte");

  const tipo = COMPRESSAO[compressao];
  if (tipo === undefined) throw new Error(`compressão desconhecida: ${compressao}`);
  if (tipo === COMPRESSAO.zstd) throw new Error("zstd ainda não implementado — ver ADR 0008");

  // 1. Corta em blocos e comprime. Feito antes do cabeçalho porque só
  //    depois de comprimir se sabe o tamanho do índice.
  const blocos = [];
  if (tipo === COMPRESSAO.nenhuma) {
    blocos.push({ quadro: 0, bytes: dados });
  } else {
    const porBloco = quadrosPorBloco(canais, quadros);
    for (let q = 0; q < quadros; q += porBloco) {
      const fim = Math.min(quadros, q + porBloco);
      const cru = dados.subarray(q * canais, fim * canais);
      blocos.push({ quadro: q, bytes: await zlibComprime(cru) });
    }
  }

  // Sem compressão o índice não existe: o dado é um bloco contínuo.
  const nBlocos = tipo === COMPRESSAO.nenhuma ? 0 : blocos.length;

  // 2. Cabeçalhos variáveis.
  const vars = [];
  const texto = s => {
    const b = new TextEncoder().encode(s);
    const dado = new Uint8Array(b.length + 1);      // terminado em NUL
    dado.set(b);
    return dado;
  };
  if (midia) vars.push({ codigo: "mf", dado: texto(midia) });
  /* "bl" é código nosso. O FPP e o xLights ignoram código que não
     conhecem — só logam e seguem —, então isto não quebra compatibilidade. */
  if (rig) vars.push({ codigo: CODIGO_RIG, dado: texto(`${VERSAO_RIG};${rig.ch};${rig.fp}`) });
  const varBytes = vars.reduce((s, v) => s + VAR_CABECALHO + v.dado.length, 0);

  const tamCabecalho = CABECALHO + nBlocos * BLOCO_INDICE + 0 * FAIXA_ESPARSA;
  const offsetDados = arredonda4(tamCabecalho + varBytes);
  if (offsetDados > 0xFFFF) throw new Error("cabeçalho não cabe em 16 bits");

  const corpo = blocos.reduce((s, b) => s + b.bytes.length, 0);
  const saida = new Uint8Array(offsetDados + corpo);
  const dv = new DataView(saida.buffer);

  // 3. Cabeçalho fixo.
  saida.set([0x50, 0x53, 0x45, 0x51], 0);          // "PSEQ"
  dv.setUint16(4, offsetDados, true);
  saida[6] = 0;                                     // versão menor
  saida[7] = 2;                                     // versão maior
  dv.setUint16(8, tamCabecalho, true);
  dv.setUint32(10, canais, true);
  dv.setUint32(14, quadros, true);
  saida[18] = stepTimeMs;
  saida[19] = 0;
  saida[20] = ((nBlocos >> 4) & 0xF0) | tipo;
  saida[21] = nBlocos & 0xFF;
  saida[22] = 0;                                    // sem faixas esparsas
  saida[23] = 0;
  dv.setBigUint64(24, uniqueId ?? BigInt(Date.now()) * 1000n, true);

  // 4. Índice de blocos.
  let p = CABECALHO;
  for (let i = 0; i < nBlocos; i++) {
    dv.setUint32(p, blocos[i].quadro, true);
    dv.setUint32(p + 4, blocos[i].bytes.length, true);
    p += BLOCO_INDICE;
  }

  // 5. Cabeçalhos variáveis. O tamanho declarado inclui os 4 bytes
  //    de tamanho e código — é a convenção do escritor do FPP.
  for (const v of vars) {
    dv.setUint16(p, VAR_CABECALHO + v.dado.length, true);
    saida[p + 2] = v.codigo.charCodeAt(0);
    saida[p + 3] = v.codigo.charCodeAt(1);
    saida.set(v.dado, p + 4);
    p += VAR_CABECALHO + v.dado.length;
  }

  // 6. Dado de canal.
  p = offsetDados;
  for (const b of blocos) { saida.set(b.bytes, p); p += b.bytes.length; }
  return saida;
}

/**
 * Lê um .fseq V2. Serve de teste do escritor e de porta de entrada
 * pra arquivo vindo do xLights.
 * @returns {Promise<{canais:number,quadros:number,stepTimeMs:number,
 *   compressao:string,uniqueId:bigint,midia:string|null,dados:Uint8Array}>}
 */
export async function lerFseq(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length < CABECALHO) throw new Error("arquivo curto demais pra ser fseq");
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== "PSEQ")
    throw new Error("não é um arquivo fseq");
  if (u8[7] !== 2) throw new Error(`versão ${u8[7]} não suportada, só a V2`);

  const offsetDados = dv.getUint16(4, true);
  const canais = dv.getUint32(10, true);
  const quadros = dv.getUint32(14, true);
  const stepTimeMs = u8[18];
  const tipo = u8[20] & 0x0F;
  const nBlocos = (((u8[20] & 0xF0) << 4) | u8[21]) >>> 0;
  const nEsparsas = u8[22];
  const uniqueId = dv.getBigUint64(24, true);
  if (tipo === COMPRESSAO.zstd) throw new Error("zstd ainda não implementado — ver ADR 0008");

  let p = CABECALHO;
  const indice = [];
  for (let i = 0; i < nBlocos; i++) {
    const quadro = dv.getUint32(p, true);
    const tam = dv.getUint32(p + 4, true);
    if (tam > 0) indice.push({ quadro, tam });
    p += BLOCO_INDICE;
  }
  p += nEsparsas * FAIXA_ESPARSA;

  let midia = null, rig = null;
  while (p + VAR_CABECALHO <= offsetDados) {
    const tam = dv.getUint16(p, true);
    if (tam < VAR_CABECALHO || p + tam > offsetDados) break;
    const codigo = String.fromCharCode(u8[p + 2], u8[p + 3]);
    const txt = new TextDecoder().decode(u8.subarray(p + 4, p + tam)).replace(/\0+$/, "");
    if (codigo === "mf") midia = txt;
    if (codigo === CODIGO_RIG) {
      const [v, ch, fp] = txt.split(";");
      // Carimbo de versão futura: melhor ignorar do que fingir que entendeu
      // e reprovar um arquivo bom.
      if (Number(v) === VERSAO_RIG && fp) rig = { ch: Number(ch), fp };
    }
    p += tam;
  }

  let dados;
  if (tipo === COMPRESSAO.nenhuma) {
    dados = u8.subarray(offsetDados, offsetDados + canais * quadros);
  } else {
    const partes = [];
    let off = offsetDados;
    for (const b of indice) {
      partes.push(await zlibDescomprime(u8.subarray(off, off + b.tam)));
      off += b.tam;
    }
    dados = new Uint8Array(partes.reduce((s, x) => s + x.length, 0));
    let q = 0;
    for (const parte of partes) { dados.set(parte, q); q += parte.length; }
  }
  if (dados.length !== canais * quadros)
    throw new Error(`dado tem ${dados.length} bytes, cabeçalho promete ${canais * quadros}`);

  return { canais, quadros, stepTimeMs, compressao: NOME_COMPRESSAO[tipo],
           uniqueId, midia, rig, dados };
}

/**
 * O arquivo foi renderizado pra este croqui? Avisar é o ponto: tocar um
 * fseq velho não dá erro nenhum, só manda pan pro canal de gobo.
 * @param {{rig:object|null,canais:number}} seq  saída de lerFseq
 * @param {{ch:number,fp:string}} atual          saída de impressaoDoRig
 */
export function conferirRig(seq, atual) {
  if (!seq.rig)
    return { ok: true, aviso: "arquivo sem carimbo de croqui — não dá pra conferir" };
  if (seq.rig.ch !== atual.ch)
    return { ok: false, aviso:
      `arquivo tem ${seq.rig.ch} canais, o croqui de agora tem ${atual.ch}` };
  if (seq.rig.fp !== atual.fp)
    return { ok: false, aviso:
      "mesmo número de canais, mas o croqui mudou — reexporte antes de usar" };
  return { ok: true, aviso: null };
}

/** Um quadro específico, já fatiado. Conveniência pra teste e inspeção. */
export function quadroDe(seq, i) {
  return seq.dados.subarray(i * seq.canais, (i + 1) * seq.canais);
}
