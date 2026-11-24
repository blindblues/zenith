import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    query,
    orderBy,
    where,
    getDocs,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    writeBatch,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
    getAuth,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    GoogleAuthProvider,
    signOut,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

// Register GSAP Plugins
if (window.gsap && window.Flip) {
    gsap.registerPlugin(Flip);
}

// Initialize Firebase
let db;
let auth;
let provider;
try {
    if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        provider = new GoogleAuthProvider();

        // Forza la persistenza locale (cruciale per iOS/Safari)
        setPersistence(auth, browserLocalPersistence)
            .then(() => {
                console.log("Firebase Auth persistence set to local.");
            })
            .catch((error) => {
                console.error("Error setting auth persistence:", error);
            });

        console.log("Firebase initialized successfully. Auth Domain:", firebaseConfig.authDomain);
    } else {
        console.error("Configurazione Firebase mancante o errata in firebase-config.js");
        // Mostra un avviso nell'app
        setTimeout(() => {
            alert("⚠️ ZENITH: Non hai ancora configurato Firebase! \n\nI dati non verranno salvati nel cloud. Segui le istruzioni nel README.md per inserire le tue credenziali in firebase-config.js.");
        }, 1000);
    }
} catch (error) {
    console.error("Error initializing Firebase:", error);
}

// State Management
let state = {
    currentUser: null,
    projects: [],
    activeProjectId: localStorage.getItem('zenith_active_project') || null,
    startupMode: localStorage.getItem('zenith_startup_mode') || 'last',
    currentChecklist: [], // Stato temporaneo per il modale task
    tasks: [],            // Task del progetto attivo (separate dagli oggetti progetto, che vengono ricreati a ogni snapshot)
    tasksProjectId: null  // Progetto a cui si riferiscono state.tasks
};

let isInitialProjectsLoad = true;

// Tipo MIME custom per il drag & drop desktop delle task (evita di trattare testo/link trascinati da fuori come ID task)
const TASK_DRAG_TYPE = 'application/x-zenith-task';

// Escape dei contenuti utente inseriti tramite innerHTML
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getActiveTasks() {
    return state.tasksProjectId === state.activeProjectId ? state.tasks : [];
}

// Auth Selectors
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn'); // Ora nel modal settings
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');

// Settings Selectors
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');
const settingsUserName = document.getElementById('settings-user-name');
const settingsUserEmail = document.getElementById('settings-user-email');
const settingsUserAvatar = document.getElementById('settings-user-avatar');
const colorOptions = document.querySelectorAll('.color-option');
const themeBtns = document.querySelectorAll('.theme-btn');
const startupBtns = document.querySelectorAll('.startup-btn');
const startupDescription = document.getElementById('startup-description');

// Selectors
const projectsList = document.getElementById('projects-list');
const projectsCompletedList = document.getElementById('projects-completed-list');
const completedSection = document.getElementById('completed-section');
const activeProjectName = document.getElementById('active-project-name');
const completeActiveProjectBtn = document.getElementById('complete-active-project-btn');
const mobileCompleteProjectBtn = document.getElementById('mobile-complete-project-btn');
const addTaskBtn = document.getElementById('add-task-btn');
const mobileAddTaskBtn = document.getElementById('mobile-add-task-btn');
const todoList = document.getElementById('todo-list');
const inProgressList = document.getElementById('in-progress-list');
const completedList = document.getElementById('completed-list');
const screenFlashOverlay = document.getElementById('screen-flash-overlay');

// Counts
const todoCount = document.getElementById('todo-count');
const inProgressCount = document.getElementById('in-progress-count');
const completedCount = document.getElementById('completed-count');

// Modals
const projectModal = document.getElementById('project-modal');
const taskModal = document.getElementById('task-modal');
const addProjectBtn = document.getElementById('add-project-btn');
const cancelProjectBtn = document.getElementById('cancel-project');
const saveProjectBtn = document.getElementById('save-project');
const projectNameInput = document.getElementById('project-name-input');

const cancelTaskBtn = document.getElementById('cancel-task');
const saveTaskBtn = document.getElementById('save-task');
const taskTitleInput = document.getElementById('task-title-input');
const taskDescInput = document.getElementById('task-desc-input');
const taskEditId = document.getElementById('task-edit-id');
const taskModalTitle = document.getElementById('task-modal-title');
const projectEditId = document.getElementById('project-edit-id');
const projectModalTitle = document.getElementById('project-modal-title');

// Checklist Selectors
const checklistItemsContainer = document.getElementById('checklist-items');
const newChecklistItemInput = document.getElementById('new-checklist-item-input');
const addChecklistItemBtn = document.getElementById('add-checklist-item-btn');
const checklistContainer = document.getElementById('checklist-container');
const checklistToggle = document.getElementById('checklist-toggle');

// Initialize Lucide Icons
function initIcons() {
    if (window.lucide) {
        lucide.createIcons();
    }
}

// Theme & Color Logic
async function applyTheme(theme, saveToCloud = true) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('zenith_theme', theme);
    themeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });

    if (saveToCloud && state.currentUser) {
        try {
            await setDoc(doc(db, "userSettings", state.currentUser.uid), {
                theme: theme
            }, { merge: true });
        } catch (e) {
            console.error("Error saving theme to cloud:", e);
        }
    }
}

async function applyColor(color, saveToCloud = true) {
    const root = document.documentElement;
    root.style.setProperty('--primary', color);
    root.style.setProperty('--primary-dark', adjustColor(color, -20));
    root.style.setProperty('--primary-light', hexToRgba(color, 0.12));
    root.style.setProperty('--primary-medium', hexToRgba(color, 0.2));
    root.style.setProperty('--accent', adjustColor(color, 15));

    // Aggiorna colori priorità progetti
    root.style.setProperty('--p1-start', adjustColor(color, 15));
    root.style.setProperty('--p1-end', color);
    root.style.setProperty('--p2-start', color);
    root.style.setProperty('--p2-end', adjustColor(color, -15));
    root.style.setProperty('--p3-start', adjustColor(color, -25));
    root.style.setProperty('--p3-end', adjustColor(color, -40));

    localStorage.setItem('zenith_primary_color', color);

    colorOptions.forEach(opt => {
        opt.classList.toggle('active', opt.dataset.color === color);
    });

    if (saveToCloud && state.currentUser) {
        try {
            await setDoc(doc(db, "userSettings", state.currentUser.uid), {
                primaryColor: color
            }, { merge: true });
        } catch (e) {
            console.error("Error saving color to cloud:", e);
        }
    }
}

async function applyStartupMode(mode, saveToCloud = true) {
    state.startupMode = mode;
    localStorage.setItem('zenith_startup_mode', mode);
    startupBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.startup === mode);
    });

    if (startupDescription) {
        if (mode === 'last') {
            startupDescription.innerText = "L'app si aprirà sull'ultimo progetto che hai visitato.";
        } else {
            startupDescription.innerText = "L'app aprirà sempre il primo progetto della tua lista.";
        }
    }

    if (saveToCloud && state.currentUser) {
        try {
            await setDoc(doc(db, "userSettings", state.currentUser.uid), {
                startupMode: mode
            }, { merge: true });
        } catch (e) {
            console.error("Error saving startup mode to cloud:", e);
        }
    }
}

