const fonts = [
    { name: 'Roboto', url: 'Roboto:wght@400;500;700' },
    { name: 'Open Sans', url: 'Open+Sans:wght@400;600;700' },
    { name: 'Lato', url: 'Lato:wght@400;700' },
    { name: 'Montserrat', url: 'Montserrat:wght@400;600;700' },
    { name: 'Inter', url: 'Inter:wght@400;500;600;700' },
    { name: 'Poppins', url: 'Poppins:wght@400;500;600;700' },
    { name: 'Nunito', url: 'Nunito:wght@400;600;700' },
    { name: 'Raleway', url: 'Raleway:wght@400;600;700' },
    { name: 'Ubuntu', url: 'Ubuntu:wght@400;500;700' },
    { name: 'Merriweather', url: 'Merriweather:wght@400;700' },
    { name: 'Playfair Display', url: 'Playfair+Display:wght@400;700' },
    { name: 'Oswald', url: 'Oswald:wght@400;500;700' },
    { name: 'Source Sans 3', url: 'Source+Sans+3:wght@400;600;700' },
    { name: 'Fira Sans', url: 'Fira+Sans:wght@400;500;700' },
    { name: 'Quicksand', url: 'Quicksand:wght@400;500;600;700' },
    { name: 'PT Sans', url: 'PT+Sans:wght@400;700' },
    { name: 'Noto Sans', url: 'Noto+Sans:wght@400;600;700' },
    { name: 'Rubik', url: 'Rubik:wght@400;500;700' },
    { name: 'Work Sans', url: 'Work+Sans:wght@400;500;600;700' },
    { name: 'Comic Neue', url: 'Comic+Neue:wght@400;700' }
];

document.addEventListener('DOMContentLoaded', () => {
    const fontSelect = document.getElementById('font-select');
    const styleSelect = document.getElementById('style-select');
    const themeSelect = document.getElementById('theme-select');
    const stylesheet = document.getElementById('font-stylesheet');

    // Populate Fonts
    fonts.forEach((font, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = font.name;
        fontSelect.appendChild(option);
    });

    // Default selection
    fontSelect.value = 4; // Inter
    
    function applyFont() {
        const selectedFont = fonts[fontSelect.value];
        stylesheet.href = `https://fonts.googleapis.com/css2?family=${selectedFont.url}&display=swap`;
        document.documentElement.style.fontFamily = `'${selectedFont.name}', sans-serif`;
    }

    function applyStyleAndTheme() {
        document.documentElement.className = `${styleSelect.value} ${themeSelect.value}`;
    }

    fontSelect.addEventListener('change', applyFont);
    styleSelect.addEventListener('change', applyStyleAndTheme);
    themeSelect.addEventListener('change', applyStyleAndTheme);

    // Initial Apply
    applyFont();
    applyStyleAndTheme();
});
