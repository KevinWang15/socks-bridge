// Main JavaScript file for the Proxy Manager UI

let tlsDomain = null;

// API endpoints
const API = {
    login: '/api/auth/login',
    logout: '/api/auth/logout',
    verify: '/api/auth/verify',
    config: '/api/config',
    listeners: '/api/config/listeners',
    reload: '/api/config/reload'
};

// DOM Elements
const elements = {
    // Pages
    loginPage: document.getElementById('login-page'),
    dashboardPage: document.getElementById('dashboard-page'),

    // Login
    loginForm: document.getElementById('login-form'),
    loginAlert: document.getElementById('login-alert'),

    // Dashboard
    listenersTable: document.getElementById('listeners-table').querySelector('tbody'),
    addListenerBtn: document.getElementById('add-listener-btn'),
    reloadConfigBtn: document.getElementById('reload-config-btn'),
    alertContainer: document.getElementById('alert-container'),
    navLogout: document.getElementById('nav-logout'),

    // Listener Modal
    listenerModalBackdrop: document.getElementById('listener-modal-backdrop'),
    listenerModal: document.getElementById('listener-modal'),
    listenerModalTitle: document.getElementById('listener-modal-title'),
    listenerForm: document.getElementById('listener-form'),
    listenerModalClose: document.getElementById('listener-modal-close'),
    listenerModalCancel: document.getElementById('listener-modal-cancel'),
    listenerModalSave: document.getElementById('listener-modal-save'),

    // Delete Modal
    deleteModalBackdrop: document.getElementById('delete-modal-backdrop'),
    deleteModal: document.getElementById('delete-modal'),
    deleteListenerPort: document.getElementById('delete-listener-port'),
    deleteModalClose: document.getElementById('delete-modal-close'),
    deleteModalCancel: document.getElementById('delete-modal-cancel'),
    deleteModalConfirm: document.getElementById('delete-modal-confirm')
};

// State
let currentListeners = [];
let currentListenerPort = null;
let isEditMode = false;

// Helper Functions
function showAlert(container, type, message, duration = 5000) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;

    container.appendChild(alertDiv);

    if (duration > 0) {
        setTimeout(() => {
            alertDiv.remove();
        }, duration);
    }

    return alertDiv;
}

function showPage(pageId) {
    // Hide all pages
    elements.loginPage.style.display = 'none';
    elements.dashboardPage.style.display = 'none';

    // Show the requested page
    document.getElementById(pageId).style.display = 'block';
}

function openListenerModal(mode, listener = null) {
    isEditMode = mode === 'edit';
    elements.listenerModalTitle.textContent = isEditMode ? 'Edit Listener' : 'Add New Listener';

    // Reset form
    elements.listenerForm.reset();

    if (isEditMode && listener) {
        // Fill form with listener data
        document.getElementById('listener-port').value = listener.port || '';
        document.getElementById('listener-username').value = listener.USERNAME || '';
        document.getElementById('listener-password').value = listener.PASSWORD || '';
        document.getElementById('listener-socks-host').value = listener.SOCKS_HOST || '';
        document.getElementById('listener-socks-port').value = listener.SOCKS_PORT || '';
        document.getElementById('listener-socks-username').value = listener.SOCKS_USERNAME || '';
        document.getElementById('listener-socks-password').value = listener.SOCKS_PASSWORD || '';

        // Store original port for API calls
        currentListenerPort = listener.port;

        // Disable port field in edit mode if needed
        // document.getElementById('listener-port').disabled = true;
    } else {
        // Enable port field in add mode
        document.getElementById('listener-port').disabled = false;
        currentListenerPort = null;
    }

    // Show modal
    elements.listenerModalBackdrop.style.display = 'flex';
}

function closeListenerModal() {
    elements.listenerModalBackdrop.style.display = 'none';
}

function openDeleteModal(listener) {
    elements.deleteListenerPort.textContent = listener.port;
    currentListenerPort = listener.port;

    // Show modal
    elements.deleteModalBackdrop.style.display = 'flex';
}

function closeDeleteModal() {
    elements.deleteModalBackdrop.style.display = 'none';
    currentListenerPort = null;
}

// API Functions
async function fetchAPI(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            credentials: 'include' // Include cookies
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'API request failed');
        }

        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

async function login(username, password) {
    return fetchAPI(API.login, {
        method: 'POST',
        body: JSON.stringify({username, password})
    });
}

async function logout() {
    return fetchAPI(API.logout, {
        method: 'POST'
    });
}

async function verifyAuth() {
    try {
        const result = await fetchAPI(API.verify);
        return result.authenticated;
    } catch (error) {
        return false;
    }
}

async function getListeners() {
    return fetchAPI(API.listeners);
}

async function addListener(listener) {
    return fetchAPI(API.listeners, {
        method: 'POST',
        body: JSON.stringify(listener)
    });
}

async function updateListener(port, listener) {
    return fetchAPI(`${API.listeners}/${port}`, {
        method: 'PUT',
        body: JSON.stringify(listener)
    });
}

async function deleteListener(port) {
    return fetchAPI(`${API.listeners}/${port}`, {
        method: 'DELETE'
    });
}

async function reloadConfig() {
    return fetchAPI(API.reload, {
        method: 'POST'
    });
}

