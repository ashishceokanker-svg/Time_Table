/**
 * Strive - Study Tracker & Timetable App
 * Core Application Logic
 */

// --- STATE MANAGEMENT ---
const AppState = {
    timetable: [],
    logs: [],
    users: [],
    currentUser: null,
    theme: 'dark',
    currentView: 'dashboard',
    selectedTimetableDay: 1, // 1 = Monday, 2 = Tuesday, ..., 0 = Sunday
    editingLogId: null,
    editingScheduleId: null,
    currentUploadedFile: null,
    dashboardPeriod: 'week',
    
    // User-specific isolated views of the data
    get userTimetable() {
        if (!this.currentUser) return [];
        if (this.currentUser.role === 'admin' || this.currentUser.username === 'admin') {
            return this.timetable;
        }
        return this.timetable.filter(s => s.username === this.currentUser.username);
    },
    get userLogs() {
        if (!this.currentUser) return [];
        if (this.currentUser.role === 'admin' || this.currentUser.username === 'admin') {
            return this.logs;
        }
        return this.logs.filter(l => l.username === this.currentUser.username);
    }
};

// --- SESSION TIMEOUT VARIABLES ---
let inactivityTimeout;
const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 minutes inactivity limit

// Helper to get formatted date string for today and past days
function getOffsetDateString(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    return d.toISOString().split('T')[0];
}

// Helper to get formatted date string for a specific day of the current week (1=Mon, 2=Tue, ..., 0=Sun)
function getDateOfCurrentWeek(dayIndex) {
    const today = new Date();
    const currentDay = today.getDay(); // 0-6
    // Standardize Sunday to 7 to make Monday (1) the start of the week
    const currentDayNorm = currentDay === 0 ? 7 : currentDay;
    const targetDayNorm = dayIndex === 0 ? 7 : dayIndex;
    const diff = targetDayNorm - currentDayNorm;
    
    const d = new Date(today);
    d.setDate(today.getDate() + diff);
    return d.toISOString().split('T')[0];
}

// Helper to get local day of the week from YYYY-MM-DD string
function getDayFromDate(dateStr) {
    const parts = dateStr.split('-');
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.getDay(); // 0 is Sunday, 1 is Monday, etc.
}

// Default Sample Data to make the app look stunning on first load
const SAMPLE_TIMETABLE = [];

const SAMPLE_LOGS = [];

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    initApp();
    setupEventListeners();
    await loadDatabase();
});

function initApp() {
    // Perform database wipe once if not already done, keeping admin credentials & settings untouched
    const WIPE_KEY = 'anti_gravity_wiped_2026_06_17_db_cleanup';
    if (!localStorage.getItem(WIPE_KEY)) {
        // Clear application data
        localStorage.setItem('anti_gravity_timetable', JSON.stringify([]));
        localStorage.setItem('anti_gravity_logs', JSON.stringify([]));
        localStorage.removeItem('strive_timetable');
        localStorage.removeItem('strive_logs');

        // Clean user accounts to keep only admin
        const savedUsersStr = localStorage.getItem('anti_gravity_users');
        let adminUser = null;
        if (savedUsersStr) {
            try {
                const users = JSON.parse(savedUsersStr);
                adminUser = users.find(u => u.username.toLowerCase() === 'admin');
            } catch (e) {
                console.error("Error parsing users during wipe:", e);
            }
        }
        
        if (!adminUser) {
            adminUser = { username: 'admin', passwordHash: 'admin', classGrade: 'Admin', role: 'admin', status: 'approved' };
        }
        
        localStorage.setItem('anti_gravity_users', JSON.stringify([adminUser]));

        // Clear active session if not admin
        const currentUserStr = localStorage.getItem('anti_gravity_current_user');
        if (currentUserStr) {
            try {
                const currentUser = JSON.parse(currentUserStr);
                if (currentUser.username.toLowerCase() !== 'admin') {
                    localStorage.removeItem('anti_gravity_current_user');
                }
            } catch (e) {
                localStorage.removeItem('anti_gravity_current_user');
            }
        }

        // Set wipe mark
        localStorage.setItem(WIPE_KEY, 'true');
    }

    // 1. Load users from LocalStorage or seed default users
    const savedUsers = localStorage.getItem('anti_gravity_users');
    if (savedUsers) {
        AppState.users = JSON.parse(savedUsers);
    } else {
        // Seed default accounts
        AppState.users = [
            { username: 'admin', passwordHash: 'admin', classGrade: 'Admin', role: 'admin', status: 'approved' }
        ];
        saveToLocalStorage('users');
    }

    // 2. Load current user from session
    const savedCurrentUser = localStorage.getItem('anti_gravity_current_user');
    if (savedCurrentUser) {
        AppState.currentUser = JSON.parse(savedCurrentUser);
    } else {
        AppState.currentUser = null;
    }

    // 3. Load other databases (migrate Strive keys if present)
    const savedTimetable = localStorage.getItem('anti_gravity_timetable') || localStorage.getItem('strive_timetable');
    const savedLogs = localStorage.getItem('anti_gravity_logs') || localStorage.getItem('strive_logs');
    const savedTheme = localStorage.getItem('anti_gravity_theme') || localStorage.getItem('strive_theme');

    if (savedTimetable) {
        AppState.timetable = JSON.parse(savedTimetable);
    } else {
        AppState.timetable = SAMPLE_TIMETABLE;
        saveToLocalStorage('timetable');
    }

    if (savedLogs) {
        AppState.logs = JSON.parse(savedLogs);
    } else {
        AppState.logs = SAMPLE_LOGS;
        saveToLocalStorage('logs');
    }

    if (savedTheme) {
        AppState.theme = savedTheme;
    } else {
        AppState.theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }

    // 4. Apply theme
    document.documentElement.setAttribute('data-theme', AppState.theme);
    updateThemeToggleUI();
    updateDashboardThemeButtonsUI();

    // 5. Set default log form date to today and restrict selection to today only
    const d = new Date();
    const todayVal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const logDateInput = document.getElementById('log-date');
    if (logDateInput) {
        logDateInput.value = todayVal;
        logDateInput.min = todayVal;
        logDateInput.max = todayVal;
    }
    document.getElementById('filter-log-month').value = new Date().toISOString().slice(0, 7);

    // 6. Update Current Date Display in Header
    updateHeaderDate();

    // 7. Verify authentication state
    checkAuthState();

    // 8. Setup Inactivity Session Timeout
    resetInactivityTimeout();
    const activityEvents = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    activityEvents.forEach(evtName => {
        document.addEventListener(evtName, resetInactivityTimeout, { passive: true });
    });
}

function saveToLocalStorage(key) {
    if (key === 'timetable') {
        localStorage.setItem('anti_gravity_timetable', JSON.stringify(AppState.timetable));
        saveToDatabase('timetable', AppState.timetable);
    } else if (key === 'logs') {
        localStorage.setItem('anti_gravity_logs', JSON.stringify(AppState.logs));
        saveToDatabase('logs', AppState.logs);
    } else if (key === 'theme') {
        localStorage.setItem('anti_gravity_theme', AppState.theme);
    } else if (key === 'users') {
        localStorage.setItem('anti_gravity_users', JSON.stringify(AppState.users));
        saveToDatabase('users', AppState.users);
    } else if (key === 'current_user') {
        if (AppState.currentUser) {
            localStorage.setItem('anti_gravity_current_user', JSON.stringify(AppState.currentUser));
        } else {
            localStorage.removeItem('anti_gravity_current_user');
        }
    }
}

// Base API URL resolver: points to absolute Vercel deployment URL if loaded as local file:/// (inside Android app)
const API_BASE = window.location.protocol === 'file:' ? 'https://timetable-tau-six.vercel.app' : '';

async function saveToDatabase(key, data) {
    try {
        const response = await fetch(`${API_BASE}/api/db`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ key, data })
        });
        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            console.error(`Failed to save ${key} to cloud database:`, errBody.error || response.statusText);
        }
    } catch (error) {
        console.error(`Network error saving ${key} to cloud database:`, error);
    }
}

async function loadDatabase() {
    const overlay = document.getElementById('db-loading-overlay');
    try {
        const response = await fetch(`${API_BASE}/api/db`);
        if (!response.ok) {
            throw new Error(`Failed to fetch database: ${response.statusText}`);
        }
        const data = await response.json();
        
        // Sync retrieved data to AppState
        if (data.users && Array.isArray(data.users)) {
            AppState.users = data.users;
            const hasAdmin = AppState.users.some(u => u.username.toLowerCase() === 'admin');
            if (!hasAdmin) {
                AppState.users.push({ username: 'admin', passwordHash: 'admin', classGrade: 'Admin', role: 'admin', status: 'approved' });
            }
            localStorage.setItem('anti_gravity_users', JSON.stringify(AppState.users));
        }
        if (data.timetable && Array.isArray(data.timetable)) {
            AppState.timetable = data.timetable;
            localStorage.setItem('anti_gravity_timetable', JSON.stringify(AppState.timetable));
        }
        if (data.logs && Array.isArray(data.logs)) {
            AppState.logs = data.logs;
            localStorage.setItem('anti_gravity_logs', JSON.stringify(AppState.logs));
        }
        
        console.log('Successfully synced state with cloud database.');
        
        // Re-authenticate current user status just in case (e.g. if deactivated or approved status changed)
        if (AppState.currentUser) {
            const freshUser = AppState.users.find(u => u.username.toLowerCase() === AppState.currentUser.username.toLowerCase());
            if (freshUser) {
                AppState.currentUser = freshUser;
                localStorage.setItem('anti_gravity_current_user', JSON.stringify(AppState.currentUser));
            } else {
                // User was deleted from the global db
                AppState.currentUser = null;
                localStorage.removeItem('anti_gravity_current_user');
            }
        }
        
        // Re-verify authentication state and re-render current view
        checkAuthState();
        
    } catch (error) {
        console.warn('Could not load cloud database, falling back to offline mode:', error);
    } finally {
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.style.display = 'none';
            }, 500); // match transition speed
        }
    }
}

// --- NAVIGATION & ROUTING ---
function setupEventListeners() {
    // Sidebar navigation clicks
    document.getElementById('nav-dashboard').addEventListener('click', () => switchView('dashboard'));
    document.getElementById('nav-timetable').addEventListener('click', () => switchView('timetable'));
    document.getElementById('nav-logs').addEventListener('click', () => switchView('logs'));
    document.getElementById('nav-reports').addEventListener('click', () => switchView('reports'));
    document.getElementById('nav-admin').addEventListener('click', () => switchView('admin'));
    document.getElementById('nav-contact').addEventListener('click', () => switchView('contact'));

    // Header Logout Click
    document.getElementById('btn-logout-header').addEventListener('click', () => {
        if (confirm("Are you sure you want to logout?")) {
            AppState.currentUser = null;
            saveToLocalStorage('current_user');
            checkAuthState();
        }
    });

    // Reports Filters (Standard User)
    const reportStart = document.getElementById('report-start-date');
    const reportEnd = document.getElementById('report-end-date');
    const reportSubject = document.getElementById('report-subject-select');
    const reportReset = document.getElementById('btn-reset-report-filters');

    if (reportStart) reportStart.addEventListener('change', renderReportsView);
    if (reportEnd) reportEnd.addEventListener('change', renderReportsView);
    if (reportSubject) reportSubject.addEventListener('change', renderReportsView);
    if (reportReset) {
        reportReset.addEventListener('click', () => {
            reportStart.value = getOffsetDateString(30);
            reportEnd.value = getOffsetDateString(0);
            reportSubject.value = 'ALL';
            renderReportsView();
        });
    }

    // Reports Export Click Listeners (Standard User)
    const btnExportExcel = document.getElementById('btn-export-excel');
    const btnExportPDF = document.getElementById('btn-export-pdf');
    if (btnExportExcel) btnExportExcel.addEventListener('click', () => exportToExcel(false));
    if (btnExportPDF) btnExportPDF.addEventListener('click', () => exportToPDF(false));

    // Reports Filters (Admin User)
    const adminReportUser = document.getElementById('admin-report-user-select');
    const adminReportStart = document.getElementById('admin-report-start-date');
    const adminReportEnd = document.getElementById('admin-report-end-date');
    const adminReportSubject = document.getElementById('admin-report-subject-select');
    const adminReportReset = document.getElementById('btn-admin-reset-report-filters');

    if (adminReportUser) adminReportUser.addEventListener('change', handleAdminReportUserChange);
    if (adminReportStart) adminReportStart.addEventListener('change', updateAdminReportView);
    if (adminReportEnd) adminReportEnd.addEventListener('change', updateAdminReportView);
    if (adminReportSubject) adminReportSubject.addEventListener('change', updateAdminReportView);
    if (adminReportReset) {
        adminReportReset.addEventListener('click', () => {
            adminReportStart.value = getOffsetDateString(30);
            adminReportEnd.value = getOffsetDateString(0);
            adminReportSubject.value = 'ALL';
            updateAdminReportView();
        });
    }

    // Reports Export Click Listeners (Admin User)
    const btnAdminExportExcel = document.getElementById('btn-admin-export-excel');
    const btnAdminExportPDF = document.getElementById('btn-admin-export-pdf');
    if (btnAdminExportExcel) btnAdminExportExcel.addEventListener('click', () => exportToExcel(true));
    if (btnAdminExportPDF) btnAdminExportPDF.addEventListener('click', () => exportToPDF(true));

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // Quick Log Action
    document.getElementById('btn-quick-log').addEventListener('click', () => {
        switchView('logs');
        document.getElementById('log-date').focus();
    });

    // Timetable Day selection tabs
    const dayTabs = document.getElementById('timetable-day-tabs');
    dayTabs.addEventListener('click', (e) => {
        if (e.target.classList.contains('day-tab')) {
            // Remove active class from all tabs
            dayTabs.querySelectorAll('.day-tab').forEach(t => t.classList.remove('active'));
            // Add to clicked tab
            e.target.classList.add('active');
            AppState.selectedTimetableDay = parseInt(e.target.getAttribute('data-day'));
            renderTimetableView();
        }
    });

    // Timetable add session triggers
    document.getElementById('btn-add-schedule').addEventListener('click', () => openScheduleModal());
    document.getElementById('btn-close-schedule-modal').addEventListener('click', closeScheduleModal);
    document.getElementById('btn-cancel-schedule').addEventListener('click', closeScheduleModal);
    document.getElementById('schedule-session-form').addEventListener('submit', handleScheduleFormSubmit);

    // Study Log Form Submit
    document.getElementById('study-log-form').addEventListener('submit', handleLogFormSubmit);
    document.getElementById('btn-cancel-log-edit').addEventListener('click', cancelLogEdit);

    // Month filter for Logs
    document.getElementById('filter-log-month').addEventListener('input', renderLogsView);

    // Study Log Dynamic Dropdowns
    const logSubjectSelect = document.getElementById('log-subject-select');
    if (logSubjectSelect) {
        logSubjectSelect.addEventListener('change', () => {
            updateTopicAndNotesDropdowns();
        });
    }

    const logTopicSelect = document.getElementById('log-topic');
    if (logTopicSelect) {
        logTopicSelect.addEventListener('change', () => {
            handleLogTopicChange();
        });
    }

    // Handle clicks inside the modals (to close on backdrop click)
    document.getElementById('schedule-modal').addEventListener('click', (e) => {
        if (e.target.id === 'schedule-modal') closeScheduleModal();
    });

    // Setup Auth and File upload events
    setupAuthEvents();
    setupFileUploadEvents();

    // Week/Month Toggles for Dashboard breakdown & pie chart
    document.getElementById('btn-chart-week').addEventListener('click', () => setDashboardPeriod('week'));
    document.getElementById('btn-chart-month').addEventListener('click', () => setDashboardPeriod('month'));

    // Setup Admin Password Reset Form
    setupAdminResetPasswordEvent();

    // Dashboard theme switcher option list click handler
    const themeOptionsList = document.querySelector('.theme-options-list');
    if (themeOptionsList) {
        themeOptionsList.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-theme-select');
            if (btn) {
                const selectedTheme = btn.getAttribute('data-theme-val');
                changeTheme(selectedTheme);
            }
        });
    }
}

