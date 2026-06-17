document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('feedback-form');
    const nameInput = document.getElementById('fb-name');
    const anonCheckbox = document.getElementById('fb-anonymous');
    const msgLabel = document.getElementById('fb-message');

    const currentUser = localStorage.getItem('loredle_username');

    if (currentUser) {
        nameInput.value = currentUser;
    }

    anonCheckbox.addEventListener('change', () => {
        if (anonCheckbox.checked) {
            nameInput.disabled = true;
            nameInput.value = '';
        } else {
            nameInput.disabled = false;
            nameInput.value = currentUser || '';
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const type = document.querySelector('input[name="fb-type"]:checked').value;
        const text = document.getElementById('fb-text').value;
        
        const payload = {
            name: nameInput.value,
            anonymous: anonCheckbox.checked,
            type,
            text
        };

        try {
            const res = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (res.ok) {
                msgLabel.textContent = data.message;
                msgLabel.style.display = 'block';
                msgLabel.style.color = 'var(--correct)';
                document.getElementById('fb-text').value = '';
                setTimeout(() => { msgLabel.style.display = 'none'; }, 5000);
            } else {
                msgLabel.textContent = data.error;
                msgLabel.style.display = 'block';
                msgLabel.style.color = 'var(--incorrect)';
            }
        } catch (err) {
            msgLabel.textContent = "Error submitting feedback.";
            msgLabel.style.display = 'block';
            msgLabel.style.color = 'var(--incorrect)';
        }
    });
});
