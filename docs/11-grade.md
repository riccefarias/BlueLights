# A grade

A régua musical do documento. Converte segundo em batida e batida em segundo,
e é a única coisa no projeto que sabe as duas linguagens.

Implementação em `web/src/modelo/grade.js`; o rastreamento que a alimenta em
`web/src/motor/batidas.js`.

## Tudo é mapa de batidas

BPM constante **não é um modo separado** — é um mapa regularmente espaçado.
Um caminho só no motor, e o dia que a faixa tiver rubato nada muda a jusante.

```
gradeFixa({ bpm: 128, duracao: 15 })   ->  mapa regular
gradeDeBatidas([0, 0.71, 1.43, ...])   ->  mapa da música
```

## O efeito fala em batida

Antes: `per = BEAT / div` e `tempo % per`. Aritmética a partir de uma constante,
com deriva acumulando.

Agora:

```js
grade.faseEm(t, div)     // 0 a 1 dentro da subdivisão
grade.passoEm(t, div)    // qual subdivisão, pra efeito de passo discreto
grade.indiceEm(t)        // batida fracionária desde o começo
grade.tempoDe(indice)    // o inverso
grade.encaixar(t, div)   // ponto de grade mais próximo
```

É a mesma regra do perfil de fixture, aplicada ao tempo:

> **Regra de ouro: o efeito nunca sabe número de canal.** Ele diz "tilt = 0.3".
> O perfil traduz.

Aqui o efeito diz "pisca a cada 1/8" e a grade traduz. Nos dois casos o efeito
não sabe — e é isso que o deixa portátil.

**Taxa é sempre por batida.** `rate: 0.125` numa varredura é um ciclo de pan a
cada 8 batidas, em qualquer andamento.

## Por que isso importa: deriva

Erro constante some com o slider de atraso. Deriva não — ela cresce ao longo
da faixa. Em Farmando Aura (4:07):

| Erro de BPM | Deriva no fim | Em passos de 1/16 |
|---|---|---|
| 1 | 2936ms | 16 passos |
| 0,1 | 294ms | 1,6 passo |
| 0,01 | 29ms | 0,16 passo |

Pattern repetitivo é o caso mais sensível: um pisca de semicolcheia com 0,1 BPM
de erro entra em **antifase aos 75 segundos**, piscando exatamente entre as
batidas. Com o mapa não existe acúmulo — cada batida está ancorada onde a
música está, e o orçamento de precisão deixa de existir.

## Rastreamento

Programação dinâmica no envelope de ataque, na linha do Ellis 2007: maximiza a
soma dos ataques escolhidos, penalizando quem se afasta do período esperado.

Um parâmetro só, a **rigidez**, decide se a grade é metrônomo ou baterista
humano. Alta gruda no andamento médio e ignora rubato; baixa segue cada ataque
e aceita qualquer bobagem como batida.

O DP só marca onde tem ataque, então o mapa é estendido pra trás e pra frente
no passo local — o sequenciador precisa de compasso 1 mesmo onde a música ainda
não entrou.

Medido em Farmando Aura: **347 batidas, 84,23 BPM, 297ms** de análise.

## A duração vem do arquivo

Era `DURATION = BPM × BARS` e valia 15 segundos, o que tornava impossível
sequenciar faixa nenhuma. Agora vem do áudio carregado.

Consequência visível: a régua desenha compasso e batida **a partir do mapa**,
não de divisão igual. As linhas caem em cima da música mesmo com rubato.

## No documento

A grade viaja inteira no `.blz.json`, com o mapa. São ~500 números numa faixa
de 4 minutos, gravados com 4 casas — 0,1ms de resolução, muito abaixo do que
qualquer luz mostra.

É o preço de nunca mais reanalisar o áudio, e de o rubato ajustado à mão
sobreviver ao arquivo. Documento sem grade cai numa fixa, marcada com
confiança 0.

## Testando

```bash
cd web && npm test
```

`grade.test.js` cobre as conversões nos dois sentidos, fase, encaixe em mapa
irregular e extrapolação fora das pontas. `batidas.test.js` compara o mapa
contra uma grade rígida numa faixa que acelera — que é o caso que justifica o
mapa existir.