// Helper per generare variazioni di colore
function adjustColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16),
        amt = Math.round(2.55 * percent),
        R = (num >> 16) + amt,
        G = (num >> 8 & 0x00FF) + amt,
        B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16),
        g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Carica preferenze salvate
const savedTheme = localStorage.getItem('zenith_theme') || 'light';
const savedColor = localStorage.getItem('zenith_primary_color') || '#009dff';
const savedStartupMode = localStorage.getItem('zenith_startup_mode') || 'last';
applyTheme(savedTheme);
applyColor(savedColor);
applyStartupMode(savedStartupMode);

// Data Syncing with Firestore
let projectsUnsubscribe = null;

function setupSync() {
    if (!db || !state.currentUser) {
        console.warn("Firebase config missing or user not authenticated.");
        return;
    }

    if (projectsUnsubscribe) projectsUnsubscribe();

    const qProjects = query(collection(db, "projects"), where("userId", "==", state.currentUser.uid));
    projectsUnsubscribe = onSnapshot(qProjects, async (snapshot) => {
        state.projects = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
        }));

        // Migrazione automatica: assegna 'order' ai progetti che non ce l'hanno (in un'unica scrittura batch)
        const missingOrder = state.projects
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => p.order === undefined || p.order === null);
        if (missingOrder.length > 0) {
            const batch = writeBatch(db);
            missingOrder.forEach(({ p, i }) => {
                batch.update(doc(db, "projects", p.id), { order: i });
                p.order = i;
            });
            batch.commit().catch(e => console.error("Error migrating project order:", e));
        }

        // Ordinamento client-side per campo 'order'
        state.projects.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

        const activeProjectExists = state.projects.some(p => p.id === state.activeProjectId);

        if (state.projects.length === 0) {
            // Nessun progetto: resetta la UI
            isInitialProjectsLoad = false;
            renderProjects();
            clearActiveProject();
            return;
        }

        if (isInitialProjectsLoad || !activeProjectExists) {
            const wasInitial = isInitialProjectsLoad;
            isInitialProjectsLoad = false;

            if ((wasInitial && state.startupMode === 'first') || !activeProjectExists) {
                // Modalità 'Primo', selezione non valida o progetto attivo eliminato: apri il primo progetto attivo
                const firstProject = state.projects.find(p => !p.completed) || state.projects[0];
                selectProject(firstProject.id, { animate: wasInitial });
                return;
            }
        }

        renderProjects();
        refreshActiveProjectUI();
    }, (error) => {
        console.error("Error syncing projects:", error);
    });
}

// Aggiorna intestazione e pulsanti in base al progetto attivo
function refreshActiveProjectUI() {
    const activeProject = state.projects.find(p => p.id === state.activeProjectId);
    if (!activeProject) return;

    activeProjectName.innerText = activeProject.name;

    const isCompleted = !!activeProject.completed;
    addTaskBtn.disabled = isCompleted;
    if (mobileAddTaskBtn) mobileAddTaskBtn.disabled = isCompleted;
    updateCompleteBtnUI(isCompleted);

    // Sottoscrive le task solo se il progetto è cambiato (evita di ricreare il listener a ogni snapshot dei progetti)
    syncTasks(activeProject.id);
    // Ridisegna le task: lo stato "completato" del progetto cambia l'aspetto delle card
    renderTasks();
}

// Reset della UI quando non c'è un progetto selezionabile
function clearActiveProject() {
    state.activeProjectId = null;
    localStorage.removeItem('zenith_active_project');
    if (tasksUnsubscribe) tasksUnsubscribe();
    tasksUnsubscribe = null;
    state.tasks = [];
    state.tasksProjectId = null;

    activeProjectName.innerText = '';
    addTaskBtn.disabled = true;
    if (mobileAddTaskBtn) mobileAddTaskBtn.disabled = true;
    [completeActiveProjectBtn, mobileCompleteProjectBtn].forEach(btn => { if (btn) btn.style.display = 'none'; });
    const editBtn = document.getElementById('edit-active-project-btn');
    if (editBtn) editBtn.style.display = 'none';

    todoList.innerHTML = '';
    inProgressList.innerHTML = '';
    completedList.innerHTML = '';
    todoCount.innerText = '0';
    inProgressCount.innerText = '0';
    completedCount.innerText = '0';
}

let tasksUnsubscribe = null;

function syncTasks(projectId) {
    if (!db) return;
    // Già sottoscritto a questo progetto: nulla da fare
    if (tasksUnsubscribe && state.tasksProjectId === projectId) return;
    if (tasksUnsubscribe) tasksUnsubscribe();

    state.tasksProjectId = projectId;
    state.tasks = [];
    renderTasks();

    const tasksCol = collection(db, `projects/${projectId}/tasks`);
    tasksUnsubscribe = onSnapshot(tasksCol, (snapshot) => {
        // Ignora snapshot arrivati dopo un cambio progetto
        if (state.tasksProjectId !== projectId) return;

        const tasks = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
        }));

        // Migrazione: assegna 'order' alle task che non ce l'hanno
        const missingOrder = tasks.filter(t => t.order === undefined || t.order === null);
        if (missingOrder.length > 0) {
            const batch = writeBatch(db);
            tasks.forEach((t, i) => {
                if (t.order === undefined || t.order === null) {
                    batch.update(doc(db, `projects/${projectId}/tasks`, t.id), { order: i });
                    t.order = i;
                }
            });
            batch.commit().catch(e => console.error("Error migrating task order:", e));
        }

        // Ordinamento per campo 'order'
        tasks.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

        state.tasks = tasks;
        renderTasks();
    }, (error) => {
        console.error("Error syncing tasks:", error);
    });
}

// Render Projects List
function renderProjects() {
    projectsList.innerHTML = '';
    projectsCompletedList.innerHTML = '';

    // Filtriamo i progetti
    const activeProjects = state.projects.filter(p => !p.completed);
    const completedProjects = state.projects.filter(p => p.completed);

    // Mostra/Nascondi sezione completati
    if (completedSection) {
        completedSection.style.display = completedProjects.length > 0 ? 'block' : 'none';
    }

    // Render Attivi
    activeProjects.forEach((project, index) => {
        const li = createProjectLi(project, index, false);
        projectsList.appendChild(li);
    });

    // Render Completati
    completedProjects.forEach((project, index) => {
        const li = createProjectLi(project, index, true);
        projectsCompletedList.appendChild(li);
    });

    initIcons();
}

