const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const {
    initCardEngine,
    syncCardCatalog,
    getCatalogState,
    findCard,
    computeDeterministicCardForDate
} = require('./cardEngine');

const analyticsDataClient = new BetaAnalyticsDataClient();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- DATABASE SCHEMAS & INDEXES ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    avatar: { type: String, default: 'default' },
    theme: { type: String, default: 'default' },
    role: { type: String, enum: ['user', 'admin'], default: 'user' }
});
const User = mongoose.model('User', userSchema);

const feedbackSchema = new mongoose.Schema({
    name: { type: String, default: 'anonymous' },
    type: { type: String, enum: ['Feature Request', 'Feedback', 'Bug Report'], required: true },
    text: { type: String, maxlength: 1000, required: true },
    status: { type: String, enum: ['Open', 'In Progress', 'Closed'], default: 'Open' },
    date: { type: Date, default: Date.now },
    notes: [{ author: String, text: String, date: { type: Date, default: Date.now } }]
});
const Feedback = mongoose.model('Feedback', feedbackSchema);

const scoreSchema = new mongoose.Schema({
    username: { type: String, required: true },
    date: { type: String, required: true },
    tries: { type: Number, required: true },
    guesses: { type: [String], default: [] }
});
scoreSchema.index({ date: 1, tries: 1, _id: 1 });
scoreSchema.index({ username: 1, date: -1 });
const Score = mongoose.model('Score', scoreSchema);

const answerLogSchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true },
    targetCard: { type: String, required: true },
    scheduledBy: { type: String, default: 'auto' },
    updatedAt: { type: Date, default: Date.now }
});
const AnswerLog = mongoose.model('AnswerLog', answerLogSchema);

const dailyProgressSchema = new mongoose.Schema({
    username: { type: String, required: true },
    date: { type: String, required: true },
    guesses: { type: [String], default: [] },
    updatedAt: { type: Date, default: Date.now }
});
dailyProgressSchema.index({ username: 1, date: 1 }, { unique: true });
const DailyProgress = mongoose.model('DailyProgress', dailyProgressSchema);

const arcadeScoreSchema = new mongoose.Schema({
    emojis: { type: String, required: true },
    score: { type: Number, required: true },
    username: { type: String, default: null },
    date: { type: Date, default: Date.now }
});
arcadeScoreSchema.index({ score: -1, date: 1 });
const ArcadeScore = mongoose.model('ArcadeScore', arcadeScoreSchema);

// --- HELPER FUNCTIONS ---
function getCSTDate(offsetDays = 0) {
    const now = new Date();
    if (offsetDays !== 0) {
        now.setUTCDate(now.getUTCDate() + offsetDays);
    }
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Chicago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(now);
}

// Obfuscate target card name for client transport so network tab / globals don't leak plaintext
function encodeTargetToken(cardName, dateStr) {
    const key = `ROV_LOREDLE_${dateStr}`;
    const inputBytes = Buffer.from(cardName, 'utf8');
    const keyBytes = Buffer.from(key, 'utf8');
    const out = Buffer.alloc(inputBytes.length);
    for (let i = 0; i < inputBytes.length; i++) {
        out[i] = inputBytes[i] ^ keyBytes[i % keyBytes.length];
    }
    return out.toString('base64');
}

// Start card catalog engine initialization immediately on startup
const catalogInitPromise = initCardEngine();

// Lock or retrieve daily target card on the server
async function getOrLockDailyTargetCard(dateStr, lockInDb = true) {
    if (getCatalogState().cards.length === 0) {
        await catalogInitPromise;
    }
    const existing = await AnswerLog.findOne({ date: dateStr }).lean();
    if (existing && existing.targetCard) {
        const canonical = findCard(existing.targetCard);
        return canonical ? canonical.name : existing.targetCard;
    }

    // Gather last 60 days of AnswerLog cards to prevent recent repeats
    const recentLogs = await AnswerLog.find({ date: { $lt: dateStr } })
        .sort({ date: -1 })
        .limit(60)
        .lean();
    const excluded = new Set(recentLogs.map(r => {
        const c = findCard(r.targetCard);
        return c ? c.name : r.targetCard;
    }));

    const picked = computeDeterministicCardForDate(dateStr, excluded);
    if (!picked) return null;

    if (lockInDb) {
        try {
            await AnswerLog.findOneAndUpdate(
                { date: dateStr },
                { $setOnInsert: { date: dateStr, targetCard: picked.name, scheduledBy: 'auto', updatedAt: new Date() } },
                { upsert: true, new: true }
            );
        } catch (err) {
            // Ignore race condition on unique index
        }
    }

    return picked.name;
}

