// @ts-nocheck
/* Ported verbatim from the original Boardroom vanilla JS app; see src/boardroom/AGENTS.md. */
/**
 * Boardroom IndexedDB Wrapper
 * Clean Promise-based client-side persistence for ventures, agents, sessions, and deliverables.
 */

const DB_NAME = "boardroom_db";
const DB_VERSION = 2;

let dbPromise = null;

export function getDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Agents Store
      if (!db.objectStoreNames.contains("agents")) {
        db.createObjectStore("agents", { keyPath: "id" });
      }

      // Ventures Store
      if (!db.objectStoreNames.contains("ventures")) {
        const ventureStore = db.createObjectStore("ventures", { keyPath: "id" });
        ventureStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      // Sessions / Transcripts Store
      let sessionStore;
      if (!db.objectStoreNames.contains("sessions")) {
        sessionStore = db.createObjectStore("sessions", { keyPath: "id" });
        sessionStore.createIndex("ventureId", "ventureId", { unique: false });
        sessionStore.createIndex("venturePhase", ["ventureId", "phase"], { unique: false });
        sessionStore.createIndex("venturePhaseAgent", ["ventureId", "phase", "agentId"], {
          unique: false,
        });
      } else {
        sessionStore = request.transaction.objectStore("sessions");
        if (!sessionStore.indexNames.contains("venturePhaseAgent")) {
          sessionStore.createIndex("venturePhaseAgent", ["ventureId", "phase", "agentId"], {
            unique: false,
          });
        }
      }

      // Deliverables Store
      if (!db.objectStoreNames.contains("deliverables")) {
        const deliverableStore = db.createObjectStore("deliverables", { keyPath: "id" });
        deliverableStore.createIndex("ventureId", "ventureId", { unique: false });
      }

      // Settings Store
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.error("IndexedDB open error:", event.target.error);
      reject(event.target.error);
    };
  });

  return dbPromise;
}

/**
 * Get all records from an object store
 */
export async function getAll(storeName) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get single record by key
 */
export async function get(storeName, key) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Put record into object store
 */