function createProjectLi(project, index, isCompleted) {
    const li = document.createElement('li');
    li.className = `project-item ${project.id === state.activeProjectId ? 'active' : ''} ${isCompleted ? 'completed-item' : ''}`;
    li.draggable = !isCompleted;
    li.dataset.id = project.id;
    li.dataset.index = index;

    const priorityClass = !isCompleted && index < 3 ? `priority-${index + 1}` : '';
    const priorityDisplay = isCompleted ? '<i data-lucide="check-circle" class="completed-check" style="width:14px;height:14px;"></i>' : (index + 1);

    li.innerHTML = `
        <div class="project-drag-handle" style="${isCompleted ? 'display:none' : ''}" title="Trascina per riordinare">
            <i data-lucide="more-vertical"></i>
        </div>
        <div class="project-priority ${priorityClass}">${priorityDisplay}</div>
        <div class="project-link">
            <span>${escapeHtml(project.name)}</span>
        </div>
    `;

    li.querySelector('.project-link').addEventListener('click', () => {
        // Evita la selezione accidentale subito dopo un riordino touch
        if (Date.now() - lastProjectTouchDragEnd < 400) return;
        selectProject(project.id);
    });

    if (!isCompleted) {
        // Desktop drag events
        li.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('project/id', project.id);
            li.classList.add('project-dragging');
        });
        li.addEventListener('dragend', () => li.classList.remove('project-dragging'));
        li.addEventListener('dragover', (e) => {
            // Mostra l'indicatore solo quando si trascina un progetto
            if (!e.dataTransfer.types.includes('project/id')) return;
            e.preventDefault();
            const rect = li.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            li.classList.toggle('drag-insert-above', e.clientY < midY);
            li.classList.toggle('drag-insert-below', e.clientY >= midY);
        });
        li.addEventListener('dragleave', () => li.classList.remove('drag-insert-above', 'drag-insert-below'));
        li.addEventListener('drop', async (e) => {
            e.preventDefault();
            li.classList.remove('drag-insert-above', 'drag-insert-below');
            const draggedId = e.dataTransfer.getData('project/id');
            if (draggedId && draggedId !== project.id) {
                const rect = li.getBoundingClientRect();
                const insertBefore = e.clientY < (rect.top + rect.height / 2);
                await reorderProjects(draggedId, project.id, insertBefore);
            }
        });
        // Touch handle
        const handle = li.querySelector('.project-drag-handle');
        setupProjectTouchDrag(handle, li, project, index);
    }

    return li;
}

// Touch drag and drop per progetti
let projectTouchState = { active: false, projectId: null, clone: null, timer: null, startX: 0, startY: 0 };
let lastProjectTouchDragEnd = 0;

// Solo i progetti attivi (non archiviati e non il clone) sono destinazioni valide
function getProjectDropTargets() {
    return document.querySelectorAll('#projects-list .project-item');
}

function setupProjectTouchDrag(handle, li, project, index) {
    li.addEventListener('touchstart', (e) => {
        // Ignora pulsanti azione
        if (e.target.closest('.icon-btn')) return;

        // --- FIX: Pulisci SEMPRE eventuali residui di drag precedenti ---
        if (projectTouchState.timer) clearTimeout(projectTouchState.timer);
        if (projectTouchState.clone) projectTouchState.clone.remove();
        document.querySelectorAll('.touch-drag-clone').forEach(el => el.remove());

        projectTouchState.active = false;
        projectTouchState.clone = null;

        const touch = e.touches[0];
        projectTouchState.startX = touch.clientX;
        projectTouchState.startY = touch.clientY;
        const isHandle = e.target.closest('.project-drag-handle');
        const delay = isHandle ? 50 : 500;

        projectTouchState.timer = setTimeout(() => {
            projectTouchState.active = true;
            projectTouchState.projectId = project.id;

            const clone = li.cloneNode(true);
            clone.className = 'project-item touch-drag-clone';
            clone.style.position = 'fixed';
            clone.style.width = li.offsetWidth + 'px';
            clone.style.zIndex = '1000';
            clone.style.opacity = '0.9';
            clone.style.pointerEvents = 'none';
            clone.style.left = li.getBoundingClientRect().left + 'px';
            clone.style.top = (touch.clientY - 20) + 'px';
            clone.style.boxShadow = '0 6px 20px rgba(0,168,255,0.3)';
            document.body.appendChild(clone);
            projectTouchState.clone = clone;

            li.classList.add('project-dragging');
            if (navigator.vibrate) navigator.vibrate(30);
        }, delay);
    }, { passive: true });

    const endTouch = async (e) => {
        clearTimeout(projectTouchState.timer);
        if (!projectTouchState.active) return;

        // Evita che il rilascio generi anche un click (selezione progetto)
        if (e.cancelable) e.preventDefault();
        lastProjectTouchDragEnd = Date.now();

        const touch = e.changedTouches ? e.changedTouches[0] : e;
        let targetId = null;
        let insertBefore = true;

        getProjectDropTargets().forEach(item => {
            item.classList.remove('drag-insert-above', 'drag-insert-below');
            if (item.dataset.id === projectTouchState.projectId) return;

            const rect = item.getBoundingClientRect();
            if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
                targetId = item.dataset.id;
                const midY = rect.top + rect.height / 2;
                insertBefore = touch.clientY < midY;
            }
        });

        const draggedId = projectTouchState.projectId;

        if (projectTouchState.clone) projectTouchState.clone.remove();
        li.classList.remove('project-dragging');
        projectTouchState = { active: false, projectId: null, clone: null, timer: null, startX: 0, startY: 0 };

        if (targetId && draggedId) {
            await reorderProjects(draggedId, targetId, insertBefore);
        }
    };

    li.addEventListener('touchend', endTouch);
    li.addEventListener('touchcancel', () => {
        clearTimeout(projectTouchState.timer);
        document.querySelectorAll('.project-item').forEach(item => item.classList.remove('drag-insert-above', 'drag-insert-below'));
        if (projectTouchState.clone) projectTouchState.clone.remove();
        li.classList.remove('project-dragging');
        projectTouchState = { active: false, projectId: null, clone: null, timer: null, startX: 0, startY: 0 };
    });

    // Listener su tutto l'elemento: il drag può partire anche con long-press fuori dalla maniglia
    li.addEventListener('touchmove', (e) => {
        if (!projectTouchState.active) {
            // Se l'utente sta scorrendo la lista prima dell'attivazione, annulla il long-press
            const touch = e.touches[0];
            const dx = Math.abs(touch.clientX - projectTouchState.startX);
            const dy = Math.abs(touch.clientY - projectTouchState.startY);
            if (dx > 10 || dy > 10) clearTimeout(projectTouchState.timer);
            return;
        }
        e.preventDefault();
        const touch = e.touches[0];

        if (projectTouchState.clone) {
            projectTouchState.clone.style.top = (touch.clientY - 20) + 'px';
        }

        // Evidenzia linea di inserimento per progetti
        getProjectDropTargets().forEach(item => {
            item.classList.remove('drag-insert-above', 'drag-insert-below');
            if (item.dataset.id === projectTouchState.projectId) return;

            const rect = item.getBoundingClientRect();
            if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
                const midY = rect.top + rect.height / 2;
                if (touch.clientY < midY) {
                    item.classList.add('drag-insert-above');
                } else {
                    item.classList.add('drag-insert-below');
                }
            }
        });
    }, { passive: false });
}

async function reorderProjects(draggedId, targetId, insertBefore = true) {
    if (!db) return;

    const draggedIndex = state.projects.findIndex(p => p.id === draggedId);
    if (draggedIndex === -1) return;
    const newProjects = [...state.projects];
    const [draggedProject] = newProjects.splice(draggedIndex, 1);

    // Ricalcola il target index sul nuovo array senza il draggedProject
    const newTargetIndex = newProjects.findIndex(p => p.id === targetId);
    if (newTargetIndex === -1) return;
    const insertIndex = insertBefore ? newTargetIndex : newTargetIndex + 1;

    newProjects.splice(insertIndex, 0, draggedProject);

    // Update orders in Firebase (scrittura atomica: un solo snapshot, niente stati intermedi)
    try {
        const batch = writeBatch(db);
        newProjects.forEach((p, i) => {
            if (p.order !== i) batch.update(doc(db, "projects", p.id), { order: i });
        });
        await batch.commit();
    } catch (e) {
        console.error("Error reordering projects:", e);
    }
}

