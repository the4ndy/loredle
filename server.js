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
    guesses: { type: [String], default: [] },
    trackerUsed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
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
    trackerUsed: { type: Boolean, default: false },
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

// --- NEW QOL SCHEMAS ---
const groupSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 40 },
    code: { type: String, required: true, unique: true, uppercase: true, index: true }, // e.g. "ROV-419"
    owner: { type: String, required: true, index: true },
    members: [{ type: String, index: true }],
    deleted: { type: Boolean, default: false, index: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
groupSchema.index({ members: 1, deleted: 1 });
const Group = mongoose.model('Group', groupSchema);

const discordWebhookSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: false },
    sendScoreCompletions: { type: Boolean, default: false }, // Player solve alerts
    announceNewPuzzle: { type: Boolean, default: false },    // Midnight CST reset
    includeYesterdayRecap: { type: Boolean, default: false },
    announceWinner: { type: Boolean, default: false },
    spoilerProtection: { type: Boolean, default: true },
    pingRole: { type: String, default: '' },
    customMessage: { type: String, default: '' },
    templateCompletion: { type: String, default: '' },
    templateDailyDrop: { type: String, default: '' },
    templateYesterdayRecap: { type: String, default: '' },
    templateWinnerShoutout: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
const DiscordWebhook = mongoose.model('DiscordWebhook', discordWebhookSchema);

const systemConfigSchema = new mongoose.Schema({
    key: { type: String, unique: true, default: 'global_config' },
    announcement: {
        active: { type: Boolean, default: false },
        id: { type: String, default: '' },
        message: { type: String, default: '', maxlength: 500 },
        text: { type: String, default: '' },
        type: { type: String, default: 'teal' }
    },
    maintenance: {
        active: { type: Boolean, default: false },
        message: { type: String, default: 'Loredle is temporarily under maintenance. Back shortly!' }
    },
    maintenanceMode: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now }
});
const SystemConfig = mongoose.model('SystemConfig', systemConfigSchema);

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

        // Initialize System Config Cache
        try {
            const existingConfig = await SystemConfig.findOne({ key: 'global_config' }).lean();
            if (existingConfig) {
                const ann = existingConfig.announcement || {};
                const maint = existingConfig.maintenance || {};
                systemConfigCache = {
                    announcement: {
                        active: Boolean(ann.active),
                        id: ann.id || '',
                        message: ann.message || ann.text || '',
                        text: ann.text || ann.message || '',
                        type: ann.type || 'teal'
                    },
                    maintenance: {
                        active: Boolean(maint.active ?? existingConfig.maintenanceMode),
                        message: maint.message || 'Loredle is temporarily under maintenance. Back shortly!'
                    },
                    maintenanceMode: Boolean(maint.active ?? existingConfig.maintenanceMode)
                };
            } else {
                await SystemConfig.create({ key: 'global_config' });
            }
        } catch (sysErr) {
            console.error('System config init error:', sysErr);
        }

        // Initialize Default Discord Webhook from .env if present
        await initDefaultDiscordWebhook();
    })
    .catch(err => console.error('Database connection error:', err));

let systemConfigCache = {
    announcement: { active: false, id: '', message: '', text: '', type: 'teal' },
    maintenance: { active: false, message: 'Loredle is temporarily under maintenance. Back shortly!' },
    maintenanceMode: false
};

