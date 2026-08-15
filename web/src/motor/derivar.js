/* ============================================================
   DERIVADOS DO CROQUI — canais e grupos saem da posição.
   Nada disso é armazenado: o croqui é a fonte da verdade.
   ============================================================ */

import { KIND, VH, bytesPorNode, footprint, nodesOf, profOf, chKey } from "../modelo/rig.js";
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
