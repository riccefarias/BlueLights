/* Protocolo: moldura, CRC, e o que importa de verdade — a
   ressincronização quando a ponte serial corrompe byte. */

#include "../protocolo.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int falhas = 0;
#define OK(cond, msg) do { \
  if (!(cond)) { printf("FALHA: %s\n", msg); falhas++; } \
} while (0)

typedef struct {
  int recebidos;
  uint8_t tipos[32];
  size_t lens[32];
  uint8_t ultimo[PROTO_PAYLOAD_MAX];
} caixa_t;

static void cb(uint8_t tipo, const uint8_t *payload, size_t len, void *ctx) {
  caixa_t *c = ctx;
  c->tipos[c->recebidos % 32] = tipo;
  c->lens[c->recebidos % 32] = len;
  memcpy(c->ultimo, payload, len);
  c->recebidos++;
}

int main(void) {
  /* vetor conhecido do CRC32 IEEE */
  OK(proto_crc32(0, (const uint8_t *)"123456789", 9) == 0xCBF43926u,
     "crc32 do vetor classico");
  /* encadeamento parcial = de uma vez so */
  uint32_t parcial = proto_crc32(0, (const uint8_t *)"12345", 5);
  OK(proto_crc32(parcial, (const uint8_t *)"6789", 4) == 0xCBF43926u,
     "crc32 encadeado");

  static proto_parser_t p;
  caixa_t cx = { 0 };
  proto_inicia(&p, cb, &cx);

  /* pacote simples, alimentado byte a byte (pior caso da serial) */
  uint8_t pac[64];
  uint8_t dado[] = { 0xDE, 0xAD, 0xBE, 0xEF };
  size_t n = proto_monta(pac, sizeof(pac), PROTO_TEMPO, dado, sizeof(dado));
  OK(n == PROTO_MOLDURA + 4, "tamanho da moldura");
  for (size_t i = 0; i < n; i++) proto_alimenta(&p, pac + i, 1);
  OK(cx.recebidos == 1 && cx.tipos[0] == PROTO_TEMPO && cx.lens[0] == 4,
     "pacote inteiro chega byte a byte");
  OK(memcmp(cx.ultimo, dado, 4) == 0, "payload intacto");

  /* byte corrompido no payload: o pacote cai, o proximo passa */
  uint8_t ruim[64];
  memcpy(ruim, pac, n);
  ruim[6] ^= 0x40;
  proto_alimenta(&p, ruim, n);
  proto_alimenta(&p, pac, n);
  OK(cx.recebidos == 2, "crc ruim descarta so o pacote corrompido");
  OK(p.descartados > 0, "descartados contabilizados");

  /* lixo antes do magic: parser acha o pacote no meio */
  uint8_t sujo[80];
  memset(sujo, 0xB7, 8);                 /* magic0 repetido, sem magic1 */
  memcpy(sujo + 8, pac, n);
  proto_alimenta(&p, sujo, 8 + n);
  OK(cx.recebidos == 3, "acha pacote depois de lixo");

  /* magic DENTRO de payload corrompido nao pode engolir o pacote bom:
     um pacote grande corrompido carrega um pacote valido no payload */
  uint8_t interno[32];
  size_t ni = proto_monta(interno, sizeof(interno), PROTO_OI, NULL, 0);
  uint8_t grande[256];
  uint8_t carga[64];
  memset(carga, 0x55, sizeof(carga));
  memcpy(carga + 20, interno, ni);       /* pacote bom embutido */
  size_t ng = proto_monta(grande, sizeof(grande), PROTO_DADO, carga, sizeof(carga));
  grande[ng - 1] ^= 0xFF;                /* corrompe o crc do grande */
  proto_alimenta(&p, grande, ng);
  OK(cx.recebidos == 4 && cx.tipos[3] == PROTO_OI,
     "resgata pacote embutido em quadro corrompido");

  /* payload maximo passa; acima do maximo nem monta */
  static uint8_t max[PROTO_PAYLOAD_MAX];
  static uint8_t pmax[PROTO_MOLDURA + PROTO_PAYLOAD_MAX];
  memset(max, 0xA5, sizeof(max));
  size_t nm = proto_monta(pmax, sizeof(pmax), PROTO_DADO, max, sizeof(max));
  OK(nm == sizeof(pmax), "payload maximo monta");
  proto_alimenta(&p, pmax, nm);
  OK(cx.recebidos == 5 && cx.lens[4] == PROTO_PAYLOAD_MAX,
     "payload maximo atravessa");
  OK(proto_monta(pmax, sizeof(pmax), PROTO_DADO, max, PROTO_PAYLOAD_MAX + 1) == 0,
     "acima do maximo recusa");

  /* dois pacotes colados num write so */
  uint8_t dupla[128];
  memcpy(dupla, pac, n);
  memcpy(dupla + n, pac, n);
  proto_alimenta(&p, dupla, 2 * n);
  OK(cx.recebidos == 7, "pacotes colados separam");

  if (falhas) { printf("%d falha(s)\n", falhas); return 1; }
  printf("protocolo: tudo ok\n");
  return 0;
}
