// ==========================================================================
// LOREDLE v3.0 — FRONTEND CORE & GAMEPLAY ENGINE (Rules of Villainy Edition)
// ==========================================================================

let cards = [];
let cardLookupExact = new Map();
let cardLookupLoose = new Map();
let guessedCards = new Set();

let currentUser = localStorage.getItem('loredle_username');
let currentAvatar = localStorage.getItem('loredle_avatar') || 'default';
let currentTheme = localStorage.getItem('loredle_theme') || 'default';
let pendingAvatar = currentAvatar;
let pendingTheme = currentTheme;

// Private closure state for the active daily target card (not exposed on window)
const GameVault = (() => {
    let _targetCard = null;
    let _todayDate = null;
    let _isCompleted = false;
    return {
        setTarget(card, dateStr) { _targetCard = card; _todayDate = dateStr; },
        getTarget() { return _targetCard; },
        getDate() { return _todayDate; },
        setCompleted(val) { _isCompleted = Boolean(val); },
        isCompleted() { return _isCompleted; }
    };
})();

function applyTheme(themeName) {
    document.documentElement.className = (!themeName || themeName === 'default') ? '' : themeName;
}
applyTheme(currentTheme);

function isEmojiAvatar(avatar) {
    if (!avatar || avatar === 'default') return false;
    if (avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('/')) return false;
    return true;
}

const availableThemes = [
    { id: 'default', name: 'Loredle Dark', bg: '#120d22', primary: '#9d7bff', secondary: '#2ce5c6' },
    { id: 'theme-light', name: 'Loredle Light', bg: '#f4effe', primary: '#6955a4', secondary: '#00b89c' },
    { id: 'theme-synthwave', name: 'SynthWave 84', bg: '#262335', primary: '#f92aad', secondary: '#36f9f6' },
    { id: 'theme-dracula', name: 'Dracula', bg: '#282a36', primary: '#bd93f9', secondary: '#ff79c6' },
    { id: 'theme-tokyonight', name: 'Tokyo Night', bg: '#1a1b26', primary: '#7aa2f7', secondary: '#bb9af7' },
    { id: 'theme-catppuccin', name: 'Catppuccin', bg: '#1e1e2e', primary: '#cba6f7', secondary: '#f5c2e7' },
    { id: 'theme-nightowl', name: 'Night Owl', bg: '#011627', primary: '#82aaff', secondary: '#c792ea' },
    { id: 'theme-onedark', name: 'One Dark Pro', bg: '#282c34', primary: '#61afef', secondary: '#c678dd' },
    { id: 'theme-gruvbox', name: 'Gruvbox', bg: '#282828', primary: '#d3869b', secondary: '#fabd2f' },
    { id: 'theme-solarized', name: 'Solarized', bg: '#002b36', primary: '#268bd2', secondary: '#2aa198' },
    { id: 'theme-nord', name: 'Nord', bg: '#2e3440', primary: '#88c0d0', secondary: '#b48ead' }
];

const INK_COLORS = {
    Amber: '#FFE082',
    Amethyst: '#CE93D8',
    Emerald: '#81C784',
    Ruby: '#EF9A9A',
    Sapphire: '#90CAF9',
    Steel: '#B0BEC5',
    Colorless: '#E0E0E0'
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    ensureSharedShell();
    renderNavbar();
    checkGlobalAnnouncement();

    if (document.getElementById('hub-container')) {
        setupHubPage();
    }

    if (document.getElementById('game-board')) {
        initGamePage();
    }

    if (document.getElementById('settings-container')) {
        if (!currentUser) {
            window.location.href = 'index.html';
            return;
        }
        setupAvatarGrid();
        setupThemeGrid();
        setupGameplaySettings();
    }

    if (document.getElementById('changelog-page-content')) {
        fetchChangelogPage();
    }

    if (document.getElementById('hof-container')) {
        fetchHallOfFame();
    }

    if (document.getElementById('history-container')) {
        if (!currentUser) {
            window.location.href = 'index.html';
            return;
        }
        fetchDetailedHistory();
    }
});

// --- SHARED SHELL & NAVBAR ---
function ensureSharedShell() {
    // Ensure nav-dropdown exists
    if (!document.getElementById('nav-dropdown')) {
        const dd = document.createElement('div');
        dd.id = 'nav-dropdown';
        dd.className = 'nav-dropdown';
        document.body.appendChild(dd);
    }

    // Ensure toast exists
    if (!document.getElementById('toast')) {
        const toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        toast.textContent = 'Message';
        document.body.appendChild(toast);
    }

    // Ensure auth-modal exists on every page
    if (!document.getElementById('auth-modal')) {
        const authModal = document.createElement('div');
        authModal.id = 'auth-modal';
        authModal.className = 'modal';
        authModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Welcome to Loredle</h2>
                    <span class="close-btn" onclick="closeAuthModal()">&times;</span>
                </div>
                <div class="form-group" style="margin: 0 auto;">
                    <input type="text" id="auth-username" class="input-field" placeholder="Username" autocomplete="username">
                    <input type="password" id="auth-password" class="input-field" placeholder="Password" autocomplete="current-password">
                    <div style="display: flex; gap: 12px; margin-top: 8px;">
                        <button class="btn primary-btn" style="flex: 1;" onclick="loginUser()">Login</button>
                        <button class="btn secondary-btn" style="flex: 1;" onclick="registerUser()">Register</button>
                    </div>
                    <p id="auth-message" style="color: var(--incorrect); font-weight: 700; text-align: center; margin-top: 12px; min-height: 20px;"></p>
                </div>
            </div>
        `;
        document.body.appendChild(authModal);
    }

    // Bind Enter key inside Auth Modal inputs
    const authUserInp = document.getElementById('auth-username');
    const authPassInp = document.getElementById('auth-password');
    if (authPassInp && !authPassInp.dataset.boundEnter) {
        authPassInp.dataset.boundEnter = '1';
        const handler = (e) => {
            if (e.key === 'Enter') loginUser();
        };
        if (authUserInp) authUserInp.addEventListener('keydown', handler);
        authPassInp.addEventListener('keydown', handler);
    }
}

function renderNavbar() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;

    const brand = navbar.querySelector('.nav-brand');
    if (brand) {
        brand.onclick = () => { window.location.href = 'index.html'; };
        brand.innerHTML = `<span class="nav-brand-text">LOREDLE</span>`;
    }

    let authContainer = document.getElementById('nav-auth-container') || document.getElementById('nav-auth-section') || navbar.querySelector('.nav-auth');
    if (!authContainer) {
        authContainer = document.createElement('div');
        authContainer.id = 'nav-auth-container';
        authContainer.className = 'nav-auth';
        navbar.appendChild(authContainer);
    }

    authContainer.innerHTML = '';
    const currentPath = window.location.pathname;

    const playLink = document.createElement('a');
    playLink.href = 'game.html';
    playLink.className = `auth-link ${currentPath.endsWith('game.html') ? 'active-nav' : ''}`;
    playLink.innerHTML = `Play Daily`;
    authContainer.appendChild(playLink);

    const hofLink = document.createElement('a');
    hofLink.href = 'hall-of-fame.html';
    hofLink.className = `auth-link ${currentPath.endsWith('hall-of-fame.html') ? 'active-nav' : ''}`;
    hofLink.innerHTML = `Hall Of Fame`;
    authContainer.appendChild(hofLink);

    const vtLink = document.createElement('a');
    vtLink.href = 'version-trainer.html';
    vtLink.className = `auth-link ${currentPath.endsWith('version-trainer.html') ? 'active-nav' : ''}`;
    vtLink.innerHTML = `Version Trainer <span class="badge-new">ARCADE</span>`;
    authContainer.appendChild(vtLink);

    if (currentUser) {
        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('avatar-circle');
        avatarDiv.title = currentUser;
        avatarDiv.onclick = toggleDropdown;

        if (isEmojiAvatar(currentAvatar)) {
            avatarDiv.textContent = currentAvatar;
            avatarDiv.style.fontSize = '1.35rem';
        } else {
            avatarDiv.textContent = currentUser.charAt(0).toUpperCase();
        }

        authContainer.appendChild(avatarDiv);

        const dropdown = document.getElementById('nav-dropdown');
        if (dropdown) {
            const adminHtml = localStorage.getItem('loredle_role') === 'admin'
                ? `<div class="dropdown-item" onclick="window.location.href='/admin/index.html'">⚡ Admin Portal</div>`
                : '';
            dropdown.innerHTML = `
                <div style="padding: 10px 18px; background: var(--rov-purple); color: #fff; font-family: var(--font-mono); font-size: 0.78rem; font-weight: 700; border-bottom: 2px solid #000;">
                    👤 ${escapeHtml(currentUser)}
                </div>
                ${adminHtml}
                <div class="dropdown-item" onclick="window.location.href='groups.html'">👥 Friend Groups</div>
                <div class="dropdown-item" onclick="window.location.href='settings.html'">⚙️ Settings</div>
                <div class="dropdown-item" onclick="window.location.href='history.html'">📜 Guess History</div>
                <div class="dropdown-item" onclick="window.location.href='feedback.html'">💬 Feedback</div>
                <div class="dropdown-item" onclick="logOut()">🚪 Log Out</div>
            `;
        }
    } else {
        const loginBtn = document.createElement('button');
        loginBtn.className = 'btn pink-btn';
        loginBtn.style.padding = '7px 14px';
        loginBtn.style.fontSize = '0.85rem';
        loginBtn.textContent = 'Login / Sign Up';
        loginBtn.onclick = openAuthModal;
        authContainer.appendChild(loginBtn);
    }

    const hubGroupsBtn = document.getElementById('hub-friend-groups-btn');
    if (hubGroupsBtn) hubGroupsBtn.style.display = currentUser ? 'inline-block' : 'none';
    const lbGroupsBtn = document.getElementById('lb-friend-groups-btn');
    if (lbGroupsBtn) lbGroupsBtn.style.display = currentUser ? 'inline-block' : 'none';
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function toggleDropdown() {
    const dropdown = document.getElementById('nav-dropdown');
    if (!dropdown) return;
    dropdown.style.display = dropdown.style.display === 'flex' ? 'none' : 'flex';
}

function logOut() {
    localStorage.removeItem('loredle_username');
    localStorage.removeItem('loredle_avatar');
    localStorage.removeItem('loredle_theme');
    localStorage.removeItem('loredle_role');
    localStorage.removeItem('loredle_token');
    window.location.href = 'index.html';
}

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('nav-dropdown');
    const avatar = document.querySelector('.avatar-circle');
    if (dropdown && dropdown.style.display === 'flex' && !dropdown.contains(e.target) && (!avatar || !avatar.contains(e.target))) {
        dropdown.style.display = 'none';
    }
});

// --- DATE & TIME HELPERS ---
function getCSTDateISO() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Chicago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
}

function getFormattedDateCST() {
    const date = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const dayName = days[date.getDay()];
    const monthName = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();

    const suffix = (day % 10 === 1 && day !== 11) ? 'st' :
        (day % 10 === 2 && day !== 12) ? 'nd' :
            (day % 10 === 3 && day !== 13) ? 'rd' : 'th';

    return `${dayName}, ${monthName} ${day}${suffix}, ${year}`;
}

// --- MODALS ---
function openAuthModal() {
    const modal = document.getElementById('auth-modal');
    const msg = document.getElementById('auth-message');
    if (modal) modal.style.display = 'flex';
    if (msg) msg.textContent = '';
}

function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.style.display = 'none';
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'flex';
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
}

// --- CHANGELOG ---
async function fetchChangelogPage() {
    const contentDiv = document.getElementById('changelog-page-content');
    if (!contentDiv) return;

    try {
        const response = await fetch('changelog.md');
        if (!response.ok) throw new Error('Failed to load changelog');
        const text = await response.text();
        contentDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(text) : `<pre>${escapeHtml(text)}</pre>`;
    } catch (error) {
        contentDiv.innerHTML = '<p>Could not load change log.</p>';
    }
}

// --- HUB PAGE (index.html) ---
function setupHubPage() {
    fetchGlobalLeaderboard();
    if (document.getElementById('arcade-leaderboard-body')) {
        fetchArcadeLeaderboard();
    }

    const playSection = document.getElementById('play-section');
    if (playSection) playSection.style.display = 'block';
    const welcome = document.getElementById('welcome-message');
    if (welcome) welcome.textContent = getFormattedDateCST();

    const hubGroupsBtn = document.getElementById('hub-friend-groups-btn');
    if (hubGroupsBtn) hubGroupsBtn.style.display = currentUser ? 'inline-block' : 'none';
}

// --- AUTH ACTIONS ---
async function loginUser() {
    const usernameInput = (document.getElementById('auth-username')?.value || '').trim();
    const passwordInput = document.getElementById('auth-password')?.value || '';
    const msg = document.getElementById('auth-message');

    if (!usernameInput || !passwordInput) {
        if (msg) msg.textContent = 'Please enter both username and password.';
        return;
    }

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('loredle_username', data.username || usernameInput);
            localStorage.setItem('loredle_avatar', data.avatar || 'default');
            localStorage.setItem('loredle_theme', data.theme || 'default');
            if (data.role) localStorage.setItem('loredle_role', data.role);
            if (data.token) localStorage.setItem('loredle_token', data.token);
            window.location.reload();
        } else if (msg) {
            msg.textContent = data.error || 'Login failed.';
        }
    } catch (err) {
        if (msg) msg.textContent = 'Server error.';
    }
}

async function registerUser() {
    const usernameInput = (document.getElementById('auth-username')?.value || '').trim();
    const passwordInput = document.getElementById('auth-password')?.value || '';
    const msg = document.getElementById('auth-message');

    if (!usernameInput || !passwordInput) {
        if (msg) msg.textContent = 'Please enter both username and password.';
        return;
    }

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('loredle_username', data.username || usernameInput);
            localStorage.setItem('loredle_avatar', data.avatar || 'default');
            localStorage.setItem('loredle_theme', data.theme || 'default');
            if (data.role) localStorage.setItem('loredle_role', data.role);
            if (data.token) localStorage.setItem('loredle_token', data.token);
            window.location.reload();
        } else if (msg) {
            msg.textContent = data.error || 'Registration failed.';
        }
    } catch (err) {
        if (msg) msg.textContent = 'Server error.';
    }
}

// --- LEADERBOARDS & HALL OF FAME ---
let hofRecentWinners = [];
let hofCurrentPage = 1;
const HOF_PAGE_SIZE = 30;

function renderAvatarBadge(avatar, username) {
    const initial = (username || '?').charAt(0).toUpperCase();
    if (isEmojiAvatar(avatar)) {
        return `<div class="mini-avatar" style="font-size: 1.05rem;">${escapeHtml(avatar)}</div>`;
    }
    return `<div class="mini-avatar">${escapeHtml(initial)}</div>`;
}

async function fetchGlobalLeaderboard() {
    const tbody = document.getElementById('global-leaderboard-body');
    if (!tbody) return;

    try {
        const res = await fetch('/api/leaderboard');
        const scores = await res.json();
        tbody.innerHTML = '';

        if (!Array.isArray(scores) || scores.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="color: var(--text-secondary);">No scores for today yet — claim #1!</td></tr>';
            return;
        }

        scores.forEach((score, index) => {
            const tr = document.createElement('tr');
            const medal = index === 0 ? '👑 #1' : index === 1 ? '🥈 #2' : index === 2 ? '🥉 #3' : `#${index + 1}`;
            const trackerBadge = score.trackerUsed ? `<span title="Solved with Card Tracker" style="margin-left: 6px; cursor: help; font-size: 0.95rem;">🔎</span>` : '';
            tr.innerHTML = `
                <td style="font-family: var(--font-mono); font-weight: 700;">${medal}</td>
                <td>
                    <div style="display: inline-flex; align-items: center; gap: 10px;">
                        ${renderAvatarBadge(score.avatar, score.username)}
                        <span style="font-weight: 700;">${escapeHtml(score.username)}</span>
                        ${trackerBadge}
                    </div>
                </td>
                <td style="font-family: var(--font-mono); font-weight: 700; color: var(--secondary-color);">${score.tries}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('Failed to load global leaderboard.');
    }
}

async function fetchArcadeLeaderboard() {
    const tbody = document.getElementById('arcade-leaderboard-body');
    if (!tbody) return;

    try {
        const res = await fetch('/api/arcade-leaderboard');
        const scores = await res.json();
        tbody.innerHTML = '';

        if (!Array.isArray(scores) || scores.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="color: var(--text-secondary);">No scores yet! Be the first!</td></tr>';
            return;
        }

        scores.forEach((score, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-family: var(--font-mono); font-weight: 700;">#${index + 1}</td>
                <td style="letter-spacing: 3px; font-size: 1.4rem;">${escapeHtml(score.emojis)}</td>
                <td style="font-family: var(--font-mono); font-weight: 700; color: var(--secondary-color);">${score.score}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('Failed to load arcade leaderboard.');
    }
}

async function fetchHallOfFame() {
    try {
        const res = await fetch('/api/hall-of-fame');
        const data = await res.json();

        const top5Body = document.getElementById('hof-top5-body');
        if (top5Body) {
            top5Body.innerHTML = '';
            if (data.top5 && data.top5.length > 0) {
                data.top5.forEach((player, index) => {
                    const tr = document.createElement('tr');
                    const rankBadge = index === 0 ? '👑 #1' : `#${index + 1}`;
                    tr.innerHTML = `
                        <td style="font-family: var(--font-mono); font-weight: 700;">${rankBadge}</td>
                        <td>
                            <div style="display: inline-flex; align-items: center; gap: 10px;">
                                ${renderAvatarBadge(player.avatar, player.username)}
                                <span style="font-weight: 700;">${escapeHtml(player.username)}</span>
                            </div>
                        </td>
                        <td style="font-family: var(--font-mono); font-weight: 700; color: var(--close);">${player.count} 🏆</td>
                    `;
                    top5Body.appendChild(tr);
                });
            } else {
                top5Body.innerHTML = '<tr><td colspan="3" style="color: var(--text-secondary);">No data yet.</td></tr>';
            }
        }

        hofRecentWinners = Array.isArray(data.recentWinners) ? data.recentWinners : [];
        hofCurrentPage = 1;
        renderHofRecentPage(1);
    } catch (err) {
        console.error('Failed to load hall of fame.', err);
    }
}

