# Firmware — ESP32-S3

Não iniciado. Ver `../docs/03-protocolo-serial.md` para o contrato com a mídia
e `../docs/02-hardware.md` para a pinagem.

Alvo: ESP32-S3 DevKitC-1 N16R8, ESP-IDF ou Arduino-ESP32.

Componentes previstos:

- `usb/`   — CDC-ACM, protocolo de upload (chunk + CRC + resume)
- `store/` — SD_MMC 4-bit, gravação atômica, manifest
- `play/`  — leitor de fseq, duplo buffer, sincronia por timecode
- `out/`   — RMT (WS2811) e esp_dmx (UART2)

O leitor de fseq tem o contrato já escrito e testado do outro lado: o layout
está em `../docs/08-formato-fseq.md` e a implementação de referência em
`../web/src/motor/fseq.js`. Passo de 25ms (40fps), blocos zlib de ~64KB —
descompressão pelo zlib que já vem no ESP-IDF.
