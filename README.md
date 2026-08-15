# BlueLights

Sequenciador e controlador de iluminação para o paredão da Corsa Blue Label.

Dois sistemas de luz numa timeline só:

- **Pixel** — faróis strobo AJK WS2811 12V dentro das câmaras das caixas, mais pontos adicionais no carro
- **DMX512** — 3 moving heads (2 laterais com gobo, 1 central wash sem gobo)

## Partes

| Pasta | O quê |
|---|---|
| `web/` | Sequenciador browser-based (React). Autoria, croqui do rig, preview, export `.fseq` |
| `firmware/` | ESP32-S3: recebe upload por USB, grava no SD, toca localmente, saída pixel + DMX |
| `docs/` | Arquitetura, hardware, protocolos |
| `docs/adr/` | Decisões e o porquê — inclusive o que foi descartado |

## Cadeia

```
[ mídia Android ] --USB serial--> [ ESP32-S3 ] --+--> 74AHCT125 --> GX16 --> faróis WS2811
      timecode                     lê do SD      |
                                                 +--> ADM2582E (RS485 isolado) --> XLR --> heads
```

## Estado

Sequenciador funcionando em `web/`, já **exportando `.fseq` V2** — o motor roda
headless e tem teste. Firmware não iniciado.
Próximo passo: **firmware base do ESP32-S3** (ver `docs/07-roadmap.md`).

## Rodando o sequenciador

```bash
cd web
npm install
npm run dev
```

```bash
npm test        # motor e formato fseq, sem browser
npm run build
```

## Camadas em `web/src`

| Pasta | O quê |
|---|---|
| `modelo/` | O documento: rig, perfis, trilhas, clips. JSON serializável |
| `motor/` | Funções puras. Render, canais, `.fseq`. Sem React, sem DOM |
| `App.jsx` | UI. Só desenha e edita o modelo |

O motor não importa React de propósito: é o que deixa exportar sem browser e
testar sem montar tela.

## Convenções

- Documentação e comentários em pt-BR
- Decisões arquiteturais viram ADR em `docs/adr/`, numeradas, nunca editadas — decisão nova supersede a antiga
