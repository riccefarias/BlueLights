# ADR 0004 — USB serial entre mídia e ESP32

**Status:** aceito

## Contexto

A mídia precisa mandar dados de luz pro ESP32. Wifi ou Bluetooth pareciam
convenientes; os dois ficam a 2 metros um do outro dentro do carro.

## Decisão

**USB serial.** Mídia Android como host, ESP32-S3 como CDC-ACM.
Cabo com VBUS cortado; o ESP se alimenta do buck de 12V.

## Consequências

- Zero jitter, zero perda, imune ao 2.4GHz saturado do evento
- Permite streamar frame direto em vez de preload + timecode — some metade do firmware
- Se der ruído por diferença de terra, isolador USB (ADuM3160) resolve
- O conector USB na dash sofre muito menos que sofreria dentro de uma caixa

## Alternativas descartadas

**Bluetooth** — 288 kbps constante. BLE não entrega; SPP entrega com jitter de
30–150ms variável. Jitter não se compensa.

**Wifi** — funciona com preload + timecode, `WIFI_PS_NONE`, unicast e rede dedicada.
Mas ESP32-S3 é só 2.4GHz, e no festcar são 300 celulares mais o hotspot.
Fica como conveniência futura, possivelmente com ESP32-C5 em 5GHz.
