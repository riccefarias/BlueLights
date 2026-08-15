# Arquitetura

## Princípio central: separar efeito de geometria

Roubado do xLights, e é a ideia que faz tudo funcionar.

Um efeito **nunca** sabe onde os LEDs estão fisicamente. Ele desenha numa matriz
abstrata (o *render buffer*). Depois um mapeamento leva pixel-do-buffer → node.

Consequência: trocar o modelo de "linha de 18" pra "grade 6x3" muda o resultado
sem tocar em nenhum efeito. E mover um farol no croqui não quebra sequência nenhuma.

## Vocabulário

| Termo | O que é |
|---|---|
| **Node** | Um pixel endereçável. Node RGB ocupa 3 channels |
| **Channel** | Um byte no universo DMX / na corrente de pixel |
| **Fixture** | Um equipamento físico. Tem posição, perfil e footprint |
| **Group** | Conjunto de fixtures que renderiza como buffer único |
| **Clip** | Um efeito ocupando um trecho de tempo numa trilha |
| **Capacidade** | O que uma fixture consegue fazer: pan, tilt, gobo, rgb... |

## Pipeline por frame

```
para cada trilha:
  acha o clip ativo em t
  resolve o alvo (fixture ou grupo) -> lista de membros
  renderiza o efeito num buffer do tamanho total
  mapeia buffer -> nodes de cada membro
  compõe com o que já está lá (blend)

passe final:
  zera capacidades que o perfil da fixture não tem
  aplica master
  serializa no array de canais -> um frame
```

A pilha de frames a 40fps é o `.fseq`.

## Camadas do código

```
motor/        funções puras. Sem React, sem DOM.
              roda no browser, num worker e no exportador.
modelo/       o documento: rig + tracks + clips. JSON serializável.
ui/           React. Só desenha e edita o modelo.
```

**Regra que não se quebra:** nenhum efeito importa React. O motor precisa rodar
headless pra exportar `.fseq` e pra ter teste automatizado.

## O croqui é a fonte da verdade

Posição física determina:

- **Numeração de canais** — de cima pra baixo, esquerda pra direita
- **Grupos automáticos** — "caixa superior" é quem está acima da média em Y

Não existe lista manual de membros. Lista manual é mais uma coisa pra dessincronizar
do mundo real.
