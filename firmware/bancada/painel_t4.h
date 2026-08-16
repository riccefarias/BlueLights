/* ============================================================
   PAINEL — a tela da TTGO T4 v1.3 mostrando o show ao vivo.

   Só entra na compilação quando BANCADA_T4 está definido; no
   NodeMCU o arquivo inteiro some.

   O que aparece:
     - estado do link com o sequenciador (recebendo / sem sinal / demo)
     - fps real, tamanho do quadro e contador de quadros
     - grade com a cor de CADA node — dá pra conferir mapeamento e
       ordem de cor sem ter farol nenhum ligado no cabo
     - barras de nível R/G/B do quadro
     - cascata: eixo X é tempo, eixo Y é o node. É a timeline do que
       já saiu no cabo, rolando sozinha

   Por que Adafruit_GFX e não TFT_eSPI: a Adafruit recebe os pinos no
   CONSTRUTOR, em tempo de execução. Não precisa de User_Setup.h nem de
   flag de compilação, então este sketch abre no Arduino IDE e grava,
   sem mexer na configuração global da TFT_eSPI (que quebraria os
   outros projetos da máquina).

   ⚠️ Nada aqui pode escrever na Serial: ela carrega o protocolo Enttec
   binário do sequenciador a 921600. Debug é na tela, não na serial.
   ============================================================ */

#pragma once
#if defined(BANCADA_T4)

#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <SPI.h>

