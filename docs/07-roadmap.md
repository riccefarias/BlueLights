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

### 2. Firmware base da T-CAN485

- USB CDC, protocolo de upload com chunk + CRC + resume
- SD por SPI, gravação atômica com `.tmp` + rename, manifest
- RMT pra pixel, `esp_dmx` na UART2
- Animação de fallback quando a serial cala

O leitor de fseq do ESP tem contrato escrito e testado do outro lado:
`docs/08-formato-fseq.md` e `web/src/motor/fseq.js`. Descompressão é zlib, que
já vem no ESP-IDF.

### 3. Player no APK da mídia

APK nosso, em repositório à parte. Toca a música e é o relógio master:
transporte e timecode pela serial. As duas pontas do protocolo são nossas.

### 4. WebSerial no sequenciador

Gravar direto no ESP a partir do browser, sem app nativo no meio.
Hoje o exportador baixa o arquivo; falta a ponte até o cartão.

### 5. Áudio de verdade

Detector de andamento **feito** — ver `06-sincronismo-audio.md`. Falta o que
ele destranca:

- **Grade vinda do arquivo.** Hoje `DURATION = BPM × BARS` = 15 segundos, e a
  duração devia vir do áudio. É o que impede sequenciar faixa de verdade
- **Mapa de batidas** no lugar do BPM escalar, e o efeito falando em batida em
  vez de segundo. Resolve rubato e mata a deriva por construção
- Zoom na timeline, necessário assim que passar de 8 compassos

### 6. Value curves

Animar qualquer parâmetro ao longo do clip. Hoje o parâmetro é um número fixo
por clip; a curva é o que separa show bom de pisca-pisca.

## Já feito

- Croqui editável como fonte da verdade
- Motor de render puro, separado do React
- Perfis de fixture com capacidades dirigindo a paleta
- Preview com gobos, feixes e pixel ao vivo
- Três modos de layout: Palco, Mesa, Estúdio
- Relógio master no AudioContext
- **Exportador `.fseq` V2 com zlib**, e o motor separado em `motor/` +
  `modelo/` pra rodar headless. Teste automatizado com `npm test`
- **Edição da timeline**: arrastar, redimensionar, criar, apagar, trocar
  efeito, parâmetro em slider, trilha nova, e undo/redo. Ver
  `10-edicao-da-timeline.md`
- **Salvar e carregar** o setup em `.blz.json`, com arquivo de verdade no
  desktop e load manual no celular. Ver ADR 0009

## Pendências que o exportador deixou

- **Faixas rotuladas no perfil** — virou o passo 1 acima
- **Autosave em IndexedDB** como rede de segurança embaixo do arquivo, pra
  cobrir a aba morrendo no celular no meio de uma edição. Ver ADR 0009
- **zstd**, se um dia um arquivo de fora exigir

## Sobrou de graça

A T-CAN485 traz um barramento **CAN** que ninguém pediu. Não usar agora, mas é
a porta pra luz reagir a RPM, porta aberta ou farol alto um dia.

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
- [ ] **Decidir a isolação do DMX** — a T-CAN485 não isola. Módulo ADM2582E
      por fora ou terra único bem feito? Ver ADR 0010
- [ ] Confirmar flash e PSRAM da unidade que chegou (o ADR assume sem PSRAM)
