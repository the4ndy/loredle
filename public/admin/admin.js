// ==========================================================================
// LOREDLE v3.0 — NEO-BRUTALIST ADMIN COMMAND CENTER LOGIC
// ==========================================================================

const adminToken = localStorage.getItem('loredle_token');
const role = localStorage.getItem('loredle_role');
const username = localStorage.getItem('loredle_username');

if (!adminToken || role !== 'admin') {
    window.location.href = '/index.html';
}

document.getElementById('admin-username-display').textContent = username || 'Admin';

document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('loredle_token');
    localStorage.removeItem('loredle_role');
    localStorage.removeItem('loredle_username');
    localStorage.removeItem('loredle_avatar');
    window.location.href = '/index.html';
});

function showAdminToast(message) {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3200);
    }
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

window.closeAdminModal = (id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
};

// Navigation Logic
const navButtons = document.querySelectorAll('.admin-nav-btn[data-target]');
const sections = document.querySelectorAll('.section-view');

navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const targetId = btn.getAttribute('data-target');
        document.getElementById('page-title').textContent = btn.textContent.trim();

        sections.forEach(sec => sec.classList.remove('active'));
        document.getElementById('view-' + targetId)?.classList.add('active');

        if (targetId === 'dashboard') loadDashboard();
        if (targetId === 'schedule') loadSchedule();
        if (targetId === 'cardsdb') loadCardsDbStatus();
        if (targetId === 'users') loadUsers();
        if (targetId === 'scores') loadScoresAndArcade();
        if (targetId === 'feedback') loadFeedback();
        if (targetId === 'ga') loadGA();
        if (targetId === 'discord') loadDiscordWebhooks();
        if (targetId === 'announcements') loadSystemAnnouncement();
    });
});

