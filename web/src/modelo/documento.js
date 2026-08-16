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
import { TRACKS, gradePadrao } from "./sequencia.js";
import { gradeDeDoc, gradeParaDoc } from "./grade.js";

export const VERSAO = 1;
export const TIPO = "bluelights";
export const EXTENSAO = ".blz.json";

/* Rig e sequência moram no mesmo arquivo enquanto houver um carro só.
   Quando der pra editar clip e existirem doze faixas contra o mesmo
   croqui, isto vira dois documentos — e aí é migração de v1 pra v2,
   que é exatamente pra isso que o campo de versão está aqui. */
export function serializarDocumento({ rig, sequencia = TRACKS, midia = null, grade }) {
  return {
    tipo: TIPO,
    v: VERSAO,
    rig,
    sequencia,
    midia,
    /* A grade entra inteira, com o mapa de batidas. São ~500 números numa
       faixa de 4 minutos — o preço de nunca mais ter que reanalisar o
       áudio, e de o rubato ajustado à mão sobreviver ao arquivo. */
    grade: gradeParaDoc(grade || gradePadrao()),
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

/* Valida e completa o que a edição precisa. Ids de trilha e de clip são
   como a UI e o histórico identificam as coisas — arquivo salvo sem eles
   (ou escrito à mão) entra completado em vez de quebrar. */
function validarSequencia(seq) {
  exige(Array.isArray(seq), "documento sem trilhas");
  const idsTr = new Set(), idsC = new Set();
  let nTr = 0, nC = 0;
  const livre = (usados, prefixo, n) => {
    let id;
    do { id = `${prefixo}${++n}`; } while (usados.has(id));
    usados.add(id);
    return { id, n };
  };

  for (const tr of seq) {
    exige(tr && typeof tr.target === "string", "trilha sem alvo");
    exige(Array.isArray(tr.clips), `trilha ${tr.target} sem clips`);
    if (typeof tr.id === "string" && tr.id && !idsTr.has(tr.id)) idsTr.add(tr.id);
    for (const c of tr.clips) {
      exige(typeof c.fx === "string", `clip sem efeito em ${tr.target}`);
      exige(Number.isFinite(c.t0) && Number.isFinite(c.t1) && c.t1 > c.t0,
        `clip com tempo inválido em ${tr.target}`);
      if (typeof c.id === "string" && c.id && !idsC.has(c.id)) idsC.add(c.id);
    }
  }

  return seq.map(tr => {
    let idTr = tr.id;
    if (typeof idTr !== "string" || !idTr) ({ id: idTr, n: nTr } = livre(idsTr, "t", nTr));
    return {
      ...tr,
      id: idTr,
      clips: tr.clips.map(c => {
        let idC = c.id;
        if (typeof idC !== "string" || !idC) ({ id: idC, n: nC } = livre(idsC, "c", nC));
        /* Curvas entram saneadas: keyframe sem número vira curva descartada,
           não documento recusado — o clip continua valendo pelo `p`. */
        const { kf: kfCru, ...cBase } = c;
        let kf = null;
        if (kfCru && typeof kfCru === "object") {
          kf = {};
          for (const [k, arr] of Object.entries(kfCru))
            if (Array.isArray(arr) && arr.length >= 2 &&
                arr.every(pt => pt && Number.isFinite(pt.u) && Number.isFinite(pt.v)))
              kf[k] = arr.map(pt => ({ u: pt.u, v: pt.v }));
          if (!Object.keys(kf).length) kf = null;
        }
        return { ...cBase, id: idC, p: c.p && typeof c.p === "object" ? c.p : {},
                 ...(kf ? { kf } : {}) };
      }),
    };
  });
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
    // documento antigo não tinha grade: cai numa fixa em vez de quebrar
    grade: gradeDeDoc(doc.grade),
  };
}

/** Documento novo, do zero. */
export function documentoPadrao() {
  return serializarDocumento({ rig: RIG_PADRAO, sequencia: TRACKS });
}
