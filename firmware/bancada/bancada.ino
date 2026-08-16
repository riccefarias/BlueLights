/* ============================================================
   BANCADA — ESP32 comum + MAX485 = ponte USB→DMX.

   Não é o firmware do show (esse é o da T-CAN485, com SD e fseq).
   Isto é a bancada: o sequenciador manda quadros pela serial USB e
   isto vira DMX no cabo — pra testar strobo, cabeça e tabela de
   canais com aparelho de verdade, antes do firmware grande existir.

   Protocolo: Enttec DMX USB Pro (label 6 = enviar DMX). É o padrão
   de facto — além do nosso WebSerial, QLC+ e xLights enxergam a
   placa como um dongle Enttec.

   Fiação (ESP32 devkit comum + módulo MAX485):
     GPIO17 → DI      (dado)
     GPIO21 → DE e RE (juntos — só transmitimos)
     5V     → VCC
     GND    → GND     (comum com o aparelho DMX!)
     A      → XLR pino 3 (Data+)
     B      → XLR pino 2 (Data−)
     XLR pino 1 → GND

   Biblioteca: esp_dmx (Mitch Weisbrod) — testado com a série 4.1.x.
   Serial a 921600 (CH340/CP2102 aguentam).
   ============================================================ */

#include <Arduino.h>
#include <esp_dmx.h>

const int PIN_TX = 17, PIN_RX = 16, PIN_EN = 21, PIN_LED = 2;
const long BAUD = 921600;
const dmx_port_t DMX = DMX_NUM_1;

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
     que fica 1s sem quadro entra em modo próprio (strobo dispara solo). */
  dmx_write(DMX, quadro, tamanho);
  dmx_send_num(DMX, tamanho);
  dmx_wait_sent(DMX, DMX_TIMEOUT_TICK);

  // LED aceso = recebendo do sequenciador; piscando = segurando o último quadro
  bool vivo = millis() - ultimoDado < 2000;
  digitalWrite(PIN_LED, vivo ? HIGH : (millis() / 400) % 2);
}
