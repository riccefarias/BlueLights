/* ============================================================
   BANCADA — ESP32 comum vira a saída do sequenciador.

   Não é o firmware do show (esse é o da T-CAN485, com SD e fseq).
   Isto é a bancada: o sequenciador manda quadros pela serial USB e
   isto vira luz no cabo — pra testar aparelho de verdade antes do
   firmware grande existir.

   Duas saídas, o mesmo mapa de canais do sequenciador:
     canais 1..CANAIS_PIXEL → corrente de pixel endereçável (os
       faróis/strobos RGB), por RMT no PIN_PIXEL
     buffer inteiro → DMX pelo MAX485 (as cabeças endereçam no
       mesmo número que o croqui mostra em "Canal inicial")

   Protocolo de entrada: Enttec DMX USB Pro (label 6). É o padrão
   de facto — além do nosso WebSerial, QLC+ e xLights enxergam a
   placa como um dongle Enttec.

   Fiação:
     pixel : GPIO4 → DIN da corrente (level shifter 74HCT125 se
             3.3V direto não segurar; 5V da fonte, nunca do USB)
     DMX   : GPIO17 → DI do MAX485, GPIO21 → DE+RE juntos,
             A → XLR pino 3, B → XLR pino 2, GND comum → pino 1

   As DUAS perguntas do roadmap se respondem aqui:
     - 400 ou 800kHz → troca NEO_KHZ800 por NEO_KHZ400 e vê qual acende
     - 1 ou 3 endereços por farol → NODES conta certo ou sobra/falta LED

   Bibliotecas: esp_dmx (Mitch Weisbrod, série 4.1.x) e
   Adafruit NeoPixel. Serial a 921600 (CH340/CP2102 aguentam).
   ============================================================ */

#include <Arduino.h>
#include <esp_dmx.h>
#include <Adafruit_NeoPixel.h>

const int PIN_TX = 17, PIN_RX = 16, PIN_EN = 21, PIN_LED = 2;
const int PIN_PIXEL = 4;
const long BAUD = 921600;
const dmx_port_t DMX = DMX_NUM_1;

/* Quantos nodes tem no cabo AGORA (1 farol de 3 nodes = 3). No app,
   deixa a ordem de cor da fixture em RGB e ajusta a ordem AQUI — senão
   os dois lados reordenam e o teste mente. */
const int NODES = 3;               // ocupa os canais 1..NODES*3 do mapa
Adafruit_NeoPixel fita(NODES, PIN_PIXEL, NEO_GRB + NEO_KHZ800);

/* quadro[0] é o start code (0). O resto, canais 1..512. */
uint8_t quadro[DMX_PACKET_SIZE] = { 0 };
int tamanho = 513;                 // start code + 512 canais
uint32_t ultimoDado = 0;

void setup() {
  Serial.begin(BAUD);
  Serial.setRxBufferSize(2048);
  pinMode(PIN_LED, OUTPUT);

  dmx_config_t cfg = DMX_CONFIG_DEFAULT;
  dmx_driver_install(DMX, &cfg, NULL, 0);
  dmx_set_pin(DMX, PIN_TX, PIN_RX, PIN_EN);

  fita.begin();
  fita.show();                     // tudo apagado até chegar quadro
}

/* Canais 1.. viram pixels na mesma ordem do croqui: o app serializa
   R,G,B por node e aqui a NeoPixel cuida da ordem do chip. */
void mostraPixels() {
  for (int i = 0; i < NODES; i++) {
    int o = 1 + i * 3;             // +1 pula o start code
    fita.setPixelColor(i, quadro[o], quadro[o + 1], quadro[o + 2]);
  }
  fita.show();
}

/* Parser do quadro Enttec: 0x7E label lenL lenH payload 0xE7.
   Só o label 6 interessa; o resto é descartado em silêncio. */
void leSerial() {
  static enum { ESPERA, LABEL, LEN_L, LEN_H, DADO, FIM } st = ESPERA;
  static int label = 0, len = 0, pos = 0;
  static uint8_t corpo[DMX_PACKET_SIZE];

  while (Serial.available()) {
    uint8_t b = Serial.read();
    switch (st) {
      case ESPERA: if (b == 0x7E) st = LABEL; break;
      case LABEL:  label = b; st = LEN_L; break;
      case LEN_L:  len = b; st = LEN_H; break;
      case LEN_H:
        len |= b << 8;
        pos = 0;
        st = (len > 0 && len <= DMX_PACKET_SIZE) ? DADO : ESPERA;
        break;
      case DADO:
        corpo[pos++] = b;
        if (pos >= len) st = FIM;
        break;
      case FIM:
        if (b == 0xE7 && label == 6) {
          memcpy(quadro, corpo, len);      // corpo[0] já é o start code
          tamanho = max(len, 25);          // DMX de verdade não gosta de quadro anão
          ultimoDado = millis();
        }
        st = ESPERA;
        break;
    }
  }
}

void loop() {
  leSerial();

  /* Manda sempre, com ou sem dado novo: DMX é fita rolante, aparelho
     que fica 1s sem quadro entra em modo próprio. O pixel pega carona
     na mesma cadência (~30fps, limitada pelo quadro DMX de 513ch). */
  dmx_write(DMX, quadro, tamanho);
  dmx_send_num(DMX, tamanho);
  dmx_wait_sent(DMX, DMX_TIMEOUT_TICK);
  mostraPixels();

  // LED aceso = recebendo do sequenciador; piscando = segurando o último quadro
  bool vivo = millis() - ultimoDado < 2000;
  digitalWrite(PIN_LED, vivo ? HIGH : (millis() / 400) % 2);
}
