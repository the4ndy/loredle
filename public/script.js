// Global State Variables
let cards = [];
let targetCard = null;
let guessedCards = new Set();
let currentUser = localStorage.getItem('loredle_username');
let currentAvatar = localStorage.getItem('loredle_avatar') || 'default';
let userHistory = [];
let historySortDesc = true;

const availableAvatars = [
    'default',
    'https://wiki.mushureport.com/images/2/2c/Emerald-Ink.png',
    'https://wiki.mushureport.com/images/a/ad/Sapphire-Ink.png',
    'https://wiki.mushureport.com/images/3/31/Steel-Ink.png',
    'https://wiki.mushureport.com/images/4/43/Amber-Ink.png',
    'https://wiki.mushureport.com/images/d/db/Ruby-Ink.png',
    'http://wiki.mushureport.com/images/c/cc/Amethyst-Ink.png'
];

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    renderNavbar();

    if (document.getElementById('hub-container')) {
        setupHubPage();
    }

    if (document.getElementById('game-board')) {
        fetchCards();
    }

    if (document.getElementById('settings-container')) {
        if (!currentUser) window.location.href = 'index.html';
        setupAvatarGrid();
        fetchUserHistory();
    }
});

// --- DATE FORMATTER ---
function getFormattedDateCST() {
    const date = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
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

// --- GLOBAL NAVBAR LOGIC ---
function renderNavbar() {
    const authContainer = document.getElementById('nav-auth-container');
    if (!authContainer) return;

    authContainer.innerHTML = '';

    const vtLink = document.createElement('a');
    vtLink.href = 'version-trainer.html';
    vtLink.className = 'auth-link';
    vtLink.style.marginRight = '20px';
    vtLink.innerHTML = `Version Trainer <span class="badge-new">New</span>`;
    authContainer.appendChild(vtLink);

    if (currentUser) {
        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('avatar-circle');
        avatarDiv.onclick = toggleDropdown;

        if (currentAvatar === 'default') {
            avatarDiv.textContent = currentUser.charAt(0).toUpperCase();
        } else {
            avatarDiv.style.backgroundImage = `url('${currentAvatar}')`;
            avatarDiv.style.backgroundColor = 'transparent';
        }

        authContainer.appendChild(avatarDiv);
    } else {
        authContainer.innerHTML += `
            <button class="btn primary-btn" style="padding: 6px 12px; font-size: 0.8rem;" onclick="openAuthModal()">Login / Register</button>
        `;
    }
}

function toggleDropdown() {
    const dropdown = document.getElementById('nav-dropdown');
    dropdown.style.display = dropdown.style.display === 'flex' ? 'none' : 'flex';
}

function logOut() {
    localStorage.removeItem('loredle_username');
    localStorage.removeItem('loredle_avatar');
    window.location.href = 'index.html';
}

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('nav-dropdown');
    const avatar = document.querySelector('.avatar-circle');
    if (dropdown && dropdown.style.display === 'flex' && !dropdown.contains(e.target) && (!avatar || !avatar.contains(e.target))) {
        dropdown.style.display = 'none';
    }
});

// --- AUTH MODAL LOGIC ---
function openAuthModal() {
    document.getElementById('auth-modal').style.display = 'flex';
    document.getElementById('auth-message').textContent = '';
}

function closeAuthModal() {
    document.getElementById('auth-modal').style.display = 'none';
}


// --- HUB PAGE LOGIC (index.html) ---
function setupHubPage() {
    fetchGlobalLeaderboard();
    fetchArcadeLeaderboard();

    document.getElementById('play-section').style.display = 'block';
    document.getElementById('welcome-message').textContent = getFormattedDateCST();
}

async function loginUser() {
    const usernameInput = document.getElementById('auth-username').value;
    const passwordInput = document.getElementById('auth-password').value;
    const msg = document.getElementById('auth-message');

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('loredle_username', usernameInput);
            localStorage.setItem('loredle_avatar', data.avatar || 'default');
            window.location.reload();
        } else {
            msg.textContent = data.error;
        }
    } catch (err) {
        msg.textContent = "Server error.";
    }
}

async function registerUser() {
    const usernameInput = document.getElementById('auth-username').value;
    const passwordInput = document.getElementById('auth-password').value;
    const msg = document.getElementById('auth-message');

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('loredle_username', usernameInput);
            localStorage.setItem('loredle_avatar', data.avatar || 'default');
            window.location.reload();
        } else {
            msg.textContent = data.error;
        }
    } catch (err) {
        msg.textContent = "Server error.";
    }
}

