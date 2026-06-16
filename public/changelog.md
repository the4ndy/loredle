# v2.5.0 - June 16, 2026

### ✨ Gameplay & Features
* **History Card Preview:** added the ability to preview cards in history page.
  * *Cards now show an image when you hover their name in the history page.*
* **Gameplay History:** added History page to show previous day's guesses.
  * *Game now records each guess and you can see your guesses from previous days*
  * *update changelog*

### 🛠️ Quality of Life
* **Colored Results:** Color coded the cards in the drop down while guessing.
  * *The background of the card name now indicates the color of the card*
  * *This should allow for easier/quicker/more efficient guessing*

### 🐛 Bug Fixes
* **Removed Duplicate History:** Removed the history section from the Settings page.
  * *History is now its own page, removed the old history section from settings.*
* **Hover color:** Adjusted styling on hovered guesses for better clarity.
  * *Hovered guesses now show a darker shade of their ink color and are outlined*
* **Coloring:** Adjusted coloring for better visibility


---

# v2.4.0 - June 15, 2026

### ✨ Gameplay & Features
* **Hall of Fame:** Added Loredle hall of fame page.
  * *Displays the top 5 users with the most 1st place daily finishes*
  * *Displays every daily 1st place finisher every*
* 

### 🐛 Bug Fixes
* **version-trainer footer:** Added footer (with disclaimer) to Version Trainer page.
* **Punctuation:** fixed some punctuation in various texts
  * *update changelog.md*
  * *changelog update v2.3.0*

---

# v2.3.0 - June 15, 2026

### ✨ Gameplay & Features
* **Change Log page:** added change log page
  * *View changes made to the app*
* **Disclaimer:** added disclaimer to all pages
  * *Loredle is not published, endorsed, or specifically approved by Disney or Ravensburger.*
* **Attribution:** Added Attribution
  * *Added link to creators Twitter page.*

---

# v2.2.0 - June 14, 2026

*This update addresses a critical issue with how the game board evaluates multi-color cards.*

### 🐛 Bug Fixes
* **Dual-Ink Cards:** Fixed an issue where dual-ink cards returned a null value. The game now properly supports guessing and matching dual-ink cards, displaying both colors and utilizing a yellow "Close" highlight for partial matches.

---

# v2.1.0 - June 13, 2026

*A quick patch to fix a few UI behaviors reported after the v2 launch.*

### 🐛 Bug Fixes
* **Search Dropdown Limit:** Fixed an issue where the card search dropdown was capped at 5 items; it will now display unlimited scrolling results.
* **Guess Order:** Fixed a sorting issue where new guesses were being added above previous ones instead of correctly appending below them.

---

# v2.0.0 - June 12, 2026

*Welcome to the completely rebuilt Loredle! This version marks a brand new foundation with player accounts, tracking, and new ways to play.*

### ✨ Gameplay & Features
* **Player Accounts:** Added a full Login and Registration system to save your stats and avatar preferences.
* **Daily Leaderboard:** Compete against other players! The hub now features a daily leaderboard tracking who solved the puzzle in the fewest tries.
* **Version Trainer:** A brand new mini-game mode has been added. Test your Lorcana knowledge by identifying specific card versions.
* **Discord Integration:** Added Discord webhook support to automatically post daily solve results to the Rules of Villainy Discord server.
  * Join the discord here https://discord.gg/kRpHHhDJQz

---