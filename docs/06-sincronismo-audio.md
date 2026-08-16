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

## Detecção de andamento

Feita em casa, em `web/src/motor/bpm.js`. Sem dependência: entra `Float32Array`
e taxa de amostragem, sai andamento, fase e confiança. Roda no browser, no Node
e no teste — mesmo princípio do resto do motor.

Medido nas faixas reais do carro, ~100ms por faixa:

| Faixa | BPM | Confiança | Ataque médio na grade |
|---|---|---|---|
| Farmando Aura (4:07) | 84,18 | 0,82 | 3,26 de 3,59 |
| Minha Rainha (2:23) | 132,04 | 0,62 | 2,46 de 3,30 |

### Quatro coisas que custaram caro

**Compressão é raiz, não log.** Log parece mais esperto e é armadilha: faz um
chimbal fraco depois do silêncio saltar tanto quanto um bumbo, a colcheia vira
o pulso, e o detector responde o dobro do andamento.

**BPM sai sem arredondar.** Arredondar em 0,1 parece inofensivo e custa ~15
quadros de deriva numa faixa de 4 minutos. O ataque tem 1 a 2 quadros de
largura, então a grade decorrelaciona inteira — e o começo continua parecendo
certo, que é o que faz não perceber. Quem arredonda é a tela.

**Uma janela não decide a oitava.** Música de verdade tem trecho em meio-tempo:
o mesmo arquivo respondeu 84 num pedaço e 168 no outro, os dois certos. A saída
é votar em várias janelas, dobrando cada voto até uma faixa comum.

**O objetivo precisa de tolerância.** Amostrar o quadro exato faz um erro de
10ms — que ninguém enxerga numa luz — zerar a pontuação, e a busca de período
fica num terreno cheio de buraco. Olhar o vizinho deixa liso.

### Fase, não só velocidade

A saída traz `offset`: onde cai o primeiro tempo. É a metade que costuma faltar,
e sem ela uma grade de 128 certinha põe todo bloco na contratempo.

### Por que um BPM escalar não basta

Deriva é diferente de atraso. Atraso constante some com o slider; deriva cresce
ao longo da faixa e nenhum slider corrige. Em Farmando Aura:

| Erro de BPM | Deriva no fim | Em passos de 1/16 |
|---|---|---|
| 1 | 2936ms | 16 passos |
| 0,1 | 294ms | 1,6 passo |
| 0,01 | 29ms | 0,16 passo |

Pattern repetitivo é o caso mais sensível, não o menos: um pisca de semicolcheia
com 0,1 BPM de erro entra em **antifase aos 75 segundos** — piscando exatamente
entre as batidas. E como o efeito usa tempo global, clip curto no fim da faixa
herda a deriva acumulada inteira.

É o que motiva o mapa de batidas: com cada batida ancorada onde a música
realmente está, não existe acúmulo nem orçamento de precisão a respeitar.

## O que falta

- **Ligar a grade ao arquivo.** A detecção existe mas ainda não manda em nada:
  `DURATION` continua saindo de `BPM × BARS` e vale 15 segundos, então não dá
  pra sequenciar faixa nenhuma. Quem devia mandar na duração é o áudio
- **Mapa de batidas** no lugar do BPM escalar, e o efeito passando a falar em
  batida em vez de segundo
- **Marcadores de tempo editáveis** — música real tem rubato, beat fixo não cola em tudo
- **Zoom na timeline**, necessário assim que passar de 8 compassos

## Faixa não sequenciada

Pedido de música ao vivo toca coisa que não foi sequenciada. Dois caminhos:

1. **Reativo genérico** — análise de áudio ao vivo dirigindo efeitos paramétricos
2. **Híbrido** — sequência caprichada nas faixas autorais e nas que sempre tocam,
   reativo no resto. Ninguém no evento percebe a diferença