// API Fetch Helpers
async function apiGet(endpoint) {
    const res = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${adminToken}` } });
    if (!res.ok) {
        if (res.status === 401 || res.status === 403) window.location.href = '/index.html';
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
    return { ok: res.ok, data: await res.json() };
}

async function apiPost(endpoint, body = {}) {
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify(body)
    });
    return { ok: res.ok, data: await res.json() };
}

async function apiDelete(endpoint) {
    const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    return { ok: res.ok, data: await res.json() };
}

let allUsers = [];
let allScores = [];
let allFeedback = [];
let allDailyStats = [];
let adminCardsCatalog = [];

const availableThemes = [
    { id: 'default', name: 'Loredle Dark (Default)' },
    { id: 'theme-light', name: 'Loredle Light' },
    { id: 'theme-synthwave', name: 'SynthWave 84' },
    { id: 'theme-dracula', name: 'Dracula' },
    { id: 'theme-tokyonight', name: 'Tokyo Night' },
    { id: 'theme-catppuccin', name: 'Catppuccin' },
    { id: 'theme-nightowl', name: 'Night Owl' },
    { id: 'theme-onedark', name: 'One Dark Pro' },
    { id: 'theme-gruvbox', name: 'Gruvbox' },
    { id: 'theme-solarized', name: 'Solarized Dark' },
    { id: 'theme-nord', name: 'Nord' }
];

document.addEventListener('DOMContentLoaded', async () => {
    const themeSelect = document.getElementById('edit-user-theme');
    if (themeSelect) {
        themeSelect.innerHTML = availableThemes.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    }

    // Bind table search filters
    document.getElementById('search-daily-stats')?.addEventListener('input', renderDailyStatsTable);
    document.getElementById('search-users')?.addEventListener('input', renderUsersTable);
    document.getElementById('search-scores')?.addEventListener('input', renderScoresTable);

    setupScheduleAutocomplete();
    loadDashboard();
});

// --- 1. DASHBOARD ---
let gamesChartInst = null;
let avgChartInst = null;

async function loadDashboard() {
    try {
        const data = await apiGet('/api/admin/analytics');
        document.getElementById('stat-users').textContent = data.totalRegisteredUsers;
        document.getElementById('stat-admins').textContent = data.totalAdmins;
        document.getElementById('stat-games').textContent = data.totalGamesPlayed;
        document.getElementById('stat-fb-open').textContent = data.openFeedbacks;
        document.getElementById('stat-guess').textContent = data.mostCommonIncorrect;
        document.getElementById('stat-first').textContent = data.mostCommonFirst;

        if (gamesChartInst) gamesChartInst.destroy();
        const ctxGames = document.getElementById('gamesChart').getContext('2d');
        gamesChartInst = new Chart(ctxGames, {
            type: 'line',
            data: {
                labels: data.dates,
                datasets: [{
                    label: 'Games Played',
                    backgroundColor: 'rgba(44, 229, 198, 0.2)',
                    borderColor: '#2ce5c6',
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: '#ff47ab',
                    data: data.dailyCounts
                }]
            },
            options: {
                maintainAspectRatio: false,
                responsive: true,
                legend: { display: false },
                scales: {
                    xAxes: [{ ticks: { fontColor: '#c5b9e6' }, gridLines: { color: 'rgba(255,255,255,0.06)' } }],
                    yAxes: [{ ticks: { beginAtZero: true, fontColor: '#c5b9e6' }, gridLines: { color: 'rgba(255,255,255,0.06)' } }]
                }
            }
        });

        if (avgChartInst) avgChartInst.destroy();
        const ctxAvg = document.getElementById('avgGuessesChart').getContext('2d');
        avgChartInst = new Chart(ctxAvg, {
            type: 'line',
            data: {
                labels: data.dates,
                datasets: [{
                    label: 'Avg Guesses',
                    backgroundColor: 'rgba(255, 71, 171, 0.2)',
                    borderColor: '#ff47ab',
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: '#ffd166',
                    data: data.dailyAvgGuesses
                }]
            },
            options: {
                maintainAspectRatio: false,
                responsive: true,
                legend: { display: false },
                scales: {
                    xAxes: [{ ticks: { fontColor: '#c5b9e6' }, gridLines: { color: 'rgba(255,255,255,0.06)' } }],
                    yAxes: [{ ticks: { beginAtZero: true, fontColor: '#c5b9e6' }, gridLines: { color: 'rgba(255,255,255,0.06)' } }]
                }
            }
        });

        allDailyStats = (data.dailyStatsTable || []).slice().reverse();
        renderDailyStatsTable();
    } catch (e) {
        console.error('Error loading dashboard:', e);
    }
}

function renderDailyStatsTable() {
    const q = (document.getElementById('search-daily-stats')?.value || '').toLowerCase();
    const tbody = document.getElementById('daily-stats-body');
    if (!tbody) return;

    const filtered = allDailyStats.filter(d =>
        !q ||
        d.date.toLowerCase().includes(q) ||
        (d.answerCard || '').toLowerCase().includes(q) ||
        (d.winners || '').toLowerCase().includes(q)
    );

    tbody.innerHTML = filtered.map(d => `
        <tr>
            <td style="font-family: var(--font-mono); font-weight: 700;">${escapeHtml(d.date)}</td>
            <td style="font-weight: 700; color: var(--secondary-color);">${escapeHtml(d.answerCard)}</td>
            <td style="font-family: var(--font-mono);">${d.gamesPlayed}</td>
            <td style="font-family: var(--font-mono); color: var(--correct);">${d.fewestGuesses}</td>
            <td style="font-family: var(--font-mono); color: var(--incorrect);">${d.mostGuesses}</td>
            <td style="font-family: var(--font-mono);">${d.avgGuesses}</td>
            <td><small>${escapeHtml(d.winners)}</small></td>
            <td><small>${escapeHtml(d.mostGuessedIncorrect)}</small></td>
            <td><small>${escapeHtml(d.mostCommonFirst)}</small></td>
        </tr>
    `).join('');
}

// --- 2. DAILY CARD SCHEDULER & PREVIEWER ---
async function ensureAdminCardsLoaded() {
    if (adminCardsCatalog.length > 0) return adminCardsCatalog;
    const res = await fetch('/api/cards');
    const data = await res.json();
    adminCardsCatalog = data.cards || [];
    return adminCardsCatalog;
}

function setupScheduleAutocomplete() {
    const input = document.getElementById('sched-card-input');
    const list = document.getElementById('sched-suggestions');
    if (!input || !list) return;

    input.addEventListener('input', async () => {
        await ensureAdminCardsLoaded();
        const val = input.value.trim().toLowerCase();
        list.innerHTML = '';
        if (!val) {
            list.style.display = 'none';
            return;
        }
        const tokens = val.split(/[\s-]+/).filter(Boolean);
        const matches = adminCardsCatalog.filter(c => {
            const hay = c.name.toLowerCase();
            return tokens.every(t => hay.includes(t));
        }).slice(0, 30);

        if (matches.length === 0) {
            list.style.display = 'none';
            return;
        }
        list.style.display = 'block';
        matches.forEach(c => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span><strong>${escapeHtml(c.name)}</strong> <small style="opacity:0.75;">(${escapeHtml(c.setCode)} #${c.number})</small></span>
                <span class="sug-badge">${escapeHtml(c.colors.join('/'))}</span>
            `;
            li.onclick = () => {
                input.value = c.name;
                list.style.display = 'none';
            };
            list.appendChild(li);
        });
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !list.contains(e.target)) {
            list.style.display = 'none';
        }
    });
}

