// Mock di firebase-app.js per la modalità demo locale (vedi dev/server.mjs)
export function initializeApp(options) {
    return { name: '[DEFAULT]', options };
}
