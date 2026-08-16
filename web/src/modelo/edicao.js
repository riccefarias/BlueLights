import { EFFECTS } from "./sequencia.js";

/** Subdivisão de encaixe: semicolcheia. Fina pra síncope, grossa pra
    não precisar de mira no celular. */
export const DIV_ENCAIXE = 4;

/* Duração mínima e duração de bloco novo saem da batida LOCAL, não de uma
   constante: num trecho que acelera, "quatro batidas" é menos segundo, e é
   isso que a pessoa quer dizer. */
const durMin = (grade, t) => grade.duracaoDaBatida(t) / DIV_ENCAIXE;
const durNova = (grade, t) => grade.tempoDe(grade.indiceEm(t) + 4) - t;

export const encaixa = (t, grade, div = DIV_ENCAIXE) =>
  Math.max(0, Math.min(grade.duracao, grade.encaixar(t, div)));

const limita = (v, min, max) => Math.max(min, Math.min(max, v));

/* Vizinhos na mesma trilha. Clip sobreposto não dá erro no motor —
   `clips.find` simplesmente pega o primeiro e o outro some sem
   explicação. Melhor não deixar acontecer. */
function vizinhos(clips, id) {
  const ord = [...clips].sort((a, b) => a.t0 - b.t0);
  const i = ord.findIndex(c => c.id === id);
  return { antes: ord[i - 1] || null, depois: ord[i + 1] || null, clip: ord[i] };
}

function comTrilha(tracks, ti, fn) {
  if (!tracks[ti]) return tracks;
  const nova = fn(tracks[ti]);
  if (nova === tracks[ti]) return tracks;
  return tracks.map((tr, i) => i === ti ? nova : tr);
}

function comClips(tr, clips) { return { ...tr, clips }; }

/** Próximo id de clip livre, olhando todas as trilhas. */
export function proximoId(tracks) {
  let max = 0;
  for (const tr of tracks)
    for (const c of tr.clips) {
      const n = parseInt(String(c.id).replace(/^\D+/, ""), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  return `c${max + 1}`;
}

/** Move preservando a duração, sem invadir vizinho. */
export function moverClip(tracks, ti, id, t0Alvo, grade) {
  return comTrilha(tracks, ti, tr => {
    const { antes, depois, clip } = vizinhos(tr.clips, id);
    if (!clip) return tr;
    const dur = clip.t1 - clip.t0;
    const min = antes ? antes.t1 : 0;
    const max = (depois ? depois.t0 : grade.duracao) - dur;
    if (max < min) return tr;                       // sem folga, não mexe
    const t0 = limita(encaixa(t0Alvo, grade), min, max);
    if (t0 === clip.t0) return tr;
    return comClips(tr, tr.clips.map(c =>
      c.id === id ? { ...c, t0, t1: t0 + dur } : c));
  });
}

/** Arrasta uma borda. `borda` é "ini" ou "fim". */
export function redimensionarClip(tracks, ti, id, borda, tAlvo, grade) {
  return comTrilha(tracks, ti, tr => {
    const { antes, depois, clip } = vizinhos(tr.clips, id);
    if (!clip) return tr;
    let t0 = clip.t0, t1 = clip.t1;
    if (borda === "ini") {
      t0 = limita(encaixa(tAlvo, grade), antes ? antes.t1 : 0, t1 - durMin(grade, t1));
    } else {
      t1 = limita(encaixa(tAlvo, grade), t0 + durMin(grade, t0),
                  depois ? depois.t0 : grade.duracao);
    }
    if (t0 === clip.t0 && t1 === clip.t1) return tr;
    return comClips(tr, tr.clips.map(c => c.id === id ? { ...c, t0, t1 } : c));
  });
}

/** Espaço livre que contém `t` na trilha. Devolve null se não couber clip. */
export function folgaEm(tr, t, grade) {
  const ord = [...tr.clips].sort((a, b) => a.t0 - b.t0);
  if (ord.some(c => t >= c.t0 && t < c.t1)) return null;   // em cima de um clip
  let ini = 0, fim = grade.duracao;
  for (const c of ord) {
    if (c.t1 <= t) ini = Math.max(ini, c.t1);
    if (c.t0 > t) { fim = Math.min(fim, c.t0); break; }
  }
  return fim - ini >= durMin(grade, ini) ? { ini, fim } : null;
}

/** Insere um clip do efeito pedido no vão que contém `t`. */
export function inserirClip(tracks, ti, fx, t, grade) {
  return comTrilha(tracks, ti, tr => {
    const folga = folgaEm(tr, t, grade);
    if (!folga) return tr;
    const min = durMin(grade, folga.ini);
    const t0 = limita(encaixa(t, grade), folga.ini, Math.max(folga.ini, folga.fim - min));
    const t1 = Math.min(folga.fim, t0 + durNova(grade, t0));
    if (t1 - t0 < min) return tr;
    const clip = { id: proximoId(tracks), fx, t0, t1, p: { ...(EFFECTS[fx].p || {}) } };
    return comClips(tr, [...tr.clips, clip].sort((a, b) => a.t0 - b.t0));
  });
}

export function removerClip(tracks, ti, id) {
  return comTrilha(tracks, ti, tr =>
    tr.clips.some(c => c.id === id) ? comClips(tr, tr.clips.filter(c => c.id !== id)) : tr);
}

/* Trocar o efeito troca os parâmetros junto: `hue` de uma corrida não
   quer dizer nada num gobo, e carregar sobra de parâmetro antigo é o
   tipo de coisa que reaparece meses depois como bug de render. */
export function trocarEfeito(tracks, ti, id, fx) {
  return comTrilha(tracks, ti, tr => comClips(tr, tr.clips.map(c =>
    c.id === id ? { ...c, fx, p: { ...(EFFECTS[fx].p || {}) } } : c)));
}

export function ajustarParam(tracks, ti, id, chave, valor) {
  return comTrilha(tracks, ti, tr => comClips(tr, tr.clips.map(c =>
    c.id === id ? { ...c, p: { ...c.p, [chave]: valor } } : c)));
}

/* ---------- trilhas ---------- */

export function proximoIdTrilha(tracks) {
  let max = 0;
  for (const tr of tracks) {
    const n = parseInt(String(tr.id || "").replace(/^\D+/, ""), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `t${max + 1}`;
}

export function adicionarTrilha(tracks, target, kind) {
  return [...tracks, { id: proximoIdTrilha(tracks), target, kind, clips: [] }];
}

export function removerTrilha(tracks, ti) {
  return tracks.filter((_, i) => i !== ti);
}

/** Onde está um clip, por id. */
export function acharClip(tracks, id) {
  for (let ti = 0; ti < tracks.length; ti++) {
    const clip = tracks[ti].clips.find(c => c.id === id);
    if (clip) return { ti, clip, track: tracks[ti] };
  }
  return null;
}
