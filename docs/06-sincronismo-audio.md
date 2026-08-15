# Sincronismo com áudio

## O áudio é o relógio master

O playhead **não** acumula `dt` do `requestAnimationFrame`. Ele lê `AudioContext.currentTime`.

Acumular delta drifta: uma aba em segundo plano, um frame perdido, um GC — e a luz
desanda. Em 30s ninguém nota; em 4 minutos de faixa é meio compasso.

`rAF` só desenha. Quem manda no tempo é o áudio.

## Agendamento com lookahead

Nada é disparado na hora. Um laço a cada 25ms agenda os próximos ~120ms
**com timestamp absoluto** no `AudioContext`.

O JavaScript pode atrasar; a placa de som toca no instante exato mesmo assim.
Disparar direto do `setInterval` dá jitter de dezenas de ms — e aí não dá pra
confiar no que os olhos estão comparando.

O mesmo princípio vale no firmware: o ESP toca do relógio dele, o timecode só corrige deriva.

## Compensação de atraso

Slider global, aplicado **só na luz, nunca no áudio**.

No carro o som passa pelo STX e pelos módulos; a luz passa pela serial e pelo ESP.
Os dois atrasam em quantidades diferentes, e o que o público percebe é a diferença.

É constante — se resolve com um número, não mexendo na sequência.

Faixa útil: ±300ms.

## O que falta

- **Detecção de BPM** do arquivo (`web-audio-beat-detector` ou `essentia.js`).
  Hoje a grade é fixa
- **Marcadores de tempo editáveis** — música real tem rubato, beat fixo não cola em tudo
- **Zoom na timeline**, necessário assim que passar de 8 compassos

## Faixa não sequenciada

Pedido de música ao vivo toca coisa que não foi sequenciada. Dois caminhos:

1. **Reativo genérico** — análise de áudio ao vivo dirigindo efeitos paramétricos
2. **Híbrido** — sequência caprichada nas faixas autorais e nas que sempre tocam,
   reativo no resto. Ninguém no evento percebe a diferença