namespace painel {

/* Display da T4 v1.3. O SPI é o VSPI padrão do ESP32 (SCLK 18, MOSI 23),
   que é exatamente onde o display da placa está — por isso só CS, DC e
   RST precisam ser informados. MISO não é usado: o painel desta placa é
   write-only, ler registrador dele devolve zero. */
const int PIN_CS = 27, PIN_DC = 32, PIN_RST = 5, PIN_BL = 4;

const int LARG = 240, ALT = 320;

// faixas verticais do layout
const int Y_STATUS = 34;
const int Y_INFO   = 58;
const int Y_GRADE  = 86,  H_GRADE = 84;
const int Y_BARRAS = 182;
const int Y_CASC   = 226, H_CASC  = 74;
const int Y_RODAPE = 306;

const uint16_t COR_FUNDO  = ILI9341_BLACK;
const uint16_t COR_TITULO = 0x018B;          // azul escuro da barra
const uint16_t COR_FRACA  = 0x4208;          // cinza de moldura

Adafruit_ILI9341 tela(PIN_CS, PIN_DC, PIN_RST);

int cascX = 0;                                // coluna atual da cascata
int nodesGrade = 0;                           // quantos nodes a grade desenhou

/* Divide os nodes na área da grade procurando a divisão que dá a maior
   célula possível. Com 3 nodes viram 3 quadrões; com 100, quadradinhos. */
void dimensoesGrade(int nodes, int &cols, int &linhas, int &cel) {
  cols = 1; cel = 0;
  for (int c = 1; c <= nodes; c++) {
    int l = (nodes + c - 1) / c;
    int t = min((LARG - 8) / c, H_GRADE / l);
    if (t > cel) { cel = t; cols = c; }
  }
  linhas = (nodes + cols - 1) / cols;
  if (cel < 3) cel = 3;
}

void textoEm(int x, int y, const char *s, uint16_t cor, uint8_t tam = 1,
             uint16_t fundo = COR_FUNDO) {
  tela.setTextColor(cor, fundo);
  tela.setTextSize(tam);
  tela.setCursor(x, y);
  tela.print(s);
}

/* Desenha o que nunca muda. Chamado uma vez no boot. */
void iniciar(int nodes, int pinPixel, int pinTx, int pinEn) {
  pinMode(PIN_BL, OUTPUT);
  digitalWrite(PIN_BL, HIGH);                 // backlight fixo: o estado
                                              // agora é mostrado na tela
  tela.begin();
  tela.setRotation(0);                        // retrato 240x320
  tela.fillScreen(COR_FUNDO);

  tela.fillRect(0, 0, LARG, 26, COR_TITULO);
  textoEm(6, 6, "BlueLights", ILI9341_WHITE, 2, COR_TITULO);
  textoEm(140, 12, "BANCADA", ILI9341_CYAN, 1, COR_TITULO);

  textoEm(6, 74, "NODES", COR_FRACA, 1);
  textoEm(6, 170, "NIVEL", COR_FRACA, 1);
  textoEm(6, 214, "CASCATA  <- tempo", COR_FRACA, 1);

  tela.drawRect(4, Y_CASC - 2, LARG - 8, H_CASC + 4, COR_FRACA);

  char buf[42];
  snprintf(buf, sizeof(buf), "PIXEL GPIO%d  %d nodes", pinPixel, nodes);
  textoEm(6, Y_RODAPE, buf, ILI9341_DARKGREY, 1);
  snprintf(buf, sizeof(buf), "DMX TX%d EN%d", pinTx, pinEn);
  textoEm(6, Y_RODAPE + 10, buf, ILI9341_DARKGREY, 1);

  nodesGrade = nodes;
}

/* Estado do link, em letra grande. */
void desenhaStatus(int estado, int fps, int canais, uint32_t quadros) {
  static int ultEstado = -1;
  if (estado != ultEstado) {
    ultEstado = estado;
    const char *txt = estado == 2 ? "RECEBENDO " : estado == 1 ? "SEM SINAL " : "DEMO LOCAL";
    uint16_t cor = estado == 2 ? ILI9341_GREEN : estado == 1 ? ILI9341_RED : ILI9341_YELLOW;
    textoEm(6, Y_STATUS, txt, cor, 2);
  }

  char buf[40];
  snprintf(buf, sizeof(buf), "fps %2d  ch %3d  q %6lu",
           fps, canais, (unsigned long)quadros);
  textoEm(6, Y_INFO, buf, ILI9341_WHITE, 1);
}

/* Uma célula por node, com a cor que está indo pro cabo. */
void desenhaGrade(const uint8_t *quadro, int nodes) {
  int cols, linhas, cel;
  dimensoesGrade(nodes, cols, linhas, cel);
  int x0 = (LARG - cols * cel) / 2;
  int y0 = Y_GRADE + (H_GRADE - linhas * cel) / 2;
  int vao = cel > 6 ? 2 : 0;                  // respiro só se couber

  for (int i = 0; i < nodes; i++) {
    int o = 1 + i * 3;                        // +1 pula o start code
    uint16_t c = tela.color565(quadro[o], quadro[o + 1], quadro[o + 2]);
    int x = x0 + (i % cols) * cel;
    int y = y0 + (i / cols) * cel;
    tela.fillRect(x + vao, y + vao, cel - vao * 2, cel - vao * 2, c);
    if (cel > 10) tela.drawRect(x, y, cel, cel, COR_FRACA);
  }
}

/* Barras R/G/B com a média do quadro — pega ordem de cor trocada de relance. */
void desenhaBarras(const uint8_t *quadro, int nodes) {
  uint32_t soma[3] = {0, 0, 0};
  for (int i = 0; i < nodes; i++)
    for (int c = 0; c < 3; c++) soma[c] += quadro[1 + i * 3 + c];

  const uint16_t cores[3] = {ILI9341_RED, ILI9341_GREEN, ILI9341_BLUE};
  const char *rot[3] = {"R", "G", "B"};
  const int larguraMax = LARG - 40;

  for (int c = 0; c < 3; c++) {
    int y = Y_BARRAS + c * 12;
    int v = nodes ? (int)(soma[c] / nodes) : 0;
    int w = v * larguraMax / 255;
    textoEm(6, y, rot[c], cores[c], 1);
    tela.fillRect(20, y, w, 8, cores[c]);
    tela.fillRect(20 + w, y, larguraMax - w, 8, COR_FUNDO);
  }
}

/* Cascata: cada atualização vira UMA coluna. X é tempo, Y é o node.
   Custa 1 drawFastVLine por node, então roda barato mesmo a 15fps. */
void desenhaCascata(const uint8_t *quadro, int nodes) {
  int x = 6 + cascX;
  int fatia = H_CASC / nodes;
  if (fatia < 1) fatia = 1;

  for (int i = 0; i < nodes; i++) {
    int o = 1 + i * 3;
    uint16_t c = tela.color565(quadro[o], quadro[o + 1], quadro[o + 2]);
    int y = Y_CASC + i * fatia;
    if (y + fatia > Y_CASC + H_CASC) break;
    tela.drawFastVLine(x, y, fatia, c);
  }
  // resto da coluna (quando nodes não divide a altura) fica preto
  int usado = nodes * fatia;
  if (usado < H_CASC) tela.drawFastVLine(x, Y_CASC + usado, H_CASC - usado, COR_FUNDO);

  cascX = (cascX + 1) % (LARG - 12);
  tela.drawFastVLine(6 + cascX, Y_CASC, H_CASC, ILI9341_WHITE);   // cursor
}

/* estado: 2 recebendo, 1 sem sinal, 0 demo local */
void atualizar(const uint8_t *quadro, int nodes, int estado,
               int fps, int canais, uint32_t quadros) {
  desenhaStatus(estado, fps, canais, quadros);
  desenhaGrade(quadro, nodes);
  desenhaBarras(quadro, nodes);
  desenhaCascata(quadro, nodes);
}

}  // namespace painel
#endif  // BANCADA_T4