function renderHofRecentPage(page) {
    const recentBody = document.getElementById('hof-recent-body');
    const paginationEl = document.getElementById('hof-pagination');
    if (!recentBody) return;

    recentBody.innerHTML = '';
    if (hofRecentWinners.length === 0) {
        recentBody.innerHTML = '<tr><td colspan="3" style="color: var(--text-secondary);">No data yet.</td></tr>';
        if (paginationEl) paginationEl.innerHTML = '';
        return;
    }

    const totalPages = Math.max(1, Math.ceil(hofRecentWinners.length / HOF_PAGE_SIZE));
    hofCurrentPage = Math.max(1, Math.min(page, totalPages));

    const startIdx = (hofCurrentPage - 1) * HOF_PAGE_SIZE;
    const endIdx = Math.min(startIdx + HOF_PAGE_SIZE, hofRecentWinners.length);
    const pageWinners = hofRecentWinners.slice(startIdx, endIdx);

    pageWinners.forEach((winner) => {
        const tr = document.createElement('tr');
        const trackerBadge = winner.trackerUsed ? `<span title="Solved with Card Tracker" style="margin-left: 6px; cursor: help; font-size: 0.95rem;">🔎</span>` : '';
        tr.innerHTML = `
            <td style="font-family: var(--font-mono);">${escapeHtml(winner.date)}</td>
            <td>
                <div style="display: inline-flex; align-items: center; gap: 10px;">
                    ${renderAvatarBadge(winner.avatar, winner.username)}
                    <span style="font-weight: 700;">${escapeHtml(winner.username)}</span>
                    ${trackerBadge}
                </div>
            </td>
            <td style="font-family: var(--font-mono); font-weight: 700; color: var(--secondary-color);">${winner.tries}</td>
        `;
        recentBody.appendChild(tr);
    });

    if (paginationEl) {
        if (totalPages <= 1) {
            paginationEl.innerHTML = '';
            return;
        }

        let pageButtonsHtml = '';
        for (let p = 1; p <= totalPages; p++) {
            const isActive = p === hofCurrentPage;
            pageButtonsHtml += `
                <button class="btn ${isActive ? 'secondary-btn' : 'minimal-btn'} page-btn"
                    onclick="changeHofPage(${p})"
                    style="padding: 6px 12px; font-size: 0.85rem;">
                    ${p}
                </button>
            `;
        }

        paginationEl.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 10px; margin-top: 18px;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap;">
                    <button class="btn minimal-btn page-btn"
                        onclick="changeHofPage(${hofCurrentPage - 1})"
                        ${hofCurrentPage === 1 ? 'disabled style="opacity:0.45; cursor:not-allowed; padding: 6px 12px; font-size: 0.85rem;"' : 'style="padding: 6px 12px; font-size: 0.85rem;"'}>
                        ◀ Prev
                    </button>
                    ${pageButtonsHtml}
                    <button class="btn minimal-btn page-btn"
                        onclick="changeHofPage(${hofCurrentPage + 1})"
                        ${hofCurrentPage === totalPages ? 'disabled style="opacity:0.45; cursor:not-allowed; padding: 6px 12px; font-size: 0.85rem;"' : 'style="padding: 6px 12px; font-size: 0.85rem;"'}>
                        Next ▶
                    </button>
                </div>
                <div style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-secondary);">
                    Showing ${startIdx + 1}–${endIdx} of ${hofRecentWinners.length} daily winners
                </div>
            </div>
        `;
    }
}

function changeHofPage(newPage) {
    renderHofRecentPage(newPage);
}

// --- SETTINGS PAGE ---
function selectDefaultAvatar() {
    pendingAvatar = 'default';
    setupAvatarGrid();
}

function setupAvatarGrid() {
    const grid = document.getElementById('avatar-grid');
    if (!grid) return;

    const initial = currentUser ? currentUser.charAt(0).toUpperCase() : '?';
    const isEmoji = isEmojiAvatar(pendingAvatar);
    const displayChar = isEmoji ? pendingAvatar : initial;
    const statusLabel = isEmoji ? `Emoji Avatar (${pendingAvatar})` : `Default Initial (${initial})`;

    grid.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; background: var(--bg-card); border: 3px solid #000; border-radius: 10px; box-shadow: 4px 4px 0px #000; padding: 14px 18px; width: 100%; max-width: 440px; margin: 0 auto;">
            <div style="display: flex; align-items: center; gap: 14px;">
                <div class="avatar-option selected" style="cursor: default; font-size: ${isEmoji ? '2rem' : '1.5rem'}; width: 58px; height: 58px;">
                    ${escapeHtml(displayChar)}
                </div>
                <div style="text-align: left;">
                    <div style="font-family: var(--font-mono); font-size: 0.74rem; color: var(--text-secondary); text-transform: uppercase;">Selected Avatar</div>
                    <div style="font-family: var(--font-display); font-size: 1.1rem; font-weight: 700; color: var(--secondary-color);">${escapeHtml(statusLabel)}</div>
                </div>
            </div>
            <button type="button" class="btn minimal-btn" style="padding: 8px 12px; font-size: 0.8rem;" onclick="selectDefaultAvatar()">
                Use Initial
            </button>
        </div>
    `;

    const picker = document.getElementById('settings-emoji-picker');
    if (picker && !picker.dataset.bound) {
        picker.dataset.bound = '1';
        picker.addEventListener('emoji-click', (event) => {
            if (event.detail && event.detail.unicode) {
                pendingAvatar = event.detail.unicode;
                setupAvatarGrid();
            }
        });
    }
}

function setupThemeGrid() {
    const grid = document.getElementById('theme-grid');
    if (!grid) return;
    grid.innerHTML = '';

    availableThemes.forEach(theme => {
        const option = document.createElement('div');
        option.classList.add('theme-option');
        if (theme.id === pendingTheme) option.classList.add('selected');

        option.innerHTML = `
            <div class="theme-preview-color">
                <div style="background-color: ${theme.bg};"></div>
                <div style="background-color: ${theme.primary};"></div>
                <div style="background-color: ${theme.secondary};"></div>
            </div>
            <div class="theme-label">${theme.name}</div>
        `;

        option.onclick = () => {
            pendingTheme = theme.id;
            applyTheme(theme.id);
            setupThemeGrid();
        };

        grid.appendChild(option);
    });
}

