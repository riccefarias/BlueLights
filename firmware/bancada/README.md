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
| Extra | — | display ILI9341, 4MB PSRAM, carga de bateria |

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
a PSRAM dela a T-CAN485 **não tem** — nada de encostar nesse heap; a
bancada compila com `PSRAM=disabled` de propósito, pra bater com a
restrição de memória do alvo — e a PSRAM ocupa os GPIO16/17, por isso o
mapa de pinos dela é outro (o bloco `BANCADA_T4` no topo do sketch).

> Medido na placa (`ESP32-D0WDQ6-V3`, flash 4MB): a PSRAM dá **4MB**,
> não 8MB — o ESP32 clássico nem endereça 8MB. Não muda nada de
> prático: GPIO16/17 continuam ocupados.

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
- Pros faróis: fonte **12V** com corrente de sobra — o farol strobo AJK é 12V
  (`../../docs/02-hardware.md`), e LED não roda do USB da placa. Uma caixa
  (3 faróis) puxa ~1,25A. E, se o dado a 3.3V não segurar, um level shifter
  **74AHCT125** (o `HCT` é obrigatório: limiar TTL reconhece 3.3V alimentado
  em 5V; um `AHC` comum precisaria de 3.5V e não funciona)
- Pras cabeças, depois: módulo **MAX485** (poucos reais; melhor um com
  ADM2582E, já isolado — ver a pendência no ADR 0010) + XLR fêmea

## Fiação

O pino de dado muda com a placa — o resto é igual:

| | NodeMCU v3 / ESP32 comum | TTGO T4 v1.3 |
|---|---|---|
| Dado do pixel | GPIO4 (D2 no NodeMCU) | **GPIO21** = `SDA` do conector de 5 vias |
| DMX DI | GPIO17 | GPIO26 |
| DMX DE+RE | GPIO21 | GPIO33 |

```
pixel:  <pino de dado> ──► DIN da corrente
        fonte externa  ──► +V e GND dos faróis
        GND do ESP32 e da fonte JUNTOS      <- obrigatório

DMX:    ESP32           MAX485          XLR
        <DI>    ──────  DI
        <DE+RE> ──────  DE + RE (juntos)
        5V/GND  ──────  VCC/GND ───────  pino 1 (GND)
                        A       ───────  pino 3 (Data+)
                        B       ───────  pino 2 (Data−)
```

### O conector de 5 vias da T4

Ordem gravada na placa: `GND 5V SDA SCL 3V3`. O farol sai daí sem solda —
dado no `SDA`, e o GND do mesmo conector serve de terra comum.

⚠️ **O `5V` desse conector não alimenta farol.** Ele vem do barramento USB
da placa; corrente de LED tem que vir de fonte externa (ver abaixo).

⚠️ **Não usar o `SCL` (GPIO22) pra mais nada.** Medido na placa: existe um
dispositivo I2C em **0x75** nesse barramento, e os dois pinos têm pull-up
externo. Com o SCL parado em nível alto o chip vê o START do tráfego de
pixel, trava esperando clock e nunca dirige a linha — inofensivo. Se
alguém passar a clocar o SCL, esse chip volta a dar ACK e passa a
corromper o dado do WS2811.

> Alternativas livres na T4, se o conector não servir: **GPIO19, 25, 26, 33**
> (o 26 e o 33 só se o DMX não estiver em uso). Evitar GPIO0 e GPIO12, que
> são strapping, e GPIO16/17, que são da PSRAM.

## A tela da T4

`painel_t4.h` transforma o display num monitor do show. Só entra na
compilação com `BANCADA_T4` definido; no NodeMCU o arquivo some inteiro.

- estado do link: **RECEBENDO** / **SEM SINAL** / **DEMO LOCAL**
- fps real, tamanho do quadro e contador de quadros recebidos
- grade com a cor de **cada node** — dá pra conferir mapeamento e ordem de
  cor sem ter farol nenhum ligado no cabo
- barras de nível R/G/B do quadro
- cascata: X é tempo, Y é o node. A timeline do que já saiu no cabo

Na T4 o backlight fica **fixo aceso** e o estado vai pra tela — backlight
piscando atrás de uma UI só atrapalha. O comportamento de LED piscando
continua igual no NodeMCU.

⚠️ **Nada no código da T4 pode escrever na `Serial`**: ela carrega o
protocolo Enttec binário a 921600. Debug é na tela.

`DEMO_SEM_SINAL` (topo do sketch, ligado): sem quadro por 2s, a placa anima
sozinha em vez de congelar. É a mesma regra do firmware do show
(`../README.md`, "nunca carro apagado") e serve pra conferir fiação de
WS2811 sem PC nenhum.

## Gravar

1. Arduino IDE com o core ESP32
2. Bibliotecas: **esp_dmx** (Mitch Weisbrod, série 4.1.x),
   **Adafruit NeoPixel** e — só pra T4 — **Adafruit GFX** +
   **Adafruit ILI9341**
3. Ajustar no topo do sketch: `NODES` (o que está no cabo agora — 1 farol
   de 3 nodes = 3), a linha da `fita` (ordem de cor e 400/800kHz) e, se a
   placa **não** for a T4, comentar `BANCADA_T4` (vem ligado)
4. Placa "ESP32 Dev Module" (a T4 grava como Dev Module mesmo; NodeMCU é
   "NodeMCU 1.0"), gravar. No NodeMCU: LED aceso = recebendo; piscando =
   segurando o último quadro. Na T4 é tudo na tela

> Por que Adafruit e não TFT_eSPI no display: a Adafruit recebe os pinos no
> **construtor**, em tempo de execução. Não precisa de `User_Setup.h` nem de
> flag de compilação, então o sketch abre no Arduino IDE e grava sem mexer
> na config global da TFT_eSPI — que quebraria os outros projetos da máquina.

## Os testes que o roadmap pedia saem daqui

- ✅ **1 ou 3 endereços por farol → 1 endereço.** As 3 lentes são o mesmo
  pixel. Footprint de 3 canais por farol; no croqui, farol = 1 node.
- ✅ **Ordem de cor → BGR.** Já no sketch (`NEO_BGR`). A fixture no app fica
  em **RGB**: reordenar dos dois lados ao mesmo tempo é teste que mente.
- ✅ **400 ou 800kHz → os dois funcionam.** Ficou em `NEO_KHZ400` pela
  margem de timing, que é de graça com pixel-count baixo.

Método das duas primeiras: acender **um byte do fio por node** e ler a cor
que sai em cada farol. Com dois faróis no cabo dando cores diferentes, cada
um é um endereço; a cor que cada byte acende dá a ordem do chip direto.
Está no `-Modo ordem` do `enttec-teste.ps1`.

> `NODES` agora conta **faróis**, não lentes. Ajusta pro que está no cabo.

No Android não tem Web Serial; lá o caminho é o APK, como sempre foi o plano.
