# Roadmap

## Ordem, e o porquê dela

### 1. Firmware base do ESP32-S3 ← próximo passo

- USB CDC, protocolo de upload com chunk + CRC + resume
- SD_MMC, gravação atômica com `.tmp` + rename, manifest
- RMT pra pixel, `esp_dmx` na UART2
- Animação de fallback quando a serial cala

O leitor de fseq do ESP tem contrato escrito e testado do outro lado:
`docs/08-formato-fseq.md` e `web/src/motor/fseq.js`. Descompressão é zlib, que
já vem no ESP-IDF.

### 2. Player no APK da mídia

Leitor de fseq, transporte, timecode pela serial.

### 3. WebSerial no sequenciador

Gravar direto no ESP a partir do browser, sem app nativo no meio.
Hoje o exportador baixa o arquivo; falta a ponte até o cartão.

### 4. Áudio de verdade

Detecção de BPM, marcadores editáveis, zoom.

### 5. Value curves

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

## Pendências que o exportador deixou

- **Faixas rotuladas no perfil.** Gobo e shutter saem por convenção, não pela
  tabela DMX da cabeça. Ver a seção de provisórios em `08-formato-fseq.md` —
  é o que precisa estar certo antes do primeiro show com cabeça nova
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