// Select a Project
function selectProject(id, { animate = true } = {}) {
    state.activeProjectId = id;
    localStorage.setItem('zenith_active_project', id);
    const project = state.projects.find(p => p.id === id);
    if (project) {
        activeProjectName.innerText = project.name;

        const isCompleted = !!project.completed;
        updateCompleteBtnUI(isCompleted);

        // Se il progetto è completato, disattiva pulsanti "Nuova Task"
        addTaskBtn.disabled = isCompleted;
        if (mobileAddTaskBtn) mobileAddTaskBtn.disabled = isCompleted;

        // Sottoscrivi subito le task del nuovo progetto (svuota la board del progetto precedente)
        syncTasks(id);

        // Chiudi sidebar su mobile IMMEDIATAMENTE per evitare overlap grafici
        if (window.innerWidth <= 768) {
            closeSidebar();
            // Piccola attesa per lasciare che la sidebar inizi a chiudersi prima di ridisegnare la lista
            // Questo previene il "salto" grafico o la sidebar che rimane incastrata
            setTimeout(() => {
                renderProjects();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }, 100);
        } else {
            renderProjects();
        }

        if (animate && window.gsap) gsap.fromTo('.column',
            { y: 20, opacity: 0 },
            {
                y: 0,
                opacity: 1,
                stagger: 0.1,
                duration: 0.5,
                ease: 'power2.out',
                overwrite: true
            }
        );
    }
}

// Render Tasks lists
function renderTasks() {
    const project = state.projects.find(p => p.id === state.activeProjectId);
    if (!project) return;
    const tasks = getActiveTasks();

    // Cattura lo stato attuale per l'animazione FLIP
    const flipState = window.Flip ? Flip.getState(".task-card") : null;

    todoList.innerHTML = '';
    inProgressList.innerHTML = '';
    completedList.innerHTML = '';

    let counts = { todo: 0, 'in-progress': 0, completed: 0 };

    tasks.forEach(task => {
        if (!(task.status in counts)) return; // Stato sconosciuto: ignora
        counts[task.status]++;
        const taskEl = createTaskElement(task, counts[task.status]);

        if (task.status === 'todo') todoList.appendChild(taskEl);
        if (task.status === 'in-progress') inProgressList.appendChild(taskEl);
        if (task.status === 'completed') completedList.appendChild(taskEl);
    });

    todoCount.innerText = counts.todo;
    inProgressCount.innerText = counts['in-progress'];
    completedCount.innerText = counts.completed;

    initIcons();

    // Esegue l'animazione FLIP
    if (flipState) {
        Flip.from(flipState, {
            duration: 0.5,
            ease: "power2.inOut",
            stagger: 0.05,
            absolute: true, // Importante per movimenti fluidi tra colonne
            onEnter: elements => gsap.fromTo(elements, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.4, overwrite: true })
        });
    }
}

// Create Task Element
function createTaskElement(task, priority) {
    const div = document.createElement('div');
    const project = state.projects.find(p => p.id === state.activeProjectId);
    const isProjectCompleted = !!project?.completed;

    div.className = `task-card ${isProjectCompleted ? 'completed-view' : ''}`;
    div.draggable = !isProjectCompleted;
    div.dataset.id = task.id;
    div.dataset.status = task.status;
    div.setAttribute('data-flip-id', task.id); // Necessario per Flip

    div.innerHTML = `
        <div class="task-drag-handle" style="${isProjectCompleted ? 'display:none' : ''}" title="Trascina per riordinare">
            <i data-lucide="more-vertical"></i>
        </div>
        <div class="task-content-wrapper">
            <div class="task-header">
                <span class="task-priority">${priority}</span>
                <h4>${escapeHtml(task.title)}</h4>
            </div>
            ${task.description ? `<p>${escapeHtml(task.description)}</p>` : ''}
            <div class="task-actions" style="${isProjectCompleted ? 'display:none' : ''}">
                ${task.status !== 'todo' ? `<button class="task-move-btn move-prev" title="Sposta indietro"><i data-lucide="chevron-left"></i></button>` : ''}
                ${task.status !== 'completed' ? `<button class="task-move-btn move-next" title="Sposta avanti"><i data-lucide="chevron-right"></i></button>` : ''}
                <button class="icon-btn edit-task-btn" data-id="${task.id}" title="Modifica Task"><i data-lucide="pencil"></i></button>
                <button class="icon-btn delete-btn" data-id="${task.id}" title="Elimina Task"><i data-lucide="trash-2"></i></button>
            </div>
            ${task.checklist && task.checklist.length > 0 ? `
            <div class="task-checklist-preview">
                ${task.checklist.map((item, idx) => `
                    <div class="preview-item ${item.completed ? 'completed' : ''}">
                        <input type="checkbox" ${item.completed ? 'checked' : ''} ${isProjectCompleted ? 'disabled' : ''} data-task-id="${task.id}" data-idx="${idx}" class="task-card-checkbox">
                        <span>${escapeHtml(item.text)}</span>
                    </div>
                `).join('')}
            </div>
            ` : ''}
        </div>
    `;

    if (isProjectCompleted) {
        return div;
    }

    // Desktop drag events
    div.addEventListener('dragstart', (e) => {
        div.classList.add('dragging');
        e.dataTransfer.setData(TASK_DRAG_TYPE, task.id);
        e.dataTransfer.effectAllowed = 'move';
    });

    div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
        clearDragIndicators();
    });

    // Riordino task tramite drop su altra task
    div.addEventListener('dragover', (e) => {
        if (!e.dataTransfer.types.includes(TASK_DRAG_TYPE)) return;
        e.preventDefault();
        e.stopPropagation();

        // Rimuovi indicatori da tutte le task
        document.querySelectorAll('.drag-insert-above, .drag-insert-below').forEach(el => {
            el.classList.remove('drag-insert-above', 'drag-insert-below');
        });

        // Mostra linea sopra o sotto in base alla posizione del mouse
        const rect = div.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
            div.classList.add('drag-insert-above');
        } else {
            div.classList.add('drag-insert-below');
        }
    });

    div.addEventListener('dragleave', () => {
        div.classList.remove('drag-insert-above', 'drag-insert-below');
    });

    div.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Determina se inserire sopra o sotto
        const rect = div.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const insertBefore = e.clientY < midY;

        // Lo stopPropagation impedisce alla colonna di ricevere il drop: puliamo qui anche il suo highlight
        clearDragIndicators();

        const draggedId = e.dataTransfer.getData(TASK_DRAG_TYPE);
        if (draggedId && draggedId !== task.id && db) {
            await reorderTasks(draggedId, task.id, task.status, insertBefore);
        }
    });

    // Event Listeners for actions
    div.querySelector('.delete-btn').addEventListener('click', () => deleteTask(task.id));
    div.querySelector('.edit-task-btn').addEventListener('click', () => openEditTaskModal(task));

    const nextBtn = div.querySelector('.move-next');
    if (nextBtn) nextBtn.addEventListener('click', () => moveTask(task.id, 'next'));
    const prevBtn = div.querySelector('.move-prev');
    if (prevBtn) prevBtn.addEventListener('click', () => moveTask(task.id, 'prev'));

    // Checklist toggles nelle card
    div.querySelectorAll('.task-card-checkbox').forEach(chk => {
        chk.addEventListener('click', async (e) => {
            e.stopPropagation(); // Evita drag o altre azioni
            const idx = parseInt(chk.dataset.idx, 10);
            // Copia profonda: non mutare lo stato locale prima della conferma del server
            const updatedChecklist = (task.checklist || []).map((item, i) =>
                i === idx ? { ...item, completed: chk.checked } : { ...item }
            );

            try {
                const taskRef = doc(db, `projects/${state.activeProjectId}/tasks`, task.id);
                await updateDoc(taskRef, { checklist: updatedChecklist });
            } catch (err) {
                console.error("Error updating checklist:", err);
                chk.checked = !chk.checked; // ripristina lo stato visivo
            }
        });
    });

    // Touch drag and drop per mobile
    if ('ontouchstart' in window) {
        setupTouchDragOnCard(div, task);
    }

    return div;
}

