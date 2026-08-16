/* Parser/montador do protocolo serial — ver protocolo.h e docs/03. */

#include "protocolo.h"

#include <string.h>

/* CRC32 IEEE (o mesmo do zlib/PNG), bit a bit — sem tabela de 1KB na
   RAM. 8KB de chunk são ~65k iterações; centavos a 240MHz. Encadeável:
   proto_crc32(proto_crc32(0, a, na), b, nb) == crc32 de a+b. */
uint32_t proto_crc32(uint32_t crc, const uint8_t *dado, size_t len) {
  crc = ~crc;
  while (len--) {
    crc ^= *dado++;
    for (int k = 0; k < 8; k++)
      crc = (crc >> 1) ^ (0xEDB88320u & (uint32_t)-(int32_t)(crc & 1));
  }
  return ~crc;
}

size_t proto_monta(uint8_t *saida, size_t cap, uint8_t tipo,
                   const uint8_t *payload, size_t len) {
  if (len > PROTO_PAYLOAD_MAX) return 0;
  size_t total = PROTO_MOLDURA + len;
  if (cap < total) return 0;
  saida[0] = PROTO_MAGIC0;
  saida[1] = PROTO_MAGIC1;
  saida[2] = tipo;
  saida[3] = (uint8_t)(len & 0xFF);
  saida[4] = (uint8_t)(len >> 8);
  if (len) memcpy(saida + 5, payload, len);
  uint32_t crc = proto_crc32(0, saida + 2, 3 + len);
  saida[5 + len] = (uint8_t)(crc & 0xFF);
  saida[6 + len] = (uint8_t)(crc >> 8);
  saida[7 + len] = (uint8_t)(crc >> 16);
  saida[8 + len] = (uint8_t)(crc >> 24);
  return total;
}

void proto_inicia(proto_parser_t *p, proto_cb_t cb, void *ctx) {
  p->acc_len = 0;
  p->cb = cb;
  p->ctx = ctx;
  p->descartados = 0;
}

/* Varre o acumulador: entrega todo pacote íntegro, avança 1 byte sobre
   qualquer coisa que não fecha — CRC ruim, len absurdo, magic falso no
   meio de lixo. É o "avança 1", e não "joga tudo", que garante que um
   magic de verdade escondido atrás de bytes corrompidos ainda é achado. */
static void processa(proto_parser_t *p) {
  size_t i = 0;
  while (1) {
    while (p->acc_len - i >= 2 &&
           !(p->acc[i] == PROTO_MAGIC0 && p->acc[i + 1] == PROTO_MAGIC1)) {
      i++;
      p->descartados++;
    }
    if (p->acc_len - i < 5) break;                 /* moldura incompleta */
    uint16_t len = (uint16_t)(p->acc[i + 3] | p->acc[i + 4] << 8);
    if (len > PROTO_PAYLOAD_MAX) {                 /* magic falso        */
      i++;
      p->descartados++;
      continue;
    }
    size_t total = PROTO_MOLDURA + len;
    if (p->acc_len - i < total) break;             /* aguarda o resto    */

    const uint8_t *fim = p->acc + i + 5 + len;
    uint32_t lido = (uint32_t)fim[0] | (uint32_t)fim[1] << 8 |
                    (uint32_t)fim[2] << 16 | (uint32_t)fim[3] << 24;
    if (proto_crc32(0, p->acc + i + 2, 3 + len) == lido) {
      p->cb(p->acc[i + 2], p->acc + i + 5, len, p->ctx);
      i += total;
    } else {
      i++;
      p->descartados++;
    }
  }
  if (i) {
    memmove(p->acc, p->acc + i, p->acc_len - i);
    p->acc_len -= i;
  }
}

void proto_alimenta(proto_parser_t *p, const uint8_t *dado, size_t len) {
  while (len) {
    size_t espaco = sizeof(p->acc) - p->acc_len;
    if (espaco == 0) {
      /* cheio sem pacote completo: a cabeça não é começo de nada válido */
      memmove(p->acc, p->acc + 1, --p->acc_len);
      p->descartados++;
      espaco = 1;
    }
    size_t c = len < espaco ? len : espaco;
    memcpy(p->acc + p->acc_len, dado, c);
    p->acc_len += c;
    dado += c;
    len -= c;
    processa(p);
  }
}