async function loadSchedule() {
    try {
        const data = await apiGet('/api/admin/daily-schedule');
        const dateInp = document.getElementById('sched-date-input');
        if (dateInp && !dateInp.value) dateInp.value = data.today;

        const tbody = document.getElementById('schedule-table-body');
        tbody.innerHTML = (data.schedule || []).map(item => {
            const badgeClass = item.status.includes('Admin')
                ? 'pink'
                : item.status === 'Locked' ? 'teal' : 'gold';
            const rowStyle = item.isToday ? 'background: rgba(157, 123, 255, 0.22);' : '';
            const cd = item.cardDetails;

            return `
                <tr style="${rowStyle}">
                    <td style="font-family: var(--font-mono); font-weight: 700;">
                        ${escapeHtml(item.date)}
                        ${item.isToday ? '<span class="status-pill purple" style="margin-left:6px;">TODAY</span>' : ''}
                    </td>
                    <td><span class="status-pill ${badgeClass}">${escapeHtml(item.status)}</span></td>
                    <td>
                        ${cd && cd.image ? `<img src="${escapeHtml(cd.image)}" style="width: 40px; height: 56px; object-fit: cover; border: 2px solid #000; border-radius: 4px;">` : '-'}
                    </td>
                    <td style="font-weight: 700; color: var(--secondary-color);">${escapeHtml(item.targetCard)}</td>
                    <td>${cd ? `${escapeHtml(cd.set)} <small>[${escapeHtml(cd.setCode)} #${cd.number}]</small>` : '-'}</td>
                    <td>${cd ? `${escapeHtml(cd.colors.join('/'))} · ⬡${cd.cost} · ${escapeHtml(cd.rarity)}` : '-'}</td>
                    <td>
                        <button class="btn minimal-btn" style="padding: 4px 10px; font-size: 0.75rem;" onclick="prefillSchedule('${escapeHtml(item.date)}', '${escapeHtml(item.targetCard).replace(/'/g, "\\'")}')">✏️ Override</button>
                        ${(!item.isPast && !item.isToday && item.status !== 'Auto-Preview')
                            ? `<button class="btn pink-btn" style="padding: 4px 10px; font-size: 0.75rem;" onclick="revertSchedule('${escapeHtml(item.date)}')">↺ Auto</button>`
                            : ''}
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.error('Error loading schedule:', e);
    }
}

window.prefillSchedule = (dateStr, cardName) => {
    const dateInp = document.getElementById('sched-date-input');
    const cardInp = document.getElementById('sched-card-input');
    if (dateInp) dateInp.value = dateStr;
    if (cardInp) {
        cardInp.value = cardName;
        cardInp.focus();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.saveScheduledCard = async () => {
    const date = document.getElementById('sched-date-input')?.value;
    const targetCard = document.getElementById('sched-card-input')?.value.trim();
    if (!date || !targetCard) {
        return showAdminToast('Select both a date and a card name.');
    }
    const { ok, data } = await apiPut('/api/admin/daily-schedule', { date, targetCard });
    if (ok) {
        showAdminToast(data.message || 'Scheduled!');
        document.getElementById('sched-card-input').value = '';
        loadSchedule();
    } else {
        showAdminToast(data.error || 'Failed to schedule card.');
    }
};

window.revertSchedule = async (dateStr) => {
    const { ok, data } = await apiDelete(`/api/admin/daily-schedule/${encodeURIComponent(dateStr)}`);
    if (ok) {
        showAdminToast(data.message || 'Reverted to auto PRNG.');
        loadSchedule();
    } else {
        showAdminToast(data.error || 'Failed to revert.');
    }
};

// --- 3. CARD DB & SYNC ---
async function loadCardsDbStatus() {
    try {
        const data = await apiGet('/api/admin/cards-status');
        document.getElementById('db-stat-canonical').textContent = data.totalCanonicalCards;
        document.getElementById('db-stat-raw').textContent = data.rawPrintingsCount;
        document.getElementById('db-stat-sets').textContent = data.totalSets;
        document.getElementById('db-stat-source').textContent = data.source;
        document.getElementById('db-stat-lastsync').textContent = data.lastSync ? new Date(data.lastSync).toLocaleString() : '-';
        document.getElementById('db-stat-hash').textContent = data.versionHash || '-';

        const tbody = document.getElementById('db-sets-table-body');
        tbody.innerHTML = Object.entries(data.setsBreakdown || {}).map(([setLabel, count]) => `
            <tr>
                <td style="font-weight: 700;">${escapeHtml(setLabel)}</td>
                <td style="font-family: var(--font-mono); color: var(--secondary-color); font-weight: 700;">${count} cards</td>
            </tr>
        `).join('');
    } catch (e) {
        console.error('Error loading card DB status:', e);
    }
}

window.triggerManualCardSync = async () => {
    showAdminToast('Syncing with cards.disneylorcana.com...');
    const { ok, data } = await apiPost('/api/admin/cards-sync');
    if (ok) {
        showAdminToast(`Synced ${data.totalCanonicalCards} canonical cards!`);
        if (document.getElementById('view-cardsdb').classList.contains('active')) {
            loadCardsDbStatus();
        }
    } else {
        showAdminToast(data.error || 'Card sync failed.');
    }
};

window.testDiscordWebhook = async () => {
    const { ok, data } = await apiPost('/api/admin/test-webhook');
    showAdminToast(ok ? (data.message || 'Discord webhook verified!') : (data.error || 'Webhook failed.'));
};

// --- 4. USERS ---
async function loadUsers() {
    try {
        allUsers = await apiGet('/api/admin/users');
        renderUsersTable();
    } catch (e) {
        console.error('Error loading users:', e);
    }
}

function renderUsersTable() {
    const q = (document.getElementById('search-users')?.value || '').toLowerCase();
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    const filtered = allUsers.filter(u =>
        !q ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q)
    );

    tbody.innerHTML = filtered.map(u => {
        const idx = allUsers.findIndex(orig => orig._id === u._id);
        return `
            <tr style="cursor: pointer;" onclick="openUserModal(${idx})">
                <td style="font-weight: 700;">${escapeHtml(u.username)}</td>
                <td><span class="status-pill ${u.role === 'admin' ? 'pink' : 'teal'}">${escapeHtml(u.role)}</span></td>
                <td style="font-family: var(--font-mono);">${escapeHtml(u.theme || 'default')}</td>
                <td>
                    <button class="btn pink-btn" style="padding: 4px 10px; font-size: 0.75rem;" onclick="event.stopPropagation(); deleteUser('${u._id}')">🗑️ Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

window.openUserModal = (idx) => {
    const u = allUsers[idx];
    if (!u) return;
    document.getElementById('edit-user-id').value = u._id;
    document.getElementById('edit-user-username').value = u.username;
    document.getElementById('edit-user-role').value = u.role;
    document.getElementById('edit-user-theme').value = u.theme || 'default';
    document.getElementById('edit-user-avatar').value = u.avatar || 'default';
    document.getElementById('edit-user-password').value = '';
    document.getElementById('modal-user').style.display = 'flex';
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
    closeAdminModal('modal-user');
    showAdminToast('User updated!');
    loadUsers();
};

window.deleteUser = async (id) => {
    if (confirm('Are you sure you want to delete this user?')) {
        await apiDelete(`/api/admin/users/${id}`);
        showAdminToast('User deleted.');
        loadUsers();
    }
};

// --- 5. SCORES & ARCADE MODERATION ---
async function loadScoresAndArcade() {
    try {
        const [scores, arcadeScores] = await Promise.all([
            apiGet('/api/admin/scores'),
            apiGet('/api/admin/arcade-scores')
        ]);
        allScores = scores;
        renderScoresTable();

        const arcadeBody = document.getElementById('admin-arcade-table-body');
        if (arcadeBody) {
            arcadeBody.innerHTML = (arcadeScores || []).map((a, i) => `
                <tr>
                    <td style="font-family: var(--font-mono); font-weight: 700;">#${i + 1}</td>
                    <td style="font-size: 1.35rem; letter-spacing: 3px;">${escapeHtml(a.emojis)}</td>
                    <td style="font-family: var(--font-mono); font-weight: 700; color: var(--secondary-color);">${a.score}</td>
                    <td style="font-family: var(--font-mono);">${a.date ? new Date(a.date).toLocaleDateString() : '-'}</td>
                    <td>
                        <button class="btn pink-btn" style="padding: 4px 10px; font-size: 0.75rem;" onclick="deleteArcadeScore('${a._id}')">🗑️ Delete</button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (e) {
        console.error('Error loading scores:', e);
    }
}

function renderScoresTable() {
    const q = (document.getElementById('search-scores')?.value || '').toLowerCase();
    const tbody = document.getElementById('scores-table-body');
    if (!tbody) return;

    const filtered = allScores.filter(s =>
        !q ||
        (s.username || '').toLowerCase().includes(q) ||
        (s.date || '').toLowerCase().includes(q) ||
        (s.targetCard || '').toLowerCase().includes(q)
    );

    tbody.innerHTML = filtered.map(s => {
        const idx = allScores.findIndex(orig => orig._id === s._id);
        return `
            <tr style="cursor: pointer;" onclick="openScoreModal(${idx})">
                <td style="font-family: var(--font-mono);">${escapeHtml(s.date)}</td>
                <td style="font-weight: 700;">${escapeHtml(s.username)}</td>
                <td style="font-family: var(--font-mono); font-weight: 700; color: var(--secondary-color);">${s.tries}</td>
                <td>${escapeHtml(s.targetCard || 'Unknown')}</td>
                <td>
                    <button class="btn pink-btn" style="padding: 4px 10px; font-size: 0.75rem;" onclick="event.stopPropagation(); deleteScore('${s._id}')">🗑️ Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

window.openScoreModal = (idx) => {
    const s = allScores[idx];
    if (!s) return;
    document.getElementById('edit-score-id').value = s._id;
    document.getElementById('edit-score-username').value = s.username;
    document.getElementById('edit-score-date').value = s.date;
    document.getElementById('edit-score-tries').value = s.tries;
    document.getElementById('edit-score-target').value = s.targetCard || '';
    document.getElementById('edit-score-guesses').value = (s.guesses || []).join(', ');
    document.getElementById('modal-score').style.display = 'flex';
};

window.saveScore = async () => {
    const id = document.getElementById('edit-score-id').value;
    const guessesStr = document.getElementById('edit-score-guesses').value;
    const body = {
        username: document.getElementById('edit-score-username').value,
        date: document.getElementById('edit-score-date').value,
        tries: parseInt(document.getElementById('edit-score-tries').value, 10) || 1,
        targetCard: document.getElementById('edit-score-target').value,
        guesses: guessesStr.split(',').map(g => g.trim()).filter(g => g.length > 0)
    };
    await apiPut(`/api/admin/scores/${id}`, body);
    closeAdminModal('modal-score');
    showAdminToast('Score updated!');
    loadScoresAndArcade();
};

window.deleteScore = async (id) => {
    if (confirm('Delete this daily score?')) {
        await apiDelete(`/api/admin/scores/${id}`);
        showAdminToast('Score deleted.');
        loadScoresAndArcade();
    }
};

window.deleteArcadeScore = async (id) => {
    if (confirm('Delete this Version Trainer arcade entry?')) {
        await apiDelete(`/api/admin/arcade-scores/${id}`);
        showAdminToast('Arcade score deleted.');
        loadScoresAndArcade();
    }
};

// --- 6. FEEDBACK ---
async function loadFeedback() {
    try {
        allFeedback = await apiGet('/api/admin/feedbacks');
        renderFeedbackTable();
    } catch (e) {
        console.error('Error loading feedback:', e);
    }
}

function renderFeedbackTable() {
    const filter = document.getElementById('feedback-filter').value;
    const filtered = filter === 'All' ? allFeedback : allFeedback.filter(f => f.status === filter);
    const tbody = document.getElementById('feedback-table-body');
    if (!tbody) return;

    tbody.innerHTML = filtered.map(f => {
        const globalIdx = allFeedback.findIndex(af => af._id === f._id);
        const dateStr = new Date(f.date).toLocaleDateString();
        const typeColor = f.type === 'Bug Report' ? 'pink' : f.type === 'Feature Request' ? 'teal' : 'purple';
        const statusColor = f.status === 'Open' ? 'gold' : f.status === 'In Progress' ? 'teal' : 'purple';
        return `
            <tr style="cursor: pointer;" onclick="openFeedbackModal(${globalIdx})">
                <td style="font-family: var(--font-mono);">${dateStr}</td>
                <td style="font-weight: 700;">${escapeHtml(f.name)}</td>
                <td><span class="status-pill ${typeColor}">${escapeHtml(f.type)}</span></td>
                <td style="max-width: 340px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(f.text)}</td>
                <td><span class="status-pill ${statusColor}">${escapeHtml(f.status)}</span></td>
                <td>
                    <button class="btn pink-btn" style="padding: 4px 10px; font-size: 0.75rem;" onclick="event.stopPropagation(); deleteFeedback('${f._id}')">🗑️ Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

document.getElementById('feedback-filter')?.addEventListener('change', renderFeedbackTable);

window.openFeedbackModal = (idx) => {
    const f = allFeedback[idx];
    if (!f) return;
    document.getElementById('edit-fb-id').value = f._id;
    document.getElementById('view-fb-name').textContent = f.name;
    document.getElementById('view-fb-type').textContent = f.type;
    document.getElementById('view-fb-date').textContent = new Date(f.date).toLocaleDateString();
    document.getElementById('edit-fb-status').value = f.status;
    document.getElementById('view-fb-text').textContent = f.text;

    const notesHtml = (f.notes || []).map(n => `
        <div style="padding: 8px 10px; margin-bottom: 8px; background: var(--bg-card); border: 2px solid #000; border-radius: 6px;">
            <strong style="color: var(--secondary-color);">${escapeHtml(n.author)}</strong>
            <small style="color: var(--text-secondary); margin-left: 6px;">${new Date(n.date).toLocaleString()}</small>
            <p style="margin: 4px 0 0 0;">${escapeHtml(n.text)}</p>
        </div>
    `).join('');
    document.getElementById('view-fb-notes').innerHTML = notesHtml || '<em style="color: var(--text-secondary);">No internal notes yet.</em>';
    document.getElementById('edit-fb-newnote').value = '';
    document.getElementById('modal-feedback').style.display = 'flex';
};

window.saveFeedback = async () => {
    const id = document.getElementById('edit-fb-id').value;
    const status = document.getElementById('edit-fb-status').value;
    await apiPut(`/api/admin/feedbacks/${id}`, { status });
    closeAdminModal('modal-feedback');
    showAdminToast('Feedback status updated!');
    loadFeedback();
};

window.addFeedbackNote = async () => {
    const id = document.getElementById('edit-fb-id').value;
    const text = document.getElementById('edit-fb-newnote').value.trim();
    if (!text) return;

    const { ok, data } = await apiPost(`/api/admin/feedbacks/${id}/notes`, { text });
    if (ok) {
        const fIdx = allFeedback.findIndex(f => f._id === id);
        if (fIdx > -1) {
            allFeedback[fIdx].notes = data.notes;
            openFeedbackModal(fIdx);
        }
        showAdminToast('Note added!');
    }
};

window.deleteFeedback = async (id) => {
    if (confirm('Delete this feedback entry?')) {
        await apiDelete(`/api/admin/feedbacks/${id}`);
        showAdminToast('Feedback deleted.');
        loadFeedback();
    }
};

// --- 7. GOOGLE ANALYTICS 4 ---
let gaDailyChartObj, gaDeviceChartObj, gaSourceChartObj, gaNewRetChartObj, gaOSChartObj, gaBrowserChartObj;

const BRUTAL_PALETTE = ['#2ce5c6', '#ff47ab', '#9d7bff', '#ffd166', '#6955a4', '#ff477e', '#4ad2b8', '#c5b9e6'];

async function loadGA() {
    try {
        const data = await apiGet('/api/admin/ga-data');

        document.getElementById('ga-stat-realtime').textContent = data.activeUsers;
        document.getElementById('ga-stat-sessions').textContent = data.totals.sessions;
        document.getElementById('ga-stat-users').textContent = data.totals.users;
        document.getElementById('ga-stat-pageviews').textContent = data.totals.pageviews;

        document.getElementById('ga-stat-engagement').textContent = `${(data.engagement.engagementRate * 100).toFixed(1)}%`;
        document.getElementById('ga-stat-bounce').textContent = `${(data.engagement.bounceRate * 100).toFixed(1)}%`;
        document.getElementById('ga-stat-duration').textContent = `${data.engagement.averageSessionDuration}s`;

        const newUsersObj = data.newVsReturning.find(n => n.type === 'new');
        document.getElementById('ga-stat-new').textContent = newUsersObj ? newUsersObj.sessions : 0;

        const labels = data.dailyData.map(d => {
            const str = d.date;
            return `${str.substring(0, 4)}-${str.substring(4, 6)}-${str.substring(6, 8)}`;
        });

        if (gaDailyChartObj) gaDailyChartObj.destroy();
        gaDailyChartObj = new Chart(document.getElementById('gaDailyChart').getContext('2d'), {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'Sessions', data: data.dailyData.map(d => d.sessions), borderColor: '#2ce5c6', backgroundColor: 'transparent', borderWidth: 3 },
                    { label: 'Users', data: data.dailyData.map(d => d.users), borderColor: '#ff47ab', backgroundColor: 'transparent', borderWidth: 3 },
                    { label: 'Pageviews', data: data.dailyData.map(d => d.pageviews), borderColor: '#ffd166', backgroundColor: 'transparent', borderWidth: 3 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, legend: { labels: { fontColor: '#fff' } } }
        });

        if (gaDeviceChartObj) gaDeviceChartObj.destroy();
        gaDeviceChartObj = new Chart(document.getElementById('gaDeviceChart').getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: data.devices.map(d => d.category),
                datasets: [{ data: data.devices.map(d => d.sessions), backgroundColor: BRUTAL_PALETTE }]
            },
            options: { responsive: true, maintainAspectRatio: false, legend: { labels: { fontColor: '#fff' } } }
        });

        if (gaSourceChartObj) gaSourceChartObj.destroy();
        gaSourceChartObj = new Chart(document.getElementById('gaSourceChart').getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: data.sources.map(d => d.source),
                datasets: [{ data: data.sources.map(d => d.sessions), backgroundColor: BRUTAL_PALETTE }]
            },
            options: { responsive: true, maintainAspectRatio: false, legend: { labels: { fontColor: '#fff' } } }
        });

        if (gaNewRetChartObj) gaNewRetChartObj.destroy();
        gaNewRetChartObj = new Chart(document.getElementById('gaNewRetChart').getContext('2d'), {
            type: 'pie',
            data: {
                labels: data.newVsReturning.map(d => d.type),
                datasets: [{ data: data.newVsReturning.map(d => d.sessions), backgroundColor: ['#2ce5c6', '#9d7bff'] }]
            },
            options: { responsive: true, maintainAspectRatio: false, legend: { labels: { fontColor: '#fff' } } }
        });

        if (gaOSChartObj) gaOSChartObj.destroy();
        gaOSChartObj = new Chart(document.getElementById('gaOSChart').getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: data.operatingSystems.map(d => d.os),
                datasets: [{ data: data.operatingSystems.map(d => d.sessions), backgroundColor: BRUTAL_PALETTE }]
            },
            options: { responsive: true, maintainAspectRatio: false, legend: { labels: { fontColor: '#fff' } } }
        });

        if (gaBrowserChartObj) gaBrowserChartObj.destroy();
        gaBrowserChartObj = new Chart(document.getElementById('gaBrowserChart').getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: data.browsers.map(d => d.browser),
                datasets: [{ data: data.browsers.map(d => d.sessions), backgroundColor: BRUTAL_PALETTE }]
            },
            options: { responsive: true, maintainAspectRatio: false, legend: { labels: { fontColor: '#fff' } } }
        });

        document.getElementById('ga-table-pages').innerHTML = data.topPages.map(p => `<tr><td>${escapeHtml(p.path)}</td><td>${p.views}</td></tr>`).join('');
        document.getElementById('ga-table-events').innerHTML = data.events.map(e => `<tr><td>${escapeHtml(e.eventName)}</td><td>${e.eventCount}</td></tr>`).join('');
        document.getElementById('ga-table-countries').innerHTML = data.countries.map(c => `<tr><td>${escapeHtml(c.country)}</td><td>${c.sessions}</td></tr>`).join('');
    } catch (e) {
        console.error('Error loading GA:', e);
    }
}

