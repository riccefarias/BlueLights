/* ============================================================
   PAINEL — a tela da TTGO T4 v1.3 como console do show.

   Só entra na compilação com BANCADA_T4 definido; no NodeMCU o
   arquivo some inteiro.

   Três páginas, trocadas pelo botão da esquerda:

     PAINEL  visão de trabalho — link, uma linha por SUBSISTEMA
             (pixel, DMX, relés, fumaça), mestre e cascata
     PALCO   os nodes em ladrilho grande, pra ler cor de longe.
             É aqui que mora o detalhe por node, não na home:
             o rig do carro passa de 10 faróis e vira confete
     INFO    diagnóstico — quadro ruim, uptime, heap, tempo de
             desenho, pinagem

   ⚠️ Nada aqui pode escrever na Serial: ela carrega o protocolo Enttec
   binário do sequenciador a 921600. Debug é na tela, não na serial.

   ---------- as duas regras que mantêm isto fluido ----------

   1) SÓ DESENHA O QUE MUDOU. Todo valor tem cache; repintar o que já
      está na tela custa SPI à toa e, pior, atrasa o loop — o buffer
      serial de 2048B enche em ~130ms a 30fps, então desenho lento vira
      quadro PERDIDO. Fonte proporcional da GFX não pinta fundo de forma
      confiável, o que obriga a apagar a faixa antes de escrever; fazer
      isso com texto que não mudou é flicker puro.

   2) ANIMAÇÃO ANDA POR TEMPO, NÃO POR QUADRO. O loop é preso ao
      dmx_wait_sent (~23ms), então o intervalo entre desenhos varia. O
      que anda contando desenho sai trêmulo; ancorado em millis(), não.

   O custo real de cada desenho aparece na página INFO ("tela"), pra a
   conversa sobre desempenho ser com número e não com achismo.
   ============================================================ */

#pragma once
#if defined(BANCADA_T4)

#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <SPI.h>
#include <Fonts/FreeSans9pt7b.h>
#include <Fonts/FreeSansBold12pt7b.h>

