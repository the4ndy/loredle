let cards = [];
const cardInput = document.getElementById('card-input');
const suggestions = document.getElementById('suggestions');
const feedback = document.getElementById('feedback');
const winMessage = document.getElementById('win-message');
const hoveredImage = document.getElementById('hovered-image');
const guessedCards = new Set();
let targetCard = null;

async function fetchCards() {
    try {
        const response = await fetch('https://api.lorcana-api.com/cards/all'); // Replace with the actual API endpoint
        const data = await response.json();
        cards = data.map(card => ({
            name: card.Name,
            set: card.Set_Name,
            cost: card.Cost,
            inkable: card.Inkable,
            color: card.Color,
            type: card.Type,
            rarity: card.Rarity,
            image: card.Image
        }));
        targetCard = cards[Math.floor(Math.random() * cards.length)];
    } catch (error) {
        console.error('Error fetching cards:', error);
    }
}

cardInput.addEventListener('input', () => {
    const query = cardInput.value.toLowerCase();
    suggestions.innerHTML = '';
    if (query) {
        const matches = cards.filter(card => card.name.toLowerCase().includes(query) && !guessedCards.has(card.name));
        matches.forEach(card => {
            const li = document.createElement('li');
            li.textContent = card.name;
            li.addEventListener('click', () => guessCard(card));
            li.addEventListener('mouseover', () => showImage(card.image));
            li.addEventListener('mouseout', () => hideImage());
            suggestions.appendChild(li);
        });
    }
});

function guessCard(card) {
    if (guessedCards.has(card.name)) {
        return;
    }
    guessedCards.add(card.name);

    suggestions.innerHTML = '';
    cardInput.value = '';

    const row = document.createElement('div');
    row.classList.add('row');

    row.appendChild(createCell(card.name));
    row.appendChild(createCell(card.set, targetCard.set));
    row.appendChild(createCell(card.cost, targetCard.cost));
    row.appendChild(createCell(card.inkable, targetCard.inkable));
    row.appendChild(createCell(card.color, targetCard.color));
    row.appendChild(createTypeCell(card.type, targetCard.type));
    row.appendChild(createCell(card.rarity, targetCard.rarity));

    feedback.appendChild(row);

    if (card.name === targetCard.name) {
        endGame();
    }
}

function createCell(value, targetValue = null) {
    const cell = document.createElement('div');
    cell.classList.add('cell');
    if (targetValue !== null) {
        cell.textContent = value;
        cell.classList.add(value === targetValue ? 'correct' : 'incorrect');
    } else {
        cell.textContent = value;
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
        cell.textContent = guessedType;
    } else {
        cell.classList.add('incorrect');
    }

    return cell;
}


function endGame() {
    winMessage.textContent = "YOU WIN!";
    cardInput.disabled = true;
    cardInput.placeholder = "Game Over!";
}

function showImage(imageUrl) {
    hoveredImage.src = imageUrl;
    hoveredImage.style.display = 'block';
}

function hideImage() {
    hoveredImage.style.display = 'none';
}

fetchCards();
