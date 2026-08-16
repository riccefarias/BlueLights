# ADR 0009 — Arquivo no disco onde der, load manual onde não der

## Contexto

Até aqui o sequenciador não salvava nada. Arrastar um farol no croqui e dar
F5 voltava tudo pro `RIG_PADRAO` compilado no código. Isso já era ruim, e
fica insustentável com o cadastro de fixture: ninguém digita a tabela DMX de
três cabeças pra perder no reload.

O projeto é inteiro no browser, então "salvar" não é óbvio. Os caminhos:

| Caminho | Onde funciona |
|---|---|
| File System Access | Chrome/Edge **desktop** |
| localStorage / IndexedDB | tudo |
| OPFS | tudo menos Firefox Android e Safari iOS |
| download / upload | tudo |

## Decisão

**File System Access onde existir, download/upload onde não existir.**
Um documento `.blz.json`, com campo de versão.

O handle do arquivo é guardado no IndexedDB pra sobreviver ao reload. O
conteúdo, não — o arquivo no disco é a fonte da verdade.

## Porquê

**HTTPS não resolve o celular.** A primeira intuição é que basta contexto
seguro e pedir permissão. Não é: no Chrome Android e no Safari iOS a API
não existe — `showSaveFilePicker` é `undefined`. Não há permissão a pedir.

**Mas o corte cai onde já estava.** O Estúdio é desktop e é onde se autora:
croqui, timeline, cadastro de cabeça. Palco e Mesa são celular e é onde se
opera: pad de cena, master, blackout. O trabalho que dói perder acontece
exatamente onde a API funciona.

**Arquivo de verdade vale mais que armazenamento de browser.** localStorage
e IndexedDB somem quando se limpa dados do site, não dá pra mandar pra
alguém e não entra no git. Um `.blz.json` no disco tem backup, histórico e
diff — e o formato é texto de propósito, pra continuar assim.

**Um arquivo só, por enquanto.** Rig e sequência juntos. O certo a prazo é
separar: um setup de carro serve doze faixas, e embutir o setup em cada
sequência obriga a reeditar doze arquivos ao trocar uma cabeça. Só que hoje
nada na UI edita clip, então o segundo arquivo seria cerimônia. O campo `v`
transforma a separação em migração quando ela fizer sentido.

## Consequências

- No desktop: vincula uma vez e o autosave grava por cima, com folga de
  700ms pra não torrar disco a cada pixel arrastado
- No celular: botão Abrir e botão Baixar. Indicador de "não salvo" pra não
  fechar a aba achando que salvou
- **Uma permissão por sessão.** O handle sobrevive no IndexedDB, a permissão
  não: o browser exige gesto do usuário pra reconceder, e não dá pra chamar
  `requestPermission()` sozinho no boot. Daí o botão "continuar em X".
  Instalado como PWA, o Chrome permite permissão permanente e o clique some
- Enquanto a permissão não é reconcedida o autosave fica **desligado**, senão
  gravaria o rig padrão por cima do trabalho salvo
- Documento inválido é recusado inteiro, antes de aplicar qualquer coisa.
  Meia carga deixa o app num estado que o usuário não sabe desfazer

## Descartado

- **IndexedDB como autosave universal por baixo de tudo.** É a rede de
  segurança que cobriria a aba morrendo no celular no meio de uma edição.
  Ficou de fora por escolha de escopo, não por ser má ideia — se editar
  croqui no celular virar hábito, é a primeira coisa a acrescentar
- **OPFS.** Filesystem de verdade e mais rápido, mas Firefox Android e
  Safari iOS não têm, e os arquivos são invisíveis pro usuário. Complexidade
  a mais pra continuar precisando do fallback
- **Backend.** Resolveria sincronização entre desktop e celular, mas põe
  servidor e conta de usuário num projeto que roda offline na beira do carro,
  onde o 2.4GHz já está saturado. O arquivo vai por cabo ou por WhatsApp
