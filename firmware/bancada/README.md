# Bancada — ESP32 comum vira a saída do sequenciador

Ponte USB→luz pra testar aparelho de verdade antes do firmware grande da
T-CAN485 existir. O sequenciador conecta pelo botão **DMX** (Chrome/Edge de
desktop, Web Serial) e o que estiver tocando — show ou mesa de canais — sai
no cabo.

Duas saídas, o mesmo mapa de canais do croqui:

- **Pixel endereçável** (os faróis/strobos RGB): canais iniciais do mapa,
  por RMT no GPIO4. É a saída que os primeiros aparelhos a chegar usam.
- **DMX** (as cabeças, depois): buffer inteiro pelo MAX485 — cada cabeça
  endereça no número que o croqui mostra em "Canal inicial".

A entrada fala **Enttec DMX USB Pro** (label 6), então QLC+ e xLights também
enxergam a placa como dongle, de brinde.

## Lista de compras

- ESP32 devkit comum (o da gaveta serve)
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
   de 3 nodes = 3) e a linha da `fita` (ordem de cor e 400/800kHz)
4. Placa "ESP32 Dev Module", gravar. LED aceso = recebendo do sequenciador;
   piscando = segurando o último quadro

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
