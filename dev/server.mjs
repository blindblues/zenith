// Server locale per testare ZENITH con dati di prova, senza Firebase.
// Uso:  node dev/server.mjs        (porta di default 8080, oppure PORT=xxxx)
//
// Serve i file del progetto e, in index.html, inietta un import map che sostituisce
// gli SDK Firebase (gstatic) con i mock in dev/mock-firebase/. Il codice dell'app non cambia.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8080;
const FIREBASE = 'https://www.gstatic.com/firebasejs/10.8.0';

const IMPORT_MAP = `
    <script type="importmap">
    {
        "imports": {
            "${FIREBASE}/firebase-app.js": "/dev/mock-firebase/app.js",
            "${FIREBASE}/firebase-firestore.js": "/dev/mock-firebase/firestore.js",
            "${FIREBASE}/firebase-auth.js": "/dev/mock-firebase/auth.js"
        }
    }
    </script>`;

const DEMO_BADGE = `
    <a href="/?reset" title="Ripristina i dati di prova"
       style="position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:99999;
              background:#111;color:#fff;font:600 11px/1 sans-serif;padding:7px 12px;border-radius:999px;
              opacity:.75;text-decoration:none;letter-spacing:.04em">
        DEMO LOCALE · dati di prova · ripristina ↺
    </a>`;

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json'
};

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        let pathname = decodeURIComponent(url.pathname);
        if (pathname === '/') pathname = '/index.html';

        const filePath = path.resolve(ROOT, '.' + pathname);
        if (!filePath.startsWith(ROOT + path.sep)) {
            res.writeHead(403).end('Forbidden');
            return;
        }

        let body = await readFile(filePath);
        if (pathname === '/index.html') {
            body = body.toString('utf8')
                .replace('<head>', '<head>' + IMPORT_MAP)
                .replace('</body>', DEMO_BADGE + '\n</body>');
        }

        res.writeHead(200, {
            'Content-Type': TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        res.end(body);
    } catch (e) {
        res.writeHead(e.code === 'ENOENT' ? 404 : 500).end(e.code === 'ENOENT' ? 'Not found' : 'Server error');
    }
});

server.listen(PORT, () => {
    console.log(`ZENITH demo locale: http://localhost:${PORT}`);
    console.log(`Ripristina i dati di prova: http://localhost:${PORT}/?reset`);
});
