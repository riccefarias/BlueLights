# Bancada — ESP32 comum vira dongle DMX

Ponte USB→DMX pra testar aparelho de verdade (strobo primeiro) antes do
firmware grande da T-CAN485 existir. O sequenciador conecta pelo botão
**DMX** (Chrome/Edge de desktop, Web Serial) e o que estiver tocando — show
ou mesa de canais — sai no cabo.

Fala o protocolo **Enttec DMX USB Pro** (label 6), então QLC+ e xLights
também enxergam a placa como dongle, de brinde.

## Lista de compras

- ESP32 devkit comum (o que já tem na gaveta serve)
- Módulo **MAX485** (poucos reais; melhor ainda se achar um com ADM2582E,
  que já é isolado — ver a pendência de isolação no ADR 0010)
- Conector XLR fêmea de 3 pinos pro cabo DMX

## Fiação

```
ESP32           MAX485          XLR (DMX)
GPIO17  ──────  DI
GPIO21  ──────  DE + RE (os dois juntos)
5V      ──────  VCC
GND     ──────  GND  ──────────  pino 1
                A    ──────────  pino 3 (Data+)
                B    ──────────  pino 2 (Data−)
```

GND comum com o aparelho é obrigatório. Terminador de 120Ω entre A e B na
ponta do barramento se o cabo passar de uns poucos metros.

## Gravar

1. Arduino IDE com o core ESP32 instalado
2. Biblioteca **esp_dmx** (Mitch Weisbrod) — testado com a série **4.1.x**
3. Abrir `bancada.ino`, placa "ESP32 Dev Module", gravar
4. LED da placa: **aceso** = recebendo do sequenciador; **piscando** =
   segurando o último quadro (cabo USB caiu ou aba fechou)

## Uso

No sequenciador (desktop): botão **DMX** na barra de arquivo → escolher a
porta → play. A mesa de canais do croqui também sai ao vivo — é com ela que
se levanta a tabela DMX de aparelho sem manual: arrasta canal por canal e
anota o que mexe.

No Android não tem Web Serial; lá o caminho é o APK, como sempre foi o plano.
