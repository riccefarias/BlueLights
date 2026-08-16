/* ============================================================
   SERIAL — DMX ao vivo pelo navegador (Web Serial API).

   O mesmo buffer de bytes que vira .fseq sai pela USB no protocolo
   Enttec DMX USB Pro, que é o que o firmware de bancada fala
   (firmware/bancada). Mesa de canais e show tocando viram luz de
   verdade sem firmware do show pronto.

   Web Serial existe no Chrome/Edge de DESKTOP. No Android não tem
   (nem adianta pedir): lá o caminho é o APK, como sempre foi o plano.
   Por isso o botão só aparece quando a API existe.
   ============================================================ */

export const temSerial = typeof navigator !== "undefined" && "serial" in navigator;

const BAUD = 921600;
export const FPS_SERIAL = 30;      // strobo não precisa de mais; USB agradece

/** Quadro Enttec label 6: 0x7E 06 lenL lenH [start code + canais] 0xE7 */
export function quadroEnttec(canais) {
  const n = canais.length + 1;
  const b = new Uint8Array(n + 5);
  b[0] = 0x7E; b[1] = 6; b[2] = n & 255; b[3] = n >> 8; b[4] = 0;
  b.set(canais, 5);
  b[n + 4] = 0xE7;
  return b;
}

/**
 * Abre a porta e fica mandando o que `pegarBytes()` devolver, FPS_SERIAL
 * vezes por segundo. Devolve um handle com `parar()`. `aoCair` avisa
 * quando o cabo sai ou a escrita falha — a UI decide o que mostrar.
 */
export async function ligarDmx(pegarBytes, aoCair) {
  const porta = await navigator.serial.requestPort();
  await porta.open({ baudRate: BAUD });
  const escritor = porta.writable.getWriter();
  let vivo = true;

  const tique = setInterval(async () => {
    if (!vivo) return;
    try {
      const canais = pegarBytes();
      if (canais?.length) await escritor.write(quadroEnttec(canais));
    } catch {
      parar();
      aoCair?.();
    }
  }, 1000 / FPS_SERIAL);

  async function parar() {
    if (!vivo) return;
    vivo = false;
    clearInterval(tique);
    try { escritor.releaseLock(); await porta.close(); } catch {}
  }

  return { parar };
}
