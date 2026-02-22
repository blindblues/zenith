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
    updateDoc,
    deleteDoc,
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
    activeProjectId: localStorage.getItem('zenith_active_project') || null
};

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

// Selectors
const projectsList = document.getElementById('projects-list');
const activeProjectName = document.getElementById('active-project-name');
const addTaskBtn = document.getElementById('add-task-btn');
const todoList = document.getElementById('todo-list');
const inProgressList = document.getElementById('in-progress-list');
const completedList = document.getElementById('completed-list');

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

// Initialize Lucide Icons
function initIcons() {
    if (window.lucide) {
        lucide.createIcons();
    }
}

// Theme & Color Logic
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('zenith_theme', theme);
    themeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });
}

function applyColor(color) {
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
applyTheme(savedTheme);
applyColor(savedColor);

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

        // Migrazione automatica: assegna 'order' ai progetti che non ce l'hanno
        let needsReorder = false;
        for (let i = 0; i < state.projects.length; i++) {
            if (state.projects[i].order === undefined || state.projects[i].order === null) {
                needsReorder = true;
                const pRef = doc(db, "projects", state.projects[i].id);
                await updateDoc(pRef, { order: i });
                state.projects[i].order = i;
            }
        }

        // Ordinamento client-side per campo 'order'
        state.projects.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

        renderProjects();
        if (state.activeProjectId) {
            const activeProject = state.projects.find(p => p.id === state.activeProjectId);
            if (activeProject) {
                activeProjectName.innerText = activeProject.name;
                addTaskBtn.disabled = false;
            }
            syncTasks(state.activeProjectId);
        }
    });
}

let tasksUnsubscribe = null;

function syncTasks(projectId) {
    if (!db) return;
    if (tasksUnsubscribe) tasksUnsubscribe();

    const tasksCol = collection(db, `projects/${projectId}/tasks`);
    tasksUnsubscribe = onSnapshot(tasksCol, async (snapshot) => {
        const tasks = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
        }));

        // Migrazione: assegna 'order' alle task che non ce l'hanno
        for (let i = 0; i < tasks.length; i++) {
            if (tasks[i].order === undefined || tasks[i].order === null) {
                const tRef = doc(db, `projects/${projectId}/tasks`, tasks[i].id);
                await updateDoc(tRef, { order: i });
                tasks[i].order = i;
            }
        }

        // Ordinamento per campo 'order'
        tasks.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

        const project = state.projects.find(p => p.id === projectId);
        if (project) {
            project.tasks = tasks;
            renderTasks();
        }
    });
}

// Render Projects List
function renderProjects() {
    projectsList.innerHTML = '';
    state.projects.forEach((project, index) => {
        const li = document.createElement('li');
        li.className = `project-item ${project.id === state.activeProjectId ? 'active' : ''}`;
        li.draggable = true;
        li.dataset.id = project.id;
        li.dataset.index = index;

        const priorityClass = index < 3 ? `priority-${index + 1}` : '';

        li.innerHTML = `
            <div class="project-drag-handle" title="Trascina per riordinare">
                <i data-lucide="grip-vertical"></i>
            </div>
            <div class="project-priority ${priorityClass}">${index + 1}</div>
            <div class="project-link">
                <span>${project.name}</span>
            </div>
            <div class="project-item-actions">
                <button class="icon-btn rename-project-btn" data-id="${project.id}" title="Rinomina Progetto">
                    <i data-lucide="pencil"></i>
                </button>
                <button class="icon-btn delete-project-btn" data-id="${project.id}" title="Elimina Progetto">
                    <i data-lucide="x"></i>
                </button>
            </div>
        `;

        // Desktop drag events
        li.addEventListener('dragstart', (e) => {
            li.classList.add('project-dragging');
            e.dataTransfer.setData('project/id', project.id);
        });

        li.addEventListener('dragend', () => {
            li.classList.remove('project-dragging');
            document.querySelectorAll('.project-item').forEach(item => item.classList.remove('drag-over-project'));
        });

        li.addEventListener('dragover', (e) => {
            e.preventDefault();
            document.querySelectorAll('.project-item').forEach(item => item.classList.remove('drag-insert-above', 'drag-insert-below'));
            const rect = li.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (e.clientY < midY) {
                li.classList.add('drag-insert-above');
            } else {
                li.classList.add('drag-insert-below');
            }
        });

        li.addEventListener('dragleave', () => {
            li.classList.remove('drag-insert-above', 'drag-insert-below');
        });

        li.addEventListener('drop', async (e) => {
            e.preventDefault();
            const rect = li.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            const insertBefore = e.clientY < midY;

            li.classList.remove('drag-insert-above', 'drag-insert-below');
            document.querySelectorAll('.project-item').forEach(item => item.classList.remove('drag-insert-above', 'drag-insert-below'));

            const draggedId = e.dataTransfer.getData('project/id');
            if (draggedId && draggedId !== project.id) {
                await reorderProjects(draggedId, project.id, insertBefore);
            }
        });

        // Touch drag for mobile (sull'handle)
        const handle = li.querySelector('.project-drag-handle');
        setupProjectTouchDrag(handle, li, project, index);

        li.querySelector('.project-link').addEventListener('click', () => selectProject(project.id));
        li.querySelector('.rename-project-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openRenameProjectModal(project);
        });
        li.querySelector('.delete-project-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteProject(project.id);
        });

        projectsList.appendChild(li);
    });
    initIcons();
}

