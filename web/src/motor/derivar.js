/* ============================================================
   DERIVADOS DO CROQUI — canais e grupos saem da posição.
   Nada disso é armazenado: o croqui é a fonte da verdade.
   ============================================================ */

import {
  KIND, PROFILES, VH, bytesPorNode, footprint, nodesOf, ordemDeCor, profOf, chKey,
} from "../modelo/rig.js";
import { EFFECTS } from "../modelo/sequencia.js";

export function derive(rig) {
  const pix = rig.filter(i => KIND[i.k].pixel)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const heads = rig.filter(i => i.k === "head").sort((a, b) => a.x - b.x);

  const chan = {};
  let c = 1;
  pix.forEach(i => { chan[i.id] = c; c += nodesOf(i) * bytesPorNode(i); });
  heads.forEach(h => { chan[h.id] = c; c += footprint(h); });

  const mid = pix.length ? pix.reduce((s, i) => s + i.y, 0) / pix.length : VH / 2;
  const groups = [
    { id: "g-todas", label: "Todas as caixas", members: pix.map(i => i.id) },
    { id: "g-sup", label: "Caixa superior", members: pix.filter(i => i.y < mid).map(i => i.id) },
    { id: "g-inf", label: "Caixa inferior", members: pix.filter(i => i.y >= mid).map(i => i.id) },
    { id: "g-heads", label: "Todas as heads", members: heads.map(h => h.id) },
  ];
  const totalNodes = pix.reduce((s, i) => s + nodesOf(i), 0);
  return { pix, heads, chan, groups, totalNodes, totalCh: c - 1 };
}

/* ============================================================
   IMPRESSÃO DIGITAL DO CROQUI

   Um `.fseq` só faz sentido contra o croqui que o gerou: a numeração
   de canal foi cozida junto no render. Mover uma head, trocar o perfil
   de uma cabeça ou passar um farol de 1 pra 3 nodes envelhece todo
   arquivo já exportado — e o jeito como isso morde é feio, porque o
   arquivo não dá erro. Ele toca. Os bytes de pan caem no canal de gobo
   da cabeça seguinte e a luz enlouquece só naquela faixa.

   O carimbo vai no `.fseq` pra o player conseguir avisar em vez de
   tocar lixo.

   É a impressão do **mapa de canais**, não do croqui cru: o que entra
   é o que muda o significado de um byte. Arrastar um farol dois pixels
   sem mudar a ordem não invalida nada, e não deve invalidar mesmo.
   ============================================================ */

function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function impressaoDoRig(d) {
  const partes = [
    ...d.pix.map(i => `p:${i.id}:${nodesOf(i)}:${ordemDeCor(i)}`),
    ...d.heads.map(h => `h:${h.id}:${PROFILES[h.pf] ? h.pf : "mini-11"}`),
  ];
  return { ch: d.totalCh, fp: fnv1a(`${d.totalCh}|${partes.join("|")}`) };
}

// Capacidades de um alvo: fixture solta ou grupo inteiro.
export function capsOf(id, d, rig) {
  const grp = d.groups.find(g => g.id === id);
  const ids = grp ? grp.members : [id];
  const set = new Set();
  ids.forEach(i => {
    const it = rig.find(x => x.id === i); if (!it) return;
    if (KIND[it.k].pixel) set.add("rgb");
    else if (it.k === "head") profOf(it).ch.forEach(c => set.add(chKey(c)));
  });
  return set;
}

// Quantos membros do alvo realmente respondem a um efeito.
export function responders(fxKey, id, d, rig) {
  const grp = d.groups.find(g => g.id === id);
  const ids = grp ? grp.members : [id];
  const need = EFFECTS[fxKey].needs;
  const ok = ids.filter(i => { const c = capsOf(i, d, rig); return need.every(n => c.has(n)); });
  return { ok: ok.length, total: ids.length };
}
