import type { DataFrame, Instrument } from "@/lib/types";

export type StoredUpload = {
  id: string;
  label: string;
  hint: string;
  df: DataFrame;
};

const DB = "vena.uploads.v1";
const DB_ANCIEN = "simula.uploads.v1";
const STORE = "files";

// ————— MIGRATION DE LA BASE « simula.uploads.v1 » —————
// Les fichiers déposés vivent dans IndexedDB. Ouvrir une base au nom neuf en crée une
// VIDE : sans recopie, l'utilisateur perdrait ses séries au premier chargement. On
// recopie une seule fois, si la neuve est vide, et on ne supprime jamais l'ancienne.
let migration: Promise<void> | null = null;
function ouvrir(nom: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(nom, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function migrer(): Promise<void> {
  try {
    const neuve = await ouvrir(DB);
    const vide = await new Promise<boolean>((ok) => {
      const c = neuve.transaction(STORE, "readonly").objectStore(STORE).count();
      c.onsuccess = () => ok(c.result === 0);
      c.onerror = () => ok(false);
    });
    if (!vide) {
      neuve.close();
      return;
    }
    const vieille = await ouvrir(DB_ANCIEN);
    const tout = await new Promise<StoredUpload[]>((ok) => {
      const g = vieille.transaction(STORE, "readonly").objectStore(STORE).getAll();
      g.onsuccess = () => ok(g.result as StoredUpload[]);
      g.onerror = () => ok([]);
    });
    if (tout.length) {
      await new Promise<void>((ok) => {
        const st = neuve.transaction(STORE, "readwrite").objectStore(STORE);
        for (const u of tout) st.put(u);
        st.transaction.oncomplete = () => ok();
        st.transaction.onerror = () => ok();
      });
    }
    vieille.close();
    neuve.close();
  } catch {
    /* l'utilisateur redéposera ses fichiers : rien n'est supprimé */
  }
}

function openDb(): Promise<IDBDatabase> {
  if (!migration) migration = migrer();
  return migration.then(
    () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function loadUploads(): Promise<StoredUpload[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as StoredUpload[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function saveUpload(row: StoredUpload): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteUpload(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function asInstrument(row: StoredUpload): Instrument {
  return { id: row.id, label: row.label, kind: "upload", hint: row.hint };
}
