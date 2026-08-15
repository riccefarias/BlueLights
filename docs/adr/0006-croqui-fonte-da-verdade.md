# ADR 0006 — Croqui como fonte da verdade

**Status:** aceito

## Contexto

O rig precisa existir em algum lugar: hardcoded, num arquivo de config,
ou desenhado numa tela.

## Decisão

**Croqui editável** define posição, tipo, perfil e node count.
Canais e grupos são **derivados** da posição física, nunca armazenados.

## Consequências

- Mover um farol reorganiza a numeração sozinho, igual xLights
- Grupos "superior" e "inferior" saem da posição Y: adicionar um farol embaixo
  e ele entra no grupo certo sem configurar nada
- Apresentação e Croqui são dois modos de desenho do mesmo canvas
- Palco virtual fixo de 1000×700 com letterbox: redimensionar não move nada

## Alternativas descartadas

**Lista manual de membros de grupo** — mais uma coisa pra dessincronizar do mundo real.

**Coordenada relativa ao canvas** — equipamento mudaria de lugar ao redimensionar
a janela ou dobrar o telefone.
