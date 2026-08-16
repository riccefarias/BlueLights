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

### ✅ Resolvido: 1 node por farol

Medido na bancada (T4 v1.3, dois faróis no cabo), não deduzido:

Mandando **um byte do fio por node** — node 1 só o 1º byte, node 2 só o 2º —
os dois faróis acenderam **cores diferentes**: o primeiro azul, o segundo
verde. Se cada farol fosse 3 endereços, os dois primeiros bytes cairiam
dentro do **mesmo** farol e o segundo teria ficado apagado.

As 3 lentes de um farol são **o mesmo pixel**: acendem sempre juntas, na
mesma cor. Footprint: **3 canais por farol**.

> A foto de marketing com 3 cores diferentes num farol, listada aqui como
> evidência de 3 endereços, **não se sustentou** na medição — provavelmente
> composição ou outro modelo. A hipótese de fabricação ("3 emissores RGB em
> paralelo num CI só") era a certa.

### ✅ Resolvido: ordem de cor é BGR

Mesmo teste, terceiro byte: acende **vermelho**. A ordem do fio é
**B, G, R** — no sketch da bancada, `NEO_BGR`.

Cuidado que isso impõe: a fixture no app fica em **RGB**. Reordenar dos dois
lados ao mesmo tempo é teste que mente — quem traduz é só o firmware.

### ✅ Resolvido: o chip aceita 400kHz

Os dois modos funcionam. As medições de ordem e endereço rodaram em
`NEO_KHZ800`; depois, em `NEO_KHZ400`, 4 faróis seguraram cores fixas e
distintas (azul, verde, vermelho, **rosa**) sem glitch.

Ficou em **400kHz**, que é o que o `02-hardware.md` já preferia: dobra a
margem de timing e, com pixel-count baixo, não se perde nada.

> O rosa é o caso que decide. Vermelho forte **+** azul médio só sai rosa se
> dois canais estiverem certos ao mesmo tempo — timing comendo bit derruba
> ele pra vermelho puro ou magenta antes de estragar as cores puras.

O que já não é mais risco: 6 ou 18 pixels não mudava arquitetura, e agora
sabe-se que são 6.