async function initDefaultDiscordWebhook() {
    const envUrl = (process.env.DISCORD_WEBHOOK_URL || '').trim();
    if (!envUrl) return;
    try {
        const existing = await DiscordWebhook.findOne({ url: envUrl });
        if (!existing) {
            await DiscordWebhook.create({
                name: 'Primary Discord Server',
                url: envUrl,
                enabled: true,
                sendScoreCompletions: true, // Keep completion alerts active as requested!
                announceNewPuzzle: false,
                includeYesterdayRecap: false,
                announceWinner: false,
                spoilerProtection: true,
                pingRole: '',
                customMessage: ''
            });
            console.log('Registered primary Discord webhook from .env with completion alerts active.');
        } else {
            // Ensure primary webhook has completion alerts active
            if (!existing.sendScoreCompletions) {
                existing.sendScoreCompletions = true;
                await existing.save();
            }
        }
    } catch (e) {
        console.error('Error initializing default Discord webhook:', e);
    }
}

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
        const decodedUser = getOptionalUser(req);
        const isMaint = Boolean(systemConfigCache.maintenance?.active || systemConfigCache.maintenanceMode);
        if (isMaint && (!decodedUser || decodedUser.role !== 'admin')) {
            const maintMsg = systemConfigCache.maintenance?.message || systemConfigCache.announcement?.message || systemConfigCache.announcement?.text || 'Loredle is currently under maintenance. Please check back shortly!';
            return res.status(503).json({
                maintenance: true,
                message: maintMsg
            });
        }

        const today = getCSTDate();
        const targetCardName = await getOrLockDailyTargetCard(today, true);
        if (!targetCardName) {
            return res.status(503).json({ error: 'Card catalog is still initializing.' });
        }

        const targetToken = encodeTargetToken(targetCardName, today);
        const username = decodedUser?.username || req.query.username || null;

        let completed = false;
        let completedScore = null;
        let inProgressGuesses = [];
        let inProgressTrackerUsed = false;

        if (username && username !== 'Anonymous User') {
            const existingScore = await Score.findOne({ username, date: today }).lean();
            if (existingScore) {
                completed = true;
                completedScore = {
                    tries: existingScore.tries,
                    guesses: existingScore.guesses || [],
                    trackerUsed: !!existingScore.trackerUsed
                };
            } else {
                const prog = await DailyProgress.findOne({ username, date: today }).lean();
                if (prog) {
                    if (Array.isArray(prog.guesses)) inProgressGuesses = prog.guesses;
                    inProgressTrackerUsed = !!prog.trackerUsed;
                }
            }
        }

        res.status(200).json({
            date: today,
            targetToken,
            completed,
            score: completedScore,
            inProgressGuesses,
            trackerUsed: inProgressTrackerUsed
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
        const { guesses, trackerUsed } = req.body;
        if (!username || username === 'Anonymous User' || !Array.isArray(guesses)) {
            return res.status(200).json({ saved: false });
        }

        const today = getCSTDate();
        await DailyProgress.findOneAndUpdate(
            { username, date: today },
            { $set: { guesses, trackerUsed: !!trackerUsed, updatedAt: new Date() } },
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
                    trackerUsed: { $ifNull: ['$trackerUsed', false] },
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
                    trackerUsed: { $first: '$trackerUsed' },
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
                    trackerUsed: { $ifNull: ['$trackerUsed', false] },
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
        const { username, tries, shareText, targetCard, guesses, trackerUsed } = req.body;
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
                guesses: Array.isArray(guesses) ? guesses : [],
                trackerUsed: !!trackerUsed
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

        // Webhook dispatch: Send score completion to all active webhooks with sendScoreCompletions: true
        try {
            const webhooks = await DiscordWebhook.find({ enabled: true, sendScoreCompletions: true }).lean();
            if (shareText && webhooks.length > 0) {
                const lines = shareText.split('\n');
                const gridLines = lines.filter(line => line.includes('🟥') || line.includes('🟩') || line.includes('🟨'));
                const emojiGrid = gridLines.join('\n');
                const trackerTag = trackerUsed ? ' (🔎 Card Tracker)' : '';
                const triesText = Number(tries) === 1 ? 'try' : 'tries';

                for (const wh of webhooks) {
                    let formatted = wh.templateCompletion && wh.templateCompletion.trim()
                        ? wh.templateCompletion
                            .replace(/{username}/g, displayUsername)
                            .replace(/{tries}/g, String(tries))
                            .replace(/{triesText}/g, triesText)
                            .replace(/{tracker}/g, trackerTag)
                            .replace(/{grid}/g, emojiGrid)
                            .replace(/{date}/g, today)
                        : `🚨 **${displayUsername}**${trackerTag} completed today's Loredle in **${tries}** ${triesText}!\n${emojiGrid}`;

                    const pingText = wh.pingRole ? (wh.pingRole.startsWith('<@') ? `${wh.pingRole} ` : `<@&${wh.pingRole}> `) : '';
                    fetch(wh.url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content: `${pingText}${formatted}` })
                    }).catch(err => console.error(`Discord dispatch failed for "${wh.name}":`, err));
                }
            }
        } catch (webhookErr) {
            console.error('Webhook error:', webhookErr);
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

// --- SYSTEM ANNOUNCEMENT & MAINTENANCE ROUTES ---

app.get('/api/system/announcement', (req, res) => {
    res.status(200).json({
        announcement: systemConfigCache.announcement || { active: false, id: '', message: '', text: '', type: 'teal' },
        maintenance: systemConfigCache.maintenance || { active: false, message: '' },
        maintenanceMode: Boolean(systemConfigCache.maintenance?.active || systemConfigCache.maintenanceMode)
    });
});

app.put('/api/admin/system/announcement', isAdmin, async (req, res) => {
    try {
        const bodyAnn = req.body.announcement || {};
        const bodyMaint = req.body.maintenance || {};

        // Support both structured { announcement, maintenance } and flat properties
        const isActive = bodyAnn.active !== undefined ? Boolean(bodyAnn.active) : Boolean(req.body.active);
        const annId = (bodyAnn.id || req.body.id || 'ann_' + Date.now()).trim();
        const msg = (bodyAnn.message || bodyAnn.text || req.body.text || req.body.message || '').trim();
        const rawType = (bodyAnn.type || req.body.type || 'teal').trim().toLowerCase();
        let themeType = 'teal';
        if (['gold', 'event'].includes(rawType)) themeType = 'gold';
        else if (['pink', 'alert'].includes(rawType)) themeType = 'pink';
        else themeType = 'teal';

        const isMaint = bodyMaint.active !== undefined ? Boolean(bodyMaint.active) : Boolean(req.body.maintenanceMode);
        const maintMsg = (bodyMaint.message || req.body.maintenanceMessage || 'Loredle is temporarily under maintenance. Back shortly!').trim();

        const updated = await SystemConfig.findOneAndUpdate(
            { key: 'global_config' },
            {
                $set: {
                    announcement: {
                        active: isActive,
                        id: annId,
                        message: msg,
                        text: msg,
                        type: themeType
                    },
                    maintenance: {
                        active: isMaint,
                        message: maintMsg
                    },
                    maintenanceMode: isMaint,
                    updatedAt: new Date()
                }
            },
            { returnDocument: 'after', upsert: true }
        );

        systemConfigCache = {
            announcement: {
                active: Boolean(updated.announcement?.active),
                id: updated.announcement?.id || '',
                message: updated.announcement?.message || updated.announcement?.text || '',
                text: updated.announcement?.text || updated.announcement?.message || '',
                type: updated.announcement?.type || 'teal'
            },
            maintenance: {
                active: Boolean(updated.maintenance?.active ?? updated.maintenanceMode),
                message: updated.maintenance?.message || 'Loredle is temporarily under maintenance. Back shortly!'
            },
            maintenanceMode: Boolean(updated.maintenance?.active ?? updated.maintenanceMode)
        };

        res.status(200).json({ message: 'System settings updated successfully!', config: systemConfigCache });
    } catch (err) {
        console.error('System config update error:', err);
        res.status(500).json({ error: 'Failed to update system settings.' });
    }
});

// --- PRIVATE FRIEND GROUPS ROUTES ---

// 1. Get my joined groups
app.get('/api/groups/my-groups', authenticateUser, async (req, res) => {
    try {
        const username = req.user.username;
        const groups = await Group.find({
            members: username,
            deleted: { $ne: true }
        }).sort({ createdAt: -1 }).lean();

        const formatted = groups.map(g => ({
            name: g.name,
            code: g.code,
            owner: g.owner,
            isOwner: g.owner === username,
            membersCount: g.members ? g.members.length : 1,
            createdAt: g.createdAt
        }));

        res.status(200).json({ groups: formatted });
    } catch (err) {
        console.error('Get my groups error:', err);
        res.status(500).json({ error: 'Failed to fetch user groups.' });
    }
});

// 2. Check code availability
app.post('/api/groups/check-code', authenticateUser, async (req, res) => {
    try {
        const code = (req.body.code || '').trim().toUpperCase();
        if (!code || !/^[A-Z]{3}-[0-9]{3}$/.test(code)) {
            return res.status(400).json({ error: 'Invalid code format. Must be 3 letters, a hyphen, and 3 digits.' });
        }
        const existing = await Group.findOne({ code, deleted: { $ne: true } }).lean();
        res.status(200).json({ code, available: !existing });
    } catch (err) {
        res.status(500).json({ error: 'Failed to verify code.' });
    }
});

// 3. Create a group (User can own max 1 active group)
app.post('/api/groups', authenticateUser, async (req, res) => {
    try {
        const username = req.user.username;
        const name = (req.body.name || '').trim();
        const prefix = (req.body.prefix || '').trim().toUpperCase();
        const suffix = (req.body.suffix || '').trim();

        if (!name || name.length > 40) {
            return res.status(400).json({ error: 'Group name must be between 1 and 40 characters.' });
        }
        if (!/^[A-Z]{3}$/.test(prefix)) {
            return res.status(400).json({ error: 'Prefix must be exactly 3 uppercase letters (A-Z).' });
        }
        if (!/^[0-9]{3}$/.test(suffix)) {
            return res.status(400).json({ error: 'Suffix must be exactly 3 digits (0-9).' });
        }

        // Check if user already owns an active group
        const alreadyOwns = await Group.findOne({ owner: username, deleted: { $ne: true } }).lean();
        if (alreadyOwns) {
            return res.status(400).json({
                error: `You are already the owner of "${alreadyOwns.name}" (#${alreadyOwns.code}). You can only own 1 group at a time.`
            });
        }

        const code = `${prefix}-${suffix}`;
        const existingCode = await Group.findOne({ code, deleted: { $ne: true } }).lean();
        if (existingCode) {
            return res.status(409).json({ error: `Invite code #${code} is already taken. Please reroll numbers!` });
        }

        const newGroup = new Group({
            name,
            code,
            owner: username,
            members: [username], // Owner is automatically a member
            deleted: false
        });
        await newGroup.save();

        res.status(201).json({
            message: `Group "${name}" created successfully!`,
            group: {
                name: newGroup.name,
                code: newGroup.code,
                owner: newGroup.owner,
                isOwner: true,
                membersCount: 1
            }
        });
    } catch (err) {
        console.error('Create group error:', err);
        res.status(500).json({ error: 'Failed to create group.' });
    }
});

// 4. Join a group by code
app.post('/api/groups/join', authenticateUser, async (req, res) => {
    try {
        const username = req.user.username;
        const code = (req.body.code || '').trim().toUpperCase();
        if (!code) {
            return res.status(400).json({ error: 'Please enter a group invite code.' });
        }

        const group = await Group.findOne({ code, deleted: { $ne: true } });
        if (!group) {
            return res.status(404).json({ error: `No active group found with code #${code}. Please check the code.` });
        }

        if (group.members.includes(username)) {
            return res.status(400).json({ error: `You are already a member of "${group.name}".` });
        }

        group.members.push(username);
        group.updatedAt = new Date();
        await group.save();

        res.status(200).json({
            message: `Successfully joined "${group.name}"!`,
            group: {
                name: group.name,
                code: group.code,
                owner: group.owner,
                isOwner: group.owner === username,
                membersCount: group.members.length
            }
        });
    } catch (err) {
        console.error('Join group error:', err);
        res.status(500).json({ error: 'Failed to join group.' });
    }
});

// 5. Leave a group
app.post('/api/groups/leave', authenticateUser, async (req, res) => {
    try {
        const username = req.user.username;
        const code = (req.body.code || '').trim().toUpperCase();
        const group = await Group.findOne({ code, deleted: { $ne: true } });
        if (!group) return res.status(404).json({ error: 'Group not found.' });

        if (group.owner === username) {
            return res.status(400).json({ error: 'As the group owner, you cannot leave your group. You can delete it in Group Settings.' });
        }

        group.members = group.members.filter(m => m !== username);
        group.updatedAt = new Date();
        await group.save();

        res.status(200).json({ message: `Left "${group.name}".` });
    } catch (err) {
        console.error('Leave group error:', err);
        res.status(500).json({ error: 'Failed to leave group.' });
    }
});

// 6. Update group name (owner only)
app.put('/api/groups/:code', authenticateUser, async (req, res) => {
    try {
        const username = req.user.username;
        const code = req.params.code.trim().toUpperCase();
        const name = (req.body.name || '').trim();

        if (!name || name.length > 40) {
            return res.status(400).json({ error: 'Group name must be between 1 and 40 characters.' });
        }

        const group = await Group.findOne({ code, deleted: { $ne: true } });
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        if (group.owner !== username) {
            return res.status(403).json({ error: 'Only the group owner can change the group name.' });
        }

        group.name = name;
        group.updatedAt = new Date();
        await group.save();

        res.status(200).json({ message: 'Group name updated successfully!', group: { name: group.name, code: group.code } });
    } catch (err) {
        console.error('Update group error:', err);
        res.status(500).json({ error: 'Failed to update group.' });
    }
});

// 7. Delete group (soft delete, owner only)
app.delete('/api/groups/:code', authenticateUser, async (req, res) => {
    try {
        const username = req.user.username;
        const code = req.params.code.trim().toUpperCase();

        const group = await Group.findOne({ code });
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        if (group.owner !== username) {
            return res.status(403).json({ error: 'Only the group owner can delete this group.' });
        }

        group.deleted = true;
        group.updatedAt = new Date();
        await group.save();

        res.status(200).json({ message: `Group "${group.name}" was deleted.` });
    } catch (err) {
        console.error('Delete group error:', err);
        res.status(500).json({ error: 'Failed to delete group.' });
    }
});

// 8. Group Leaderboard & Analytics
app.get('/api/groups/:code/leaderboard', authenticateUser, async (req, res) => {
    try {
        const username = req.user.username;
        const code = req.params.code.trim().toUpperCase();

        const group = await Group.findOne({ code, deleted: { $ne: true } }).lean();
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        if (!group.members.includes(username)) {
            return res.status(403).json({ error: 'You are not a member of this group.' });
        }

        const today = getCSTDate();
        const yesterday = getCSTDate(-1);
        const members = group.members || [];

        // 1. Today's group scores (Ordered by fewest tries, then earliest completion time)
        const rawTodayScores = await Score.aggregate([
            { $match: { date: today, username: { $in: members } } },
            { $sort: { tries: 1, _id: 1 } },
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
                    trackerUsed: { $ifNull: ['$trackerUsed', false] },
                    avatar: { $ifNull: [{ $arrayElemAt: ['$userDoc.avatar', 0] }, 'default'] }
                }
            }
        ]);

        const todayScores = rawTodayScores.map(s => {
            let completedDate = null;
            try {
                completedDate = s._id ? new mongoose.Types.ObjectId(s._id).getTimestamp() : new Date();
            } catch (e) {
                completedDate = new Date();
            }
            const timeFormatted = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/Chicago',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            }).format(completedDate);

            return {
                _id: s._id,
                username: s.username,
                tries: s.tries,
                date: s.date,
                trackerUsed: s.trackerUsed,
                avatar: s.avatar,
                timeFormatted: `${timeFormatted} CST`
            };
        });

        // 2. Member Performance Stats (Win streaks & Average tries)
        const memberScores = await Score.find({ username: { $in: members } })
            .select('username date tries _id')
            .lean();

        const userDocs = await User.find({ username: { $in: members } })
            .select('username avatar')
            .lean();
        const avatarMap = {};
        userDocs.forEach(u => { avatarMap[u.username] = u.avatar || 'default'; });

        const scoresByMember = {};
        members.forEach(m => { scoresByMember[m] = []; });
        memberScores.forEach(s => {
            if (scoresByMember[s.username]) {
                scoresByMember[s.username].push(s);
            }
        });

        const memberStats = members.map(m => {
            const list = scoresByMember[m] || [];
            const totalSolves = list.length;
            const avgTries = totalSolves > 0
                ? Number((list.reduce((acc, s) => acc + s.tries, 0) / totalSolves).toFixed(2))
                : null;

            // Compute current win streak (consecutive daily solves)
            const dateSet = new Set(list.map(s => s.date));
            let streak = 0;
            let offset = 0;

            if (dateSet.has(today)) {
                streak = 1;
                offset = 1;
            } else if (dateSet.has(yesterday)) {
                streak = 1;
                offset = 2;
            }

            if (streak > 0) {
                while (true) {
                    const prevDate = getCSTDate(-offset);
                    if (dateSet.has(prevDate)) {
                        streak++;
                        offset++;
                    } else {
                        break;
                    }
                }
            }

            return {
                username: m,
                avatar: avatarMap[m] || 'default',
                streak,
                avgTries,
                totalSolves
            };
        });

        // 3. Activity Feed (Chat-style recent solves)
        const recentScoreDocs = await Score.find({ username: { $in: members } })
            .sort({ _id: -1 })
            .limit(25)
            .lean();

        const recentActivity = recentScoreDocs.map(s => {
            let completedDate = null;
            try {
                completedDate = s._id ? new mongoose.Types.ObjectId(s._id).getTimestamp() : new Date();
            } catch (e) {
                completedDate = new Date();
            }

            const timeStr = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/Chicago',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            }).format(completedDate);

            let timeFormatted = '';
            if (s.date === today) {
                timeFormatted = `Today at ${timeStr} CST`;
            } else if (s.date === yesterday) {
                timeFormatted = `Yesterday at ${timeStr} CST`;
            } else {
                timeFormatted = `${s.date} • ${timeStr} CST`;
            }

            let messageText = '';
            if (s.date === today) {
                messageText = `solved today's card in ${s.tries} ${s.tries === 1 ? 'try' : 'tries'}!`;
            } else if (s.date === yesterday) {
                messageText = `solved yesterday's card in ${s.tries} ${s.tries === 1 ? 'try' : 'tries'}!`;
            } else {
                messageText = `solved the ${s.date} card in ${s.tries} ${s.tries === 1 ? 'try' : 'tries'}!`;
            }

            return {
                _id: s._id,
                username: s.username,
                avatar: avatarMap[s.username] || 'default',
                date: s.date,
                tries: s.tries,
                trackerUsed: !!s.trackerUsed,
                timeFormatted,
                messageText
            };
        });

        res.status(200).json({
            group: {
                name: group.name,
                code: group.code,
                owner: group.owner,
                isOwner: group.owner === username,
                membersCount: members.length
            },
            todayScores,
            memberStats,
            recentActivity
        });
    } catch (err) {
        console.error('Group leaderboard error:', err);
        res.status(500).json({ error: 'Failed to fetch group leaderboard.' });
    }
});

