/* ============================================================
   GRADE — a régua musical do documento.

   Converte segundo em batida e batida em segundo. É a única coisa
   no projeto que sabe as duas linguagens.

   **Tudo é mapa de batidas.** BPM constante não é um modo separado:
   é um mapa regularmente espaçado. Um caminho só no motor, e o dia
   que a faixa tiver rubato nada muda a jusante.

   O paralelo com o perfil de fixture é de propósito: lá o efeito diz
   "tilt = 0.3" e o perfil traduz pra canal; aqui o efeito diz "pisca
   a cada 1/8" e a grade traduz pra segundo. Nos dois casos o efeito
   não sabe — e é isso que o deixa portátil.
   ============================================================ */

export const POR_COMPASSO = 4;

function busca(batidas, t) {
  let lo = 0, hi = batidas.length - 1;
  if (t <= batidas[0]) return 0;
  if (t >= batidas[hi]) return hi;
  while (lo + 1 < hi) {
    const m = (lo + hi) >> 1;
    if (batidas[m] <= t) lo = m; else hi = m;
  }
  return lo;
}

/**
 * @param {number[]} batidas  instantes em segundos, crescentes
 * @param {number} duracao    da faixa
 */
export function gradeDeBatidas(batidas, duracao, extra = {}) {
  const b = Float64Array.from(batidas);
  const n = b.length;
  if (n < 2) throw new Error("grade precisa de pelo menos duas batidas");

  const passoIni = b[1] - b[0];
  const passoFim = b[n - 1] - b[n - 2];

  /* Índice de batida fracionário em `t`. Fora do mapa, extrapola no passo
     da ponta — o playhead pode passar do fim e a conta não pode explodir. */
  const indiceEm = (t) => {
    if (t <= b[0]) return (t - b[0]) / passoIni;
    if (t >= b[n - 1]) return (n - 1) + (t - b[n - 1]) / passoFim;
    const i = busca(b, t);
    const passo = b[i + 1] - b[i];
    return i + (t - b[i]) / passo;
  };

  const tempoDe = (idx) => {
    if (idx <= 0) return b[0] + idx * passoIni;
    if (idx >= n - 1) return b[n - 1] + (idx - (n - 1)) * passoFim;
    const i = Math.floor(idx);
    return b[i] + (idx - i) * (b[i + 1] - b[i]);
  };

  /* Fase dentro da subdivisão, de 0 a 1. É o que os efeitos usam no lugar
     de `tempo % periodo`: sem aritmética acumulada, não existe deriva, e a
     subdivisão acompanha a faixa acelerando de graça. */
  const faseEm = (t, div = 1) => {
    if (!(div > 0)) return 0;
    const x = indiceEm(t) * div;
    return x - Math.floor(x);
  };

  /* Qual subdivisão estamos, contando do começo. É o que efeito de passo
     discreto usa — troca de gobo não interpola, ela pula. */
  const passoEm = (t, div = 1) => Math.floor(indiceEm(t) * div);

  const encaixar = (t, div = 4) => {
    if (!(div > 0)) return t;
    return tempoDe(Math.round(indiceEm(t) * div) / div);
  };

  const duracaoDaBatida = (t) => {
    const i = Math.max(0, Math.min(n - 2, busca(b, t)));
    return b[i + 1] - b[i];
  };

  const total = n > 1 ? (b[n - 1] - b[0]) / (n - 1) : passoIni;

  return {
    batidas: b, duracao,
    bpm: 60 / total,
    compassos: Math.max(1, Math.ceil(indiceEm(duracao) / POR_COMPASSO)),
    indiceEm, tempoDe, faseEm, passoEm, encaixar, duracaoDaBatida,
    ...extra,
  };
}

/** Mapa regular. É o que se usa quando não há áudio ou a detecção falhou. */
export function gradeFixa({ bpm = 128, offset = 0, duracao = 15, ...extra } = {}) {
  const beat = 60 / bpm;
  const batidas = [];
  for (let t = offset % beat; t < duracao + beat; t += beat) batidas.push(t);
  if (batidas.length < 2) batidas.push((batidas[0] ?? 0) + beat);
  return gradeDeBatidas(batidas, duracao, extra);
}

/* Move uma batida pra onde ela realmente está. A batida movida é a
   âncora; os trechos até as vizinhas reinterpolam por construção —
   `indiceEm`/`tempoDe` são lineares por segmento, então esticar um
   segmento É a reinterpolação, sem passo extra.

   Clamp entre as vizinhas: batida não passa por cima de batida —
   cruzar quebraria a busca binária e não significa nada musical. */
export function moverBatida(grade, i, t) {
  const b = Array.from(grade.batidas);
  if (i < 0 || i >= b.length) return grade;
  const eps = 1e-3;
  const min = i > 0 ? b[i - 1] + eps : 0;
  const max = i < b.length - 1 ? b[i + 1] - eps : grade.duracao;
  b[i] = Math.max(min, Math.min(max, t));
  return gradeDeBatidas(b, grade.duracao, { confianca: grade.confianca });
}

/** Grade do documento salvo, com o formato compacto. */
export function gradeDeDoc(g) {
  if (g?.batidas?.length >= 2)
    return gradeDeBatidas(g.batidas, g.duracao, { confianca: g.confianca ?? 1 });
  return gradeFixa({ bpm: g?.bpm ?? 128, offset: g?.offset ?? 0,
                     duracao: g?.duracao ?? 15, confianca: g?.confianca ?? 0 });
}

/* Salvar o mapa inteiro de uma faixa de 4 minutos são ~500 números. Em JSON
   indentado isso incha o documento à toa, então vai com 4 casas — 0,1ms de
   resolução, muito abaixo do que qualquer luz mostra. */
export function gradeParaDoc(grade) {
  return {
    duracao: +grade.duracao.toFixed(4),
    bpm: +grade.bpm.toFixed(4),
    confianca: +(grade.confianca ?? 0).toFixed(3),
    batidas: Array.from(grade.batidas, v => +v.toFixed(4)),
  };
}
