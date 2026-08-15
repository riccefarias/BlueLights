# Roadmap

## Ordem, e o porquê dela

### 1. Exportador `.fseq` ← próximo passo

**É o que destrava o hardware.** Enquanto não sai fseq, o sequenciador é uma tela bonita.

Com o exportador funcionando dá pra usar o **xLights como validador**: sequencia lá,
exporta, toca no player próprio, compara. Ferramenta de teste de graça.

Formato aberto e documentado. Suportar V2 com compressão desde o início.

### 2. Firmware base do ESP32-S3

- USB CDC, protocolo de upload com chunk + CRC + resume
- SD_MMC, gravação atômica com `.tmp` + rename, manifest
- RMT pra pixel, `esp_dmx` na UART2
- Animação de fallback quando a serial cala

### 3. Player no APK da mídia

Leitor de fseq, transporte, timecode pela serial.

### 4. WebSerial no sequenciador

Gravar direto no ESP a partir do browser, sem app nativo no meio.

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