// --- MULTI-SERVER DISCORD WEBHOOK ROUTES ---

function buildDiscordComponentMessage(type, wh, sampleData = null) {
    const date = sampleData?.date || getCSTDate();
    const yesterdayDate = sampleData?.yesterdayDate || getCSTDate(-1);
    const yesterdayCardRaw = sampleData?.yesterdayCard || 'Elsa - Spirit of Winter';
    const cardDisplay = wh.spoilerProtection ? `||${yesterdayCardRaw}||` : yesterdayCardRaw;
    const winner = sampleData?.winner || 'IllumineerHero';
    const winnerTries = sampleData?.winnerTries || 3;
    const winnerTriesText = Number(winnerTries) === 1 ? 'try' : 'tries';
    const username = sampleData?.username || 'IllumineerHero';
    const tries = sampleData?.tries || 3;
    const triesText = Number(tries) === 1 ? 'try' : 'tries';
    const tracker = sampleData?.tracker || '';
    const grid = sampleData?.grid || '1️⃣ 🟨 🟥 🟩 🟩 🟩 🟩 🟩\n2️⃣ 🟩 🟩 🟩 🟩 🟩 🟩 🟩';

    if (type === 'completion') {
        const tpl = wh.templateCompletion && wh.templateCompletion.trim()
            ? wh.templateCompletion
            : `🚨 **{username}**{tracker} completed today's Loredle in **{tries}** {triesText}!\n{grid}`;
        return tpl
            .replace(/{username}/g, username)
            .replace(/{tries}/g, String(tries))
            .replace(/{triesText}/g, triesText)
            .replace(/{tracker}/g, tracker)
            .replace(/{grid}/g, grid)
            .replace(/{date}/g, date);
    }

    if (type === 'dailyDrop') {
        const tpl = wh.templateDailyDrop && wh.templateDailyDrop.trim()
            ? wh.templateDailyDrop
            : `✨ **A new Loredle daily puzzle is LIVE for {date}!**\nTest your Lorcana knowledge at <https://loredle.com>`;
        return tpl
            .replace(/{date}/g, date)
            .replace(/{url}/g, 'https://loredle.com');
    }

    if (type === 'yesterdayRecap') {
        const tpl = wh.templateYesterdayRecap && wh.templateYesterdayRecap.trim()
            ? wh.templateYesterdayRecap
            : `📜 **Yesterday's Card ({yesterdayDate}):** {yesterdayCard}`;
        return tpl
            .replace(/{yesterdayDate}/g, yesterdayDate)
            .replace(/{yesterdayCard}/g, cardDisplay);
    }

    if (type === 'winnerShoutout') {
        const tpl = wh.templateWinnerShoutout && wh.templateWinnerShoutout.trim()
            ? wh.templateWinnerShoutout
            : `🏆 **Yesterday's #1 Winner:** **{winner}** (solved in {winnerTries} {winnerTriesText})!`;
        return tpl
            .replace(/{winner}/g, winner)
            .replace(/{winnerTries}/g, String(winnerTries))
            .replace(/{winnerTriesText}/g, winnerTriesText)
            .replace(/{yesterdayDate}/g, yesterdayDate);
    }

    return '';
}

