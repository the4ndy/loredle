// Admin Logic
const adminToken = localStorage.getItem('loredle_token');
const role = localStorage.getItem('loredle_role');
const username = localStorage.getItem('loredle_username');

if (!adminToken || role !== 'admin') {
    window.location.href = '/index.html';
}

document.getElementById('admin-username-display').textContent = username;

document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('loredle_token');
    localStorage.removeItem('loredle_role');
    localStorage.removeItem('loredle_username');
    localStorage.removeItem('loredle_avatar');
    window.location.href = '/index.html';
});

// Navigation Logic
const navLinks = document.querySelectorAll('.nav-link[data-target]');
const sections = document.querySelectorAll('.section-view');

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        
        const targetId = link.getAttribute('data-target');
        document.getElementById('page-title').textContent = link.textContent.trim();
        
        sections.forEach(sec => sec.classList.remove('active'));
        document.getElementById('view-' + targetId).classList.add('active');
        
        if (targetId === 'dashboard') loadDashboard();
        if (targetId === 'users') loadUsers();
        if (targetId === 'scores') loadScores();
        if (targetId === 'feedback') loadFeedback();
    });
});

// API Fetch Helper
async function apiGet(endpoint) {
    const res = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${adminToken}` } });
    if (!res.ok) {
        if (res.status === 403) window.location.href = '/index.html';
        throw new Error('API Error');
    }
    return res.json();
}
async function apiPut(endpoint, body) {
    const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify(body)
    });
    return res.json();
}
async function apiPost(endpoint, body) {
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify(body)
    });
    return res.json();
}
async function apiDelete(endpoint) {
    const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    return res.json();
}

let allUsers = [];
let allScores = [];
let allFeedback = [];

const availableAvatars = [
    'default',
    'https://wiki.mushureport.com/images/2/2c/Emerald-Ink.png',
    'https://wiki.mushureport.com/images/a/ad/Sapphire-Ink.png',
    'https://wiki.mushureport.com/images/3/31/Steel-Ink.png',
    'https://wiki.mushureport.com/images/4/43/Amber-Ink.png',
    'https://wiki.mushureport.com/images/d/db/Ruby-Ink.png',
    'http://wiki.mushureport.com/images/c/cc/Amethyst-Ink.png'
];

const availableThemes = [
    { id: 'default', name: 'Default Dark' },
    { id: 'theme-light', name: 'Light Mode' },
    { id: 'theme-dracula', name: 'Dracula' },
    { id: 'theme-solarized', name: 'Solarized Dark' },
    { id: 'theme-tokyonight', name: 'Tokyo Night' },
    { id: 'theme-nightowl', name: 'Night Owl' },
    { id: 'theme-onedark', name: 'One Dark Pro' },
    { id: 'theme-synthwave', name: 'SynthWave 84' },
    { id: 'theme-gruvbox', name: 'Gruvbox' },
    { id: 'theme-catppuccin', name: 'Catppuccin' },
    { id: 'theme-nord', name: 'Nord' }
];

document.addEventListener('DOMContentLoaded', () => {
    const themeSelect = document.getElementById('edit-user-theme');
    const avatarSelect = document.getElementById('edit-user-avatar');
    if (themeSelect) {
        themeSelect.innerHTML = availableThemes.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    }
    if (avatarSelect) {
        avatarSelect.innerHTML = availableAvatars.map(a => `<option value="${a}">${a === 'default' ? 'Default' : a.split('/').pop().replace('-Ink.png', '')}</option>`).join('');
    }
});

// 1. Dashboard
async function loadDashboard() {
    try {
        const data = await apiGet('/api/admin/analytics');
        document.getElementById('stat-users').textContent = data.totalRegisteredUsers;
        document.getElementById('stat-admins').textContent = data.totalAdmins;
        document.getElementById('stat-games').textContent = data.totalGamesPlayed;
        document.getElementById('stat-fb-open').textContent = data.openFeedbacks;
        document.getElementById('stat-guess').textContent = data.mostCommonIncorrect;
        document.getElementById('stat-first').textContent = data.mostCommonFirst;

        const ctxGames = document.getElementById('gamesChart').getContext('2d');
        new Chart(ctxGames, {
            type: 'line',
            data: {
                labels: data.dates,
                datasets: [{
                    label: 'Games Played',
                    backgroundColor: 'rgba(60,141,188,0.2)',
                    borderColor: 'rgba(60,141,188,0.8)',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: 'rgba(60,141,188,1)',
                    pointHighlightFill: '#fff',
                    pointHighlightStroke: 'rgba(60,141,188,1)',
                    data: data.dailyCounts
                }]
            },
            options: {
                maintainAspectRatio: false,
                responsive: true,
                legend: { display: false },
                tooltips: {
                    mode: 'index',
                    intersect: false
                },
                hover: {
                    mode: 'nearest',
                    intersect: true
                },
                scales: {
                    xAxes: [{ gridLines: { display: false } }],
                    yAxes: [{ gridLines: { display: false }, ticks: { beginAtZero: true } }]
                }
            }
        });

        const ctxAvg = document.getElementById('avgGuessesChart').getContext('2d');
        new Chart(ctxAvg, {
            type: 'line',
            data: {
                labels: data.dates,
                datasets: [{
                    label: 'Avg Guesses',
                    backgroundColor: 'rgba(23,162,184,0.2)',
                    borderColor: 'rgba(23,162,184,0.8)',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: 'rgba(23,162,184,1)',
                    pointHighlightFill: '#fff',
                    pointHighlightStroke: 'rgba(23,162,184,1)',
                    data: data.dailyAvgGuesses
                }]
            },
            options: {
                maintainAspectRatio: false,
                responsive: true,
                legend: { display: false },
                tooltips: {
                    mode: 'index',
                    intersect: false
                },
                hover: {
                    mode: 'nearest',
                    intersect: true
                },
                scales: {
                    xAxes: [{ gridLines: { display: false } }],
                    yAxes: [{ gridLines: { display: false }, ticks: { beginAtZero: true } }]
                }
            }
        });

        if ($.fn.DataTable.isDataTable('#table-daily-stats')) {
            $('#table-daily-stats').DataTable().destroy();
        }

        const tbody = document.getElementById('daily-stats-body');
        tbody.innerHTML = data.dailyStatsTable.map(d => `
            <tr>
                <td>${d.date}</td>
                <td>${d.answerCard}</td>
                <td>${d.gamesPlayed}</td>
                <td>${d.fewestGuesses}</td>
                <td>${d.mostGuesses}</td>
                <td>${d.avgGuesses}</td>
                <td><small>${d.winners}</small></td>
                <td><small>${d.mostGuessedIncorrect}</small></td>
                <td><small>${d.mostCommonFirst}</small></td>
            </tr>
        `).join('');
        $('#table-daily-stats').DataTable({ order: [[0, 'desc']] });

    } catch (e) { console.error(e); }
}

// 2. Users
let tableUsers;
async function loadUsers() {
    try {
        allUsers = await apiGet('/api/admin/users');
        if (tableUsers) tableUsers.destroy();
        const tbody = document.getElementById('users-table-body');
        tbody.innerHTML = allUsers.map((u, idx) => `
            <tr style="cursor: pointer;" onclick="openUserModal(${idx})">
                <td>${u.username}</td>
                <td>${u.role}</td>
                <td>${u.theme || 'default'}</td>
                <td>
                    <button class="btn btn-sm btn-danger btn-action" onclick="event.stopPropagation(); deleteUser('${u._id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
        tableUsers = $('#table-users').DataTable();
    } catch (e) { console.error(e); }
}

