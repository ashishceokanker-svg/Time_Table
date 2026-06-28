/**
 * Standalone Schedule Builder Page Logic
 */

// --- STATE MANAGEMENT ---
const AppState = {
    timetable: [],
    currentUser: null,
    timetablePeriod: 'week',
    theme: 'dark',
    
    get userTimetable() {
        if (!this.currentUser) return [];
        if (this.currentUser.role === 'admin' || this.currentUser.username === 'admin') {
            return this.timetable;
        }
        return this.timetable.filter(s => s.username === this.currentUser.username);
    }
};

// Base API URL resolver: points to absolute Vercel deployment URL if loaded as local file:/// (inside Android app)
const API_BASE = window.location.protocol === 'file:' ? 'https://timetable-tau-six.vercel.app' : '';

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verify Authentication State
    const savedUser = localStorage.getItem('anti_gravity_current_user');
    if (!savedUser) {
        window.location.href = 'index.html';
        return;
    }
    AppState.currentUser = JSON.parse(savedUser);

    // 2. Setup Page Shell / Layout Elements
    initLayout();
    
    // 3. Load Databases
    await loadDatabase();
    
    // 4. Setup Event Listeners
    setupEventListeners();

    // 5. Render Page View
    renderTimetableView();
});

function initLayout() {
    // Set Welcomes & Date
    document.getElementById('welcome-message').textContent = `Welcome back, ${AppState.currentUser.username}!`;
    updateHeaderDate();

    // Set logo and badges
    document.getElementById('logo-text').textContent = AppState.currentUser.username;
    if (AppState.currentUser.classGrade === 'Admin') {
        document.getElementById('logo-grade-badge').textContent = 'Admin';
    } else {
        document.getElementById('logo-grade-badge').textContent = `Class ${AppState.currentUser.classGrade}`;
    }

    // Set Profile Card
    const profileCard = document.querySelector('.user-profile');
    if (profileCard) {
        profileCard.classList.remove('hide');
        document.getElementById('profile-name').textContent = AppState.currentUser.username;
        document.getElementById('profile-status').textContent = AppState.currentUser.classGrade;
        
        const avatarDiv = document.getElementById('profile-avatar');
        if (AppState.currentUser.profilePhoto) {
            avatarDiv.innerHTML = `<img src="${AppState.currentUser.profilePhoto}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" />`;
        } else {
            avatarDiv.textContent = AppState.currentUser.username.charAt(0).toUpperCase();
        }
    }

    // Update profile photo in the sidebar header logo icon
    const headerLogoIcon = document.getElementById('logo-icon');
    if (headerLogoIcon) {
        if (AppState.currentUser.profilePhoto) {
            headerLogoIcon.innerHTML = `<img src="${AppState.currentUser.profilePhoto}" style="width: 100%; height: 100%; border-radius: inherit; object-fit: cover;" />`;
            headerLogoIcon.style.background = 'none';
            headerLogoIcon.style.boxShadow = 'none';
        } else {
            headerLogoIcon.innerHTML = `<span style="font-weight: 700; font-family: var(--font-display);">${AppState.currentUser.username.charAt(0).toUpperCase()}</span>`;
            headerLogoIcon.style.background = 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)';
            headerLogoIcon.style.boxShadow = '0 4px 10px rgba(245, 158, 11, 0.2)';
        }
    }

    // Load and Apply Theme
    const savedTheme = localStorage.getItem('anti_gravity_theme');
    AppState.theme = savedTheme || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', AppState.theme);
    updateThemeToggleUI();

    // Toggle Subject inputs based on Class Grade
    updateSubjectInputsForClass();

    // Admin nav toggle
    const adminTab = document.getElementById('nav-admin');
    const reportsTab = document.getElementById('nav-reports');
    if (AppState.currentUser.role === 'admin') {
        if (adminTab) adminTab.classList.remove('hide');
        if (reportsTab) reportsTab.classList.add('hide');
    } else {
        if (adminTab) adminTab.classList.add('hide');
        if (reportsTab) reportsTab.classList.remove('hide');
    }
}

