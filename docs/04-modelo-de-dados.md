# Modelo de dados

Tudo é JSON serializável. Undo/redo é patch de estado; salvar é `JSON.stringify`.

## Palco virtual

Coordenadas num espaço fixo de **1000×700**, com letterbox no canvas.

Redimensionar a janela ou dobrar o telefone **não move equipamento de lugar** —
por isso não se usa coordenada relativa ao canvas.

## Fixture

```json
{
  "id": "f2",
  "k": "farol",
  "lb": "Sup · Bravox",
  "x": 500, "y": 310,
  "n": 3,
  "co": "RGB"
}
```

| Campo | O quê |
|---|---|
| `k` | tipo: `cab`, `farol`, `fita`, `head` |
| `x` `y` | posição no palco virtual |
| `n` | nodes (pixel) |
| `co` | ordem de cor: RGB, GRB, BRG, RGBW |
| `pf` | id do perfil (DMX) |

**Ordem de cor importa:** WS2811 clone vem em RGB, GRB ou BRG sem avisar.
Manda vermelho, acende verde.

## Derivados

Nunca armazenados — sempre calculados do croqui:

- **Canais**: pixels primeiro (ordenados por Y depois X), depois heads (por X)
- **Grupos**: `g-todas`, `g-sup` / `g-inf` pela média de Y, `g-heads`
- **Footprint**: pixel = `n × 3`; head = tamanho do perfil

## Trilha e clip

```json
{
  "target": "g-sup",
  "kind": "pixel",
  "clips": [
    { "id": "c3", "fx": "chase", "t0": 1.875, "t1": 7.5,
      "p": { "speed": 1.1, "hue": 0.55 } }
  ]
}
```

`target` é id de fixture **ou** de grupo. O motor resolve.

## Composição

- **Pixel**: blend aditivo entre camadas
- **DMX**: merge **por campo**. `sweep` escreve `pan`; `gobos` escreve `gobo`;
  `gspin` escreve `grot`. Compõem sem se atropelar

Depois de tudo composto, o passe final zera o que o perfil da fixture não tem.

## A fazer

- **Value curves**: qualquer parâmetro animável por curva ao longo do clip.
  É o que separa show bom de pisca-pisca
- **Buffer style** por clip: como o buffer do grupo mapeia nos nodes
  (per model, vertical, horizontal). Com as caixas empilhadas isso muda muito
- **Ordem da corrente**: a ordem física do dado nem sempre é a ordem espacial;
  fita montada de cabeça pra baixo precisa inverter
- **Rotação** de fixture no croqui
- **Override manual de endereço** — quem define de verdade é o menu da cabeça,
  e tem o truque de duas heads no mesmo endereço pra espelharem
