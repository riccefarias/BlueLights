# ADR 0010 — LilyGO T-CAN485 na camada de saída

**Status:** aceito
**Supersede:** [ADR 0002](0002-esp32-s3-em-vez-de-raspberry.md)

## Contexto

O ADR 0002 escolheu ESP32-S3 DevKitC-1 e **descartou** justamente esta placa,
por três motivos: RS485 não isolado, ESP32 clássico em vez de S3, e incerteza
de quais GPIOs sobram.

A placa é a que existe. Dos três motivos, um caiu e dois continuam de pé —
mas nenhum deles é impeditivo, e o que se ganha em troca é real: RS485,
slot de SD, conector de força e borne a parafuso já montados e testados, num
carro onde conector é o que quebra e solda própria é o que dá defeito
intermitente.

## Decisão

**LilyGO T-CAN485** (ESP32 clássico + CH9102 + RS485 + slot TF) na camada de
saída, alimentada com **5V** vindo do buck automotivo — nunca com os 12V do
carro direto.

## O que muda em relação ao 0002

| | ADR 0002 (S3 DevKitC) | Agora (T-CAN485) |
|---|---|---|
| Chip | ESP32-S3 | ESP32 clássico |
| USB | nativo, CDC-ACM | ponte CH9102 |
| Upload de 5MB | ~7s | ~60s |
| SD | SD_MMC 4-bit | SPI |
| RS485 | ADM2582E isolado | onboard, **não isolado** |
| Alimentação | buck 9–36V → 5V | idem, mas entregando 5V à placa |

### GPIO — a incerteza que o 0002 registrou

Resolvida pelo pinout oficial. Do header sobram:

```
IO25  IO32  IO33  IO05  IO12  IO18     <- saída
IO34  IO35                             <- SÓ ENTRADA no ESP32 clássico
```

Seis pinos de saída, e o plano do `docs/02` pede quatro (74AHCT125 = 4 saídas
de pixel). Cabe, com folga de dois.

⚠️ **IO12 é strapping pin** (MTDI): nível alto no boot muda a tensão de flash
e a placa não sobe. Usar por último, e nunca com pull-up externo.

## Porquê aceitar as perdas

**Upload 8× mais lento não importa.** Upload é evento raro e assíncrono — o
`docs/03` já isolou isso de propósito: a reprodução é local e não depende da
serial. 60s pra subir uma faixa nova na garagem não é problema; jitter no
playback seria, e esse não mudou.

**SD em SPI não é gargalo.** A conta fecha com folga enorme: 300 pixels ×
3 bytes × 40fps = ~36 kB/s. SD por SPI entrega na casa de 1 MB/s. São ~25×
de margem, e a compressão do [ADR 0008](0008-fseq-v2-com-zlib.md) ainda
reduz os bytes lidos por quadro. O duplo buffer com lookahead de ~200ms
continua valendo do mesmo jeito.

**A falta de PSRAM aperta, não impede.** O 0002 queria 8MB pra buffer local.
Sem ela, o buffer vive na RAM interna — o que cabe é da ordem de segundos de
show, não da faixa inteira. Suficiente pro duplo buffer; insuficiente pra
tocar sem cartão.

## O que continua de pé, e é o risco de verdade

**A isolação.** O `docs/02` escreve que "isolação não é opcional": com 3
SD3000 puxando, o terra do rack e o das heads não estão no mesmo potencial.
O transceiver da placa é comum, sem isolação.

Isso não muda por decisão — muda por instalação. Duas saídas:

1. **Isolar por fora**, num módulo ADM2582E entre a placa e o XLR. Mantém a
   placa pronta e recupera a proteção
2. **Aceitar e vigiar**, com terra único bem feito e malha aterrada só numa
   ponta. Funciona em rig pequeno e falha de forma intermitente, que é o
   pior jeito de falhar

Recomendação: começar com (2) pra subir rápido, e já ter (1) comprado. O
sintoma de que precisa é head travando ou fazendo movimento aleatório em
cima dos graves — o mesmo padrão que o `docs/02` descreve pro pixel.

## Consequências

- **Alimentar com 5V, não 12V.** A entrada da placa é 5–12V, e o carro em
  carga fica em 13,8–14,4V — já fora de spec antes de qualquer load dump.
  O buck do `docs/02` (TPS54331) passa a alimentar a placa, não só o MCU
- **CRC por chunk vira obrigatório.** Com ponte serial não há detecção de erro
  na camada USB. O `docs/03` já especificava CRC; agora não há alternativa
- **`esp_dmx` na UART2** com os pinos do RS485 da placa (TX IO22, RX IO21).
  DE/RE são GPIO (IO17/IO19), então dá pra fixar em transmissão por software
  — sem circuito de autodireção, como o `docs/02` já pedia
- **Sobra um barramento CAN** que ninguém pediu. Não usar agora, mas é a porta
  pra luz reagir a RPM ou porta aberta um dia
- O 74AHCT125 continua necessário: o ESP é 3.3V e o WS2811 em 12V quer nível
  TTL de 5V

## Descartado

**Manter o S3 DevKitC.** Tecnicamente melhor em tudo que é número. Mas exige
montar RS485, slot de SD e alimentação em placa própria, e o `docs/02` é
explícito sobre onde este projeto morre: *"vibração não mata o MCU, mata
conector"*. Placa pronta com borne a parafuso ganha da melhor arquitetura
soldada à mão.

**Usar as duas.** S3 pro pixel, T-CAN485 pro DMX. Resolve isolação e
velocidade, e cria um problema pior: dois relógios pra sincronizar dentro do
mesmo show.