app.get('/api/admin/discord-webhooks', isAdmin, async (req, res) => {
    try {
        await initDefaultDiscordWebhook();
        const webhooks = await DiscordWebhook.find().sort({ createdAt: 1 }).lean();
        // Map property synonyms so frontend receives both standard keys
        const mapped = webhooks.map(w => ({
            ...w,
            webhookUrl: w.url,
            rolePing: w.pingRole,
            sendDailyDrop: w.announceNewPuzzle,
            sendYesterdayRecap: w.includeYesterdayRecap,
            sendWinnerShoutout: w.announceWinner,
            sendSpoilerProtection: w.spoilerProtection,
            templateCompletion: w.templateCompletion || '',
            templateDailyDrop: w.templateDailyDrop || '',
            templateYesterdayRecap: w.templateYesterdayRecap || '',
            templateWinnerShoutout: w.templateWinnerShoutout || ''
        }));
        res.status(200).json({ webhooks: mapped });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch Discord webhooks.' });
    }
});

app.post('/api/admin/discord-webhooks', isAdmin, async (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        const url = (req.body.url || req.body.webhookUrl || '').trim();
        const pingRole = (req.body.pingRole || req.body.rolePing || '').trim();
        const customMessage = (req.body.customMessage || '').trim();
        const enabled = req.body.enabled !== undefined ? !!req.body.enabled : true;

        const sendScoreCompletions = req.body.sendScoreCompletions !== undefined ? !!req.body.sendScoreCompletions : false;
        const announceNewPuzzle = req.body.announceNewPuzzle !== undefined ? !!req.body.announceNewPuzzle : !!req.body.sendDailyDrop;
        const includeYesterdayRecap = req.body.includeYesterdayRecap !== undefined ? !!req.body.includeYesterdayRecap : !!req.body.sendYesterdayRecap;
        const announceWinner = req.body.announceWinner !== undefined ? !!req.body.announceWinner : !!req.body.sendWinnerShoutout;
        const spoilerProtection = req.body.spoilerProtection !== undefined ? !!req.body.spoilerProtection : (req.body.sendSpoilerProtection !== undefined ? !!req.body.sendSpoilerProtection : true);

        const templateCompletion = (req.body.templateCompletion || '').trim();
        const templateDailyDrop = (req.body.templateDailyDrop || '').trim();
        const templateYesterdayRecap = (req.body.templateYesterdayRecap || '').trim();
        const templateWinnerShoutout = (req.body.templateWinnerShoutout || '').trim();

        if (!name || !url) {
            return res.status(400).json({ error: 'Server Name and Webhook URL are required.' });
        }
        if (!url.startsWith('https://discord.com/api/webhooks/') && !url.startsWith('https://discordapp.com/api/webhooks/')) {
            return res.status(400).json({ error: 'Invalid Discord Webhook URL.' });
        }

        const newWebhook = new DiscordWebhook({
            name,
            url,
            enabled,
            sendScoreCompletions,
            announceNewPuzzle,
            includeYesterdayRecap,
            announceWinner,
            spoilerProtection,
            pingRole,
            customMessage,
            templateCompletion,
            templateDailyDrop,
            templateYesterdayRecap,
            templateWinnerShoutout
        });
        await newWebhook.save();

        res.status(201).json({ message: 'Discord webhook added successfully!', webhook: newWebhook });
    } catch (err) {
        console.error('Create webhook error:', err);
        res.status(500).json({ error: 'Failed to create Discord webhook.' });
    }
});

