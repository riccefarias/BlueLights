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
   tipo de coisa que reaparece meses depois como bug de render.
   As curvas caem pelo mesmo motivo — são curvas DAQUELES parâmetros. */
export function trocarEfeito(tracks, ti, id, fx) {
  return comTrilha(tracks, ti, tr => comClips(tr, tr.clips.map(c => {
    if (c.id !== id) return c;
    const { kf, ...resto } = c;
    return { ...resto, fx, p: { ...(EFFECTS[fx].p || {}) } };
  })));
}

export function ajustarParam(tracks, ti, id, chave, valor) {
  return comTrilha(tracks, ti, tr => comClips(tr, tr.clips.map(c =>
    c.id === id ? { ...c, p: { ...c.p, [chave]: valor } } : c)));
}

/* ---------- value curves ---------- */

/* Liga com A e B no valor atual — a luz não muda até mexer num dos
   dois. Desliga herdando o A como valor fixo: é o que estava valendo
   no início do clip, o palpite menos surpreendente. */
export function curvarParam(tracks, ti, id, chave, ligar) {
  return comTrilha(tracks, ti, tr => comClips(tr, tr.clips.map(c => {
    if (c.id !== id) return c;
    if (ligar) {
      const v = c.p[chave] ?? 0;
      return { ...c, kf: { ...c.kf, [chave]: [{ u: 0, v }, { u: 1, v }] } };
    }
    const { [chave]: kfs, ...resto } = c.kf || {};
    const novo = { ...c, p: { ...c.p, [chave]: kfs?.[0]?.v ?? c.p[chave] } };
    if (Object.keys(resto).length) novo.kf = resto; else delete novo.kf;
    return novo;
  })));
}

