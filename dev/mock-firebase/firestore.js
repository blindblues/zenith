// Mock in-memory di firebase-firestore.js per la modalità demo locale.
// Implementa solo le API usate da src/js/main.js. I dati sono salvati in localStorage
// (chiave zenith_mock_db) e inizializzati con i dati di prova di seed.js.
// Aggiungi ?reset all'URL per ripristinare i dati di prova.

import { buildSeed } from './seed.js';

const DB_KEY = 'zenith_mock_db';
const LATENCY_MS = 60; // simula la conferma del server

// ---- Storage -------------------------------------------------------------

/** @type {Map<string, object>} path completo del documento -> dati */
let store = new Map();

function load() {
    let raw = null;
    try {
        if (new URLSearchParams(location.search).has('reset')) {
            localStorage.removeItem(DB_KEY);
            localStorage.removeItem('zenith_active_project');
            localStorage.removeItem('zenith_mock_signed_out');
            history.replaceState(null, '', location.pathname);
        }
        raw = localStorage.getItem(DB_KEY);
    } catch { }

    if (raw) {
        try {
            store = new Map(Object.entries(JSON.parse(raw)));
            return;
        } catch { }
    }
    store = new Map(Object.entries(buildSeed()));
    persist();
}

function persist() {
    try {
        localStorage.setItem(DB_KEY, JSON.stringify(Object.fromEntries(store)));
    } catch { }
}

load();

// ---- Helpers ---------------------------------------------------------------

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const delay = (ms) => new Promise(r => setTimeout(r, ms));

function randomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 20; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
}

function parentPath(docPath) {
    return docPath.split('/').slice(0, -1).join('/');
}

const SERVER_TIMESTAMP = { __mockServerTimestamp: true };

function resolveValues(data) {
    const out = {};
    for (const [k, v] of Object.entries(data)) {
        out[k] = v === SERVER_TIMESTAMP ? new Date().toISOString() : clone(v);
    }
    return out;
}

function firestoreError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
}

// ---- Riferimenti -------------------------------------------------------------

export function getFirestore(app) {
    return { type: 'firestore', app };
}

export function collection(db, path) {
    return { type: 'collection', path, id: path.split('/').pop() };
}

export function doc(db, path, id) {
    const full = id === undefined ? path : `${path}/${id}`;
    return { type: 'document', path: full, id: full.split('/').pop() };
}

export function where(field, op, value) {
    if (op !== '==') throw new Error(`Mock Firestore: operatore "${op}" non supportato`);
    return { type: 'where', field, value };
}

export function orderBy(field, direction = 'asc') {
    return { type: 'orderBy', field, direction };
}

export function query(colRef, ...constraints) {
    return { type: 'query', path: colRef.path, constraints };
}

export function serverTimestamp() {
    return SERVER_TIMESTAMP;
}

// ---- Snapshot --------------------------------------------------------------

function makeDocSnap(path) {
    const data = store.get(path);
    return {
        id: path.split('/').pop(),
        ref: doc(null, path),
        exists: () => data !== undefined,
        data: () => clone(data)
    };
}

function runQuery(q) {
    const constraints = q.constraints || [];
    let docs = [...store.keys()]
        .filter(p => parentPath(p) === q.path)
        .map(makeDocSnap)
        .filter(s => constraints
            .filter(c => c.type === 'where')
            .every(c => s.data()[c.field] === c.value));

    for (const c of constraints.filter(c => c.type === 'orderBy')) {
        const dir = c.direction === 'desc' ? -1 : 1;
        docs.sort((a, b) => (a.data()[c.field] > b.data()[c.field] ? 1 : -1) * dir);
    }
    return { docs, size: docs.length, empty: docs.length === 0 };
}

// ---- Listener realtime -------------------------------------------------------

const listeners = new Set();
let notifyScheduled = false;

function scheduleNotify() {
    persist();
    if (notifyScheduled) return;
    notifyScheduled = true;
    // Come Firestore: lo snapshot locale arriva subito, prima della conferma del server
    queueMicrotask(() => {
        notifyScheduled = false;
        listeners.forEach(l => l.fire());
    });
}

export function onSnapshot(target, onNext, onError) {
    const listener = {
        fire() {
            try {
                if (target.type === 'document') onNext(makeDocSnap(target.path));
                else onNext(runQuery(target));
            } catch (e) {
                if (onError) onError(e); else console.error(e);
            }
        }
    };
    listeners.add(listener);
    setTimeout(() => listeners.has(listener) && listener.fire(), 0);
    return () => listeners.delete(listener);
}

// ---- Letture -----------------------------------------------------------------

export async function getDoc(ref) {
    await delay(LATENCY_MS);
    return makeDocSnap(ref.path);
}

export async function getDocs(q) {
    await delay(LATENCY_MS);
    return runQuery(q.type === 'collection' ? { path: q.path, constraints: [] } : q);
}

// ---- Scritture ---------------------------------------------------------------

function applySet(ref, data, options = {}) {
    const resolved = resolveValues(data);
    const existing = store.get(ref.path);
    store.set(ref.path, options.merge && existing ? { ...existing, ...resolved } : resolved);
}

function applyUpdate(ref, data) {
    const existing = store.get(ref.path);
    if (!existing) throw firestoreError('not-found', `No document to update: ${ref.path}`);
    store.set(ref.path, { ...existing, ...resolveValues(data) });
}

function applyDelete(ref) {
    store.delete(ref.path);
}

export async function addDoc(colRef, data) {
    const ref = doc(null, colRef.path, randomId());
    applySet(ref, data);
    scheduleNotify();
    await delay(LATENCY_MS);
    return ref;
}

export async function setDoc(ref, data, options) {
    applySet(ref, data, options);
    scheduleNotify();
    await delay(LATENCY_MS);
}

export async function updateDoc(ref, data) {
    applyUpdate(ref, data);
    scheduleNotify();
    await delay(LATENCY_MS);
}

export async function deleteDoc(ref) {
    applyDelete(ref);
    scheduleNotify();
    await delay(LATENCY_MS);
}

export function writeBatch() {
    const ops = [];
    return {
        set(ref, data, options) { ops.push(() => applySet(ref, data, options)); return this; },
        update(ref, data) { ops.push(() => applyUpdate(ref, data)); return this; },
        delete(ref) { ops.push(() => applyDelete(ref)); return this; },
        async commit() {
            // Atomico: se un'operazione fallisce, nessuna modifica viene applicata
            const backup = new Map(store);
            try {
                ops.forEach(op => op());
            } catch (e) {
                store = backup;
                throw e;
            }
            scheduleNotify();
            await delay(LATENCY_MS);
        }
    };
}
