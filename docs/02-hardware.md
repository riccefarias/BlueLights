# Hardware

## Controlador

**ESP32-S3 DevKitC-1 N16R8** — USB nativo (CDC-ACM, sem ponte serial), 16MB flash, 8MB PSRAM.
Soldado direto, sem barra de pino. Montado no rack, nunca dentro da câmara da caixa.

> Vibração não mata o MCU, mata conector. Barra de pino, DuPont, socket de SD e USB
> são o que quebra. O chip aguenta — ECU vive em cima de motor.

## Alimentação (12V automotivo)

| Item | Função |
|---|---|
| TVS SMBJ24A | Corta load dump do alternador (>40V) |
| MOSFET P-channel (IRF4905) | Proteção contra inversão de polaridade |
| Buck 9–36V → 5V/2A (TPS54331) | **Não** usar MP1584: rated 28V, morre no load dump |
| Eletrolítico 220µF low-ESR | Bulk na entrada |
| Fusível 2A | Entrada do módulo |

O ESP é alimentado pelo pino 5V, **nunca pelo VBUS da USB** — a central Android corta
a USB em standby e o ESP rebootaria no meio da faixa. Cabo USB com VBUS cortado, só dado.

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
- Se os strobos aceitarem **modo 400kHz**, usar. Dobra a margem de timing e com
  pixel-count baixo não se perde nada

### Sintoma de que precisa retrofitar pra diferencial

Pixel piscando errado ou cor trocada **em cima dos graves**, ou depois de meia hora quente.
A pinagem do GX16 já reserva o par — troca só as pontas.

## Saída DMX

| Item | Obs |
|---|---|
| ADM2582E | Transceiver + isolação + DC-DC num CI só |
| XLR3 **fêmea** de painel | DMX é invertido em relação a áudio: quem envia é fêmea |
| Resistor 120Ω | Terminador na última head |

DMX é unidirecional (sem RDM): `DE` e `RE` amarrados em VCC, sempre transmitindo.
Não usar circuito de autodireção — o BREAK de 88µs pode ser lido como linha ociosa
e o driver solta o barramento no meio do pacote.

**Isolação não é opcional.** Com 3 SD3000 puxando, o terra do rack e o das heads
não estão no mesmo potencial.

### Config da UART no ESP32

DMX512 = 250000 baud, 8N2, BREAK de 88µs. Usar `esp_dmx` na UART2.

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

**Em aberto:** cada farol é 1 endereço ou 3? Ver `docs/05-perfis-de-fixture.md`.

Cuidados: condensação dentro da câmara (passar verniz nos contatos) e evitar cena
longa de branco cheio — 3 faróis × 6W numa câmara selada sem ventilação.

### Consumo

| Faróis | Corrente 12V |
|---|---|
| 3 (uma caixa) | 1,25A — GX16 com pinos dobrados aguenta |
| 6 (as duas) | 2,5A |
| 20 (carro todo) | 8,3A — fio grosso e fusível por ramo |