function updateHeaderDate() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date-display').textContent = new Date().toLocaleDateString('en-US', options);
}

// --- DATABASE FUNCTIONS ---
async function loadDatabase() {
    const loader = document.getElementById('db-loader');
    if (loader) loader.classList.remove('hide');

    // First load from localStorage to keep app interactive
    const localTimetable = localStorage.getItem('anti_gravity_timetable');
    if (localTimetable) {
        AppState.timetable = JSON.parse(localTimetable);
    }

    try {
        const response = await fetch(`${API_BASE}/api/db`);
        if (response.ok) {
            const data = await response.json();
            if (data.timetable && Array.isArray(data.timetable)) {
                AppState.timetable = data.timetable;
                localStorage.setItem('anti_gravity_timetable', JSON.stringify(AppState.timetable));
            }
        }
    } catch (e) {
        console.error("Failed to load cloud database in scheduler:", e);
    } finally {
        if (loader) loader.classList.add('hide');
    }
}

function saveToLocalStorage(key) {
    if (key === 'timetable') {
        localStorage.setItem('anti_gravity_timetable', JSON.stringify(AppState.timetable));
        saveToDatabase('timetable', AppState.timetable);
    }
}

async function saveToDatabase(key, data) {
    try {
        const response = await fetch(`${API_BASE}/api/db`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, data })
        });
        return response.ok;
    } catch (e) {
        console.error("Failed to save to database:", e);
        return false;
    }
}

// --- CLASS GRADE LOGIC ---
function updateSubjectInputsForClass() {
    const isSenior = (AppState.currentUser.classGrade === '11th' || AppState.currentUser.classGrade === '12th' || AppState.currentUser.classGrade === 'Admin');
    const select = document.getElementById('create-subject-select');
    const input = document.getElementById('create-subject-input');

    if (select && input) {
        if (isSenior) {
            select.classList.remove('hide');
            select.required = true;
            input.classList.add('hide');
            input.required = false;
            input.value = '';
        } else {
            input.classList.remove('hide');
            input.required = true;
            select.classList.add('hide');
            select.required = false;
            select.value = '';
        }
    }
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    // Logout handlers
    document.getElementById('btn-logout').addEventListener('click', handleLogout);
    document.getElementById('btn-logout-header').addEventListener('click', handleLogout);

    // Theme toggler
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // Weekly / Monthly Duration Selector
    const btnWeek = document.getElementById('btn-period-week');
    const btnMonth = document.getElementById('btn-period-month');

    btnWeek.addEventListener('click', () => {
        btnWeek.classList.add('active');
        btnMonth.classList.remove('active');
        document.getElementById('group-create-day').classList.remove('hide');
        document.getElementById('group-create-date').classList.add('hide');
        document.getElementById('create-schedule-day').required = true;
        document.getElementById('create-schedule-date').required = false;
        document.getElementById('create-schedule-date').value = '';
        AppState.timetablePeriod = 'week';
        renderTimetableView();
    });

    btnMonth.addEventListener('click', () => {
        btnMonth.classList.add('active');
        btnWeek.classList.remove('active');
        document.getElementById('group-create-day').classList.add('hide');
        document.getElementById('group-create-date').classList.remove('hide');
        document.getElementById('create-schedule-day').required = false;
        document.getElementById('create-schedule-day').value = '';
        document.getElementById('create-schedule-date').required = true;
        AppState.timetablePeriod = 'month';
        renderTimetableView();
    });

    // Reset Form button
    document.getElementById('btn-reset-create-form').addEventListener('click', resetCreateTimetableForm);

    // Submit Form
    document.getElementById('create-timetable-form').addEventListener('submit', handleCreateFormSubmit);

    // Delete Button
    document.getElementById('btn-delete-create-slot').addEventListener('click', () => {
        const id = document.getElementById('create-schedule-id').value;
        if (id) deleteCreateTimetableSession(id);
    });
}

function handleLogout() {
    if (confirm("Are you sure you want to logout?")) {
        localStorage.removeItem('anti_gravity_current_user');
        window.location.href = 'index.html';
    }
}

