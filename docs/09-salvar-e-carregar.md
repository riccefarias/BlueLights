# Salvar e carregar

Decisão e porquê em [ADR 0009](adr/0009-persistencia-arquivo-com-fallback.md).
Implementação em `web/src/modelo/documento.js` (puro, testado) e
`web/src/ui/arquivo.js` (o que toca browser).

## O documento

Um arquivo `.blz.json`. Texto, indentado, versionado — dá pra abrir no editor,
ver diff no git e mandar por WhatsApp.

```json
{
  "tipo": "bluelights",
  "v": 1,
  "rig": [ { "id": "f1", "k": "farol", "lb": "Sup · Kaos L", "x": 374, "y": 310, "n": 3 } ],
  "sequencia": [ { "target": "g-sup", "kind": "pixel", "clips": [] } ],
  "midia": "faixa07.mp3"
}
```

O campo `v` existe desde a v1. Sem ele não há como migrar o que já está
salvo — e não dá pra pedir pro usuário "salvar de novo" um arquivo que ele
já não consegue abrir.

**Canais e grupos não entram.** São derivados do croqui e recalculados ao
carregar. Guardar derivado é guardar duas verdades.

**O áudio não entra.** O documento guarda o *nome* da faixa; o mp3 fica de
fora. Ao reabrir, o croqui e a sequência voltam, mas a faixa precisa ser
escolhida de novo.

## Os dois caminhos

| | Estúdio (desktop) | Palco / Mesa (celular) |
|---|---|---|
| API | File System Access | não existe |
| Salvar | vincula e grava por cima | baixa o arquivo |
| Abrir | seletor do sistema | input de arquivo |
| Autosave | sim, com folga de 700ms | não — indicador de "não salvo" |

No celular não é questão de permissão: `showSaveFilePicker` é `undefined` no
Chrome Android e no Safari iOS. HTTPS é requisito da API, mas não a
destrava onde ela não foi implementada.

## A permissão que não sobrevive

O handle do arquivo é guardado no IndexedDB e volta no reload. A permissão
de escrita, não: o browser exige gesto do usuário, e `requestPermission()`
não pode ser chamado sozinho no boot.

Na prática, **um clique por sessão** — o botão "continuar em corsa.blz.json".
Instalado como PWA, o Chrome permite permissão permanente e o clique some.

Enquanto esse clique não vem, o autosave fica desligado de propósito. Ligado,
gravaria o rig padrão por cima do arquivo salvo antes de ler o que tem nele.

## Ao carregar

O documento é validado inteiro antes de aplicar qualquer coisa: tipo,
versão, ids repetidos, tipo de equipamento desconhecido, posição faltando,
clip com tempo invertido. Qualquer problema recusa o arquivo com a mensagem
na tela e deixa o app como estava.

Carga pela metade deixa um estado que o usuário não sabe desfazer nem de
onde veio.

## Testando

```bash
cd web && npm test
```

`documento.test.js` cobre ida e volta, recusa de arquivo de outra ferramenta,
arquivo de versão futura e croqui quebrado. O que não dá pra testar sem
browser é o seletor de arquivo do sistema — esse é manual.