// ==========================================================================
// 8. DISCORD MULTI-SERVER WEBHOOK MANAGER
// ==========================================================================
let cachedDiscordWebhooks = [];

async function loadDiscordWebhooks() {
    try {
        const res = await apiGet('/api/admin/discord-webhooks');
        cachedDiscordWebhooks = Array.isArray(res) ? res : (res.webhooks || []);
        const select = document.getElementById('discord-server-select');
        const form = document.getElementById('discord-config-form');
        const empty = document.getElementById('discord-config-empty');

        if (!select) return;

        if (cachedDiscordWebhooks.length === 0) {
            select.innerHTML = '<option value="">(No webhooks configured)</option>';
            if (form) form.style.display = 'none';
            if (empty) empty.style.display = 'block';
            return;
        }

        const prevVal = select.value;
        select.innerHTML = cachedDiscordWebhooks.map(w => `
            <option value="${w._id}">${escapeHtml(w.name)} ${w.enabled ? '🟢' : '⚪'}</option>
        `).join('');

        if (prevVal && cachedDiscordWebhooks.some(w => w._id === prevVal)) {
            select.value = prevVal;
        } else {
            select.value = cachedDiscordWebhooks[0]._id;
        }

        onDiscordServerSelectChange();
    } catch (e) {
        console.error('Error loading Discord webhooks:', e);
        showAdminToast('❌ Failed to load Discord webhooks');
    }
}

