# ADR 0001 — Não usar FPP como player

**Status:** aceito

## Contexto

O FPP (Falcon Player) roda em Raspberry Pi, toca `.fseq` sincronizado com áudio,
tem saída pixel e DMX na mesma timeline, API REST e ecossistema maduro
(Remote Falcon pra pedido de música, plugin de transmissor FM com RDS).

## Decisão

Não adotar o FPP. Reimplementar a reprodução de `.fseq` no APK da mídia do carro
e no firmware do ESP32.

Manter o **xLights** como ferramenta de autoria — o `.fseq` é formato aberto.

## Consequências

- Perde-se scheduler, playlists e o ecossistema de plugins
- Ganha-se controle total da integração com a mídia do carro, que já existe
- O player de fseq em si é trivial: lê frame, joga na saída
- O xLights continua servindo como validador do exportador próprio

## Alternativas descartadas

**FPP como player** — exigiria que ele fosse o playout de áudio, porque a sincronia
é posicional (os dois arquivos nascem da mesma timeline). Isso conflita com o playout
já planejado no carro.

**FPP em modo bridge** — continua sendo um Pi a mais no rack pra fazer o que
o ESP32 faz melhor na camada de saída.
