/* ============================================================
   VALUE CURVES — A→B por parâmetro, dentro do clip.

   O clip guarda keyframes normalizados: `kf[param] = [{u, v}, ...]`,
   com `u` em 0..1 do começo ao fim do clip. Normalizado de propósito:
   mover ou redimensionar o clip não invalida curva nenhuma — a rampa
   estica junto.

   O motor resolve o valor no instante e entrega um `p` plano pro
   efeito. Nenhum efeito sabe que curva existe — mesma regra do canal
   e do segundo: efeito fala em batida e em capacidade, o resto é
   problema de quem chama.

   A interpolação respeita o tipo do parâmetro (PARAM_META.interp):
   - linear   número comum (é o padrão, quem não declara cai aqui)
   - circular matiz — anda pelo arco mais curto, 0.95→0.05 cruza o 0
              em vez de dar a volta inteira pelo espectro
   - passo    índice/divisor — segura o valor até o próximo keyframe,
              porque "divisão 2.37" não é ritmo nenhum
   ============================================================ */

import { PARAM_META } from "../modelo/sequencia.js";

export function interpolar(kfs, u, interp = "linear") {
  if (!kfs || !kfs.length) return 0;
  if (u <= kfs[0].u) return kfs[0].v;
  const ultimo = kfs[kfs.length - 1];
  if (u >= ultimo.u) return ultimo.v;
  // `<=`: keyframe exato vale o valor dele — importa no passo, onde a
  // batida da troca é exatamente o ponto que a pessoa marcou.
  let i = 1;
  while (kfs[i].u <= u) i++;
  const a = kfs[i - 1], b = kfs[i];
  if (interp === "passo") return a.v;
  const f = (u - a.u) / (b.u - a.u || 1);
  if (interp === "circular") {
    const d = ((((b.v - a.v) % 1) + 1.5) % 1) - .5;   // arco mais curto
    const r = a.v + d * f;
    return r - Math.floor(r);                          // só dobra se saiu de 0..1
  }
  return a.v + (b.v - a.v) * f;
}

/** `p` efetivo do clip no tempo global `t`. Sem curva, é o próprio clip.p. */
export function resolverP(clip, t) {
  const kf = clip.kf;
  if (!kf) return clip.p;
  const u = Math.max(0, Math.min(1, (t - clip.t0) / (clip.t1 - clip.t0 || 1)));
  const p = { ...clip.p };
  for (const k in kf)
    if (kf[k] && kf[k].length) p[k] = interpolar(kf[k], u, PARAM_META[k]?.interp);
  return p;
}
