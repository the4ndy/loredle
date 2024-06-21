let cards = [];
const cardInput = document.getElementById('card-input');
const suggestions = document.getElementById('suggestions');
const feedback = document.getElementById('feedback');
const winMessage = document.getElementById('win-message');
const imageContainer = document.getElementById('image-container');
const hoveredImage = document.getElementById('hovered-image');
const guessedCards = new Set();
let targetCard = null;

async function fetchCards() {
    const loadingImage = document.getElementById('loading-image');
    const cardInput = document.getElementById('card-input');

    try {
        cardInput.disabled = true; // Disable input field during API call
        loadingImage.style.display = 'inline-block'; // Show loading image

        const response = await fetch('https://api.lorcana-api.com/cards/all'); // Replace with your API endpoint
        const data = await response.json();
        cards = data.map(card => ({
            name: card.Name,
            number: card.Card_Num, // Assuming "Number" attribute is available in API response
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
        loadingImage.style.display = 'none'; // Hide loading image after API call
        cardInput.disabled = false; // Enable input field after API call
    }
}
function getDailyTargetCard() {
    const today = new Date();
    const dateString = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()-1}`;
    const salt = "CobraBubblesEnchanted"; // A constant salt for complexity
    const hash = hashString(dateString + salt);
    const index = (Math.abs(hash) % cards.length); // Ensures index is non-negative
    return cards[index];
}

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // Convert to 32-bit integer
    }
    return hash;
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
    row.appendChild(createNumberCell(card.number, targetCard.number));
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

function createNumberCell(value, targetValue) {
    const cell = document.createElement('div');
    cell.classList.add('cell', 'number-cell');
    cell.textContent = value;

    if (value === targetValue) {
        cell.classList.add('correct');
    } else {
        const maxDifference = 204; // Maximum difference in numbers
        const difference = Math.abs(value - targetValue);
        const percentage = difference / maxDifference;

        // Set background color based on the percentage
        if (percentage > 0.75) {
            cell.style.backgroundColor = '#f44336'; // Red
        } else if (percentage > 0.25) {
            cell.style.backgroundColor = '#fbc02d'; // Yellow
        } else {
            cell.style.backgroundColor = '#8bc34a'; // Green, not quite the same green as correct
        }

        // Add arrow emoji
        if (value > targetValue) {
            cell.textContent += ' 🔽';
        } else {
            cell.textContent += ' 🔼';
        }
    }
    return cell;
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
