# ADR 0005 — SD como fonte primária, não backup

**Status:** aceito

## Contexto

Onde guardar as sequências: PSRAM do ESP (preload por faixa) ou cartão SD.

## Decisão

Upload por USB, **gravação no SD, reprodução direto do SD**.
A mídia manda só timecode.

## Consequências

- Tempo de transferência entre faixas: **zero**. Não tem preload nem espera
- Leitura SD em SPI dá 1–4 MB/s, dez vezes o necessário
- Central reinicia e o ESP continua tocando sozinho
- **Nunca escrever com playback ativo** — wear leveling gera stalls de centenas de ms
- Precisa cartão high endurance: painel de carro passa de 70°C

## Alternativas descartadas

**Preload em PSRAM** — resolve hoje e quebra quando crescer:
300 pixels numa faixa de 3min já dá 6,5MB; 800 pixels dá 17MB e estoura os 8MB.
