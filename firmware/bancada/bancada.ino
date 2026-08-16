/* ============================================================
   BANCADA — a placa da gaveta vira a saída do sequenciador.
   (ESP32 comum: pixel + DMX. NodeMCU v3/ESP8266: só pixel.)

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

   O MESMO sketch compila pra NodeMCU v3 (ESP8266): sai só a saída
   DMX (esp_dmx é ESP32-only) — a de pixel, que é a que os faróis
   usam, fica inteira. Pino de dado: D2, que É o GPIO4. Cuidado do
   8266: o show() da NeoPixel desliga interrupção — com poucos nodes
   (bancada) é invisível; corrente longa começaria a comer bytes da
   serial.
   ============================================================ */

#include <Arduino.h>
#include <Adafruit_NeoPixel.h>
#if defined(ESP32)
#include <esp_dmx.h>
#else
#define DMX_PACKET_SIZE 513
#endif

/* Comenta se a placa NÃO for a TTGO T4 v1.3 (display + SD). Nela os
   pinos padrão não servem: GPIO4 é o backlight do TFT, GPIO2 é o MISO
   do SD e GPIO16/17 pertencem à PSRAM. O pixel sai no GPIO21, que é o
   pino SDA do conector branco de 5 vias (GND 5V SDA SCL 3V3) — farol
   liga ali sem solda: dado, 5V e GND no mesmo conector.

   Conferido na placa (ESP32-D0WDQ6-V3, flash 4MB): a PSRAM existe e
   dá 4MB — não 8MB, que aliás o ESP32 clássico nem endereça. O que
   importa não muda: GPIO16/17 estão ocupados por ela. */
#define BANCADA_T4

#if defined(BANCADA_T4) && !defined(ESP32)
#error "BANCADA_T4 e so da TTGO T4 (ESP32). Pra gravar no NodeMCU, comente o #define BANCADA_T4 acima."
#endif

#if defined(BANCADA_T4)
const int PIN_LED = 4;             // backlight do TFT (ver PAINEL abaixo)
const int PIN_PIXEL = 21;          // SDA do conector de 5 vias
#else
const int PIN_LED = 2;             // no NodeMCU é o LED da placa (aceso em LOW)
const int PIN_PIXEL = 4;           // ESP32: GPIO4 | NodeMCU: D2 (mesmo GPIO4)
#endif
const long BAUD = 921600;
#if defined(ESP32)
#if defined(BANCADA_T4)
const int PIN_TX = 26, PIN_RX = -1, PIN_EN = 33;   // os 2 GPIOs livres da T4
#else
const int PIN_TX = 17, PIN_RX = 16, PIN_EN = 21;
#endif
const dmx_port_t DMX = DMX_NUM_1;
#endif

/* Medido: cada farol AJK é UM node (as 3 lentes são o mesmo pixel), então
   NODES conta FARÓIS. Ocupa os canais 1..NODES*3 do mapa. Node a mais que
   o cabo tem é só ignorado — sobra não quebra nada, então vale deixar no
   tamanho do croqui (6 faróis no RIG_PADRAO do sequenciador).

   No app, a ordem de cor da fixture fica em RGB e a tradução é AQUI —
   os dois lados reordenando ao mesmo tempo é teste que mente. */
const int NODES = 6;

/* NEO_BGR medido no farol AJK, não chutado: mandando um byte de cada vez
   pelo fio, o 1º acendeu azul, o 2º verde e o 3º vermelho.
   NEO_KHZ400 idem: o chip aceita, e 400kHz dobra a margem de timing. */
Adafruit_NeoPixel fita(NODES, PIN_PIXEL, NEO_BGR + NEO_KHZ400);

#if defined(BANCADA_T4)
/* Os 3 botões frontais da T4, achados por varredura: são pinos SÓ ENTRADA
   (34..39 não têm pull-up interno no ESP32), com pull-up externo da placa,
   e fecham pra GND — ou seja, ativos em BAIXO.
   Ordem física da esquerda pra direita. */
