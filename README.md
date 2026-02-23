# ZENITH | Task Management

Benvenuto in **ZENITH**, la tua applicazione professionale per la gestione dei progetti, ora potenziata con **Firebase** per la persistenza dei dati nel cloud e una struttura organizzata in `src`.

## Caratteristiche Recenti
- **Sincronizzazione in tempo reale**: I dati si aggiornano istantaneamente su tutti i dispositivi grazie a Firebase Firestore.
- **Board Kanban**: Gestione fluida delle task in "Da fare", "In corso" e "Completate" con animazioni **GSAP Flip**.
- **Gestione Progetti Avanzata**: Modifica il nome del progetto o eliminalo direttamente dalla testata attiva tramite un modale dedicato.
- **Mobile Optimized**:
    - Nuova barra superiore compatta con accesso rapido alle funzioni di archiviazione.
    - Pulsanti flottanti (FAB) per l'aggiunta rapida di task.
    - Chiusura intelligente dei modali toccando/cliccando fuori dalla finestra.
- **Ambiente Local-First**: Possibilità di testare l'app completamente offline tramite `local.html`.

---

## 📂 Struttura del Progetto
Il progetto segue ora una struttura pulita e modulare:
- `src/css/`: Stili CSS moderni e responsive.
- `src/js/`: Logica dell'applicazione (Firebase e versione Local).
- `src/assets/`: Icone, loghi e risorse statiche.
- `index.html`: Punto di ingresso principale (collegato a Firebase).
- `local.html`: Versione per lo sviluppo locale senza necessità di configurazione cloud.

---

## 🚀 Configurazione Firebase (Passo dopo passo)

Per far funzionare il salvataggio dei dati nel cloud, segui questi passaggi:

1.  **Crea un progetto Firebase**:
    - Vai sulla [Console di Firebase](https://console.firebase.google.com/).
    - Clicca su "Aggiungi progetto" e segui le istruzioni.

2.  **Aggiungi un'app Web**:
    - Nella dashboard del progetto, clicca sull'icona `</>` per registrare una nuova Web App.
    - Copia il contenuto dell'oggetto `firebaseConfig`.

3.  **Configura le credenziali**:
    - Apri il file `src/js/firebase-config.js`.
    - Incolla i valori dell'oggetto configurazione.

4.  **Attiva il Database e Auth**:
    - Abilita **Firestore Database** in modalità test.
    - Abilita **Authentication** (es. Google Login o Email) per gestire gli utenti.

5.  **Avvia l'app**:
    - Esegui `npx live-server` o un server locale di tua preferenza.

---

## 🛠️ Sviluppo Locale (Mock DB)
Se vuoi testare l'app istantaneamente senza configurare Firebase, apri semplicemente il file:
`local.html`

Questa versione utilizza `localStorage` per simulare un database persistente nel browser.

## Tecnologie
- **Firebase Firestore**: Cloud Database Real-time.
- **Firebase Auth**: Gestione accessi e sincronizzazione per utente.
- **GSAP**: Animazioni fluide e sistema Flip per il drag & drop.
- **Lucide Icons**: Sistema di icone vettoriali.
- **Vanilla JS**: Moduli ES6 moderni.