// --- THEME ---
function toggleTheme() {
    AppState.theme = AppState.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', AppState.theme);
    localStorage.setItem('anti_gravity_theme', AppState.theme);
    updateThemeToggleUI();
}

function updateThemeToggleUI() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const icon = btn.querySelector('i');
    const span = btn.querySelector('span');

    if (AppState.theme === 'dark') {
        icon.className = 'fa-solid fa-sun';
        span.textContent = 'Light Mode';
    } else {
        icon.className = 'fa-solid fa-moon';
        span.textContent = 'Dark Mode';
    }
}

// --- TIMETABLE RENDERING ---
function renderTimetableView() {
    const container = document.getElementById('periodic-table-grid-container');
    if (!container) return;
    container.innerHTML = '';

    if (AppState.timetablePeriod === 'week') {
        renderWeeklyTimetable(container);
    } else {
        renderMonthlyTimetable(container);
    }
}

function renderWeeklyTimetable(container) {
    const wrapper = document.createElement('div');
    wrapper.className = 'periodic-table-weekly';
    
    const days = [
        { name: 'Monday', index: 1 },
        { name: 'Tuesday', index: 2 },
        { name: 'Wednesday', index: 3 },
        { name: 'Thursday', index: 4 },
        { name: 'Friday', index: 5 },
        { name: 'Saturday', index: 6 },
        { name: 'Sunday', index: 0 }
    ];

    days.forEach(dayObj => {
        const col = document.createElement('div');
        col.style.display = 'flex';
        col.style.flexDirection = 'column';
        
        const header = document.createElement('div');
        header.className = 'periodic-table-column-header';
        header.textContent = dayObj.name.substring(0, 3);
        col.appendChild(header);
        
        const cellsWrapper = document.createElement('div');
        cellsWrapper.className = 'periodic-table-column-cells';
        
        const daySessions = AppState.userTimetable.filter(s => s.day == dayObj.index);
        
        if (daySessions.length === 0) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'periodic-cell periodic-cell-empty';
            emptyCell.innerHTML = `
                <div class="periodic-symbol" style="font-size: 1rem; opacity: 0.2;"><i class="fa-solid fa-bed"></i></div>
                <div class="periodic-name" style="opacity: 0.4;">Free Day</div>
            `;
            cellsWrapper.appendChild(emptyCell);
        } else {
            daySessions.sort((a, b) => a.startTime.localeCompare(b.startTime));
            daySessions.forEach((session, idx) => {
                const cell = renderPeriodicCell(session, idx);
                cellsWrapper.appendChild(cell);
            });
        }
        
        col.appendChild(cellsWrapper);
        wrapper.appendChild(col);
    });

    container.appendChild(wrapper);
}

function renderMonthlyTimetable(container) {
    const wrapper = document.createElement('div');
    wrapper.className = 'periodic-table-monthly';
    
    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    weekDays.forEach(wd => {
        const header = document.createElement('div');
        header.className = 'periodic-month-header';
        header.textContent = wd;
        wrapper.appendChild(header);
    });

    const d = new Date();
    const year = d.getFullYear();
    const month = d.getMonth();
    
    const firstDayIndex = new Date(year, month, 1).getDay();
    const offset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    const totalDays = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < offset; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'month-day-cell';
        emptyCell.style.opacity = '0.35';
        emptyCell.style.borderStyle = 'dashed';
        wrapper.appendChild(emptyCell);
    }

    const todayStr = d.toISOString().split('T')[0];
    
    for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
        
        const cell = document.createElement('div');
        cell.className = 'month-day-cell';
        if (dateStr === todayStr) {
            cell.classList.add('today');
        }
        
        const dayNumberLabel = document.createElement('div');
        dayNumberLabel.className = 'day-number';
        dayNumberLabel.textContent = dayNum;
        cell.appendChild(dayNumberLabel);
        
        const daySessions = AppState.userTimetable.filter(s => s.date === dateStr);
        
        daySessions.forEach(session => {
            const pill = document.createElement('div');
            const colorHex = getSubjectColorHex(session.subject);
            pill.className = 'month-session-pill';
            pill.style.background = `color-mix(in srgb, ${colorHex} 15%, transparent)`;
            pill.style.border = `1px solid ${colorHex}`;
            pill.style.color = colorHex;
            
            const symbol = session.subject ? session.subject.substring(0, 2).toUpperCase() : '??';
            pill.textContent = `${symbol}: ${session.startTime}`;
            pill.title = `${session.subject}: ${session.lesson || 'Study'}\nTime: ${session.startTime} - ${session.endTime}`;
            
            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                editCreateTimetableSession(session);
            });
            
            cell.appendChild(pill);
        });

        cell.addEventListener('click', () => {
            resetCreateTimetableForm();
            if (AppState.timetablePeriod === 'month') {
                document.getElementById('create-schedule-date').value = dateStr;
            }
        });
        
        wrapper.appendChild(cell);
    }

    container.appendChild(wrapper);
}