async function savePreferences() {
    if (!currentUser) return;
    const token = localStorage.getItem('loredle_token');

    try {
        const res = await fetch('/api/user/preferences', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ username: currentUser, avatar: pendingAvatar, theme: pendingTheme })
        });
        const data = await res.json();

        if (res.ok) {
            currentAvatar = data.avatar;
            currentTheme = data.theme;
            localStorage.setItem('loredle_avatar', currentAvatar);
            localStorage.setItem('loredle_theme', currentTheme);
            setupAvatarGrid();
            setupThemeGrid();
            renderNavbar();
            showToast('Preferences saved!');
        } else {
            showToast(data.error || 'Failed to update preferences.');
        }
    } catch (err) {
        showToast('Failed to save preferences.');
    }
}

async function submitPasswordChange() {
    const current = document.getElementById('current-password')?.value || '';
    const newPass = document.getElementById('new-password')?.value || '';
    const token = localStorage.getItem('loredle_token');

    if (!current || !newPass) return showToast('Please fill out both fields.');

    try {
        const res = await fetch('/api/user/change-password', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ username: currentUser, currentPassword: current, newPassword: newPass })
        });
        const data = await res.json();

        if (res.ok) {
            showToast('Password updated!');
            document.getElementById('current-password').value = '';
            document.getElementById('new-password').value = '';
        } else {
            showToast(data.error || 'Failed to update password.');
        }
    } catch (err) {
        showToast('Server error.');
    }
}

