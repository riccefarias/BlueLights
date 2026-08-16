/* ============================================================
   ARQUIVO — salvar e abrir, com o melhor que o browser oferecer.

   Dois caminhos, escolhidos pelo que existe:

   File System Access — Chrome/Edge no desktop. Guarda um handle pro
   arquivo de verdade e passa a gravar por cima dele. É o que dá
   autosave silencioso e arquivo versionável no git.

   Download / upload — todo o resto, inclusive Chrome no Android e
   Safari no iPhone, onde a API simplesmente não existe (não é
   permissão que dá pra pedir: `showSaveFilePicker` é undefined).

   O handle sobrevive ao reload guardado no IndexedDB, mas a permissão
   não: o browser exige um gesto do usuário pra reconceder. Daí o
   "continuar salvando em X?" uma vez por sessão.
   ============================================================ */

export const temFSA = typeof window !== "undefined" &&
  typeof window.showSaveFilePicker === "function";

const TIPOS = [{
  description: "Documento do BlueLights",
  accept: { "application/json": [".json"] },
}];

/* ---------- guarda do handle entre sessões ---------- */

const DB = "bluelights", LOJA = "arquivo", CHAVE = "atual";

function abrirDb() {
  return new Promise((ok, err) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(LOJA);
    req.onsuccess = () => ok(req.result);
    req.onerror = () => err(req.error);
  });
}

async function noDb(modo, fn) {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await abrirDb();
    return await new Promise((ok, err) => {
      const tx = db.transaction(LOJA, modo);
      const req = fn(tx.objectStore(LOJA));
      tx.oncomplete = () => ok(req?.result ?? null);
      tx.onerror = () => err(tx.error);
    });
  } catch { return null; }   // sem IndexedDB o app funciona, só esquece o arquivo
}

export const lembrarHandle = h => noDb("readwrite", s => s.put(h, CHAVE));
export const handleLembrado = () => noDb("readonly", s => s.get(CHAVE));
export const esquecerHandle = () => noDb("readwrite", s => s.delete(CHAVE));

/* ---------- rascunho: a rede embaixo do arquivo ----------

   No celular não existe File System Access, então "salvar" é baixar —
   e ninguém baixa a cada ajuste. O rascunho grava o documento no
   IndexedDB a cada pausa da edição: a aba pode morrer que o trabalho
   volta sozinho na próxima visita.

   Não substitui o arquivo. O `.blz.json` continua sendo a fonte que
   viaja, versiona e vai por WhatsApp; o rascunho é local deste browser
   e o sistema pode despejá-lo sob pressão de disco. É cinto de
   segurança, não porta-malas.

   A mídia vai junto num blob separado: o áudio não cabe (nem deve)
   no documento, mas sem ele a sessão retomada volta muda. */

const R_DOC = "rascunho", R_MIDIA = "rascunho-midia";

export const guardarRascunho = doc => noDb("readwrite", s => s.put(doc, R_DOC));
export const rascunhoGuardado = () => noDb("readonly", s => s.get(R_DOC));
export const guardarMidia = blob => noDb("readwrite", s => s.put(blob, R_MIDIA));
export const midiaGuardada = () => noDb("readonly", s => s.get(R_MIDIA));

/* ---------- permissão ---------- */

/** @param {boolean} pedir true só dentro de um gesto do usuário. */
export async function podeEscrever(handle, pedir = false) {
  if (!handle?.queryPermission) return false;
  const opt = { mode: "readwrite" };
  if (await handle.queryPermission(opt) === "granted") return true;
  if (!pedir) return false;
  return await handle.requestPermission(opt) === "granted";
}

/* ---------- salvar ---------- */

export async function escolherDestino(nomeSugerido) {
  const handle = await window.showSaveFilePicker({ suggestedName: nomeSugerido, types: TIPOS });
  await lembrarHandle(handle);
  return handle;
}

export async function gravar(handle, texto) {
  const w = await handle.createWritable();
  await w.write(texto);
  await w.close();
}

/** Fallback universal: joga o arquivo na pasta de downloads. */
export function baixar(texto, nome) {
  const url = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------- abrir ---------- */

export async function abrirComPicker() {
  const [handle] = await window.showOpenFilePicker({ types: TIPOS, multiple: false });
  await lembrarHandle(handle);
  const f = await handle.getFile();
  return { texto: await f.text(), nome: f.name, handle };
}

/** Fallback universal: input de arquivo escondido. */
export function abrirComInput() {
  return new Promise((ok) => {
    const i = document.createElement("input");
    i.type = "file";
    i.accept = ".json,application/json";
    i.onchange = async () => {
      const f = i.files?.[0];
      if (!f) return ok(null);
      ok({ texto: await f.text(), nome: f.name, handle: null });
    };
    // cancelar o diálogo não dispara evento nenhum em vários browsers;
    // quem chama trata `null` e a promessa pendente é coletada com a página.
    i.click();
  });
}