app.put('/api/admin/discord-webhooks/:id', isAdmin, async (req, res) => {
    try {
        const webhook = await DiscordWebhook.findById(req.params.id);
        if (!webhook) return res.status(404).json({ error: 'Discord webhook not found.' });

        if (req.body.name) webhook.name = req.body.name.trim();

        const newUrl = (req.body.url || req.body.webhookUrl || '').trim();
        if (newUrl) {
            if (!newUrl.startsWith('https://discord.com/api/webhooks/') && !newUrl.startsWith('https://discordapp.com/api/webhooks/')) {
                return res.status(400).json({ error: 'Invalid Discord Webhook URL.' });
            }
            webhook.url = newUrl;
        }

        if (req.body.enabled !== undefined) webhook.enabled = !!req.body.enabled;
        if (req.body.sendScoreCompletions !== undefined) webhook.sendScoreCompletions = !!req.body.sendScoreCompletions;

        if (req.body.announceNewPuzzle !== undefined) webhook.announceNewPuzzle = !!req.body.announceNewPuzzle;
        else if (req.body.sendDailyDrop !== undefined) webhook.announceNewPuzzle = !!req.body.sendDailyDrop;

        if (req.body.includeYesterdayRecap !== undefined) webhook.includeYesterdayRecap = !!req.body.includeYesterdayRecap;
        else if (req.body.sendYesterdayRecap !== undefined) webhook.includeYesterdayRecap = !!req.body.sendYesterdayRecap;

        if (req.body.announceWinner !== undefined) webhook.announceWinner = !!req.body.announceWinner;
        else if (req.body.sendWinnerShoutout !== undefined) webhook.announceWinner = !!req.body.sendWinnerShoutout;

        if (req.body.spoilerProtection !== undefined) webhook.spoilerProtection = !!req.body.spoilerProtection;
        else if (req.body.sendSpoilerProtection !== undefined) webhook.spoilerProtection = !!req.body.sendSpoilerProtection;

        const newRole = req.body.pingRole !== undefined ? req.body.pingRole : req.body.rolePing;
        if (newRole !== undefined) webhook.pingRole = (newRole || '').trim();

        if (req.body.customMessage !== undefined) webhook.customMessage = req.body.customMessage.trim();
        if (req.body.templateCompletion !== undefined) webhook.templateCompletion = req.body.templateCompletion.trim();
        if (req.body.templateDailyDrop !== undefined) webhook.templateDailyDrop = req.body.templateDailyDrop.trim();
        if (req.body.templateYesterdayRecap !== undefined) webhook.templateYesterdayRecap = req.body.templateYesterdayRecap.trim();
        if (req.body.templateWinnerShoutout !== undefined) webhook.templateWinnerShoutout = req.body.templateWinnerShoutout.trim();

        webhook.updatedAt = new Date();

        await webhook.save();
        res.status(200).json({ message: 'Webhook updated successfully!', webhook });
    } catch (err) {
        console.error('Update webhook error:', err);
        res.status(500).json({ error: 'Failed to update Discord webhook.' });
    }
});

