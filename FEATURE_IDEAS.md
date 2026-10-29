# 💡 Loredle — Backlog of Future Feature Ideas

This document serves as the permanent backlog of approved feature concepts that have been detailed and tabled for future development cycles. 
Each feature is divided into two distinct sections:
1. **Human-Readable Overview**: The concept, user story, and player motivation in plain terms.
2. **Technical Implementation Blueprint**: Exact schemas, endpoints, algorithmic logic, and UI design specifications needed for an AI or human developer to implement the feature cleanly without ambiguity.

---

## 1. Practice & Archive Mode ("Time Machine")

### A. Human-Readable Overview
* **The Concept**: Currently, Loredle can only be played once per day. If a player solves the puzzle in 2 minutes, they have to wait up to 24 hours to play again. Furthermore, players who miss days cannot catch up or see what past cards were.
* **The Experience**:
  * **Archive Mode**: A retro calendar grid allows players to browse past dates. Days they already won show their green score badge (`3/6 🟩`). Unplayed past days allow the player to load and solve that exact historical puzzle.
  * **Infinite Practice Sandbox**: Generates an endless stream of random target cards from the active Disney Lorcana catalog so players can test their knowledge or warmup anytime.
  * **Strict Integrity Guard**: Practice and archive solves are completely isolated. They never count toward today's official Daily Leaderboard or the Hall of Fame.

### B. Technical Implementation Blueprint
* **Frontend Architecture**:
  * New page `public/archive.html` or view mode in `game.html?mode=archive&date=YYYY-MM-DD` and `game.html?mode=practice&seed=XYZ`.
  * Calendar component rendered using CSS Grid. Days pull status from `localStorage` (`loredle_history`) and user score history.
* **Backend Architecture**:
  * `GET /api/archive/dates`: Queries `AnswerLog` where `date < todayCST`. Returns array of available past dates and whether user completed them.
  * `GET /api/archive/card/:date`: Validates `date < todayCST`. Returns obfuscated XOR token `encodeTargetToken(canonicalCard.name, date)`.
  * `GET /api/practice/random`: Selects random card from in-memory `cachedCards` excluding cards used in the last 30 days. Returns obfuscated token with session salt.
  * `POST /api/practice/submit`: Optional endpoint if saving practice history to account, or can stay client-side in `localStorage`.
* **Database Impact**:
  * Read-only against `AnswerLog`.
  * Optional Mongoose model `PracticeLog`:
    ```javascript
    const practiceLogSchema = new mongoose.Schema({
        username: { type: String, required: true, index: true },
        mode: { type: String, enum: ['archive', 'practice'], required: true },
        date: { type: String }, // For archive mode
        targetCard: { type: String, required: true },
        tries: { type: Number, required: true },
        createdAt: { type: Date, default: Date.now }
    });
    ```

---

## 2. Progressive Emergency Clue System

### A. Human-Readable Overview
* **The Concept**: Occasionally, the daily card is an obscure uncommon, item, or location from an older set that stymies casual players. After 4 or 5 incorrect guesses, frustration peaks and players may abandon the game.
* **The Experience**:
  * After Guess 4, a subtle "Need a Clue?" button unlocks under the input.
  * **Tier 1 (Guess 4)**: Reveals the card's Set Name (e.g. *The First Chapter*) or Rarity.
  * **Tier 2 (Guess 5)**: Reveals the card's official Flavor Text, with the character name automatically blanked out as `_____`.
  * **Leaderboard Fairness**: Solving with clues is tracked (`Solved in 5 💡`). Pure solves without hints take precedence on competitive rankings.

### B. Technical Implementation Blueprint
* **Backend Architecture**:
  * Update `scoreSchema` in `server.js`:
    ```javascript
    hintsUsed: { type: Number, default: 0, min: 0, max: 2 }
    ```
  * Endpoint `GET /api/daily-hint?guessCount=4`:
    * Verifies `guessCount >= 4` against active `DailyProgress`.
    * Retrieves target card from `cardEngine.js`.
    * If `tier === 1`: returns `{ type: 'SET_RARITY', set: card.set, rarity: card.rarity }`.
    * If `tier === 2`: returns `{ type: 'FLAVOR_TEXT', text: redactName(card.flavorText, card.name) }`.