function renderPeriodicCell(session, index) {
    const cell = document.createElement('div');
    cell.className = 'periodic-cell';
    const colorHex = getSubjectColorHex(session.subject);
    
    cell.style.background = `color-mix(in srgb, ${colorHex} 12%, var(--card-bg-fallback, rgba(20, 20, 20, 0.4)))`;
    cell.style.border = `1.5px solid ${colorHex}`;
    
    const symbol = session.subject ? session.subject.substring(0, 2).toUpperCase() : '??';
    
    cell.innerHTML = `
        <div class="periodic-number">${index + 1}</div>
        <div class="periodic-time" style="color: ${colorHex};">${session.startTime}</div>
        <div class="periodic-symbol" style="color: ${colorHex};">${symbol}</div>
        <div class="periodic-name" title="${session.lesson || 'Study'}">${session.lesson || 'Study'}</div>
    `;
    
    cell.addEventListener('click', () => {
        editCreateTimetableSession(session);
    });
    
    return cell;
}

// --- CRUD OPERATORS ---
function showCreateTimetableError(msg) {
    const errorDiv = document.getElementById('create-timetable-error-msg');
    if (errorDiv) {
        errorDiv.textContent = msg;
        errorDiv.classList.remove('hide');
    }
}

function hideCreateTimetableError() {
    const errorDiv = document.getElementById('create-timetable-error-msg');
    if (errorDiv) {
        errorDiv.classList.add('hide');
        errorDiv.textContent = '';
    }
}

function resetCreateTimetableForm() {
    document.getElementById('create-schedule-id').value = '';
    document.getElementById('create-schedule-day').value = '';
    document.getElementById('create-schedule-date').value = '';
    
    document.getElementById('create-subject-select').value = '';
    document.getElementById('create-subject-input').value = '';
    document.getElementById('create-schedule-lesson').value = '';
    document.getElementById('create-schedule-notes').value = '';
    
    const firstRadio = document.querySelector('input[name="create-schedule-color"]');
    if (firstRadio) firstRadio.checked = true;
    
    document.getElementById('btn-save-create-slot').innerHTML = '<i class="fa-solid fa-circle-check"></i> Save Slot';
    
    const deleteBtn = document.getElementById('btn-delete-create-slot');
    if (deleteBtn) deleteBtn.classList.add('hide');
    
    if (AppState.timetablePeriod === 'week') {
        document.getElementById('create-schedule-day').required = true;
        document.getElementById('create-schedule-date').required = false;
    } else {
        document.getElementById('create-schedule-day').required = false;
        document.getElementById('create-schedule-date').required = true;
    }
    
    hideCreateTimetableError();
}

