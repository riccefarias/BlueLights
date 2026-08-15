/* ============================================================
   CANAIS — o passe final: estado semântico vira bytes.

   É aqui, e só aqui, que existe número de canal. O efeito falou
   "tilt = 0.3"; o perfil da fixture diz em que byte isso cai e se
   tem canal fino junto. Trocar de cabeça mexe neste arquivo zero.
   ============================================================ */

import { GOBOS, chKey, nodesOf, ordemDeCor, profOf } from "../modelo/rig.js";

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const bipolar = v => clamp01((Math.max(-1, Math.min(1, v || 0)) + 1) / 2);

/* Extração de branco: o canal W só existe pra render o que os três
   coloridos fariam pior. Tira o cinza comum e devolve o resto. */
export function rgbw([r, g, b]) {
  const w = Math.min(r, g, b);
  return [r - w, g - w, b - w, w];
}

/* Gobo é índice de catálogo, não byte. Sem faixas rotuladas no perfil
   (ver docs/05-perfis-de-fixture.md), a divisão é uniforme e provisória:
   cada forma pega uma fatia igual de 0..255 e o valor cai no centro dela,
   que é o lugar mais tolerante a perfil impreciso. Quando o perfil
   carregar as faixas do manual, é esta função que passa a lê-las. */
export function goboParaByte(idx, total = GOBOS.length) {
  const i = Math.max(0, Math.min(total - 1, Math.round(idx)));
  return Math.min(255, Math.floor(((i + 0.5) / total) * 256));
}

/* Rotação de gobo: quase toda cabeça usa 0..127 como ângulo indexado e
   128..255 como velocidade contínua. O efeito anima o ângulo, então o
   destino é a metade indexada. */
export function grotParaByte(ang) {
  const v = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.round((v / (Math.PI * 2)) * 127);
}

/* Valor de uma capacidade em 0..1, antes de virar 8 ou 16 bits.
   Capacidade que o efeito não escreveu fica no repouso seguro. */
function valorUnitario(key, st, cor) {
  switch (key) {
    case "pan":  return bipolar(st.pan);
    case "tilt": return bipolar(st.tilt);
    case "dim":  return clamp01(st.dim);
    case "r":    return cor[0] / 255;
    case "g":    return cor[1] / 255;
    case "b":    return cor[2] / 255;
    case "w":    return cor[3] / 255;
    // Shutter aberto. Sem faixas no perfil isto é uma aposta documentada:
    // 255 = aberto é o mais comum, mas há cabeça em que 255 é strobo rápido.
    // Conferir na tabela DMX antes do primeiro show com cabeça nova.
    case "shut": return 1;
    case "color": return 0;                       // roda na posição aberta
    case "gobo": return goboParaByte(st.gobo || 0) / 255;
    case "grot": return grotParaByte(st.grot || 0) / 255;
    default:     return clamp01(st[key] ?? 0);    // prism, focus, fn, speed, fog, fan, pat, x, y
  }
}

/* Serializa um quadro no array de canais. 1 byte por canal, índice
   base-0 embora o croqui mostre canal base-1 — é a convenção do DMX
   e do fseq, e converter num lugar só evita erro de um. */
export function serializarFrame(d, frame, out) {
  const buf = out || new Uint8Array(d.totalCh);
  if (!out) buf.fill(0); else buf.fill(0, 0, d.totalCh);

  for (const it of d.pix) {
    const base = d.chan[it.id] - 1;
    const ordem = ordemDeCor(it);
    const cols = frame.pixels[it.id] || [];
    const n = nodesOf(it);
    for (let i = 0; i < n; i++) {
      const cor = rgbw(cols[i] || [0, 0, 0]);
      const off = base + i * ordem.length;
      for (let c = 0; c < ordem.length; c++) {
        const comp = { R: 0, G: 1, B: 2, W: 3 }[ordem[c]];
        // Sem canal branco na ordem, não se extrai branco nenhum:
        // o cinza fica onde estava, nos três coloridos.
        const v = ordem.includes("W") ? cor[comp] : (cols[i]?.[comp] ?? 0);
        buf[off + c] = Math.max(0, Math.min(255, Math.round(v)));
      }
    }
  }

  for (const h of d.heads) {
    const base = d.chan[h.id] - 1;
    const st = frame.heads[h.id];
    if (!st) continue;
    const cor = rgbw(st.rgb || [0, 0, 0]);
    const chs = profOf(h).ch;
    for (let j = 0; j < chs.length; j++) {
      const c = chs[j];
      const key = chKey(c);
      const temFino = chs[j + 1] === key + "+";
      const u = valorUnitario(key, st, cor);
      if (c.endsWith("+")) {
        buf[base + j] = Math.round(u * 65535) & 0xFF;          // byte fino
      } else if (temFino) {
        buf[base + j] = (Math.round(u * 65535) >> 8) & 0xFF;   // byte grosso do par 16 bits
      } else {
        buf[base + j] = Math.round(u * 255) & 0xFF;
      }
    }
  }
  return buf;
}