window.onDiscordServerSelectChange = function() {
    const select = document.getElementById('discord-server-select');
    const form = document.getElementById('discord-config-form');
    const empty = document.getElementById('discord-config-empty');
    if (!select || !form) return;

    const selectedId = select.value;
    const webhook = cachedDiscordWebhooks.find(w => w._id === selectedId);

    if (!webhook) {
        form.style.display = 'none';
        if (empty) empty.style.display = 'block';
        return;
    }

    form.style.display = 'block';
    if (empty) empty.style.display = 'none';

    document.getElementById('discord-config-id').value = webhook._id;
    document.getElementById('discord-server-name').value = webhook.name || '';
    document.getElementById('discord-webhook-url').value = webhook.webhookUrl || '';
    document.getElementById('discord-role-ping').value = webhook.rolePing || '';
    document.getElementById('discord-master-enabled').checked = webhook.enabled !== false;

    document.getElementById('discord-opt-completions').checked = !!webhook.sendScoreCompletions;
    document.getElementById('discord-opt-daily-drop').checked = !!webhook.sendDailyDrop;
    document.getElementById('discord-opt-yesterday-recap').checked = !!webhook.sendYesterdayRecap;
    document.getElementById('discord-opt-winner-shoutout').checked = !!webhook.sendWinnerShoutout;
    document.getElementById('discord-opt-spoilers').checked = !!webhook.sendSpoilerProtection;

    document.getElementById('discord-template-completions').value = webhook.templateCompletion || '';
    document.getElementById('discord-template-daily-drop').value = webhook.templateDailyDrop || '';
    document.getElementById('discord-template-yesterday-recap').value = webhook.templateYesterdayRecap || '';
    document.getElementById('discord-template-winner-shoutout').value = webhook.templateWinnerShoutout || '';
};