// --- CARD CATALOG LOADING & LOOKUP ---
function makeLooseLookupKey(str) {
    return (str || '')
        .replace(/[\u2018\u2019\u02BC]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .toLowerCase()
        .replace(/['"`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function indexCardsArray(cardsList) {
    cards = cardsList;
    cardLookupExact.clear();
    cardLookupLoose.clear();
    for (const c of cards) {
        cardLookupExact.set(c.name, c);
        cardLookupLoose.set(makeLooseLookupKey(c.name), c);
    }
}

function findCardByName(name) {
    if (!name) return null;
    if (cardLookupExact.has(name)) return cardLookupExact.get(name);
    return cardLookupLoose.get(makeLooseLookupKey(name)) || null;
}

async function loadCardsCatalog() {
    if (cards.length > 0) return cards;

    const CACHE_HASH_KEY = 'loredle_cards_hash_v3';
    const CACHE_DATA_KEY = 'loredle_cards_data_v3';
    const cachedHash = localStorage.getItem(CACHE_HASH_KEY) || '';
    const cachedRaw = localStorage.getItem(CACHE_DATA_KEY);

    try {
        const url = cachedHash && cachedRaw ? `/api/cards?hash=${encodeURIComponent(cachedHash)}` : '/api/cards';
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch /api/cards');
        const data = await res.json();

        if (data.unchanged && cachedRaw) {
            const parsed = JSON.parse(cachedRaw);
            indexCardsArray(parsed);
            return cards;
        }

        if (Array.isArray(data.cards) && data.cards.length > 0) {
            indexCardsArray(data.cards);
            try {
                localStorage.setItem(CACHE_HASH_KEY, data.versionHash || '');
                localStorage.setItem(CACHE_DATA_KEY, JSON.stringify(data.cards));
            } catch (storageErr) {
                // Ignore localStorage quota errors
            }
            return cards;
        }
    } catch (err) {
        console.warn('Error fetching server cards catalog, trying localStorage backup:', err);
        if (cachedRaw) {
            try {
                indexCardsArray(JSON.parse(cachedRaw));
                return cards;
            } catch (e) {}
        }
    }
    return cards;
}

function decodeTargetToken(tokenB64, dateStr) {
    try {
        const key = `ROV_LOREDLE_${dateStr}`;
        const binary = atob(tokenB64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        }
        return new TextDecoder().decode(bytes);
    } catch (e) {
        return null;
    }
}

// --- DETAILED HISTORY PAGE (history.html) ---
async function fetchDetailedHistory() {
    try {
        await loadCardsCatalog();
        const res = await fetch(`/api/user/detailed-history/${encodeURIComponent(currentUser)}`);
        const historyData = await res.json();
        renderDetailedHistory(historyData);
    } catch (err) {
        const container = document.getElementById('detailed-history-content');
        if (container) {
            container.innerHTML = '<p style="color: var(--incorrect); text-align: center;">Failed to load history.</p>';
        }
    }
}

function renderDetailedHistory(historyData) {
    const container = document.getElementById('detailed-history-content');
    if (!container) return;
    container.innerHTML = '';

    if (!Array.isArray(historyData) || historyData.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No games recorded yet. Play today\'s Loredle!</p>';
        return;
    }

    historyData.forEach(dayScore => {
        const dayDiv = document.createElement('div');
        dayDiv.style.background = 'var(--bg-card)';
        dayDiv.style.border = '3px solid #000';
        dayDiv.style.borderRadius = '12px';
        dayDiv.style.boxShadow = '6px 6px 0px #000';
        dayDiv.style.padding = '20px';
        dayDiv.style.marginBottom = '24px';

        const headerDiv = document.createElement('div');
        headerDiv.style.display = 'flex';
        headerDiv.style.justifyContent = 'space-between';
        headerDiv.style.alignItems = 'center';
        headerDiv.style.flexWrap = 'wrap';
        headerDiv.style.gap = '10px';
        headerDiv.style.marginBottom = '16px';
        headerDiv.style.borderBottom = '3px solid #000';
        headerDiv.style.paddingBottom = '10px';

        const dateEl = document.createElement('h3');
        dateEl.textContent = `📅 ${dayScore.date}`;
        dateEl.style.margin = '0';
        dateEl.style.fontFamily = 'var(--font-mono)';
        dateEl.style.color = 'var(--secondary-color)';

        const statsEl = document.createElement('div');
        statsEl.style.fontFamily = 'var(--font-mono)';
        statsEl.style.fontWeight = '700';
        const trackerBadgeHtml = dayScore.trackerUsed
            ? ` <span class="brutal-badge" style="background: var(--bg-surface); color: var(--accent-gold);" title="Solved with Card Tracker">🔎 Tracker Used</span>`
            : '';
        statsEl.innerHTML = `
            <span class="brutal-badge" style="background: var(--bg-surface); color: var(--correct);">Tries: ${dayScore.tries}</span>
            <span class="brutal-badge" style="background: var(--bg-surface); color: var(--close);">Rank: #${dayScore.rank}</span>
            ${trackerBadgeHtml}
        `;

        headerDiv.appendChild(dateEl);
        headerDiv.appendChild(statsEl);
        dayDiv.appendChild(headerDiv);

        const targetName = dayScore.targetCard || (dayScore.guesses && dayScore.guesses[dayScore.guesses.length - 1]);
        const targetCardObj = findCardByName(targetName);

        if (dayScore.guesses && dayScore.guesses.length > 0 && targetCardObj) {
            const scrollWrap = document.createElement('div');
            scrollWrap.style.overflowX = 'auto';
            scrollWrap.style.paddingBottom = '6px';
            scrollWrap.style.width = '100%';

            const tableContainer = document.createElement('div');
            tableContainer.style.display = 'flex';
            tableContainer.style.flexDirection = 'column';
            tableContainer.style.gap = '6px';
            tableContainer.style.width = '100%';
            tableContainer.style.margin = '0 auto';

            const headerRow = document.createElement('div');
            headerRow.classList.add('header');
            ['Card Name', 'Number', 'Set', 'Cost', 'Inkable', 'Color', 'Type', 'Rarity'].forEach(text => {
                const cell = document.createElement('div');
                cell.classList.add('cell');
                cell.textContent = text;
                headerRow.appendChild(cell);
            });
            tableContainer.appendChild(headerRow);

            dayScore.guesses.forEach(guessName => {
                const guessCardObj = findCardByName(guessName);
                if (guessCardObj) {
                    const row = buildComparisonRow(guessCardObj, targetCardObj, false);
                    const nameCell = row.firstChild;
                    if (nameCell) {
                        nameCell.style.cursor = 'help';
                        nameCell.addEventListener('mouseenter', () => {
                            const tooltip = document.getElementById('history-tooltip');
                            if (tooltip && guessCardObj.image) {
                                tooltip.src = guessCardObj.image;
                                tooltip.style.display = 'block';
                            }
                        });
                        nameCell.addEventListener('mousemove', (e) => {
                            const tooltip = document.getElementById('history-tooltip');
                            if (tooltip) {
                                tooltip.style.left = Math.min(window.innerWidth - 240, e.pageX + 15) + 'px';
                                tooltip.style.top = (e.pageY + 15) + 'px';
                            }
                        });
                        nameCell.addEventListener('mouseleave', () => {
                            const tooltip = document.getElementById('history-tooltip');
                            if (tooltip) tooltip.style.display = 'none';
                        });
                    }
                    tableContainer.appendChild(row);
                }
            });

            scrollWrap.appendChild(tableContainer);
            dayDiv.appendChild(scrollWrap);
        } else {
            const noDetails = document.createElement('p');
            noDetails.textContent = 'Detailed guess data is not available for this game.';
            noDetails.style.color = 'var(--text-secondary)';
            noDetails.style.fontStyle = 'italic';
            dayDiv.appendChild(noDetails);
        }

        container.appendChild(dayDiv);
    });
}

// --- GAME PAGE LOGIC (game.html) ---
async function initGamePage() {
    const cardInput = document.getElementById('card-input');
    if (cardInput) {
        cardInput.disabled = true;
        cardInput.placeholder = 'Loading official Lorcana catalog...';
    }

    try {
        const token = localStorage.getItem('loredle_token');
        const userParam = currentUser ? `?username=${encodeURIComponent(currentUser)}` : '';
        const [catalog, dailyStateRes] = await Promise.all([
            loadCardsCatalog(),
            fetch(`/api/daily-state${userParam}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            })
        ]);

        const dailyState = await dailyStateRes.json();

        if (dailyState.maintenance) {
            const board = document.getElementById('game-board');
            if (board) {
                board.innerHTML = `
                    <div style="background: var(--bg-card); border: 3px solid #000; border-radius: 8px; box-shadow: 6px 6px 0px #000; padding: 32px 20px; text-align: center; margin: 24px auto; max-width: 520px;">
                        <div style="font-size: 3.2rem; margin-bottom: 12px;">🔒</div>
                        <h2 style="font-family: var(--font-display); color: var(--incorrect); margin-top: 0; text-transform: uppercase;">MAINTENANCE MODE</h2>
                        <p style="font-size: 1.05rem; line-height: 1.5; color: var(--text-primary); margin-bottom: 0;">
                            ${escapeHtml(dailyState.message || 'Loredle is temporarily under maintenance. Back shortly!')}
                        </p>
                    </div>
                `;
            }
            if (cardInput) {
                cardInput.disabled = true;
                cardInput.placeholder = 'Gameplay locked during maintenance';
            }
            return;
        }

        const todayCST = dailyState.date || getCSTDateISO();
        const decodedTargetName = dailyState.targetToken
            ? decodeTargetToken(dailyState.targetToken, todayCST)
            : null;

        let targetObj = findCardByName(decodedTargetName);
        if (!targetObj && catalog.length > 0) {
            // Fallback deterministic selection if offline
            targetObj = catalog[0];
        }

        GameVault.setTarget(targetObj, todayCST);
        setupHoloTiltInteraction();
        setupInputListener();

        if (cardInput) {
            cardInput.disabled = false;
            cardInput.placeholder = 'Type a card name (e.g. Elsa Fifth)...';
        }

        // Restore saved guesses from today (merge localStorage + server state)
        restoreDailySession(todayCST, dailyState);
        initCardTrackerUI();
    } catch (error) {
        console.error('Error initializing game page:', error);
        if (cardInput) {
            cardInput.placeholder = 'Error loading cards. Please refresh.';
        }
    }
}

function getLocalDailyStorageKey(dateStr) {
    const userScope = currentUser || 'anon';
    return `loredle_state_v3_${dateStr}_${userScope}`;
}

function saveLocalDailyState(dateStr, guessesArray, completed, trackerUsed) {
    try {
        const isTracker = (trackerUsed !== undefined) ? Boolean(trackerUsed) : Boolean(window.trackerUsedInGame);
        localStorage.setItem(
            getLocalDailyStorageKey(dateStr),
            JSON.stringify({ date: dateStr, guesses: guessesArray, completed: Boolean(completed), trackerUsed: isTracker })
        );
    } catch (e) {}
}

function restoreDailySession(dateStr, serverState) {
    let savedGuesses = [];
    let alreadyCompleted = false;

    // 1. Check server state (for logged-in users across devices)
    if (serverState && serverState.completed && serverState.score && Array.isArray(serverState.score.guesses)) {
        savedGuesses = serverState.score.guesses;
        alreadyCompleted = true;
        if (serverState.score.trackerUsed) window.trackerUsedInGame = true;
    } else if (serverState && Array.isArray(serverState.inProgressGuesses) && serverState.inProgressGuesses.length > 0) {
        savedGuesses = serverState.inProgressGuesses;
        if (serverState.trackerUsed) window.trackerUsedInGame = true;
    }

    // 2. Check localStorage state
    try {
        const rawLocal = localStorage.getItem(getLocalDailyStorageKey(dateStr));
        if (rawLocal) {
            const parsed = JSON.parse(rawLocal);
            if (parsed && parsed.date === dateStr && Array.isArray(parsed.guesses)) {
                if (parsed.guesses.length > savedGuesses.length) {
                    savedGuesses = parsed.guesses;
                }
                if (parsed.completed) alreadyCompleted = true;
                if (parsed.trackerUsed) window.trackerUsedInGame = true;
            }
        }
    } catch (e) {}

    if (savedGuesses.length > 0) {
        const target = GameVault.getTarget();
        savedGuesses.forEach(gName => {
            const c = findCardByName(gName);
            if (c && !guessedCards.has(c.name)) {
                guessedCards.add(c.name);
                const row = buildComparisonRow(c, target, false);
                document.getElementById('game-board')?.appendChild(row);
            }
        });

        const lastCard = findCardByName(savedGuesses[savedGuesses.length - 1]);
        if (alreadyCompleted || (lastCard && target && lastCard.name === target.name)) {
            GameVault.setCompleted(true);
            endGame(true); // silent restore (do not re-POST score)
        }
    }
}

function setupHoloTiltInteraction() {
    const frame = document.getElementById('card-preview-frame');
    if (!frame) return;

    frame.addEventListener('mousemove', (e) => {
        const rect = frame.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        const rotY = (x - 0.5) * 18;
        const rotX = (0.5 - y) * 18;
        frame.style.transform = `rotateX(${rotX.toFixed(1)}deg) rotateY(${rotY.toFixed(1)}deg)`;
        frame.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
        frame.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    });

    frame.addEventListener('mouseleave', () => {
        frame.style.transform = 'rotateX(0deg) rotateY(0deg)';
    });
}

function showPreviewImage(imageUrl, foilMaskUrl = null, isVictory = false) {
    const hoveredImage = document.getElementById('hovered-image');
    const placeholder = document.getElementById('card-preview-placeholder');
    const frame = document.getElementById('card-preview-frame');
    const foilOverlay = document.getElementById('foil-overlay');

    if (!hoveredImage) return;

    if (imageUrl) {
        hoveredImage.src = imageUrl;
        hoveredImage.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
    } else {
        hoveredImage.style.display = 'none';
        if (placeholder) placeholder.style.display = 'flex';
    }

    if (frame) {
        if (isVictory) {
            frame.classList.add('victory-active');
        } else {
            frame.classList.remove('victory-active');
        }
    }

    if (foilOverlay) {
        if (isVictory && foilMaskUrl) {
            foilOverlay.style.webkitMaskImage = `url('${foilMaskUrl}')`;
            foilOverlay.style.maskImage = `url('${foilMaskUrl}')`;
        } else {
            foilOverlay.style.webkitMaskImage = 'none';
            foilOverlay.style.maskImage = 'none';
        }
    }
}

function isMobileDevice() {
    return window.matchMedia('(max-width: 860px)').matches ||
        window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

function setupInputListener() {
    const cardInput = document.getElementById('card-input');
    const suggestions = document.getElementById('suggestions');
    const mobileGuessBar = document.getElementById('mobile-guess-bar');
    const mobileGuessBtn = document.getElementById('mobile-guess-btn');
    const mobileClearBtn = document.getElementById('mobile-clear-btn');
    if (!cardInput || !suggestions) return;

    let activeIndex = -1;
    let currentMatches = [];
    let stagedCard = null;

    const clearStagedCard = (clearInput = false) => {
        stagedCard = null;
        if (mobileGuessBar) mobileGuessBar.style.display = 'none';
        const stage = document.getElementById('image-container');
        if (stage) stage.classList.remove('mobile-card-staged');
        if (clearInput) {
            cardInput.value = '';
            if (!GameVault.isCompleted()) showPreviewImage(null);
        }
    };

    const stageCardForMobile = (card) => {
        if (!card || GameVault.isCompleted()) return;
        stagedCard = card;
        suggestions.innerHTML = '';
        currentMatches = [];
        activeIndex = -1;
        cardInput.value = card.name;
        cardInput.blur();

        if (card.image) {
            showPreviewImage(card.image);
        }

        const stage = document.getElementById('image-container');
        if (stage) {
            stage.classList.add('mobile-card-staged');
            stage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        if (mobileGuessBar && mobileGuessBtn) {
            mobileGuessBtn.textContent = `🎯 GUESS: ${card.name}`;
            mobileGuessBar.style.display = 'flex';
        }
    };

    if (mobileGuessBtn && !mobileGuessBtn.dataset.bound) {
        mobileGuessBtn.dataset.bound = '1';
        mobileGuessBtn.addEventListener('click', () => {
            if (!stagedCard) return;
            const toGuess = stagedCard;
            clearStagedCard(false);
            cardInput.value = '';
            guessCard(toGuess);
        });
    }

    if (mobileClearBtn && !mobileClearBtn.dataset.bound) {
        mobileClearBtn.dataset.bound = '1';
        mobileClearBtn.addEventListener('click', () => {
            clearStagedCard(true);
            cardInput.focus();
        });
    }

    const updateActiveHighlight = () => {
        const items = suggestions.querySelectorAll('li');
        items.forEach((li, idx) => {
            if (idx === activeIndex) {
                li.classList.add('active-suggestion');
                li.scrollIntoView({ block: 'nearest' });
                const matchedCard = currentMatches[idx];
                if (matchedCard && matchedCard.image && !GameVault.isCompleted()) {
                    showPreviewImage(matchedCard.image);
                }
            } else {
                li.classList.remove('active-suggestion');
            }
        });
    };

    cardInput.addEventListener('input', (e) => {
        if (stagedCard) {
            stagedCard = null;
            if (mobileGuessBar) mobileGuessBar.style.display = 'none';
            document.getElementById('image-container')?.classList.remove('mobile-card-staged');
        }

        const rawVal = e.target.value.trim().toLowerCase();
        suggestions.innerHTML = '';
        activeIndex = -1;
        currentMatches = [];

        if (!rawVal) {
            if (!GameVault.isCompleted()) showPreviewImage(null);
            return;
        }

        // Tokenized fuzzy search: "elsa fifth" matches "Elsa - The Fifth Spirit"
        const tokens = rawVal.split(/[\s\-]+/).filter(Boolean);
        currentMatches = cards.filter(card => {
            if (guessedCards.has(card.name)) return false;
            const hay = card.name.toLowerCase();
            return tokens.every(tok => hay.includes(tok));
        }).slice(0, 60);

        currentMatches.forEach((card, idx) => {
            const li = document.createElement('li');

            if (card.colors && card.colors.length > 0) {
                if (card.colors.length === 1) {
                    li.style.backgroundColor = INK_COLORS[card.colors[0]] || '#e0e0e0';
                } else {
                    const c1 = INK_COLORS[card.colors[0]] || '#e0e0e0';
                    const c2 = INK_COLORS[card.colors[1]] || '#e0e0e0';
                    li.style.background = `linear-gradient(90deg, ${c1} 0%, ${c2} 100%)`;
                }
            }

            const [mainTitle, subTitle] = card.name.split(' - ');
            li.innerHTML = `
                <div class="suggestion-left">
                    ${card.image ? `<img src="${escapeHtml(card.image)}" class="suggestion-thumb" loading="lazy" alt="">` : ''}
                    <div class="suggestion-name-group">
                        <span class="suggestion-main-name">${escapeHtml(mainTitle)}</span>
                        ${subTitle ? `<span class="suggestion-sub-name">${escapeHtml(subTitle)}</span>` : ''}
                    </div>
                </div>
                <div class="suggestion-badges">
                    <span class="sug-badge" title="${escapeHtml(card.set)}">${escapeHtml(card.setCode || 'SET')}</span>
                    <span class="sug-badge sug-cost" title="Ink Cost">⬡ ${card.cost}</span>
                </div>
            `;

            li.addEventListener('mouseenter', () => {
                if (!isMobileDevice()) {
                    activeIndex = idx;
                    updateActiveHighlight();
                }
            });

            li.addEventListener('click', () => {
                if (isMobileDevice()) {
                    stageCardForMobile(card);
                } else {
                    cardInput.value = '';
                    suggestions.innerHTML = '';
                    guessCard(card);
                }
            });

            suggestions.appendChild(li);
        });
    });

    cardInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && stagedCard && !currentMatches.length) {
            e.preventDefault();
            const toGuess = stagedCard;
            clearStagedCard(false);
            cardInput.value = '';
            guessCard(toGuess);
            return;
        }

        if (!currentMatches.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = (activeIndex + 1) % currentMatches.length;
            updateActiveHighlight();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = (activeIndex - 1 + currentMatches.length) % currentMatches.length;
            updateActiveHighlight();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const chosen = activeIndex >= 0 ? currentMatches[activeIndex] : currentMatches[0];
            if (chosen) {
                if (isMobileDevice()) {
                    stageCardForMobile(chosen);
                } else {
                    cardInput.value = '';
                    suggestions.innerHTML = '';
                    currentMatches = [];
                    guessCard(chosen);
                }
            }
        } else if (e.key === 'Escape') {
            suggestions.innerHTML = '';
            currentMatches = [];
        }
    });

    document.addEventListener('click', (e) => {
        if (!cardInput.contains(e.target) && !suggestions.contains(e.target)) {
            suggestions.innerHTML = '';
        }
    });
}

function buildComparisonRow(card, targetCard, animate = true) {
    const row = document.createElement('div');
    row.classList.add('row');

    const cells = [
        createNameCell(card, targetCard),
        createNumberCell(card.number, targetCard.number),
        createSetCell(card, targetCard),
        createCell(card.cost, targetCard.cost),
        createCell(card.inkable ? 'Yes' : 'No', targetCard.inkable ? 'Yes' : 'No'),
        createColorCell(card.colors, targetCard.colors),
        createTypeCell(card.type, targetCard.type),
        createCell(card.rarity, targetCard.rarity)
    ];

    cells.forEach((cell, idx) => {
        if (animate) {
            cell.classList.add('flip-animate');
            cell.style.setProperty('--flip-delay', `${idx * 85}ms`);
        }
        row.appendChild(cell);
    });

    return row;
}

function guessCard(card) {
    const targetCard = GameVault.getTarget();
    if (!card || !targetCard || guessedCards.has(card.name) || GameVault.isCompleted()) return;

    guessedCards.add(card.name);
    const board = document.getElementById('game-board');
    const row = buildComparisonRow(card, targetCard, true);
    if (board) board.appendChild(row);

    const todayCST = GameVault.getDate() || getCSTDateISO();
    const isWin = card.name === targetCard.name;
    const guessesArr = Array.from(guessedCards);

    saveLocalDailyState(todayCST, guessesArr, isWin);
    updateCardTracker();

    if (isWin) {
        GameVault.setCompleted(true);
        setTimeout(() => endGame(false), 8 * 85 + 150);
    } else {
        // Persist in-progress guesses to server if logged in
        if (currentUser) {
            const token = localStorage.getItem('loredle_token');
            fetch('/api/daily-progress', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    username: currentUser,
                    guesses: guessesArr,
                    trackerUsed: Boolean(window.trackerUsedInGame)
                })
            }).catch(() => {});
        }
    }
}

function createNameCell(card, targetCard) {
    const cell = document.createElement('div');
    cell.classList.add('cell');
    const [main, sub] = card.name.split(' - ');
    cell.innerHTML = `
        <span class="cell-main-val">${escapeHtml(main)}</span>
        ${sub ? `<span class="cell-sub-val">${escapeHtml(sub)}</span>` : ''}
    `;
    cell.classList.add(card.name === targetCard.name ? 'correct' : 'incorrect');
    if (card.image) {
        cell.style.cursor = 'pointer';
        cell.addEventListener('click', () => {
            if (!GameVault.isCompleted()) {
                showPreviewImage(card.image);
            }
        });
    }
    return cell;
}

function createSetCell(card, targetCard) {
    const cell = document.createElement('div');
    cell.classList.add('cell');
    cell.title = card.reprintSets && card.reprintSets.length > 1
        ? `Printed in: ${card.reprintSets.join(', ')}`
        : card.set;

    cell.innerHTML = `
        <span class="cell-main-val">${escapeHtml(card.set)}</span>
        ${card.setCode ? `<span class="cell-sub-val">[${escapeHtml(card.setCode)}]</span>` : ''}
    `;
    cell.classList.add(card.set === targetCard.set ? 'correct' : 'incorrect');
    return cell;
}

function createCell(guessValue, targetValue) {
    const cell = document.createElement('div');
    cell.classList.add('cell');
    cell.textContent = guessValue;
    cell.classList.add(guessValue === targetValue ? 'correct' : 'incorrect');
    return cell;
}

function createColorCell(guessColors, targetColors) {
    const cell = document.createElement('div');
    cell.classList.add('cell');
    cell.textContent = guessColors.join(' / ');

    const matchingInks = guessColors.filter(ink => targetColors.includes(ink));
    const isExactMatch = guessColors.length === targetColors.length && matchingInks.length === guessColors.length;

    if (isExactMatch) {
        cell.classList.add('correct');
    } else if (matchingInks.length > 0) {
        cell.classList.add('close');
    } else {
        cell.classList.add('incorrect');
    }

    return cell;
}

function createNumberCell(guessValue, targetValue) {
    const cell = document.createElement('div');
    cell.classList.add('cell');
    cell.style.fontFamily = 'var(--font-mono)';

    if (guessValue === targetValue) {
        cell.textContent = guessValue;
        cell.classList.add('correct');
    } else {
        const arrow = guessValue < targetValue ? ' ⬆️' : ' ⬇️';
        cell.textContent = guessValue + arrow;
        if (Math.abs(guessValue - targetValue) <= 10) {
            cell.classList.add('close');
        } else {
            cell.classList.add('incorrect');
        }
    }
    return cell;
}

function createTypeCell(guessValue, targetValue) {
    const cell = document.createElement('div');
    cell.classList.add('cell');
    cell.textContent = guessValue;

    if (guessValue === targetValue) {
        cell.classList.add('correct');
    } else {
        const guessWords = guessValue.split(/[\s-]+/);
        const targetWords = targetValue.split(/[\s-]+/);
        const hasOverlap = guessWords.some(word => targetWords.includes(word));
        cell.classList.add(hasOverlap ? 'close' : 'incorrect');
    }
    return cell;
}

function launchVictoryConfetti() {
    const colors = ['#9d7bff', '#2ce5c6', '#ff47ab', '#ffd166'];
    for (let i = 0; i < 36; i++) {
        const piece = document.createElement('div');
        piece.style.position = 'fixed';
        piece.style.width = '12px';
        piece.style.height = '12px';
        piece.style.backgroundColor = colors[i % colors.length];
        piece.style.border = '2px solid #000';
        piece.style.left = `${50 + (Math.random() - 0.5) * 30}%`;
        piece.style.top = '30%';
        piece.style.zIndex = '9998';
        piece.style.pointerEvents = 'none';
        document.body.appendChild(piece);

        const dx = (Math.random() - 0.5) * 420;
        const dy = -120 - Math.random() * 240;
        const rot = (Math.random() - 0.5) * 720;

        piece.animate([
            { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
            { transform: `translate(${dx}px, ${dy}px) rotate(${rot / 2}deg)`, opacity: 1, offset: 0.45 },
            { transform: `translate(${dx * 1.3}px, ${dy + 480}px) rotate(${rot}deg)`, opacity: 0 }
        ], {
            duration: 1400 + Math.random() * 600,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
        }).onfinish = () => piece.remove();
    }
}

function startMidnightCountdown() {
    const timerEl = document.getElementById('next-card-countdown');
    if (!timerEl) return;

    const tick = () => {
        const nowCST = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const midnightCST = new Date(nowCST);
        midnightCST.setHours(24, 0, 0, 0);
        const diff = Math.max(0, midnightCST - nowCST);
        const hrs = String(Math.floor(diff / 3600000)).padStart(2, '0');
        const mins = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
        const secs = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
        timerEl.textContent = `${hrs}:${mins}:${secs}`;
    };
    tick();
    setInterval(tick, 1000);
}

function endGame(isSilentRestore = false) {
    const targetCard = GameVault.getTarget();
    if (targetCard) {
        showPreviewImage(targetCard.image, targetCard.foilMask, true);
    }

    if (!isSilentRestore) {
        launchVictoryConfetti();
    }

    const cardInput = document.getElementById('card-input');
    if (cardInput) {
        cardInput.disabled = true;
        cardInput.placeholder = `SOLVED IN ${guessedCards.size} ${guessedCards.size === 1 ? 'TRY' : 'TRIES'}!`;
    }

    const emojiFeedbackContainer = document.getElementById('emoji-feedback-container');
    if (!emojiFeedbackContainer) return;
    emojiFeedbackContainer.innerHTML = '';

    const title = document.createElement('div');
    title.classList.add('emoji-row');
    title.innerHTML = '<strong>🅻 🅾 🆁 🅴 🅳 🅻 🅴</strong><br>';

    const options = { timeZone: 'America/Chicago', day: 'numeric', month: 'long', year: 'numeric' };
    const dateStringCST = new Intl.DateTimeFormat('en-US', options).format(new Date());

    const date = document.createElement('div');
    date.classList.add('emoji-row');
    date.textContent = dateStringCST;
    title.appendChild(date);
    emojiFeedbackContainer.appendChild(title);

    const feedback = document.getElementById('game-board');
    const rowsArray = Array.from(feedback.childNodes);

    rowsArray.forEach((row, index) => {
        const emojiRow = document.createElement('div');
        emojiRow.classList.add('emoji-row');
        const emojiNumbers = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        const guessNumberCell = document.createElement('span');
        guessNumberCell.textContent = index < 10 ? emojiNumbers[index] + ' ' : (index + 1) + ' ';
        emojiRow.appendChild(guessNumberCell);

        row.childNodes.forEach((cell, cellIndex) => {
            if (cellIndex > 0) {
                const emojiCell = document.createElement('span');
                if (cell.classList.contains('correct')) {
                    emojiCell.textContent = '🟩 ';
                } else if (cell.classList.contains('close')) {
                    emojiCell.textContent = '🟨 ';
                } else {
                    emojiCell.textContent = '🟥 ';
                }
                emojiRow.appendChild(emojiCell);
            }
        });
        emojiFeedbackContainer.appendChild(emojiRow);
    });

    const url = document.createElement('div');
    url.classList.add('emoji-row');
    url.textContent = 'loredle.villainy.ink';
    emojiFeedbackContainer.appendChild(url);

    let emojiText = '🅻🅾🆁🅴🅳🅻🅴\n' + dateStringCST + '\n';
    emojiFeedbackContainer.childNodes.forEach((row, rowIndex) => {
        if (rowIndex > 0) {
            emojiText += row.innerText.trim().replace(/\s+/g, ' ') + '\n';
        }
    });

    if (!isSilentRestore && targetCard) {
        const token = localStorage.getItem('loredle_token');
        fetch('/api/submit-score', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
                username: currentUser || 'Anonymous User',
                tries: guessedCards.size,
                shareText: emojiText,
                targetCard: targetCard.name,
                guesses: Array.from(guessedCards),
                trackerUsed: Boolean(window.trackerUsedInGame)
            })
        }).catch(err => console.error('Error submitting score:', err));
    }

    const trackerBar = document.getElementById('card-tracker-bar');
    if (trackerBar) trackerBar.style.display = 'none';

    const copyButton = document.getElementById('copy-emoji-button');
    if (copyButton) {
        const freshBtn = copyButton.cloneNode(true);
        copyButton.replaceWith(freshBtn);
        freshBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(emojiText)
                .then(() => showToast('Copied to clipboard!'))
                .catch(() => showToast('Failed to copy.'));
        });
    }

    const feedbackBox = document.getElementById('emoji-feedback');
    if (feedbackBox) {
        feedbackBox.style.display = 'block';
        startMidnightCountdown();

        const winGroupsBtn = document.getElementById('win-groups-btn');
        if (winGroupsBtn) {
            winGroupsBtn.style.display = currentUser ? 'inline-block' : 'none';
        }
    }
}

function showToast(message) {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
}

// ==========================================================================
// GAMEPLAY SETTINGS & CARD TRACKER
// ==========================================================================
function setupGameplaySettings() {
    const trackerToggle = document.getElementById('card-tracker-toggle');
    if (trackerToggle) {
        trackerToggle.checked = localStorage.getItem('loredle_setting_card_tracker') === 'true';
        trackerToggle.addEventListener('change', (e) => {
            localStorage.setItem('loredle_setting_card_tracker', e.target.checked);
            showToast(e.target.checked ? 'Card Tracker enabled! (🔎 badge will apply to solves)' : 'Card Tracker disabled.');
        });
    }
}

window.trackerUsedInGame = false;
let currentRemainingCandidates = [];

function initCardTrackerUI() {
    const trackerBar = document.getElementById('card-tracker-bar');
    if (!trackerBar) return;

    const isEnabled = localStorage.getItem('loredle_setting_card_tracker') === 'true';
    if (!isEnabled || GameVault.isCompleted()) {
        trackerBar.style.display = 'none';
        return;
    }

    trackerBar.style.display = 'block';
    updateCardTracker();
}

function updateCardTracker() {
    const target = GameVault.getTarget();
    if (!target || !Array.isArray(cards) || cards.length === 0) return;

    const trackerCountBadge = document.getElementById('tracker-candidates-count');
    const modalCountBadge = document.getElementById('tracker-modal-count');

    const guessedNames = guessedCards;
    const guessedList = Array.from(guessedNames).map(name => findCardByName(name)).filter(Boolean);

    currentRemainingCandidates = cards.filter(cand => {
        if (guessedNames.has(cand.name)) return false;

        // Candidate must be consistent with all clues revealed so far
        for (const guess of guessedList) {
            // 1. Name check
            if (cand.name === guess.name) return false;

            // 2. Number check
            if (guess.number === target.number) {
                if (cand.number !== guess.number) return false;
            } else {
                const targetHigher = target.number > guess.number;
                const candHigher = cand.number > guess.number;
                if (targetHigher !== candHigher) return false;

                const targetClose = Math.abs(guess.number - target.number) <= 10;
                const candClose = Math.abs(guess.number - cand.number) <= 10;
                if (targetClose !== candClose) return false;
            }

            // 3. Set check
            const setMatch = (guess.set === target.set);
            if (setMatch) {
                if (cand.set !== guess.set) return false;
            } else {
                if (cand.set === guess.set) return false;
            }

            // 4. Cost check
            const costMatch = (guess.cost === target.cost);
            if (costMatch) {
                if (cand.cost !== guess.cost) return false;
            } else {
                if (cand.cost === guess.cost) return false;
            }

            // 5. Inkable check
            const inkableMatch = (Boolean(guess.inkable) === Boolean(target.inkable));
            const candInkableMatch = (Boolean(cand.inkable) === Boolean(guess.inkable));
            if (inkableMatch !== candInkableMatch) return false;

            // 6. Colors check
            const guessColors = Array.isArray(guess.colors) ? guess.colors : [guess.colors];
            const targetColors = Array.isArray(target.colors) ? target.colors : [target.colors];
            const candColors = Array.isArray(cand.colors) ? cand.colors : [cand.colors];

            const targetExact = guessColors.length === targetColors.length && guessColors.every(c => targetColors.includes(c));
            const targetPartial = !targetExact && guessColors.some(c => targetColors.includes(c));

            const candExact = guessColors.length === candColors.length && guessColors.every(c => candColors.includes(c));
            const candPartial = !candExact && guessColors.some(c => candColors.includes(c));

            if (targetExact !== candExact) return false;
            if (targetPartial !== candPartial) return false;

            // 7. Type check
            const targetTypeExact = guess.type === target.type;
            const candTypeExact = cand.type === guess.type;
            if (targetTypeExact !== candTypeExact) return false;

            if (!targetTypeExact) {
                const guessWords = (guess.type || '').split(/[\s-]+/);
                const targetWords = (target.type || '').split(/[\s-]+/);
                const candWords = (cand.type || '').split(/[\s-]+/);

                const targetOverlap = guessWords.some(w => targetWords.includes(w));
                const candOverlap = guessWords.some(w => candWords.includes(w));
                if (targetOverlap !== candOverlap) return false;
            }

            // 8. Rarity check
            const rarityMatch = (guess.rarity === target.rarity);
            const candRarityMatch = (cand.rarity === guess.rarity);
            if (rarityMatch !== candRarityMatch) return false;
        }

        return true;
    });

    if (trackerCountBadge) trackerCountBadge.textContent = currentRemainingCandidates.length;
    if (modalCountBadge) modalCountBadge.textContent = currentRemainingCandidates.length;

    renderTrackerCards(currentRemainingCandidates);
}

window.openCardTracker = function() {
    window.trackerUsedInGame = true;
    const todayCST = GameVault.getDate() || getCSTDateISO();
    saveLocalDailyState(todayCST, Array.from(guessedCards), GameVault.isCompleted(), true);

    const modal = document.getElementById('card-tracker-modal');
    if (modal) {
        modal.style.display = 'block';
        updateCardTracker();
        const searchInput = document.getElementById('tracker-search-input');
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }
    }
};

window.closeCardTracker = function() {
    const modal = document.getElementById('card-tracker-modal');
    if (modal) modal.style.display = 'none';
};

window.filterTrackerList = function(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
        renderTrackerCards(currentRemainingCandidates);
        return;
    }
    const filtered = currentRemainingCandidates.filter(c => 
        c.name.toLowerCase().includes(q) ||
        (c.set && c.set.toLowerCase().includes(q)) ||
        (c.colors && (Array.isArray(c.colors) ? c.colors.join(' ') : c.colors).toLowerCase().includes(q)) ||
        (c.type && c.type.toLowerCase().includes(q))
    );
    renderTrackerCards(filtered);
};

function renderTrackerCards(cardList) {
    const container = document.getElementById('tracker-card-list');
    if (!container) return;

    if (!cardList || cardList.length === 0) {
        container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 30px;">No cards match your filter or clues.</div>';
        return;
    }

    const displayList = cardList.slice(0, 120);

    const INK_HEX_MAP = {
        Amber: '#F5A623',
        Amethyst: '#9B51E0',
        Emerald: '#27AE60',
        Ruby: '#EB5757',
        Sapphire: '#2F80ED',
        Steel: '#828282'
    };

    container.innerHTML = displayList.map(c => {
        const isInkable = Boolean(c.inkable);
        const cardColors = Array.isArray(c.colors) ? c.colors : (c.colors ? [c.colors] : []);
        const colorDotsHtml = cardColors.map(col => {
            const hex = INK_HEX_MAP[col] || '#999';
            return `<span class="tracker-color-dot" style="background-color: ${hex};" title="${col}"></span>`;
        }).join('');

        const inkIcon = isInkable
            ? `<img src="/assets/icons/inkable.svg" class="tracker-chip-icon" alt="Inkable" title="Inkable">`
            : `<img src="/assets/icons/non-inkable.svg" class="tracker-chip-icon" alt="Non-Inkable" title="Non-Inkable">`;

        return `
            <div class="tracker-card-item" onclick="selectTrackerCard('${escapeHtml(c.name).replace(/'/g, "\\'")}')" title="${escapeHtml(c.name)} • Cost: ${c.cost} • ${isInkable ? 'Inkable' : 'Non-Inkable'} • ${escapeHtml(c.set || '')}">
                <img src="${c.image}" alt="${escapeHtml(c.name)}" loading="lazy" class="tracker-card-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="tracker-card-fallback">🎴</div>

                <!-- Top Left Chip: Cost & Inkable -->
                <div class="tracker-chip-cost ${isInkable ? 'inkable' : 'non-inkable'}">
                    <span>${c.cost}</span>
                    ${inkIcon}
                </div>

                <!-- Top Right Chip: Color Dots -->
                <div class="tracker-chip-colors">
                    ${colorDotsHtml}
                </div>

                <!-- Bottom Banner -->
                <div class="tracker-card-banner">
                    <div class="tracker-card-name">${escapeHtml(c.name)}</div>
                    <div class="tracker-card-sub">
                        <span>${escapeHtml(c.setCode || c.set || '')}</span>
                        <span>${escapeHtml(c.type || '')}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (cardList.length > 120) {
        container.innerHTML += `<div style="grid-column: 1 / -1; text-align: center; font-size: 0.8rem; color: var(--text-secondary); padding: 12px;">+ ${cardList.length - 120} more cards (type in the search bar above to narrow down)</div>`;
    }
}

window.selectTrackerCard = function(cardName) {
    const cardInput = document.getElementById('card-input');
    if (cardInput) {
        cardInput.value = cardName;
        closeCardTracker();
        const cardObj = findCardByName(cardName);
        if (cardObj) {
            guessCard(cardObj);
        }
    }
};

// ==========================================================================
// DYNAMIC CANVAS SHARE GRAPHIC GENERATOR & SOCIAL SHARE BUTTONS
// ==========================================================================
async function generateShareGraphicBlob() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    const guessCount = guessedCards.size;
    const rowsArray = Array.from(document.getElementById('game-board')?.childNodes || []);
    const computedHeight = Math.max(540, 240 + rowsArray.length * 48);
    canvas.height = computedHeight;

    const ctx = canvas.getContext('2d');

    // 1. Brutalist Background
    ctx.fillStyle = '#fdfbf7';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Hard outer border
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

    // 2. Header Banner
    ctx.fillStyle = '#2ce5c6';
    ctx.fillRect(4, 4, canvas.width - 8, 90);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(4, 94);
    ctx.lineTo(canvas.width - 4, 94);
    ctx.stroke();

    // Title
    ctx.fillStyle = '#000000';
    ctx.font = '900 36px "Space Grotesk", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('LOREDLE', 28, 50);

    // Date
    const options = { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' };
    const dateStr = new Intl.DateTimeFormat('en-US', options).format(new Date());
    ctx.font = '700 16px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(dateStr, canvas.width - 28, 50);

    // 3. User & Score Summary Box
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(28, 116, canvas.width - 56, 70);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(28, 116, canvas.width - 56, 70);

    // Drop shadow
    ctx.fillStyle = '#000000';
    ctx.fillRect(canvas.width - 28, 122, 6, 64);
    ctx.fillRect(34, 186, canvas.width - 56, 6);

    // User details inside box
    const userLabel = (currentUser || 'Anonymous') + (window.trackerUsedInGame ? ' 🔎' : '');
    ctx.fillStyle = '#000000';
    ctx.font = '700 20px "Space Grotesk", sans-serif';
    ctx.fillText(userLabel, 44, 152);

    // Solved Badge
    const solveBadgeText = `SOLVED IN ${guessCount} ${guessCount === 1 ? 'TRY' : 'TRIES'}!`;
    ctx.font = '900 16px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#2ce5c6';
    const badgeWidth = ctx.measureText(solveBadgeText).width + 24;
    ctx.fillRect(canvas.width - 44 - badgeWidth, 131, badgeWidth, 40);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(canvas.width - 44 - badgeWidth, 131, badgeWidth, 40);
    ctx.fillStyle = '#000000';
    ctx.fillText(solveBadgeText, canvas.width - 56, 156);

    // 4. Matrix of guesses
    const startY = 220;
    const tileWidth = 44;
    const tileHeight = 36;
    const gap = 8;
    const totalRowWidth = (tileWidth + gap) * 8 - gap;
    const startX = Math.round((canvas.width - totalRowWidth) / 2);

    rowsArray.forEach((row, rIdx) => {
        const y = startY + rIdx * (tileHeight + 10);
        let cIdx = 0;
        row.childNodes.forEach((cell, cellIndex) => {
            if (cellIndex > 0) { // skip name cell
                const x = startX + cIdx * (tileWidth + gap);
                let fillCol = '#ff5c7c'; // red incorrect
                if (cell.classList.contains('correct')) {
                    fillCol = '#2ce5c6'; // green correct
                } else if (cell.classList.contains('close')) {
                    fillCol = '#ffd166'; // yellow close
                }

                // Tile shadow
                ctx.fillStyle = '#000000';
                ctx.fillRect(x + 3, y + 3, tileWidth, tileHeight);

                // Tile body
                ctx.fillStyle = fillCol;
                ctx.fillRect(x, y, tileWidth, tileHeight);
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#000000';
                ctx.strokeRect(x, y, tileWidth, tileHeight);

                cIdx++;
            }
        });
    });

    // 5. Watermark Footer
    const footerY = canvas.height - 24;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#666666';
    ctx.font = '700 14px "Space Grotesk", sans-serif';
    ctx.fillText('loredle.villainy.ink • Disney Lorcana Daily Challenge', canvas.width / 2, footerY);

    return new Promise(resolve => {
        canvas.toBlob(blob => resolve(blob), 'image/png');
    });
}

window.copyShareGraphicToClipboard = async function(silent = false) {
    try {
        const blob = await generateShareGraphicBlob();
        if (navigator.clipboard && navigator.clipboard.write) {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            if (!silent) showToast('📸 Card image copied to clipboard!');
            return true;
        }
    } catch (e) {
        console.warn('Clipboard write failed, downloading instead:', e);
    }
    if (!silent) {
        downloadShareGraphic();
        showToast('Image downloaded!');
    }
    return false;
};

window.downloadShareGraphic = async function() {
    try {
        const blob = await generateShareGraphicBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = GameVault.getDate() || getCSTDateISO();
        a.download = `Loredle-${dateStr}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error('Error downloading graphic:', e);
        showToast('Failed to generate image download.');
    }
};

window.shareToX = async function() {
    await copyShareGraphicToClipboard(true);
    showToast('📋 Image copied! Paste (Ctrl+V) into your tweet.');
    const tries = guessedCards.size;
    const trackerText = window.trackerUsedInGame ? ' 🔎' : '';
    const text = `I solved today's Loredle in ${tries} ${tries === 1 ? 'try' : 'tries'}!${trackerText}\n\nCan you beat my score?\nhttps://loredle.villainy.ink`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=450');
};

window.shareToFacebook = function() {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://loredle.villainy.ink')}&quote=${encodeURIComponent(`I solved today's Loredle in ${guessedCards.size} tries!`)}`;
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=450');
};

window.shareNativeOrInstagram = async function() {
    try {
        const blob = await generateShareGraphicBlob();
        const dateStr = GameVault.getDate() || getCSTDateISO();
        const file = new File([blob], `Loredle-${dateStr}.png`, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: 'Loredle Daily Solve',
                text: `I solved today's Loredle in ${guessedCards.size} tries! https://loredle.villainy.ink`
            });
            return;
        }
    } catch (e) {
        if (e.name !== 'AbortError') console.warn('Native share failed:', e);
    }
    await copyShareGraphicToClipboard(false);
};

// ==========================================================================
// FRIEND GROUPS CONTROLLER & LEADERBOARD
// ==========================================================================
let cachedMyGroups = [];
let activeGroupIndex = 0;
let groupSuffixReroll = Math.floor(100 + Math.random() * 900);

window.initLeaderboardsPage = function() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'groups') {
        window.location.replace('groups.html');
        return;
    }
    fetchGlobalLeaderboard();
    const lbGroupsBtn = document.getElementById('lb-friend-groups-btn');
    if (lbGroupsBtn) {
        lbGroupsBtn.style.display = currentUser ? 'inline-block' : 'none';
    }
};

window.switchLeaderboardTab = function(tab) {
    if (tab === 'groups') {
        window.location.href = 'groups.html';
    } else {
        window.location.href = 'leaderboard.html';
    }
};

window.initGroupsPage = async function() {
    const authGuard = document.getElementById('group-auth-guard');
    const emptyState = document.getElementById('group-empty-state');
    const activeContent = document.getElementById('group-active-content');

    if (!currentUser) {
        if (authGuard) authGuard.style.display = 'block';
        if (emptyState) emptyState.style.display = 'none';
        if (activeContent) activeContent.style.display = 'none';
        return;
    }

    if (authGuard) authGuard.style.display = 'none';
    await loadMyGroups();

    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if (action === 'create') {
        setTimeout(() => {
            if (currentUser) openCreateGroupModal();
        }, 250);
    } else if (action === 'join') {
        setTimeout(() => {
            if (currentUser) openJoinGroupModal();
        }, 250);
    }
};

async function loadMyGroups() {
    const authGuard = document.getElementById('group-auth-guard');
    const emptyState = document.getElementById('group-empty-state');
    const activeContent = document.getElementById('group-active-content');

    if (!currentUser) {
        if (authGuard) authGuard.style.display = 'block';
        if (emptyState) emptyState.style.display = 'none';
        if (activeContent) activeContent.style.display = 'none';
        return;
    }

    if (authGuard) authGuard.style.display = 'none';

    try {
        const token = localStorage.getItem('loredle_token');
        const res = await fetch('/api/groups/my-groups', {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        const data = await res.json();
        cachedMyGroups = Array.isArray(data) ? data : (data.groups || []);

        // Check if user already owns 1 group (limit 1 owned group per user)
        const ownsGroup = cachedMyGroups.some(g => g.owner === currentUser);
        const newGroupBtn = document.getElementById('btn-create-group-action');
        if (newGroupBtn) {
            newGroupBtn.style.display = ownsGroup ? 'none' : 'inline-block';
        }
        const emptyCreateBtn = document.getElementById('btn-empty-create-group');
        if (emptyCreateBtn) {
            emptyCreateBtn.style.display = ownsGroup ? 'none' : 'inline-block';
        }

        if (cachedMyGroups.length === 0) {
            if (emptyState) emptyState.style.display = 'block';
            if (activeContent) activeContent.style.display = 'none';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        if (activeContent) activeContent.style.display = 'block';

        const groupSelect = document.getElementById('group-select');
        if (groupSelect) {
            groupSelect.innerHTML = cachedMyGroups.map((g) => `
                <option value="${g.code}">${escapeHtml(g.name)} (#${g.code})</option>
            `).join('');

            if (activeGroupIndex >= cachedMyGroups.length) activeGroupIndex = 0;
            groupSelect.value = cachedMyGroups[activeGroupIndex].code;
        }

        loadGroupLeaderboard(cachedMyGroups[activeGroupIndex].code);
    } catch (e) {
        console.error('Error loading my groups:', e);
    }
}

window.stepGroupSelection = function(dir) {
    if (cachedMyGroups.length <= 1) return;
    activeGroupIndex = (activeGroupIndex + dir + cachedMyGroups.length) % cachedMyGroups.length;
    const code = cachedMyGroups[activeGroupIndex].code;
    const select = document.getElementById('group-select');
    if (select) select.value = code;
    loadGroupLeaderboard(code);
};

window.onGroupSelectChange = function(code) {
    const idx = cachedMyGroups.findIndex(g => g.code === code);
    if (idx !== -1) activeGroupIndex = idx;
    loadGroupLeaderboard(code);
};

let cachedMemberStats = [];
let currentStatsSort = 'streak'; // default sorting is win streak
let currentStatsSortAsc = false; // highest streak first

window.toggleGroupStatsSort = function(type) {
    if (type !== 'streak' && type !== 'avg' && type !== 'solves') return;
    if (currentStatsSort === type) {
        currentStatsSortAsc = !currentStatsSortAsc;
    } else {
        currentStatsSort = type;
        currentStatsSortAsc = type === 'avg'; // avg tries is best when lowest
    }
    renderGroupStats();
};

function renderGroupStats() {
    const tbody = document.getElementById('group-stats-body');
    if (!tbody) return;

    function getHeaderHtml(title, key) {
        if (currentStatsSort !== key) {
            return `<span style="display: inline-flex; align-items: center; vertical-align: middle;">${title}</span>`;
        }
        const arrow = currentStatsSortAsc ? '▲' : '▼';
        return `<span style="display: inline-flex; align-items: center; vertical-align: middle;"><span>${title}</span><span class="sort-chevron-pill">${arrow}</span></span>`;
    }

    const thStreak = document.getElementById('th-sort-streak');
    const thAvg = document.getElementById('th-sort-avg');
    const thSolves = document.getElementById('th-sort-solves');
    const thUser = document.getElementById('th-sort-username');

    if (thStreak) thStreak.innerHTML = getHeaderHtml('Win Streak', 'streak');
    if (thAvg) thAvg.innerHTML = getHeaderHtml('Avg. Tries', 'avg');
    if (thSolves) thSolves.innerHTML = getHeaderHtml('Solves', 'solves');
    if (thUser) thUser.innerHTML = 'Member';

    if (!cachedMemberStats || cachedMemberStats.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="color: var(--text-secondary);">No member stats available.</td></tr>';
        return;
    }

    const sorted = [...cachedMemberStats].sort((a, b) => {
        if (currentStatsSort === 'streak') {
            const diff = (b.streak || 0) - (a.streak || 0);
            if (diff !== 0) return currentStatsSortAsc ? -diff : diff;
            return (a.avgTries || 99) - (b.avgTries || 99);
        } else if (currentStatsSort === 'avg') {
            const aVal = a.avgTries !== null && a.avgTries !== undefined ? a.avgTries : 999;
            const bVal = b.avgTries !== null && b.avgTries !== undefined ? b.avgTries : 999;
            const diff = aVal - bVal;
            if (diff !== 0) return currentStatsSortAsc ? diff : -diff;
            return (b.streak || 0) - (a.streak || 0);
        } else {
            // 'solves'
            const diff = (b.totalSolves || 0) - (a.totalSolves || 0);
            return currentStatsSortAsc ? -diff : diff;
        }
    });

    ['streak', 'avg', 'solves'].forEach(key => {
        const btn = document.getElementById(`btn-sort-${key}`);
        if (btn) {
            btn.classList.toggle('active', currentStatsSort === key);
        }
    });

    tbody.innerHTML = sorted.map(m => {
        const streakBadge = m.streak > 0
            ? `<span style="font-weight: 800; color: #ff9800;">${m.streak} 🔥</span>`
            : `<span style="color: var(--text-secondary);">0</span>`;
        const avgDisplay = m.avgTries !== null
            ? `<span style="font-weight: 800; color: var(--secondary-color);">${m.avgTries}</span>`
            : `<span style="color: var(--text-secondary);">--</span>`;
        const solvesDisplay = `<span style="font-weight: 800; color: var(--close);">${m.totalSolves || 0}</span>`;

        return `
            <tr>
                <td style="font-weight: 700;">
                    <div style="display: inline-flex; align-items: center; gap: 8px;">
                        ${renderAvatarBadge(m.avatar, m.username)}
                        <span>${escapeHtml(m.username)}</span>
                    </div>
                </td>
                <td style="text-align: center; font-family: var(--font-mono);">${streakBadge}</td>
                <td style="text-align: center; font-family: var(--font-mono);">${avgDisplay}</td>
                <td style="text-align: center; font-family: var(--font-mono);">${solvesDisplay}</td>
            </tr>
        `;
    }).join('');
}

async function loadGroupLeaderboard(code) {
    try {
        const token = localStorage.getItem('loredle_token');
        const res = await fetch(`/api/groups/${code}/leaderboard`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (!res.ok) throw new Error('Failed to load group leaderboard');
        const data = await res.json();

        // Header info
        document.getElementById('group-display-name').textContent = data.group.name;
        document.getElementById('group-display-owner').textContent = data.group.owner;
        document.getElementById('group-members-count').textContent = data.group.membersCount || (data.group.members || []).length || 1;
        document.getElementById('group-display-code').textContent = '#' + data.group.code;

        // Owner settings button vs Member Leave button
        const settingsBtn = document.getElementById('btn-group-settings');
        if (settingsBtn) {
            settingsBtn.style.display = data.group.isOwner ? 'inline-block' : 'none';
        }
        const leaveBtn = document.getElementById('btn-leave-group');
        if (leaveBtn) {
            leaveBtn.style.display = data.group.isOwner ? 'none' : 'inline-block';
        }

        // 1. Today's group scores (ordered by fewest tries, then completion time)
        const todayTbody = document.getElementById('group-today-body');
        if (todayTbody) {
            if (!data.todayScores || data.todayScores.length === 0) {
                todayTbody.innerHTML = '<tr><td colspan="4" style="color: var(--text-secondary);">No one in this group has solved today\'s card yet.</td></tr>';
            } else {
                todayTbody.innerHTML = data.todayScores.map((s, idx) => {
                    const medal = idx === 0 ? '👑 #1' : idx === 1 ? '🥈 #2' : idx === 2 ? '🥉 #3' : `#${idx + 1}`;
                    const trackerBadge = s.trackerUsed ? '<span title="Solved with Card Tracker" style="margin-left: 6px; cursor: help;">🔎</span>' : '';
                    return `
                        <tr>
                            <td style="font-family: var(--font-mono); font-weight: 700;">${medal}</td>
                            <td>
                                <div style="display: inline-flex; align-items: center; gap: 8px;">
                                    ${renderAvatarBadge(s.avatar, s.username)}
                                    <span style="font-weight: 700;">${escapeHtml(s.username)}</span>
                                    ${trackerBadge}
                                </div>
                            </td>
                            <td style="font-family: var(--font-mono); font-weight: 800; color: var(--secondary-color); text-align: center; font-size: 1.1rem;">${s.tries}</td>
                            <td style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-secondary); text-align: right;">${escapeHtml(s.timeFormatted || '--')}</td>
                        </tr>
                    `;
                }).join('');
            }
        }

        // 2. Member performance stats (Win streaks & Average tries)
        cachedMemberStats = Array.isArray(data.memberStats) ? data.memberStats : [];
        renderGroupStats();

        // 3. Chat-style activity feed
        const chatFeed = document.getElementById('group-chat-feed');
        if (chatFeed) {
            if (!data.recentActivity || data.recentActivity.length === 0) {
                chatFeed.innerHTML = '<div style="color: var(--text-secondary); font-size: 0.88rem; text-align: center; padding: 20px;">No recent solves yet. Solves from your squad will appear here!</div>';
            } else {
                chatFeed.innerHTML = data.recentActivity.map(act => {
                    const trackerIcon = act.trackerUsed ? ' <span title="Card Tracker used">🔎</span>' : '';
                    return `
                        <div class="chat-msg-row">
                            <div style="flex-shrink: 0; margin-top: 2px;">
                                ${renderAvatarBadge(act.avatar, act.username)}
                            </div>
                            <div class="chat-bubble">
                                <div class="chat-bubble-header">
                                    <span class="chat-bubble-author">${escapeHtml(act.username)}</span>
                                    <span class="chat-bubble-time">${escapeHtml(act.timeFormatted)}</span>
                                </div>
                                <div class="chat-bubble-text">
                                    ${escapeHtml(act.messageText)}${trackerIcon}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    } catch (e) {
        console.error('Error fetching group leaderboard:', e);
    }
}

// Group Modals & Actions
window.openCreateGroupModal = function() {
    const ownsGroup = cachedMyGroups.some(g => g.owner === currentUser);
    if (ownsGroup) {
        showToast('⚠️ You already own 1 group! You can join unlimited groups.');
        return;
    }

    const nameInput = document.getElementById('create-group-name');
    if (nameInput) nameInput.value = '';
    const prefixInput = document.getElementById('create-group-prefix');
    if (prefixInput) prefixInput.value = '';

    const isAdmin = localStorage.getItem('loredle_role') === 'admin';
    const nonAdminBox = document.getElementById('create-group-suffix-nonadmin');
    const adminBox = document.getElementById('create-group-suffix-admin');
    const adminSuffixInput = document.getElementById('create-group-admin-suffix');
    const statusBadge = document.getElementById('create-group-code-status');

    rerollGroupSuffix();

    if (isAdmin) {
        if (nonAdminBox) nonAdminBox.style.display = 'none';
        if (adminBox) adminBox.style.display = 'flex';
        if (adminSuffixInput) adminSuffixInput.value = String(groupSuffixReroll).padStart(3, '0');
        if (statusBadge) statusBadge.textContent = '';
        debouncedCheckAvailability();
    } else {
        if (nonAdminBox) nonAdminBox.style.display = 'flex';
        if (adminBox) adminBox.style.display = 'none';
        if (statusBadge) statusBadge.textContent = '';
    }

    updateGroupCodePreview();
    openModal('create-group-modal');
};

window.rerollGroupSuffix = function() {
    groupSuffixReroll = Math.floor(100 + Math.random() * 900);
    const isAdmin = localStorage.getItem('loredle_role') === 'admin';
    const adminSuffixInput = document.getElementById('create-group-admin-suffix');
    const suffixEl = document.getElementById('create-group-suffix-preview');

    if (isAdmin && adminSuffixInput) {
        adminSuffixInput.value = String(groupSuffixReroll).padStart(3, '0');
        debouncedCheckAvailability();
    } else if (suffixEl) {
        suffixEl.textContent = groupSuffixReroll;
    }
    updateGroupCodePreview();
};

window.onGroupAdminSuffixInput = function(input) {
    input.value = input.value.replace(/[^0-9]/g, '').slice(0, 3);
    groupSuffixReroll = input.value;
    updateGroupCodePreview();
    debouncedCheckAvailability();
};

window.onGroupPrefixInput = function(input) {
    input.value = input.value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3);
    updateGroupCodePreview();
    const isAdmin = localStorage.getItem('loredle_role') === 'admin';
    if (isAdmin) debouncedCheckAvailability();
};

function updateGroupCodePreview() {
    const prefixInput = document.getElementById('create-group-prefix');
    const prefix = (prefixInput?.value || 'ROV').toUpperCase().padEnd(3, 'X');
    const isAdmin = localStorage.getItem('loredle_role') === 'admin';
    let suffix = groupSuffixReroll;
    if (isAdmin) {
        const adminSuffixInput = document.getElementById('create-group-admin-suffix');
        if (adminSuffixInput && adminSuffixInput.value) {
            suffix = adminSuffixInput.value.padEnd(3, '0');
        }
    }
    const fullCodeEl = document.getElementById('create-group-full-code');
    if (fullCodeEl) fullCodeEl.textContent = `#${prefix}-${suffix}`;
}

let checkAvailabilityTimer = null;
function debouncedCheckAvailability() {
    clearTimeout(checkAvailabilityTimer);
    checkAvailabilityTimer = setTimeout(checkGroupCodeAvailability, 250);
}

async function checkGroupCodeAvailability() {
    const isAdmin = localStorage.getItem('loredle_role') === 'admin';
    if (!isAdmin) return;

    const prefixInput = document.getElementById('create-group-prefix');
    const prefix = (prefixInput?.value || '').trim().toUpperCase();
    const adminInput = document.getElementById('create-group-admin-suffix');
    const suffix = (adminInput?.value || '').trim();
    const statusBadge = document.getElementById('create-group-code-status');
    const submitBtn = document.getElementById('btn-submit-create-group');

    if (prefix.length !== 3 || suffix.length !== 3) {
        if (statusBadge) {
            statusBadge.innerHTML = '<span style="color: var(--text-secondary); font-size: 0.8rem;">Enter 3 letters &amp; 3 numbers</span>';
        }
        return;
    }

    const fullCode = `${prefix}-${suffix}`;
    if (statusBadge) statusBadge.innerHTML = '<span style="color: var(--text-secondary); font-size: 0.8rem;">Checking...</span>';

    try {
        const token = localStorage.getItem('loredle_token');
        const res = await fetch('/api/groups/check-code', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ code: fullCode })
        });
        const data = await res.json();
        if (res.ok && data.available) {
            if (statusBadge) statusBadge.innerHTML = '<span style="color: var(--correct); font-size: 0.82rem; font-weight: 800;">✓ Available!</span>';
            if (submitBtn) submitBtn.disabled = false;
        } else {
            if (statusBadge) statusBadge.innerHTML = '<span style="color: var(--wrong); font-size: 0.82rem; font-weight: 800;">✗ Taken! Pick another</span>';
        }
    } catch (e) {
        if (statusBadge) statusBadge.innerHTML = '';
    }
}

window.submitCreateGroup = async function() {
    const name = (document.getElementById('create-group-name')?.value || '').trim();
    const prefix = (document.getElementById('create-group-prefix')?.value || '').trim().toUpperCase();
    const isAdmin = localStorage.getItem('loredle_role') === 'admin';

    let suffix = '';
    if (isAdmin) {
        const adminInput = document.getElementById('create-group-admin-suffix');
        suffix = (adminInput?.value || '').trim();
    } else {
        suffix = String(groupSuffixReroll).trim();
    }

    if (!name) {
        showToast('⚠️ Please enter a group name');
        return;
    }
    if (prefix.length !== 3) {
        showToast('⚠️ Group invite prefix must be exactly 3 letters');
        return;
    }
    if (!/^[0-9]{3}$/.test(suffix)) {
        showToast('⚠️ Group invite code suffix must be exactly 3 digits (0-9)');
        return;
    }

    try {
        const token = localStorage.getItem('loredle_token');
        const res = await fetch('/api/groups', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ name, prefix, suffix })
        });
        const data = await res.json();
        if (res.ok) {
            showToast(`🎉 Group created! Invite Code: #${data.group.code}`);
            closeModal('create-group-modal');
            await loadMyGroups();
            const groupSelect = document.getElementById('group-select');
            if (groupSelect) {
                groupSelect.value = data.group.code;
                onGroupSelectChange(data.group.code);
            }
        } else {
            showToast(`❌ ${data.error || 'Failed to create group'}`);
        }
    } catch (e) {
        console.error('Error creating group:', e);
        showToast('❌ Network error creating group');
    }
};

window.openJoinGroupModal = function() {
    document.getElementById('join-group-code').value = '';
    openModal('join-group-modal');
};

window.submitJoinGroup = async function() {
    let code = document.getElementById('join-group-code').value.trim().toUpperCase().replace('#', '');
    if (!code) {
        showToast('⚠️ Please enter an invite code');
        return;
    }

    try {
        const token = localStorage.getItem('loredle_token');
        const res = await fetch('/api/groups/join', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ code })
        });
        const data = await res.json();
        if (res.ok) {
            showToast(`🚀 Successfully joined ${data.group.name}!`);
            closeModal('join-group-modal');
            await loadMyGroups();
            const groupSelect = document.getElementById('group-select');
            if (groupSelect) {
                groupSelect.value = data.group.code;
                onGroupSelectChange(data.group.code);
            }
        } else {
            showToast(`❌ ${data.error || 'Failed to join group'}`);
        }
    } catch (e) {
        console.error('Error joining group:', e);
        showToast('❌ Network error joining group');
    }
};

window.openGroupSettingsModal = function() {
    const activeGroup = cachedMyGroups[activeGroupIndex];
    if (!activeGroup) return;

    document.getElementById('settings-group-name').value = activeGroup.name;
    document.getElementById('settings-group-static-code').textContent = '#' + activeGroup.code;
    openModal('group-settings-modal');
};

window.copyActiveGroupCode = function() {
    const activeGroup = cachedMyGroups[activeGroupIndex];
    if (!activeGroup) return;
    navigator.clipboard.writeText(activeGroup.code)
        .then(() => showToast(`📋 Copied invite code: #${activeGroup.code}`))
        .catch(() => showToast('Failed to copy.'));
};

window.copySettingsGroupCode = function() {
    const activeGroup = cachedMyGroups[activeGroupIndex];
    if (!activeGroup) return;
    navigator.clipboard.writeText(activeGroup.code)
        .then(() => showToast(`📋 Copied invite code: #${activeGroup.code}`))
        .catch(() => showToast('Failed to copy.'));
};

window.submitRenameGroup = async function() {
    const activeGroup = cachedMyGroups[activeGroupIndex];
    if (!activeGroup) return;
    const newName = document.getElementById('settings-group-name').value.trim();
    if (!newName) {
        showToast('⚠️ Group name cannot be blank');
        return;
    }

    try {
        const token = localStorage.getItem('loredle_token');
        const res = await fetch(`/api/groups/${activeGroup.code}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ name: newName })
        });
        const data = await res.json();
        if (res.ok) {
            showToast('💾 Group name updated!');
            closeModal('group-settings-modal');
            await loadMyGroups();
        } else {
            showToast(`❌ ${data.error || 'Failed to rename group'}`);
        }
    } catch (e) {
        showToast('❌ Error renaming group');
    }
};

window.submitDeleteGroup = async function() {
    const activeGroup = cachedMyGroups[activeGroupIndex];
    if (!activeGroup) return;

    if (!confirm(`Are you sure you want to delete the group "${activeGroup.name}"? This cannot be undone.`)) return;

    try {
        const token = localStorage.getItem('loredle_token');
        const res = await fetch(`/api/groups/${activeGroup.code}`, {
            method: 'DELETE',
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        const data = await res.json();
        if (res.ok) {
            showToast('🗑️ Group deleted');
            closeModal('group-settings-modal');
            activeGroupIndex = 0;
            await loadMyGroups();
        } else {
            showToast(`❌ ${data.error || 'Failed to delete group'}`);
        }
    } catch (e) {
        showToast('❌ Error deleting group');
    }
};

window.promptLeaveActiveGroup = function() {
    const activeGroup = cachedMyGroups[activeGroupIndex];
    if (!activeGroup) return;
    if (activeGroup.isOwner || activeGroup.owner === currentUser) {
        showToast('⚠️ As the owner, you cannot leave your group. You can delete it in Settings.');
        return;
    }
    const modalName = document.getElementById('leave-group-modal-name');
    if (modalName) modalName.textContent = activeGroup.name;
    const modalCode = document.getElementById('leave-group-modal-code');
    if (modalCode) modalCode.textContent = '#' + activeGroup.code;
    openModal('leave-group-modal');
};

window.confirmLeaveGroup = async function() {
    const activeGroup = cachedMyGroups[activeGroupIndex];
    if (!activeGroup) return;

    try {
        const token = localStorage.getItem('loredle_token');
        const res = await fetch('/api/groups/leave', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ code: activeGroup.code })
        });
        const data = await res.json();
        if (res.ok) {
            showToast(`🚪 You left "${activeGroup.name}".`);
            closeModal('leave-group-modal');
            activeGroupIndex = 0;
            await loadMyGroups();
        } else {
            showToast(`❌ ${data.error || 'Failed to leave group'}`);
        }
    } catch (e) {
        console.error('Error leaving group:', e);
        showToast('❌ Network error leaving group');
    }
};

// ==========================================================================
// GLOBAL ANNOUNCEMENTS
// ==========================================================================
async function checkGlobalAnnouncement() {
    try {
        const res = await fetch('/api/system/announcement');
        if (!res.ok) return;
        const data = await res.json();
        const ann = data.announcement;

        const message = (ann?.message || ann?.text || '').trim();
        if (!ann || !ann.active || !message) return;

        const annId = ann.id || 'banner-active';
        const dismissedId = localStorage.getItem('loredle_dismissed_announcement');
        if (dismissedId === annId) return;

        let container = document.getElementById('global-announcement-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'global-announcement-container';
            document.body.insertBefore(container, document.body.firstChild);
        }

        let theme = (ann.type || 'teal').toLowerCase();
        if (theme === 'info') theme = 'teal';
        else if (theme === 'event') theme = 'gold';
        else if (theme === 'alert') theme = 'pink';

        const icon = theme === 'gold' ? '🏆' : (theme === 'pink' ? '⚠️' : '💡');

        container.innerHTML = `
            <div class="global-announcement-banner theme-${escapeHtml(theme)}" id="announcement-banner-el">
                <div class="banner-content">
                    <span class="banner-icon">${icon}</span>
                    <span class="banner-text">${escapeHtml(message)}</span>
                </div>
                <button type="button" class="banner-close-btn" onclick="dismissAnnouncement('${escapeHtml(annId)}')">&times;</button>
            </div>
        `;
    } catch (e) {
        // Announcement fetch fails silently if offline
    }
}

window.dismissAnnouncement = function(id) {
    try {
        localStorage.setItem('loredle_dismissed_announcement', id);
    } catch (e) {}
    const banner = document.getElementById('announcement-banner-el');
    if (banner) banner.remove();
};
