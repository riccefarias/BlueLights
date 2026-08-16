/* ============================================================
   FSEQ V2 — leitor, lado do firmware.

   Espelho em C do contrato de web/src/motor/fseq.js (e docs/08).
   Este módulo é SEM IO de propósito: recebe buffers, devolve
   structs e offsets. Quem lê do cartão é o chamador — é o que
   deixa o mesmo código rodar nos testes de host (gcc + zlib) e
   no ESP32 (esp-idf), e o que mantém o leitor testável contra
   arquivos gerados pelo exportador de verdade.

   Uso no player:
     1. ler os primeiros FSEQ_PREFIXO_MAX bytes do arquivo
     2. fseq_ler_cabecalho() → fseq_info_t
     3. por quadro: fseq_bloco_do_quadro() → offset e tamanho do
        bloco comprimido no arquivo; ler só ele do cartão
     4. fseq_descomprime() no buffer de reprodução
     5. fseq_conferir_rig() ANTES de tocar — arquivo de croqui
        velho não dá erro, ele toca lixo (docs/08)
   ============================================================ */

#ifndef BLUELIGHTS_FSEQ_H
#define BLUELIGHTS_FSEQ_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

/* offset dos dados cabe em u16 (formato garante): o prefixo com
   cabeçalho + índice + variáveis nunca passa disso. */
#define FSEQ_PREFIXO_MAX 0x10000

enum {
  FSEQ_OK = 0,
  FSEQ_ERRO_CURTO = -1,        /* buffer menor que o necessário     */
  FSEQ_ERRO_MAGIC = -2,        /* não começa com "PSEQ"             */
  FSEQ_ERRO_VERSAO = -3,       /* só V2                             */
  FSEQ_ERRO_COMPRESSAO = -4,   /* zstd ainda não — ver ADR 0008     */
  FSEQ_ERRO_FORMATO = -5,      /* cabeçalho inconsistente           */
  FSEQ_ERRO_FORA = -6,         /* quadro/bloco fora do arquivo      */
  FSEQ_ERRO_ZLIB = -7,         /* inflate falhou ou tamanho errado  */
  FSEQ_ERRO_BUFFER = -8,       /* buffer de saída pequeno demais    */
};

enum {
  FSEQ_SEM_COMPRESSAO = 0,
  FSEQ_ZSTD = 1,
  FSEQ_ZLIB = 2,
};

/* Veredito do carimbo de croqui ("bl"). */
enum {
  FSEQ_RIG_OK = 0,
  FSEQ_RIG_SEM_CARIMBO = 1,    /* toca com aviso (xLights não carimba) */
  FSEQ_RIG_CANAIS = -1,        /* número de canais mudou               */
  FSEQ_RIG_CROQUI = -2,        /* mesma contagem, croqui diferente     */
};

typedef struct {
  uint32_t canais;
  uint32_t quadros;
  uint8_t passo_ms;
  uint8_t compressao;          /* FSEQ_SEM_COMPRESSAO / FSEQ_ZLIB   */
  uint16_t offset_dados;       /* onde começa o dado de canal       */
  uint16_t n_blocos;           /* 0 quando sem compressão           */
  uint64_t unique_id;

  bool tem_rig;                /* carimbo "bl" presente e entendido */
  uint32_t rig_canais;
  char rig_fp[16];             /* impressão FNV-1a, hex             */
  char midia[64];              /* cabeçalho "mf", vazio se não tem  */
} fseq_info_t;

typedef struct {
  uint32_t primeiro_quadro;    /* primeiro quadro dentro do bloco   */
  uint32_t quadros;            /* quantos quadros o bloco carrega   */
  uint32_t offset;             /* posição absoluta no arquivo       */
  uint32_t tam;                /* bytes comprimidos (== crus se sem
                                  compressão)                       */
} fseq_bloco_t;

/* `buf` são os primeiros bytes do arquivo; precisa cobrir até
   offset_dados (ler FSEQ_PREFIXO_MAX resolve sempre). */
int fseq_ler_cabecalho(const uint8_t *buf, size_t len, fseq_info_t *fi);

/* Bloco que contém o quadro `q`. Sem compressão, devolve um bloco
   sintético cobrindo o arquivo inteiro — o chamador pode ler só o
   quadro com fseq_offset_quadro(). */
int fseq_bloco_do_quadro(const uint8_t *buf, size_t len,
                         const fseq_info_t *fi, uint32_t q,
                         fseq_bloco_t *bl);

/* Atalho para arquivo sem compressão: offset absoluto do quadro. */
int fseq_offset_quadro(const fseq_info_t *fi, uint32_t q, uint32_t *off);

/* Descomprime (ou copia) um bloco lido do arquivo para `saida`.
   `saida_cap` precisa de bl->quadros * fi->canais bytes. */
int fseq_descomprime(const fseq_info_t *fi, const fseq_bloco_t *bl,
                     const uint8_t *comprimido, uint8_t *saida,
                     size_t saida_cap);

/* Confere o carimbo contra o croqui atual (canais + impressão hex). */
int fseq_conferir_rig(const fseq_info_t *fi, uint32_t canais_atual,
                      const char *fp_atual);

const char *fseq_erro(int codigo);

#endif
