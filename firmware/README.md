# Firmware — LilyGO T-CAN485

Não iniciado. Ver `../docs/03-protocolo-serial.md` para o contrato com o APK
da mídia e `../docs/02-hardware.md` para a pinagem.

Alvo: **LilyGO T-CAN485** — ESP32 clássico, ponte CH9102, RS485 e slot TF na
placa. Escolha e o que se perdeu em troca: `../docs/adr/0010-lilygo-t-can485-na-saida.md`.
ESP-IDF ou Arduino-ESP32.

## Pinagem

```
RS485_TX  IO22     SD_MOSI  IO15     livres pra pixel:
RS485_RX  IO21     SD_MISO  IO02       IO25  IO32  IO33  IO05  IO12  IO18
RS485_EN  IO17     SD_SCLK  IO14
RS485_SE  IO19     SD_CS    IO13     IO34 e IO35 são SÓ ENTRADA
```

⚠️ **IO12 é strapping pin** (MTDI): alto no boot muda a tensão de flash e a
placa não sobe. Deixar por último.

## Componentes previstos

- `usb/`   — CDC pela ponte CH9102, protocolo de upload (chunk + CRC + resume)
- `store/` — SD por SPI, gravação atômica, manifest
- `play/`  — leitor de fseq, duplo buffer, sincronia por timecode
- `out/`   — RMT (WS2811) e esp_dmx na UART2, roteada pros pinos de RS485

## Notas que economizam depuração

**CRC por chunk não é opcional.** Ponte serial não tem detecção de erro
nenhuma — diferente de USB nativo, onde a própria camada já faz CRC e retry.

**Sem PSRAM.** O buffer de playback vive na RAM interna: dá pros ~200ms de
lookahead do duplo buffer, não pra segurar a faixa inteira sem cartão.

**Nunca escrever no SD durante playback.** Wear leveling e apagamento de bloco
geram stalls de centenas de ms sem aviso. Bloquear upload com transporte ativo.

**Fixar DE/RE em transmissão no boot**, por GPIO. Sem autodireção: o BREAK de
88µs pode ser lido como linha ociosa e o driver solta o barramento no meio do
pacote.

## O leitor de fseq

Contrato já escrito e testado do outro lado: layout em
`../docs/08-formato-fseq.md`, implementação de referência em
`../web/src/motor/fseq.js`. Passo de 25ms (40fps), blocos zlib de ~64KB —
descompressão pelo zlib que já vem no ESP-IDF.

**Conferir o carimbo `bl` antes de tocar.** É o cabeçalho variável que diz pra
qual croqui o arquivo foi renderizado. Arquivo velho não dá erro, ele toca — e
manda pan pro canal de gobo. Não batendo, cair na animação de fallback em vez
de despejar lixo no barramento.

Mesma regra quando a serial cala por 2s: animação local, nunca carro apagado.