function setupAuthEvents() {
    const loginForm = document.getElementById('auth-login-form');
    const registerForm = document.getElementById('auth-register-form');
    const card = document.querySelector('.auth-card');
    const registerLink = document.querySelector('.register-link');
    const loginLink = document.querySelector('.login-link');

    registerLink.addEventListener('click', (e) => {
        e.preventDefault();
        card.classList.add('active');
    });

    loginLink.addEventListener('click', (e) => {
        e.preventDefault();
        card.classList.remove('active');
    });

    // Login Form Submit
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('login-name').value.trim();
        const pass = document.getElementById('login-password').value;
        const classGrade = document.getElementById('login-class').value.trim();
        const errorDiv = document.getElementById('login-error-msg');

        errorDiv.classList.add('hide');
        errorDiv.textContent = "";

        // Find user
        const user = AppState.users.find(u => u.username.toLowerCase() === name.toLowerCase());
        if (!user) {
            errorDiv.textContent = "Error: User not found!";
            errorDiv.classList.remove('hide');
            return;
        }

        if (user.passwordHash !== pass) {
            errorDiv.textContent = "Error: Incorrect password!";
            errorDiv.classList.remove('hide');
            return;
        }

        // Verify Class matches
        if (user.classGrade.toLowerCase() !== classGrade.toLowerCase()) {
            errorDiv.textContent = "Error: Class does not match registered details!";
            errorDiv.classList.remove('hide');
            return;
        }

        // Check Status
        if (user.status === 'pending') {
            errorDiv.textContent = "Account Pending Approval: An administrator must approve your registration first.";
            errorDiv.classList.remove('hide');
            return;
        } else if (user.status === 'deactivated') {
            errorDiv.textContent = "Account Deactivated: This account has been deactivated by the administrator.";
            errorDiv.classList.remove('hide');
            return;
        }

        // Login success
        AppState.currentUser = user;
        saveToLocalStorage('current_user');
        resetInactivityTimeout();
        
        // Clear form
        loginForm.reset();
        
        // Apply login state
        checkAuthState();
    });

    // Register Form Submit
    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('register-name').value.trim();
        const classGrade = document.getElementById('register-class').value.trim();
        const pass = document.getElementById('register-password').value;
        const confirmPass = document.getElementById('register-confirm-password').value;
        const errorDiv = document.getElementById('register-error-msg');
        const successDiv = document.getElementById('register-success-msg');

        errorDiv.classList.add('hide');
        errorDiv.textContent = "";
        successDiv.classList.add('hide');
        successDiv.textContent = "";

        if (pass !== confirmPass) {
            errorDiv.textContent = "Error: Passwords do not match!";
            errorDiv.classList.remove('hide');
            return;
        }

        if (name.toLowerCase() === 'admin') {
            errorDiv.textContent = "Error: Reserved username!";
            errorDiv.classList.remove('hide');
            return;
        }

        // Check duplicate
        const exists = AppState.users.some(u => u.username.toLowerCase() === name.toLowerCase());
        if (exists) {
            errorDiv.textContent = "Error: Username already exists!";
            errorDiv.classList.remove('hide');
            return;
        }

        // Register new user (status: pending)
        const newUser = {
            username: name,
            passwordHash: pass,
            classGrade: classGrade,
            role: 'student',
            status: 'pending'
        };

        AppState.users.push(newUser);
        saveToLocalStorage('users');

        successDiv.textContent = "Registration submitted! Your account is pending administrator approval.";
        successDiv.classList.remove('hide');

        // Reset form
        registerForm.reset();
    });

    // Logout Click
    document.getElementById('btn-logout').addEventListener('click', () => {
        if (confirm("Are you sure you want to logout?")) {
            AppState.currentUser = null;
            saveToLocalStorage('current_user');
            checkAuthState();
        }
    });
}

function setupFileUploadEvents() {
    const fileInput = document.getElementById('log-file');
    const previewContainer = document.getElementById('file-preview-container');
    const previewName = document.getElementById('file-preview-name');
    const removeBtn = document.getElementById('btn-remove-file');

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) {
            resetFileUploader();
            return;
        }

        // Limit file size to 1.5MB to avoid filling up LocalStorage
        if (file.size > 1.5 * 1024 * 1024) {
            alert("Error: File size too large! Please upload a notes file under 1.5 MB.");
            fileInput.value = "";
            resetFileUploader();
            return;
        }

        const reader = new FileReader();
        reader.onload = function(evt) {
            AppState.currentUploadedFile = {
                name: file.name,
                type: file.type,
                size: file.size,
                dataUrl: evt.target.result // Base64 data URL
            };
            
            // Show preview
            previewName.textContent = `${file.name} (${(file.size/1024).toFixed(1)} KB)`;
            previewContainer.classList.remove('hide');
        };
        
        reader.readAsDataURL(file);
    });

    removeBtn.addEventListener('click', () => {
        fileInput.value = "";
        resetFileUploader();
    });
}

function resetFileUploader() {
    AppState.currentUploadedFile = null;
    document.getElementById('file-preview-container').classList.add('hide');
    document.getElementById('file-preview-name').textContent = "";
}

function updateSubjectInputsForClass() {
    const user = AppState.currentUser;
    if (!user) return;
    
    const isSenior = (user.classGrade === '11th' || user.classGrade === '12th' || user.classGrade === 'Admin');
    
    const schedSelect = document.getElementById('schedule-subject-select');
    const schedInput = document.getElementById('schedule-subject-input');
    
    if (!schedSelect || !schedInput) return;
    
    if (isSenior) {
        schedSelect.classList.remove('hide');
        schedSelect.required = true;
        schedInput.classList.add('hide');
        schedInput.required = false;
        schedInput.value = '';
    } else {
        schedInput.classList.remove('hide');
        schedInput.required = true;
        schedSelect.classList.add('hide');
        schedSelect.required = false;
        schedSelect.value = '';
    }
}

function checkAuthState() {
    const gateway = document.getElementById('auth-gateway');
    if (!AppState.currentUser) {
        // Show auth modal gateway
        gateway.classList.remove('hide');
        // Hide sidebar and main content visibility
        document.querySelector('.app-container').style.display = 'none';
        
        // Reset logo back to project name
        document.getElementById('logo-text').textContent = 'Time Table Tracker';
        document.getElementById('logo-grade-badge').textContent = 'Grade 11';
        document.getElementById('logo-grade-badge').style.display = 'block';
        
        updateDocumentTitle('login');
    } else {
        // Hide auth modal gateway
        gateway.classList.add('hide');
        document.querySelector('.app-container').style.display = 'flex';

        // Update logo to reflect username and class Grade
        document.getElementById('logo-text').textContent = AppState.currentUser.username;
        if (AppState.currentUser.classGrade === 'Admin') {
            document.getElementById('logo-grade-badge').textContent = 'Admin';
        } else {
            document.getElementById('logo-grade-badge').textContent = `Class ${AppState.currentUser.classGrade}`;
        }

        // Update profile in sidebar
        document.getElementById('profile-name').textContent = AppState.currentUser.username;
        document.getElementById('profile-status').textContent = AppState.currentUser.classGrade;
        document.getElementById('profile-avatar').textContent = AppState.currentUser.username.charAt(0).toUpperCase();

        // Render admin panel and reports tab visibility
        const adminTab = document.getElementById('nav-admin');
        const reportsTab = document.getElementById('nav-reports');
        if (AppState.currentUser.role === 'admin') {
            adminTab.classList.remove('hide');
            if (reportsTab) reportsTab.classList.add('hide');
        } else {
            adminTab.classList.add('hide');
            if (reportsTab) reportsTab.classList.remove('hide');
            // If user is currently on admin panel view but is not admin, redirect to dashboard
            if (AppState.currentView === 'admin') {
                switchView('dashboard');
            }
        }

        // Render active view
        switchView(AppState.currentView);
        
        // Update subject input fields conditionally
        updateSubjectInputsForClass();
    }
}

function switchView(viewName) {
    AppState.currentView = viewName;

    // Toggle active class in nav items
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.getElementById(`nav-${viewName}`).classList.add('active');

    // Toggle visible view section
    document.querySelectorAll('.content-view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`view-${viewName}`).classList.add('active');

    // Update document title
    updateDocumentTitle(viewName);

    // Render logic specific to the view
    if (viewName === 'dashboard') {
        renderDashboardView();
    } else if (viewName === 'timetable') {
        renderTimetableView();
    } else if (viewName === 'logs') {
        renderLogsView();
    } else if (viewName === 'reports') {
        loadDatabase().then(() => {
            renderReportsView();
        });
    } else if (viewName === 'admin') {
        loadDatabase().then(() => {
            renderAdminView();
        });
    }
}

function updateDocumentTitle(viewName) {
    if (!AppState.currentUser) {
        document.title = "Login";
        return;
    }
    
    let title = "";
    switch (viewName) {
        case 'dashboard':
            title = "Dashboard";
            break;
        case 'timetable':
            title = "Timetable";
            break;
        case 'logs':
            title = "Study Logs";
            break;
        case 'reports':
            title = "Reports";
            break;
        case 'admin':
            title = "Admin Panel";
            break;
        case 'contact':
            title = "Contact";
            break;
        default:
            title = "Time Table Tracker";
    }
    document.title = title;
}

// --- DATE HELPERS ---
function updateHeaderDate() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = new Date().toLocaleDateString('en-US', options);
    document.getElementById('current-date-display').textContent = dateStr;

    // Set greeting based on time of day
    const hour = new Date().getHours();
    let greeting = "Crush your goals today!";
    if (hour < 12) greeting = "Good morning! Ready to learn?";
    else if (hour < 17) greeting = "Good afternoon! Keep the momentum going.";
    else greeting = "Good evening! Reflect and log your study hours.";
    
    document.getElementById('welcome-message').textContent = greeting;
}

// Returns start (Monday) and end (Sunday) of the current week
function getCurrentWeekRange() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 is Sunday, 1 is Monday, etc.
    
    const startOfWeek = new Date(today);
    // Adjust to find the Monday of this week
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startOfWeek.setDate(today.getDate() + diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return { start: startOfWeek, end: endOfWeek };
}

// Check if a YYYY-MM-DD string is within the current week
function isDateInCurrentWeek(dateStr) {
    const date = new Date(dateStr);
    const { start, end } = getCurrentWeekRange();
    return date >= start && date <= end;
}

// Check if a YYYY-MM-DD string is within the current month
function isDateInCurrentMonth(dateStr) {
    const d = new Date(dateStr);
    const today = new Date();
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
}

function getDayName(dayIndex) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayIndex];
}

// Parse "HH:MM" into decimal hours (e.g. "14:30" -> 14.5)
function timeStringToDecimal(timeStr) {
    const parts = timeStr.split(':');
    return parseInt(parts[0]) + (parseInt(parts[1]) / 60);
}