const int BTN_VISTA = 38;          // troca a página da tela
const int BTN_TESTE = 37;          // autoteste de fiação, liga/desliga
const int BTN_BLACK = 39;          // blackout, liga/desliga

/* Sem sinal, a placa SEGURA o último quadro — não inventa animação
   sozinha. Varredura local é coisa deliberada, no botão TESTE. */
#endif

#include "painel_t4.h"             // só compila algo se BANCADA_T4

/* quadro[0] é o start code (0). O resto, canais 1..512. */
uint8_t quadro[DMX_PACKET_SIZE] = { 0 };
int tamanho = 513;                 // start code + 512 canais
uint32_t ultimoDado = 0;
uint32_t quadrosOk = 0;            // quantos quadros válidos já entraram

/* Quadro que chegou com cabeçalho/terminador errado. Ponte serial não tem
   detecção de erro nenhuma (ver ../README.md), então esse contador é o
   termômetro do cabo USB: subindo, é ruído ou baud apertado demais. */
uint32_t quadrosRuins = 0;

/* O que sai no cabo pode não ser o que chegou: blackout zera e autoteste
   substitui. Tela, pixel e DMX olham todos para cá, então o que aparece na
   tela é sempre o que está saindo de verdade. */
uint8_t saida[DMX_PACKET_SIZE] = { 0 };

void setup() {
  Serial.setRxBufferSize(2048);    // antes do begin — no ESP32 depois não vale
  Serial.begin(BAUD);
  pinMode(PIN_LED, OUTPUT);

#if defined(ESP32)
  dmx_config_t cfg = DMX_CONFIG_DEFAULT;
  dmx_driver_install(DMX, &cfg, NULL, 0);
  dmx_set_pin(DMX, PIN_TX, PIN_RX, PIN_EN);
#endif

  fita.begin();
  fita.show();                     // tudo apagado até chegar quadro

#if defined(BANCADA_T4)
  pinMode(BTN_VISTA, INPUT);       // 34..39 não têm pull-up interno;
  pinMode(BTN_TESTE, INPUT);       // o pull-up é externo, da placa
  pinMode(BTN_BLACK, INPUT);
  painel::iniciar();
#endif
}

/* AUTOTESTE — varre os nodes um a um em branco, com rastro curto. Serve
   pra achar farol morto e conferir a ordem FÍSICA da corrente sem PC:
   o node que acende tem que andar na mesma direção do cabo.
   Escreve na saída, nunca no quadro recebido. */
void autoteste(uint8_t *dest) {
  memset(dest + 1, 0, NODES * 3);
  int fase = (millis() / 400) % NODES;
  for (int i = 0; i < NODES; i++) {
    int dist = (i - fase + NODES) % NODES;
    uint8_t v = dist == 0 ? 255 : dist == 1 ? 40 : 0;
    if (!v) continue;
    int o = 1 + i * 3;
    dest[o] = dest[o + 1] = dest[o + 2] = v;
  }
}

/* Canais 1.. viram pixels na mesma ordem do croqui: o app serializa
   R,G,B por node e aqui a NeoPixel cuida da ordem do chip. */
void mostraPixels(const uint8_t *fonte) {
  for (int i = 0; i < NODES; i++) {
    int o = 1 + i * 3;             // +1 pula o start code
    fita.setPixelColor(i, fonte[o], fonte[o + 1], fonte[o + 2]);
  }
  fita.show();
}

#if defined(BANCADA_T4)
/* Botões ativos em BAIXO. Só a borda de descida conta, com trava de 180ms:
   sem ela um toque vira três, porque o loop gira a ~40Hz.

   TESTE e BLACKOUT se excluem — os dois ligados ao mesmo tempo seria uma
   varredura invisível, que só confunde quem está olhando o cabo. */
