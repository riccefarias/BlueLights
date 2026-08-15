# ADR 0002 — ESP32-S3 na camada de saída

**Status:** aceito

## Contexto

Precisa de um controlador que gere timing de WS2811 (800kHz, tolerância ±150ns)
e DMX512 (250k 8N2 com BREAK de 88µs), dentro de um carro com 3 SD3000 puxando.

## Decisão

**ESP32-S3** no rack. RMT em hardware pro pixel, UART2 pro DMX.
USB nativo (CDC-ACM) pra falar com a mídia Android.

## Consequências

- RMT e UART são periféricos separados: sem disputa de CPU, core 0 livre
- USB nativo dá ~700 kB/s contra ~90 kB/s de ponte CH340 — 5MB em 7s em vez de 60s
- PSRAM de 8MB permite buffer local caso o SD falhe
- Precisa de buck automotivo e proteção; não se alimenta pelo VBUS

## Alternativas descartadas

**Raspberry Pi como nó** — SD card, USB, HDMI, PCB maior: mais frágil a vibração que
o ESP32, não menos. Pi 5 ainda quebrou o `rpi_ws281x` clássico.

**ESP32 clássico** — sem USB nativo (ponte CH340/CH9102) e sem PSRAM.
Funciona, mas o upload fica 8× mais lento.

**LilyGO T-CAN485** — placa pronta com RS485, mas não isolado, ESP32 clássico,
e incerteza de quais GPIOs sobram.