// Format decimal hours back to HH:MM format (e.g. 14.5 -> "14:30")
function decimalToTimeString(decimalHours) {
    const hrs = Math.floor(decimalHours);
    const mins = Math.round((decimalHours - hrs) * 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

// Format minutes into a nice string (e.g. 150 -> "2h 30m")
function formatMinutes(totalMins) {
    if (totalMins < 60) return `${totalMins}m`;
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

// Map subject names to color themes
function getSubjectColorClass(subject) {
    switch (subject) {
        case 'Physics': return 'physics-blue';
        case 'Chemistry': return 'chemistry-purple';
        case 'Mathematics': return 'math-red';
        case 'Biology': return 'biology-green';
        case 'English': return 'english-yellow';
        default: return 'other-gray';
    }
}

// Map subject names to stable CSS hex colors or dynamic HSL values for custom subjects
function getSubjectColorHex(subject) {
    switch (subject) {
        case 'Physics': return 'var(--color-physics)';
        case 'Chemistry': return 'var(--color-chemistry)';
        case 'Mathematics': return 'var(--color-math)';
        case 'Biology': return 'var(--color-biology)';
        case 'English': return 'var(--color-english)';
        default:
            if (!subject) return 'var(--color-other)';
            let hash = 0;
            for (let i = 0; i < subject.length; i++) {
                hash = subject.charCodeAt(i) + ((hash << 5) - hash);
            }
            const h = Math.abs(hash % 360);
            return `hsl(${h}, 75%, 55%)`;
    }
}

// --- THEME SWAPPER ---
function changeTheme(themeName) {
    AppState.theme = themeName;
    document.documentElement.setAttribute('data-theme', themeName);
    saveToLocalStorage('theme');
    
    // Update active class on dashboard switcher buttons
    updateDashboardThemeButtonsUI();
    
    // Update theme toggle button inside sidebar footer
    updateThemeToggleUI();
    
    // Redraw SVG charts to ensure fonts & grid colors match the new theme
    if (AppState.currentView === 'dashboard') {
        renderDashboardView();
    }
}

function toggleTheme() {
    const themes = ['dark', 'light', 'ocean', 'study', 'cyberpunk', 'minimal'];
    let index = themes.indexOf(AppState.theme);
    if (index === -1) index = 0;
    
    const nextIndex = (index + 1) % themes.length;
    changeTheme(themes[nextIndex]);
}

function updateThemeToggleUI() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    if (AppState.theme === 'dark') {
        btn.innerHTML = `<i class="fa-solid fa-sun"></i><span>Light Mode</span>`;
    } else if (AppState.theme === 'light') {
        btn.innerHTML = `<i class="fa-solid fa-water"></i><span>Ocean Breeze</span>`;
    } else if (AppState.theme === 'ocean') {
        btn.innerHTML = `<i class="fa-solid fa-tree"></i><span>Warm Forest</span>`;
    } else if (AppState.theme === 'study') {
        btn.innerHTML = `<i class="fa-solid fa-bolt"></i><span>Neon Sunset</span>`;
    } else if (AppState.theme === 'cyberpunk') {
        btn.innerHTML = `<i class="fa-solid fa-circle"></i><span>Minimalist</span>`;
    } else {
        btn.innerHTML = `<i class="fa-solid fa-moon"></i><span>Dark Space</span>`;
    }
}

function updateDashboardThemeButtonsUI() {
    const buttons = document.querySelectorAll('.btn-theme-select');
    buttons.forEach(btn => {
        if (btn.getAttribute('data-theme-val') === AppState.theme) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}


// --- DASHBOARD VIEW LOGIC ---
// Helpers for period-based tracking
function isDateInDaysRange(dateStr, numDays) {
    const date = new Date(dateStr);
    date.setHours(0,0,0,0);
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const timeDiff = today.getTime() - date.getTime();
    const diffDays = timeDiff / (1000 * 3600 * 24);
    
    return diffDays >= 0 && diffDays < numDays;
}

function getTargetMinutesForCurrentWeek() {
    let totalMins = 0;
    const sessions = AppState.userTimetable.filter(s => {
        if (s.date) {
            return isDateInCurrentWeek(s.date);
        }
        return true;
    });
    sessions.forEach(s => {
        const start = timeStringToDecimal(s.startTime);
        const end = timeStringToDecimal(s.endTime);
        totalMins += Math.round((end - start) * 60);
    });
    return totalMins;
}

function getTargetMinutesForCurrentMonth() {
    let totalMins = 0;
    const sessions = AppState.userTimetable.filter(s => {
        if (s.date) {
            return isDateInCurrentMonth(s.date);
        }
        return true;
    });
    sessions.forEach(s => {
        const start = timeStringToDecimal(s.startTime);
        const end = timeStringToDecimal(s.endTime);
        totalMins += Math.round((end - start) * 60);
    });
    return totalMins;
}

function getTargetMinutesForPastDays(numDays) {
    let totalTargetMins = 0;
    const today = new Date();
    today.setHours(0,0,0,0);
    
    for (let i = 0; i < numDays; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayOfWeek = d.getDay(); // 0 is Sunday, 1 is Monday, etc.
        
        // Find sessions for this day
        const sessions = AppState.userTimetable.filter(s => {
            if (s.date) {
                return s.date === dateStr;
            } else {
                return s.day === dayOfWeek;
            }
        });
        
        sessions.forEach(s => {
            const start = timeStringToDecimal(s.startTime);
            const end = timeStringToDecimal(s.endTime);
            totalTargetMins += Math.round((end - start) * 60);
        });
    }
    return totalTargetMins;
}

function setDashboardPeriod(period) {
    AppState.dashboardPeriod = period;
    
    // Update tab UI active classes
    const btnWeek = document.getElementById('btn-chart-week');
    const btnMonth = document.getElementById('btn-chart-month');
    if (btnWeek && btnMonth) {
        if (period === 'week') {
            btnWeek.classList.add('active');
            btnMonth.classList.remove('active');
        } else {
            btnMonth.classList.add('active');
            btnWeek.classList.remove('active');
        }
    }
    
    // Re-render dashboard
    renderDashboardView();
}

function renderSubjectPieChart(subjectMinutes) {
    const container = document.getElementById('pie-chart-container');
    if (!container) return;
    container.innerHTML = '';
    
    // Calculate total minutes
    let totalMins = 0;
    for (const sub in subjectMinutes) {
        totalMins += subjectMinutes[sub];
    }
    
    if (totalMins === 0) {
        container.innerHTML = `
            <svg viewBox="0 0 200 200" class="pie-chart-svg">
                <circle cx="100" cy="100" r="70" fill="transparent" stroke="var(--border-color)" stroke-width="20" />
                <circle cx="100" cy="100" r="60" class="pie-chart-center-bg" />
                <text x="100" y="95" class="pie-chart-total-val">0h</text>
                <text x="100" y="115" class="pie-chart-total-lbl">STUDIED</text>
            </svg>
        `;
        return;
    }
    
    const svgNamespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("viewBox", "0 0 200 200");
    svg.setAttribute("class", "pie-chart-svg");
    
    const r = 70;
    const cx = 100;
    const cy = 100;
    const C = 2 * Math.PI * r;
    
    let accumulatedAngle = 0;
    
    for (const [subject, minutes] of Object.entries(subjectMinutes)) {
        if (minutes <= 0) continue;
        
        const pct = minutes / totalMins;
        const angle = pct * 360;
        const dashOffset = C - (pct * C);
        
        const circle = document.createElementNS(svgNamespace, "circle");
        circle.setAttribute("cx", cx.toString());
        circle.setAttribute("cy", cy.toString());
        circle.setAttribute("r", r.toString());
        circle.setAttribute("class", "pie-chart-segment");
        
        let strokeColor = 'var(--color-other)';
        if (subject === 'Physics') strokeColor = 'var(--color-physics)';
        else if (subject === 'Chemistry') strokeColor = 'var(--color-chemistry)';
        else if (subject === 'Mathematics') strokeColor = 'var(--color-math)';
        else if (subject === 'Biology') strokeColor = 'var(--color-biology)';
        else if (subject === 'English') strokeColor = 'var(--color-english)';
        
        circle.setAttribute("stroke", strokeColor);
        circle.setAttribute("stroke-dasharray", `${C}`);
        circle.setAttribute("stroke-dashoffset", `${dashOffset}`);
        circle.setAttribute("transform", `rotate(${accumulatedAngle - 90} ${cx} ${cy})`);
        
        const title = document.createElementNS(svgNamespace, "title");
        title.textContent = `${subject}: ${formatMinutes(minutes)} (${Math.round(pct * 100)}%)`;
        circle.appendChild(title);
        
        svg.appendChild(circle);
        
        accumulatedAngle += angle;
    }
    
    const centerBg = document.createElementNS(svgNamespace, "circle");
    centerBg.setAttribute("cx", cx.toString());
    centerBg.setAttribute("cy", cy.toString());
    centerBg.setAttribute("r", "60");
    centerBg.setAttribute("class", "pie-chart-center-bg");
    svg.appendChild(centerBg);
    
    const totalHoursStr = (totalMins / 60).toFixed(1) + 'h';
    
    const valText = document.createElementNS(svgNamespace, "text");
    valText.setAttribute("x", cx.toString());
    valText.setAttribute("y", (cy - 5).toString());
    valText.setAttribute("class", "pie-chart-total-val");
    valText.textContent = totalHoursStr;
    svg.appendChild(valText);
    
    const lblText = document.createElementNS(svgNamespace, "text");
    lblText.setAttribute("x", cx.toString());
    lblText.setAttribute("y", (cy + 15).toString());
    lblText.setAttribute("class", "pie-chart-total-lbl");
    lblText.textContent = "STUDIED";
    svg.appendChild(lblText);
    
    container.appendChild(svg);
}

function setupAdminResetPasswordEvent() {
    const form = document.getElementById('admin-reset-pass-form');
    if (!form) return;
    
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const currPass = document.getElementById('admin-curr-pass').value;
        const newPass = document.getElementById('admin-new-pass').value;
        const confirmPass = document.getElementById('admin-confirm-pass').value;
        const errorDiv = document.getElementById('admin-pass-error-msg');
        const successDiv = document.getElementById('admin-pass-success-msg');
        
        errorDiv.classList.add('hide');
        errorDiv.textContent = "";
        successDiv.classList.add('hide');
        successDiv.textContent = "";
        
        const adminUser = AppState.users.find(u => u.username === 'admin');
        if (!adminUser) {
            errorDiv.textContent = "Error: Admin account not found!";
            errorDiv.classList.remove('hide');
            return;
        }
        
        if (adminUser.passwordHash !== currPass) {
            errorDiv.textContent = "Error: Incorrect current password!";
            errorDiv.classList.remove('hide');
            return;
        }
        
        if (newPass !== confirmPass) {
            errorDiv.textContent = "Error: New passwords do not match!";
            errorDiv.classList.remove('hide');
            return;
        }
        
        if (!newPass) {
            errorDiv.textContent = "Error: Password cannot be empty!";
            errorDiv.classList.remove('hide');
            return;
        }
        
        adminUser.passwordHash = newPass;
        if (AppState.currentUser && AppState.currentUser.username === 'admin') {
            AppState.currentUser.passwordHash = newPass;
            saveToLocalStorage('current_user');
        }
        
        saveToLocalStorage('users');
        
        successDiv.textContent = "Password updated successfully!";
        successDiv.classList.remove('hide');
        form.reset();
        
        renderAdminView();
    });
}

function renderDashboardView() {
    // 1. Calculate stats
    const timetable = AppState.userTimetable;
    const logs = AppState.userLogs;
    const period = AppState.dashboardPeriod;
    
    // Target Hours (sum of scheduled sessions in the current week/month)
    let totalTargetMinutes = 0;
    let periodLogs = [];
    
    if (period === 'week') {
        totalTargetMinutes = getTargetMinutesForCurrentWeek();
        periodLogs = logs.filter(log => isDateInCurrentWeek(log.date));
    } else {
        totalTargetMinutes = getTargetMinutesForCurrentMonth();
        periodLogs = logs.filter(log => isDateInCurrentMonth(log.date));
    }
    
    const targetHours = (totalTargetMinutes / 60).toFixed(1);

    // Actual Hours (sum of logged sessions in the period)
    let totalActualMinutes = 0;
    periodLogs.forEach(log => {
        totalActualMinutes += log.duration;
    });
    const actualHours = (totalActualMinutes / 60).toFixed(1);

    // Compliance Rate
    let compliance = 0;
    if (totalTargetMinutes > 0) {
        compliance = Math.min(100, Math.round((totalActualMinutes / totalTargetMinutes) * 100));
    } else if (totalActualMinutes > 0) {
        compliance = 100; // Logged study without timetable
    }

    // Top Subject (actual study hours in the period)
    const subjectMinutes = {};
    periodLogs.forEach(log => {
        subjectMinutes[log.subject] = (subjectMinutes[log.subject] || 0) + log.duration;
    });

    let topSubject = 'None';
    let topSubjectMinutes = 0;
    for (const sub in subjectMinutes) {
        if (subjectMinutes[sub] > topSubjectMinutes) {
            topSubject = sub;
            topSubjectMinutes = subjectMinutes[sub];
        }
    }

    // Update metrics UI elements
    document.getElementById('val-compliance').textContent = `${compliance}%`;
    document.getElementById('val-compliance-subtext').textContent = `${(totalActualMinutes/60).toFixed(1)} of ${(totalTargetMinutes/60).toFixed(1)} scheduled hrs`;
    document.getElementById('compliance-ring-text').textContent = `${compliance}%`;
    
    // Update SVG progress circle
    const circle = document.getElementById('compliance-ring');
    const radius = (circle && circle.r && circle.r.baseVal) ? circle.r.baseVal.value : 32;
    const circumference = 2 * Math.PI * radius; // Approx 201
    circle.style.strokeDasharray = `${circumference}`;
    const offset = circumference - (compliance / 100) * circumference;
    circle.style.strokeDashoffset = offset;

    document.getElementById('val-actual-hours').textContent = `${actualHours}h`;
    document.getElementById('val-actual-subtext').innerHTML = `<i class="fa-solid fa-arrow-up"></i> ${periodLogs.length} logs this ${period}`;

    document.getElementById('val-target-hours').textContent = `${targetHours}h`;
    document.getElementById('val-target-subtext').textContent = period === 'week' ? `Target for current week` : `Target for current month`;

    document.getElementById('val-top-subject').textContent = topSubject;
    document.getElementById('val-top-subject-time').textContent = topSubject === 'None' ? '0 mins logged' : `${formatMinutes(topSubjectMinutes)} logged`;

    // Update Card labels dynamically based on period
    const complianceCardLabel = document.querySelector('.metric-card:nth-child(1) .card-label');
    const actualCardLabel = document.querySelector('.metric-card:nth-child(2) .card-label');
    const targetCardLabel = document.querySelector('.metric-card:nth-child(3) .card-label');
    
    if (period === 'week') {
        if (complianceCardLabel) complianceCardLabel.textContent = "Weekly Compliance";
        if (actualCardLabel) actualCardLabel.textContent = "Actual Studied (Week)";
        if (targetCardLabel) targetCardLabel.textContent = "Target Schedule (Week)";
    } else {
        if (complianceCardLabel) complianceCardLabel.textContent = "Monthly Compliance";
        if (actualCardLabel) actualCardLabel.textContent = "Actual Studied (Month)";
        if (targetCardLabel) targetCardLabel.textContent = "Target Schedule (Month)";
    }

    // Render Charts
    renderDashboardCharts();
    
    // Render Today's schedule execution
    renderTodayScheduleCard();

    // Render Missed Schedules alerts
    renderMissedSchedulesDashboard();

    // Render Subject-wise breakdown list
    renderSubjectBreakdownList(subjectMinutes);

    // Render Subject-wise SVG Donut/Pie Chart
    renderSubjectPieChart(subjectMinutes);
}

function renderMissedSchedulesDashboard() {
    if (!AppState.currentUser) return;
    const missedSessions = getMissedSessionsForUser(AppState.currentUser.username, AppState.timetable, AppState.logs);
    const missedCard = document.getElementById('missed-schedules-dashboard-card');
    const missedContainer = document.getElementById('missed-schedules-dashboard-container');
    const missedBadge = document.getElementById('missed-schedules-dashboard-badge');
    
    if (missedCard && missedContainer && missedBadge) {
        if (missedSessions.length === 0) {
            missedBadge.textContent = `0 Missed`;
            missedContainer.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 24px; color: var(--text-secondary);">
                    <i class="fa-solid fa-circle-check" style="color: var(--accent-success, #10b981); font-size: 2rem; margin-bottom: 8px;"></i>
                    <p style="font-weight: 600; font-size: 0.95rem; margin: 0; color: var(--text-primary);">All schedules caught up!</p>
                    <p style="font-size: 0.8rem; margin: 4px 0 0 0;">You have logged study hours for all past sessions.</p>
                </div>
            `;
        } else {
            missedBadge.textContent = `${missedSessions.length} Missed`;
            
            missedContainer.innerHTML = '';
            missedSessions.forEach(session => {
                const item = document.createElement('div');
                item.className = 'log-item-card';
                item.style.borderLeft = `4px solid ${getSubjectColorHex(session.subject)}`;
                item.style.background = 'rgba(239, 68, 68, 0.02)';
                item.innerHTML = `
                    <div class="log-item-info" style="width: 100%;">
                        <div class="log-subject-line" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <span class="log-item-subject" style="color: ${getSubjectColorHex(session.subject)}; font-weight: 700;">${session.subject}</span>
                            <span style="display: flex; align-items: center; gap: 8px;">
                                <span style="color: #ef4444; font-size: 0.75rem; font-weight: 800; background: rgba(239, 68, 68, 0.1); padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-flag"></i> Missed</span>
                                <span class="log-item-duration" style="font-size: 0.8rem; color: var(--text-secondary);">${session.startTime} - ${session.endTime}</span>
                            </span>
                        </div>
                        <div style="font-size:0.75rem; color:var(--text-secondary); margin-top: 2px;">Scheduled Date: ${session.date}</div>
                        <div class="log-item-topic" style="margin-top: 4px; font-size: 0.85rem;">Topic: ${session.lesson || 'General Study'}</div>
                    </div>
                `;
                missedContainer.appendChild(item);
            });
        }
    }
}

function renderDashboardCharts() {
    const container = document.getElementById('bar-chart-container');
    container.innerHTML = ''; // Clear existing chart

    // Prepare data for Mon-Sun (days 1 to 6, then 0 for Sunday)
    const dayIndices = [1, 2, 3, 4, 5, 6, 0]; // Mon to Sun order
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    
    // Calculate targets per day
    const dailyTargets = {};
    dayIndices.forEach(d => dailyTargets[d] = 0);
    const currentWeekSessions = AppState.userTimetable.filter(s => s.date ? isDateInCurrentWeek(s.date) : true);
    currentWeekSessions.forEach(s => {
        const duration = timeStringToDecimal(s.endTime) - timeStringToDecimal(s.startTime);
        dailyTargets[s.day] = (dailyTargets[s.day] || 0) + duration;
    });

    // Calculate actual hours logged per day in the current week
    const dailyActuals = {};
    dayIndices.forEach(d => dailyActuals[d] = 0);
    
    const todayRange = getCurrentWeekRange();
    const currentWeekLogs = AppState.userLogs.filter(log => isDateInCurrentWeek(log.date));
    
    currentWeekLogs.forEach(log => {
        const logDate = new Date(log.date);
        const day = logDate.getDay();
        dailyActuals[day] = (dailyActuals[day] || 0) + (log.duration / 60);
    });

    // Find max value to scale Y axis (minimum 4 hours scale)
    let maxVal = 4;
    dayIndices.forEach(d => {
        maxVal = Math.max(maxVal, dailyTargets[d], dailyActuals[d]);
    });
    maxVal = Math.ceil(maxVal);

    // SVG Chart dimensions
    const width = 500;
    const height = 240;
    const padding = { top: 20, right: 20, bottom: 30, left: 40 };
    
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Create SVG Element
    const svgNamespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    // Add Gradients
    const defs = document.createElementNS(svgNamespace, "defs");
    defs.innerHTML = `
        <linearGradient id="bar-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--accent-primary)" />
            <stop offset="100%" stop-color="#4f46e5" />
        </linearGradient>
    `;
    svg.appendChild(defs);

    // Draw Y Axis gridlines and labels
    const gridTicks = 4;
    for (let i = 0; i <= gridTicks; i++) {
        const val = (maxVal / gridTicks) * i;
        const y = padding.top + chartH - (val / maxVal) * chartH;
        
        // Gridline
        if (i > 0) {
            const line = document.createElementNS(svgNamespace, "line");
            line.setAttribute("x1", padding.left);
            line.setAttribute("y1", y);
            line.setAttribute("x2", padding.left + chartW);
            line.setAttribute("y2", y);
            line.setAttribute("class", "chart-grid-line");
            svg.appendChild(line);
        }

        // Label
        const text = document.createElementNS(svgNamespace, "text");
        text.setAttribute("x", padding.left - 10);
        text.setAttribute("y", y + 4);
        text.setAttribute("text-anchor", "end");
        text.setAttribute("class", "chart-text");
        text.textContent = val.toFixed(1) + "h";
        svg.appendChild(text);
    }

    // Draw X Axis line
    const xAxis = document.createElementNS(svgNamespace, "line");
    xAxis.setAttribute("x1", padding.left);
    xAxis.setAttribute("y1", padding.top + chartH);
    xAxis.setAttribute("x2", padding.left + chartW);
    xAxis.setAttribute("y2", padding.top + chartH);
    xAxis.setAttribute("class", "chart-axis");
    svg.appendChild(xAxis);

    // Render Bars
    const groupWidth = chartW / dayIndices.length;
    const barWidth = Math.max(6, groupWidth * 0.3);
    const barSpacing = 3;

    dayIndices.forEach((day, index) => {
        const targetVal = dailyTargets[day];
        const actualVal = dailyActuals[day];
        
        // Midpoint of this day group
        const groupX = padding.left + (index * groupWidth) + (groupWidth / 2);

        // 1. Target Bar (left)
        if (targetVal > 0) {
            const barH = (targetVal / maxVal) * chartH;
            const rect = document.createElementNS(svgNamespace, "rect");
            rect.setAttribute("x", groupX - barWidth - barSpacing/2);
            rect.setAttribute("y", padding.top + chartH - barH);
            rect.setAttribute("width", barWidth);
            rect.setAttribute("height", barH);
            rect.setAttribute("class", "chart-bar-target");
            
            // Tooltip
            const title = document.createElementNS(svgNamespace, "title");
            title.textContent = `Scheduled: ${targetVal.toFixed(1)} hrs`;
            rect.appendChild(title);
            
            svg.appendChild(rect);
        }

        // 2. Actual Bar (right)
        if (actualVal > 0) {
            const barH = (actualVal / maxVal) * chartH;
            const rect = document.createElementNS(svgNamespace, "rect");
            rect.setAttribute("x", groupX + barSpacing/2);
            rect.setAttribute("y", padding.top + chartH - barH);
            rect.setAttribute("width", barWidth);
            rect.setAttribute("height", barH);
            rect.setAttribute("class", "chart-bar-actual");

            // Tooltip
            const title = document.createElementNS(svgNamespace, "title");
            title.textContent = `Actual Studied: ${actualVal.toFixed(1)} hrs`;
            rect.appendChild(title);

            svg.appendChild(rect);
        }

        // 3. Day label below axis
        const text = document.createElementNS(svgNamespace, "text");
        text.setAttribute("x", groupX);
        text.setAttribute("y", padding.top + chartH + 20);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("class", "chart-text");
        text.textContent = dayLabels[index];
        svg.appendChild(text);
    });

    container.appendChild(svg);
}

function renderTodayScheduleCard() {
    const container = document.getElementById('today-schedule-container');
    const badge = document.getElementById('today-schedule-badge');
    container.innerHTML = '';

    const todayDayIndex = new Date().getDay(); // 0-6
    const todayDateStr = new Date().toISOString().split('T')[0];

    // Find timetable sessions scheduled for today
    const todaySessions = AppState.userTimetable.filter(s => s.day == todayDayIndex);
    
    // Find logs entered for today's date
    const todayLogs = AppState.userLogs.filter(log => log.date === todayDateStr);

    badge.textContent = `${todaySessions.length} session${todaySessions.length === 1 ? '' : 's'}`;

    if (todaySessions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-mug-hot"></i>
                <p>No study sessions scheduled for today!</p>
                <p style="font-size:0.75rem; margin-top:4px;">Take a break or update your timetable.</p>
            </div>
        `;
        return;
    }

    // Sort today's sessions by start time
    todaySessions.sort((a, b) => a.startTime.localeCompare(b.startTime));

    todaySessions.forEach(session => {
        // Check if this session was "completed/logged" (Actual log matching the subject on today's date)
        const isLogged = todayLogs.some(log => log.subject.toLowerCase() === session.subject.toLowerCase());

        const item = document.createElement('div');
        const colorHex = getSubjectColorHex(session.subject);
        item.className = `today-item ${isLogged ? 'status-done' : ''}`;
        item.style.borderLeft = `4px solid ${colorHex}`;
        item.innerHTML = `
            <div class="today-check" title="${isLogged ? 'Completed' : 'Pending'}">
                <i class="fa-solid fa-check"></i>
            </div>
            <div class="today-info">
                <div class="today-title" style="color: ${colorHex}; font-weight: 600;">${session.subject}</div>
                <div class="today-time">${session.startTime} - ${session.endTime} ${session.lesson ? '• ' + session.lesson : ''} ${session.notes ? '(' + session.notes + ')' : ''}</div>
            </div>
        `;

        container.appendChild(item);
    });
}

function renderSubjectBreakdownList(subjectMinutes) {
    const container = document.getElementById('subject-distribution-container');
    container.innerHTML = '';

    // Calculate total actual minutes this week to find percentage
    let totalMins = 0;
    for (const sub in subjectMinutes) {
        totalMins += subjectMinutes[sub];
    }

    if (totalMins === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-book-open"></i>
                <p>No study hours logged yet this week.</p>
            </div>
        `;
        return;
    }

    // Sort subjects by study time desc
    const sortedSubjects = Object.entries(subjectMinutes).sort((a, b) => b[1] - a[1]);

    sortedSubjects.forEach(([subject, minutes]) => {
        const pct = Math.round((minutes / totalMins) * 100);
        const colorHex = getSubjectColorHex(subject);

        const item = document.createElement('div');
        item.className = 'subject-progress-item';
        item.innerHTML = `
            <div class="sub-prog-header">
                <span class="font-bold">${subject}</span>
                <span class="text-secondary">${formatMinutes(minutes)} (${pct}%)</span>
            </div>
            <div class="sub-prog-bar-container">
                <div class="sub-prog-bar" style="width: ${pct}%; background-color: ${colorHex} !important;"></div>
            </div>
        `;
        container.appendChild(item);
    });
}


// --- TIMETABLE VIEW LOGIC ---
function renderTimetableView() {
    const dayVal = AppState.selectedTimetableDay;
    document.getElementById('timetable-day-title').textContent = `${getDayName(dayVal)}'s Schedule`;

    // Render detailed CRUD list
    renderTimetableDetailedList(dayVal);

    // Render 24h Visual timeline representation
    renderTimetableTimeline(dayVal);
}

function renderTimetableDetailedList(dayVal) {
    const container = document.getElementById('timetable-list-container');
    container.innerHTML = '';

    // Filter sessions for selected day
    const daySessions = AppState.userTimetable.filter(s => s.day == dayVal);

    if (daySessions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-calendar-xmark"></i>
                <p>No study sessions scheduled for this day.</p>
                <p style="font-size:0.75rem; margin-top:4px;">Tap "Add Session" to set your targets.</p>
            </div>
        `;
        return;
    }

    // Sort by start time
    daySessions.sort((a, b) => a.startTime.localeCompare(b.startTime));

    daySessions.forEach(session => {
        const card = document.createElement('div');
        const colorHex = getSubjectColorHex(session.subject);
        card.className = `session-crud-card`;
        card.style.borderLeft = `5px solid ${colorHex}`;
        card.innerHTML = `
            <div class="session-crud-info">
                <div class="session-subject-row">
                    <span class="session-subject" style="color: ${colorHex};">${session.subject}</span>
                    <span class="session-time-badge">${session.startTime} - ${session.endTime}</span>
                </div>
                <div class="session-meta-row" style="font-size: 0.8rem; margin: 4px 0; color: var(--text-secondary);">
                    <i class="fa-solid fa-calendar-day" style="margin-right: 4px;"></i>${session.date || ''} &nbsp;&bull;&nbsp; 
                    <i class="fa-solid fa-graduation-cap" style="margin-right: 4px;"></i><strong>Topic:</strong> ${session.lesson || 'General Study'}
                </div>
                <div class="session-notes" style="font-size: 0.75rem; opacity: 0.85;">${session.notes || 'No notes added'}</div>
            </div>
            <div class="session-actions-btns">
                <button class="btn btn-secondary btn-icon btn-edit-schedule" data-id="${session.id}" title="Edit">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn-danger btn-icon btn-delete-schedule" data-id="${session.id}" title="Delete">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;

        // Wire buttons
        card.querySelector('.btn-edit-schedule').addEventListener('click', () => openScheduleModal(session.id));
        card.querySelector('.btn-delete-schedule').addEventListener('click', () => deleteScheduleSession(session.id));

        container.appendChild(card);
    });
}

function renderTimetableTimeline(dayVal) {
    const container = document.getElementById('timetable-timeline');
    container.innerHTML = '';

    const daySessions = AppState.userTimetable.filter(s => s.day == dayVal);

    // Timeline spans from 6:00 (6 AM) to 23:00 (11 PM) to focus on study hours
    const START_HOUR = 6;
    const END_HOUR = 23;
    const TOTAL_HOURS = END_HOUR - START_HOUR;
    const ROW_HEIGHT = 45; // Height in px for 1 hour

    // Set timeline container height
    container.style.height = `${TOTAL_HOURS * ROW_HEIGHT}px`;

    // 1. Render hour markers and grid lines
    for (let h = START_HOUR; h <= END_HOUR; h++) {
        const topPos = (h - START_HOUR) * ROW_HEIGHT;
        
        // Hour marker label
        const marker = document.createElement('div');
        marker.className = 'timeline-hour-marker';
        const formattedHour = h > 12 ? `${h - 12} PM` : h === 12 ? '12 PM' : `${h} AM`;
        marker.textContent = formattedHour;
        marker.style.top = `${topPos}px`;
        container.appendChild(marker);
        
        // Gridline
        const gridLine = document.createElement('div');
        gridLine.className = 'timeline-grid-line';
        gridLine.style.top = `${topPos}px`;
        container.appendChild(gridLine);
    }

    // 2. Render visual sessions as absolute elements inside the timeline
    daySessions.forEach(session => {
        const startDec = timeStringToDecimal(session.startTime);
        const endDec = timeStringToDecimal(session.endTime);

        // Clamp session hours into visual range (6 AM to 11 PM)
        const displayStart = Math.max(START_HOUR, startDec);
        const displayEnd = Math.min(END_HOUR, endDec);

        if (displayEnd > displayStart) {
            const topPos = (displayStart - START_HOUR) * ROW_HEIGHT;
            const heightSize = (displayEnd - displayStart) * ROW_HEIGHT;

            const sessionDiv = document.createElement('div');
            const colorHex = getSubjectColorHex(session.subject);
            sessionDiv.className = `timeline-visual-session`;
            
            sessionDiv.style.backgroundColor = `color-mix(in srgb, ${colorHex} 15%, transparent)`;
            sessionDiv.style.borderLeft = `4px solid ${colorHex}`;
            sessionDiv.style.top = `${topPos}px`;
            sessionDiv.style.height = `${heightSize}px`;

            sessionDiv.innerHTML = `
                <div class="timeline-session-title" style="color: ${colorHex}; font-weight: 700;">${session.subject}</div>
                <div class="timeline-session-lesson" style="font-size: 0.75rem; font-weight: 600; opacity: 0.9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 2px 0;" title="${session.lesson || ''}">${session.lesson || ''}</div>
                <div class="timeline-session-time">${session.startTime} - ${session.endTime}</div>
            `;

            container.appendChild(sessionDiv);
        }
    });
}

// --- TIMETABLE CRUD OPERATIONS ---
function openScheduleModal(id = null) {
    const modal = document.getElementById('schedule-modal');
    const form = document.getElementById('schedule-session-form');
    const title = document.getElementById('schedule-modal-title');
    
    form.reset();
    AppState.editingScheduleId = id;

    const user = AppState.currentUser;
    const isSenior = (user && (user.classGrade === '11th' || user.classGrade === '12th' || user.classGrade === 'Admin'));

    if (id) {
        // Editing Mode
        title.textContent = "Edit Timetable Session";
        const session = AppState.userTimetable.find(s => s.id === id);
        if (session) {
            document.getElementById('schedule-date').value = session.date || '';
            document.getElementById('schedule-date').min = new Date().toISOString().split('T')[0];
            
            if (isSenior) {
                document.getElementById('schedule-subject-select').value = session.subject;
                document.getElementById('schedule-subject-input').value = '';
            } else {
                document.getElementById('schedule-subject-input').value = session.subject;
                document.getElementById('schedule-subject-select').value = '';
            }

            document.getElementById('schedule-start-time').value = session.startTime;
            document.getElementById('schedule-end-time').value = session.endTime;
            document.getElementById('schedule-lesson').value = session.lesson || '';
            document.getElementById('schedule-notes').value = session.notes || '';
            
            // Check correct radio button
            const radio = form.querySelector(`input[name="schedule-color"][value="${session.color}"]`);
            if (radio) radio.checked = true;
        }
    } else {
        // Add Mode
        title.textContent = "Add Timetable Session";
        
        const todayStr = new Date().toISOString().split('T')[0];
        let defaultDate = getDateOfCurrentWeek(AppState.selectedTimetableDay);
        if (defaultDate < todayStr) {
            defaultDate = todayStr;
        }
        document.getElementById('schedule-date').value = defaultDate;
        document.getElementById('schedule-date').min = todayStr;
        
        document.getElementById('schedule-start-time').value = "16:00";
        document.getElementById('schedule-end-time').value = "17:30";
        document.getElementById('schedule-lesson').value = "";
        document.getElementById('schedule-notes').value = "";
        
        document.getElementById('schedule-subject-select').value = "";
        document.getElementById('schedule-subject-input').value = "";
    }

    modal.classList.add('show');
}

function closeScheduleModal() {
    const modal = document.getElementById('schedule-modal');
    modal.classList.remove('show');
    AppState.editingScheduleId = null;
}

function handleScheduleFormSubmit(e) {
    e.preventDefault();

    const date = document.getElementById('schedule-date').value;
    
    const user = AppState.currentUser;
    const isSenior = (user && (user.classGrade === '11th' || user.classGrade === '12th' || user.classGrade === 'Admin'));
    const subject = isSenior 
        ? document.getElementById('schedule-subject-select').value 
        : document.getElementById('schedule-subject-input').value.trim();

    if (!subject) {
        alert("Please enter or select a subject.");
        return;
    }

    const startTime = document.getElementById('schedule-start-time').value;
    const endTime = document.getElementById('schedule-end-time').value;
    const lesson = document.getElementById('schedule-lesson').value;
    const notes = document.getElementById('schedule-notes').value;
    
    // Find active color picker checked
    const color = document.querySelector('input[name="schedule-color"]:checked').value;

    // Validation: Restrict past dates (back dates)
    const todayStr = new Date().toISOString().split('T')[0];
    if (date < todayStr) {
        alert("Error: You cannot select or save entries for past dates!");
        return;
    }

    // Validation: end time > start time
    if (startTime >= endTime) {
        alert("Error: Start time must be before end time!");
        return;
    }

    // Calculate day index from date
    const day = getDayFromDate(date);
    const username = AppState.currentUser ? AppState.currentUser.username : 'unknown';

    if (AppState.editingScheduleId) {
        // Update existing
        const index = AppState.timetable.findIndex(s => s.id === AppState.editingScheduleId);
        if (index !== -1) {
            const oldSession = AppState.timetable[index];
            AppState.timetable[index] = {
                id: AppState.editingScheduleId,
                username: oldSession.username || username,
                day, date, subject, startTime, endTime, color, lesson, notes
            };
        }
    } else {
        // Create new
        const newSession = {
            id: 't_' + Date.now(),
            username,
            day, date, subject, startTime, endTime, color, lesson, notes
        };
        AppState.timetable.push(newSession);
    }

    // Autofill 'Log Study Session' form fields with this timetable session's data (New or Edited)
    document.getElementById('log-date').value = date;
    const start = timeStringToDecimal(startTime);
    const end = timeStringToDecimal(endTime);
    const durationMins = Math.round((end - start) * 60);
    document.getElementById('log-duration').value = durationMins;

    // Re-populate dropdowns including the new session, and select its details
    populateStudyLogDropdowns(subject, lesson || '', notes || '');

    saveToLocalStorage('timetable');
    
    // Automatically switch tabs to the day of the week for the added/edited date
    AppState.selectedTimetableDay = day;
    // Sync day selector tabs UI
    const dayTabs = document.getElementById('timetable-day-tabs');
    dayTabs.querySelectorAll('.day-tab').forEach(tab => {
        if (parseInt(tab.getAttribute('data-day')) === AppState.selectedTimetableDay) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    closeScheduleModal();
    renderTimetableView();
    
    // If on dashboard, update stats too
    if (AppState.currentView === 'dashboard') {
        renderDashboardView();
    }
}

function deleteScheduleSession(id) {
    if (confirm("Are you sure you want to delete this study session from your timetable?")) {
        AppState.timetable = AppState.timetable.filter(s => s.id !== id);
        saveToLocalStorage('timetable');
        renderTimetableView();
    }
}


// --- STUDY LOGS VIEW LOGIC & CRUD ---
function renderLogsView() {
    // Populate dynamic dropdown selections
    populateStudyLogDropdowns();

    // 1. Render history list
    const container = document.getElementById('log-history-container');
    container.innerHTML = '';

    const filterMonth = document.getElementById('filter-log-month').value; // YYYY-MM

    // Filter logs by the selected month
    let filteredLogs = AppState.userLogs;
    if (filterMonth) {
        filteredLogs = AppState.userLogs.filter(log => log.date.slice(0, 7) === filterMonth);
    }

    if (filteredLogs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-receipt"></i>
                <p>No study logs found for the selected period.</p>
                <p style="font-size:0.75rem; margin-top:4px;">Fill out the form on the left to log your actual hours!</p>
            </div>
        `;
        return;
    }

    // Sort logs by date desc, then by id/time desc
    filteredLogs.sort((a, b) => b.date.localeCompare(a.date));

    // Group logs by date
    const groupedLogs = {};
    filteredLogs.forEach(log => {
        if (!groupedLogs[log.date]) {
            groupedLogs[log.date] = [];
        }
        groupedLogs[log.date].push(log);
    });

    // Render groups
    for (const dateStr in groupedLogs) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'log-date-group';

        // Format date header nicely
        const dateObj = new Date(dateStr);
        const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
        const displayDate = dateObj.toLocaleDateString('en-US', options);

        groupDiv.innerHTML = `<div class="log-group-title">${displayDate}</div>`;

        groupedLogs[dateStr].forEach(log => {
            const item = document.createElement('div');
            const colorHex = getSubjectColorHex(log.subject);
            item.className = 'log-item-card';
            item.style.borderLeft = `4px solid ${colorHex}`;
            
            let attachmentHtml = '';
            if (log.attachment) {
                attachmentHtml = `
                    <div style="margin-top: 4px;">
                        <a href="${log.attachment.dataUrl}" download="${log.attachment.name}" class="log-attachment-badge" title="Click to download material">
                            <i class="fa-solid fa-file-arrow-down"></i> ${log.attachment.name} (${(log.attachment.size/1024).toFixed(1)} KB)
                        </a>
                    </div>
                `;
            }

            item.innerHTML = `
                <div class="log-item-info">
                    <div class="log-subject-line">
                        <span class="log-item-subject" style="color: ${colorHex}; font-weight: 700;">${log.subject}</span>
                        <span class="log-item-duration">${formatMinutes(log.duration)}</span>
                    </div>
                    <div class="log-item-topic" title="${log.topic}">${log.topic}</div>
                    ${attachmentHtml}
                </div>
                <div class="session-actions-btns">
                    <button class="btn btn-secondary btn-icon btn-edit-log" data-id="${log.id}" title="Edit Log">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn btn-danger btn-icon btn-delete-log" data-id="${log.id}" title="Delete Log">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;

            // Wire actions
            item.querySelector('.btn-edit-log').addEventListener('click', () => editLogEntry(log.id));
            item.querySelector('.btn-delete-log').addEventListener('click', () => deleteLogEntry(log.id));

            groupDiv.appendChild(item);
        });

        container.appendChild(groupDiv);
    }
}

function handleLogFormSubmit(e) {
    e.preventDefault();

    const date = document.getElementById('log-date').value;
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (date !== todayStr) {
        alert("Error: You can only log study hours for the current active day (today)!");
        return;
    }
    const subject = document.getElementById('log-subject-select').value;
    const duration = parseInt(document.getElementById('log-duration').value);
    const topic = document.getElementById('log-topic').value;
    const notes = document.getElementById('log-notes').value || '';
    const attachment = AppState.currentUploadedFile || null;

    if (!subject) {
        alert("Please select a subject.");
        return;
    }

    if (!topic) {
        alert("Please select a topic covered.");
        return;
    }

    const username = AppState.currentUser ? AppState.currentUser.username : 'unknown';

    if (AppState.editingLogId) {
        // Edit log entry
        const index = AppState.logs.findIndex(log => log.id === AppState.editingLogId);
        if (index !== -1) {
            const oldLog = AppState.logs[index];
            AppState.logs[index] = {
                id: AppState.editingLogId,
                username: oldLog.username || username,
                date, subject, duration, topic, notes,
                attachment: attachment || oldLog.attachment
            };
        }
        cancelLogEdit(); // Reset form/state
    } else {
        // Add new log entry
        const newLog = {
            id: 'l_' + Date.now(),
            username,
            date, subject, duration, topic, notes,
            attachment: attachment
        };
        AppState.logs.push(newLog);
        
        // Reset form inputs
        document.getElementById('log-duration').value = "";
        document.getElementById('log-file').value = "";
        
        // Reset dynamic dropdown selections
        populateStudyLogDropdowns();
    }

    saveToLocalStorage('logs');
    renderLogsView();
}

function editLogEntry(id) {
    const log = AppState.userLogs.find(l => l.id === id);
    if (!log) return;

    AppState.editingLogId = id;

    // Load values into form
    document.getElementById('log-id').value = log.id;
    document.getElementById('log-date').value = log.date;
    document.getElementById('log-duration').value = log.duration;

    // Populate dropdowns with log's saved values selected, even if they aren't in current timetable
    populateStudyLogDropdowns(log.subject, log.topic, log.notes || '');

    if (log.attachment) {
        AppState.currentUploadedFile = log.attachment;
        document.getElementById('file-preview-name').textContent = `${log.attachment.name} (${(log.attachment.size/1024).toFixed(1)} KB)`;
        document.getElementById('file-preview-container').classList.remove('hide');
    } else {
        resetFileUploader();
    }

    // Show cancel edit button, change submit text
    document.getElementById('btn-submit-log').innerHTML = `<i class="fa-solid fa-check"></i> Update Log`;
    document.getElementById('btn-cancel-log-edit').classList.remove('hide');

    // Scroll form into view for mobile devices
    document.getElementById('study-log-form').scrollIntoView({ behavior: 'smooth' });
}

function cancelLogEdit() {
    AppState.editingLogId = null;

    // Reset Form
    document.getElementById('log-id').value = "";
    document.getElementById('log-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('log-duration').value = "";
    document.getElementById('log-file').value = "";

    // Reset Dropdowns
    populateStudyLogDropdowns();
    
    // Reset buttons
    document.getElementById('btn-submit-log').innerHTML = `<i class="fa-solid fa-check"></i> Save Log`;
    document.getElementById('btn-cancel-log-edit').classList.add('hide');

    resetFileUploader();
}

function deleteLogEntry(id) {
    if (confirm("Are you sure you want to delete this study log entry?")) {
        AppState.logs = AppState.logs.filter(log => log.id !== id);
        saveToLocalStorage('logs');
        
        // If we are currently editing the log we are deleting, cancel the edit
        if (AppState.editingLogId === id) {
            cancelLogEdit();
        }

        renderLogsView();
    }
}

// --- ADMIN PANEL VIEW LOGIC ---
function renderAdminView() {
    const container = document.getElementById('admin-users-list');
    const badge = document.getElementById('admin-pending-badge');
    container.innerHTML = '';

    // Filter out the 'admin' itself to avoid self-management
    const listableUsers = AppState.users.filter(u => u.username !== 'admin');
    const pendingUsers = listableUsers.filter(u => u.status === 'pending');

    badge.textContent = `${pendingUsers.length} pending`;

    if (listableUsers.length === 0) {
        container.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 30px; color: var(--text-secondary);">
                    <i class="fa-solid fa-users" style="font-size: 2rem; display: block; margin-bottom: 8px; opacity: 0.5;"></i>
                    No other users registered yet.
                </td>
            </tr>
        `;
        return;
    }

    listableUsers.forEach(u => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-color)';
        
        let statusClass = 'pending';
        let statusLabel = 'Pending';
        
        if (u.status === 'approved') {
            statusClass = 'approved';
            statusLabel = 'Approved';
        } else if (u.status === 'deactivated') {
            statusClass = 'pending';
            statusLabel = 'Deactivated';
        }

        // Action buttons based on status
        let actionButtonsHtml = '';
        if (u.status === 'pending') {
            actionButtonsHtml = `
                <button class="btn btn-primary btn-approve" data-username="${u.username}" style="padding: 6px 12px; font-size: 0.8rem;">
                    <i class="fa-solid fa-user-check"></i> Approve
                </button>
            `;
        } else if (u.status === 'approved') {
            actionButtonsHtml = `
                <button class="btn btn-danger btn-deactivate" data-username="${u.username}" style="padding: 6px 12px; font-size: 0.8rem;">
                    <i class="fa-solid fa-user-slash"></i> Deactivate
                </button>
            `;
        } else if (u.status === 'deactivated') {
            actionButtonsHtml = `
                <button class="btn btn-success btn-activate" data-username="${u.username}" style="padding: 6px 12px; font-size: 0.8rem; background-color: var(--color-biology); color: white;">
                    <i class="fa-solid fa-user-check"></i> Activate
                </button>
            `;
        }

        tr.innerHTML = `
            <td style="padding: 14px 12px; font-weight: 600;">${u.username}</td>
            <td style="padding: 14px 12px; color: var(--text-secondary);">${u.classGrade}</td>
            <td style="padding: 14px 12px; font-family: monospace; letter-spacing: 0.5px;">${u.passwordHash}</td>
            <td style="padding: 14px 12px; text-transform: capitalize;">${u.role}</td>
            <td style="padding: 14px 12px;">
                <span class="status-badge ${statusClass}" ${u.status === 'deactivated' ? 'style="background-color:rgba(239,68,68,0.1); color:var(--color-math);"' : ''}>${statusLabel}</span>
            </td>
            <td style="padding: 14px 12px; text-align: right;">
                <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
                    ${actionButtonsHtml}
                    <button class="btn btn-danger btn-delete-user" data-username="${u.username}" style="padding: 6px 10px; font-size: 0.8rem; background-color: var(--color-math); color: white;" title="Delete User">
                        <i class="fa-solid fa-trash"></i> Delete
                    </button>
                </div>
            </td>
        `;

        // Wire buttons
        if (u.status === 'pending') {
            tr.querySelector('.btn-approve').addEventListener('click', () => toggleUserStatus(u.username, 'approved'));
        } else if (u.status === 'approved') {
            tr.querySelector('.btn-deactivate').addEventListener('click', () => toggleUserStatus(u.username, 'deactivated'));
        } else if (u.status === 'deactivated') {
            tr.querySelector('.btn-activate').addEventListener('click', () => toggleUserStatus(u.username, 'approved'));
        }

        tr.querySelector('.btn-delete-user').addEventListener('click', () => deleteUser(u.username));

        container.appendChild(tr);
    });

    // Populate the reports student dropdown list in Admin Panel
    const reportUserSelect = document.getElementById('admin-report-user-select');
    if (reportUserSelect) {
        const currentVal = reportUserSelect.value;
        reportUserSelect.innerHTML = `
            <option value="" disabled selected>Select a student</option>
            <option value="ALL">ALL (Aggregated Analytics)</option>
        `;
        
        listableUsers.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.username;
            opt.textContent = `${u.username} (${u.classGrade})`;
            reportUserSelect.appendChild(opt);
        });
        
        if (currentVal) {
            reportUserSelect.value = currentVal;
        } else {
            handleAdminReportUserChange();
        }
    }
}

function toggleUserStatus(username, newStatus) {
    const userIndex = AppState.users.findIndex(u => u.username === username);
    if (userIndex !== -1) {
        AppState.users[userIndex].status = newStatus;
        saveToLocalStorage('users');
        renderAdminView();
    }
}

function deleteUser(username) {
    if (confirm("Are you sure you want to permanently delete this user?")) {
        AppState.users = AppState.users.filter(u => u.username !== username);
        saveToLocalStorage('users');
        renderAdminView();
    }
}

// --- REPORTS RENDERING & ANALYTICS ---

function renderReportsView() {
    const reportStart = document.getElementById('report-start-date');
    const reportEnd = document.getElementById('report-end-date');
    const reportSubject = document.getElementById('report-subject-select');
    
    if (!reportStart || !reportEnd || !reportSubject) return;
    
    if (!reportStart.value) reportStart.value = getOffsetDateString(30);
    if (!reportEnd.value) reportEnd.value = getOffsetDateString(0);
    
    const startDate = reportStart.value;
    const endDate = reportEnd.value;
    const selectedSubject = reportSubject.value;
    
    // Filter logs
    let filteredLogs = AppState.userLogs.filter(log => {
        if (log.date < startDate || log.date > endDate) return false;
        if (selectedSubject !== 'ALL') {
            const isStandard = ['Physics', 'Chemistry', 'Mathematics', 'English'].includes(log.subject);
            if (selectedSubject === 'OTHER') {
                if (isStandard) return false;
            } else {
                if (log.subject !== selectedSubject) return false;
            }
        }
        return true;
    });
    
    // Filter sessions
    let filteredSessions = AppState.userTimetable.filter(s => {
        if (s.date) {
            if (s.date < startDate || s.date > endDate) return false;
        }
        if (selectedSubject !== 'ALL') {
            const isStandard = ['Physics', 'Chemistry', 'Mathematics', 'English'].includes(s.subject);
            if (selectedSubject === 'OTHER') {
                if (isStandard) return false;
            } else {
                if (s.subject !== selectedSubject) return false;
            }
        }
        return true;
    });
    
    // Calculate actual study hours
    let totalActualMinutes = 0;
    filteredLogs.forEach(log => totalActualMinutes += log.duration);
    const actualHours = (totalActualMinutes / 60).toFixed(1);
    
    // Calculate target hours
    let totalTargetMinutes = getTargetMinutesForDateRange(startDate, endDate, selectedSubject, AppState.userTimetable);
    const targetHours = (totalTargetMinutes / 60).toFixed(1);
    
    // Compliance
    let compliance = 0;
    if (totalTargetMinutes > 0) {
        compliance = Math.min(100, Math.round((totalActualMinutes / totalTargetMinutes) * 100));
    } else if (totalActualMinutes > 0) {
        compliance = 100;
    }
    
    // Top Subject
    const subjectMinutes = {};
    filteredLogs.forEach(log => {
        subjectMinutes[log.subject] = (subjectMinutes[log.subject] || 0) + log.duration;
    });
    let topSubject = 'None';
    let topSubjectMins = 0;
    for (const sub in subjectMinutes) {
        if (subjectMinutes[sub] > topSubjectMins) {
            topSubject = sub;
            topSubjectMins = subjectMinutes[sub];
        }
    }
    
    // Update UI Metrics
    document.getElementById('report-val-actual').textContent = `${actualHours}h`;
    document.getElementById('report-val-actual-subtext').textContent = `${filteredLogs.length} logs found`;
    document.getElementById('report-val-target').textContent = `${targetHours}h`;
    document.getElementById('report-val-target-subtext').textContent = `${filteredSessions.length} sessions found`;
    document.getElementById('report-val-compliance').textContent = `${compliance}%`;
    document.getElementById('report-val-compliance-subtext').textContent = `${(totalActualMinutes/60).toFixed(1)} of ${(totalTargetMinutes/60).toFixed(1)} hrs`;
    document.getElementById('report-val-top-subject').textContent = topSubject;
    document.getElementById('report-val-top-subject-time').textContent = topSubject === 'None' ? '0 mins logged' : `${formatMinutes(topSubjectMins)} logged`;
    
    // Render logs list
    const logsContainer = document.getElementById('report-logs-container');
    logsContainer.innerHTML = '';
    if (filteredLogs.length === 0) {
        logsContainer.innerHTML = `<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No logs match the criteria.</p>`;
    } else {
        filteredLogs.sort((a,b) => b.date.localeCompare(a.date));
        filteredLogs.forEach(log => {
            const card = document.createElement('div');
            card.className = 'log-item-card';
            card.style.borderLeft = `4px solid ${getSubjectColorHex(log.subject)}`;
            card.innerHTML = `
                <div class="log-item-info" style="width: 100%;">
                    <div class="log-subject-line">
                        <span class="log-item-subject" style="color: ${getSubjectColorHex(log.subject)}; font-weight: 700;">${log.subject}</span>
                        <span class="log-item-duration">${formatMinutes(log.duration)}</span>
                    </div>
                    <div style="font-size:0.8rem; color:var(--text-secondary);">${log.date}</div>
                    <div class="log-item-topic" style="margin-top: 4px;">${log.topic}</div>
                </div>
            `;
            logsContainer.appendChild(card);
        });
    }
    
    // Render sessions list
    const sessionsContainer = document.getElementById('report-timetable-container');
    sessionsContainer.innerHTML = '';
    if (filteredSessions.length === 0) {
        sessionsContainer.innerHTML = `<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No sessions match the criteria.</p>`;
    } else {
        filteredSessions.forEach(session => {
            const todayStr = new Date().toISOString().split('T')[0];
            const isMissed = session.date && (session.date < todayStr) && !AppState.userLogs.some(log => log.date === session.date && log.subject === session.subject);
            
            const card = document.createElement('div');
            card.className = 'log-item-card';
            card.style.borderLeft = `4px solid ${getSubjectColorHex(session.subject)}`;
            if (isMissed) {
                card.style.background = 'rgba(239, 68, 68, 0.02)';
            }
            card.innerHTML = `
                <div class="log-item-info" style="width: 100%;">
                    <div class="log-subject-line" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                        <span class="log-item-subject" style="color: ${getSubjectColorHex(session.subject)}; font-weight: 700;">${session.subject}</span>
                        <span style="display: flex; align-items: center; gap: 8px;">
                            ${isMissed ? `<span style="color: #ef4444; font-size: 0.75rem; font-weight: 800; background: rgba(239, 68, 68, 0.1); padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-flag"></i> Missed</span>` : ''}
                            <span class="log-item-duration" style="font-size: 0.8rem; color: var(--text-secondary);">${session.startTime} - ${session.endTime}</span>
                        </span>
                    </div>
                    <div style="font-size:0.8rem; color:var(--text-secondary);">${getDayName(session.day)} ${session.date || ''}</div>
                    <div class="log-item-topic" style="margin-top: 4px;">${session.lesson || 'General Study'}</div>
                </div>
            `;
            sessionsContainer.appendChild(card);
        });
    }
}

function getTargetMinutesForDateRange(startDateStr, endDateStr, subjectFilter, userTimetableList) {
    let totalTargetMins = 0;
    const start = new Date(startDateStr);
    start.setHours(0,0,0,0);
    const end = new Date(endDateStr);
    end.setHours(0,0,0,0);
    
    const timeDiff = end.getTime() - start.getTime();
    if (timeDiff < 0) return 0;
    const numDays = Math.round(timeDiff / (1000 * 3600 * 24)) + 1;
    
    for (let i = 0; i < numDays; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const dayOfWeek = d.getDay();
        
        // Find sessions for this day
        const sessions = userTimetableList.filter(s => {
            // Subject filtering
            if (subjectFilter !== 'ALL') {
                const isStandard = ['Physics', 'Chemistry', 'Mathematics', 'English'].includes(s.subject);
                if (subjectFilter === 'OTHER') {
                    if (isStandard) return false;
                } else {
                    if (s.subject !== subjectFilter) return false;
                }
            }
            
            if (s.date) {
                return s.date === dateStr;
            } else {
                return s.day === dayOfWeek;
            }
        });
        
        sessions.forEach(s => {
            const decStart = timeStringToDecimal(s.startTime);
            const decEnd = timeStringToDecimal(s.endTime);
            totalTargetMins += Math.round((decEnd - decStart) * 60);
        });
    }
    return totalTargetMins;
}

function handleAdminReportUserChange() {
    const userSelect = document.getElementById('admin-report-user-select');
    const placeholder = document.getElementById('admin-report-placeholder');
    const wrapper = document.getElementById('admin-report-results-wrapper');
    
    if (userSelect && userSelect.value) {
        placeholder.classList.add('hide');
        wrapper.classList.remove('hide');
        updateAdminReportView();
    } else {
        placeholder.classList.remove('hide');
        wrapper.classList.add('hide');
    }
}

function updateAdminReportView() {
    const userSelect = document.getElementById('admin-report-user-select');
    const startInput = document.getElementById('admin-report-start-date');
    const endInput = document.getElementById('admin-report-end-date');
    const subjectSelect = document.getElementById('admin-report-subject-select');
    
    if (!userSelect || !userSelect.value) return;
    
    if (!startInput.value) startInput.value = getOffsetDateString(30);
    if (!endInput.value) endInput.value = getOffsetDateString(0);
    
    const selectedUsername = userSelect.value;
    const startDate = startInput.value;
    const endDate = endInput.value;
    const selectedSubject = subjectSelect.value;
    
    // Gather selected user's raw lists
    const targetUserTimetable = selectedUsername === 'ALL'
        ? AppState.timetable
        : AppState.timetable.filter(s => s.username === selectedUsername);
    const targetUserLogs = selectedUsername === 'ALL'
        ? AppState.logs
        : AppState.logs.filter(l => l.username === selectedUsername);
    
    // Filter logs
    let filteredLogs = targetUserLogs.filter(log => {
        if (log.date < startDate || log.date > endDate) return false;
        if (selectedSubject !== 'ALL') {
            const isStandard = ['Physics', 'Chemistry', 'Mathematics', 'English'].includes(log.subject);
            if (selectedSubject === 'OTHER') {
                if (isStandard) return false;
            } else {
                if (log.subject !== selectedSubject) return false;
            }
        }
        return true;
    });
    
    // Filter sessions
    let filteredSessions = targetUserTimetable.filter(s => {
        if (s.date) {
            if (s.date < startDate || s.date > endDate) return false;
        }
        if (selectedSubject !== 'ALL') {
            const isStandard = ['Physics', 'Chemistry', 'Mathematics', 'English'].includes(s.subject);
            if (selectedSubject === 'OTHER') {
                if (isStandard) return false;
            } else {
                if (s.subject !== selectedSubject) return false;
            }
        }
        return true;
    });
    
    // Calculate actual study hours
    let totalActualMinutes = 0;
    filteredLogs.forEach(log => totalActualMinutes += log.duration);
    const actualHours = (totalActualMinutes / 60).toFixed(1);
    
    // Calculate target hours
    let totalTargetMinutes = getTargetMinutesForDateRange(startDate, endDate, selectedSubject, targetUserTimetable);
    const targetHours = (totalTargetMinutes / 60).toFixed(1);
    
    // Compliance
    let compliance = 0;
    if (totalTargetMinutes > 0) {
        compliance = Math.min(100, Math.round((totalActualMinutes / totalTargetMinutes) * 100));
    } else if (totalActualMinutes > 0) {
        compliance = 100;
    }
    
    // Top Subject
    const subjectMinutes = {};
    filteredLogs.forEach(log => {
        subjectMinutes[log.subject] = (subjectMinutes[log.subject] || 0) + log.duration;
    });
    let topSubject = 'None';
    let topSubjectMins = 0;
    for (const sub in subjectMinutes) {
        if (subjectMinutes[sub] > topSubjectMins) {
            topSubject = sub;
            topSubjectMins = subjectMinutes[sub];
        }
    }
    
    // Update Admin UI Metrics
    document.getElementById('admin-report-val-actual').textContent = `${actualHours}h`;
    document.getElementById('admin-report-val-actual-subtext').textContent = `${filteredLogs.length} logs found`;
    document.getElementById('admin-report-val-target').textContent = `${targetHours}h`;
    document.getElementById('admin-report-val-target-subtext').textContent = `${filteredSessions.length} sessions found`;
    document.getElementById('admin-report-val-compliance').textContent = `${compliance}%`;
    document.getElementById('admin-report-val-compliance-subtext').textContent = `${(totalActualMinutes/60).toFixed(1)} of ${(totalTargetMinutes/60).toFixed(1)} hrs`;
    document.getElementById('admin-report-val-top-subject').textContent = topSubject;
    document.getElementById('admin-report-val-top-subject-time').textContent = topSubject === 'None' ? '0 mins logged' : `${formatMinutes(topSubjectMins)} logged`;
    
    // Render logs list
    const logsContainer = document.getElementById('admin-report-logs-container');
    logsContainer.innerHTML = '';
    if (filteredLogs.length === 0) {
        logsContainer.innerHTML = `<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No logs match the criteria.</p>`;
    } else {
        filteredLogs.sort((a,b) => b.date.localeCompare(a.date));
        filteredLogs.forEach(log => {
            const card = document.createElement('div');
            card.className = 'log-item-card';
            card.style.borderLeft = `4px solid ${getSubjectColorHex(log.subject)}`;
            card.innerHTML = `
                <div class="log-item-info" style="width: 100%;">
                    <div class="log-subject-line">
                        <span class="log-item-subject" style="color: ${getSubjectColorHex(log.subject)}; font-weight: 700;">${log.subject}</span>
                        <span class="log-item-duration">${formatMinutes(log.duration)}</span>
                    </div>
                    <div style="font-size:0.8rem; color:var(--text-secondary);">${log.date}</div>
                    <div class="log-item-topic" style="margin-top: 4px;">${log.topic}</div>
                </div>
            `;
            logsContainer.appendChild(card);
        });
    }
    
    // Render sessions list
    const sessionsContainer = document.getElementById('admin-report-timetable-container');
    sessionsContainer.innerHTML = '';
    if (filteredSessions.length === 0) {
        sessionsContainer.innerHTML = `<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No sessions match the criteria.</p>`;
    } else {
        filteredSessions.forEach(session => {
            const todayStr = new Date().toISOString().split('T')[0];
            const isMissed = session.date && (session.date < todayStr) && !targetUserLogs.some(log => log.date === session.date && log.subject === session.subject);
            
            const card = document.createElement('div');
            card.className = 'log-item-card';
            card.style.borderLeft = `4px solid ${getSubjectColorHex(session.subject)}`;
            if (isMissed) {
                card.style.background = 'rgba(239, 68, 68, 0.02)';
            }
            card.innerHTML = `
                <div class="log-item-info" style="width: 100%;">
                    <div class="log-subject-line" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                        <span class="log-item-subject" style="color: ${getSubjectColorHex(session.subject)}; font-weight: 700;">${session.subject}</span>
                        <span style="display: flex; align-items: center; gap: 8px;">
                            ${isMissed ? `<span style="color: #ef4444; font-size: 0.75rem; font-weight: 800; background: rgba(239, 68, 68, 0.1); padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-flag"></i> Missed</span>` : ''}
                            <span class="log-item-duration" style="font-size: 0.8rem; color: var(--text-secondary);">${session.startTime} - ${session.endTime}</span>
                        </span>
                    </div>
                    <div style="font-size:0.8rem; color:var(--text-secondary);">${getDayName(session.day)} ${session.date || ''}</div>
                    <div class="log-item-topic" style="margin-top: 4px;">${session.lesson || 'General Study'}</div>
                </div>
            `;
            sessionsContainer.appendChild(card);
        });
    }

    // Render missed list in admin report
    const missedSessions = getMissedSessionsForUser(selectedUsername, AppState.timetable, AppState.logs);
    let filteredMissed = missedSessions.filter(s => {
        if (s.date < startDate || s.date > endDate) return false;
        if (selectedSubject !== 'ALL') {
            const isStandard = ['Physics', 'Chemistry', 'Mathematics', 'English'].includes(s.subject);
            if (selectedSubject === 'OTHER') {
                if (isStandard) return false;
            } else {
                if (s.subject !== selectedSubject) return false;
            }
        }
        return true;
    });

    const adminMissedContainer = document.getElementById('admin-report-missed-container');
    const adminMissedBadge = document.getElementById('admin-report-missed-badge');
    
    if (adminMissedContainer && adminMissedBadge) {
        adminMissedBadge.textContent = `${filteredMissed.length} Missed`;
        adminMissedContainer.innerHTML = '';
        if (filteredMissed.length === 0) {
            adminMissedContainer.innerHTML = `<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No missed schedules in this period.</p>`;
        } else {
            filteredMissed.forEach(session => {
                const card = document.createElement('div');
                card.className = 'log-item-card';
                card.style.borderLeft = `4px solid ${getSubjectColorHex(session.subject)}`;
                card.style.background = 'rgba(239, 68, 68, 0.02)';
                card.innerHTML = `
                    <div class="log-item-info" style="width: 100%;">
                        <div class="log-subject-line" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <span class="log-item-subject" style="color: ${getSubjectColorHex(session.subject)}; font-weight: 700;">${session.subject}</span>
                            <span style="display: flex; align-items: center; gap: 8px;">
                                <span style="color: #ef4444; font-size: 0.75rem; font-weight: 800; background: rgba(239, 68, 68, 0.1); padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-flag"></i> Missed</span>
                                <span class="log-item-duration" style="font-size: 0.8rem; color: var(--text-secondary);">${session.startTime} - ${session.endTime}</span>
                            </span>
                        </div>
                        <div style="font-size:0.8rem; color:var(--text-secondary);">${getDayName(session.day)} ${session.date || ''}</div>
                        <div class="log-item-topic" style="margin-top: 4px;">${session.lesson || 'General Study'}</div>
                    </div>
                `;
                adminMissedContainer.appendChild(card);
            });
        }
    }
}

// --- SESSION TIMEOUT MANAGEMENT ---
function resetInactivityTimeout() {
    clearTimeout(inactivityTimeout);
    if (AppState.currentUser) {
        inactivityTimeout = setTimeout(handleSessionTimeout, INACTIVITY_LIMIT);
    }
}

function handleSessionTimeout() {
    if (AppState.currentUser) {
        AppState.currentUser = null;
        saveToLocalStorage('current_user');
        checkAuthState();
        alert("Session Timeout: You have been logged out due to inactivity.");
    }
}

// --- STUDY LOGS DYNAMIC LINKED DROPDOWNS ---
function populateStudyLogDropdowns(selectedSubject = '', selectedTopic = '', selectedNotes = '') {
    const subjectSelect = document.getElementById('log-subject-select');
    if (!subjectSelect) return;

    // 1. Get unique subjects from Timetable
    const timetable = AppState.userTimetable;
    const subjects = [...new Set(timetable.map(s => s.subject))].filter(Boolean);

    // If a selectedSubject is passed but not in timetable, inject it
    if (selectedSubject && !subjects.includes(selectedSubject)) {
        subjects.push(selectedSubject);
    }

    // Populate Subject Select
    subjectSelect.innerHTML = '';
    if (subjects.length === 0) {
        const opt = document.createElement('option');
        opt.value = "";
        opt.disabled = true;
        opt.selected = true;
        opt.textContent = "No subjects in Timetable";
        subjectSelect.appendChild(opt);
    } else {
        const placeholder = document.createElement('option');
        placeholder.value = "";
        placeholder.disabled = true;
        placeholder.selected = !selectedSubject;
        placeholder.textContent = "Select Subject";
        subjectSelect.appendChild(placeholder);

        subjects.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub;
            opt.textContent = sub;
            if (sub === selectedSubject) {
                opt.selected = true;
            }
            subjectSelect.appendChild(opt);
        });
    }

    // Populate topics and notes dropdowns based on this subject
    updateTopicAndNotesDropdowns(selectedTopic, selectedNotes);
}

function updateTopicAndNotesDropdowns(selectedTopic = '', selectedNotes = '') {
    const subjectSelect = document.getElementById('log-subject-select');
    const topicSelect = document.getElementById('log-topic');
    const notesSelect = document.getElementById('log-notes');
    
    if (!subjectSelect || !topicSelect || !notesSelect) return;

    const activeSubject = subjectSelect.value;
    
    topicSelect.innerHTML = '';
    notesSelect.innerHTML = '';

    if (!activeSubject) {
        // Disabled placeholder state
        const topicPlaceholder = document.createElement('option');
        topicPlaceholder.value = "";
        topicPlaceholder.disabled = true;
        topicPlaceholder.selected = true;
        topicPlaceholder.textContent = "Select subject first";
        topicSelect.appendChild(topicPlaceholder);

        const notesPlaceholder = document.createElement('option');
        notesPlaceholder.value = "";
        notesPlaceholder.disabled = true;
        notesPlaceholder.selected = true;
        notesPlaceholder.textContent = "Select subject first";
        notesSelect.appendChild(notesPlaceholder);
    } else {
        // Get unique topics and notes for this subject from Timetable
        const timetable = AppState.userTimetable;
        const subjectSessions = timetable.filter(s => s.subject === activeSubject);
        const topics = [...new Set(subjectSessions.map(s => s.lesson))].filter(Boolean);
        const notesList = [...new Set(subjectSessions.map(s => s.notes))].filter(Boolean);

        // Inject passed values if not present
        if (selectedTopic && !topics.includes(selectedTopic)) {
            topics.push(selectedTopic);
        }
        if (selectedNotes && !notesList.includes(selectedNotes)) {
            notesList.push(selectedNotes);
        }

        // Populate Topics
        const topicPlaceholder = document.createElement('option');
        topicPlaceholder.value = "";
        topicPlaceholder.disabled = true;
        topicPlaceholder.selected = !selectedTopic;
        topicPlaceholder.textContent = "Select Topic Covered";
        topicSelect.appendChild(topicPlaceholder);

        topics.forEach(topic => {
            const opt = document.createElement('option');
            opt.value = topic;
            opt.textContent = topic;
            if (topic === selectedTopic) {
                opt.selected = true;
            }
            topicSelect.appendChild(opt);
        });

        // Populate Notes
        const notesPlaceholder = document.createElement('option');
        notesPlaceholder.value = "";
        notesPlaceholder.selected = !selectedNotes;
        notesPlaceholder.textContent = "None / No notes";
        notesSelect.appendChild(notesPlaceholder);

        notesList.forEach(note => {
            const opt = document.createElement('option');
            opt.value = note;
            opt.textContent = note;
            if (note === selectedNotes) {
                opt.selected = true;
            }
            notesSelect.appendChild(opt);
        });
    }
}

function handleLogTopicChange() {
    const subjectSelect = document.getElementById('log-subject-select');
    const topicSelect = document.getElementById('log-topic');
    const notesSelect = document.getElementById('log-notes');
    
    if (!subjectSelect || !topicSelect || !notesSelect) return;
    
    const activeSubject = subjectSelect.value;
    const activeTopic = topicSelect.value;
    
    if (activeSubject && activeTopic) {
        const timetable = AppState.userTimetable;
        const matchingSession = timetable.find(s => s.subject === activeSubject && s.lesson === activeTopic);
        if (matchingSession && matchingSession.notes) {
            notesSelect.value = matchingSession.notes;
        } else {
            notesSelect.value = "";
        }
    }
}

function getMissedSessionsForUser(username, timetableList, logsList) {
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const currentTimeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

    const userSessions = timetableList.filter(s => {
        if (username !== 'ALL' && s.username !== username) return false;
        if (!s.date) return false;
        if (s.date < todayStr) return true;
        if (s.date === todayStr && s.endTime && s.endTime <= currentTimeStr) return true;
        return false;
    });

    const userLogs = username === 'ALL'
        ? logsList
        : logsList.filter(l => l.username === username);
    
    const missed = [];
    userSessions.forEach(session => {
        const hasLog = userLogs.some(log => log.date === session.date && log.subject === session.subject && (username === 'ALL' ? log.username === session.username : true));
        if (!hasLog) {
            missed.push(session);
        }
    });
    
    missed.sort((a, b) => {
        const dateComp = b.date.localeCompare(a.date);
        if (dateComp !== 0) return dateComp;
        return b.startTime.localeCompare(a.startTime);
    });
    
    return missed;
}

// --- REPORTS EXPORT UTILITIES ---
function exportToExcel(isAdmin = false) {
    let startDate, endDate, selectedSubject, logs, sessions, targetUser, filenamePrefix;
    
    if (isAdmin) {
        const userSelect = document.getElementById('admin-report-user-select');
        const startInput = document.getElementById('admin-report-start-date');
        const endInput = document.getElementById('admin-report-end-date');
        const subjectSelect = document.getElementById('admin-report-subject-select');
        
        if (!userSelect || !userSelect.value) {
            alert("Please select a student first.");
            return;
        }
        
        targetUser = userSelect.value;
        startDate = startInput.value || getOffsetDateString(30);
        endDate = endInput.value || getOffsetDateString(0);
        selectedSubject = subjectSelect.value;
        
        const targetUserTimetable = targetUser === 'ALL'
            ? AppState.timetable
            : AppState.timetable.filter(s => s.username === targetUser);
        const targetUserLogs = targetUser === 'ALL'
            ? AppState.logs
            : AppState.logs.filter(l => l.username === targetUser);
        
        logs = targetUserLogs.filter(log => {
            if (log.date < startDate || log.date > endDate) return false;
            if (selectedSubject !== 'ALL') {
                const isStandard = ['Physics', 'Chemistry', 'Mathematics', 'English'].includes(log.subject);
                if (selectedSubject === 'OTHER') {
                    if (isStandard) return false;
                } else if (log.subject !== selectedSubject) return false;
            }
            return true;
        });
        
        sessions = targetUserTimetable.filter(s => {
            if (s.date && (s.date < startDate || s.date > endDate)) return false;
            if (selectedSubject !== 'ALL') {
                const isStandard = ['Physics', 'Chemistry', 'Mathematics', 'English'].includes(s.subject);
                if (selectedSubject === 'OTHER') {
                    if (isStandard) return false;
                } else if (s.subject !== selectedSubject) return false;
            }
            return true;
        });
        
        filenamePrefix = `AdminReport_${targetUser}`;
    } else {
        const reportStart = document.getElementById('report-start-date');
        const reportEnd = document.getElementById('report-end-date');
        const reportSubject = document.getElementById('report-subject-select');
        
        targetUser = AppState.currentUser.username;
        startDate = reportStart.value || getOffsetDateString(30);
        endDate = reportEnd.value || getOffsetDateString(0);
        selectedSubject = reportSubject.value;
        
        logs = AppState.userLogs.filter(log => {
            if (log.date < startDate || log.date > endDate) return false;
            if (selectedSubject !== 'ALL') {
                const isStandard = ['Physics', 'Chemistry', 'Mathematics', 'English'].includes(log.subject);
                if (selectedSubject === 'OTHER') {
                    if (isStandard) return false;
                } else if (log.subject !== selectedSubject) return false;
            }
            return true;
        });
        
        sessions = AppState.userTimetable.filter(s => {
            if (s.date && (s.date < startDate || s.date > endDate)) return false;
            if (selectedSubject !== 'ALL') {
                const isStandard = ['Physics', 'Chemistry', 'Mathematics', 'English'].includes(s.subject);
                if (selectedSubject === 'OTHER') {
                    if (isStandard) return false;
                } else if (s.subject !== selectedSubject) return false;
            }
            return true;
        });
        
        filenamePrefix = `Report_${targetUser}`;
    }
    
    // Calculate Stats
    let totalActualMinutes = 0;
    logs.forEach(log => totalActualMinutes += log.duration);
    
    let totalTargetMinutes = 0;
    if (isAdmin) {
        const userSelect = document.getElementById('admin-report-user-select');
        const targetUserTimetable = userSelect.value === 'ALL'
            ? AppState.timetable
            : AppState.timetable.filter(s => s.username === userSelect.value);
        totalTargetMinutes = getTargetMinutesForDateRange(startDate, endDate, selectedSubject, targetUserTimetable);
    } else {
        totalTargetMinutes = getTargetMinutesForDateRange(startDate, endDate, selectedSubject, AppState.userTimetable);
    }
    
    let compliance = 0;
    if (totalTargetMinutes > 0) {
        compliance = Math.min(100, Math.round((totalActualMinutes / totalTargetMinutes) * 100));
    } else if (totalActualMinutes > 0) {
        compliance = 100;
    }
    
    const subjectMinutes = {};
    logs.forEach(log => {
        subjectMinutes[log.subject] = (subjectMinutes[log.subject] || 0) + log.duration;
    });
    let topSubject = 'None';
    let topSubjectMins = 0;
    for (const sub in subjectMinutes) {
        if (subjectMinutes[sub] > topSubjectMins) {
            topSubject = sub;
            topSubjectMins = subjectMinutes[sub];
        }
    }
    
    if (typeof XLSX === 'undefined') {
        alert("Excel export library is not loaded. Please verify internet connection.");
        return;
    }
    
    const wb = XLSX.utils.book_new();
    
    // Sheet 1: Summary Statistics
    const summaryData = [
        { "Report Property": "Report Generation Date", "Value": new Date().toLocaleDateString() },
        { "Report Property": "Target Student", "Value": targetUser },
        { "Report Property": "Date Range", "Value": `${startDate} to ${endDate}` },
        { "Report Property": "Subject Filter", "Value": selectedSubject },
        { "Report Property": "Total Studied Hours", "Value": (totalActualMinutes / 60).toFixed(1) + " hrs" },
        { "Report Property": "Total Scheduled Hours", "Value": (totalTargetMinutes / 60).toFixed(1) + " hrs" },
        { "Report Property": "Compliance Rate", "Value": compliance + "%" },
        { "Report Property": "Top Subject", "Value": topSubject === 'None' ? 'None' : `${topSubject} (${formatMinutes(topSubjectMins)})` }
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");
    
    // Sheet 2: Study Logs
    const logsData = logs.map((log, idx) => ({
        "S.No": idx + 1,
        "Date": log.date,
        "Subject": log.subject,
        "Duration (mins)": log.duration,
        "Duration (formatted)": formatMinutes(log.duration),
        "Topic Covered": log.topic,
        "Notes/Planned Exercises": log.notes || "",
        "Registered User": log.username
    }));
    const wsLogs = XLSX.utils.json_to_sheet(logsData);
    XLSX.utils.book_append_sheet(wb, wsLogs, "Study Logs");
    
    // Sheet 3: Timetable sessions
    const sessionsData = sessions.map((s, idx) => ({
        "S.No": idx + 1,
        "Day": getDayName(s.day),
        "Date": s.date || "Weekly Recurring",
        "Subject": s.subject,
        "Start Time": s.startTime,
        "End Time": s.endTime,
        "Lesson/Planned Topic": s.lesson || "",
        "Notes/Planned Exercises": s.notes || "",
        "Registered User": s.username
    }));
    const wsSessions = XLSX.utils.json_to_sheet(sessionsData);
    XLSX.utils.book_append_sheet(wb, wsSessions, "Timetable Schedule");
    
    XLSX.writeFile(wb, `${filenamePrefix}_Report_${startDate}_to_${endDate}.xlsx`);
}

function exportToPDF(isAdmin = false) {
    let startDate, endDate, selectedSubject, logs, sessions, targetUser, filenamePrefix;
    
    if (isAdmin) {
        const userSelect = document.getElementById('admin-report-user-select');
        const startInput = document.getElementById('admin-report-start-date');
        const endInput = document.getElementById('admin-report-end-date');
        const subjectSelect = document.getElementById('admin-report-subject-select');
        
        if (!userSelect || !userSelect.value) {
            alert("Please select a student first.");
            return;
        }
        
        targetUser = userSelect.value;
        startDate = startInput.value || getOffsetDateString(30);
        endDate = endInput.value || getOffsetDateString(0);
        selectedSubject = subjectSelect.value;
        
        const targetUserTimetable = targetUser === 'ALL'
            ? AppState.timetable
            : AppState.timetable.filter(s => s.username === targetUser);
        const targetUserLogs = targetUser === 'ALL'
            ? AppState.logs
            : AppState.logs.filter(l => l.username === targetUser);
        
        logs = targetUserLogs.filter(log => {
            if (log.date < startDate || log.date > endDate) return false;
            if (selectedSubject !== 'ALL') {
                const isStandard = ['Physics', 'Chemistry', 'Mathematics', 'English'].includes(log.subject);
                if (selectedSubject === 'OTHER') {
                    if (isStandard) return false;
                } else if (log.subject !== selectedSubject) return false;
            }
            return true;
        });
        
        sessions = targetUserTimetable.filter(s => {
            if (s.date && (s.date < startDate || s.date > endDate)) return false;
            if (selectedSubject !== 'ALL') {
                const isStandard = ['Physics', 'Chemistry', 'Mathematics', 'English'].includes(s.subject);
                if (selectedSubject === 'OTHER') {
                    if (isStandard) return false;
                } else if (s.subject !== selectedSubject) return false;
            }
            return true;
        });
        
        filenamePrefix = `AdminReport_${targetUser}`;
    } else {
        const reportStart = document.getElementById('report-start-date');
        const reportEnd = document.getElementById('report-end-date');
        const reportSubject = document.getElementById('report-subject-select');
        
        targetUser = AppState.currentUser.username;
        startDate = reportStart.value || getOffsetDateString(30);
        endDate = reportEnd.value || getOffsetDateString(0);
        selectedSubject = reportSubject.value;
        
        logs = AppState.userLogs.filter(log => {
            if (log.date < startDate || log.date > endDate) return false;
            if (selectedSubject !== 'ALL') {
                const isStandard = ['Physics', 'Chemistry', 'Mathematics', 'English'].includes(log.subject);
                if (selectedSubject === 'OTHER') {
                    if (isStandard) return false;
                } else if (log.subject !== selectedSubject) return false;
            }
            return true;
        });
        
        sessions = AppState.userTimetable.filter(s => {
            if (s.date && (s.date < startDate || s.date > endDate)) return false;
            if (selectedSubject !== 'ALL') {
                const isStandard = ['Physics', 'Chemistry', 'Mathematics', 'English'].includes(s.subject);
                if (selectedSubject === 'OTHER') {
                    if (isStandard) return false;
                } else if (s.subject !== selectedSubject) return false;
            }
            return true;
        });
        
        filenamePrefix = `Report_${targetUser}`;
    }
    
    // Calculate Stats
    let totalActualMinutes = 0;
    logs.forEach(log => totalActualMinutes += log.duration);
    
    let totalTargetMinutes = 0;
    if (isAdmin) {
        const userSelect = document.getElementById('admin-report-user-select');
        const targetUserTimetable = userSelect.value === 'ALL'
            ? AppState.timetable
            : AppState.timetable.filter(s => s.username === userSelect.value);
        totalTargetMinutes = getTargetMinutesForDateRange(startDate, endDate, selectedSubject, targetUserTimetable);
    } else {
        totalTargetMinutes = getTargetMinutesForDateRange(startDate, endDate, selectedSubject, AppState.userTimetable);
    }
    
    let compliance = 0;
    if (totalTargetMinutes > 0) {
        compliance = Math.min(100, Math.round((totalActualMinutes / totalTargetMinutes) * 100));
    } else if (totalActualMinutes > 0) {
        compliance = 100;
    }
    
    const subjectMinutes = {};
    logs.forEach(log => {
        subjectMinutes[log.subject] = (subjectMinutes[log.subject] || 0) + log.duration;
    });
    let topSubject = 'None';
    let topSubjectMins = 0;
    for (const sub in subjectMinutes) {
        if (subjectMinutes[sub] > topSubjectMins) {
            topSubject = sub;
            topSubjectMins = subjectMinutes[sub];
        }
    }
    
    if (typeof window.jspdf === 'undefined') {
        alert("PDF export library is not loaded. Please verify internet connection.");
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Page Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(99, 102, 241); // Indigo color
    doc.text("Strive - Study Tracker & Timetable Report", 14, 20);
    
    // Document Meta
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 110, 120);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);
    doc.text(`Target Student: ${targetUser}`, 14, 34);
    doc.text(`Date Range: ${startDate} to ${endDate} (${selectedSubject} Subject filter)`, 14, 40);
    
    doc.line(14, 44, 196, 44);
    
    // Summary Metrics Section Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text("Summary Metrics", 14, 52);
    
    // Draw Metrics Grid Table
    const metricsHead = [['Metric', 'Value']];
    const metricsBody = [
        ['Total Hours Studied', `${(totalActualMinutes / 60).toFixed(1)} hrs (${logs.length} logs)`],
        ['Total Scheduled Target', `${(totalTargetMinutes / 60).toFixed(1)} hrs (${sessions.length} sessions)`],
        ['Timetable Compliance Rate', `${compliance}%`],
        ['Top Subject Studied', topSubject === 'None' ? 'None' : `${topSubject} (${formatMinutes(topSubjectMins)})`]
    ];
    
    doc.autoTable({
        startY: 56,
        head: metricsHead,
        body: metricsBody,
        theme: 'striped',
        headStyles: { fillColor: [99, 102, 241], textColor: 255 },
        styles: { fontSize: 10 }
    });
    
    // Detailed Study Logs Section Title
    let currentY = doc.lastAutoTable.finalY + 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Study Logs Breakdown", 14, currentY);
    
    const logsHead = [['#', 'Date', 'Subject', 'Duration', 'Topic Covered', 'Notes / Planned Exercises']];
    const logsBody = logs.map((log, idx) => [
        idx + 1,
        log.date,
        log.subject,
        formatMinutes(log.duration),
        log.topic,
        log.notes || "None"
    ]);
    
    if (logsBody.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.setTextColor(120, 120, 120);
        doc.text("No study logs found matching the filters in this range.", 14, currentY + 8);
        currentY += 14;
    } else {
        doc.autoTable({
            startY: currentY + 4,
            head: logsHead,
            body: logsBody,
            theme: 'grid',
            headStyles: { fillColor: [16, 185, 129], textColor: 255 },
            styles: { fontSize: 8 },
            columnStyles: {
                0: { cellWidth: 8 },
                1: { cellWidth: 20 },
                2: { cellWidth: 22 },
                3: { cellWidth: 18 },
                4: { cellWidth: 60 },
                5: { cellWidth: 62 }
            }
        });
        currentY = doc.lastAutoTable.finalY + 12;
    }
    
    // Detailed Scheduled Sessions Title
    if (currentY > 230) {
        doc.addPage();
        currentY = 20;
    }
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text("Timetable Scheduled Sessions", 14, currentY);
    
    const sessionsHead = [['#', 'Day', 'Date', 'Subject', 'Time Slot', 'Lesson / Topic', 'Notes / Exercises']];
    const sessionsBody = sessions.map((s, idx) => [
        idx + 1,
        getDayName(s.day).substring(0,3),
        s.date || "Recurring",
        s.subject,
        `${s.startTime}-${s.endTime}`,
        s.lesson || "General Study",
        s.notes || ""
    ]);
    
    if (sessionsBody.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.setTextColor(120, 120, 120);
        doc.text("No timetable sessions found matching the filters in this range.", 14, currentY + 8);
    } else {
        doc.autoTable({
            startY: currentY + 4,
            head: sessionsHead,
            body: sessionsBody,
            theme: 'grid',
            headStyles: { fillColor: [59, 130, 246], textColor: 255 },
            styles: { fontSize: 8 },
            columnStyles: {
                0: { cellWidth: 8 },
                1: { cellWidth: 15 },
                2: { cellWidth: 20 },
                3: { cellWidth: 22 },
                4: { cellWidth: 25 },
                5: { cellWidth: 50 },
                6: { cellWidth: 50 }
            }
        });
    }
    
    doc.save(`${filenamePrefix}_Report_${startDate}_to_${endDate}.pdf`);
}