window.openAddWebhookModal = function() {
    document.getElementById('add-webhook-name').value = '';
    document.getElementById('add-webhook-url').value = '';
    document.getElementById('add-webhook-role').value = '';
    const modal = document.getElementById('modal-add-webhook');
    if (modal) modal.style.display = 'flex';
};

window.submitAddDiscordWebhook = async function() {
    const name = document.getElementById('add-webhook-name').value.trim();
    const webhookUrl = document.getElementById('add-webhook-url').value.trim();
    const rolePing = document.getElementById('add-webhook-role').value.trim();

    if (!name || !webhookUrl) {
        showAdminToast('⚠️ Please provide both a server name and a webhook URL');
        return;
    }

    try {
        const res = await apiPost('/api/admin/discord-webhooks', { name, webhookUrl, rolePing });
        if (res.ok) {
            showAdminToast('✅ Webhook created successfully!');
            closeAdminModal('modal-add-webhook');
            await loadDiscordWebhooks();
            if (res.data && res.data.webhook) {
                document.getElementById('discord-server-select').value = res.data.webhook._id;
                onDiscordServerSelectChange();
            }
        } else {
            showAdminToast(`❌ Error: ${res.data?.error || 'Failed to create webhook'}`);
        }
    } catch (e) {
        console.error('Error adding webhook:', e);
        showAdminToast('❌ Failed to add Discord webhook');
    }
};

