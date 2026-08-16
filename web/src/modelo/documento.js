/* ============================================================
   DOCUMENTO — o que se salva e o que se carrega.

   Tudo JSON serializável de propósito: salvar é stringify, e o
   arquivo dá pra abrir no editor, versionar no git e mandar por
   WhatsApp sem virar binário opaco.

   O campo `v` existe desde a primeira versão. Sem ele, o dia que o
   formato mudar não tem como migrar o que já está salvo — e não dá
   pra pedir pro usuário "salvar de novo" um arquivo que ele já não
   consegue abrir.
   ============================================================ */

import { KIND, RIG_PADRAO } from "./rig.js";
import { TRACKS } from "./sequencia.js";

export const VERSAO = 1;
export const TIPO = "bluelights";
export const EXTENSAO = ".blz.json";

/* Rig e sequência moram no mesmo arquivo enquanto houver um carro só.
   Quando der pra editar clip e existirem doze faixas contra o mesmo
   croqui, isto vira dois documentos — e aí é migração de v1 pra v2,
   que é exatamente pra isso que o campo de versão está aqui. */
export function serializarDocumento({ rig, sequencia = TRACKS, midia = null }) {
  return {
    tipo: TIPO,
    v: VERSAO,
    rig,
    sequencia,
    midia,
  };
}

export function paraJson(doc, { identado = true } = {}) {
  return JSON.stringify(doc, null, identado ? 2 : 0);
}

class ErroDeDocumento extends Error {}

function exige(cond, msg) { if (!cond) throw new ErroDeDocumento(msg); }

/* Valida antes de aplicar. Documento estranho tem que ser recusado
   inteiro: aplicar metade deixa o app num estado que o usuário não
   sabe desfazer nem de onde veio. */
function validarRig(rig) {
  exige(Array.isArray(rig), "documento sem lista de equipamentos");
  exige(rig.length > 0, "croqui vazio");
  const ids = new Set();
  for (const it of rig) {
    exige(it && typeof it === "object", "equipamento inválido no croqui");
    exige(typeof it.id === "string" && it.id, "equipamento sem id");
    exige(!ids.has(it.id), `id repetido no croqui: ${it.id}`);
    ids.add(it.id);
    exige(KIND[it.k] !== undefined,
      `tipo de equipamento desconhecido: ${JSON.stringify(it.k)} (em ${it.id})`);
    exige(Number.isFinite(it.x) && Number.isFinite(it.y),
      `equipamento sem posição no palco: ${it.id}`);
  }
  return rig;
}

function validarSequencia(seq) {
  exige(Array.isArray(seq), "documento sem trilhas");
  for (const tr of seq) {
    exige(tr && typeof tr.target === "string", "trilha sem alvo");
    exige(Array.isArray(tr.clips), `trilha ${tr.target} sem clips`);
    for (const c of tr.clips) {
      exige(typeof c.fx === "string", `clip sem efeito em ${tr.target}`);
      exige(Number.isFinite(c.t0) && Number.isFinite(c.t1) && c.t1 > c.t0,
        `clip com tempo inválido em ${tr.target}`);
    }
  }
  return seq;
}

/* Migração acumulativa: cada passo sobe uma versão. Documento de v1
   passa por todos os degraus até o formato de hoje. */
function migrar(doc) {
  // if (doc.v === 1) { ...vira v2...; doc.v = 2 }
  return doc;
}

/**
 * Lê um documento, valida e devolve o estado pronto pra aplicar.
 * Lança com mensagem em português — a mensagem vai pra tela.
 */
export function desserializarDocumento(entrada) {
  let doc = entrada;
  if (typeof doc === "string") {
    try { doc = JSON.parse(doc); }
    catch { throw new ErroDeDocumento("arquivo não é JSON válido"); }
  }
  exige(doc && typeof doc === "object", "arquivo vazio");
  exige(doc.tipo === TIPO,
    `arquivo não é do BlueLights${doc.tipo ? ` (diz ser "${doc.tipo}")` : ""}`);
  exige(Number.isInteger(doc.v) && doc.v >= 1, "arquivo sem versão");
  exige(doc.v <= VERSAO,
    `arquivo é da versão ${doc.v} e este sequenciador entende até a ${VERSAO}`);

  doc = migrar({ ...doc });
  return {
    rig: validarRig(doc.rig),
    sequencia: validarSequencia(doc.sequencia ?? TRACKS),
    midia: typeof doc.midia === "string" ? doc.midia : null,
  };
}

/** Documento novo, do zero. */
export function documentoPadrao() {
  return serializarDocumento({ rig: RIG_PADRAO, sequencia: TRACKS });
}
