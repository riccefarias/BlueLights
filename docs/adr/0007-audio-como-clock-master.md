# ADR 0007 — AudioContext como relógio master

**Status:** aceito

## Contexto

O playhead precisa de uma fonte de tempo. O caminho óbvio é acumular `dt`
do `requestAnimationFrame`.

## Decisão

O playhead lê **`AudioContext.currentTime`**. O `rAF` só desenha.
Eventos de áudio são agendados com lookahead de ~120ms e timestamp absoluto.

## Consequências

- Elimina deriva: aba em segundo plano, frame perdido ou GC não desalinham a luz
- O agendamento com lookahead elimina jitter de dezenas de ms
- Áudio exige gesto do usuário: não dá pra dar play automático
- O mesmo princípio vale no firmware — o ESP toca do relógio dele e o timecode
  só corrige deriva

## Alternativas descartadas

**Acumular dt do rAF** — em 30s ninguém nota, em 4 minutos de faixa
é meio compasso de atraso.

**Disparar áudio direto do setInterval** — jitter de dezenas de ms
torna a comparação visual inútil.