async function fetchGlobalLeaderboard() {
    try {
        const res = await fetch('/api/leaderboard');
        const scores = await res.json();
        const tbody = document.getElementById('global-leaderboard-body');
        tbody.innerHTML = '';

        if (scores.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="color: var(--text-secondary);">No scores for today yet!</td></tr>';
            return;
        }

        scores.forEach((score, index) => {
            const tr = document.createElement('tr');

            let avatarHTML = '';
            if (score.avatar === 'default' || !score.avatar) {
                avatarHTML = `<div class="mini-avatar">${score.username.charAt(0).toUpperCase()}</div>`;
            } else {
                avatarHTML = `<div class="mini-avatar" style="background-image: url('${score.avatar}'); background-color: transparent;"></div>`;
            }

            tr.innerHTML = `
                <td>#${index + 1}</td>
                <td style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    ${avatarHTML} <span>${score.username}</span>
                </td>
                <td>${score.tries}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Failed to load global leaderboard.");
    }
}

async function fetchArcadeLeaderboard() {
    try {
        const res = await fetch('/api/arcade-leaderboard');
        const scores = await res.json();
        const tbody = document.getElementById('arcade-leaderboard-body');
        tbody.innerHTML = '';

        if (scores.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="color: var(--text-secondary);">No scores yet! Be the first!</td></tr>';
            return;
        }

        scores.forEach((score, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${index + 1}</td>
                <td style="letter-spacing: 2px; font-size: 1.5rem;">${score.emojis}</td>
                <td style="font-weight: bold;">${score.score}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Failed to load arcade leaderboard.");
    }
}


// --- SETTINGS PAGE LOGIC (settings.html) ---
function setupAvatarGrid() {
    const grid = document.getElementById('avatar-grid');
    grid.innerHTML = '';

    availableAvatars.forEach(url => {
        const option = document.createElement('div');
        option.classList.add('avatar-option');

        if (url === 'default') {
            option.textContent = currentUser ? currentUser.charAt(0).toUpperCase() : '?';
        } else {
            option.style.backgroundImage = `url('${url}')`;
            option.style.backgroundColor = 'transparent';
        }

        if (url === currentAvatar) option.classList.add('selected');
        option.onclick = () => saveAvatar(url);
        grid.appendChild(option);
    });
}

async function saveAvatar(url) {
    if (!currentUser) return;
    try {
        const res = await fetch('/api/user/avatar', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, avatar: url })
        });
        if (res.ok) {
            currentAvatar = url;
            localStorage.setItem('loredle_avatar', url);
            setupAvatarGrid();
            renderNavbar();
            showToast('Avatar updated!');
        }
    } catch (err) {
        showToast('Failed to update avatar.');
    }
}

async function submitPasswordChange() {
    const current = document.getElementById('current-password').value;
    const newPass = document.getElementById('new-password').value;

    if (!current || !newPass) return showToast('Please fill out both fields.');

    try {
        const res = await fetch('/api/user/change-password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
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

async function fetchUserHistory() {
    try {
        const res = await fetch(`/api/user/history/${currentUser}`);
        userHistory = await res.json();
        renderHistoryTable();
    } catch (err) {
        document.getElementById('history-table-body').innerHTML = '<tr><td colspan="2">Failed to load history.</td></tr>';
    }
}

function toggleHistorySort() {
    historySortDesc = !historySortDesc;
    document.getElementById('sort-label').textContent = historySortDesc ? 'Newest' : 'Oldest';
    userHistory.reverse();
    renderHistoryTable();
}

function renderHistoryTable() {
    const tbody = document.getElementById('history-table-body');
    tbody.innerHTML = '';

    if (userHistory.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="color: var(--text-secondary);">No games played yet.</td></tr>';
        return;
    }

    userHistory.forEach(score => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${score.date}</td><td>${score.tries}</td>`;
        tbody.appendChild(tr);
    });
}


// --- GAME PAGE LOGIC (game.html) ---

function getDailyTargetCard() {
    const options = { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' };
    const todayCST = new Intl.DateTimeFormat('en-CA', options).format(new Date());

    let hash = 0;
    for (let i = 0; i < todayCST.length; i++) {
        hash = todayCST.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % cards.length;
    return cards[index];
}

async function fetchCards() {
    try {
        const response = await fetch('https://api.lorcast.com/v0/cards/search?q=""');
        const data = await response.json();

        cards = data.results.map(card => ({
            name: card.version ? `${card.name} - ${card.version}` : card.name,
            number: parseInt(card.collector_number, 10) || 0,
            set: card.set.name,
            cost: card.cost,
            inkable: card.inkwell,
            // Extract to an array for easier partial matching
            colors: card.inks && card.inks.length > 0 ? card.inks : (card.ink ? [card.ink] : ['Colorless']),
            type: card.type ? card.type.join(' - ') : 'Unknown',
            rarity: card.rarity,
            image: card.image_uris?.digital?.normal || ''
        }));

        cards.sort((a, b) => a.name.localeCompare(b.name));

        targetCard = getDailyTargetCard();
        setupInputListener();
    } catch (error) {
        console.error('Error fetching cards:', error);
    }
}

function setupInputListener() {
    const cardInput = document.getElementById('card-input');
    const suggestions = document.getElementById('suggestions');
    if (!cardInput || !suggestions) return;

    cardInput.addEventListener('input', (e) => {
        const value = e.target.value.toLowerCase();
        suggestions.innerHTML = '';
        if (value) {
            const filteredCards = cards.filter(card =>
                card.name.toLowerCase().includes(value) && !guessedCards.has(card.name)
            );

            filteredCards.forEach(card => {
                const li = document.createElement('li');
                li.textContent = card.name;
                li.onclick = () => {
                    cardInput.value = '';
                    suggestions.innerHTML = '';
                    guessCard(card);
                };
                suggestions.appendChild(li);
            });
        }
    });

    const imageContainer = document.getElementById('image-container');
    const hoveredImage = document.getElementById('hovered-image');

    suggestions.addEventListener('mouseover', (e) => {
        if (e.target.tagName === 'LI') {
            const cardName = e.target.textContent;
            const card = cards.find(c => c.name === cardName);
            if (card && card.image) {
                hoveredImage.src = card.image;
                hoveredImage.style.display = 'block';
            }
        }
    });

    suggestions.addEventListener('mouseout', () => {
        if (!cardInput.disabled) {
            hoveredImage.style.display = 'none';
        }
    });
}

function guessCard(card) {
    guessedCards.add(card.name);
    const feedback = document.getElementById('game-board');

    const row = document.createElement('div');
    row.classList.add('row');

    row.appendChild(createCell(card.name.replace(' - ', '\n'), targetCard.name.replace(' - ', '\n')));
    row.appendChild(createNumberCell(card.number, targetCard.number));
    row.appendChild(createCell(card.set, targetCard.set));
    row.appendChild(createCell(card.cost, targetCard.cost));
    row.appendChild(createCell(String(card.inkable), String(targetCard.inkable)));

    // Using the new createColorCell function for Inks
    row.appendChild(createColorCell(card.colors, targetCard.colors));

    row.appendChild(createTypeCell(card.type, targetCard.type));
    row.appendChild(createCell(card.rarity, targetCard.rarity));

    feedback.appendChild(row);

    if (card.name === targetCard.name) {
        endGame();
    }
}

function createCell(guessValue, targetValue) {
    const cell = document.createElement('div');
    cell.classList.add('cell');
    cell.textContent = guessValue;
    if (guessValue === targetValue) {
        cell.classList.add('correct');
    } else {
        cell.classList.add('incorrect');
    }
    return cell;
}

// New specialized cell renderer for matching Ink Arrays
function createColorCell(guessColors, targetColors) {
    const cell = document.createElement('div');
    cell.classList.add('cell');

    // Output standard string for UI e.g., "Ruby / Sapphire"
    cell.textContent = guessColors.join(' / ');

    // Calculate match properties
    const matchingInks = guessColors.filter(ink => targetColors.includes(ink));
    const isExactMatch = guessColors.length === targetColors.length && matchingInks.length === guessColors.length;

    // Apply strict matching logic
    if (isExactMatch) {
        cell.classList.add('correct');
    } else if (matchingInks.length > 0) {
        cell.classList.add('close'); // Triggers Yellow
    } else {
        cell.classList.add('incorrect'); // Triggers Red
    }

    return cell;
}

function createNumberCell(guessValue, targetValue) {
    const cell = document.createElement('div');
    cell.classList.add('cell');

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

        if (hasOverlap) {
            cell.classList.add('close');
        } else {
            cell.classList.add('incorrect');
        }
    }
    return cell;
}

function youWin() {
    const img = document.getElementById('hovered-image');
    img.src = targetCard.image;
    img.style.display = 'block';
    img.style.borderColor = 'var(--correct)';
    img.style.boxShadow = '0 0 25px var(--correct)';
    img.style.borderStyle = 'solid';
    img.style.borderWidth = '4px';
}

function endGame() {
    youWin();
    const cardInput = document.getElementById('card-input');
    cardInput.disabled = true;
    cardInput.placeholder = "Game Over!";

    const emojiFeedbackContainer = document.getElementById('emoji-feedback-container');
    emojiFeedbackContainer.innerHTML = '';

    const title = document.createElement('div');
    title.classList.add('emoji-row');
    title.innerHTML = '🅻 🅾 🆁 🅴 🅳 🅻 🅴<br>';

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
                    emojiCell.textContent = '🟩';
                } else if (cell.classList.contains('close')) {
                    emojiCell.textContent = '🟨';
                } else {
                    emojiCell.textContent = '🟥';
                }
                emojiCell.textContent += ' ';
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

    fetch('/api/submit-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: currentUser || 'Anonymous User',
            tries: guessedCards.size,
            shareText: emojiText
        })
    }).catch(err => console.error('Error submitting score:', err));

    const copyButton = document.getElementById('copy-emoji-button');
    copyButton.replaceWith(copyButton.cloneNode(true));
    document.getElementById('copy-emoji-button').addEventListener('click', () => {
        navigator.clipboard.writeText(emojiText)
            .then(() => showToast('Copied to clipboard!'))
            .catch(err => showToast('Failed to copy.'));
    });

    document.getElementById('emoji-feedback').style.display = 'block';
}

function showToast(message) {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
}