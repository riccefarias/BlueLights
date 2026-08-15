# ADR 0008 — Exportar fseq V2 com zlib, não com zstd

## Contexto

O exportador precisa sair comprimido desde o início. Dado de iluminação é
absurdamente repetitivo e a compressão ataca três coisas ao mesmo tempo:
espaço no cartão, tempo de upload pela serial e — o que mais importa —
bytes lidos por quadro, que é a exposição aos stalls do SD.

O fseq V2 prevê dois algoritmos: **zstd** (tipo 1) e **zlib** (tipo 2).
O padrão do xLights e do FPP é zstd.

## Decisão

Escrever **zlib**. Deixar o tipo zstd reconhecido no leitor e recusado com
erro claro no escritor.

## Porquê

**zlib é a única que o browser já tem.** `CompressionStream("deflate")` é
API de plataforma, existe no Chrome/Edge/Firefox/Safari atuais e no Node 18+.
O `deflateInit()` que o FPP usa produz e espera RFC1950 — exatamente o que a
`CompressionStream` emite. Mesmo código roda no sequenciador, no teste
headless e num worker.

zstd no browser significa carregar wasm. Meio megabyte de dependência para
um sequenciador que roda no celular na beira do carro, e mais uma coisa que
pode não carregar num 3G de festcar.

**A vantagem do zstd não aparece aqui.** Ele ganha em velocidade de
descompressão e um pouco em taxa. Só que:

- Comprimir acontece uma vez, no browser, offline. Velocidade não importa.
- Descomprimir acontece no ESP32-S3, que tem `miniz`/zlib no próprio ROM do
  ESP-IDF. zstd no ESP é biblioteca extra e mais PSRAM.
- A taxa que se ganha é marginal num dado que já comprime 5–20×.

**O formato não muda.** Tipo de compressão é um campo do cabeçalho, não um
dialeto. Arquivo zlib é fseq V2 legítimo: o FPP toca, o xLights abre. Trocar
para zstd depois é implementar o codec e mudar um byte — nenhum outro
consumidor precisa saber.

## Consequências

- O exportador não depende de nada além do browser.
- O firmware pode usar o zlib que já vem no ESP-IDF.
- Arquivo vindo do xLights com zstd **não abre** no nosso leitor até alguém
  implementar. Ao usar o xLights como validador, exportar de lá em zlib
  ou sem compressão.
- Blocos de ~64KB descomprimidos, o mesmo alvo do FPP, com teto de 255
  blocos. O índice é o que o player usa para pular direto ao quadro certo.

## Descartado

- **Sem compressão.** Simples, mas joga fora o principal ganho, que é ler
  menos byte por quadro no cartão.
- **Compressão própria (RLE).** O dado é repetitivo o bastante para um RLE
  ingênuo ir bem, e seria trivial no ESP. Mas aí o arquivo deixa de ser fseq,
  e junto vai embora o xLights como validador de graça. Formato aberto vale
  mais que os pontos percentuais de taxa.
