# Máquina de fumaça — jatos curtos, e talvez uma de 2 estágios

**Status: anotado.** Nada implementado; a decisão de fabricar ou não fica pra
quando a fumaça entrar de verdade no rig.

## O problema

Fumaça é o aparelho mais traiçoeiro do rig: DMX é mão única, e a máquina não
tem como avisar que o bloco aquecedor está pronto. Pedir fumaça durante o
reaquecimento não dá erro — simplesmente não sai nada, ou sai cuspe de
fluido. Nas baratas, um jato longo rouba tanto calor que ela corta e fica
20s–2min morta reaquecendo.

## A resposta barata (e provavelmente suficiente)

**Disciplina de rajada**: jatos de 2–5s espaçados de 30–60s ficam dentro do
ciclo térmico e a máquina está sempre pronta. E **antecipar o cue**: fumaça
demora uns segundos pra espalhar e aparecer nos feixes — o bloco de "Jato de
fumaça" entra 3–5s antes do momento em que ela precisa estar visível.

Regra de ouro herdada de quem opera: nunca desenhar um drop que dependa de
fumaça logo depois de um jato longo.

## A máquina de 2 estágios (se um dia fabricar)

Ideia: replicar o que as profissionais fazem por dentro — gestão de duty
cycle — com duas resistências:

1. **Standby**: resistência 1 segura o bloco numa temperatura alta, perto do
   ponto de operação (delta pequeno = boost rápido de verdade).
2. **Boost**: resistência 2, mais forte, sobe pro ponto de operação antes do
   jato e ajuda a segurar temperatura durante ele.

Arquitetura:

- **Interlock local, nunca por DMX**: um controlador na máquina (ESP32 de
  gaveta) lê termistor/termopar e só liga a bomba se o bloco estiver no
  ponto. DMX chega como *pedido*; quem decide é o loop local.
- **DMX de entrada, 3 canais**: `fog` (bomba/intensidade), `fan`, `boost`.
- **Lookahead no motor** (item futuro do sequenciador): a timeline sabe o
  futuro — o render enxerga um bloco de fumaça chegando e levanta `boost`
  N segundos antes, automático. Massa térmica vira problema de agendamento.
- **Telemetria pelo CAN** (o barramento "que ninguém pediu" da T-CAN485): a
  máquina reporta temperatura/ready de volta. DMX pra pedir, CAN pra
  responder — fecha o ciclo que o DMX sozinho não fecha.

### Peças pro aquecedor (avaliado em 2026-08)

- **Não serve**: manta de aquecedor de banco automotivo — 30–60W espalhados
  pra chegar a 40–50°C, isolação que derrete muito antes dos ~250–300°C que
  a vaporização exige. Oposto térmico do necessário.
- **Melhor caminho**: bloco de **resistência de reposição de máquina de
  fumaça** (ML, 400/900/1500W) — serpentina de fluido e furo de termostato já
  no alumínio. Dois blocos = os dois estágios prontos.
- Alternativas DIY: resistência de cartucho 220V num bloco usinado (a
  serpentina vira problema seu) ou base de ferro de passar (~1000W).
- **12V direto não rola — mas não pelos watts**: inversor não cria energia
  (900W AC ≈ 80A saindo da bateria do mesmo jeito, + perdas). O que ele muda
  é ONDE a corrente alta existe: um trecho único bateria→inversor com cabo
  grosso, e dali pra frente 220V a 4A — fio fino, e chaveamento AC onde SSR
  zero-crossing é barato (interromper 80A DC é arco que não se apaga e
  contator caro). E resistência de 250°C em 220V é commodity; em 12V é peça
  exótica. Com 3 SD3000 no carro, o som já puxa uma ordem de grandeza a
  mais — a fumaça (ciclada, média bem menor que o pico) só precisa entrar
  na soma do dimensionamento do inversor junto com as cabeças AC.

### Segurança inegociável

Resistência na rede elétrica + fluido quente: **termostato mecânico de
limite E fusível térmico one-shot em série**, os dois independentes do
microcontrolador — software trava, sensor descola, e o hardware desliga
sozinho mesmo assim. SSR pra chavear resistência. Fluido de fumaça de
verdade (glicol/água); nunca óleo — névoa inflamável e pulmão cobrando
depois.

## Quando a máquina existir

Medir o duty cycle real (cronômetro: tempo de jato até cortar, tempo de
recuperação) e aí sim valem dois itens de sequenciador, irmãos do alerta de
atropelamento:

- ficha térmica no perfil (`rajada máx`, `recuperação`) como calibração
- alerta na timeline: jato longo demais, ou rajada pedida dentro da janela
  de reaquecimento