// Riordinamento task nella stessa colonna
async function reorderTasks(draggedId, targetId, newStatus, insertBefore = true) {
    if (!db) return;
    const tasks = getActiveTasks();
    const draggedTask = tasks.find(t => t.id === draggedId);
    if (!draggedTask || !newStatus) return;

    // Riordina nella colonna di destinazione
    const columnTasks = tasks.filter(t => t.status === newStatus && t.id !== draggedId);
    const targetIndex = columnTasks.findIndex(t => t.id === targetId);
    const insertIndex = targetIndex === -1 ? columnTasks.length : (insertBefore ? targetIndex : targetIndex + 1);
    columnTasks.splice(insertIndex, 0, { ...draggedTask, status: newStatus });

    // Status + ordini in un'unica scrittura atomica (evita render intermedi e ordini incoerenti)
    try {
        const batch = writeBatch(db);
        columnTasks.forEach((t, i) => {
            const tRef = doc(db, `projects/${state.activeProjectId}/tasks`, t.id);
            if (t.id === draggedId) {
                batch.update(tRef, { status: newStatus, order: i });
            } else if (t.order !== i) {
                batch.update(tRef, { order: i });
            }
        });
        await batch.commit();
    } catch (e) {
        console.error("Error reordering tasks:", e);
    }
}

// Sposta una task alla fine di una colonna
async function moveTaskToColumnEnd(taskId, newStatus) {
    if (!db) return;
    const tasks = getActiveTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task || !newStatus) return;

    const destTasks = tasks.filter(t => t.status === newStatus && t.id !== taskId);
    const maxOrder = destTasks.reduce((max, t) => Math.max(max, t.order ?? -1), -1);
    try {
        const taskRef = doc(db, `projects/${state.activeProjectId}/tasks`, taskId);
        await updateDoc(taskRef, { status: newStatus, order: maxOrder + 1 });
    } catch (e) {
        console.error("Error moving task:", e);
    }
}

function clearDragIndicators() {
    document.querySelectorAll('.drag-insert-above, .drag-insert-below').forEach(el => {
        el.classList.remove('drag-insert-above', 'drag-insert-below');
    });
    document.querySelectorAll('.column.drag-over').forEach(col => col.classList.remove('drag-over'));
}

// Add Drop listeners to columns (Desktop)
let dragAndDropInitialized = false;

function setupDragAndDrop() {
    // Evita listener duplicati se l'utente cambia più volte stato di autenticazione
    if (dragAndDropInitialized) return;
    dragAndDropInitialized = true;

    const columns = document.querySelectorAll('.column');

    columns.forEach(column => {
        column.addEventListener('dragover', (e) => {
            if (!e.dataTransfer.types.includes(TASK_DRAG_TYPE)) return;
            e.preventDefault();
            column.classList.add('drag-over');
        });

        column.addEventListener('dragleave', (e) => {
            // Ignora il passaggio sopra gli elementi figli della colonna (evita lo sfarfallio dell'highlight)
            if (e.relatedTarget && column.contains(e.relatedTarget)) return;
            column.classList.remove('drag-over');
        });

        column.addEventListener('drop', async (e) => {
            e.preventDefault();
            clearDragIndicators();

            const taskId = e.dataTransfer.getData(TASK_DRAG_TYPE);
            const newStatus = column.dataset.status;
            const task = getActiveTasks().find(t => t.id === taskId);

            // Rilascio nella stessa colonna su spazio vuoto: nessuna modifica
            if (task && newStatus && task.status !== newStatus) {
                await moveTaskToColumnEnd(taskId, newStatus);
            }
        });
    });
}

// Touch Drag and Drop (Mobile)
let touchDragState = {
    active: false,
    taskId: null,
    clone: null,
    startX: 0,
    startY: 0,
    timer: null
};

