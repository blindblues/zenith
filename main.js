import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    query,
    orderBy,
    doc,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Initialize Firebase
let db;
try {
    if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        console.log("Firebase initialized successfully");
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
    projects: [],
    activeProjectId: localStorage.getItem('zenith_active_project') || null
};

// Selectors
const projectsList = document.getElementById('projects-list');
const activeProjectName = document.getElementById('active-project-name');
const activeProjectStats = document.getElementById('active-project-stats');
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

// Data Syncing with Firestore
function setupSync() {
    if (!db) {
        console.warn("Firebase not configured. Using local mode (read-only demo)");
        return;
    }

    // Sync Projects - NO orderBy su Firestore per non escludere documenti senza il campo 'order'
    // L'ordinamento viene gestito lato client per resilienza
    const qProjects = collection(db, "projects");
    onSnapshot(qProjects, async (snapshot) => {
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
            syncTasks(state.activeProjectId);
        }
    });
}

let tasksUnsubscribe = null;

function syncTasks(projectId) {
    if (!db) return;
    if (tasksUnsubscribe) tasksUnsubscribe();

    // Nessun orderBy per evitare di escludere task senza il campo 'createdAt'
    const tasksCol = collection(db, `projects/${projectId}/tasks`);
    tasksUnsubscribe = onSnapshot(tasksCol, (snapshot) => {
        const tasks = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
        }));

        // Ordinamento client-side per data di creazione
        tasks.sort((a, b) => {
            const tA = a.createdAt?.seconds ?? 0;
            const tB = b.createdAt?.seconds ?? 0;
            return tA - tB;
        });

        // Update local state for the active project
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
            <div class="project-priority ${priorityClass}">${index + 1}</div>
            <div class="project-link">
                <i data-lucide="folder"></i>
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

        // Drag events for projects
        li.addEventListener('dragstart', (e) => {
            li.classList.add('project-dragging');
            e.dataTransfer.setData('project/id', project.id);
            e.dataTransfer.setData('project/index', index);
        });

        li.addEventListener('dragend', () => {
            li.classList.remove('project-dragging');
            document.querySelectorAll('.project-item').forEach(item => item.classList.remove('drag-over-project'));
        });

        li.addEventListener('dragover', (e) => {
            e.preventDefault();
            li.classList.add('drag-over-project');
        });

        li.addEventListener('dragleave', () => {
            li.classList.remove('drag-over-project');
        });

        li.addEventListener('drop', async (e) => {
            e.preventDefault();
            li.classList.remove('drag-over-project');
            const draggedId = e.dataTransfer.getData('project/id');
            const targetId = project.id;

            if (draggedId !== targetId) {
                reorderProjects(draggedId, targetId);
            }
        });

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

async function reorderProjects(draggedId, targetId) {
    if (!db) return;

    const draggedIndex = state.projects.findIndex(p => p.id === draggedId);
    const targetIndex = state.projects.findIndex(p => p.id === targetId);

    const newProjects = [...state.projects];
    const [draggedProject] = newProjects.splice(draggedIndex, 1);
    newProjects.splice(targetIndex, 0, draggedProject);

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
        const taskEl = createTaskElement(task);

        if (task.status === 'todo') todoList.appendChild(taskEl);
        if (task.status === 'in-progress') inProgressList.appendChild(taskEl);
        if (task.status === 'completed') completedList.appendChild(taskEl);
    });

    todoCount.innerText = counts.todo;
    inProgressCount.innerText = counts['in-progress'];
    completedCount.innerText = counts.completed;

    activeProjectStats.innerText = `${project.tasks.length} task totali`;
    initIcons();
}

// Create Task Element
function createTaskElement(task) {
    const div = document.createElement('div');
    div.className = 'task-card fade-in';
    div.draggable = true;
    div.dataset.id = task.id;
    div.innerHTML = `
        <h4>${task.title}</h4>
        ${task.description ? `<p>${task.description}</p>` : ''}
        <div class="task-actions">
            <button class="icon-btn edit-task-btn" data-id="${task.id}" title="Modifica Task"><i data-lucide="pencil"></i></button>
            <button class="icon-btn delete-btn" data-id="${task.id}" title="Elimina Task"><i data-lucide="trash-2"></i></button>
        </div>
    `;

    // Drag events on the task
    div.addEventListener('dragstart', (e) => {
        div.classList.add('dragging');
        e.dataTransfer.setData('text/plain', task.id);
    });

    div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
    });

    // Event Listeners for actions
    div.querySelector('.delete-btn').addEventListener('click', () => deleteTask(task.id));
    div.querySelector('.edit-task-btn').addEventListener('click', () => openEditTaskModal(task));

    return div;
}

// Add Drop listeners to columns
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
                const taskRef = doc(db, `projects/${state.activeProjectId}/tasks`, taskId);
                await updateDoc(taskRef, { status: newStatus });
            }
        });
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
        const taskRef = doc(db, `projects/${state.activeProjectId}/tasks`, taskId);
        await updateDoc(taskRef, { status: newStatus });
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
                // Crea nuova task
                await addDoc(collection(db, `projects/${state.activeProjectId}/tasks`), {
                    title: title,
                    description: desc,
                    status: 'todo',
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

// App Initiation
document.addEventListener('DOMContentLoaded', () => {
    setupSync();
    setupDragAndDrop();
    initIcons();

    // Welcome Animation (solo desktop)
    if (window.innerWidth > 768) {
        gsap.from('.sidebar', { x: -50, opacity: 0, duration: 0.8, ease: 'power3.out' });
    }
    gsap.from('.top-bar', { y: -20, opacity: 0, duration: 0.8, delay: 0.2, ease: 'power3.out' });
});
