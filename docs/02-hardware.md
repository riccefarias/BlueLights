# Hardware

## Controlador

**LilyGO T-CAN485** — ESP32 clássico, ponte serial CH9102, RS485 e slot de TF
já na placa. Montado no rack, nunca dentro da câmara da caixa.
Decisão e o que se perdeu em troca: [ADR 0010](adr/0010-lilygo-t-can485-na-saida.md).

> Vibração não mata o MCU, mata conector. Barra de pino, DuPont, socket de SD e USB
> são o que quebra. O chip aguenta — ECU vive em cima de motor.

Foi exatamente isso que decidiu a placa: borne a parafuso e periférico já
montado ganham da arquitetura melhor soldada à mão.

### Pinagem

```
RS485_TX  IO22     SD_MOSI  IO15     CAN_RX  IO26
RS485_RX  IO21     SD_MISO  IO02     CAN_TX  IO27
RS485_EN  IO17     SD_SCLK  IO14     CAN_SE  IO23
RS485_SE  IO19     SD_CS    IO13     WS2812  IO04  (LED de status da placa)
```

Livres no header, pra saída de pixel:

```
IO25  IO32  IO33  IO05  IO12  IO18     <- saída
IO34  IO35                             <- SÓ ENTRADA no ESP32 clássico
```

Seis de saída pra quatro necessárias. ⚠️ **IO12 é strapping pin** (MTDI):
alto no boot muda a tensão de flash e a placa não sobe. Deixar por último.

### O que a placa não resolve

- **Sem PSRAM.** O buffer de playback vive na RAM interna: dá pros ~200ms de
  lookahead do duplo buffer, não pra segurar a faixa inteira sem cartão
- **SD em SPI**, não SD_MMC 4-bit. Não é gargalo: 300 pixels × 3 bytes × 40fps
  são ~36 kB/s contra ~1 MB/s de SPI. E o `.fseq` ainda vai comprimido
- **Upload ~8× mais lento** que USB nativo — ver a tabela em
  `03-protocolo-serial.md`. Upload é evento raro; playback é que é crítico, e
  esse é local

## Alimentação (12V automotivo)

| Item | Função |
|---|---|
| TVS SMBJ24A | Corta load dump do alternador (>40V) |
| MOSFET P-channel (IRF4905) | Proteção contra inversão de polaridade |
| Buck 9–36V → 5V/2A (TPS54331) | **Não** usar MP1584: rated 28V, morre no load dump |
| Eletrolítico 220µF low-ESR | Bulk na entrada |
| Fusível 2A | Entrada do módulo |

⚠️ **A entrada da placa é 5–12V.** Carro em carga fica em 13,8–14,4V — já fora
de spec antes de qualquer load dump. O buck entrega **5V** na placa; os 12V
brutos não encostam nela.

A placa é alimentada pelo borne DC, **nunca pelo VBUS da USB** — a central Android
corta a USB em standby e o ESP rebootaria no meio da faixa. Cabo USB com VBUS
cortado, só dado.

**Fusível em cada derivação de 12V.** Fio de LED sem proteção roçando em lataria é incêndio.

## Saída pixel (WS2811 12V)

Decisão: **single-ended**, sem RS485. Tiradas curtas dentro do carro.

| Item | Qtd |
|---|---|
| 74AHCT125 | 1 chip = 4 saídas |
| Resistor 220Ω | 1 por saída, na fonte |

O **HCT** é obrigatório: limiar de entrada TTL (VIH 2.0V) reconhece os 3.3V do ESP
enquanto roda alimentado em 5V. Um 74AHC comum precisaria de 3.5V e não funciona.

Não usar módulo level shifter com BSS138 — sobe por pull-up de 10k, borda lenta demais
pra 800kHz.

### Boas práticas de cabeamento

- **Par trançado DATA + GND.** Maior ganho do projeto e é de graça
- Malha aterrada **só na ponta do rack** (nos dois lados vira laço de terra)
- Cabo de dado longe do cabo de falante; se cruzar, a 90°
- ✅ **Os strobos aceitam 400kHz** — medido na bancada com 4 faróis. Está em uso
  (`NEO_KHZ400`): dobra a margem de timing e com pixel-count baixo não se perde nada

