/* ============================================================
   PROTOCOLO — mídia ↔ placa pela serial USB (docs/03).

   A ponte CH9102 não detecta erro nenhum, então o pacote carrega
   CRC32 próprio e o parser é uma máquina de estados que ressincroniza
   sozinha: byte corrompido derruba UM pacote, nunca a sessão.

   Moldura (little-endian):

     0xB7 0x4C | tipo u8 | len u16 | payload[len] | crc32 u32

   crc32 (IEEE, o mesmo do zlib) cobre tipo + len + payload.
   len máximo de payload: 8KB (chunk do upload, docs/03).

   Tipos, mídia → placa:
     0x01 OI        payload vazio — quem tá aí?
     0x02 LISTA     payload vazio — manda o manifest
     0x03 COMECA    nome NUL-terminado + u32 tamanho + u32 crc32 do
                    arquivo inteiro. Placa responde ACK com u32 offset
                    de onde continuar (0 = do zero; >0 = resume)
     0x04 DADO      u32 offset + bytes (grava em .tmp)
     0x05 FIM       payload vazio — placa valida CRC do arquivo
                    inteiro e renomeia .tmp → nome
     0x06 APAGA     nome NUL-terminado
     0x07 TEMPO     u32 ms — timecode ~2x/s; a placa ajusta playhead
     0x08 TOCA      nome NUL-terminado (vazio = para)

   Placa → mídia:
     0x81 ACK       u8 tipo ecoado + u8 codigo (0 = ok) + extra
     0x82 MANIFESTO texto (JSON do index.json)

   Este módulo é o parser/montador puro, sem IO — roda igual nos
   testes de host e no ESP32. Quem grava SD e responde é o firmware.
   ============================================================ */

#ifndef BLUELIGHTS_PROTOCOLO_H
#define BLUELIGHTS_PROTOCOLO_H

#include <stddef.h>
#include <stdint.h>

#define PROTO_MAGIC0 0xB7
#define PROTO_MAGIC1 0x4C
#define PROTO_PAYLOAD_MAX (8 * 1024)
#define PROTO_MOLDURA 9            /* 2 magic + 1 tipo + 2 len + 4 crc */

enum {
  PROTO_OI = 0x01,
  PROTO_LISTA = 0x02,
  PROTO_COMECA = 0x03,
  PROTO_DADO = 0x04,
  PROTO_FIM = 0x05,
  PROTO_APAGA = 0x06,
  PROTO_TEMPO = 0x07,
  PROTO_TOCA = 0x08,
  PROTO_ACK = 0x81,
  PROTO_MANIFESTO = 0x82,
};

/* CRC32 IEEE (o do zlib/PNG), incremental. Semente: 0. */
uint32_t proto_crc32(uint32_t crc, const uint8_t *dado, size_t len);

/* Monta um pacote em `saida` (cap >= PROTO_MOLDURA + len).
   Devolve o tamanho total, ou 0 se não coube / len estoura o máximo. */
size_t proto_monta(uint8_t *saida, size_t cap, uint8_t tipo,
                   const uint8_t *payload, size_t len);

/* Parser: alimente com bytes conforme chegam; a cada pacote íntegro o
   callback é chamado. Pacote com CRC ruim ou len absurdo é descartado
   e o parser volta a caçar o magic — inclusive DENTRO dos bytes já
   vistos, então magic no meio de payload corrompido não perde sessão. */
typedef void (*proto_cb_t)(uint8_t tipo, const uint8_t *payload,
                           size_t len, void *ctx);

typedef struct {
  /* acumulador do pacote em curso: qualquer pacote válido cabe inteiro,
     então acumulador cheio sem pacote completo = cabeça é lixo. */
  uint8_t acc[PROTO_MOLDURA + PROTO_PAYLOAD_MAX];
  size_t acc_len;
  proto_cb_t cb;
  void *ctx;
  uint32_t descartados;            /* bytes jogados fora ressincronizando */
} proto_parser_t;

void proto_inicia(proto_parser_t *p, proto_cb_t cb, void *ctx);
void proto_alimenta(proto_parser_t *p, const uint8_t *dado, size_t len);

#endif
