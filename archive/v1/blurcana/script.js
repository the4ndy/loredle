
    const API_URL = 'https://api.lorcana-api.com/bulk/cards'; // Replace with the actual API URL
    const guessInput = document.getElementById('guess-input');
    const autocompleteList = document.getElementById('autocomplete-list');
    const guessedCardsList = document.getElementById('guessed-cards');
    const blurredCardImg = document.getElementById('blurred-card');
    const gameOverDiv = document.getElementById('game-over');

    let cards = [];
    let currentCard = null;
    let blurAmount = 30;

    async function fetchCards() {
        try {
            const response = await fetch(API_URL);
            cards = await response.json();
            console.log(cards);
            currentCard = cards[Math.floor(Math.random() * cards.length)];
            console.log(currentCard);
            blurredCardImg.src = currentCard.Image; // Assume each card has an 'image' property
        } catch (error) {
            console.error('Error fetching cards:', error);
        }
    }

    function createAutocompleteItem(card) {
        const div = document.createElement('div');
        div.textContent = card.Name;
        div.addEventListener('click', () => handleGuess(card));
        return div;
    }

    function handleInput(event) {
        const value = event.target.value.toLowerCase();
        autocompleteList.innerHTML = '';
        if (!value) return;

        const filteredCards = cards.filter(card => card.Name.toLowerCase().includes(value));
        filteredCards.forEach(card => autocompleteList.appendChild(createAutocompleteItem(card)));
    }

    function handleGuess(card) {
        const listItem = document.createElement('li');
        listItem.textContent = card.Name;

        if (card.Name === currentCard.Name) {
            listItem.classList.add('correct');
            listItem.innerHTML += ' ✅';
            blurAmount = 0;
            gameOver(true);
        } else {
            listItem.classList.add('incorrect');
            listItem.innerHTML += ' ❌';
            blurAmount = Math.max(blurAmount - 3, 0);
            blurredCardImg.style.filter = `blur(${blurAmount}px)`;

            if (blurAmount === 0) {
                gameOver(false);
            }
        }

        guessedCardsList.appendChild(listItem);
        guessInput.value = '';
        autocompleteList.innerHTML = '';
        cards = cards.filter(c => c !== card);
    }

    function gameOver(won) {
        guessInput.disabled = true;
        autocompleteList.innerHTML = '';
        if (won) {
            gameOverDiv.textContent = 'Congratulations! You guessed the card!';
        } else {
            gameOverDiv.textContent = `Game Over! The card was ${currentCard.Name}.`;
        }
        blurredCardImg.style.filter = 'blur(0px)';
    }

    guessInput.addEventListener('input', handleInput);
    fetchCards();