* **Frontend Architecture**:
  * In `script.js`: Render hint button when `guesses.length >= 4`.
  * Callout box styled in Neo-Brutalism yellow (`#ffd166`) with `3px solid #000` border and `4px 4px 0px #000` shadow.

---

## 3. High-Res Card Art Zoom & Full-Text Lore Inspector

### A. Human-Readable Overview
* **The Concept**: Many players love Disney Lorcana for the gorgeous full-bleed character illustrations, lore text, and collector details. On small mobile screens, thumbnails in the guess table are small and abilities cannot be read.
* **The Experience**:
  * Tapping any card thumbnail in the guess grid, search results, or game-over modal opens a clean fullscreen Neo-Brutalist inspection card.
  * Players can pinch-to-zoom into the high-res card art, view full card text (Strength, Willpower, Lore pips, ink cost), illustrator name, and rarity icon.

### B. Technical Implementation Blueprint
* **Frontend Architecture**:
  * Pure client-side modal `#card-inspector-modal` in `public/game.html`.
  * Touch gesture handler supporting pinch-to-zoom (`touchmove` distance calculation) and double-tap zoom via CSS `transform: scale(zoomLevel) translate(x, y)`.
  * Data source: `window.cachedCards` lookup by card name.
* **Database Impact**:
  * **Zero**. All card data (images, text, illustrator, stats) is already delivered in `/api/cards` cache.

---

## 4. Neo-Brutalist Tactile SFX & Haptics Suite

### A. Human-Readable Overview
* **The Concept**: Physical, tactile feedback elevates word and guessing games (like the physical click of a typewriter or word tile flip).
* **The Experience**:
  * Subtle, mechanical tactile sound effects:
    * Mechanical clack when typing or selecting a card.
    * Rapid sequential flip sound (like a retro airport split-flap display) as attribute tiles reveal green/yellow/red.
    * Snappy chime on victory.
    * Gentle phone vibration on mobile devices via the Vibration API when tiles flip green.
  * **Mute Setting**: Fully toggleable in Settings and via a simple header speaker icon (`🔊 / 🔇`), defaulting to mute or user preference.

### B. Technical Implementation Blueprint
* **Frontend Architecture**:
  * Synthetic audio generation via the browser's native **Web Audio API** (zero external MP3 downloads required; purely algorithmic oscillator beeps, thuds, and chimes).
  * Example Web Audio implementation:
    ```javascript
    function playTileFlipSound(toneFreq, delayMs) {
        if (!soundEnabled) return;
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(toneFreq, ctx.currentTime + delayMs);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delayMs + 0.08);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + delayMs);
        osc.stop(ctx.currentTime + delayMs + 0.08);
    }
    ```
  * Mobile haptics: `if (navigator.vibrate && hapticsEnabled) navigator.vibrate(25);`.
* **Database Impact**:
  * **Zero**. Preferences stored in `localStorage` under `loredle_sfx_muted`.

---

## 5. Streamer "Caster Mode" & OBS HUD Widget

### A. Human-Readable Overview
* **The Concept**: Streamers on Twitch, YouTube, and Kick play Loredle live on stream. They often face two issues: (1) chat can see what they type before they submit, spoiling their thought process, and (2) standard web layouts aren't scaled for 1080p stream overlays.
* **The Experience**:
  * Caster Mode (`?caster=1` or toggle) enlarges the guess grid for crystal-clear readability on stream.
  * An optional "Streamer Shield" delays the autocomplete text dropdown until a shortcut is pressed, or blurs search text so viewers cannot see what the streamer is typing until they lock in the guess.
  * Live Chat Suggestion Bar: Shows the top card names currently being mentioned in stream chat.

