# BlueLights

Sequenciador e controlador de iluminação para o paredão da Corsa Blue Label.

Dois sistemas de luz numa timeline só:

- **Pixel** — faróis strobo AJK WS2811 12V dentro das câmaras das caixas, mais pontos adicionais no carro
- **DMX512** — 3 moving heads (2 laterais com gobo, 1 central wash sem gobo)

## Partes

Três peças nossas, cada uma com um trabalho:

| Peça | Onde | O quê |
|---|---|---|
| Sequenciador | `web/` | Browser-based (React). Autoria, croqui do rig, preview, export `.fseq` |
| APK da mídia | repositório à parte | Toca a música e comanda a timeline. É o relógio master |
| Firmware | `firmware/` | LilyGO T-CAN485. Recebe upload, grava no SD, toca, converte quadro em luz |

| Pasta | O quê |
|---|---|
| `docs/` | Arquitetura, hardware, protocolos |
| `docs/adr/` | Decisões e o porquê — inclusive o que foi descartado |

## Cadeia

```
[ APK Android ] --USB serial--> [ LilyGO T-CAN485 ] --+--> 74AHCT125 --> GX16 --> faróis WS2811
  toca a música                  ESP32 + RS485 + SD   |
  manda timecode                 lê do SD e toca      +--> RS485 --> XLR --> moving heads
```

**O APK manda no tempo, a placa manda na luz.** O APK toca o áudio e manda
timecode; o T-CAN485 lê o `.fseq` do próprio cartão e toca do relógio dele,
usando o timecode só pra corrigir deriva.

O desacoplamento é de propósito: a central Android pode reiniciar no meio do
festcar que a luz continua. Ver `docs/03-protocolo-serial.md`.

## Estado

Sequenciador funcionando em `web/`: carrega a faixa, **detecta o andamento e
monta a grade a partir do áudio**, edita a timeline, salva o setup em arquivo e
**exporta `.fseq` V2**. O motor roda headless e tem teste.
Firmware não iniciado.
Próximo passo: **value curves** e o **cadastro de fixture** (ver
`docs/07-roadmap.md`).

Hardware definido no [ADR 0010](docs/adr/0010-lilygo-t-can485-na-saida.md):
LilyGO T-CAN485. Ponto aberto que importa: o RS485 da placa **não é isolado**
— ver as consequências lá.

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
| `ui/` | O que só existe no browser: seletor de arquivo, download |
| `App.jsx` | UI. Só desenha e edita o modelo |

O motor não importa React de propósito: é o que deixa exportar sem browser e
testar sem montar tela.

## Convenções

- Documentação e comentários em pt-BR
- Decisões arquiteturais viram ADR em `docs/adr/`, numeradas, nunca editadas — decisão nova supersede a antiga
