# Bluetooth / BLE — tralha chinesa como fixture

**Status: anotado pra testar no futuro.** Nada disto está implementado; este
doc existe pra ideia não se perder e pro teste começar do lugar certo.

## O que a placa dá

O ESP32 clássico da T-CAN485 (WROOM-32E) traz **Bluetooth 4.2 dual-mode** —
Classic e BLE — além do WiFi, no mesmo rádio de 2.4GHz. Como *central* BLE ele
segura **3 conexões simultâneas de fábrica, configurável até ~9** (NimBLE).

## O alvo

Shining masks, bonés de LED, letreiros — os aparelhos que o povo controla por
app chinês. São periféricos **BLE/GATT**, e a comunidade já destrinchou vários:

- **Máscaras do app "Shining Mask"** (TR1906R04 e família): comandos de 16
  bytes cifrados em **AES-ECB com chave fixa conhecida**, escritos numa
  characteristic própria. Há libs de referência em Python e ports pra ESP32.
- **Bonés/letreiros genéricos**: quase sempre UART-sobre-BLE (FFE0/FFE1),
  sem cifra nenhuma — manda byte, aparelho obedece.
- Cada modelo novo é ~meia hora de engenharia reversa: farejar com nRF
  Connect (ou btsnoop) o que o app manda e repetir.

## Como encaixa na arquitetura

A mesma regra de sempre: **efeito fala capacidade, driver traduz**. A máscara
vira uma fixture com capacidades ("cor", "padrão"), e um driver BLE no
firmware converte capacidade → pacote GATT daquele modelo.

O ponto que muda em relação ao DMX: **BLE é evento, não streaming.** Intervalo
de conexão de 20–50ms não aguenta 40fps por aparelho. O driver manda comando
**só quando o valor muda** ("cor vermelha", "animação 3") e o aparelho anima
por conta própria. Pulso na batida dá; strobo pixel-perfeito não — e o
sequenciador precisa saber disso na hora de compor (mesmo espírito do gobo:
capacidade de passo, não contínua).

## Ressalvas antes de prometer

1. **RAM**: NimBLE come ~80KB de heap. O ADR 0010 assume ESP32 **sem PSRAM**
   com duplo buffer de fseq — recontar o orçamento antes. (Mais um motivo pra
   confirmar se a unidade que chegou é WROVER.)
2. **Coexistência de rádio**: BLE ativo junto de RMT (pixel) e esp_dmx é
   território de teste, não de fé. WiFi desligado durante o show ajuda.
3. **Palco é 2.4GHz saturado**: alcance de poucos metros com gente na frente.

## Caminho mais curto pra validar

**Web Bluetooth no Chrome do Android** — o próprio sequenciador, no celular,
conecta na máscara e testa o protocolo **sem firmware nenhum**. Valida o
"consigo controlar esse boné?" antes de encostar no ESP32; o que funcionar no
browser vira spec do driver do firmware depois.

Primeiro passo quando chegar um aparelho na bancada: anotar modelo + app que
ele usa, farejar 3 comandos (ligar, cor, animação) e me trazer o log.
