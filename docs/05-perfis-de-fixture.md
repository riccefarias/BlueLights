# Perfis de fixture

## O conceito

Não se cadastra canal solto. Cadastra-se **qual modelo é**, e o perfil traz o mapa.

```
Beam 7R · com gobo        Wash RGBW · sem gobo
 1 Pan                     1 Pan
 2 Pan fino                2 Pan fino
 3 Tilt                    3 Tilt
 ...                       ...
 9 Gobo            <--     (não existe)
10 Rotação de gobo
```

**Regra de ouro: o efeito nunca sabe número de canal.** Ele diz "tilt = 0.3",
"gobo = estrela". O perfil traduz.

## O perfil alimenta a timeline

É aqui que ele deixa de ser burocracia. Cada efeito declara as capacidades que exige:

```js
sweep  -> needs: ["pan", "tilt"]
gobos  -> needs: ["gobo"]
jato   -> needs: ["fog"]
```

Selecionando um alvo, a paleta se molda ao que aquele equipamento consegue fazer:

```
Todas as heads
  Varredura        todos   <- as 3 têm pan/tilt
  Troca de gobo    2/3     <- a central não tem
  Jato de fumaça   —       <- nenhuma tem
```

**Grupo misto não é erro.** Aplicar gobo nas três funciona: duas trocam, a central
ignora aquela capacidade. O sistema avisa em vez de bloquear, porque frequentemente
é exatamente isso que se quer.

O motor garante o comportamento num passe final que zera capacidades ausentes —
não é caso especial no desenho.

## Gobo não é cor

Gobo é uma **forma** — estêncil de metal no caminho do feixe, projetando padrão.
A cor vem de outro canal. Dá pra ter estrela vermelha ou estrela azul.

Três canais, três responsabilidades: `gobo` escolhe a forma, `grot` gira, `r/g/b` colore.

Gobo também **bloqueia luz**: o feixe escurece quando há forma no caminho.

## O que o perfil precisa carregar

- **Canais fino (16 bits).** Pan quase sempre é pan + pan fino. Tratar como um byte só
  deixa o movimento lento em degrau visível
- **Faixas com rótulo.** Canal de gobo não é contínuo: 0–9 aberto, 10–19 estrela,
  20–29 pontos. É o que faz a UI mostrar "gobo: estrela" em vez de "canal 9 = 137".
  É o item mais trabalhoso de cadastrar e o que mais muda a usabilidade
- **Footprint** em canais

## Não inventar formato

- **GDTF** (General Device Type Format) é o padrão da indústria
- **Open Fixture Library** tem milhares de definições em JSON aberto

Pra cabeça chinesa que não está em lugar nenhum, digita-se do manual — toda moving head
vem com a tabela DMX impressa. Meia hora por modelo, uma vez na vida.

**O gargalo é o cadastro, não o código.** A lógica de capacidades é meia tarde.
Importar GDTF vale mais que qualquer editor bonito de perfil.

## Pixel também tem perfil

Farol AJK: **1 node ou 3 nodes?**

Evidência até aqui:
- Foto de marketing mostra 3 cores diferentes num farol — só explicável com 3 endereços
- Outra foto mostra os 3 emissores em roxo — mata a hipótese de LEDs discretos R, G e B fixos,
  porque roxo é mistura
- Fabricação aponta pro mais barato: 3 emissores RGB em paralelo num CI só

### Teste definitivo, quando chegarem

1. Manda pixel 1 = **vermelho puro**
   - uma lente acende → 3 endereços
   - as três acendem → 1 endereço
2. Manda pixel 1 = **azul puro**
   - as três acendem → 1 endereço, confirmado
   - acende a mesma lente do teste 1 → 3 endereços

Não trava a compra: 6 ou 18 pixels não muda nada de arquitetura.
No croqui é um toggle.

**Perguntar ao fabricante junto:** protocolo é 400 ou 800kHz?