// UI Functions
function renderListeners(listeners) {
    elements.listenersTable.innerHTML = '';

    if (listeners.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="5" style="text-align: center;">No proxy listeners configured</td>';
        elements.listenersTable.appendChild(row);
        return;
    }

    listeners.forEach(listener => {
        const row = document.createElement('tr');

        row.innerHTML = `
      <td>${listener.port}</td>
      <td>${listener.USERNAME || '-'}</td>
      <td>${listener.SOCKS_HOST || '-'}</td>
      <td>${listener.SOCKS_PORT || '-'}</td>
      <td><button class="btn btn-secondary btn-copy" data-port="${listener.port}">Copy</button></td>
      <td>
        <button class="btn btn-primary btn-edit" data-port="${listener.port}">Edit</button>
        <button class="btn btn-danger btn-delete" data-port="${listener.port}">Delete</button>
      </td>
    `;

        elements.listenersTable.appendChild(row);
    });

    // Add event listeners to buttons
    document.querySelectorAll('.btn-edit').forEach(button => {
        button.addEventListener('click', () => {
            const port = parseInt(button.getAttribute('data-port'), 10);
            const listener = listeners.find(l => l.port === port);
            openListenerModal('edit', listener);
        });
    });

    document.querySelectorAll('.btn-delete').forEach(button => {
        button.addEventListener('click', () => {
            const port = parseInt(button.getAttribute('data-port'), 10);
            const listener = listeners.find(l => l.port === port);
            openDeleteModal(listener);
        });
    });

    document.querySelectorAll('.btn-copy').forEach(button => {
        button.addEventListener('click', () => {
            const port = parseInt(button.getAttribute('data-port'), 10);
            const l = listeners.find(x => x.port === port);
            if (!tlsDomain) {
                return showAlert(elements.alertContainer, 'danger',
                    'Domain not available ‑ check certificate');
            }
            const creds = l.USERNAME ? `${l.USERNAME}:${l.PASSWORD || ''}@` : '';
            const cmd = `export https_proxy=https://${creds}${tlsDomain}:${l.port}`;
            navigator.clipboard.writeText(cmd)
                .then(() => showAlert(elements.alertContainer,
                    'success', 'Command copied to clipboard', 3000))
                .catch(() => showAlert(elements.alertContainer,
                    'danger', 'Failed to copy'));
        });
    });
}

async function loadDashboard() {
    try {
        const listeners = await getListeners();
        currentListeners = listeners;
        renderListeners(listeners);
    } catch (error) {
        showAlert(elements.alertContainer, 'danger', `Failed to load listeners: ${error.message}`);
    }
}

// Event Handlers
function setupEventListeners() {
    // Login Form
    elements.loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            elements.loginAlert.style.display = 'none';
            await login(username, password);
            window.location.reload();
        } catch (error) {
            elements.loginAlert.textContent = error.message || 'Login failed';
            elements.loginAlert.style.display = 'block';
        }
    });

    // Logout
    elements.navLogout.addEventListener('click', async (e) => {
        e.preventDefault();

        try {
            await logout();
            showPage('login-page');
        } catch (error) {
            showAlert(elements.alertContainer, 'danger', `Logout failed: ${error.message}`);
        }
    });

    // Add Listener Button
    elements.addListenerBtn.addEventListener('click', () => {
        openListenerModal('add');
    });

    // Reload Config Button
    elements.reloadConfigBtn.addEventListener('click', async () => {
        try {
            await reloadConfig();
            showAlert(elements.alertContainer, 'success', 'Configuration reloaded successfully');
        } catch (error) {
            showAlert(elements.alertContainer, 'danger', `Failed to reload configuration: ${error.message}`);
        }
    });

    // Listener Modal Close
    elements.listenerModalClose.addEventListener('click', closeListenerModal);
    elements.listenerModalCancel.addEventListener('click', closeListenerModal);

    // Listener Modal Save
    elements.listenerModalSave.addEventListener('click', async () => {
        // Get form data
        const formData = new FormData(elements.listenerForm);
        const listener = {};

        formData.forEach((value, key) => {
            if (value) {
                listener[key] = key === 'port' || key === 'SOCKS_PORT' ? parseInt(value, 10) : value;
            }
        });

        try {
            if (isEditMode) {
                await updateListener(currentListenerPort, listener);
                showAlert(elements.alertContainer, 'success', `Listener on port ${listener.port} updated successfully`);
            } else {
                await addListener(listener);
                showAlert(elements.alertContainer, 'success', `Listener on port ${listener.port} added successfully`);
            }

            closeListenerModal();
            loadDashboard();
        } catch (error) {
            showAlert(elements.alertContainer, 'danger', `Failed to ${isEditMode ? 'update' : 'add'} listener: ${error.message}`);
        }
    });

    // Delete Modal Close
    elements.deleteModalClose.addEventListener('click', closeDeleteModal);
    elements.deleteModalCancel.addEventListener('click', closeDeleteModal);

    // Delete Modal Confirm
    elements.deleteModalConfirm.addEventListener('click', async () => {
        if (!currentListenerPort) return;

        try {
            await deleteListener(currentListenerPort);
            showAlert(elements.alertContainer, 'success', `Listener on port ${currentListenerPort} deleted successfully`);
            closeDeleteModal();
            loadDashboard();
        } catch (error) {
            showAlert(elements.alertContainer, 'danger', `Failed to delete listener: ${error.message}`);
        }
    });
}

// Initialize
async function init() {
    setupEventListeners();

    try {
        const {domain} = await fetchAPI(API.config + '/domain');
        tlsDomain = domain;

        const isAuthenticated = await verifyAuth();

        if (isAuthenticated) {
            showPage('dashboard-page');
            loadDashboard();
        } else {
            showPage('login-page');
        }
    } catch (error) {
        showPage('login-page');
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', init);
