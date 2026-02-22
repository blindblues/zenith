# ZENITH | Task Management

Benvenuto in **ZENITH**, la tua applicazione professionale per la gestione dei progetti, ora potenziata con **Firebase** per la persistenza dei dati nel cloud.

## Caratteristiche
- **Sincronizzazione in tempo reale**: I dati si aggiornano istantaneamente su tutti i dispositivi grazie a Firebase Firestore.
- **Board Kanban**: Gestione fluida delle task in "Da fare", "In corso" e "Completate".
- **Design Moderno**: Colore azzurro cielo, animazioni GSAP e icone Lucide.
- **Mobile Responsive**: Progettato per funzionare su desktop e tablet.

---

## 🚀 Configurazione Firebase (Passo dopo passo)

Per far funzionare il salvataggio dei dati nel cloud, segui questi passaggi:

1.  **Crea un progetto Firebase**:
    - Vai sulla [Console di Firebase](https://console.firebase.google.com/).
    - Clicca su "Aggiungi progetto" e segui le istruzioni (puoi chiamarlo `Zenith-App`).

2.  **Aggiungi un'app Web**:
    - Nella dashboard del progetto, clicca sull'icona delle parentesi graffe `</>` per registrare una nuova Web App.
    - Scegli un nickname (es. `ZenithWeb`) e clicca su "Registra app".
    - Firebase ti mostrerà un oggetto `firebaseConfig`. **Copia solo il contenuto dell'oggetto**.

3.  **Configura le credenziali**:
    - Nel tuo progetto locale, apri il file `firebase-config.js`.
    - Incolla i valori copiati al posto di `YOUR_API_KEY`, `YOUR_PROJECT_ID`, ecc.

4.  **Attiva il Database**:
    - Nella barra laterale di Firebase, vai su **Build > Firestore Database**.
    - Clicca su "Crea database".
    - Scegli la posizione più vicina a te (es. `europe-west`).
    - Seleziona **"Inizia in modalità test"** (per scopi di sviluppo) e clicca su "Crea".

5.  **Avvia l'app**:
    - Torna nel tuo terminale ed esegui `npx serve .`.
    - Ora i tuoi progetti e task saranno salvati per sempre su Firebase!

---

## Sviluppo Locale
Se vuoi testare l'app senza server:
```bash
npx serve .
```

## Tecnologie
- **Firebase Firestore**: Cloud Database Real-time.
- **GSAP**: Animazioni high-end.
- **Lucide**: Iconography system.
- **Vanilla JS**: Moduli ES6 senza dipendenze pesanti.
