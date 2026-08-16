# Protocolo mídia ↔ ESP32

## Arquitetura

```
upload  : APK Android --USB serial--> T-CAN485 --> grava no cartão SD
playback: T-CAN485 lê do SD e toca local
sync    : APK manda timecode ~2x/s; a placa ajusta o playhead
```

As duas pontas são nossas: o APK da mídia e o firmware. O protocolo é
contrato interno, não integração com coisa de terceiro.

Upload é evento raro e pode ser lento. Reprodução é crítica e fica local.
As duas coisas desacopladas: nenhum problema de uma contamina a outra.

**Consequência boa:** central Android reinicia no meio do festcar e a luz continua.

É o motivo de o `.fseq` morar no cartão da placa e não ser streamado pelo APK.

## Por que USB e não wifi

- 300 pixels × 3 bytes × 40fps = **288 kbps** constante
- BLE não entrega isso. SPP entrega com jitter de 30–150ms **variável**
- Jitter é o assassino, não latência: latência fixa se compensa com offset, jitter não
- No evento o 2.4GHz tem 300 celulares mais o hotspot

Wifi fica como conveniência futura; a serial é o caminho confiável.

## Regras de escrita

**Nunca escrever no SD durante playback.** Cartão faz wear leveling e apagamento de
bloco, gerando stalls de centenas de ms sem aviso. Bloquear upload com transporte ativo.

## Upload

- Chunks de 4–8KB com tamanho no header e ACK por chunk
- **CRC por chunk, obrigatório.** A T-CAN485 fala por ponte CH9102, e ponte
  serial não tem detecção de erro nenhuma. Com USB nativo daria pra confiar no
  CRC da própria camada USB — não é o caso aqui (ver ADR 0010)
- **Resume**: morreu em 4,5MB de 5MB, retoma dali
- Grava em `faixa07.fseq.tmp` → valida CRC do arquivo inteiro → renomeia

## Manifest

`index.json` no cartão com nome, tamanho e CRC de cada faixa.

```
Android: "o que tu tem aí?"
ESP32:   manifest
Android: sobe só o que falta ou mudou
```

## Playback

- Duplo buffer: task no core 0 lê o próximo bloco, core 1 toca o atual
- ~200ms de lookahead absorve variação do cartão
- Silêncio na serial por 2s → cai numa **animação local de fallback**

Carro apagado no meio do evento porque a central bootou é o que ninguém perdoa.

## Cartão

- **High endurance / industrial.** Painel de carro em janeiro passa de 70°C
- **SPI**, que é como a T-CAN485 liga o slot (IO15/IO02/IO14/IO13). Mais lento
  que SD_MMC 4-bit e irrelevante aqui: ~36 kB/s de show contra ~1 MB/s de SPI
- FAT não tem journal: corte de energia escrevendo pode levar a tabela.
  A mídia é a cópia mestra, então o pior caso é reformatar e ressincronizar
- Slot com trava, e cola no cartão

## Tempo de transferência

| Caminho | Throughput | 5MB |
|---|---|---|
| **CH9102 @ 921600** (o nosso) | ~90 kB/s | ~60s |
| S3 USB nativo (descartado) | ~700 kB/s | ~7s |

Um minuto por faixa é aceitável porque upload é evento raro e acontece na
garagem. O que não podia degradar era o playback — e esse é local, lido do
cartão, sem passar pela serial.

## Compressão

Dado de iluminação é absurdamente repetitivo — pixel apagado é `00 00 00` milhares de vezes.
O fseq V2 já prevê zlib e zstd, e **10–20× é comum**.

Ataca espaço, tempo de upload e — o principal — reduz bytes lidos por frame,
diminuindo a exposição aos stalls do cartão.

## Lado Android

`usb-serial-for-android` (mik3y) roda em userspace, **sem root**.

Pra não pedir permissão de USB toda vez (inaceitável num launcher de carro),
declarar no manifest:

```xml
<intent-filter>
  <action android:name="android.hardware.usb.action.USB_DEVICE_ATTACHED"/>
</intent-filter>
<meta-data android:name="android.hardware.usb.action.USB_DEVICE_ATTACHED"
  android:resource="@xml/device_filter"/>
```

Com `device_filter.xml` batendo o VID/PID da ponte — **1a86:55d4** (WCH CH9102)
— o Android concede permissão automático e abre o app quando plugar.

⚠️ Confirmar que a porta USB da central é host/OTG de verdade — em central chinesa
é comum ter porta só de alimentação.
