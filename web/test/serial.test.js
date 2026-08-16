import test from "node:test";
import assert from "node:assert/strict";

import { quadroEnttec } from "../src/ui/serial.js";

test("quadro Enttec: moldura certa em volta dos canais", () => {
  const q = quadroEnttec(Uint8Array.from([10, 20, 30]));
  // 0x7E, label 6, len (3 canais + start code = 4), start code, dados, 0xE7
  assert.deepEqual([...q], [0x7E, 6, 4, 0, 0, 10, 20, 30, 0xE7]);
});

test("quadro cheio: 512 canais viram len 513 em dois bytes", () => {
  const q = quadroEnttec(new Uint8Array(512).fill(255));
  assert.equal(q.length, 512 + 6);
  assert.equal(q[2], 513 & 255);
  assert.equal(q[3], 513 >> 8);
  assert.equal(q[4], 0);                  // start code sempre zero
  assert.equal(q[q.length - 1], 0xE7);
});