export function ajustarKf(tracks, ti, id, chave, idx, v) {
  return comTrilha(tracks, ti, tr => comClips(tr, tr.clips.map(c => {
    if (c.id !== id || !c.kf?.[chave]?.[idx]) return c;
    const kfs = c.kf[chave].map((k, i) => i === idx ? { ...k, v } : k);
    return { ...c, kf: { ...c.kf, [chave]: kfs } };
  })));
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

/** Troca o alvo de uma trilha mantendo os clips: linha e equipamento são
    desacoplados. Efeito que o alvo novo não faz o motor já zera — mesma
    tolerância do grupo misto. O kind acompanha o alvo, porque é o alvo
    que decide o caminho de render. */
export function retargetTrilha(tracks, ti, target, kind) {
  return tracks.map((tr, i) => i === ti ? { ...tr, target, kind } : tr);
}

/* ---------- copiar e reaproveitar ---------- */

const clonar = v => JSON.parse(JSON.stringify(v));

/** Retrato de um clip pra colar depois: efeito, duração e parâmetros,
    curvas junto. Sem id nem posição — isso nasce no colar. */
export function retratoDoClip(clip) {
  const r = { fx: clip.fx, dur: clip.t1 - clip.t0, p: clonar(clip.p) };
  if (clip.kf) r.kf = clonar(clip.kf);
  return r;
}

/** Cola um retrato no vão que contém `t`, em QUALQUER trilha — colar
    numa linha de outro alvo é justamente o reaproveitamento. Mantém a
    duração original; vão menor encurta até o mínimo, menor que isso
    não cola. */
export function colarClip(tracks, ti, retrato, t, grade) {
  return comTrilha(tracks, ti, tr => {
    const folga = folgaEm(tr, t, grade);
    if (!folga) return tr;
    const min = durMin(grade, folga.ini);
    const t0 = limita(encaixa(t, grade), folga.ini, Math.max(folga.ini, folga.fim - min));
    const t1 = Math.min(folga.fim, t0 + retrato.dur);
    if (t1 - t0 < min) return tr;
    const clip = { id: proximoId(tracks), fx: retrato.fx, t0, t1, p: clonar(retrato.p) };
    if (retrato.kf) clip.kf = clonar(retrato.kf);
    return comClips(tr, [...tr.clips, clip].sort((a, b) => a.t0 - b.t0));
  });
}

/** Duplica um clip na própria trilha, colado logo depois do original.
    Sem vão ali, não mexe — igual às outras edições sem espaço. */
export function duplicarClip(tracks, ti, id, grade) {
  const clip = tracks[ti]?.clips.find(c => c.id === id);
  if (!clip) return tracks;
  return colarClip(tracks, ti, retratoDoClip(clip), clip.t1, grade);
}

/** Duplica a linha inteira, blocos junto, logo abaixo da original.
    Com a troca de alvo, vira o "fiz pro farol 1, replico pro farol 2". */
export function duplicarTrilha(tracks, ti) {
  const tr = tracks[ti];
  if (!tr) return tracks;
  let n = parseInt(String(proximoId(tracks)).replace(/^\D+/, ""), 10);
  const copia = { id: proximoIdTrilha(tracks), target: tr.target, kind: tr.kind,
                  clips: tr.clips.map(c => ({ ...clonar(c), id: `c${n++}` })) };
  return [...tracks.slice(0, ti + 1), copia, ...tracks.slice(ti + 1)];
}

/** Copia um conjunto de clips como TRECHO: cada um lembra a trilha e o
    deslocamento relativo ao início do conjunto. É a referência completa
    de um padrão (o giroflex de 2 pixels em 2 linhas, por exemplo). */
export function copiarTrecho(tracks, ids) {
  const achados = [];
  let t0min = Infinity, t1max = 0;
  tracks.forEach((tr, ti) => tr.clips.forEach(c => {
    if (!ids.includes(c.id)) return;
    achados.push({ ti, c });
    t0min = Math.min(t0min, c.t0); t1max = Math.max(t1max, c.t1);
  }));
  if (!achados.length) return null;
  return { span: t1max - t0min, fim: t1max,
           itens: achados.map(({ ti, c }) => ({ ti, dt: c.t0 - t0min, ...retratoDoClip(c) })) };
}

/** Cola o trecho ancorado em `t`: cada clip volta pra SUA trilha, no
    deslocamento que tinha. Item sem vão é pulado, o resto cola —
    colar de novo no fim do trecho é como se alonga um padrão. */
export function colarTrecho(tracks, trecho, t, grade) {
  let ts = tracks;
  for (const it of trecho.itens) ts = colarClip(ts, it.ti, it, t + it.dt, grade);
  return ts;
}

/** Move um conjunto de clips JUNTO, preservando os offsets relativos.
    `idAncora` é o bloco sob o dedo; o dt que ele pede é clampado pelo
    espaço livre de TODOS — o grupo inteiro para no primeiro obstáculo,
    em vez de um clip atravessar vizinho. */
export function moverTrecho(tracks, ids, idAncora, t0Alvo, grade) {
  const anc = acharClip(tracks, idAncora);
  if (!anc || !ids.includes(idAncora)) return tracks;
  let dt = encaixa(t0Alvo, grade) - anc.clip.t0;
  for (const tr of tracks) {
    const grupo = tr.clips.filter(c => ids.includes(c.id));
    if (!grupo.length) continue;
    const outros = tr.clips.filter(c => !ids.includes(c.id));
    for (const c of grupo) {
      const antes = Math.max(0, ...outros.filter(o => o.t1 <= c.t0).map(o => o.t1));
      const depois = Math.min(grade.duracao, ...outros.filter(o => o.t0 >= c.t1).map(o => o.t0));
      dt = Math.max(antes - c.t0, Math.min(depois - c.t1, dt));
    }
  }
  if (!dt) return tracks;
  return tracks.map(tr => tr.clips.some(c => ids.includes(c.id))
    ? comClips(tr, tr.clips.map(c =>
        ids.includes(c.id) ? { ...c, t0: c.t0 + dt, t1: c.t1 + dt } : c))
    : tr);
}

/** Onde está um clip, por id. */
export function acharClip(tracks, id) {
  for (let ti = 0; ti < tracks.length; ti++) {
    const clip = tracks[ti].clips.find(c => c.id === id);
    if (clip) return { ti, clip, track: tracks[ti] };
  }
  return null;
}
