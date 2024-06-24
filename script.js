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
        cell.style.backgroundColor = '#8bc34a'; // Green for correct guess
    } else {
        cell.style.backgroundColor = '#f44336'; // Red for incorrect guess

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
    
    const emojiFeedbackContainer = document.getElementById('emoji-feedback-container');
    emojiFeedbackContainer.innerHTML = ''; // Clear previous feedback

    // Add LOREDLE with emoji and today's date
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
        
        // Emoji numbers: 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟
        const emojiNumbers = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        const guessNumberCell = document.createElement('span');
        guessNumberCell.textContent = emojiNumbers[index] + ' ';
        emojiRow.appendChild(guessNumberCell);
        
        // Skip the first cell (Name column) in each row
        row.childNodes.forEach((cell, cellIndex) => {
            if (cellIndex > 0) { // Skip the first cell (Name)
                const emojiCell = document.createElement('span');
                if (cell.classList.contains('correct')) {
                    emojiCell.textContent = '🟩'; // Green square for correct guess
                } else if (cell.classList.contains('close')) {
                    emojiCell.textContent = '🟨'; // Yellow square for close guess
                } else {
                    emojiCell.textContent = '🟥'; // Red square for incorrect guess
                }
                emojiCell.textContent += ' '; // Add space after each emoji
                emojiRow.appendChild(emojiCell);
            }
        });
        
        emojiFeedbackContainer.appendChild(emojiRow);
    });

    const copyButton = document.getElementById('copy-emoji-button');
    copyButton.addEventListener('click', () => {
        let emojiText = '🅻🅾🆁🅴🅳🅻🅴\n' + dateString + '\n';
        emojiFeedbackContainer.childNodes.forEach((row, rowIndex) => {
            if (rowIndex > 0) { // Skip the first row, which contains the title and date
                emojiText += row.innerText.trim().replace(/\s+/g, ' ') + '\n'; // Get text content including emojis, adding spaces
            }
        });
        navigator.clipboard.writeText(emojiText) // Copy to clipboard
            .then(() => showToast('Copied to clipboard!'))
            .catch(err => showToast('Failed to copy to clipboard.'));
    });

    document.getElementById('emoji-feedback').style.display = 'block'; // Show emoji feedback section
}

// Function to get emoji number
function getEmojiNumber(number) {
    const emojiNumbers = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    return emojiNumbers[number - 1]; // Adjust index for zero-based array
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