// --- MIDDLEWARE: Auth & Admin Check ---
function getOptionalUser(req) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return null;
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
        return null;
    }
}

function authenticateUser(req, res, next) {
    const decoded = getOptionalUser(req);
    if (!decoded) {
        return res.status(401).json({ error: 'Authentication required. Please log in again.' });
    }
    req.user = decoded;
    next();
}

function isAdmin(req, res, next) {
    const decoded = getOptionalUser(req);
    if (!decoded || decoded.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied.' });
    }
    req.adminUser = decoded;
    next();
}

// --- MONGODB CONNECTION & INITIALIZATION ---
mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('Connected to Database');

        // Ensure Admin Role Migration
        const adminUsername = process.env.ADMIN_USERNAME || 'rov_andy';
        const adminUser = await User.findOne({ username: adminUsername });
        if (adminUser && adminUser.role !== 'admin') {
            adminUser.role = 'admin';
            await adminUser.save();
            console.log(`Migrated ${adminUsername} to admin role.`);
        } else if (!adminUser && process.env.ADMIN_INITIAL_PASSWORD) {
            const hashedPassword = await bcrypt.hash(process.env.ADMIN_INITIAL_PASSWORD, 10);
            const newAdmin = new User({ username: adminUsername, password: hashedPassword, role: 'admin' });
            await newAdmin.save();
            console.log(`Created ${adminUsername} admin account.`);
        }

        // Ensure Card Catalog Engine is ready & Lock Today's Card
        await catalogInitPromise;
        const today = getCSTDate();
        const lockedCard = await getOrLockDailyTargetCard(today, true);
        console.log(`Daily Loredle Card for ${today} locked: ${lockedCard}`);
    })
    .catch(err => console.error('Database connection error:', err));

// --- CARD CATALOG & DAILY STATE ROUTES ---

app.get('/api/cards', async (req, res) => {
    let state = getCatalogState();
    if (state.cards.length === 0) {
        await catalogInitPromise;
        state = getCatalogState();
    }
    const clientHash = req.query.hash;
    if (clientHash && clientHash === state.versionHash && state.cards.length > 0) {
        return res.status(200).json({
            unchanged: true,
            versionHash: state.versionHash,
            lastSync: state.lastSync,
            source: state.source
        });
    }
    res.status(200).json({
        unchanged: false,
        versionHash: state.versionHash,
        lastSync: state.lastSync,
        source: state.source,
        setNames: state.setNames,
        cards: state.cards
    });
});

app.get('/api/daily-state', async (req, res) => {
    try {
        const today = getCSTDate();
        const targetCardName = await getOrLockDailyTargetCard(today, true);
        if (!targetCardName) {
            return res.status(503).json({ error: 'Card catalog is still initializing.' });
        }

        const targetToken = encodeTargetToken(targetCardName, today);
        const decodedUser = getOptionalUser(req);
        const username = decodedUser?.username || req.query.username || null;

        let completed = false;
        let completedScore = null;
        let inProgressGuesses = [];

        if (username && username !== 'Anonymous User') {
            const existingScore = await Score.findOne({ username, date: today }).lean();
            if (existingScore) {
                completed = true;
                completedScore = {
                    tries: existingScore.tries,
                    guesses: existingScore.guesses || []
                };
            } else {
                const prog = await DailyProgress.findOne({ username, date: today }).lean();
                if (prog && Array.isArray(prog.guesses)) {
                    inProgressGuesses = prog.guesses;
                }
            }
        }

        res.status(200).json({
            date: today,
            targetToken,
            completed,
            score: completedScore,
            inProgressGuesses
        });
    } catch (err) {
        console.error('Error in /api/daily-state:', err);
        res.status(500).json({ error: 'Failed to load daily game state.' });
    }
});

