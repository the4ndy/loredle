# v3.1.0 - October 28, 2026

### ✨ Gameplay & Features
* **Added friend groups**
  * *Each registered user can create/manage 1 group*
  * *Registered users can join as many groups as they wish*
  * *Group specific stats are available in the Groups page*

### 🛠️ Quality of Life
* **Card Tracker (Loredle Solving Tool)**
  * *When enabled in settings, you get an auto filtered list of available cards*
  * *Games played with this mode enabled will get the card tracker icon in the leaderboard*
  * *This feature is disabled by default*
  * *chore: update gitignore*

---

# v3.1.0 - October 28, 2026

### ✨ Gameplay & Features
* **Friend Groups & Private Leaderboards:**
  * *Dedicated standalone Friend Groups page (`groups.html`) for private squad leaderboards, member solve performance stats, and a live recent group activity feed.*
  * *Loop-around navigation (`◀` / `▶`) and group dropdown selector.*
  * *Players can create 1 group with a custom 3-letter prefix and 3-digit invite code (e.g. `#ROV-419`) with unlimited rerolls. Admins can enter custom 3-digit numbers with real-time code availability checks.*
  * *Group navigation and actions are strictly hidden when unauthenticated.*
* **Card Tracker (Elimination Scratchpad):**
  * *Optional helper tool in Settings (toggled OFF by default) that narrows down remaining card possibilities in real-time based on clues revealed.*
  * *Solves using the Card Tracker are marked with a 🔎 badge on leaderboards, Hall of Fame, and user history.*
  * *Rendered with card artwork, inkable/non-inkable indicator chips, and Lorcana ink color dots.*
* **Dynamic Canvas Share Graphic & Social Row:**
  * *Generates high-contrast Neo-Brutalist score summary cards on HTML5 canvas.*
  * *Compact icon buttons for one-click sharing to X (Twitter), Facebook, native mobile share sheets, direct clipboard copying, and PNG download.*

### 🛠️ Admin & Operations
* **Multi-Server Discord Webhook Manager:**
  * *Admins can register and manage multiple Discord servers/channels from the Command Center.*
  * *Master Webhook Active circuit-breaker switch to gate dispatches without losing individual sub-component configuration.*
  * *Customizable message templates with dynamic tokens (`{username}`, `{tries}`, `{winner}`, `{yesterdayCard}`, `{url}`, etc.) for solve completion alerts, midnight daily drops, yesterday's recap, and winner shoutouts.*
  * *Individual test buttons for each component to test specific message dispatches on demand.*
* **Global Announcements & Maintenance Switch:**
  * *Publish sticky Neo-Brutalist announcement banners across player pages with dismiss persistence.*
  * *Emergency maintenance toggle to lock gameplay during database maintenance.*

---

# v3.0.0 - October 24, 2026

### ✨ Gameplay & Features
* **New Design:**
  * *Complete design overhaul.*
* **Smart Search & Keyboard Navigation:**
  * *Upgraded autocomplete with card thumbnails, Ink color & Cost badges, tokenized multi-word matching, and full keyboard arrow/enter navigation*
* **Persistent Daily Progress:**
  * *In-progress daily guesses now save automatically across page refreshes and devices*


### 🐛 Bug Fixes
* **My History Guess Breakdown:** Fixed bug where past games in My History did not display the target card or detailed attribute breakdown
* **Leaderboard & Hall of Fame Speed:** Replaced N+1 database queries with single-stage MongoDB aggregation pipelines for instant page loads

---

# v2.9.0 - June 25, 2026

### ✨ Gameplay & Features
* **Updated Admin:** Added new metrics to admin portal
  * *Now integrates with Google analytics*
* **Google Analytics:** Now tracking site data with Google analytics
  * *This will help ensure server resources are optimized for expected sessions*

---

# v2.8.0 - June 17, 2026

### ✨ Gameplay & Features
* **Feedback:** We want to hear from you for Feedback, Bug Fixes, and Feature Requests
  * *Feedback can now be submitted with attribution or anonymously*
  * *Feedback can be in the form of general feedback, bug report, or feature request*
  * *Communication sent via feedback form only viewable by the game developers*

### 🐛 Bug Fixes
* **Release scripts:** Fixed bug in release script causing additional commits.
  * *chore: commit changelog narrative*

---

# v2.7.0 - June 17, 2026

### ✨ Gameplay & Features
* **Admin Portal:** Added admin portal to manage backend
  * *Not accessible to users but useful for managing the app*

### 🐛 Bug Fixes
* **Answer Card Generation:** Fixed bug in random answer card Generation
  * *Previous Daily Answer Card were generated in a predictable method. This has been resolved.*
* **Backend Reorganization:** Reformatted database tables to allow for better analytics and features going forward
  * *chore: changelog update*

---

# v2.6.0 - June 16, 2026

### ✨ Gameplay & Features
* **Its All About Style:** updated style to conform to Material Design 3
  * *Changed font to Oswald*
* **Themes:** Added color themes for the website
  * *Now you can choose your favorite theme on the settings page*

---

# v2.5.1 - June 16, 2026

### 🐛 Bug Fixes
* **Changelog Scripts:** Fixed changelog Scripts
  * *Fixed backend scripts for changelog management.*
  * *Cleaned up duplicate change log entries*
  * *updated change log*

---

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