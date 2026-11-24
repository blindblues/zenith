// Mock di firebase-auth.js per la modalità demo locale.
// L'utente demo è loggato di default; "Esci" mostra la schermata di accesso e "Accedi con Google" rientra.

const SIGNED_OUT_KEY = 'zenith_mock_signed_out';

const AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<rect width="64" height="64" rx="32" fill="#009dff"/>' +
    '<text x="32" y="41" font-family="sans-serif" font-size="26" font-weight="700" fill="#fff" text-anchor="middle">D</text>' +
    '</svg>'
);

const DEMO_USER = Object.freeze({
    uid: 'demo-user',
    displayName: 'Utente Demo',
    email: 'demo@zenith.local',
    photoURL: AVATAR
});

function isSignedOut() {
    try { return localStorage.getItem(SIGNED_OUT_KEY) === '1'; } catch { return false; }
}

const listeners = new Set();
const authInstance = { currentUser: isSignedOut() ? null : DEMO_USER };

function emit() {
    listeners.forEach(cb => cb(authInstance.currentUser));
}

const delay = (ms) => new Promise(r => setTimeout(r, ms));

export const browserLocalPersistence = { type: 'LOCAL' };

export class GoogleAuthProvider {
    constructor() { this.providerId = 'google.com'; }
}

export function getAuth() {
    return authInstance;
}

export async function setPersistence() { }

export function onAuthStateChanged(auth, cb) {
    listeners.add(cb);
    setTimeout(() => cb(auth.currentUser), 0);
    return () => listeners.delete(cb);
}

async function signIn() {
    await delay(300);
    try { localStorage.removeItem(SIGNED_OUT_KEY); } catch { }
    authInstance.currentUser = DEMO_USER;
    emit();
    return { user: DEMO_USER };
}

export const signInWithPopup = signIn;
export const signInWithRedirect = signIn;

export async function getRedirectResult() {
    return null;
}

export async function signOut() {
    try { localStorage.setItem(SIGNED_OUT_KEY, '1'); } catch { }
    authInstance.currentUser = null;
    emit();
}
