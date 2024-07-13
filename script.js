let cards = [];
const cardInput = document.getElementById('card-input');
const suggestions = document.getElementById('suggestions');
const feedback = document.getElementById('feedback');
const winMessage = document.getElementById('win-message');
const imageContainer = document.getElementById('image-container');
const hoveredImage = document.getElementById('hovered-image');
document.getElementById("toast").addEventListener("click", hideToast);
const guessedCards = new Set();
let targetCard = null;

// Show and hide help popover
document.getElementById('help-button').addEventListener('click', () => togglePopover('popover', true));
document.addEventListener('click', (event) => togglePopover('popover', false, event));

// Show and hide disclaimer popover
document.getElementById('disclaimer').addEventListener('click', () => togglePopover('disclaimover', true));
document.addEventListener('click', (event) => togglePopover('disclaimover', false, event));

function togglePopover(id, show, event = null) {
    const popover = document.getElementById(id);
    const button = document.getElementById(id === 'popover' ? 'help-button' : 'disclaimer');
    if (show || (event && !popover.contains(event.target) && !button.contains(event.target))) {
        popover.style.display = show ? 'block' : 'none';
    }
}

// Fetch cards data
async function fetchCards() {
    const loadingImage = document.getElementById('loading-image');
    const cardInput = document.getElementById('card-input');
    try {
        cardInput.disabled = true;
        loadingImage.style.display = 'inline-block';
        const response = await fetch('https://api.lorcana-api.com/bulk/cards');
        const data = await response.json();
        cards = data.map(card => ({
            name: card.Name,
            number: card.Card_Num,
            set: card.Set_Name,
            cost: card.Cost,
            inkable: card.Inkable,
            color: card.Color,
            type: card.Type,
            rarity: card.Rarity,
            image: card.Image
        }));
        targetCard = getDailyTargetCard();
    } catch (error) {
        console.error('Error fetching cards:', error);
    } finally {
        loadingImage.style.display = 'none';
        cardInput.disabled = false;
    }
}