export async function put(storeName, value) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.put(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete record by key
 */
export async function deleteItem(storeName, key) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear an entire store
 */
export async function clear(storeName) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Seed default agents if store is empty on first boot
 */
export async function seedAgentsIfEmpty(defaultAgents) {
  const existing = await getAll("agents");
  if (!existing || existing.length === 0) {
    const db = await getDB();
    const tx = db.transaction("agents", "readwrite");
    const store = tx.objectStore("agents");
    for (const agent of defaultAgents) {
      // Store plain serializable fields
      const { systemPromptTemplate, ...serializableAgent } = agent;
      store.put(serializableAgent);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }
  return false;
}

/**
 * Get setting value with default fallback
 */
export async function getSetting(key, defaultValue = null) {
  try {
    const item = await get("settings", key);
    return item !== undefined && item !== null && item.value !== undefined
      ? item.value
      : defaultValue;
  } catch (err) {
    console.warn(`Failed to read setting '${key}':`, err);
    return defaultValue;
  }
}

/**
 * Save setting key-value pair
 */
export async function setSetting(key, value) {
  return await put("settings", { key, value, updatedAt: Date.now() });
}

/**
 * Get all settings as a plain object { [key]: value }
 */
export async function getAllSettings() {
  const items = await getAll("settings");
  const result = {};
  for (const item of items) {
    if (item && item.key) {
      result[item.key] = item.value;
    }
  }
  return result;
}

/**
 * Reset agents store back to defaults
 */
export async function resetAgentsToDefault(defaultAgents) {
  await clear("agents");
  const db = await getDB();
  const tx = db.transaction("agents", "readwrite");
  const store = tx.objectStore("agents");
  for (const agent of defaultAgents) {
    const { systemPromptTemplate, ...serializableAgent } = agent;
    store.put(serializableAgent);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Danger zone: Reset all data in the database
 */
export async function resetAllData(defaultAgents = []) {
  const stores = ["ventures", "sessions", "deliverables", "settings", "agents"];
  for (const s of stores) {
    await clear(s);
  }
  if (defaultAgents && defaultAgents.length > 0) {
    await seedAgentsIfEmpty(defaultAgents);
  }
  return true;
}

/**
 * DB Self-Test: Verifies read/write/delete cycle across stores
 */
export async function dbSelfTest() {
  const startTime = performance.now();
  const testKey = `__selftest_${Date.now()}`;
  const testValue = { key: testKey, value: "test_payload_ok", timestamp: Date.now() };

  try {
    // 1. Write test
    await put("settings", testValue);

    // 2. Read test
    const retrieved = await get("settings", testKey);
    if (!retrieved || retrieved.value !== "test_payload_ok") {
      throw new Error("Self-test read mismatch or record not found.");
    }

    // 3. Delete test
    await deleteItem("settings", testKey);
    const afterDelete = await get("settings", testKey);
    if (afterDelete) {
      throw new Error("Self-test delete failed: record still present.");
    }

    const durationMs = Math.round(performance.now() - startTime);
    return {
      ok: true,
      durationMs,
      details: `Read/write/delete cycle passed in ${durationMs}ms across IndexedDB 'boardroom_db'.`,
    };
  } catch (err) {
    return {
      ok: false,
      durationMs: Math.round(performance.now() - startTime),
      error: err.message,
    };
  }
}

/**
 * Venture Storage Helpers
 */
export async function getVenture(id) {
  return await get("ventures", id);
}

export async function saveVenture(venture) {
  if (!venture.id) {
    venture.id = `v_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }
  venture.updatedAt = Date.now();
  if (!venture.createdAt) {
    venture.createdAt = venture.updatedAt;
  }
  if (!venture.completedPhases) {
    venture.completedPhases = [];
  }
  await put("ventures", venture);
  return venture;
}

export async function deleteVenture(id) {
  await deleteItem("ventures", id);

  // Clean up associated sessions
  const sessions = await getAll("sessions");
  for (const s of sessions) {
    if (s.ventureId === id) {
      await deleteItem("sessions", s.id);
    }
  }

  // Clean up associated deliverables
  const deliverables = await getAll("deliverables");
  for (const d of deliverables) {
    if (d.ventureId === id) {
      await deleteItem("deliverables", d.id);
    }
  }

  return true;
}

export async function duplicateVenture(id) {
  const original = await get("ventures", id);
  if (!original) throw new Error("Venture not found");

  const copy = {
    ...original,
    id: `v_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    name: `${original.name} (Copy)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await put("ventures", copy);

  // Copy sessions with unique thread-scoped IDs
  const sessions = await getAll("sessions");
  for (const s of sessions) {
    if (s.ventureId === id) {
      const agentSuffix =
        s.agentId && s.agentId !== "all" ? `_${s.agentId}` : s.id.endsWith("_all") ? "_all" : "";
      const copySession = {
        ...s,
        id: `s_${copy.id}_${s.phase}${agentSuffix}`,
        ventureId: copy.id,
        updatedAt: Date.now(),
      };
      await put("sessions", copySession);
    }
  }

  // Copy deliverables
  const deliverables = await getAll("deliverables");
  for (const d of deliverables) {
    if (d.ventureId === id) {
      const copyDeliverable = {
        ...d,
        id: `deliv_${copy.id}_${d.phase}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        ventureId: copy.id,
        title: (d.title || "Deliverable").replace(original.name, copy.name),
        createdAt: Date.now(),
      };
      await put("deliverables", copyDeliverable);
    }
  }

  return copy;
}

export async function getVentureStats(ventureId) {
  let messageCount = 0;
  let deliverableCount = 0;

  try {
    const sessions = await getAll("sessions");
    for (const s of sessions) {
      if (s.ventureId === ventureId) {
        const msgs = s.messages || s.transcript || [];
        messageCount += msgs.length;
      }
    }

    const deliverables = await getAll("deliverables");
    for (const d of deliverables) {
      if (d.ventureId === ventureId) {
        deliverableCount++;
      }
    }
  } catch (err) {
    console.warn("Failed to calculate venture stats:", err);
  }

  return { messageCount, deliverableCount };
}

/**
 * Retrieve or initialize a session for a specific thread scoped by (ventureId, phase, agentId)
 */
export async function getThreadSession(ventureId, phase, agentId = "all") {
  const sessionId = `s_${ventureId}_${phase}_${agentId}`;
  let session = await get("sessions", sessionId);
  if (!session && agentId === "all") {
    // Check legacy un-suffixed key for backwards compatibility
    session = await get("sessions", `s_${ventureId}_${phase}`);
    if (session && !session.agentId) {
      session.agentId = "all";
    }
  }
  if (!session) {
    session = {
      id: sessionId,
      ventureId,
      phase,
      agentId,
      messages: [],
      updatedAt: Date.now(),
    };
  }
  return session;
}