namespace painel {

/* Display da T4 v1.3. O SPI é o VSPI padrão do ESP32 (SCLK 18, MOSI 23),
   que é onde o display da placa está — por isso só CS, DC e RST precisam
   ser informados. MISO não entra: o painel é write-only. */
const int PIN_CS = 27, PIN_DC = 32, PIN_RST = 5, PIN_BL = 4;

const int LARG = 240, ALT = 320;
const int MAX_NODES = 170;              // 512 canais / 3

Adafruit_ILI9341 tela(PIN_CS, PIN_DC, PIN_RST);

uint32_t tempoDesenhoUs = 0;            // custo do último desenho

/* ---------- paleta ---------- */
uint16_t C_FUNDO, C_CARTAO, C_BORDA, C_TEXTO, C_FRACO, C_ACENTO;
uint16_t C_OK, C_ALERTA, C_ERRO, C_TRILHO;

void montaPaleta() {
  C_FUNDO  = tela.color565(9, 13, 18);
  C_CARTAO = tela.color565(20, 27, 36);
  C_BORDA  = tela.color565(38, 50, 64);
  C_TEXTO  = tela.color565(226, 234, 242);
  C_FRACO  = tela.color565(122, 138, 156);
  C_ACENTO = tela.color565(34, 211, 238);
  C_OK     = tela.color565(52, 211, 153);
  C_ALERTA = tela.color565(251, 191, 36);
  C_ERRO   = tela.color565(248, 113, 113);
  C_TRILHO = tela.color565(28, 37, 48);
}

/* ---------- estado que o sketch entrega ---------- */
struct Estado {
  const uint8_t *quadro;   // o que REALMENTE está saindo no cabo
  int nodes;
  bool recebendo;
  int fps;
  int canais;
  uint32_t quadros;
  uint32_t descartados;
  int pagina;              // 0 painel · 1 palco · 2 info
  bool teste;
  bool blackout;
};

/* ---------- geometria ---------- */
const int Y_CAB = 0,   H_CAB = 34;
const int Y_ST  = 40,  H_ST  = 50;
const int Y_SUB = 96,  H_SUB = 92;      // subsistemas
const int Y_MST = 194, H_MST = 34;      // mestre
const int Y_CAS = 234, H_CAS = 56;
const int Y_ROD = 296, H_ROD = 24;

/* ---------- caches ---------- */
int  cCascX = 0;
int  cPagina = -1;
bool cTeste = false, cBlack = false;
char cStatus[16] = "", cSub[40] = "", cMestre[10] = "";
char cLinha[4][34] = { "", "", "", "" };
int  cBarra[4] = { -1, -1, -1, -1 };
int  cMestreW = -1;
uint16_t cNode[MAX_NODES];
int  cNodesDesenhados = -1;
char cInfo[10][30];
uint32_t proxCascada = 0, proxPulso = 0;
bool cPulso = false;

void invalidaTudo() {
  cStatus[0] = cSub[0] = cMestre[0] = 0;
  for (int i = 0; i < 4; i++) { cLinha[i][0] = 0; cBarra[i] = -1; }
  for (int i = 0; i < 10; i++) cInfo[i][0] = 0;
  for (int i = 0; i < MAX_NODES; i++) cNode[i] = 0xFFFE;   // cor impossível
  cMestreW = -1;
  cNodesDesenhados = -1;
}

// devolve true (e atualiza o cache) só quando o texto realmente mudou
bool mudou(char *cache, size_t n, const char *novo) {
  if (strncmp(cache, novo, n - 1) == 0) return false;
  strncpy(cache, novo, n - 1);
  cache[n - 1] = 0;
  return true;
}

/* ---------- primitivas ---------- */

void cartao(int x, int y, int w, int h, const char *titulo) {
  tela.fillRoundRect(x, y, w, h, 6, C_CARTAO);
  tela.drawRoundRect(x, y, w, h, 6, C_BORDA);
  if (titulo) {
    tela.setFont();
    tela.setTextSize(1);
    tela.setTextColor(C_FRACO);
    tela.setCursor(x + 7, y + 5);
    tela.print(titulo);
  }
}

void miudo(int x, int y, int w, const char *s, uint16_t cor, uint16_t fundo) {
  tela.fillRect(x, y, w, 8, fundo);
  tela.setFont();
  tela.setTextSize(1);
  tela.setTextColor(cor);
  tela.setCursor(x, y);
  tela.print(s);
}

void grande(int x, int base, int w, int h, const char *s,
            const GFXfont *f, uint16_t cor, uint16_t fundo) {
  tela.fillRect(x, base - h + 3, w, h, fundo);
  tela.setFont(f);
  tela.setTextSize(1);
  tela.setTextColor(cor);
  tela.setCursor(x, base);
  tela.print(s);
  tela.setFont();
}

void barra(int x, int y, int w, int h, int valor255, uint16_t cor) {
  int p = valor255 * w / 255;
  tela.fillRoundRect(x, y, w, h, h / 2, C_TRILHO);
  if (p > h) tela.fillRoundRect(x, y, p, h, h / 2, cor);
}

/* ---------- cabeçalho ---------- */

void desenhaCabecalho() {
  tela.fillRect(0, Y_CAB, LARG, H_CAB, C_CARTAO);
  tela.fillRect(0, Y_CAB, 4, H_CAB, C_ACENTO);
  tela.drawFastHLine(0, Y_CAB + H_CAB - 1, LARG, C_BORDA);

  tela.setFont(&FreeSansBold12pt7b);
  tela.setTextColor(C_TEXTO);
  tela.setCursor(12, 24);
  tela.print("Blue");
  tela.setTextColor(C_ACENTO);
  tela.print("Lights");
  tela.setFont();

  tela.setTextColor(C_FRACO);
  tela.setCursor(152, 14);
  tela.print("BANCADA");
  tela.setCursor(152, 24);
  tela.print("T4 v1.3");
}

/* Ponto de link. Pulsa por RELÓGIO, não por quadro desenhado — senão o
   ritmo herda o tremor do loop. */
void desenhaPulso(const Estado &e) {
  if (millis() < proxPulso) return;
  proxPulso = millis() + 450;
  cPulso = !cPulso;

  uint16_t c = e.blackout ? C_ERRO : e.teste ? C_ALERTA
             : e.recebendo ? C_OK : C_FRACO;
  int r = (e.recebendo && cPulso) ? 6 : 4;
  tela.fillCircle(222, 17, 7, C_CARTAO);
  tela.fillCircle(222, 17, r, c);
}

/* ---------- rodapé ---------- */

void tecla(int i, const char *rot, bool ativo) {
  const int larg = LARG / 3;
  int x = i * larg;
  uint16_t fundo = ativo ? C_ACENTO : C_CARTAO;
  uint16_t cor   = ativo ? C_FUNDO  : C_FRACO;

  tela.fillRoundRect(x + 3, Y_ROD + 2, larg - 6, H_ROD - 5, 4, fundo);
  tela.drawRoundRect(x + 3, Y_ROD + 2, larg - 6, H_ROD - 5, 4, C_BORDA);
  tela.setFont();
  tela.setTextSize(1);
  tela.setTextColor(cor);
  tela.setCursor(x + (larg - (int)strlen(rot) * 6) / 2, Y_ROD + 9);
  tela.print(rot);
}

void desenhaRodape(const Estado &e) {
  tela.fillRect(0, Y_ROD, LARG, H_ROD, C_FUNDO);
  tela.drawFastHLine(0, Y_ROD, LARG, C_BORDA);
  tecla(0, "VISTA", false);
  tecla(1, "TESTE", e.teste);
  tecla(2, "BLACKOUT", e.blackout);
}

/* ---------- média de um trecho de canais ---------- */
int media(const uint8_t *q, int de, int ate) {
  if (ate <= de) return 0;
  uint32_t s = 0;
  for (int i = de; i < ate; i++) s += q[i];
  return s / (ate - de);
}

/* ---------- página PAINEL ---------- */

void desenhaStatus(const Estado &e) {
  const char *txt = e.blackout ? "BLACKOUT" : e.teste ? "AUTOTESTE"
                  : e.recebendo ? "RECEBENDO" : "SEM SINAL";
  uint16_t cor = e.blackout ? C_ERRO : e.teste ? C_ALERTA
               : e.recebendo ? C_OK : C_FRACO;

  if (mudou(cStatus, sizeof(cStatus), txt))
    grande(12, Y_ST + 26, 160, 22, txt, &FreeSansBold12pt7b, cor, C_CARTAO);

  char buf[40];
  snprintf(buf, sizeof(buf), "%d fps   %d ch   %lu quadros",
           e.fps, e.canais, (unsigned long)e.quadros);
  if (mudou(cSub, sizeof(cSub), buf))
    miudo(12, Y_ST + 34, 210, buf, C_FRACO, C_CARTAO);
}

/* Uma linha por subsistema. É o que escala: o carro vai ter 10+ faróis,
   mais relé, fumaça e cabeça — grade de node viraria confete aqui. */
void desenhaSubsistemas(const Estado &e) {
  const int y0 = Y_SUB + 18, passo = 18;
  const int xBar = 150, wBar = 78;

  int fimPixel = 1 + e.nodes * 3;
  struct Linha { const char *nome; char val[16]; int nivel; uint16_t cor; };
  Linha L[4];

  L[0].nome = "PIXEL";
  snprintf(L[0].val, sizeof(L[0].val), "%d fx  1-%d", e.nodes, e.nodes * 3);
  L[0].nivel = media(e.quadro, 1, fimPixel);
  L[0].cor = C_ACENTO;

  L[1].nome = "DMX";
  snprintf(L[1].val, sizeof(L[1].val), "%d ch", e.canais);
  L[1].nivel = media(e.quadro, fimPixel, e.canais + 1);
  L[1].cor = C_OK;

  L[2].nome = "RELES";
  snprintf(L[2].val, sizeof(L[2].val), "previsto");
  L[2].nivel = -1;
  L[2].cor = C_FRACO;

  L[3].nome = "FUMACA";
  snprintf(L[3].val, sizeof(L[3].val), "previsto 3ch");
  L[3].nivel = -1;
  L[3].cor = C_FRACO;

  for (int i = 0; i < 4; i++) {
    int y = y0 + i * passo;
    char linha[34];
    snprintf(linha, sizeof(linha), "%-7s %s", L[i].nome, L[i].val);
    if (mudou(cLinha[i], sizeof(cLinha[i]), linha)) {
      miudo(14, y, 130, L[i].nome, L[i].cor, C_CARTAO);
      miudo(62, y, 84, L[i].val, C_TEXTO, C_CARTAO);
    }
    if (L[i].nivel < 0) {
      if (cBarra[i] != -2) { miudo(xBar, y, wBar, "--", C_TRILHO, C_CARTAO); cBarra[i] = -2; }
    } else if (abs(L[i].nivel - cBarra[i]) > 3) {
      cBarra[i] = L[i].nivel;
      barra(xBar, y - 1, wBar, 8, L[i].nivel, L[i].cor);
    }
  }
}

void desenhaMestre(const Estado &e) {
  int nivel = media(e.quadro, 1, e.canais + 1);
  int w = nivel * (LARG - 88) / 255;
  if (abs(w - cMestreW) > 2) {
    cMestreW = w;
    barra(70, Y_MST + 12, LARG - 88, 10, nivel, C_TEXTO);
  }
  char buf[8];
  snprintf(buf, sizeof(buf), "%3d%%", nivel * 100 / 255);
  if (mudou(cMestre, sizeof(cMestre), buf))
    miudo(14, Y_MST + 13, 44, buf, C_TEXTO, C_CARTAO);
}

/* Cascata: X é tempo, Y é o node. Uma coluna por INTERVALO DE RELÓGIO,
   não por desenho — assim a rolagem tem velocidade constante. */
void desenhaCascata(const Estado &e) {
  if (millis() < proxCascada) return;
  proxCascada = millis() + 70;

  const int x0 = 8, larg = LARG - 16;
  const int y0 = Y_CAS + 14, h = H_CAS - 20;
  int x = x0 + cCascX;
  int fatia = h / e.nodes;
  if (fatia < 1) fatia = 1;

  for (int i = 0; i < e.nodes; i++) {
    int o = 1 + i * 3;
    uint16_t c = tela.color565(e.quadro[o], e.quadro[o + 1], e.quadro[o + 2]);
    int y = y0 + i * fatia;
    if (y + fatia > y0 + h) break;
    tela.drawFastVLine(x, y, fatia, c);
  }
  int usado = e.nodes * fatia;
  if (usado < h) tela.drawFastVLine(x, y0 + usado, h - usado, C_TRILHO);

  cCascX = (cCascX + 1) % larg;
  tela.drawFastVLine(x0 + cCascX, y0, h, C_ACENTO);
}

/* ---------- página PALCO ---------- */

void dimensoes(int nodes, int larg, int alt, int &cols, int &linhas, int &cel) {
  cols = 1; cel = 0;
  for (int c = 1; c <= nodes; c++) {
    int l = (nodes + c - 1) / c;
    int t = min(larg / c, alt / l);
    if (t > cel) { cel = t; cols = c; }
  }
  linhas = (nodes + cols - 1) / cols;
  if (cel < 4) cel = 4;
}

void desenhaPalco(const Estado &e) {
  const int y0area = Y_ST + 16, halt = Y_ROD - Y_ST - 28;
  int cols, linhas, cel;
  int n = min(e.nodes, MAX_NODES);
  dimensoes(n, LARG - 24, halt, cols, linhas, cel);
  int x0 = (LARG - cols * cel) / 2;
  int y0 = y0area + (halt - linhas * cel) / 2;
  int vao = cel > 14 ? 3 : 1;

  for (int i = 0; i < n; i++) {
    int o = 1 + i * 3;
    uint16_t c = tela.color565(e.quadro[o], e.quadro[o + 1], e.quadro[o + 2]);
    if (c == cNode[i]) continue;               // não mudou, não repinta
    cNode[i] = c;

    int x = x0 + (i % cols) * cel;
    int y = y0 + (i / cols) * cel;
    int lado = cel - vao * 2;
    int raio = lado > 16 ? 4 : 2;

    tela.fillRoundRect(x + vao, y + vao, lado, lado, raio, c);
    tela.drawRoundRect(x + vao, y + vao, lado, lado, raio, C_BORDA);

    if (lado >= 22) {
      char nm[4];
      snprintf(nm, sizeof(nm), "%d", i + 1);
      int soma = e.quadro[o] + e.quadro[o + 1] + e.quadro[o + 2];
      int tam = lado >= 40 ? 2 : 1;
      tela.setFont();
      tela.setTextSize(tam);
      tela.setTextColor(soma > 300 ? C_FUNDO : C_TEXTO);
      int cw = 6 * tam * strlen(nm), ch = 8 * tam;
      tela.setCursor(x + vao + (lado - cw) / 2, y + vao + (lado - ch) / 2);
      tela.print(nm);
      tela.setTextSize(1);
    }
  }
}

/* ---------- página INFO ---------- */

void desenhaInfo(const Estado &e) {
  char v[10][30];
  uint32_t s = millis() / 1000;
  snprintf(v[0], 30, "%02u:%02u:%02u", s / 3600, (s / 60) % 60, s % 60);
  snprintf(v[1], 30, "%lu", (unsigned long)e.quadros);
  snprintf(v[2], 30, "%lu", (unsigned long)e.descartados);
  snprintf(v[3], 30, "%d fps", e.fps);
  snprintf(v[4], 30, "%d ch", e.canais);
  snprintf(v[5], 30, "%lu.%lu ms", (unsigned long)(tempoDesenhoUs / 1000),
                                   (unsigned long)((tempoDesenhoUs / 100) % 10));
  snprintf(v[6], 30, "%u KB", (unsigned)(ESP.getFreeHeap() / 1024));
  snprintf(v[7], 30, "GPIO21 (SDA)");
  snprintf(v[8], 30, "TX26  EN33");
  snprintf(v[9], 30, "38  37  39");

  const char *rot[10] = { "uptime", "quadros ok", "quadros ruins", "cadencia",
                          "canais/quadro", "tela", "heap livre",
                          "pixel", "dmx", "botoes" };

  int y = Y_ST + 18;
  for (int i = 0; i < 10; i++) {
    if (mudou(cInfo[i], sizeof(cInfo[i]), v[i])) {
      miudo(16, y, 100, rot[i], C_FRACO, C_CARTAO);
      miudo(122, y, 106, v[i],
            (i == 2 && e.descartados) ? C_ALERTA : C_TEXTO, C_CARTAO);
    }
    y += 13;
  }
}

/* ---------- moldura por página ---------- */

void moldura(const Estado &e) {
  tela.fillRect(0, Y_CAB + H_CAB, LARG, Y_ROD - H_CAB, C_FUNDO);
  invalidaTudo();

  if (e.pagina == 0) {
    cartao(6, Y_ST,  LARG - 12, H_ST,  NULL);
    cartao(6, Y_SUB, LARG - 12, H_SUB, "SAIDAS");
    cartao(6, Y_MST, LARG - 12, H_MST, "MESTRE");
    cartao(6, Y_CAS, LARG - 12, H_CAS, "CASCATA");
    cCascX = 0;
  } else if (e.pagina == 1) {
    cartao(6, Y_ST, LARG - 12, Y_ROD - Y_ST - 6, "PALCO");
  } else {
    cartao(6, Y_ST, LARG - 12, Y_ROD - Y_ST - 6, "DIAGNOSTICO");
  }
}

/* ---------- API ---------- */

void iniciar() {
  pinMode(PIN_BL, OUTPUT);
  digitalWrite(PIN_BL, HIGH);          // backlight fixo: estado vai pra tela

  tela.begin(40000000);                // 40MHz é o teto do ILI9341
  tela.setRotation(0);                 // retrato 240x320
  montaPaleta();
  tela.fillScreen(C_FUNDO);
  desenhaCabecalho();
  invalidaTudo();
}

void desenhar(const Estado &e) {
  uint32_t t0 = micros();

  if (e.pagina != cPagina) { moldura(e); cPagina = e.pagina; }
  if (e.teste != cTeste || e.blackout != cBlack) {
    desenhaRodape(e);
    cTeste = e.teste; cBlack = e.blackout;
  }

  desenhaPulso(e);

  if (e.pagina == 0) {
    desenhaStatus(e);
    desenhaSubsistemas(e);
    desenhaMestre(e);
    desenhaCascata(e);
  } else if (e.pagina == 1) {
    desenhaPalco(e);
  } else {
    desenhaInfo(e);
  }

  tempoDesenhoUs = micros() - t0;
}

}  // namespace painel
#endif  // BANCADA_T4