async function handleCreateFormSubmit(e) {
    e.preventDefault();
    hideCreateTimetableError();

    const user = AppState.currentUser;
    const isSenior = (user.classGrade === '11th' || user.classGrade === '12th' || user.classGrade === 'Admin');
    const subject = isSenior 
        ? document.getElementById('create-subject-select').value 
        : document.getElementById('create-subject-input').value.trim();

    if (!subject) {
        showCreateTimetableError("Please enter or select a subject.");
        return;
    }

    const startTime = document.getElementById('create-schedule-start-time').value;
    const endTime = document.getElementById('create-schedule-end-time').value;
    const lesson = document.getElementById('create-schedule-lesson').value.trim();
    const notes = document.getElementById('create-schedule-notes').value.trim();
    const color = document.querySelector('input[name="create-schedule-color"]:checked').value;
    
    if (startTime >= endTime) {
        showCreateTimetableError("Start time must be before end time!");
        return;
    }

    let day, date;
    if (AppState.timetablePeriod === 'week') {
        const dayVal = document.getElementById('create-schedule-day').value;
        if (!dayVal) {
            showCreateTimetableError("Please select a day of the week.");
            return;
        }
        day = parseInt(dayVal);
        date = getDateOfCurrentWeek(day);
    } else {
        const dateVal = document.getElementById('create-schedule-date').value;
        if (!dateVal) {
            showCreateTimetableError("Please select a date.");
            return;
        }
        date = dateVal;
        day = getDayFromDate(date);
    }

    const id = document.getElementById('create-schedule-id').value;

    if (id) {
        const index = AppState.timetable.findIndex(s => s.id === id);
        if (index !== -1) {
            const oldSession = AppState.timetable[index];
            AppState.timetable[index] = {
                id,
                username: oldSession.username || user.username,
                day, date, subject, startTime, endTime, color, lesson, notes
            };
        }
    } else {
        const newSession = {
            id: 't_' + Date.now(),
            username: user.username,
            day, date, subject, startTime, endTime, color, lesson, notes
        };
        AppState.timetable.push(newSession);
    }

    saveToLocalStorage('timetable');
    resetCreateTimetableForm();
    renderTimetableView();
}

function editCreateTimetableSession(session) {
    document.getElementById('create-schedule-id').value = session.id;
    
    if (AppState.timetablePeriod === 'week') {
        document.getElementById('create-schedule-day').value = session.day;
    } else {
        document.getElementById('create-schedule-date').value = session.date || '';
    }

    const isSenior = (AppState.currentUser.classGrade === '11th' || AppState.currentUser.classGrade === '12th' || AppState.currentUser.classGrade === 'Admin');
    if (isSenior) {
        document.getElementById('create-subject-select').value = session.subject;
        document.getElementById('create-subject-input').value = '';
    } else {
        document.getElementById('create-subject-input').value = session.subject;
        document.getElementById('create-subject-select').value = '';
    }

    document.getElementById('create-schedule-start-time').value = session.startTime;
    document.getElementById('create-schedule-end-time').value = session.endTime;
    document.getElementById('create-schedule-lesson').value = session.lesson || '';
    document.getElementById('create-schedule-notes').value = session.notes || '';

    const radio = document.querySelector(`input[name="create-schedule-color"][value="${session.color}"]`);
    if (radio) radio.checked = true;

    document.getElementById('btn-save-create-slot').innerHTML = '<i class="fa-solid fa-circle-check"></i> Update Slot';
    
    const deleteBtn = document.getElementById('btn-delete-create-slot');
    if (deleteBtn) deleteBtn.classList.remove('hide');
    
    document.getElementById('timetable-form-card').scrollIntoView({ behavior: 'smooth' });
}

function deleteCreateTimetableSession(id) {
    if (confirm("Are you sure you want to delete this study session from your timetable?")) {
        AppState.timetable = AppState.timetable.filter(s => s.id !== id);
        saveToLocalStorage('timetable');
        renderTimetableView();
        
        if (document.getElementById('create-schedule-id').value === id) {
            resetCreateTimetableForm();
        }
    }
}

// --- UTILS ---
function getDateOfCurrentWeek(dayIndex) {
    const today = new Date();
    const currentDay = today.getDay();
    const currentDayNorm = currentDay === 0 ? 7 : currentDay;
    const targetDayNorm = dayIndex === 0 ? 7 : dayIndex;
    const diff = targetDayNorm - currentDayNorm;
    
    const d = new Date(today);
    d.setDate(today.getDate() + diff);
    return d.toISOString().split('T')[0];
}

function getDayFromDate(dateStr) {
    const parts = dateStr.split('-');
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.getDay();
}

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