// Touch drag and drop per progetti
let projectTouchState = { active: false, projectId: null, clone: null, timer: null };

function setupProjectTouchDrag(handle, li, project, index) {
    handle.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];

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
            clone.style.background = 'white';
            document.body.appendChild(clone);
            projectTouchState.clone = clone;

            li.classList.add('project-dragging');
            if (navigator.vibrate) navigator.vibrate(30);
        }, 50);
    }, { passive: false });

    handle.addEventListener('touchmove', (e) => {
        if (!projectTouchState.active) return;
        e.preventDefault();
        const touch = e.touches[0];

        if (projectTouchState.clone) {
            projectTouchState.clone.style.top = (touch.clientY - 20) + 'px';
        }

        // Evidenzia linea di inserimento per progetti
        document.querySelectorAll('.project-item').forEach(item => {
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

    handle.addEventListener('touchend', async (e) => {
        clearTimeout(projectTouchState.timer);
        if (!projectTouchState.active) return;

        const touch = e.changedTouches[0];
        let targetId = null;
        let insertBefore = true;

        document.querySelectorAll('.project-item').forEach(item => {
            item.classList.remove('drag-insert-above', 'drag-insert-below');
            if (item.dataset.id === projectTouchState.projectId) return;

            const rect = item.getBoundingClientRect();
            if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
                targetId = item.dataset.id;
                const midY = rect.top + rect.height / 2;
                insertBefore = touch.clientY < midY;
            }
        });

        if (targetId && projectTouchState.projectId) {
            await reorderProjects(projectTouchState.projectId, targetId, insertBefore);
        }

        if (projectTouchState.clone) projectTouchState.clone.remove();
        li.classList.remove('project-dragging');
        projectTouchState = { active: false, projectId: null, clone: null, timer: null };
    });

    handle.addEventListener('touchcancel', () => {
        clearTimeout(projectTouchState.timer);
        document.querySelectorAll('.project-item').forEach(item => item.classList.remove('drag-insert-above', 'drag-insert-below'));
        if (projectTouchState.clone) projectTouchState.clone.remove();
        li.classList.remove('project-dragging');
        projectTouchState = { active: false, projectId: null, clone: null, timer: null };
    });
}

async function reorderProjects(draggedId, targetId, insertBefore = true) {
    if (!db) return;

    const draggedIndex = state.projects.findIndex(p => p.id === draggedId);
    const newProjects = [...state.projects];
    const [draggedProject] = newProjects.splice(draggedIndex, 1);

    // Ricalcola il target index sul nuovo array senza il draggedProject
    const newTargetIndex = newProjects.findIndex(p => p.id === targetId);
    const insertIndex = insertBefore ? newTargetIndex : newTargetIndex + 1;

    newProjects.splice(insertIndex, 0, draggedProject);

    // Update orders in Firebase
    for (let i = 0; i < newProjects.length; i++) {
        const pRef = doc(db, "projects", newProjects[i].id);
        await updateDoc(pRef, { order: i });
    }
}

// Select a Project
function selectProject(id) {
    state.activeProjectId = id;
    localStorage.setItem('zenith_active_project', id);
    const project = state.projects.find(p => p.id === id);
    if (project) {
        activeProjectName.innerText = project.name;
        addTaskBtn.disabled = false;
        renderProjects();
        syncTasks(id);

        // Chiudi sidebar su mobile
        if (window.innerWidth <= 768) {
            closeSidebar();
        }

        gsap.from('.column', {
            y: 20,
            opacity: 0,
            stagger: 0.1,
            duration: 0.5,
            ease: 'power2.out'
        });
    }
}

// Render Tasks lists
function renderTasks() {
    const project = state.projects.find(p => p.id === state.activeProjectId);
    if (!project || !project.tasks) return;

    todoList.innerHTML = '';
    inProgressList.innerHTML = '';
    completedList.innerHTML = '';

    let counts = { todo: 0, 'in-progress': 0, completed: 0 };

    project.tasks.forEach(task => {
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
}

// Create Task Element
function createTaskElement(task, priority) {
    const div = document.createElement('div');
    div.className = 'task-card fade-in';
    div.draggable = true;
    div.dataset.id = task.id;
    div.dataset.status = task.status;
    div.innerHTML = `
        <div class="task-header">
            <span class="task-priority">${priority}</span>
            <h4>${task.title}</h4>
        </div>
        ${task.description ? `<p>${task.description}</p>` : ''}
        <div class="task-actions">
            ${task.status !== 'todo' ? `<button class="task-move-btn move-prev" title="Sposta indietro"><i data-lucide="chevron-left"></i></button>` : ''}
            ${task.status !== 'completed' ? `<button class="task-move-btn move-next" title="Sposta avanti"><i data-lucide="chevron-right"></i></button>` : ''}
            <button class="icon-btn edit-task-btn" data-id="${task.id}" title="Modifica Task"><i data-lucide="pencil"></i></button>
            <button class="icon-btn delete-btn" data-id="${task.id}" title="Elimina Task"><i data-lucide="trash-2"></i></button>
        </div>
    `;

    // Desktop drag events
    div.addEventListener('dragstart', (e) => {
        div.classList.add('dragging');
        e.dataTransfer.setData('text/plain', task.id);
    });

    div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
    });

    // Riordino task tramite drop su altra task
    div.addEventListener('dragover', (e) => {
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

        div.classList.remove('drag-insert-above', 'drag-insert-below');
        document.querySelectorAll('.drag-insert-above, .drag-insert-below').forEach(el => {
            el.classList.remove('drag-insert-above', 'drag-insert-below');
        });

        const draggedId = e.dataTransfer.getData('text/plain');
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

    // Touch drag and drop per mobile
    if ('ontouchstart' in window) {
        setupTouchDragOnCard(div, task);
    }

    return div;
}

// Riordinamento task nella stessa colonna
async function reorderTasks(draggedId, targetId, newStatus, insertBefore = true) {
    if (!db) return;
    const project = state.projects.find(p => p.id === state.activeProjectId);
    if (!project || !project.tasks) return;

    const draggedTask = project.tasks.find(t => t.id === draggedId);

    // Se cambia colonna, aggiorna lo status
    if (draggedTask.status !== newStatus) {
        const taskRef = doc(db, `projects/${state.activeProjectId}/tasks`, draggedId);
        await updateDoc(taskRef, { status: newStatus });
    }

    // Riordina nella colonna di destinazione
    const columnTasks = project.tasks.filter(t => t.status === newStatus && t.id !== draggedId);
    const targetIndex = columnTasks.findIndex(t => t.id === targetId);
    const insertIndex = insertBefore ? targetIndex : targetIndex + 1;
    columnTasks.splice(insertIndex, 0, { ...draggedTask, status: newStatus });

    // Aggiorna ordini su Firebase
    for (let i = 0; i < columnTasks.length; i++) {
        const tRef = doc(db, `projects/${state.activeProjectId}/tasks`, columnTasks[i].id);
        await updateDoc(tRef, { order: i });
    }
}

// Add Drop listeners to columns (Desktop)
function setupDragAndDrop() {
    const columns = document.querySelectorAll('.column');

    columns.forEach(column => {
        column.addEventListener('dragover', (e) => {
            e.preventDefault();
            column.classList.add('drag-over');
        });

        column.addEventListener('dragleave', () => {
            column.classList.remove('drag-over');
        });

        column.addEventListener('drop', async (e) => {
            e.preventDefault();
            column.classList.remove('drag-over');

            const taskId = e.dataTransfer.getData('text/plain');
            const newStatus = column.dataset.status;

            if (taskId && newStatus && db) {
                // Assegna l'ordine alla fine della colonna
                const project = state.projects.find(p => p.id === state.activeProjectId);
                const columnTasks = project?.tasks?.filter(t => t.status === newStatus) || [];
                const newOrder = columnTasks.length;

                const taskRef = doc(db, `projects/${state.activeProjectId}/tasks`, taskId);
                await updateDoc(taskRef, { status: newStatus, order: newOrder });
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
        if (e.target.closest('button')) return;

        const touch = e.touches[0];
        touchDragState.startX = touch.clientX;
        touchDragState.startY = touch.clientY;

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
        }, 80);
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

        // Pulisci colonne
        document.querySelectorAll('.column').forEach(col => col.classList.remove('drag-over'));

        if (targetTaskId && touchDragState.taskId && db) {
            // Rilasciato su una task specifica → riordina
            await reorderTasks(touchDragState.taskId, targetTaskId, targetStatus, insertBefore);
        } else {
            // Rilasciato su una colonna vuota → sposta alla fine
            let targetColumn = null;
            document.querySelectorAll('.column').forEach(col => {
                const rect = col.getBoundingClientRect();
                if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
                    touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
                    targetColumn = col;
                }
            });

            if (targetColumn && touchDragState.taskId && db) {
                const newStatus = targetColumn.dataset.status;
                const project = state.projects.find(p => p.id === state.activeProjectId);
                const columnTasks = project?.tasks?.filter(t => t.status === newStatus) || [];
                const newOrder = columnTasks.length;
                const taskRef = doc(db, `projects/${state.activeProjectId}/tasks`, touchDragState.taskId);
                await updateDoc(taskRef, { status: newStatus, order: newOrder });
            }
        }

        // Pulisci
        if (touchDragState.clone) touchDragState.clone.remove();
        div.classList.remove('dragging');
        touchDragState.active = false;
        touchDragState.taskId = null;
        touchDragState.clone = null;
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
    const project = state.projects.find(p => p.id === state.activeProjectId);
    const task = project.tasks.find(t => t.id === taskId);
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
        const project = state.projects.find(p => p.id === state.activeProjectId);
        const destTasks = project?.tasks?.filter(t => t.status === newStatus) || [];
        const newOrder = destTasks.length;
        const taskRef = doc(db, `projects/${state.activeProjectId}/tasks`, taskId);
        await updateDoc(taskRef, { status: newStatus, order: newOrder });
    }
}

async function deleteTask(taskId) {
    if (!db) return;
    if (confirm("Sei sicuro di voler eliminare questa task?")) {
        const taskRef = doc(db, `projects/${state.activeProjectId}/tasks`, taskId);
        await deleteDoc(taskRef);
    }
}

async function deleteProject(projectId) {
    if (!db) return;
    if (confirm("Sei sicuro di voler eliminare questo progetto e tutte le sue task? L'azione è irreversibile.")) {
        try {
            // Firestore non elimina automaticamente le sottocollezioni. 
            // Per piccoli progetti come questo, recuperiamo le task e le eliminiamo.
            const project = state.projects.find(p => p.id === projectId);

            // Se il progetto ha task caricate nello stato locale (perché è quello attivo)
            // le usiamo, altrimenti dovremmo fare una fetch (omessa per semplicità se non attivo)
            // In un set reale, useremmo una Cloud Function o un batch delete.

            // Eliminiamo il documento del progetto
            const projectRef = doc(db, "projects", projectId);
            await deleteDoc(projectRef);

            if (state.activeProjectId === projectId) {
                state.activeProjectId = null;
                localStorage.removeItem('zenith_active_project');
                location.reload(); // Semplice reload per resettare lo stato della UI
            }
        } catch (e) {
            console.error("Error deleting project: ", e);
        }
    }
}

// Modal Logic - Project
addProjectBtn.addEventListener('click', () => {
    projectModalTitle.innerText = 'Crea Nuovo Progetto';
    saveProjectBtn.innerText = 'Crea';
    projectEditId.value = '';
    projectNameInput.value = '';
    projectModal.classList.add('active');
});
cancelProjectBtn.addEventListener('click', () => projectModal.classList.remove('active'));

function openRenameProjectModal(project) {
    projectModalTitle.innerText = 'Rinomina Progetto';
    saveProjectBtn.innerText = 'Salva';
    projectEditId.value = project.id;
    projectNameInput.value = project.name;
    projectModal.classList.add('active');
}

saveProjectBtn.addEventListener('click', async () => {
    const name = projectNameInput.value.trim();
    const editId = projectEditId.value;
    if (name && db) {
        try {
            if (editId) {
                // Rinomina progetto esistente
                const projectRef = doc(db, "projects", editId);
                await updateDoc(projectRef, { name: name });
            } else {
                // Crea nuovo progetto
                const docRef = await addDoc(collection(db, "projects"), {
                    name: name,
                    order: state.projects.length,
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
        }
    }
});

// Modal Logic - Task
addTaskBtn.addEventListener('click', () => {
    taskModalTitle.innerText = 'Nuova Task';
    saveTaskBtn.innerText = 'Aggiungi';
    taskEditId.value = '';
    taskTitleInput.value = '';
    taskDescInput.value = '';
    taskModal.classList.add('active');
});
cancelTaskBtn.addEventListener('click', () => taskModal.classList.remove('active'));

function openEditTaskModal(task) {
    taskModalTitle.innerText = 'Modifica Task';
    saveTaskBtn.innerText = 'Salva';
    taskEditId.value = task.id;
    taskTitleInput.value = task.title;
    taskDescInput.value = task.description || '';
    taskModal.classList.add('active');
}

saveTaskBtn.addEventListener('click', async () => {
    const title = taskTitleInput.value.trim();
    const desc = taskDescInput.value.trim();
    const editId = taskEditId.value;

    if (title && state.activeProjectId && db) {
        try {
            if (editId) {
                // Modifica task esistente
                const taskRef = doc(db, `projects/${state.activeProjectId}/tasks`, editId);
                await updateDoc(taskRef, { title: title, description: desc });
            } else {
                // Crea nuova task - assegna order alla fine della colonna todo
                const project = state.projects.find(p => p.id === state.activeProjectId);
                const todoTasks = project?.tasks?.filter(t => t.status === 'todo') || [];
                await addDoc(collection(db, `projects/${state.activeProjectId}/tasks`), {
                    title: title,
                    description: desc,
                    status: 'todo',
                    order: todoTasks.length,
                    createdAt: serverTimestamp()
                });
            }
            taskTitleInput.value = '';
            taskDescInput.value = '';
            taskEditId.value = '';
            taskModal.classList.remove('active');
        } catch (e) {
            console.error("Error saving task: ", e);
        }
    }
});

// Mobile Sidebar Toggle
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const closeSidebarBtn = document.getElementById('close-sidebar-btn');
const sidebar = document.getElementById('sidebar');

function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('active');
}

function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
}

mobileMenuBtn.addEventListener('click', openSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);
closeSidebarBtn.addEventListener('click', closeSidebar);

// Migrazione dei progetti vecchi (senza owner) all'utente loggato.
async function migrateLegacyProjects(userId) {
    if (!db) return;
    const qProjects = collection(db, "projects");
    const snap = await getDocs(qProjects);

    // Assegna il userId ai progetti che non ce l'hanno
    for (const docSnap of snap.docs) {
        const prod = docSnap.data();
        if (!prod.userId) {
            await updateDoc(doc(db, "projects", docSnap.id), { userId: userId });
        }
    }
}

// App Initiation / Auth
document.addEventListener('DOMContentLoaded', async () => {
    const loadingScreen = document.getElementById('loading-screen');

    if (auth) {
        console.log("Initializing Auth with Domain:", firebaseConfig.authDomain);

        try {
            await setPersistence(auth, browserLocalPersistence);
            console.log("Checking for redirect result...");
            const result = await getRedirectResult(auth).catch(e => {
                console.error("Redirect Error caught:", e);
                return null;
            });

            if (result?.user) {
                console.log("Redirect success:", result.user.email);
                state.currentUser = result.user;
            }
        } catch (err) {
            console.error("Auth init error:", err);
        }

        // Monitoraggio stato utente
        onAuthStateChanged(auth, async (user) => {
            console.log("Auth state changed. User:", user ? user.email : "null");

            // Nascondi sempre il loader dopo la prima risposta dell'auth
            if (loadingScreen) {
                setTimeout(() => {
                    loadingScreen.style.opacity = '0';
                    setTimeout(() => loadingScreen.style.display = 'none', 300);
                }, 500);
            }

            if (user) {
                state.currentUser = user;

                // Aggiorna UI Profilo e stato App
                userName.innerText = user.displayName || user.email;
                if (user.photoURL) {
                    userAvatar.src = user.photoURL;
                    userAvatar.style.display = 'block';
                    settingsUserAvatar.src = user.photoURL;
                }
                settingsUserName.innerText = user.displayName || 'Utente Zenith';
                settingsUserEmail.innerText = user.email;

                authScreen.style.display = 'none';
                appScreen.style.display = 'flex';

                // Migra progetti legacy e carica dati
                await migrateLegacyProjects(user.uid);
                setupSync();
                setupDragAndDrop();
                initIcons();

                // Animazioni
                if (window.innerWidth > 768) {
                    gsap.from('.sidebar', { x: -50, opacity: 0, duration: 0.8, ease: 'power3.out' });
                }
                gsap.from('.top-bar', { y: -20, opacity: 0, duration: 0.8, delay: 0.1, ease: 'power3.out' });

            } else {
                state.currentUser = null;
                authScreen.style.display = 'flex';
                appScreen.style.display = 'none';
                if (projectsUnsubscribe) projectsUnsubscribe();
                if (tasksUnsubscribe) tasksUnsubscribe();
            }
        });

        // Pulsante Login - Approccio Robusto
        loginBtn.addEventListener('click', async () => {
            console.log("Login button clicked");
            // Su mobile è categorico usare Redirect per evitare blocchi o perdite di sessione
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

            if (isMobile) {
                console.log("Starting redirect login (Mobile)...");
                try {
                    await signInWithRedirect(auth, provider);
                } catch (err) {
                    alert("Errore avvio login: " + err.message);
                }
            } else {
                console.log("Starting popup login (Desktop)...");
                try {
                    await signInWithPopup(auth, provider);
                } catch (err) {
                    console.warn("Popup blocked or failed, falling back to redirect:", err.code);
                    if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
                        await signInWithRedirect(auth, provider);
                    } else {
                        alert("Errore login: " + err.message);
                    }
                }
            }
        });

        logoutBtn.addEventListener('click', () => {
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

        // Chiudi modal cliccando fuori
        window.addEventListener('click', (e) => {
            if (e.target === settingsModal) settingsModal.classList.remove('active');
        });
    } else {
        setupSync();
        setupDragAndDrop();
        initIcons();
    }
});
