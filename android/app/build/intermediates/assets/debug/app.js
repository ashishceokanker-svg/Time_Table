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
    dashboardPeriod: 'week'
};

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
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});

function initApp() {
    // Perform database wipe once if not already done, keeping admin credentials & settings untouched
    const WIPE_KEY = 'anti_gravity_wiped_2026_06_17';
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

    // 5. Set default log form date to today
    document.getElementById('log-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('filter-log-month').value = new Date().toISOString().slice(0, 7);

    // 6. Update Current Date Display in Header
    updateHeaderDate();

    // 7. Verify authentication state
    checkAuthState();
}

function saveToLocalStorage(key) {
    if (key === 'timetable') {
        localStorage.setItem('anti_gravity_timetable', JSON.stringify(AppState.timetable));
    } else if (key === 'logs') {
        localStorage.setItem('anti_gravity_logs', JSON.stringify(AppState.logs));
    } else if (key === 'theme') {
        localStorage.setItem('anti_gravity_theme', AppState.theme);
    } else if (key === 'users') {
        localStorage.setItem('anti_gravity_users', JSON.stringify(AppState.users));
    } else if (key === 'current_user') {
        if (AppState.currentUser) {
            localStorage.setItem('anti_gravity_current_user', JSON.stringify(AppState.currentUser));
        } else {
            localStorage.removeItem('anti_gravity_current_user');
        }
    }
}

// --- NAVIGATION & ROUTING ---
function setupEventListeners() {
    // Sidebar navigation clicks
    document.getElementById('nav-dashboard').addEventListener('click', () => switchView('dashboard'));
    document.getElementById('nav-timetable').addEventListener('click', () => switchView('timetable'));
    document.getElementById('nav-logs').addEventListener('click', () => switchView('logs'));
    document.getElementById('nav-admin').addEventListener('click', () => switchView('admin'));
    document.getElementById('nav-contact').addEventListener('click', () => switchView('contact'));

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

    // Setup 3D Card Parallax and Admin Password Reset Form
    setup3DCardParallax();
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
    const tabLogin = document.getElementById('auth-tab-login');
    const tabRegister = document.getElementById('auth-tab-register');
    const loginForm = document.getElementById('auth-login-form');
    const registerForm = document.getElementById('auth-register-form');
    const subtitle = document.getElementById('auth-subtitle');

    tabLogin.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        loginForm.classList.remove('hide');
        registerForm.classList.add('hide');
        subtitle.textContent = "Login to access your study desk";
    });

    tabRegister.addEventListener('click', () => {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        registerForm.classList.remove('hide');
        loginForm.classList.add('hide');
        subtitle.textContent = "Register a new student account (Requires Admin approval)";
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
    const logSelect = document.getElementById('log-subject-select');
    const logInput = document.getElementById('log-subject-input');
    
    if (!schedSelect || !schedInput || !logSelect || !logInput) return;
    
    if (isSenior) {
        schedSelect.classList.remove('hide');
        schedSelect.required = true;
        schedInput.classList.add('hide');
        schedInput.required = false;
        schedInput.value = '';
        
        logSelect.classList.remove('hide');
        logSelect.required = true;
        logInput.classList.add('hide');
        logInput.required = false;
        logInput.value = '';
    } else {
        schedInput.classList.remove('hide');
        schedInput.required = true;
        schedSelect.classList.add('hide');
        schedSelect.required = false;
        schedSelect.value = '';
        
        logInput.classList.remove('hide');
        logInput.required = true;
        logSelect.classList.add('hide');
        logSelect.required = false;
        logSelect.value = '';
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

        // Render admin panel tab visibility
        const adminTab = document.getElementById('nav-admin');
        if (AppState.currentUser.role === 'admin') {
            adminTab.classList.remove('hide');
        } else {
            adminTab.classList.add('hide');
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
    } else if (viewName === 'admin') {
        renderAdminView();
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
        const sessions = AppState.timetable.filter(s => {
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

function setup3DCardParallax() {
    const overlay = document.getElementById('auth-gateway');
    const card = overlay ? overlay.querySelector('.auth-card') : null;
    if (!overlay || !card) return;
    
    overlay.addEventListener('mousemove', (e) => {
        const xAxis = (window.innerWidth / 2 - e.clientX) / 25;
        const yAxis = (window.innerHeight / 2 - e.clientY) / 25;
        card.style.transform = `rotateY(${xAxis}deg) rotateX(${yAxis}deg)`;
    });
    
    overlay.addEventListener('mouseleave', () => {
        card.style.transform = `rotateX(8deg) rotateY(-8deg)`;
    });
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
    const timetable = AppState.timetable;
    const logs = AppState.logs;
    const period = AppState.dashboardPeriod;
    const daysCount = period === 'week' ? 7 : 30;
    
    // Target Hours (sum of scheduled sessions in the period)
    let totalTargetMinutes = getTargetMinutesForPastDays(daysCount);
    const targetHours = (totalTargetMinutes / 60).toFixed(1);

    // Actual Hours (sum of logged sessions in the period)
    let totalActualMinutes = 0;
    const periodLogs = logs.filter(log => isDateInDaysRange(log.date, daysCount));
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
    const radius = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius; // Approx 201
    circle.style.strokeDasharray = `${circumference}`;
    const offset = circumference - (compliance / 100) * circumference;
    circle.style.strokeDashoffset = offset;

    document.getElementById('val-actual-hours').textContent = `${actualHours}h`;
    document.getElementById('val-actual-subtext').innerHTML = `<i class="fa-solid fa-arrow-up"></i> ${periodLogs.length} logs this ${period}`;

    document.getElementById('val-target-hours').textContent = `${targetHours}h`;
    document.getElementById('val-target-subtext').textContent = `Target for past ${daysCount} days`;

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

    // Render Subject-wise breakdown list
    renderSubjectBreakdownList(subjectMinutes);

    // Render Subject-wise SVG Donut/Pie Chart
    renderSubjectPieChart(subjectMinutes);
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
    const currentWeekSessions = AppState.timetable.filter(s => s.date ? isDateInCurrentWeek(s.date) : true);
    currentWeekSessions.forEach(s => {
        const duration = timeStringToDecimal(s.endTime) - timeStringToDecimal(s.startTime);
        dailyTargets[s.day] = (dailyTargets[s.day] || 0) + duration;
    });

    // Calculate actual hours logged per day in the current week
    const dailyActuals = {};
    dayIndices.forEach(d => dailyActuals[d] = 0);
    
    const todayRange = getCurrentWeekRange();
    const currentWeekLogs = AppState.logs.filter(log => isDateInCurrentWeek(log.date));
    
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
    const todaySessions = AppState.timetable.filter(s => s.day == todayDayIndex);
    
    // Find logs entered for today's date
    const todayLogs = AppState.logs.filter(log => log.date === todayDateStr);

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
    const daySessions = AppState.timetable.filter(s => s.day == dayVal);

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

    const daySessions = AppState.timetable.filter(s => s.day == dayVal);

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
        const session = AppState.timetable.find(s => s.id === id);
        if (session) {
            document.getElementById('schedule-date').value = session.date || '';
            
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
        document.getElementById('schedule-date').value = getDateOfCurrentWeek(AppState.selectedTimetableDay);
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

    // Validation: end time > start time
    if (startTime >= endTime) {
        alert("Error: Start time must be before end time!");
        return;
    }

    // Calculate day index from date
    const day = getDayFromDate(date);

    if (AppState.editingScheduleId) {
        // Update existing
        const index = AppState.timetable.findIndex(s => s.id === AppState.editingScheduleId);
        if (index !== -1) {
            AppState.timetable[index] = {
                id: AppState.editingScheduleId,
                day, date, subject, startTime, endTime, color, lesson, notes
            };
        }
    } else {
        // Create new
        const newSession = {
            id: 't_' + Date.now(),
            day, date, subject, startTime, endTime, color, lesson, notes
        };
        AppState.timetable.push(newSession);
    }

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
    // 1. Render history list
    const container = document.getElementById('log-history-container');
    container.innerHTML = '';

    const filterMonth = document.getElementById('filter-log-month').value; // YYYY-MM

    // Filter logs by the selected month
    let filteredLogs = AppState.logs;
    if (filterMonth) {
        filteredLogs = AppState.logs.filter(log => log.date.slice(0, 7) === filterMonth);
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
    
    const user = AppState.currentUser;
    const isSenior = (user && (user.classGrade === '11th' || user.classGrade === '12th' || user.classGrade === 'Admin'));
    const subject = isSenior 
        ? document.getElementById('log-subject-select').value 
        : document.getElementById('log-subject-input').value.trim();

    const duration = parseInt(document.getElementById('log-duration').value);
    const topic = document.getElementById('log-topic').value;
    const attachment = AppState.currentUploadedFile || null;

    if (!subject) {
        alert("Please enter or select a subject.");
        return;
    }

    if (AppState.editingLogId) {
        // Edit log entry
        const index = AppState.logs.findIndex(log => log.id === AppState.editingLogId);
        if (index !== -1) {
            AppState.logs[index] = {
                id: AppState.editingLogId,
                date, subject, duration, topic,
                attachment: attachment || AppState.logs[index].attachment
            };
        }
        cancelLogEdit(); // Reset form/state
    } else {
        // Add new log entry
        const newLog = {
            id: 'l_' + Date.now(),
            date, subject, duration, topic,
            attachment: attachment
        };
        AppState.logs.push(newLog);
        
        // Reset form inputs
        document.getElementById('log-subject-select').value = "";
        document.getElementById('log-subject-input').value = "";
        document.getElementById('log-duration').value = "";
        document.getElementById('log-topic').value = "";
        document.getElementById('log-file').value = "";
    }

    saveToLocalStorage('logs');
    renderLogsView();
}

function editLogEntry(id) {
    const log = AppState.logs.find(l => l.id === id);
    if (!log) return;

    AppState.editingLogId = id;

    // Load values into form
    document.getElementById('log-id').value = log.id;
    document.getElementById('log-date').value = log.date;

    const user = AppState.currentUser;
    const isSenior = (user && (user.classGrade === '11th' || user.classGrade === '12th' || user.classGrade === 'Admin'));
    if (isSenior) {
        document.getElementById('log-subject-select').value = log.subject;
        document.getElementById('log-subject-input').value = '';
    } else {
        document.getElementById('log-subject-input').value = log.subject;
        document.getElementById('log-subject-select').value = '';
    }

    document.getElementById('log-duration').value = log.duration;
    document.getElementById('log-topic').value = log.topic;

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
    document.getElementById('log-subject-select').value = "";
    document.getElementById('log-subject-input').value = "";
    document.getElementById('log-duration').value = "";
    document.getElementById('log-topic').value = "";
    document.getElementById('log-file').value = "";

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
