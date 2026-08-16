# Bancada — a placa da gaveta vira a saída do sequenciador

Ponte USB→luz pra testar aparelho de verdade antes do firmware grande da
T-CAN485 existir. O sequenciador conecta pelo botão **DMX** (Chrome/Edge de
desktop, Web Serial) e o que estiver tocando — show ou mesa de canais — sai
no cabo.

## As placas da gaveta

Duas apareceram, e cada uma tem um papel:

| | NodeMCU v3 (ESP8266) | TTGO T4 v1.3 (ESP32) |
|---|---|---|
| Pixel (faróis) | sim, D2 | sim, GPIO21 (conector de 5 vias) |
| DMX (cabeças) | não (esp_dmx é ESP32-only) | sim, TX 26 / EN 33 |
| Cartão SD | não | **sim** — e isso muda o jogo |
| Extra | — | display ILI9341, 8MB PSRAM, carga de bateria |

Terceira da gaveta: um **Black Pill STM32F401/F411** numa placa de
periféricos de simulador (pedal/handbrake/encoder/shifter, DB15). É o
plano C — tem USB **nativo** (CDC, com CRC de verdade, ironia: o que a
T-CAN485 não tem), mas nem WiFi/BT nem SD, toolchain outra (STM32duino),
NeoPixel menos rodada e DMX na mão. Só compensa portar a bancada pra ela
se o NodeMCU e a T4 falharem juntos.

A T4 é ESP32 de verdade **com slot SD**: além de bancada completa, ela
serve de mula pro **firmware grande** antes da T-CAN485 chegar — SD por
SPI (MISO 2, MOSI 15, SCLK 14, CS 13), gravação atômica, manifest e
playback de `.fseq` do cartão dá pra desenvolver nela. Duas ressalvas:
os 8MB de PSRAM dela a T-CAN485 **não tem** — nada de encostar nesse
heap — e a PSRAM ocupa os GPIO16/17, por isso o mapa de pinos dela é
outro (o bloco `BANCADA_T4` no topo do sketch).

## O NodeMCU v3 (ESP8266) serve?

**Pros faróis, serve inteira.** O mesmo sketch compila pra ela; só a saída
DMX fica de fora (a lib esp_dmx é ESP32-only), e cabeça DMX é fase 2 de
qualquer jeito — quando chegar, ou aparece um ESP32 de verdade ou já é a
própria T-CAN485. O que muda gravando num NodeMCU:

- Arduino IDE com o core **ESP8266** (boards manager), placa
  "NodeMCU 1.0 (ESP-12E Module)"
- Dado do pixel no **D2** — que é exatamente o GPIO4, mesmo número do ESP32
- O aviso "use 9600bps" no verso é do echo de fábrica; gravado o sketch, o
  CH340 segura os 921600 numa boa
- Ressalva única: no 8266 o `show()` da NeoPixel roda com interrupção
  desligada. Com os 3–9 nodes da bancada é invisível; corrente comprida
  (centenas de pixels) começaria a comer bytes da serial — aí é caso de
  ESP32/RMT mesmo

Duas saídas, o mesmo mapa de canais do croqui:

- **Pixel endereçável** (os faróis/strobos RGB): canais iniciais do mapa,
  por RMT no GPIO4. É a saída que os primeiros aparelhos a chegar usam.
- **DMX** (as cabeças, depois): buffer inteiro pelo MAX485 — cada cabeça
  endereça no número que o croqui mostra em "Canal inicial".

A entrada fala **Enttec DMX USB Pro** (label 6), então QLC+ e xLights também
enxergam a placa como dongle, de brinde.

## Lista de compras

- Placa da gaveta: T4 v1.3 (bancada completa) ou NodeMCU v3 (só pixel)
- Pros faróis: fonte 5V com corrente de sobra (LED não roda de USB) e, se o
  dado a 3.3V não segurar, um level shifter **74HCT125**
- Pras cabeças, depois: módulo **MAX485** (poucos reais; melhor um com
  ADM2582E, já isolado — ver a pendência no ADR 0010) + XLR fêmea

## Fiação

```
pixel:  ESP32 GPIO4 ──► DIN da corrente     fonte 5V ──► +5V e GND
        GND do ESP32 e da fonte JUNTOS

DMX:    ESP32           MAX485          XLR
        GPIO17  ──────  DI
        GPIO21  ──────  DE + RE (juntos)
        5V/GND  ──────  VCC/GND ───────  pino 1 (GND)
                        A       ───────  pino 3 (Data+)
                        B       ───────  pino 2 (Data−)
```

## Gravar

1. Arduino IDE com o core ESP32
2. Bibliotecas: **esp_dmx** (Mitch Weisbrod, série 4.1.x) e
   **Adafruit NeoPixel**
3. Ajustar no topo do sketch: `NODES` (o que está no cabo agora — 1 farol
   de 3 nodes = 3), a linha da `fita` (ordem de cor e 400/800kHz) e, se a
   placa for a T4, descomentar `BANCADA_T4`
4. Placa "ESP32 Dev Module" (a T4 grava como Dev Module mesmo; NodeMCU é
   "NodeMCU 1.0"), gravar. LED aceso = recebendo do sequenciador; piscando
   = segurando o último quadro. Na T4 o "LED" é o backlight do display

## Os testes que o roadmap pedia saem daqui

- **400 ou 800kHz**: troca `NEO_KHZ800` por `NEO_KHZ400` e vê qual acende
  estável.
- **1 ou 3 endereços por farol**: com `NODES = 3` e a fixture de 3 nodes no
  app, uma "Corrida" deve andar DENTRO do farol. Se o farol inteiro pisca
  como um LED só, ele é 1 endereço — ajusta o farol pra 1 node no croqui.
- **Ordem de cor**: manda "Cor fixa" vermelha; se acender verde, ajusta a
  ordem na linha da `fita` no sketch. Deixa a fixture do app em RGB — os
  dois lados reordenando ao mesmo tempo é teste que mente.

No Android não tem Web Serial; lá o caminho é o APK, como sempre foi o plano.
