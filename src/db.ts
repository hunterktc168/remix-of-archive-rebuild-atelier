import type { Deliverable, PhaseId } from "./types/deliverables";

export const DB_NAME = "boardroom_db";
export const DB_VERSION = 3;

export interface Venture {
  id: string;
  name: string;
  oneliner?: string;
  thesis?: string;
  industry?: string;
  stage?: string;
  biggestUnknown?: string;
  notes?: string;
  boardMemory?: string;
  completedPhases?: string[];
  createdAt?: number;
  updatedAt?: number;
}

export interface SessionMessage {
  id: string;
  author?: string;
  agentId?: string;
  role?: string;
  text?: string;
  content?: string;
  timestamp?: number;
  isRoundSummary?: boolean;
  roundId?: string;
  isError?: boolean;
}

export interface SessionThread {
  id: string;
  ventureId: string;
  phase: string;
  agentId: string;
  messages: SessionMessage[];
  updatedAt?: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function applyDBUpgrade(
  db: IDBDatabase,
  oldVersion: number,
  transaction: IDBTransaction,
): void {
  if (!db.objectStoreNames.contains("agents")) {
    db.createObjectStore("agents", { keyPath: "id" });
  }

  if (!db.objectStoreNames.contains("ventures")) {
    const ventureStore = db.createObjectStore("ventures", { keyPath: "id" });
    ventureStore.createIndex("updatedAt", "updatedAt", { unique: false });
  }

  let sessionStore: IDBObjectStore;
  if (!db.objectStoreNames.contains("sessions")) {
    sessionStore = db.createObjectStore("sessions", { keyPath: "id" });
    sessionStore.createIndex("ventureId", "ventureId", { unique: false });
    sessionStore.createIndex("venturePhase", ["ventureId", "phase"], { unique: false });
    sessionStore.createIndex("venturePhaseAgent", ["ventureId", "phase", "agentId"], {
      unique: false,
    });
  } else {
    sessionStore = transaction.objectStore("sessions");
    if (!sessionStore.indexNames.contains("venturePhaseAgent")) {
      sessionStore.createIndex("venturePhaseAgent", ["ventureId", "phase", "agentId"], {
        unique: false,
      });
    }
  }

  let deliverableStore: IDBObjectStore;
  if (!db.objectStoreNames.contains("deliverables")) {
    deliverableStore = db.createObjectStore("deliverables", { keyPath: "id" });
    deliverableStore.createIndex("ventureId", "ventureId", { unique: false });
    deliverableStore.createIndex("venturePhase", ["ventureId", "phase"], { unique: false });
  } else {
    deliverableStore = transaction.objectStore("deliverables");
  }

  // TICKET-03: Version 2 migration cursor: backfill pre-v2 legacy deliverables
  if (oldVersion < 2 && db.objectStoreNames.contains("deliverables")) {
    const cursorReq = deliverableStore.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        const record = cursor.value as Record<string, unknown>;
        if (!record["framework"]) {
          const updated = {
            ...record,
            framework: "legacy-plan",
            frameworkData: null,
            version: typeof record["version"] === "number" ? record["version"] : 1,
          };
          cursor.update(updated);
        }
        cursor.continue();
      }
    };
  }

  // TICKET-03 / TICKET-02: Version 3 compound index [ventureId+phase]
  if (oldVersion < 3) {
    if (!deliverableStore.indexNames.contains("venturePhase")) {
      deliverableStore.createIndex("venturePhase", ["ventureId", "phase"], { unique: false });
    }
  }

  if (!db.objectStoreNames.contains("settings")) {
    db.createObjectStore("settings", { keyPath: "key" });
  }
}

export function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable in this environment"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const tx = (event.target as IDBOpenDBRequest).transaction!;
      applyDBUpgrade(db, event.oldVersion, tx);
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      const err = (event.target as IDBOpenDBRequest).error;
      console.error("IndexedDB open error:", err);
      reject(err ?? new Error("Unknown IndexedDB open error"));
    };
  });

  return dbPromise;
}

export async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await getDB();
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result as T[]) || []);
    request.onerror = () => reject(request.error);
  });
}

export async function get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await getDB();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function put<T>(storeName: string, value: T): Promise<IDBValidKey> {
  const db = await getDB();
  return new Promise<IDBValidKey>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.put(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteItem(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clear(storeName: string): Promise<void> {
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getVenture(id: string): Promise<Venture | null> {
  const item = await get<Venture>("ventures", id);
  return item ?? null;
}

export async function saveVenture(venture: Venture): Promise<void> {
  const toSave = { ...venture, updatedAt: Date.now() };
  await put("ventures", toSave);
}

export async function getDeliverable(id: string): Promise<Deliverable | null> {
  const item = await get<Deliverable>("deliverables", id);
  return item ?? null;
}

export async function saveDeliverable(deliverable: Deliverable): Promise<void> {
  const toSave = { ...deliverable, updatedAt: new Date().toISOString() };
  await put("deliverables", toSave);
}

export async function putDeliverable(deliverable: Deliverable): Promise<void> {
  return saveDeliverable(deliverable);
}

export async function listDeliverablesByPhase(
  ventureId: string,
  phase: PhaseId,
): Promise<Deliverable[]> {
  const db = await getDB();
  return new Promise<Deliverable[]>((resolve, reject) => {
    const tx = db.transaction("deliverables", "readonly");
    const store = tx.objectStore("deliverables");
    const index = store.index("venturePhase");
    const request = index.getAll(IDBKeyRange.only([ventureId, phase]));
    request.onsuccess = () => resolve((request.result as Deliverable[]) || []);
    request.onerror = () => reject(request.error);
  });
}

export async function getDeliverablesForVenture(ventureId: string): Promise<Deliverable[]> {
  const all = await getAll<Deliverable>("deliverables");
  return all.filter((d) => d.ventureId === ventureId);
}

export async function getSetting(key: string): Promise<string | null> {
  const record = await get<{ key: string; value: string }>("settings", key);
  return record ? record.value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await put("settings", { key, value });
}

export async function getThreadSession(
  ventureId: string,
  phase: string,
  agentId: string = "all",
): Promise<SessionThread> {
  const id = `s_${ventureId}_${phase}_${agentId}`;
  const existing = await get<SessionThread>("sessions", id);
  if (existing) return existing;

  const newSession: SessionThread = {
    id,
    ventureId,
    phase,
    agentId,
    messages: [],
    updatedAt: Date.now(),
  };
  await put("sessions", newSession);
  return newSession;
}

export async function seedAgentsIfEmpty(
  defaultAgents: Array<{ id: string; [key: string]: unknown }>,
): Promise<boolean> {
  const existing = await getAll<{ id: string }>("agents");
  if (!existing || existing.length === 0) {
    const db = await getDB();
    const tx = db.transaction("agents", "readwrite");
    const store = tx.objectStore("agents");
    for (const agent of defaultAgents) {
      const { systemPromptTemplate, ...serializableAgent } = agent;
      store.put(serializableAgent);
    }
    return new Promise<boolean>((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }
  return false;
}
