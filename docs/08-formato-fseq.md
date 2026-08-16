# Formato `.fseq`

Formato aberto do FPP/xLights. É o contrato entre o sequenciador e o
firmware: o browser escreve, o ESP toca. Implementado em
`web/src/motor/fseq.js` — escritor e leitor.

Só a **V2** é suportada. Compressão zlib, ver [ADR 0008](adr/0008-fseq-v2-com-zlib.md).

## Cabeçalho (32 bytes)

Conferido contra `FalconChristmas/fpp`, `src/fseq/FSEQFile.cpp`. Tudo
little-endian.

| Offset | Tam | O quê |
|---|---|---|
| 0 | 4 | `PSEQ` |
| 4 | 2 | offset onde começa o dado de canal |
| 6 | 1 | versão menor (0) |
| 7 | 1 | versão maior (2) |
| 8 | 2 | tamanho do cabeçalho: `32 + blocos×8 + esparsos×6` |
| 10 | 4 | canais por quadro |
| 14 | 4 | número de quadros |
| 18 | 1 | passo em ms — **25**, que é 40fps |
| 19 | 1 | flags (0) |
| 20 | 1 | `(blocos >> 4 & 0xF0) | tipo de compressão` |
| 21 | 1 | `blocos & 0xFF` |
| 22 | 1 | número de faixas esparsas |
| 23 | 1 | reservado |
| 24 | 8 | id único |

Tipo de compressão: `0` nenhuma, `1` zstd, `2` zlib.

A contagem de blocos são 12 bits partidos entre dois bytes — os 4 bits altos
moram no nibble alto do byte 20. É o detalhe do formato que mais dá erro de
implementação.

Depois do cabeçalho fixo, em ordem:

1. **Índice de blocos** — `blocos × (u32 primeiro quadro, u32 bytes comprimidos)`
2. **Faixas esparsas** — não usamos, sempre 0
3. **Cabeçalhos variáveis** — `u16 tamanho` (contando estes 4 bytes),
   2 bytes de código, dado. Escrevemos `mf` e `bl` (abaixo)
4. **Dado de canal**, alinhado em múltiplo de 4

## Blocos

Alvo de 64KB descomprimidos por bloco, o mesmo do FPP, com teto de 255 blocos.

O bloco é a unidade de leitura do player: para tocar o quadro *n*, o ESP
acha no índice o bloco que o contém, lê só ele e descomprime. Bloco menor
desperdiça índice; bloco maior faz o ESP segurar RAM à toa e encarece o seek.

## Carimbo do croqui — cabeçalho `bl`

Um `.fseq` **só faz sentido contra o croqui que o gerou**. A numeração de
canal foi cozida junto no render: mover uma head, trocar o perfil de uma
cabeça ou passar um farol de 1 pra 3 nodes envelhece todo arquivo já
exportado.

O jeito como isso morde é feio, porque **o arquivo não dá erro — ele toca**.
Os bytes de pan caem no canal de gobo da cabeça seguinte e a luz enlouquece
só naquela faixa. Num evento, é meia hora de gente olhando cabo.

Daí o carimbo, num cabeçalho variável de código `bl`:

```
1;98;b961683a
│  │  └─ impressão FNV-1a do mapa de canais
│  └──── total de canais
└─────── versão do carimbo
```

Código de duas letras é espaço do próprio formato, e leitor que não conhece
o código só o ignora — conferido no `parseVariableHeaders` do FPP. Arquivo
carimbado continua tocando no FPP e abrindo no xLights.

**É a impressão do mapa de canais, não do croqui cru.** Entra o que muda o
significado de um byte: ordem, nodes, ordem de cor, perfil de cada cabeça.
Não entram rótulo nem posição em si — arrastar um farol dois pixels sem
mudar a ordem não invalida nada, e não deve invalidar mesmo.

Do lado de cá quem confere é `conferirRig()`. Do lado do ESP é o mesmo
trabalho: comparar dois números antes de tocar, e cair na animação de
fallback em vez de mandar lixo pro barramento.

Arquivo **sem** carimbo — vindo do xLights, por exemplo — passa com aviso,
não com reprovação.

## O que sai daqui

O quadro é o array de canais inteiro, na numeração que o croqui derivou:
pixels primeiro (ordenados por Y depois X), depois as heads (por X).

- **Pixel** — `nodes × bytes por node`, na ordem de cor da fixture.
  RGB/GRB/BRG ocupam 3, RGBW ocupa 4
- **Head** — o footprint do perfil, canal a canal. Par grosso/fino vira
  16 bits; o resto é byte puro

## Provisório, e vale conferir antes do primeiro show

O perfil ainda não carrega **faixas rotuladas** (ver
[05-perfis-de-fixture.md](05-perfis-de-fixture.md)), então dois canais saem
por convenção, não por dado do manual:

- **Gobo** — cada forma pega uma fatia igual de 0..255 e o valor cai no
  centro dela, que é o ponto mais tolerante a perfil impreciso. Cabeça real
  tem faixa irregular (`0–9` aberto, `10–19` estrela...) e vai cair na forma
  errada até o perfil trazer a tabela
- **Shutter** — sai em 255. É o valor de "aberto" na maioria das cabeças
  chinesas, mas em algumas 255 é strobo rápido. **Conferir na tabela DMX**
  ao cadastrar cabeça nova
- **Rotação de gobo** — mapeada em 0..127, a metade indexada do canal.
  A metade de cima é velocidade contínua e não é usada

Nada disso muda o formato do arquivo: é a tradução capacidade → byte, que
mora em `web/src/motor/canais.js` e passa a ler as faixas quando elas existirem.

## Testando

```bash
cd web && npm test
```

Cobre ida e volta byte a byte (comprimido e não), os offsets do cabeçalho, e
que o quadro exportado é igual ao que o preview desenha — se divergirem, o
bug é do motor e não do exportador.

O bloco zlib é conferido com o `zlib` do Node, por fora do nosso próprio
leitor: se saísse como deflate cru em vez de RFC1950, o teste quebra — e o
FPP também quebraria.

## xLights como validador

Com o exportador funcionando dá para sequenciar no xLights, exportar, e
comparar com o que sai daqui. Ferramenta de teste de graça.

Exportar de lá em **zlib ou sem compressão** — arquivo zstd ainda não abre.
