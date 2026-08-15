# ADR 0003 — Pixel single-ended, RS485 só no DMX

**Status:** aceito

## Contexto

Com 3 SD3000 chaveando, dado de 800kHz em fio comum pode glitchar.
A opção robusta seria converter o pixel pra RS485 diferencial e voltar na caixa.

## Decisão

Pixel fica **single-ended** com buffer 74AHCT125 e par trançado.
RS485 (ADM2582E isolado) **só no ramo DMX**.

## Consequências

- Economiza uma placa em cada caixa; tiradas dentro do carro são curtas
- O 74AHCT125 passa a ser obrigatório: ia vir de graça dentro do MAX485
- A pinagem do GX16 reserva o par, então o retrofit troca só as pontas
- **Sintoma de retrofit:** pixel errando em cima dos graves ou depois de quente

## Alternativas descartadas

**MAX485 no pixel** — o pulso mais curto do WS2811 é 250ns contra 400ns de período
do chip a 2,5Mbps. Distorce a largura do bit com só 150ns de margem.
Pior: MAX487/483/1487 são slew-rate-limited a 250kbps e destroem o sinal.

**Transistor como level shifter** — inverte, e a subida é RC via pull-up:
~360ns num cabo de 2m, contra 1,25µs de bit. Come um quarto do bit.