void leBotoes(int &pagina, bool &teste, bool &blackout) {
  static const int pinos[3] = { BTN_VISTA, BTN_TESTE, BTN_BLACK };
  static bool anterior[3] = { true, true, true };
  static uint32_t trava[3] = { 0, 0, 0 };

  for (int i = 0; i < 3; i++) {
    bool nivel = digitalRead(pinos[i]);
    bool desceu = anterior[i] && !nivel;
    anterior[i] = nivel;
    if (!desceu || millis() - trava[i] < 180) continue;
    trava[i] = millis();

    switch (i) {
      case 0: pagina = (pagina + 1) % 3; break;
      case 1: teste = !teste;    if (teste)    blackout = false; break;
      case 2: blackout = !blackout; if (blackout) teste = false; break;
    }
  }
}
#endif

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
        if (b == 0xE7) {
          if (label == 6) {
            memcpy(quadro, corpo, len);    // corpo[0] já é o start code
            tamanho = max(len, 25);        // DMX de verdade não gosta de quadro anão
            ultimoDado = millis();
            quadrosOk++;
          }
          // outro label é quadro Enttec legítimo que não nos interessa:
          // descarta calado, sem contar como erro
        } else {
          quadrosRuins++;                  // terminador errado = quadro corrompido
        }
        st = ESPERA;
        break;
    }
  }
}

void loop() {
  leSerial();

  bool vivo = millis() - ultimoDado < 2000;

#if defined(BANCADA_T4)
  static int pagina = 0;
  static bool teste = false, blackout = false;
  leBotoes(pagina, teste, blackout);
#else
  const bool teste = false, blackout = false;
#endif

  /* Decide o que REALMENTE sai no cabo. Sem sinal, segura o último quadro
     — não inventa animação: carro apagado é problema do firmware do show,
     na bancada surpresa é pior que escuro. */
  if (blackout)     memset(saida, 0, sizeof(saida));
  else if (teste)   autoteste(saida);
  else              memcpy(saida, quadro, tamanho);

  /* Manda sempre, com ou sem dado novo: DMX é fita rolante, aparelho
     que fica 1s sem quadro entra em modo próprio. O pixel pega carona
     na mesma cadência (~30fps, limitada pelo quadro DMX de 513ch). */
#if defined(ESP32)
  dmx_write(DMX, saida, tamanho);
  dmx_send_num(DMX, tamanho);
  dmx_wait_sent(DMX, DMX_TIMEOUT_TICK);
  mostraPixels(saida);
#else
  /* Sem DMX segurando o ritmo, quem dá a cadência é o relógio. */
  static uint32_t proximo = 0;
  if ((int32_t)(millis() - proximo) >= 0) {
    proximo = millis() + 33;       // ~30fps, igual ao lado ESP32
    mostraPixels(saida);
  }
#endif

#if defined(BANCADA_T4)
  /* Na T4 o backlight fica FIXO aceso e quem conta o estado é a tela —
     backlight piscando atrás de uma UI só atrapalha a leitura.
     Atualiza a ~15fps: metade da cadência do link, invisível pro olho e
     deixa a CPU pro que importa (ler serial e mandar quadro). */
  static uint32_t proximaTela = 0, marcoFps = 0;
  static uint32_t quadrosMarco = 0;
  static int fps = 0;

  if (millis() - marcoFps >= 1000) {
    marcoFps = millis();
    fps = quadrosOk - quadrosMarco;
    quadrosMarco = quadrosOk;
  }
  if ((int32_t)(millis() - proximaTela) >= 0) {
    proximaTela = millis() + 66;
    painel::Estado e = { saida, NODES, vivo, fps, tamanho - 1,
                         quadrosOk, quadrosRuins, pagina, teste, blackout };
    painel::desenhar(e);
  }
#else
  // LED aceso = recebendo do sequenciador; piscando = segurando o último quadro
  int led = vivo ? HIGH : (millis() / 400) % 2;
#if !defined(ESP32)
  led = !led;                      // o LED do NodeMCU acende em LOW
#endif
  digitalWrite(PIN_LED, led);
#endif
}