function setupTouchDragOnCard(div, task) {
    div.addEventListener('touchstart', (e) => {
        // Se si tocca un pulsante o una checkbox, non attivare il drag
        if (e.target.closest('button, input')) return;

        // --- FIX: Pulisci SEMPRE eventuali residui di drag precedenti ---
        if (touchDragState.timer) clearTimeout(touchDragState.timer);
        if (touchDragState.clone) touchDragState.clone.remove();
        document.querySelectorAll('.touch-drag-clone').forEach(el => el.remove());

        touchDragState.active = false;
        touchDragState.clone = null;

        const touch = e.touches[0];
        touchDragState.startX = touch.clientX;
        touchDragState.startY = touch.clientY;

        // Se tocca i 3 puntini (handle), attivazione "immediata". 
        // Se tocca il resto della card, attivazione ritardata (long press).
        const isHandle = e.target.closest('.task-drag-handle');
        const delay = isHandle ? 50 : 550;

        touchDragState.timer = setTimeout(() => {
            touchDragState.active = true;
            touchDragState.taskId = task.id;

            const clone = div.cloneNode(true);
            clone.className = 'task-card touch-drag-clone';
            clone.style.position = 'fixed';
            clone.style.width = div.offsetWidth + 'px';
            clone.style.zIndex = '1000';
            clone.style.opacity = '0.85';
            clone.style.pointerEvents = 'none';
            clone.style.left = (touch.clientX - div.offsetWidth / 2) + 'px';
            clone.style.top = (touch.clientY - 30) + 'px';
            document.body.appendChild(clone);
            touchDragState.clone = clone;

            div.classList.add('dragging');
            if (navigator.vibrate) navigator.vibrate(30);
        }, delay);
    }, { passive: true });

    div.addEventListener('touchmove', (e) => {
        if (!touchDragState.active) {
            const touch = e.touches[0];
            const dx = Math.abs(touch.clientX - touchDragState.startX);
            const dy = Math.abs(touch.clientY - touchDragState.startY);
            if (dx > 10 || dy > 10) {
                clearTimeout(touchDragState.timer);
            }
            return;
        }

        e.preventDefault();
        const touch = e.touches[0];

        if (touchDragState.clone) {
            touchDragState.clone.style.left = (touch.clientX - touchDragState.clone.offsetWidth / 2) + 'px';
            touchDragState.clone.style.top = (touch.clientY - 30) + 'px';
        }

        // Evidenzia colonna
        document.querySelectorAll('.column').forEach(col => {
            const rect = col.getBoundingClientRect();
            if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
                touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
                col.classList.add('drag-over');
            } else {
                col.classList.remove('drag-over');
            }
        });

        // Indicatore di inserimento sulle task
        document.querySelectorAll('.task-card').forEach(card => {
            card.classList.remove('drag-insert-above', 'drag-insert-below');
            if (card.dataset.id === touchDragState.taskId) return;

            const rect = card.getBoundingClientRect();
            if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
                touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
                const midY = rect.top + rect.height / 2;
                if (touch.clientY < midY) {
                    card.classList.add('drag-insert-above');
                } else {
                    card.classList.add('drag-insert-below');
                }
            }
        });
    }, { passive: false });

    div.addEventListener('touchend', async (e) => {
        clearTimeout(touchDragState.timer);
        if (!touchDragState.active) return;
        if (e.cancelable) e.preventDefault(); // nessun click "fantasma" dopo il rilascio

        const touch = e.changedTouches[0];

        // Cerca una task-card sotto il punto di rilascio
        let targetTaskId = null;
        let insertBefore = true;
        let targetStatus = null;

        document.querySelectorAll('.task-card').forEach(card => {
            card.classList.remove('drag-insert-above', 'drag-insert-below');
            if (card.dataset.id === touchDragState.taskId) return;

            const rect = card.getBoundingClientRect();
            if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
                touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
                targetTaskId = card.dataset.id;
                targetStatus = card.dataset.status;
                const midY = rect.top + rect.height / 2;
                insertBefore = touch.clientY < midY;
            }
        });

        // Colonna sotto il punto di rilascio
        let targetColumn = null;
        document.querySelectorAll('.column').forEach(col => {
            col.classList.remove('drag-over');
            const rect = col.getBoundingClientRect();
            if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
                touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
                targetColumn = col;
            }
        });

        const draggedId = touchDragState.taskId;

        // Pulisci subito la UI del drag (non attendere la conferma del server)
        if (touchDragState.clone) touchDragState.clone.remove();
        div.classList.remove('dragging');
        touchDragState.active = false;
        touchDragState.taskId = null;
        touchDragState.clone = null;

        if (!draggedId || !db) return;

        if (targetTaskId) {
            // Rilasciato su una task specifica → riordina
            await reorderTasks(draggedId, targetTaskId, targetStatus, insertBefore);
        } else if (targetColumn) {
            // Rilasciato su una colonna vuota → sposta alla fine
            const newStatus = targetColumn.dataset.status;
            const draggedTask = getActiveTasks().find(t => t.id === draggedId);

            // Sposta alla fine solo se cambiamo colonna.
            // Se rilasciamo nella stessa colonna senza colpire una task specifica, non facciamo nulla.
            if (draggedTask && draggedTask.status !== newStatus) {
                await moveTaskToColumnEnd(draggedId, newStatus);
            }
        }
    });

    div.addEventListener('touchcancel', () => {
        clearTimeout(touchDragState.timer);
        document.querySelectorAll('.task-card').forEach(card => {
            card.classList.remove('drag-insert-above', 'drag-insert-below');
        });
        document.querySelectorAll('.column').forEach(col => col.classList.remove('drag-over'));
        if (touchDragState.clone) touchDragState.clone.remove();
        div.classList.remove('dragging');
        touchDragState.active = false;
        touchDragState.taskId = null;
        touchDragState.clone = null;
    });
}

// Move Task logic with Firebase
async function moveTask(taskId, direction) {
    if (!db) return;
    const task = getActiveTasks().find(t => t.id === taskId);
    if (!task) return;
    const statuses = ['todo', 'in-progress', 'completed'];
    const currentIndex = statuses.indexOf(task.status);
    let newStatus = task.status;

    if (direction === 'next' && currentIndex < 2) {
        newStatus = statuses[currentIndex + 1];
    } else if (direction === 'prev' && currentIndex > 0) {
        newStatus = statuses[currentIndex - 1];
    }

    if (newStatus !== task.status) {
        // Metti alla fine della nuova colonna
        await moveTaskToColumnEnd(taskId, newStatus);
    }
}

async function toggleProjectComplete(projectId, isCompleted) {
    if (!db) return;
    try {
        const projectRef = doc(db, "projects", projectId);
        // La UI (pulsanti, card, lista) viene aggiornata dallo snapshot dei progetti
        await updateDoc(projectRef, { completed: isCompleted });

        if (state.activeProjectId === projectId) {
            // Trigger feedback visivo su mobile (cornice che si illumina)
            if (window.innerWidth <= 768 && screenFlashOverlay) {
                screenFlashOverlay.classList.remove('animate');
                void screenFlashOverlay.offsetWidth; // trigger reflow
                screenFlashOverlay.classList.add('animate');
            }
        }
    } catch (e) {
        console.error("Error toggling project complete: ", e);
    }
}

function updateCompleteBtnUI(isCompleted) {
    const btns = [completeActiveProjectBtn, mobileCompleteProjectBtn];

    btns.forEach(btn => {
        if (!btn) return;
        btn.style.display = 'inline-flex';
        btn.disabled = false;

        const span = btn.querySelector('span');
        let icon = btn.querySelector('i') || btn.querySelector('svg');

        if (isCompleted) {
            if (span) span.innerText = 'Ripristina';
            btn.title = 'Sblocca progetto per modifiche';
            if (icon) {
                // Sostituiamo l'elemento per assicurarci che Lucide lo rielabori
                const newIcon = document.createElement('i');
                newIcon.setAttribute('data-lucide', 'rotate-cw');
                icon.replaceWith(newIcon);
            }
        } else {
            if (span) span.innerText = 'Archivia';
            btn.title = 'Segna come completato e archivia';
            if (icon) {
                const newIcon = document.createElement('i');
                newIcon.setAttribute('data-lucide', 'check-circle');
                icon.replaceWith(newIcon);
            }
        }
    });

    const editActiveProjectBtn = document.getElementById('edit-active-project-btn');
    if (editActiveProjectBtn) {
        editActiveProjectBtn.style.display = isCompleted ? 'none' : 'flex';
    }

    initIcons();
}

// Listeners per i pulsanti di completamento
const handleCompleteClick = () => {
    const project = state.projects.find(p => p.id === state.activeProjectId);
    if (project) {
        toggleProjectComplete(project.id, !project.completed);
    }
};

if (completeActiveProjectBtn) completeActiveProjectBtn.addEventListener('click', handleCompleteClick);
if (mobileCompleteProjectBtn) mobileCompleteProjectBtn.addEventListener('click', handleCompleteClick);

async function deleteTask(taskId) {
    if (!db) return;
    if (confirm("Sei sicuro di voler eliminare questa task?")) {
        try {
            const taskRef = doc(db, `projects/${state.activeProjectId}/tasks`, taskId);
            await deleteDoc(taskRef);
        } catch (e) {
            console.error("Error deleting task: ", e);
        }
    }
}

// Restituisce true se il progetto è stato eliminato
async function deleteProject(projectId) {
    if (!db) return false;
    if (!confirm("Sei sicuro di voler eliminare questo progetto e tutte le sue task? L'azione è irreversibile.")) {
        return false;
    }
    try {
        // Firestore non elimina automaticamente le sottocollezioni:
        // eliminiamo prima le task (le regole di sicurezza delle task leggono il progetto padre),
        // in batch da max 500 operazioni.
        const tasksSnap = await getDocs(collection(db, `projects/${projectId}/tasks`));
        const taskDocs = tasksSnap.docs;
        for (let i = 0; i < taskDocs.length; i += 450) {
            const batch = writeBatch(db);
            taskDocs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
            await batch.commit();
        }

        // Poi il documento del progetto.
        // Se era quello attivo, lo snapshot dei progetti selezionerà automaticamente un altro progetto.
        await deleteDoc(doc(db, "projects", projectId));
        return true;
    } catch (e) {
        console.error("Error deleting project: ", e);
        alert("Impossibile eliminare il progetto. Riprova.");
        return false;
    }
}