app.post('/api/daily-progress', async (req, res) => {
    try {
        const decodedUser = getOptionalUser(req);
        const username = decodedUser?.username || req.body.username;
        const { guesses } = req.body;
        if (!username || username === 'Anonymous User' || !Array.isArray(guesses)) {
            return res.status(200).json({ saved: false });
        }

        const today = getCSTDate();
        await DailyProgress.findOneAndUpdate(
            { username, date: today },
            { $set: { guesses, updatedAt: new Date() } },
            { upsert: true }
        );
        res.status(200).json({ saved: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save progress.' });
    }
});

// --- AUTH ROUTES ---

app.post('/api/register', async (req, res) => {
    try {
        const username = (req.body.username || '').trim();
        const password = req.body.password || '';
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }

        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ error: 'Username already taken.' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();

        const token = jwt.sign(
            { username: newUser.username, role: newUser.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'Registration successful!',
            username: newUser.username,
            avatar: newUser.avatar,
            theme: newUser.theme,
            role: newUser.role,
            token
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error during registration.' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const username = (req.body.username || '').trim();
        const password = req.body.password || '';
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ error: 'User not found.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid password.' });

        const token = jwt.sign(
            { username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(200).json({
            message: 'Login successful!',
            username: user.username,
            avatar: user.avatar,
            theme: user.theme,
            role: user.role,
            token
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// --- LEADERBOARD & HALL OF FAME (OPTIMIZED SINGLE-QUERY AGGREGATIONS) ---

app.get('/api/leaderboard', async (req, res) => {
    try {
        const today = getCSTDate();
        const scores = await Score.aggregate([
            { $match: { date: today } },
            { $sort: { tries: 1, _id: 1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'users',
                    localField: 'username',
                    foreignField: 'username',
                    as: 'userDoc'
                }
            },
            {
                $project: {
                    _id: 1,
                    username: 1,
                    date: 1,
                    tries: 1,
                    avatar: {
                        $ifNull: [{ $arrayElemAt: ['$userDoc.avatar', 0] }, 'default']
                    }
                }
            }
        ]);

        res.status(200).json(scores);
    } catch (err) {
        console.error('Leaderboard error:', err);
        res.status(500).json({ error: 'Failed to fetch leaderboard.' });
    }
});

app.get('/api/hall-of-fame', async (req, res) => {
    try {
        const dailyWinners = await Score.aggregate([
            { $sort: { date: -1, tries: 1, _id: 1 } },
            {
                $group: {
                    _id: '$date',
                    username: { $first: '$username' },
                    tries: { $first: '$tries' },
                    date: { $first: '$date' }
                }
            },
            { $sort: { date: -1 } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'username',
                    foreignField: 'username',
                    as: 'userDoc'
                }
            },
            {
                $project: {
                    _id: 1,
                    username: 1,
                    tries: 1,
                    date: 1,
                    avatar: {
                        $ifNull: [{ $arrayElemAt: ['$userDoc.avatar', 0] }, 'default']
                    }
                }
            }
        ]);

        const winCounts = new Map();
        for (const winner of dailyWinners) {
            const prev = winCounts.get(winner.username) || { username: winner.username, count: 0, avatar: winner.avatar };
            prev.count += 1;
            winCounts.set(winner.username, prev);
        }

        const top5 = Array.from(winCounts.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        res.status(200).json({ top5, recentWinners: dailyWinners });
    } catch (err) {
        console.error('Hall of Fame error:', err);
        res.status(500).json({ error: 'Failed to fetch hall of fame.' });
    }
});

// --- USER SETTINGS & DETAILED HISTORY ---

app.put('/api/user/change-password', async (req, res) => {
    try {
        const decoded = getOptionalUser(req);
        const { username, currentPassword, newPassword } = req.body;
        const targetUsername = decoded ? decoded.username : username;
        if (!targetUsername) return res.status(401).json({ error: 'Authentication required.' });

        const user = await User.findOne({ username: targetUsername });
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Current password is incorrect.' });

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        res.status(200).json({ message: 'Password updated successfully!' });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

app.put('/api/user/preferences', async (req, res) => {
    try {
        const decoded = getOptionalUser(req);
        const { username, avatar, theme } = req.body;
        const targetUsername = decoded ? decoded.username : username;
        if (!targetUsername) return res.status(401).json({ error: 'Authentication required.' });

        const user = await User.findOne({ username: targetUsername });
        if (!user) return res.status(404).json({ error: 'User not found.' });

        if (avatar) user.avatar = avatar;
        if (theme) user.theme = theme;
        await user.save();
        res.status(200).json({ message: 'Preferences updated!', avatar: user.avatar, theme: user.theme });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

// Optimized Detailed History (Fixes N+1 queries AND attaches targetCard from AnswerLog!)
app.get('/api/user/detailed-history/:username', async (req, res) => {
    try {
        const username = req.params.username;
        const userScores = await Score.find({ username }).sort({ date: -1 }).lean();
        if (userScores.length === 0) {
            return res.status(200).json([]);
        }

        const dates = userScores.map(s => s.date);
        const [allDayScores, answerLogs] = await Promise.all([
            Score.find({ date: { $in: dates } }).sort({ tries: 1, _id: 1 }).select('_id date tries').lean(),
            AnswerLog.find({ date: { $in: dates } }).lean()
        ]);

        const scoresByDate = new Map();
        for (const ds of allDayScores) {
            if (!scoresByDate.has(ds.date)) scoresByDate.set(ds.date, []);
            scoresByDate.get(ds.date).push(ds._id.toString());
        }

        const answerByDate = new Map();
        for (const al of answerLogs) {
            const canonical = findCard(al.targetCard);
            answerByDate.set(al.date, canonical ? canonical.name : al.targetCard);
        }

        const enriched = userScores.map(score => {
            const dayList = scoresByDate.get(score.date) || [];
            const rank = dayList.indexOf(score._id.toString()) + 1;
            const fallbackLastGuess = Array.isArray(score.guesses) && score.guesses.length > 0
                ? score.guesses[score.guesses.length - 1]
                : null;
            return {
                ...score,
                rank: rank > 0 ? rank : 1,
                totalPlayers: dayList.length || 1,
                targetCard: answerByDate.get(score.date) || fallbackLastGuess || null
            };
        });

        res.status(200).json(enriched);
    } catch (err) {
        console.error('Detailed history error:', err);
        res.status(500).json({ error: 'Failed to fetch detailed history.' });
    }
});

// --- GAMEPLAY: SUBMIT SCORE ---

app.post('/api/submit-score', async (req, res) => {
    try {
        const { username, tries, shareText, targetCard, guesses } = req.body;
        const today = getCSTDate();

        const isAnonymous = !username || username === 'Anonymous User';
        const displayUsername = isAnonymous ? 'Anonymous User' : username;

        if (!isAnonymous) {
            const existingScore = await Score.findOne({ username, date: today });
            if (existingScore) {
                return res.status(400).json({ error: "You already submitted today's score!" });
            }

            const newScore = new Score({
                username,
                date: today,
                tries: Number(tries) || (Array.isArray(guesses) ? guesses.length : 1),
                guesses: Array.isArray(guesses) ? guesses : []
            });
            await newScore.save();

            // Clear temporary in-progress state now that the game is finished
            await DailyProgress.deleteOne({ username, date: today });
        }

        if (targetCard) {
            const existingAnswer = await AnswerLog.findOne({ date: today });
            if (!existingAnswer) {
                const canonical = findCard(targetCard);
                const newAnswer = new AnswerLog({
                    date: today,
                    targetCard: canonical ? canonical.name : targetCard,
                    scheduledBy: 'auto'
                });
                await newAnswer.save();
            }
        }

        if (process.env.DISCORD_WEBHOOK_URL && shareText) {
            const lines = shareText.split('\n');
            const gridLines = lines.filter(line => line.includes('🟥') || line.includes('🟩') || line.includes('🟨'));
            const emojiGrid = gridLines.join('\n');

            fetch(process.env.DISCORD_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: `🚨 **${displayUsername}** completed today's Loredle in **${tries}** ${Number(tries) === 1 ? 'try' : 'tries'}!\n${emojiGrid}`
                })
            }).catch(err => console.error('Discord Webhook Failed:', err));
        }

        res.status(201).json({ message: 'Score processed successfully!' });
    } catch (err) {
        console.error('Submit score error:', err);
        res.status(500).json({ error: 'Failed to process score.' });
    }
});

// --- ARCADE ROUTES (VERSION TRAINER) ---

app.post('/api/arcade-score', async (req, res) => {
    try {
        const { emojis, score, username } = req.body;
        const newScore = new ArcadeScore({ emojis, score: Number(score) || 0, username: username || null });
        await newScore.save();
        res.status(201).json({ message: 'Arcade score saved!' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save arcade score.' });
    }
});

app.get('/api/arcade-leaderboard', async (req, res) => {
    try {
        const scores = await ArcadeScore.find().sort({ score: -1, date: 1 }).limit(25).lean();
        res.status(200).json(scores);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch arcade leaderboard.' });
    }
});

// --- FEEDBACK ROUTES ---

app.post('/api/feedback', async (req, res) => {
    try {
        const { name, type, text, anonymous } = req.body;
        const submitName = anonymous ? 'anonymous' : (name || 'anonymous');
        const newFeedback = new Feedback({ name: submitName, type, text });
        await newFeedback.save();
        res.status(201).json({ message: 'Feedback submitted successfully!' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to submit feedback.' });
    }
});

// --- ADMIN PORTAL API ROUTES ---

// 1. Users Management
app.get('/api/admin/users', isAdmin, async (req, res) => {
    try {
        const users = await User.find({}, '-password').lean();
        res.status(200).json(users);
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.put('/api/admin/users/:id', isAdmin, async (req, res) => {
    try {
        const { username, role, theme, avatar, newPassword } = req.body;
        const updateData = { username, role, theme, avatar };
        if (newPassword) {
            updateData.password = await bcrypt.hash(newPassword, 10);
        }
        await User.findByIdAndUpdate(req.params.id, updateData);
        res.status(200).json({ message: 'Updated' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/admin/users/:id', isAdmin, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// 2. Scores Management
app.get('/api/admin/scores', isAdmin, async (req, res) => {
    try {
        const [scores, answers] = await Promise.all([
            Score.find().sort({ date: -1, tries: 1 }).lean(),
            AnswerLog.find().lean()
        ]);
        const answerMap = {};
        answers.forEach(a => { answerMap[a.date] = a.targetCard; });
        scores.forEach(s => { s.targetCard = answerMap[s.date] || 'Unknown'; });
        res.status(200).json(scores);
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.put('/api/admin/scores/:id', isAdmin, async (req, res) => {
    try {
        const { username, date, tries, guesses } = req.body;
        await Score.findByIdAndUpdate(req.params.id, { username, date, tries, guesses });
        res.status(200).json({ message: 'Updated' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/admin/scores/:id', isAdmin, async (req, res) => {
    try {
        await Score.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// 3. Arcade Leaderboard Moderation
app.get('/api/admin/arcade-scores', isAdmin, async (req, res) => {
    try {
        const scores = await ArcadeScore.find().sort({ score: -1, date: 1 }).limit(100).lean();
        res.status(200).json(scores);
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/admin/arcade-scores/:id', isAdmin, async (req, res) => {
    try {
        await ArcadeScore.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Deleted arcade score' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// 4. Feedback & Communications
app.get('/api/admin/feedbacks', isAdmin, async (req, res) => {
    try {
        const feedbacks = await Feedback.find().sort({ date: -1 }).lean();
        res.status(200).json(feedbacks);
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.put('/api/admin/feedbacks/:id', isAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        await Feedback.findByIdAndUpdate(req.params.id, { status });
        res.status(200).json({ message: 'Updated' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/admin/feedbacks/:id/notes', isAdmin, async (req, res) => {
    try {
        const { text } = req.body;
        const feedback = await Feedback.findById(req.params.id);
        if (!feedback) return res.status(404).json({ error: 'Not found' });

        feedback.notes.push({ author: req.adminUser.username, text });
        await feedback.save();
        res.status(201).json({ message: 'Note added', notes: feedback.notes });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/admin/feedbacks/:id', isAdmin, async (req, res) => {
    try {
        await Feedback.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// 5. Card Database Inspector & One-Click Sync
app.get('/api/admin/cards-status', isAdmin, (req, res) => {
    const state = getCatalogState();
    const setCounts = {};
    for (const c of state.cards) {
        const key = `${c.setCode} - ${c.set}`;
        setCounts[key] = (setCounts[key] || 0) + 1;
    }
    res.status(200).json({
        totalCanonicalCards: state.cards.length,
        rawPrintingsCount: state.rawCount,
        totalSets: Object.keys(setCounts).length,
        setsBreakdown: setCounts,
        source: state.source,
        lastSync: state.lastSync,
        versionHash: state.versionHash
    });
});

app.post('/api/admin/cards-sync', isAdmin, async (req, res) => {
    try {
        const state = await syncCardCatalog();
        res.status(200).json({
            message: 'Card catalog synchronized!',
            totalCanonicalCards: state.cards.length,
            rawPrintingsCount: state.rawCount,
            source: state.source,
            lastSync: state.lastSync,
            versionHash: state.versionHash
        });
    } catch (err) {
        res.status(500).json({ error: 'Card sync failed.' });
    }
});

// 6. Daily Card Manager & Scheduler
app.get('/api/admin/daily-schedule', isAdmin, async (req, res) => {
    try {
        const today = getCSTDate(0);
        const dates = [];
        for (let offset = -7; offset <= 14; offset++) {
            dates.push(getCSTDate(offset));
        }

        const logs = await AnswerLog.find({ date: { $in: dates } }).lean();
        const logMap = new Map(logs.map(l => [l.date, l]));

        // Also get recent 60 days for realistic preview calculation
        const recent60 = await AnswerLog.find({ date: { $lt: today } }).sort({ date: -1 }).limit(60).lean();
        const excluded = new Set(recent60.map(r => {
            const c = findCard(r.targetCard);
            return c ? c.name : r.targetCard;
        }));

        const schedule = dates.map(dateStr => {
            const logged = logMap.get(dateStr);
            let cardName = logged ? logged.targetCard : null;
            let status = logged ? (logged.scheduledBy === 'admin' ? 'Scheduled (Admin)' : 'Locked') : 'Auto-Preview';

            if (!cardName) {
                const preview = computeDeterministicCardForDate(dateStr, excluded);
                cardName = preview ? preview.name : 'Unknown';
            }

            const cardObj = findCard(cardName);
            return {
                date: dateStr,
                isToday: dateStr === today,
                isPast: dateStr < today,
                status,
                scheduledBy: logged?.scheduledBy || 'auto',
                targetCard: cardObj ? cardObj.name : cardName,
                cardDetails: cardObj ? {
                    set: cardObj.set,
                    setCode: cardObj.setCode,
                    number: cardObj.number,
                    cost: cardObj.cost,
                    colors: cardObj.colors,
                    rarity: cardObj.rarity,
                    type: cardObj.type,
                    image: cardObj.image
                } : null
            };
        });

        res.status(200).json({ today, schedule });
    } catch (err) {
        console.error('Schedule fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch daily schedule.' });
    }
});

app.put('/api/admin/daily-schedule', isAdmin, async (req, res) => {
    try {
        const { date, targetCard } = req.body;
        if (!date || !targetCard) {
            return res.status(400).json({ error: 'Date and targetCard are required.' });
        }
        const canonical = findCard(targetCard);
        if (!canonical) {
            return res.status(400).json({ error: `Card "${targetCard}" not found in canonical catalog.` });
        }

        await AnswerLog.findOneAndUpdate(
            { date },
            {
                $set: {
                    date,
                    targetCard: canonical.name,
                    scheduledBy: req.adminUser.username || 'admin',
                    updatedAt: new Date()
                }
            },
            { upsert: true, new: true }
        );

        res.status(200).json({
            message: `Scheduled "${canonical.name}" for ${date}!`,
            date,
            targetCard: canonical.name
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to schedule daily card.' });
    }
});

app.delete('/api/admin/daily-schedule/:date', isAdmin, async (req, res) => {
    try {
        const date = req.params.date;
        const today = getCSTDate();
        if (date <= today) {
            return res.status(400).json({ error: 'Cannot delete past or active daily answer logs.' });
        }
        await AnswerLog.deleteOne({ date });
        res.status(200).json({ message: `Reverted ${date} to automatic PRNG selection.` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to revert schedule.' });
    }
});

// 7. Discord Webhook Tester
app.post('/api/admin/test-webhook', isAdmin, async (req, res) => {
    try {
        if (!process.env.DISCORD_WEBHOOK_URL) {
            return res.status(400).json({ error: 'DISCORD_WEBHOOK_URL is not configured in .env' });
        }
        const response = await fetch(process.env.DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: `🟣 **Rules of Villainy — Loredle v3.0 Admin Webhook Test**\nTriggered by **${req.adminUser.username}** — Webhook connection is operational! 🐉🔥`
            })
        });
        if (!response.ok) {
            return res.status(502).json({ error: `Discord returned HTTP ${response.status}` });
        }
        res.status(200).json({ message: 'Test message delivered to Discord!' });
    } catch (err) {
        res.status(500).json({ error: 'Discord webhook test failed.' });
    }
});

// 8. Dashboard Analytics
app.get('/api/admin/analytics', isAdmin, async (req, res) => {
    try {
        const [users, scores, feedbacks, answers] = await Promise.all([
            User.find({}, 'role').lean(),
            Score.find().lean(),
            Feedback.find({}, 'status').lean(),
            AnswerLog.find().lean()
        ]);

        const answerMap = {};
        answers.forEach(a => { answerMap[a.date] = a.targetCard; });

        const totalRegisteredUsers = users.length;
        const totalAdmins = users.filter(u => u.role === 'admin').length;
        const totalGamesPlayed = scores.length;
        const openFeedbacks = feedbacks.filter(f => f.status === 'Open').length;

        const globalFirstGuesses = {};
        const globalIncorrectGuesses = {};
        const dailyData = {};

        scores.forEach(s => {
            const date = s.date;
            if (!dailyData[date]) {
                dailyData[date] = {
                    date,
                    targetCard: answerMap[date] || 'Unknown',
                    gamesPlayed: 0,
                    totalGuesses: 0,
                    fewestGuesses: Infinity,
                    mostGuesses: -Infinity,
                    winnersFewest: [],
                    incorrectGuesses: {},
                    firstGuesses: {}
                };
            }

            const dayObj = dailyData[date];
            dayObj.gamesPlayed++;
            dayObj.totalGuesses += s.tries;

            if (s.tries < dayObj.fewestGuesses) {
                dayObj.fewestGuesses = s.tries;
                dayObj.winnersFewest = [s.username];
            } else if (s.tries === dayObj.fewestGuesses) {
                if (!dayObj.winnersFewest.includes(s.username)) {
                    dayObj.winnersFewest.push(s.username);
                }
            }

            if (s.tries > dayObj.mostGuesses) dayObj.mostGuesses = s.tries;

            const guessesArr = s.guesses || [];
            if (guessesArr.length > 0) {
                const first = guessesArr[0];
                globalFirstGuesses[first] = (globalFirstGuesses[first] || 0) + 1;
                dayObj.firstGuesses[first] = (dayObj.firstGuesses[first] || 0) + 1;
            }

            guessesArr.forEach(g => {
                const ans = answerMap[date] || 'Unknown';
                if (g !== ans) {
                    globalIncorrectGuesses[g] = (globalIncorrectGuesses[g] || 0) + 1;
                    dayObj.incorrectGuesses[g] = (dayObj.incorrectGuesses[g] || 0) + 1;
                }
            });
        });

        let mostCommonIncorrect = 'None';
        let maxInc = 0;
        for (const [card, count] of Object.entries(globalIncorrectGuesses)) {
            if (count > maxInc) { maxInc = count; mostCommonIncorrect = card; }
        }

        let mostCommonFirst = 'None';
        let maxFirst = 0;
        for (const [card, count] of Object.entries(globalFirstGuesses)) {
            if (count > maxFirst) { maxFirst = count; mostCommonFirst = card; }
        }

        const sortedDates = Object.keys(dailyData).sort();
        const dailyCounts = [];
        const dailyAvgGuesses = [];

        const dailyStatsTable = sortedDates.map(date => {
            const dayObj = dailyData[date];
            dailyCounts.push(dayObj.gamesPlayed);
            const avg = dayObj.gamesPlayed > 0 ? (dayObj.totalGuesses / dayObj.gamesPlayed).toFixed(2) : 0;
            dailyAvgGuesses.push(avg);

            let dayMostInc = 'None';
            let dayMaxInc = 0;
            for (const [c, count] of Object.entries(dayObj.incorrectGuesses)) {
                if (count > dayMaxInc) { dayMaxInc = count; dayMostInc = c; }
            }

            let dayMostFirst = 'None';
            let dayMaxFirst = 0;
            for (const [c, count] of Object.entries(dayObj.firstGuesses)) {
                if (count > dayMaxFirst) { dayMaxFirst = count; dayMostFirst = c; }
            }

            if (dayObj.fewestGuesses === Infinity) dayObj.fewestGuesses = 0;
            if (dayObj.mostGuesses === -Infinity) dayObj.mostGuesses = 0;

            return {
                date: dayObj.date,
                answerCard: dayObj.targetCard,
                fewestGuesses: dayObj.fewestGuesses,
                mostGuesses: dayObj.mostGuesses,
                avgGuesses: avg,
                gamesPlayed: dayObj.gamesPlayed,
                winners: dayObj.winnersFewest.join(', '),
                mostGuessedIncorrect: dayMaxInc > 0 ? `${dayMostInc} (${dayMaxInc})` : 'None',
                mostCommonFirst: dayMaxFirst > 1 ? `${dayMostFirst} (${dayMaxFirst})` : 'None'
            };
        });

        res.status(200).json({
            dates: sortedDates,
            dailyCounts,
            dailyAvgGuesses,
            totalRegisteredUsers,
            totalAdmins,
            totalGamesPlayed,
            openFeedbacks,
            mostCommonIncorrect,
            mostCommonFirst,
            dailyStatsTable
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

// 9. Google Analytics 4 Integration
app.get('/api/admin/ga-data', isAdmin, async (req, res) => {
    try {
        const propertyId = process.env.GA4_PROPERTY_ID;

        const [
            [realtimeResponse],
            [dailyResponse],
            [pagesResponse],
            [deviceResponse],
            [sourceResponse],
            [countryResponse],
            [totalsResponse],
            [engagementResponse],
            [eventsResponse],
            [osResponse],
            [browserResponse],
            [newRetResponse]
        ] = await Promise.all([
            analyticsDataClient.runRealtimeReport({
                property: `properties/${propertyId}`,
                metrics: [{ name: 'activeUsers' }]
            }),
            analyticsDataClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
                dimensions: [{ name: 'date' }],
                metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }],
                orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }]
            }),
            analyticsDataClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
                dimensions: [{ name: 'pagePath' }],
                metrics: [{ name: 'screenPageViews' }],
                orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
                limit: 10
            }),
            analyticsDataClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
                dimensions: [{ name: 'deviceCategory' }],
                metrics: [{ name: 'sessions' }]
            }),
            analyticsDataClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
                dimensions: [{ name: 'sessionSourceMedium' }],
                metrics: [{ name: 'sessions' }],
                orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
                limit: 10
            }),
            analyticsDataClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
                dimensions: [{ name: 'country' }],
                metrics: [{ name: 'sessions' }],
                orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
                limit: 10
            }),
            analyticsDataClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
                metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }]
            }),
            analyticsDataClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
                metrics: [{ name: 'engagementRate' }, { name: 'bounceRate' }, { name: 'averageSessionDuration' }]
            }),
            analyticsDataClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
                dimensions: [{ name: 'eventName' }],
                metrics: [{ name: 'eventCount' }],
                orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
                limit: 10
            }),
            analyticsDataClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
                dimensions: [{ name: 'operatingSystem' }],
                metrics: [{ name: 'sessions' }],
                orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
                limit: 10
            }),
            analyticsDataClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
                dimensions: [{ name: 'browser' }],
                metrics: [{ name: 'sessions' }],
                orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
                limit: 10
            }),
            analyticsDataClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
                dimensions: [{ name: 'newVsReturning' }],
                metrics: [{ name: 'sessions' }]
            })
        ]);

        const activeUsers = realtimeResponse.rows && realtimeResponse.rows.length > 0
            ? realtimeResponse.rows[0].metricValues[0].value
            : 0;

        const dailyData = (dailyResponse.rows || []).map(row => ({
            date: row.dimensionValues[0].value,
            sessions: parseInt(row.metricValues[0].value),
            users: parseInt(row.metricValues[1].value),
            pageviews: parseInt(row.metricValues[2].value)
        }));

        const topPages = (pagesResponse.rows || []).map(row => ({
            path: row.dimensionValues[0].value,
            views: parseInt(row.metricValues[0].value)
        }));

        const devices = (deviceResponse.rows || []).map(row => ({
            category: row.dimensionValues[0].value,
            sessions: parseInt(row.metricValues[0].value)
        }));

        const sources = (sourceResponse.rows || []).map(row => ({
            source: row.dimensionValues[0].value,
            sessions: parseInt(row.metricValues[0].value)
        }));

        const countries = (countryResponse.rows || []).map(row => ({
            country: row.dimensionValues[0].value,
            sessions: parseInt(row.metricValues[0].value)
        }));

        const totals = totalsResponse.rows && totalsResponse.rows.length > 0 ? {
            sessions: totalsResponse.rows[0].metricValues[0].value,
            users: totalsResponse.rows[0].metricValues[1].value,
            pageviews: totalsResponse.rows[0].metricValues[2].value
        } : { sessions: 0, users: 0, pageviews: 0 };

        const engagement = engagementResponse.rows && engagementResponse.rows.length > 0 ? {
            engagementRate: parseFloat(engagementResponse.rows[0].metricValues[0].value).toFixed(2),
            bounceRate: parseFloat(engagementResponse.rows[0].metricValues[1].value).toFixed(2),
            averageSessionDuration: parseFloat(engagementResponse.rows[0].metricValues[2].value).toFixed(2)
        } : { engagementRate: 0, bounceRate: 0, averageSessionDuration: 0 };

        const events = (eventsResponse.rows || []).map(row => ({
            eventName: row.dimensionValues[0].value,
            eventCount: parseInt(row.metricValues[0].value)
        }));

        const operatingSystems = (osResponse.rows || []).map(row => ({
            os: row.dimensionValues[0].value,
            sessions: parseInt(row.metricValues[0].value)
        }));

        const browsers = (browserResponse.rows || []).map(row => ({
            browser: row.dimensionValues[0].value,
            sessions: parseInt(row.metricValues[0].value)
        }));

        const newVsReturning = (newRetResponse.rows || []).map(row => ({
            type: row.dimensionValues[0].value,
            sessions: parseInt(row.metricValues[0].value)
        }));

        res.status(200).json({
            activeUsers,
            totals,
            engagement,
            dailyData,
            topPages,
            devices,
            sources,
            countries,
            events,
            operatingSystems,
            browsers,
            newVsReturning
        });
    } catch (err) {
        console.error('GA Data Error:', err);
        res.status(500).json({ error: 'Failed to fetch GA data.' });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server sprinting on port ${PORT}`);
});
