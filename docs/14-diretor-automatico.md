# Diretor automático — show sem timeline montada

**Status: anotado, nada implementado.** Dois cenários reais pedem animação
sem show montado à mão, e os dois são o mesmo recurso com fontes de tempo
diferentes.

## Os cenários

1. **Música do cast sem show montado**: o arquivo existe, dá pra analisar
   antes. Gerar um show automático a partir do áudio.
2. **Link FM ao vivo** (o crítico): não existe arquivo nem grade prévia.
   O áudio chega pelo ar e a luz tem que reagir em tempo real.

## A peça central: o diretor

Um módulo no motor que recebe **um relógio de batidas + um sinal de
intensidade** e decide efeitos com regras de palco:

- wash lenta no calmo, corrida no médio, pulso na subida, strobo no drop
- varredura nas cabeças com ritmo proporcional à energia — **respeitando a
  física do alerta de atropelamento**, que já existe no perfil
- viradas de seção detectadas por salto de energia, cortes encaixados em
  compasso

O que muda entre os cenários é só de onde vêm batida e intensidade.

## Cenário 1 — gerador offline

Já existe metade: rastreador de batidas, grade, envelope (peaks). Falta:

- intensidade por compasso (RMS + energia de grave → calmo/médio/
  subida/drop)
- o gerador materializando a decisão do diretor em **clips normais na
  timeline** — não é caixa preta: são blocos comuns, editáveis, apagáveis,
  exportáveis pra `.fseq` como qualquer show
- UI: botão "Gerar show automático" com faixa carregada e timeline vazia
  (ou por trilha)

100% código, testável, não depende de hardware.

## Cenário 2 — ao vivo, em camadas

1. **Browser primeiro** (valida tudo sem hardware novo): modo AO VIVO no
   sequenciador — microfone via `getUserMedia`, detector de onset no grave
   (fluxo de energia com média adaptativa; mais simples que o rastreador
   offline), estimativa de andamento, e o mesmo diretor pintando o palco
   virtual e saindo pela **bancada via WebSerial**. Evento FM = notebook +
   ESP32 da bancada no cabo.
2. **Firmware depois**: o modo reativo standalone na T-CAN485, evolução da
   animação de fallback que o docs/03 já previa. Decisão de hardware
   pendente (do usuário):
   - **mic I2S (INMP441, ~R$10)** — inclinação atual: funciona sem a
     central, que é o espírito do projeto
   - line-in no ADC (precisa circuito de polarização)
   - central Android escutando e mandando pulsos pela serial (a moldura de
     `firmware/core/protocolo.h` comporta um tipo `BATIDA` de graça)

## Ordem quando for implementar

1. Diretor + gerador offline — entrega o cenário 1 e cria o miolo
   reutilizável
2. Modo ao vivo no browser — cenário 2 operável via notebook + bancada
3. Firmware reativo — porta um diretor já maduro, quando a placa estiver
   na bancada e o hardware de áudio decidido