app.post('/api/admin/discord-webhooks/:id/test-message', isAdmin, async (req, res) => {
    try {
        const webhook = await DiscordWebhook.findById(req.params.id);
        if (!webhook) return res.status(404).json({ error: 'Webhook not found.' });

        const { messageType } = req.body;
        if (!['completion', 'dailyDrop', 'yesterdayRecap', 'winnerShoutout'].includes(messageType)) {
            return res.status(400).json({ error: 'Invalid message type.' });
        }

        const formattedBody = buildDiscordComponentMessage(messageType, webhook, {
            date: getCSTDate(),
            yesterdayDate: getCSTDate(-1),
            yesterdayCard: 'Elsa - Spirit of Winter',
            winner: 'IllumineerTopRank',
            winnerTries: 2,
            username: 'TestPlayer',
            tries: 3,
            tracker: ' (🔎 Card Tracker)',
            grid: '1️⃣ 🟨 🟥 🟨 🟩 🟩 🟩 🟩\n2️⃣ 🟩 🟩 🟩 🟩 🟩 🟩 🟩'
        });

        const pingText = webhook.pingRole
            ? (webhook.pingRole.startsWith('<@') ? `${webhook.pingRole} ` : `<@&${webhook.pingRole}> `)
            : '';

        const resp = await fetch(webhook.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: `${pingText}${formattedBody}` })
        });

        if (!resp.ok) {
            return res.status(502).json({ error: `Discord returned HTTP ${resp.status}` });
        }

        res.status(200).json({ message: `Test message for "${messageType}" sent successfully to "${webhook.name}"!` });
    } catch (err) {
        console.error('Test component message error:', err);
        res.status(500).json({ error: 'Failed to send test message to Discord.' });
    }
});

