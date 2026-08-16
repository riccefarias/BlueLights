/* Leitor fseq V2 — ver fseq.h. Layout conferido contra o escritor
   do sequenciador (web/src/motor/fseq.js) e o FPP (FSEQFile.cpp);
   os testes de host leem arquivos gerados pelo exportador real. */

#include "fseq.h"

#include <stdio.h>
#include <string.h>
#include <zlib.h>

static uint16_t u16(const uint8_t *p) { return (uint16_t)(p[0] | p[1] << 8); }
static uint32_t u32(const uint8_t *p) {
  return (uint32_t)p[0] | (uint32_t)p[1] << 8 |
         (uint32_t)p[2] << 16 | (uint32_t)p[3] << 24;
}
static uint64_t u64(const uint8_t *p) {
  return (uint64_t)u32(p) | (uint64_t)u32(p + 4) << 32;
}

#define CABECALHO 32
#define BLOCO_INDICE 8
#define FAIXA_ESPARSA 6
#define VAR_CABECALHO 4

int fseq_ler_cabecalho(const uint8_t *buf, size_t len, fseq_info_t *fi) {
  memset(fi, 0, sizeof(*fi));
  if (len < CABECALHO) return FSEQ_ERRO_CURTO;
  if (memcmp(buf, "PSEQ", 4) != 0) return FSEQ_ERRO_MAGIC;
  if (buf[7] != 2) return FSEQ_ERRO_VERSAO;

  fi->offset_dados = u16(buf + 4);
  fi->canais = u32(buf + 10);
  fi->quadros = u32(buf + 14);
  fi->passo_ms = buf[18];
  fi->compressao = buf[20] & 0x0F;
  /* 12 bits partidos: nibble alto do byte 20 são os bits altos.
     É o detalhe do formato que mais dá erro de implementação. */
  fi->n_blocos = (uint16_t)(((buf[20] & 0xF0) << 4) | buf[21]);
  fi->unique_id = u64(buf + 24);

  if (fi->compressao == FSEQ_ZSTD) return FSEQ_ERRO_COMPRESSAO;
  if (fi->compressao > FSEQ_ZLIB) return FSEQ_ERRO_COMPRESSAO;
  if (fi->canais == 0 || fi->quadros == 0) return FSEQ_ERRO_FORMATO;
  if (len < fi->offset_dados) return FSEQ_ERRO_CURTO;

  size_t p = CABECALHO + (size_t)fi->n_blocos * BLOCO_INDICE
           + (size_t)buf[22] * FAIXA_ESPARSA;
  if (p > fi->offset_dados) return FSEQ_ERRO_FORMATO;

  /* Cabeçalhos variáveis: u16 tamanho (contando estes 4 bytes),
     2 bytes de código, dado. Código desconhecido se ignora — é a
     regra do formato, e é o que nos deixa carimbar o "bl". */
  while (p + VAR_CABECALHO <= fi->offset_dados) {
    uint16_t tam = u16(buf + p);
    if (tam < VAR_CABECALHO || p + tam > fi->offset_dados) break;
    const uint8_t *dado = buf + p + 4;
    size_t n = tam - VAR_CABECALHO;
    while (n > 0 && dado[n - 1] == 0) n--;         /* tira o NUL do fim */

    if (buf[p + 2] == 'm' && buf[p + 3] == 'f') {
      size_t c = n < sizeof(fi->midia) - 1 ? n : sizeof(fi->midia) - 1;
      memcpy(fi->midia, dado, c);
      fi->midia[c] = 0;
    } else if (buf[p + 2] == 'b' && buf[p + 3] == 'l') {
      /* "versão;canais;impressão" — versão que não conhecemos se
         ignora: melhor tocar com aviso do que reprovar arquivo bom. */
      char txt[48];
      size_t c = n < sizeof(txt) - 1 ? n : sizeof(txt) - 1;
      memcpy(txt, dado, c);
      txt[c] = 0;
      unsigned versao = 0, canais = 0;
      char fp[16] = { 0 };
      if (sscanf(txt, "%u;%u;%15[0-9a-fA-F]", &versao, &canais, fp) == 3 &&
          versao == 1) {
        fi->tem_rig = true;
        fi->rig_canais = canais;
        memcpy(fi->rig_fp, fp, sizeof(fp));
      }
    }
    p += tam;
  }
  return FSEQ_OK;
}