window.openUserModal = (idx) => {
    const u = allUsers[idx];
    document.getElementById('edit-user-id').value = u._id;
    document.getElementById('edit-user-username').value = u.username;
    document.getElementById('edit-user-role').value = u.role;
    document.getElementById('edit-user-theme').value = u.theme || 'default';
    document.getElementById('edit-user-avatar').value = u.avatar || 'default';
    document.getElementById('edit-user-password').value = '';
    $('#modal-user').modal('show');
};

window.saveUser = async () => {
    const id = document.getElementById('edit-user-id').value;
    const body = {
        username: document.getElementById('edit-user-username').value,
        role: document.getElementById('edit-user-role').value,
        theme: document.getElementById('edit-user-theme').value,
        avatar: document.getElementById('edit-user-avatar').value
    };
    const newPass = document.getElementById('edit-user-password').value;
    if (newPass) body.newPassword = newPass;
    
    await apiPut(`/api/admin/users/${id}`, body);
    $('#modal-user').modal('hide');
    loadUsers();
};

window.deleteUser = async (id) => {
    if (confirm("Are you sure you want to delete this user?")) {
        await apiDelete(`/api/admin/users/${id}`);
        loadUsers();
    }
};

// 3. Scores
let tableScores;
async function loadScores() {
    try {
        allScores = await apiGet('/api/admin/scores');
        if (tableScores) tableScores.destroy();
        const tbody = document.getElementById('scores-table-body');
        tbody.innerHTML = allScores.map((s, idx) => `
            <tr style="cursor: pointer;" onclick="openScoreModal(${idx})">
                <td>${s.date}</td>
                <td>${s.username}</td>
                <td>${s.tries}</td>
                <td>
                    <button class="btn btn-sm btn-danger btn-action" onclick="event.stopPropagation(); deleteScore('${s._id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
        tableScores = $('#table-scores').DataTable();
    } catch (e) { console.error(e); }
}

window.openScoreModal = (idx) => {
    const s = allScores[idx];
    document.getElementById('edit-score-id').value = s._id;
    document.getElementById('edit-score-username').value = s.username;
    document.getElementById('edit-score-date').value = s.date;
    document.getElementById('edit-score-tries').value = s.tries;
    document.getElementById('edit-score-target').value = s.targetCard || '';
    document.getElementById('edit-score-guesses').value = (s.guesses || []).join(', ');
    $('#modal-score').modal('show');
};

window.saveScore = async () => {
    const id = document.getElementById('edit-score-id').value;
    const guessesStr = document.getElementById('edit-score-guesses').value;
    const body = {
        username: document.getElementById('edit-score-username').value,
        date: document.getElementById('edit-score-date').value,
        tries: parseInt(document.getElementById('edit-score-tries').value) || 1,
        targetCard: document.getElementById('edit-score-target').value,
        guesses: guessesStr.split(',').map(g => g.trim()).filter(g => g.length > 0)
    };
    await apiPut(`/api/admin/scores/${id}`, body);
    $('#modal-score').modal('hide');
    loadScores();
};

window.deleteScore = async (id) => {
    if (confirm("Delete this score?")) {
        await apiDelete(`/api/admin/scores/${id}`);
        loadScores();
    }
};

// 4. Feedback
let tableFeedback;
async function loadFeedback() {
    try {
        allFeedback = await apiGet('/api/admin/feedbacks');
        renderFeedbackTable();
    } catch (e) { console.error(e); }
}

function renderFeedbackTable() {
    const filter = document.getElementById('feedback-filter').value;
    const filtered = filter === 'All' ? allFeedback : allFeedback.filter(f => f.status === filter);
    
    if (tableFeedback) tableFeedback.destroy();
    const tbody = document.getElementById('feedback-table-body');
    tbody.innerHTML = filtered.map((f, idx) => {
        const globalIdx = allFeedback.findIndex(af => af._id === f._id);
        const dateStr = new Date(f.date).toLocaleDateString();
        return `
            <tr style="cursor: pointer;" onclick="openFeedbackModal(${globalIdx})">
                <td>${dateStr}</td>
                <td>${f.name}</td>
                <td><span class="badge ${f.type === 'Bug Report' ? 'bg-danger' : f.type === 'Feature Request' ? 'bg-primary' : 'bg-info'}">${f.type}</span></td>
                <td style="max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${f.text}</td>
                <td>${f.status}</td>
                <td>
                    <button class="btn btn-sm btn-danger btn-action" onclick="event.stopPropagation(); deleteFeedback('${f._id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
    tableFeedback = $('#table-feedback').DataTable();
}

document.getElementById('feedback-filter').addEventListener('change', renderFeedbackTable);

window.openFeedbackModal = (idx) => {
    const f = allFeedback[idx];
    document.getElementById('edit-fb-id').value = f._id;
    document.getElementById('view-fb-name').textContent = f.name;
    document.getElementById('view-fb-type').textContent = f.type;
    document.getElementById('view-fb-date').textContent = new Date(f.date).toLocaleDateString();
    document.getElementById('edit-fb-status').value = f.status;
    document.getElementById('view-fb-text').textContent = f.text;
    
    const notesHtml = (f.notes || []).map(n => `
        <div class="p-2 mb-2 bg-white border rounded">
            <strong>${n.author}</strong> <small class="text-muted">${new Date(n.date).toLocaleString()}</small>
            <p class="mb-0 mt-1">${n.text}</p>
        </div>
    `).join('');
    document.getElementById('view-fb-notes').innerHTML = notesHtml || '<em>No notes.</em>';
    document.getElementById('edit-fb-newnote').value = '';
    
    $('#modal-feedback').modal('show');
};

window.saveFeedback = async () => {
    const id = document.getElementById('edit-fb-id').value;
    const status = document.getElementById('edit-fb-status').value;
    await apiPut(`/api/admin/feedbacks/${id}`, { status });
    $('#modal-feedback').modal('hide');
    loadFeedback();
};

window.addFeedbackNote = async () => {
    const id = document.getElementById('edit-fb-id').value;
    const text = document.getElementById('edit-fb-newnote').value.trim();
    if (!text) return;
    
    const res = await apiPost(`/api/admin/feedbacks/${id}/notes`, { text });
    
    const fIdx = allFeedback.findIndex(f => f._id === id);
    if (fIdx > -1) {
        allFeedback[fIdx].notes = res.notes;
        openFeedbackModal(fIdx);
    }
};

window.deleteFeedback = async (id) => {
    if (confirm("Delete this feedback?")) {
        await apiDelete(`/api/admin/feedbacks/${id}`);
        loadFeedback();
    }
};

// Init
loadDashboard();