### Sintoma de que precisa retrofitar pra diferencial

Pixel piscando errado ou cor trocada **em cima dos graves**, ou depois de meia hora quente.
A pinagem do GX16 já reserva o par — troca só as pontas.

## Saída DMX

| Item | Obs |
|---|---|
| RS485 da própria T-CAN485 | Transceiver comum, **sem isolação** |
| XLR3 **fêmea** de painel | DMX é invertido em relação a áudio: quem envia é fêmea |
| Resistor 120Ω | Terminador na última head |

DMX é unidirecional (sem RDM): `RS485_EN` e `RS485_SE` fixados em transmissão
por software, no boot. Não usar circuito de autodireção — o BREAK de 88µs pode
ser lido como linha ociosa e o driver solta o barramento no meio do pacote.

### ⚠️ A isolação que ficou faltando

**Isolação não é opcional.** Com 3 SD3000 puxando, o terra do rack e o das heads
não estão no mesmo potencial. O transceiver da placa não isola.

O [ADR 0010](adr/0010-lilygo-t-can485-na-saida.md) aceitou isso conscientemente,
com duas saídas:

1. **Módulo ADM2582E por fora**, entre a placa e o XLR. Recupera a proteção
2. **Terra único bem feito**, malha aterrada só na ponta do rack

Começar por (2) pra subir rápido, com (1) já comprado. **Sintoma de que
precisa:** head travando ou fazendo movimento aleatório em cima dos graves —
mesmo padrão do pixel logo acima.

### Config da UART

DMX512 = 250000 baud, 8N2, BREAK de 88µs. Usar `esp_dmx` na UART2, apontada
pros pinos de RS485 da placa (TX IO22, RX IO21) pela matriz de GPIO.

## Conector das caixas — GX16-7

| Pino | Agora | Se virar diferencial |
|---|---|---|
| 1, 2 | +12V | +12V |
| 3, 4 | GND | GND |
| **5** | **DATA** | **A** |
| **6** | **GND** (trançado c/ 5) | **B** |
| 7 | reserva | reserva |

Os pinos 5 e 6 são o mesmo par físico nos dois cenários: **retrofit sem trocar cabo,
conector ou furação**.

⚠️ A numeração do macho e da fêmea do GX16 é espelhada. Soldar pelo número gravado
no corpo de cada peça, nunca pela posição física.

### Direção do encadeamento

Não fazer cabo cruzado. **Cabo burro 1:1, inteligência na caixa**: o conector IN
liga no DIN da fita, o OUT vem do DOUT. Pra impedir inversão física, usar
**contagem de vias diferente** (GX16-7 entrada, GX16-8 saída), ambos fêmea de painel —
não usar gênero, porque pino macho exposto com 12V perto de lataria é risco.

## Fixtures

### Farol strobo AJK

| | |
|---|---|
| LEDs | 3 lentes por farol |
| Potência | 6W, 415mA máx |
| Alimentação | 12V |
| Endereçamento | 2811 |
| Fios | 4 — positivo, negativo, entrada e saída de sinal |
| Dimensões | 28×79×17mm, 28g |
| Vedação | **Não é à prova d'água** |

**Resolvido na bancada:** cada farol é **1 endereço** (3 canais) — as 3 lentes
são o mesmo pixel e acendem sempre juntas. Ordem de cor do chip: **BGR**.
Medição e método em `docs/05-perfis-de-fixture.md`.

Cuidados: condensação dentro da câmara (passar verniz nos contatos) e evitar cena
longa de branco cheio — 3 faróis × 6W numa câmara selada sem ventilação.

### Consumo

| Faróis | Corrente 12V |
|---|---|
| 3 (uma caixa) | 1,25A — GX16 com pinos dobrados aguenta |
| 6 (as duas) | 2,5A |
| 20 (carro todo) | 8,3A — fio grosso e fusível por ramo |