app.delete('/api/admin/discord-webhooks/:id', isAdmin, async (req, res) => {
    try {
        const deleted = await DiscordWebhook.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Webhook not found.' });
        res.status(200).json({ message: `Webhook "${deleted.name}" removed.` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete webhook.' });
    }
});

app.post('/api/admin/discord-webhooks/:id/test', isAdmin, async (req, res) => {
    try {
        const webhook = await DiscordWebhook.findById(req.params.id);
        if (!webhook) return res.status(404).json({ error: 'Webhook not found.' });

        const testContent = webhook.pingRole
            ? `${webhook.pingRole} 🟣 **Rules of Villainy — Loredle Test Ping**\nServer: **${webhook.name}** — Webhook is active and receiving messages! 🐉🔥`
            : `🟣 **Rules of Villainy — Loredle Test Ping**\nServer: **${webhook.name}** — Webhook is active and receiving messages! 🐉🔥`;

        const resp = await fetch(webhook.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: testContent })
        });

        if (!resp.ok) {
            return res.status(502).json({ error: `Discord returned HTTP ${resp.status}` });
        }
        res.status(200).json({ message: `Test ping delivered to "${webhook.name}"!` });
    } catch (err) {
        console.error('Webhook test error:', err);
        res.status(500).json({ error: 'Webhook test delivery failed.' });
    }
});