window.saveSelectedDiscordWebhook = async function() {
    const id = document.getElementById('discord-config-id').value;
    if (!id) return;

    const name = document.getElementById('discord-server-name').value.trim();
    const webhookUrl = document.getElementById('discord-webhook-url').value.trim();
    const rolePing = document.getElementById('discord-role-ping').value.trim();
    const enabled = document.getElementById('discord-master-enabled').checked;

    const sendScoreCompletions = document.getElementById('discord-opt-completions').checked;
    const sendDailyDrop = document.getElementById('discord-opt-daily-drop').checked;
    const sendYesterdayRecap = document.getElementById('discord-opt-yesterday-recap').checked;
    const sendWinnerShoutout = document.getElementById('discord-opt-winner-shoutout').checked;
    const sendSpoilerProtection = document.getElementById('discord-opt-spoilers').checked;

    const templateCompletion = document.getElementById('discord-template-completions').value.trim();
    const templateDailyDrop = document.getElementById('discord-template-daily-drop').value.trim();
    const templateYesterdayRecap = document.getElementById('discord-template-yesterday-recap').value.trim();
    const templateWinnerShoutout = document.getElementById('discord-template-winner-shoutout').value.trim();

    if (!name || !webhookUrl) {
        showAdminToast('⚠️ Server name and Webhook URL cannot be empty');
        return;
    }

    try {
        const res = await apiPut(`/api/admin/discord-webhooks/${id}`, {
            name,
            webhookUrl,
            rolePing,
            enabled,
            sendScoreCompletions,
            sendDailyDrop,
            sendYesterdayRecap,
            sendWinnerShoutout,
            sendSpoilerProtection,
            templateCompletion,
            templateDailyDrop,
            templateYesterdayRecap,
            templateWinnerShoutout
        });

        if (res.ok) {
            showAdminToast('💾 Discord Webhook settings saved!');
            await loadDiscordWebhooks();
        } else {
            showAdminToast(`❌ Error: ${res.data?.error || 'Save failed'}`);
        }
    } catch (e) {
        console.error('Error saving webhook:', e);
        showAdminToast('❌ Failed to save webhook settings');
    }
};

