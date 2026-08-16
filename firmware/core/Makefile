# Testes de host do núcleo do firmware: gcc + zlib do sistema.
# As fixtures saem do EXPORTADOR REAL (web/src/motor/fseq.js) — é
# teste de contrato entre o browser e o que a placa vai ler.

CC = gcc
CFLAGS = -Wall -Wextra -O2

teste: teste/fixtures/demo-zlib.fseq bin-fseq bin-proto
	./bin-fseq
	./bin-proto

teste/fixtures/demo-zlib.fseq: teste/gera-fixtures.mjs ../../web/src/motor/fseq.js
	node teste/gera-fixtures.mjs

bin-fseq: fseq.c teste/teste_fseq.c fseq.h
	$(CC) $(CFLAGS) fseq.c teste/teste_fseq.c -lz -o $@

bin-proto: protocolo.c teste/teste_protocolo.c protocolo.h
	$(CC) $(CFLAGS) protocolo.c teste/teste_protocolo.c -o $@

limpa:
	rm -f bin-fseq bin-proto teste/fixtures/*.fseq

.PHONY: teste limpa