### B. Technical Implementation Blueprint
* **Frontend Architecture**:
  * CSS selector `body.caster-mode` in `styles.css`.
  * Scaled CSS zoom for OBS 1920x1080 capture (`font-size: 18px`, tiles max-width `750px`).
  * Connects with the existing `DTT_theme.html` message receiver to scan incoming stream chat messages for known Lorcana card names and increment a live suggestion poll counter.
* **Database Impact**:
  * **Zero**.

---

## 6. Player Progression: Badges, Streaks & Achievements

### A. Human-Readable Overview
* **The Concept**: Long-term player retention benefits from collectible milestones beyond just a numeric win count.
* **The Experience**:
  * Players earn collectible Neo-Brutalist sticker badges:
    * 🎯 **"Deadly Sniper"**: Solved on guess 1.
    * ⚡ **"Ink Speedster"**: Solved in under 45 seconds.
    * 🔥 **"Streak Fiend"**: Maintained a 7-day, 30-day, and 100-day solve streak.
    * 🟣 **"Amethyst Archmage"**: Correctly identified 20 Amethyst target cards.
    * 🛡️ **"Steel Wall"**: Solved 20 Steel cards.
    * 👑 **"Lore Master"**: Won 50 lifetime games.
  * Badges appear on the player's profile in `settings.html`, beside their name in the Hall of Fame, and in group leaderboards.

### B. Technical Implementation Blueprint
* **Backend Architecture**:
  * Update `userSchema` in `server.js`:
    ```javascript
    badges: [{
        id: { type: String, required: true },
        title: { type: String, required: true },
        earnedAt: { type: Date, default: Date.now }
    }],
    stats: {
        currentStreak: { type: Number, default: 0 },
        maxStreak: { type: Number, default: 0 },
        totalWins: { type: Number, default: 0 },
        guessDistribution: { type: [Number], default: [0, 0, 0, 0, 0, 0] }
    }
    ```
  * In `POST /api/submit-score`: Evaluate achievement criteria against historical records and append newly earned badges in the response JSON:
    ```javascript
    const newBadges = checkBadgeUnlocks(user, todaysScore, canonicalCard);
    if (newBadges.length) {
        await User.updateOne({ username }, { $push: { badges: { $each: newBadges } } });
    }
    ```
* **Frontend Architecture**:
  * Showcase grid in `settings.html` and `history.html`. Pop-up confetti/badge unlock toast in `game.html` on game over.
* **Database Impact**:
  * Low. Numeric increments on existing user document upon daily solve.

---

## 7. Leaderboard Anti-Cheat & Impossible Solve Inspector

### A. Human-Readable Overview
* **The Concept**: Daily competitive Wordle-style games often suffer from bad actors opening the network tab or inspecting memory to submit impossible 1-second solves, ruining the Hall of Fame for legitimate players.
* **The Experience**:
  * Automated telemetry tracks time-to-solve.
  * Solves achieved in `< 4 seconds` from puzzle load or players who guess the target card on Guess 1 three days in a row without prior clue elimination are automatically flagged for review.
  * Public leaderboards automatically hide flagged entries.
  * Admins have a 1-click review/disqualify toggle in the Admin scores portal without deleting the user's account.

### B. Technical Implementation Blueprint
* **Backend Architecture**:
  * Update `scoreSchema` in `server.js`:
    ```javascript
    durationSeconds: { type: Number, default: 0 },
    flagged: { type: Boolean, default: false, index: true },
    flagReason: { type: String, default: null }
    ```
  * In `dailyProgressSchema`: track `startedAt: { type: Date, default: Date.now }`.
  * In `POST /api/submit-score`: Calculate `durationSeconds = Math.round((Date.now() - progress.startedAt) / 1000)`.
  * If `tries === 1 && durationSeconds < 4`: set `flagged = true`, `flagReason = 'IMPOSSIBLE_SPEED_1_SHOT'`.
  * Public queries on `Score.find()` filter by `{ flagged: { $ne: true } }`.
  * Admin endpoint `PUT /api/admin/scores/:id/flag` allowing admin override.
* **Database Impact**:
  * Minimal. One compound index `{ date: 1, flagged: 1, tries: 1 }`.