int fseq_bloco_do_quadro(const uint8_t *buf, size_t len,
                         const fseq_info_t *fi, uint32_t q,
                         fseq_bloco_t *bl) {
  if (q >= fi->quadros) return FSEQ_ERRO_FORA;

  if (fi->compressao == FSEQ_SEM_COMPRESSAO) {
    bl->primeiro_quadro = 0;
    bl->quadros = fi->quadros;
    bl->offset = fi->offset_dados;
    bl->tam = fi->canais * fi->quadros;
    return FSEQ_OK;
  }

  if (len < (size_t)CABECALHO + (size_t)fi->n_blocos * BLOCO_INDICE)
    return FSEQ_ERRO_CURTO;

  uint32_t off = fi->offset_dados;
  for (uint16_t i = 0; i < fi->n_blocos; i++) {
    const uint8_t *e = buf + CABECALHO + (size_t)i * BLOCO_INDICE;
    uint32_t primeiro = u32(e);
    uint32_t tam = u32(e + 4);
    if (tam == 0) continue;                        /* entrada vazia: pula */
    uint32_t fim = fi->quadros;
    /* fim do bloco = primeiro quadro do próximo bloco não-vazio */
    for (uint16_t j = i + 1; j < fi->n_blocos; j++) {
      const uint8_t *e2 = buf + CABECALHO + (size_t)j * BLOCO_INDICE;
      if (u32(e2 + 4) > 0) { fim = u32(e2); break; }
    }
    if (q >= primeiro && q < fim) {
      bl->primeiro_quadro = primeiro;
      bl->quadros = fim - primeiro;
      bl->offset = off;
      bl->tam = tam;
      return FSEQ_OK;
    }
    off += tam;
  }
  return FSEQ_ERRO_FORA;
}

int fseq_offset_quadro(const fseq_info_t *fi, uint32_t q, uint32_t *off) {
  if (fi->compressao != FSEQ_SEM_COMPRESSAO) return FSEQ_ERRO_FORMATO;
  if (q >= fi->quadros) return FSEQ_ERRO_FORA;
  *off = fi->offset_dados + q * fi->canais;
  return FSEQ_OK;
}

int fseq_descomprime(const fseq_info_t *fi, const fseq_bloco_t *bl,
                     const uint8_t *comprimido, uint8_t *saida,
                     size_t saida_cap) {
  size_t esperado = (size_t)bl->quadros * fi->canais;
  if (saida_cap < esperado) return FSEQ_ERRO_BUFFER;

  if (fi->compressao == FSEQ_SEM_COMPRESSAO) {
    memcpy(saida, comprimido, esperado);
    return FSEQ_OK;
  }

  /* zlib RFC1950 — o mesmo que o CompressionStream("deflate") do
     browser escreve e o deflateInit() do FPP produz. */
  uLongf tam = (uLongf)saida_cap;
  if (uncompress(saida, &tam, comprimido, bl->tam) != Z_OK)
    return FSEQ_ERRO_ZLIB;
  if (tam != esperado) return FSEQ_ERRO_ZLIB;
  return FSEQ_OK;
}

int fseq_conferir_rig(const fseq_info_t *fi, uint32_t canais_atual,
                      const char *fp_atual) {
  if (!fi->tem_rig) return FSEQ_RIG_SEM_CARIMBO;
  if (fi->rig_canais != canais_atual) return FSEQ_RIG_CANAIS;
  if (strncmp(fi->rig_fp, fp_atual, sizeof(fi->rig_fp)) != 0)
    return FSEQ_RIG_CROQUI;
  return FSEQ_RIG_OK;
}

const char *fseq_erro(int c) {
  switch (c) {
    case FSEQ_OK: return "ok";
    case FSEQ_ERRO_CURTO: return "buffer curto";
    case FSEQ_ERRO_MAGIC: return "nao e fseq";
    case FSEQ_ERRO_VERSAO: return "so V2";
    case FSEQ_ERRO_COMPRESSAO: return "compressao nao suportada";
    case FSEQ_ERRO_FORMATO: return "cabecalho inconsistente";
    case FSEQ_ERRO_FORA: return "quadro fora do arquivo";
    case FSEQ_ERRO_ZLIB: return "zlib falhou";
    case FSEQ_ERRO_BUFFER: return "buffer de saida pequeno";
    default: return "erro desconhecido";
  }
}
