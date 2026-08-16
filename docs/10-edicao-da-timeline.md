# Edição da timeline

A lógica mora em `web/src/modelo/edicao.js` — funções puras sobre a lista de
trilhas, todas devolvendo trilha nova sem mutar nada. A UI só converte arrasto
em tempo e chama.

## Grade e limites

| | |
|---|---|
| Encaixe | semicolcheia (`BEAT / 4`) |
| Duração mínima | uma semicolcheia |
| Bloco novo nasce com | 4 batidas, ou o que couber até o vizinho |

A grade é fina o bastante pra síncope e grossa o bastante pra não precisar de
mira no celular.

## Bloco não sobrepõe bloco

Arrastar e redimensionar param no vizinho em vez de passar por cima.

Não é preciosismo: o motor resolve o clip ativo com
`clips.find(c => t >= c.t0 && t < c.t1)`. Com dois blocos sobrepostos ele pega
o primeiro e o outro **some sem dar erro nenhum** — o tipo de coisa que se
descobre no evento, não na bancada.

Quer duas coisas ao mesmo tempo no mesmo alvo? Duas trilhas. É pra isso que
elas existem, e no DMX elas compõem por campo: varredura escreve `pan`, gobo
escreve `gobo`, sem se atropelar.

> **Bloco que não se mexe não é bug.** Se o vizinho está colado e a duração
> preenche o vão inteiro, não há pra onde ir. No show padrão o `c1` está
> exatamente assim: vai do beat 0 ao 16 e o `c2` começa no 16.

## Trocar o efeito troca os parâmetros

`hue` de uma corrida não quer dizer nada num gobo. Carregar sobra de parâmetro
antigo é o tipo de coisa que reaparece meses depois como bug de render, então
o clip renasce com os padrões do efeito novo — que são os mesmos `??` de
`motor/efeitos.js`.

## Undo

Snapshot do documento inteiro (`rig` + `sequencia`), não patch por campo.

Com ~18 nodes e uma dúzia de clips o estado são poucos KB, e guardar o estado
anterior por completo não tem como divergir do que a tela mostra. Limite de 80
passos.

**Um arrasto é um ponto só.** A marca é feita no primeiro movimento de verdade
(mais de 3px), não no `pointerdown` — senão todo clique de seleção empilha um
estado e o Ctrl+Z passa a não fazer nada visível.

## Atalhos

| | |
|---|---|
| `Ctrl/Cmd + Z` | desfazer |
| `Ctrl/Cmd + Shift + Z`, `Ctrl + Y` | refazer |
| `Delete` / `Backspace` | remover o bloco selecionado |
| `Espaço` | tocar / pausar |

Não capturam quando o foco está num campo de texto: `Ctrl+Z` dentro de um
input é do input.

## Criar e apagar

Tocar num espaço vazio de uma trilha marca **onde** o bloco vai entrar; o
inspetor então lista os efeitos e o clique cria. A lista é a mesma de sempre,
derivada do perfil de cada equipamento — efeito que o alvo não suporta aparece
apagado e não dá pra escolher.

Trilha nova pelo `+ trilha` no canto do gutter, apontando pra qualquer grupo ou
fixture solta. Trilha vazia mostra um `×` pra sumir.

## Testando

```bash
cd web && npm test
```

`edicao.test.js` cobre encaixe, colisão nos dois sentidos, duração mínima,
id que não colide, e que nenhuma operação muta o estado original — que é a
propriedade da qual o undo depende.
