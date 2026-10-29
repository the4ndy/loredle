# 🎴 Loredle

> The daily **Disney Lorcana** card-guessing game by **Rules of Villainy (RoV)**.  
> Guess the secret daily Lorcana card by matching Set, Cost, Ink, Type, Collector Number, and Rarity in as few tries as possible!

---

## 🚀 Features

* **Daily Puzzle:** A new Disney Lorcana card selected every day at midnight Central Time (CST/CDT).
* **Friend Groups & Private Squads:** Create private groups with custom 6-character invite codes (e.g., `#ROV-419`), compete on private leaderboards, track win streaks and average tries, and view a live chat-style friends solve feed.
* **Card Tracker:** An optional in-game scratchpad (toggled in Settings) that dynamically filters and highlights remaining card candidates in real time.
* **Smart Search Autocomplete:** Real-time card search with card thumbnails, ink color chips, cost indicators, and full keyboard navigation.
* **Dynamic Share Graphics:** HTML5 canvas score summary cards with compact one-click sharing to X (Twitter), Facebook, mobile native share sheets, and PNG downloads.
* **Version Trainer:** Fast-paced arcade mode to sharpen Lorcana card knowledge against the clock.
* **Multi-Server Discord Webhook Manager:** Granular multi-server webhook dispatching for daily drops, solve notifications, yesterday's recap, and daily winner shoutouts with customizable message templates.
* **Neo-Brutalist Design System:** High-contrast retro brutalist UI with heavy borders, hard drop-shadows, and customizable theme palettes.

---

## 🛠️ Tech Stack

* **Backend:** Node.js, Express.js
* **Database:** MongoDB via Mongoose
* **Frontend:** Vanilla JavaScript (ES6+), HTML5 Canvas, CSS3 Custom Properties
* **Authentication:** JWT (JSON Web Tokens) with bcrypt password hashing
* **Deployment & Analytics:** Google Analytics 4 integration

---

## 💻 Local Development Setup

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/the4ndy/loredle.git
cd loredle
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory:
```env
PORT=10000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/loredle?retryWrites=true&w=majority
JWT_SECRET=your_jwt_secret_key_here
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
GOOGLE_ANALYTICS_PROPERTY_ID=your_property_id
```

### 3. Run the Application
```bash
# Start server
npm start

# Or with Node directly:
node server.js
```
The app will be running at `http://localhost:10000`.

---

## 📦 Commit Format & Release Workflow

Loredle uses automated release scripts (`generate-changelog.js` and `finish-release.js`) that parse Git commit messages to automatically build `public/changelog.md` and bump versions in `package.json`.

### 1. Commit Message Tags
When committing changes, use **Conventional Commit** prefixes:
* **`feat:`** $\rightarrow$ Adds items to **`### ✨ Gameplay & Features`**
* **`qol:`** $\rightarrow$ Adds items to **`### 🛠️ Quality of Life`**
* **`fix:`** $\rightarrow$ Adds items to **`### 🐛 Bug Fixes`**
* **`chore:`** $\rightarrow$ Internal maintenance, dependencies, or releases (ignored by changelog generator)

#### Commit Syntax Structure
The generator splits the first line on the first colon (`:`) into a **bold title** and **summary description**. Lines directly below become indented italic bullet points:

```git
feat: Feature Name: Short summary description
First detail bullet point
Second detail bullet point
Third detail bullet point
```

#### Examples

**Feature (`feat:`):**
```git
feat: Friend Groups: Private squads with custom invite codes
Dedicated standalone Friend Groups page for private leaderboards and activity
Today's solvers ranked by fewest tries and completion time
Group stats sortable by win streaks, average tries, and total solves
Chat-style recent solves activity feed
```

**Quality of Life (`qol:`):**
```git
qol: Card Tracker: Real-time card elimination scratchpad
Toggled OFF by default in Settings
Narrows down remaining card possibilities based on clues revealed
Solves using the tracker are tagged with a 🔎 badge
```

**Bug Fix (`fix:`):**
```git
fix: Group Detection: Fixed false empty state when loading user groups
Supported both array and object response formats
Ensured active group information and stats display immediately for members
```

---

### 2. Step-by-Step Release Process

#### Step 1: Stage & Commit Your Work
Write a comprehensive commit message using the tags above:
```bash
git add .
git commit -m "feat: Friend Groups: Private squads with custom invite codes
Dedicated standalone Friend Groups page for private leaderboards and activity
Today's solvers ranked by fewest tries and completion time
Group stats sortable by win streaks, average tries, and total solves
Chat-style recent solves activity feed

feat: Card Tracker: Real-time card elimination scratchpad
Optional helper tool in Settings toggled OFF by default
Solves using tracker tagged with 🔎 badge

feat: Discord Webhooks: Multi-server webhook manager with custom templates
Master webhook circuit-breaker switch
Customizable message templates with dynamic tokens
Individual test buttons for each component

fix: Group Detection: Fixed false empty state when loading user groups
Supported both array and object response formats"
```

#### Step 2: Generate Changelog & Bump Version
Run `npm run changelog` followed by the new semantic version (e.g. `3.1.0`):
```bash
npm run changelog 3.1.0
```
**What happens automatically:**
1. Parses all `feat:`, `qol:`, and `fix:` commits since the last Git tag.
2. Formats and prepends `# v3.1.0 - <Date>` to `public/changelog.md`.
3. Bumps `"version": "3.1.0"` in `package.json`.

*(Optional: Open `public/changelog.md` to review or add any extra narrative notes).*

#### Step 3: Finish and Tag the Release
Run:
```bash
npm run release:finish
```
**What happens automatically:**
1. Stages `public/changelog.md` and `package.json`.
2. Creates the release commit: `chore: release v3.1.0`.
3. Creates the Git tag: `git tag v3.1.0`.

#### Step 4: Push to Remote
Push both your commits and tags to GitHub:
```bash
git push --follow-tags
```

---

## ⚖️ Disclaimer & License

Loredle uses trademarks and/or copyrights associated with **Disney Lorcana TCG**, used under Ravensburger's Community Code Policy. We are expressly prohibited from charging you to use or access this content. Loredle is not published, endorsed, or specifically approved by Disney or Ravensburger. For more information about Disney Lorcana TCG, visit [disneylorcana.com](https://www.disneylorcana.com/en-US).

Created with 💜 by **[ROV] Andy** ([@Villain_Andy](https://twitter.com/Villain_Andy)).
