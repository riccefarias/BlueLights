# Roadmap

## Ordem, e o porquê dela

### 1. Cadastro de fixture ← próximo passo

**Faixas rotuladas no perfil.** Gobo e shutter hoje saem por convenção do
código, não pela tabela DMX da cabeça — ver os provisórios em
`08-formato-fseq.md`. Numa cabeça real com faixa estreita no começo do canal,
toda forma sai trocada.

Junto vem o que já estava na lista de pendências do `04-modelo-de-dados.md`:

- **Calibração por fixture**, que é coisa diferente de cadastro. Cadastro é o
  que o manual diz e vale pra qualquer unidade do modelo. Calibração é o que é
  verdade neste carro: endereço real, pan invertido porque a cabeça está
  montada espelhada, limite de tilt pro feixe não bater na caixa
- **Roda de gobo por perfil.** Hoje `GOBOS` é uma lista global de seis formas
  igual pra todo mundo, o que já está errado em rig misto: gobo 3 numa cabeça
  é estrela, na outra é espiral

Digitar do manual, não importar GDTF — cabeça chinesa genérica raramente está
no catálogo, e parser de zip e XML é trabalho desproporcional agora. O que
importa é a estrutura de faixas nascer igual à do GDTF, pra o import depois só
preencher o mesmo lugar.

O gargalo é o cadastro, não o código.

### 2. Firmware base do ESP32-S3

- USB CDC, protocolo de upload com chunk + CRC + resume
- SD_MMC, gravação atômica com `.tmp` + rename, manifest
- RMT pra pixel, `esp_dmx` na UART2
- Animação de fallback quando a serial cala

O leitor de fseq do ESP tem contrato escrito e testado do outro lado:
`docs/08-formato-fseq.md` e `web/src/motor/fseq.js`. Descompressão é zlib, que
já vem no ESP-IDF.

### 3. Player no APK da mídia

Leitor de fseq, transporte, timecode pela serial.

### 4. WebSerial no sequenciador

Gravar direto no ESP a partir do browser, sem app nativo no meio.
Hoje o exportador baixa o arquivo; falta a ponte até o cartão.

### 5. Áudio de verdade

Detecção de BPM, marcadores editáveis, zoom.

### 6. Value curves

Animar qualquer parâmetro ao longo do clip.

## Já feito

- Croqui editável como fonte da verdade
- Motor de render puro, separado do React
- Perfis de fixture com capacidades dirigindo a paleta
- Preview com gobos, feixes e pixel ao vivo
- Três modos de layout: Palco, Mesa, Estúdio
- Relógio master no AudioContext
- **Exportador `.fseq` V2 com zlib**, e o motor separado em `motor/` +
  `modelo/` pra rodar headless. Teste automatizado com `npm test`
- **Salvar e carregar** o setup em `.blz.json`, com arquivo de verdade no
  desktop e load manual no celular. Ver ADR 0009

## Pendências que o exportador deixou

- **Faixas rotuladas no perfil** — virou o passo 1 acima
- **Autosave em IndexedDB** como rede de segurança embaixo do arquivo, pra
  cobrir a aba morrendo no celular no meio de uma edição. Ver ADR 0009
- **zstd**, se um dia um arquivo de fora exigir

## Trocas pra quando crescer

Nenhuma importa nos ~18 nodes atuais:

- Timeline em canvas em vez de DOM (blocos como `div` morrem lá pelos 500)
- Render em Web Worker
- Se um dia for wifi: **ESP32-C5** é dual-band e sai do 2.4GHz saturado

## Antes de comprar / montar

- [ ] Testar 1 vs 3 endereços por farol AJK
- [ ] Confirmar 400 ou 800kHz com o fabricante
- [ ] Definir se as moving heads são 12V ou AC — se AC, dimensionar inversor
      (3 × 60–150W além dos 3 SD3000)
- [ ] Confirmar que a porta USB da central é host/OTG
- [ ] Levantar a tabela DMX de cada uma das 3 heads