window.testSelectedDiscordWebhook = async function() {
    const id = document.getElementById('discord-config-id').value;
    if (!id) return;

    showAdminToast('📡 Dispatching general test ping to Discord...');
    try {
        const res = await apiPost(`/api/admin/discord-webhooks/${id}/test`, {});
        if (res.ok) {
            showAdminToast('✅ General test ping sent successfully to Discord!');
        } else {
            showAdminToast(`❌ Ping failed: ${res.data?.error || 'HTTP Error'}`);
        }
    } catch (e) {
        console.error('Error testing webhook:', e);
        showAdminToast('❌ Failed to dispatch test ping');
    }
};

window.testDiscordComponentMessage = async function(messageType) {
    const id = document.getElementById('discord-config-id').value;
    if (!id) return;

    const labels = {
        completion: 'Solve Alert',
        dailyDrop: 'Daily Drop',
        yesterdayRecap: 'Yesterday Recap',
        winnerShoutout: 'Winner Shoutout'
    };

    showAdminToast(`📡 Sending test ${labels[messageType] || messageType} to Discord...`);
    try {
        const res = await apiPost(`/api/admin/discord-webhooks/${id}/test-message`, { messageType });
        if (res.ok) {
            showAdminToast(`✅ Test ${labels[messageType] || messageType} delivered to Discord!`);
        } else {
            showAdminToast(`❌ Test failed: ${res.data?.error || 'HTTP Error'}`);
        }
    } catch (e) {
        console.error('Error testing component message:', e);
        showAdminToast('❌ Failed to send test message');
    }
};

window.deleteSelectedDiscordWebhook = async function() {
    const id = document.getElementById('discord-config-id').value;
    const name = document.getElementById('discord-server-name').value;
    if (!id) return;

    if (!confirm(`Are you sure you want to delete the webhook "${name}"?`)) return;

    try {
        const res = await apiDelete(`/api/admin/discord-webhooks/${id}`);
        if (res.ok) {
            showAdminToast('🗑️ Webhook deleted');
            await loadDiscordWebhooks();
        } else {
            showAdminToast(`❌ Error deleting webhook: ${res.data?.error || 'Failed'}`);
        }
    } catch (e) {
        console.error('Error deleting webhook:', e);
        showAdminToast('❌ Failed to delete webhook');
    }
};

// ==========================================================================
// 9. GLOBAL ANNOUNCEMENTS & OPS MANAGER
// ==========================================================================
async function loadSystemAnnouncement() {
    try {
        const res = await apiGet('/api/system/announcement');
        const ann = res.announcement || {};
        const maint = res.maintenance || {};

        document.getElementById('announcement-active').checked = !!ann.active;
        document.getElementById('announcement-type').value = ann.type || 'teal';
        document.getElementById('announcement-id').value = ann.id || 'banner-1';
        document.getElementById('announcement-message').value = ann.message || '';

        document.getElementById('maintenance-active').checked = !!maint.active;
        document.getElementById('maintenance-message').value = maint.message || 'Loredle is temporarily under maintenance. Back shortly!';
    } catch (e) {
        console.error('Error loading announcement config:', e);
        showAdminToast('❌ Failed to load system announcements');
    }
}

window.saveSystemAnnouncement = async function() {
    const announcement = {
        active: document.getElementById('announcement-active').checked,
        type: document.getElementById('announcement-type').value,
        id: document.getElementById('announcement-id').value.trim() || 'banner-' + Date.now(),
        message: document.getElementById('announcement-message').value.trim()
    };

    const maintenance = {
        active: document.getElementById('maintenance-active').checked,
        message: document.getElementById('maintenance-message').value.trim() || 'Loredle is temporarily under maintenance. Back shortly!'
    };

    try {
        const res = await apiPut('/api/admin/system/announcement', { announcement, maintenance });
        if (res.ok) {
            showAdminToast('💾 Global announcement & maintenance settings saved!');
        } else {
            showAdminToast(`❌ Error saving ops settings: ${res.data?.error || 'Failed'}`);
        }
    } catch (e) {
        console.error('Error saving system announcements:', e);
        showAdminToast('❌ Failed to save announcement settings');
    }
};