// Calculate the daily target card
function getDailyTargetCard() {
    const today = new Date();
    const dateString = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate() - 1}`;
    const salt = "CobraBubblesEnchanted";
    const hash = hashString(dateString + salt);
    const index = Math.abs(hash) % cards.length;
    return cards[index];
}

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return hash;
}

const colorMap = {
    amber: '#f3b500',
    amethyst: '#813679',
    emerald: '#278a30',
    ruby: '#d30931',
    sapphire: '#028ac6',
    steel: '#9facb5'
};

const rarityImages = {
    common: 'img/common.png',
    uncommon: 'img/uncommon.png',
    rare: 'img/rare.png',
    super_rare: 'img/super_rare.png',
    legendary: 'img/legendary.png'
};

// Debounce function to limit the rate of function execution
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

cardInput.addEventListener('input', debounce(() => {
    const query = cardInput.value.toLowerCase();
    suggestions.innerHTML = '';
    if (query) {
        const matches = cards.filter(card => card.name.toLowerCase().includes(query) && !guessedCards.has(card.name));
        matches.forEach(card => {
            const li = document.createElement('li');
            li.textContent = card.name;
            li.style.backgroundColor = colorMap[card.color.toLowerCase()] || 'transparent';
            li.addEventListener('click', () => guessCard(card));
            li.addEventListener('mouseover', () => showImage(card.image));
            li.addEventListener('mouseout', hideImage);
            suggestions.appendChild(li);
        });
    }
}, 300));

function guessCard(card) {
    if (guessedCards.has(card.name)) return;
    guessedCards.add(card.name);
    suggestions.innerHTML = '';
    cardInput.value = '';
    const row = document.createElement('div');
    row.classList.add('row');
    row.appendChild(createCell(card.name));
    row.appendChild(createNumberCell(card.number, targetCard.number));
    row.appendChild(createCell(card.set, targetCard.set));
    row.appendChild(createCell(card.cost, targetCard.cost));
    row.appendChild(createCell(card.inkable, targetCard.inkable));
    row.appendChild(createCell(card.color, targetCard.color));
    row.appendChild(createTypeCell(card.type, targetCard.type));
    row.appendChild(createCell(card.rarity, targetCard.rarity));
    feedback.appendChild(row);
    if (card.name === targetCard.name) endGame();
}

function createNumberCell(value, targetValue) {
    const cell = document.createElement('div');
    cell.classList.add('cell', 'number-cell');
    cell.textContent = value;
    cell.style.backgroundColor = value === targetValue ? '#4caf50' : '#f44336';
    if (value !== targetValue) {
        cell.textContent += value > targetValue ? ' 🔽' : ' 🔼';
    }
    return cell;
}

function createCell(value, targetValue = null) {
    const cell = document.createElement('div');
    cell.classList.add('cell');
    cell.textContent = value;
    if (targetValue !== null) {
        cell.classList.add(value === targetValue ? 'correct' : 'incorrect');
    }
    return cell;
}

function createTypeCell(guessedType, targetType) {
    const cell = document.createElement('div');
    cell.classList.add('cell');
    cell.textContent = guessedType;
    if (guessedType === targetType) {
        cell.classList.add('correct');
    } else if ((guessedType === "Action - Song" && targetType === "Action") || 
               (guessedType === "Action" && targetType === "Action - Song") ||
               (guessedType === "Action - Song" && targetType === "Song") || 
               (guessedType === "Song" && targetType === "Action - Song")) {
        cell.classList.add('close');
    } else {
        cell.classList.add('incorrect');
    }
    return cell;
}

function endGame() {
    winMessage.textContent = "YOU WIN!";
    cardInput.disabled = true;
    cardInput.placeholder = "Game Over!";
    const emojiFeedbackContainer = document.getElementById('emoji-feedback-container');
    emojiFeedbackContainer.innerHTML = '';
    const title = document.createElement('div');
    title.classList.add('emoji-row');
    title.innerHTML = '🅻 🅾 🆁 🅴 🅳 🅻 🅴<br>';
    const today = new Date();
    const dateString = today.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    const date = document.createElement('div');
    date.classList.add('emoji-row');
    date.textContent = dateString;
    title.appendChild(date);
    emojiFeedbackContainer.appendChild(title);
    feedback.childNodes.forEach((row, index) => {
        const emojiRow = document.createElement('div');
        emojiRow.classList.add('emoji-row');
        const emojiNumbers = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        const guessNumberCell = document.createElement('span');
        guessNumberCell.textContent = index < 10 ? emojiNumbers[index] + ' ' : (index + 1) + ' ';
        emojiRow.appendChild(guessNumberCell);
        row.childNodes.forEach((cell, cellIndex) => {
            if (cellIndex > 0) {
                const emojiCell = document.createElement('span');
                emojiCell.textContent = cell.classList.contains('correct') ? '🟩' : cell.classList.contains('close') ? '🟥' : '🟥';
                emojiCell.textContent += ' ';
                emojiRow.appendChild(emojiCell);
            }
        });
        emojiFeedbackContainer.appendChild(emojiRow);
    });
    const url = document.createElement('div');
    url.classList.add('emoji-row');
    url.textContent = 'loredle.ink';
    emojiFeedbackContainer.appendChild(url);
    const copyButton = document.getElementById('copy-emoji-button');
    copyButton.addEventListener('click', () => {
        let emojiText = '🅻🅾🆁🅴🅳🅻🅴\n' + dateString + '\n';
        emojiFeedbackContainer.childNodes.forEach((row, rowIndex) => {
            if (rowIndex > 0) {
                emojiText += row.innerText.trim().replace(/\s+/g, ' ') + '\n';
            }
        });
        navigator.clipboard.writeText(emojiText)
            .then(() => showToast('Copied to clipboard!'))
            .catch(err => showToast('Failed to copy to clipboard.'));
    });
    document.getElementById('emoji-feedback').style.display = 'block';
}

function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.className = "toast show";
    setTimeout(() => {
        hideToast();
    }, 3000);
}

function hideToast() {
    const toast = document.getElementById("toast");
    toast.className = "toast hide";
}

function showImage(imageUrl) {
    hoveredImage.src = imageUrl;
    hoveredImage.style.display = 'block';
}

function hideImage() {
    hoveredImage.style.display = 'none';
}

fetchCards();