// Modal Logic - Project
addProjectBtn.addEventListener('click', () => {
    projectModalTitle.innerText = 'Crea Nuovo Progetto';
    saveProjectBtn.innerText = 'Crea';
    projectEditId.value = '';
    projectNameInput.value = '';
    const deleteBtn = document.getElementById('delete-project-btn-modal');
    if (deleteBtn) deleteBtn.style.display = 'none';
    projectModal.classList.add('active');
    setTimeout(() => projectNameInput.focus(), 50);
});
cancelProjectBtn.addEventListener('click', () => projectModal.classList.remove('active'));

function openRenameProjectModal(project) {
    projectModalTitle.innerText = 'Modifica Progetto';
    saveProjectBtn.innerText = 'Salva';
    projectEditId.value = project.id;
    projectNameInput.value = project.name;
    const deleteBtn = document.getElementById('delete-project-btn-modal');
    if (deleteBtn) deleteBtn.style.display = 'block';
    projectModal.classList.add('active');
    setTimeout(() => projectNameInput.focus(), 50);
}

const editActiveProjectBtn = document.getElementById('edit-active-project-btn');
if (editActiveProjectBtn) {
    editActiveProjectBtn.addEventListener('click', () => {
        const project = state.projects.find(p => p.id === state.activeProjectId);
        if (project) {
            openRenameProjectModal(project);
        }
    });
}

const deleteProjectBtnModal = document.getElementById('delete-project-btn-modal');
if (deleteProjectBtnModal) {
    deleteProjectBtnModal.addEventListener('click', async () => {
        const editId = projectEditId.value;
        if (!editId) return;
        // Chiudi il modale solo se l'utente ha confermato l'eliminazione
        if (await deleteProject(editId)) {
            projectModal.classList.remove('active');
        }
    });
}

let isSavingProject = false;

saveProjectBtn.addEventListener('click', async () => {
    const name = projectNameInput.value.trim();
    const editId = projectEditId.value;
    if (!name || !db || !state.currentUser || isSavingProject) return;

    // Evita creazioni duplicate con doppio click
    isSavingProject = true;
    saveProjectBtn.disabled = true;
    try {
        if (editId) {
            // Rinomina progetto esistente
            const projectRef = doc(db, "projects", editId);
            await updateDoc(projectRef, { name: name });
        } else {
            // Crea nuovo progetto in fondo alla lista
            const maxOrder = state.projects.reduce((max, p) => Math.max(max, p.order ?? -1), -1);
            const docRef = await addDoc(collection(db, "projects"), {
                name: name,
                order: maxOrder + 1,
                userId: state.currentUser.uid,
                createdAt: serverTimestamp()
            });
            selectProject(docRef.id);
        }
        projectNameInput.value = '';
        projectEditId.value = '';
        projectModal.classList.remove('active');
    } catch (e) {
        console.error("Error saving project: ", e);
        alert("Impossibile salvare il progetto. Riprova.");
    } finally {
        isSavingProject = false;
        saveProjectBtn.disabled = false;
    }
});

projectNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        saveProjectBtn.click();
    }
});

// Modal Logic - Task
addTaskBtn.addEventListener('click', openAddTaskModal);
if (mobileAddTaskBtn) mobileAddTaskBtn.addEventListener('click', openAddTaskModal);

// --- CHECKLIST LOGIC ---
if (checklistToggle) {
    checklistToggle.addEventListener('click', () => {
        checklistContainer.classList.toggle('expanded');
    });
}

function renderModalChecklist() {
    checklistItemsContainer.innerHTML = '';
    state.currentChecklist.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = `checklist-item ${item.completed ? 'completed' : ''}`;
        div.innerHTML = `
            <input type="checkbox" ${item.completed ? 'checked' : ''}>
            <span>${escapeHtml(item.text)}</span>
            <button class="icon-btn remove-item-btn" title="Rimuovi">
                <i data-lucide="x"></i>
            </button>
        `;

        div.querySelector('input').addEventListener('change', (e) => {
            state.currentChecklist[index].completed = e.target.checked;
            renderModalChecklist();
        });

        div.querySelector('.remove-item-btn').addEventListener('click', () => {
            state.currentChecklist.splice(index, 1);
            renderModalChecklist();
        });

        checklistItemsContainer.appendChild(div);
    });
    initIcons();
}

addChecklistItemBtn.addEventListener('click', () => {
    const text = newChecklistItemInput.value.trim();
    if (text) {
        state.currentChecklist.push({ text, completed: false });
        newChecklistItemInput.value = '';
        renderModalChecklist();
    }
});

newChecklistItemInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        addChecklistItemBtn.click();
    }
});

function openAddTaskModal() {
    taskModalTitle.innerText = 'Nuova Task';
    saveTaskBtn.innerText = 'Aggiungi';
    taskEditId.value = '';
    taskTitleInput.value = '';
    taskDescInput.value = '';
    state.currentChecklist = [];
    renderModalChecklist();
    checklistContainer.classList.remove('expanded');
    taskModal.classList.add('active');
    setTimeout(() => taskTitleInput.focus(), 50);
}

cancelTaskBtn.addEventListener('click', () => taskModal.classList.remove('active'));

function openEditTaskModal(task) {
    taskModalTitle.innerText = 'Modifica Task';
    saveTaskBtn.innerText = 'Salva';
    taskEditId.value = task.id;
    taskTitleInput.value = task.title;
    taskDescInput.value = task.description || '';
    state.currentChecklist = task.checklist ? JSON.parse(JSON.stringify(task.checklist)) : [];
    renderModalChecklist();
    // Se ci sono già item, magari vogliamo aprirlo? No, l'utente ha chiesto che sia nascosto "quando lo apro"
    checklistContainer.classList.remove('expanded');
    taskModal.classList.add('active');
    setTimeout(() => taskTitleInput.focus(), 50);
}

let isSavingTask = false;

saveTaskBtn.addEventListener('click', async () => {
    const title = taskTitleInput.value.trim();
    const desc = taskDescInput.value.trim();
    const editId = taskEditId.value;

    // Include anche una voce di checklist scritta ma non ancora aggiunta con "+"
    const pendingItem = newChecklistItemInput.value.trim();
    if (pendingItem) {
        state.currentChecklist.push({ text: pendingItem, completed: false });
        newChecklistItemInput.value = '';
        renderModalChecklist();
    }
    const checklist = state.currentChecklist.map(item => ({ ...item }));

    if (!title) {
        taskTitleInput.focus();
        return;
    }
    if (!state.activeProjectId || !db || isSavingTask) return;

    // Evita task duplicate con doppio click
    isSavingTask = true;
    saveTaskBtn.disabled = true;
    try {
        if (editId) {
            const taskRef = doc(db, `projects/${state.activeProjectId}/tasks`, editId);
            await updateDoc(taskRef, { title, description: desc, checklist: checklist });
        } else {
            const todoTasks = getActiveTasks().filter(t => t.status === 'todo');
            const maxOrder = todoTasks.reduce((max, t) => Math.max(max, t.order ?? -1), -1);
            await addDoc(collection(db, `projects/${state.activeProjectId}/tasks`), {
                title, description: desc, status: 'todo',
                order: maxOrder + 1, createdAt: serverTimestamp(),
                checklist: checklist
            });
        }
        taskModal.classList.remove('active');
    } catch (e) {
        console.error("Error saving task:", e);
        alert("Impossibile salvare la task. Riprova.");
    } finally {
        isSavingTask = false;
        saveTaskBtn.disabled = false;
    }
});

taskTitleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        saveTaskBtn.click();
    }
});
// -----------------------

// Mobile Sidebar Toggle
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const closeSidebarBtn = document.getElementById('close-sidebar-btn');
const sidebar = document.getElementById('sidebar');

function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('active');
    document.body.classList.add('no-scroll');
}

function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
    document.body.classList.remove('no-scroll');
}

mobileMenuBtn.addEventListener('click', openSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);
closeSidebarBtn.addEventListener('click', closeSidebar);

// Mostra l'overlay di accesso sopra l'app e la rende non interattiva finché l'utente non è loggato
function setAppLocked(locked) {
    authScreen.style.display = locked ? 'flex' : 'none';
    appScreen.inert = locked;
    appScreen.setAttribute('aria-hidden', String(locked));
}

// --- LOGICA AUTH SPOSTATA FUORI DA DOMCONTENTLOADED PER MASSIMA VELOCITÀ ---
if (auth) {
    // Monitoraggio stato utente
    onAuthStateChanged(auth, async (user) => {
        console.log("Auth state changed. User:", user ? user.email : "null");

        if (user) {
            state.currentUser = user;

            // Aggiorna UI Profilo e stato App
            userName.innerText = user.displayName || user.email;
            if (user.photoURL) {
                userAvatar.src = user.photoURL;
                userAvatar.style.display = 'block';
                settingsUserAvatar.src = user.photoURL;
                settingsUserAvatar.style.display = '';
            } else {
                // Evita l'icona di immagine rotta con src vuoto
                settingsUserAvatar.style.display = 'none';
            }
            settingsUserName.innerText = user.displayName || 'Utente Zenith';
            settingsUserEmail.innerText = user.email;

            const wasLocked = appScreen.inert;
            setAppLocked(false);

            // Carica preferenze utente da Firestore
            try {
                const settingsSnap = await getDoc(doc(db, "userSettings", user.uid));
                if (settingsSnap.exists()) {
                    const settings = settingsSnap.data();
                    if (settings.theme) applyTheme(settings.theme, false);
                    if (settings.primaryColor) applyColor(settings.primaryColor, false);
                    if (settings.startupMode) applyStartupMode(settings.startupMode, false);
                }
            } catch (e) {
                console.error("Error loading user settings:", e);
            }

            setupSync();
            setupDragAndDrop();
            initIcons();

            // Animazioni (solo se l'app è appena apparsa)
            if (wasLocked && window.gsap) {
                if (window.innerWidth > 768) {
                    gsap.from('.sidebar', { x: -50, opacity: 0, duration: 0.8, ease: 'power3.out' });
                }
                gsap.from('.top-bar', { y: -20, opacity: 0, duration: 0.8, delay: 0.1, ease: 'power3.out' });
            }

        } else {
            state.currentUser = null;
            setAppLocked(true);
            if (projectsUnsubscribe) projectsUnsubscribe();
            if (tasksUnsubscribe) tasksUnsubscribe();
            projectsUnsubscribe = null;
            tasksUnsubscribe = null;
            state.tasksProjectId = null;
            state.tasks = [];
        }
    });

    // Gestione Risultato Redirect (Mobile)
    getRedirectResult(auth).then((result) => {
        if (result && result.user) {
            console.log("Redirect login successful:", result.user.email);
            // Forza lo switch della UI se onAuthStateChanged dovesse ritardare su iOS
            setAppLocked(false);
        }
    }).catch((error) => {
        console.error("Error getting redirect result:", error);
        // Su iOS Safari, a volte fallisce per restrizioni cross-site o cookie bloccati
        if (error.code === 'auth/web-storage-unsupported' || error.code === 'auth/operation-not-supported-in-this-environment') {
            const msg = "Il tuo browser blocca l'accesso ai dati di login. \nAssicurati di non essere in modalità Privata e di aver disabilitato 'Blocca tutti i cookie' o 'Impedisci tracking tra siti' nelle impostazioni di Safari.";
            alert(msg);
        }
    });
}

// Pulsante Login
loginBtn.addEventListener('click', async () => {
    console.log("Login attempt initiated...");
    if (!auth) {
        alert("Firebase non è configurato: impossibile effettuare l'accesso.");
        return;
    }

    // Prova prima con il Popup anche su mobile, perché è più affidabile per catturare lo stato su iOS
    // Se Safari lo blocca, catturiamo l'errore e passiamo al redirect.
    try {
        console.log("Attempting popup login...");
        await signInWithPopup(auth, provider);
        // Il successo qui verrà gestito da onAuthStateChanged
    } catch (err) {
        // Secondo click mentre un popup è già aperto: nessuna azione
        if (err.code === 'auth/cancelled-popup-request') return;

        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        // Su desktop, chiudere il popup significa annullare l'accesso (niente redirect forzato)
        if (err.code === 'auth/popup-closed-by-user' && !isMobile) return;

        if (err.code === 'auth/popup-blocked' || isMobile) {
            console.warn("Popup failed or blocked, trying redirect:", err.code);
            try {
                console.log("Starting redirect login as fallback...");
                await signInWithRedirect(auth, provider);
            } catch (redirErr) {
                alert("Errore avvio login (redirect): " + redirErr.message);
            }
        } else {
            alert("Errore login: " + err.message);
        }
    }
});

logoutBtn.addEventListener('click', () => {
    if (!auth) return;
    signOut(auth).then(() => {
        window.location.reload(); // Forza ricarica per pulire tutto
    }).catch(err => console.error("Logout error:", err));
});

// Settings Modal Toggle
settingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('active');
    initIcons();
});

closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('active');
});

// Color Selection
colorOptions.forEach(btn => {
    btn.addEventListener('click', () => applyColor(btn.dataset.color));
});

// Theme Selection
themeBtns.forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
});

// Startup Mode Selection
startupBtns.forEach(btn => {
    btn.addEventListener('click', () => applyStartupMode(btn.dataset.startup));
});

// Chiudi modal cliccando fuori.
// Si chiude solo se pressione E rilascio avvengono sullo sfondo: selezionare testo in un campo
// e rilasciare il mouse fuori dal riquadro non deve chiudere il modale (e far perdere i dati inseriti).
// pointerdown copre sia mouse che touch, quindi non serve un listener touchstart separato.
let modalPointerDownTarget = null;
window.addEventListener('pointerdown', (e) => {
    modalPointerDownTarget = e.target;
});
window.addEventListener('click', (e) => {
    const downTarget = modalPointerDownTarget;
    modalPointerDownTarget = null;
    [settingsModal, projectModal, taskModal].forEach(modal => {
        if (e.target === modal && downTarget === modal) modal.classList.remove('active');
    });
});

// Chiudi il modale aperto con Esc
window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    [settingsModal, projectModal, taskModal].forEach(modal => modal.classList.remove('active'));
});