// --- MIDNIGHT CST AUTOMATED BROADCAST JOB ---
let lastBroadcastCstDate = getCSTDate();
setInterval(async () => {
    try {
        const currentCstDate = getCSTDate();
        if (currentCstDate === lastBroadcastCstDate) return;

        console.log(`Midnight CST rollover detected: ${lastBroadcastCstDate} -> ${currentCstDate}`);
        const yesterdayDate = lastBroadcastCstDate;
        lastBroadcastCstDate = currentCstDate;

        // Ensure today's card is locked
        await getOrLockDailyTargetCard(currentCstDate, true);

        // Fetch all active webhooks
        const webhooks = await DiscordWebhook.find({ enabled: true }).lean();
        if (webhooks.length === 0) return;

        // Fetch yesterday's card answer and winner
        const yesterdayAnswer = await AnswerLog.findOne({ date: yesterdayDate }).lean();
        const yesterdayCardName = yesterdayAnswer ? yesterdayAnswer.targetCard : 'Unknown Card';

        const yesterdayWinner = await Score.findOne({ date: yesterdayDate }).sort({ tries: 1, _id: 1 }).lean();
        const winnerName = yesterdayWinner ? yesterdayWinner.username : 'None';
        const winnerTries = yesterdayWinner ? yesterdayWinner.tries : 0;

        for (const wh of webhooks) {
            // Only send if at least one midnight broadcast component is enabled
            if (!wh.announceNewPuzzle && !wh.includeYesterdayRecap && !wh.announceWinner) continue;

            const broadcastData = {
                date: currentCstDate,
                yesterdayDate,
                yesterdayCard: yesterdayCardName,
                winner: winnerName,
                winnerTries,
                url: 'https://loredle.com'
            };

            let parts = [];
            if (wh.pingRole) {
                const roleMention = wh.pingRole.startsWith('<@') ? wh.pingRole : `<@&${wh.pingRole}>`;
                parts.push(roleMention);
            }

            if (wh.announceNewPuzzle) {
                parts.push(buildDiscordComponentMessage('dailyDrop', wh, broadcastData));
            }
            if (wh.includeYesterdayRecap) {
                parts.push(buildDiscordComponentMessage('yesterdayRecap', wh, broadcastData));
            }
            if (wh.announceWinner && yesterdayWinner) {
                parts.push(buildDiscordComponentMessage('winnerShoutout', wh, broadcastData));
            }

            if (parts.length > 0) {
                fetch(wh.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: parts.join('\n\n') })
                }).catch(e => console.error(`Midnight broadcast failed for "${wh.name}":`, e));
            }
        }
    } catch (broadcastErr) {
        console.error('Midnight broadcast scheduler error:', broadcastErr);
    }
}, 30000); // Check every 30 seconds

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server sprinting on port ${PORT}`);
});
