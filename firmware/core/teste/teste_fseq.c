/* Teste de contrato: lê os .fseq gerados pelo exportador real do
   sequenciador e confere byte a byte contra o dado determinístico. */

#include "../fseq.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int falhas = 0;
#define OK(cond, msg) do { \
  if (!(cond)) { printf("FALHA: %s\n", msg); falhas++; } \
} while (0)

static uint8_t *le_arquivo(const char *nome, size_t *len) {
  FILE *f = fopen(nome, "rb");
  if (!f) { printf("FALHA: nao abriu %s\n", nome); exit(1); }
  fseek(f, 0, SEEK_END);
  *len = ftell(f);
  fseek(f, 0, SEEK_SET);
  uint8_t *b = malloc(*len);
  if (fread(b, 1, *len, f) != *len) exit(1);
  fclose(f);
  return b;
}

static uint8_t esperado(uint32_t q, uint32_t c) {
  return (uint8_t)((q * 7 + c * 13) & 0xFF);
}

static void testa(const char *nome, int comprimido) {
  size_t len;
  uint8_t *arq = le_arquivo(nome, &len);
  fseq_info_t fi;

  OK(fseq_ler_cabecalho(arq, len, &fi) == FSEQ_OK, "cabecalho abre");
  OK(fi.canais == 98 && fi.quadros == 4000, "dimensoes do arquivo");
  OK(fi.passo_ms == 25, "passo de 25ms");
  OK(fi.unique_id == 0x123456789ABCull, "unique id");
  OK(strcmp(fi.midia, "faixa07.mp3") == 0, "cabecalho mf");
  OK(fi.tem_rig && fi.rig_canais == 98 &&
     strcmp(fi.rig_fp, "b961683a") == 0, "carimbo bl");
  OK(comprimido ? fi.n_blocos > 1 : fi.n_blocos == 0,
     "contagem de blocos condiz com a compressao");

  OK(fseq_conferir_rig(&fi, 98, "b961683a") == FSEQ_RIG_OK, "rig confere");
  OK(fseq_conferir_rig(&fi, 99, "b961683a") == FSEQ_RIG_CANAIS,
     "rig acusa canais diferentes");
  OK(fseq_conferir_rig(&fi, 98, "deadbeef") == FSEQ_RIG_CROQUI,
     "rig acusa croqui diferente");

  /* percorre TODOS os quadros pelo caminho do player: bloco → inflate */
  uint8_t *saida = malloc(fi.canais * fi.quadros);
  uint32_t conferidos = 0;
  for (uint32_t q = 0; q < fi.quadros;) {
    fseq_bloco_t bl;
    OK(fseq_bloco_do_quadro(arq, len, &fi, q, &bl) == FSEQ_OK, "acha bloco");
    OK(bl.offset + bl.tam <= len, "bloco dentro do arquivo");
    OK(fseq_descomprime(&fi, &bl, arq + bl.offset, saida,
                        (size_t)bl.quadros * fi.canais) == FSEQ_OK,
       "descomprime bloco");
    for (uint32_t i = 0; i < bl.quadros; i++)
      for (uint32_t c = 0; c < fi.canais; c++)
        if (saida[i * fi.canais + c] !=
            esperado(bl.primeiro_quadro + i, c)) {
          OK(0, "byte diverge do determinismo");
          goto fim;
        }
    conferidos += bl.quadros;
    q = bl.primeiro_quadro + bl.quadros;
  }
fim:
  OK(conferidos == fi.quadros, "cobriu todos os quadros");

  /* fora do arquivo e buffers errados reprovam limpo */
  fseq_bloco_t bl;
  OK(fseq_bloco_do_quadro(arq, len, &fi, fi.quadros, &bl) == FSEQ_ERRO_FORA,
     "quadro alem do fim reprova");
  OK(fseq_bloco_do_quadro(arq, len, &fi, 0, &bl) == FSEQ_OK, "bloco 0");
  OK(fseq_descomprime(&fi, &bl, arq + bl.offset, saida, 3) ==
     FSEQ_ERRO_BUFFER, "buffer curto reprova");

  free(saida);
  free(arq);
}

static void testa_lixo(void) {
  fseq_info_t fi;
  uint8_t lixo[64] = { 0 };
  OK(fseq_ler_cabecalho(lixo, 8, &fi) == FSEQ_ERRO_CURTO, "curto reprova");
  OK(fseq_ler_cabecalho(lixo, sizeof(lixo), &fi) == FSEQ_ERRO_MAGIC,
     "sem magic reprova");
  memcpy(lixo, "PSEQ", 4);
  lixo[7] = 1;
  OK(fseq_ler_cabecalho(lixo, sizeof(lixo), &fi) == FSEQ_ERRO_VERSAO,
     "V1 reprova");
}

int main(void) {
  testa("teste/fixtures/demo-zlib.fseq", 1);
  testa("teste/fixtures/demo-crua.fseq", 0);
  testa_lixo();
  if (falhas) { printf("%d falha(s)\n", falhas); return 1; }
  printf("fseq: tudo ok\n");
  return 0;
}
