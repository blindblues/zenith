// Dati di prova per la modalità demo locale.
// Restituisce un oggetto { "path/del/documento": dati }.

const USER = 'demo-user';

const projects = [
    {
        id: 'p-sito',
        name: 'Lancio nuovo sito web',
        tasks: [
            {
                title: 'Definire la sitemap', status: 'completed',
                description: 'Pagine principali, gerarchia e URL.',
                checklist: [
                    { text: 'Home e chi siamo', completed: true },
                    { text: 'Pagine servizi', completed: true },
                    { text: 'Blog e contatti', completed: true }
                ]
            },
            { title: 'Wireframe homepage', status: 'completed', description: 'Versione desktop e mobile.' },
            {
                title: 'Sviluppo componenti UI', status: 'in-progress',
                description: 'Header, footer, card e form riutilizzabili.',
                checklist: [
                    { text: 'Header responsive', completed: true },
                    { text: 'Footer', completed: true },
                    { text: 'Card articolo', completed: false },
                    { text: 'Form contatti', completed: false }
                ]
            },
            { title: 'Correggere tag <title> & meta "og:image"', status: 'in-progress', description: 'Titolo con caratteri speciali: deve apparire come testo, non come HTML <b>grassetto</b>.' },
            { title: 'Scrivere i testi delle pagine', status: 'todo', description: 'Coordinarsi con il copywriter.' },
            {
                title: 'Test cross-browser', status: 'todo', description: '',
                checklist: [
                    { text: 'Chrome', completed: false },
                    { text: 'Safari iOS', completed: false },
                    { text: 'Firefox', completed: false }
                ]
            },
            { title: 'Configurare dominio e HTTPS', status: 'todo' },
            { title: 'Pubblicazione', status: 'todo', description: 'Deploy in produzione e verifica finale.' }
        ]
    },
    {
        id: 'p-app',
        name: 'App mobile',
        tasks: [
            { title: 'Ricerca utenti', status: 'completed', description: '5 interviste completate.' },
            { title: 'Prototipo navigazione', status: 'in-progress' },
            {
                title: 'Login e registrazione', status: 'todo',
                checklist: [
                    { text: 'Login con Google', completed: false },
                    { text: 'Recupero password', completed: false }
                ]
            },
            { title: 'Notifiche push', status: 'todo' }
        ]
    },
    {
        id: 'p-marketing',
        name: 'Campagna marketing Q1',
        tasks: [
            { title: 'Budget campagna', status: 'in-progress', description: 'Approvazione entro fine mese.' },
            { title: 'Calendario editoriale social', status: 'todo' },
            { title: 'Newsletter di gennaio', status: 'todo' }
        ]
    },
    {
        id: 'p-casa',
        name: 'Ristrutturazione casa',
        tasks: [
            { title: 'Preventivi imbianchino', status: 'todo', checklist: [{ text: 'Chiamare 3 ditte', completed: false }] }
        ]
    },
    {
        id: 'p-vuoto',
        name: 'Progetto vuoto',
        tasks: []
    },
    {
        id: 'p-archiviato',
        name: 'Trasloco ufficio (archiviato)',
        completed: true,
        tasks: [
            { title: 'Imballare documenti', status: 'completed', checklist: [{ text: 'Archivio 2024', completed: true }] },
            { title: 'Disdire contratto vecchia sede', status: 'completed' }
        ]
    }
];

export function buildSeed() {
    const now = new Date().toISOString();
    const out = {};
    projects.forEach((p, pIndex) => {
        const projectData = { name: p.name, order: pIndex, userId: USER, createdAt: now };
        if (p.completed) projectData.completed = true;
        out[`projects/${p.id}`] = projectData;

        const perStatus = {};
        p.tasks.forEach((t, tIndex) => {
            perStatus[t.status] = (perStatus[t.status] ?? -1) + 1;
            out[`projects/${p.id}/tasks/t-${p.id}-${tIndex}`] = {
                title: t.title,
                description: t.description ?? '',
                status: t.status,
                order: perStatus[t.status],
                createdAt: now,
                checklist: t.checklist ?? []
            };
        });
    });
    return out;
}
