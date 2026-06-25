const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { BetaAnalyticsDataClient } = require('@google-analytics/data');

const analyticsDataClient = new BetaAnalyticsDataClient();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- MONGODB CONNECTION & MIGRATION ---
mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('Connected to Database');
        
        // Admin Migration Check
        const adminUser = await User.findOne({ username: 'rov_andy' });
        if (adminUser && adminUser.role !== 'admin') {
            adminUser.role = 'admin';
            await adminUser.save();
            console.log('Migrated rov_andy to admin role.');
        } else if (!adminUser) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            const newAdmin = new User({ username: 'rov_andy', password: hashedPassword, role: 'admin' });
            await newAdmin.save();
            console.log('Created rov_andy admin account.');
        }
    })
    .catch(err => console.error('Database connection error:', err));

// --- DATABASE SCHEMAS ---
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
    guesses: { type: [String] }
});
const Score = mongoose.model('Score', scoreSchema);

const answerLogSchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true },
    targetCard: { type: String, required: true }
});
const AnswerLog = mongoose.model('AnswerLog', answerLogSchema);

// UPDATED: Arcade Score Schema (Uses emojis instead of initials)
const arcadeScoreSchema = new mongoose.Schema({
    emojis: { type: String, required: true },
    score: { type: Number, required: true },
    date: { type: Date, default: Date.now }
});
const ArcadeScore = mongoose.model('ArcadeScore', arcadeScoreSchema);


// --- HELPER FUNCTION: GET CST DATE ---
function getCSTDate() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Chicago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
}

// --- ROUTES ---

// Auth: Register
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ error: 'Username already taken.' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();

        const token = jwt.sign({ username: newUser.username, role: newUser.role }, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.status(201).json({ 
            message: 'Registration successful!', 
            avatar: newUser.avatar, 
            theme: newUser.theme,
            token: token
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error during registration.' });
    }
});

// Auth: Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ error: 'User not found.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid password.' });

        const token = jwt.sign({ username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.status(200).json({ 
            message: 'Login successful!', 
            avatar: user.avatar, 
            theme: user.theme,
            role: user.role,
            token: token
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// Hub: Get Global Daily Loredle Leaderboard
app.get('/api/leaderboard', async (req, res) => {
    try {
        const today = getCSTDate();
        const scores = await Score.find({ date: today }).sort({ tries: 1 }).limit(10).lean();

        for (let score of scores) {
            const user = await User.findOne({ username: score.username }).lean();
            score.avatar = user ? user.avatar : 'default';
        }

        res.status(200).json(scores);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch leaderboard.' });
    }
});

// Settings: Change Password
app.put('/api/user/change-password', async (req, res) => {
    try {
        const { username, currentPassword, newPassword } = req.body;
        const user = await User.findOne({ username });
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

// Settings: Update Preferences (Avatar & Theme)
app.put('/api/user/preferences', async (req, res) => {
    try {
        const { username, avatar, theme } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: 'User not found.' });

        if (avatar) user.avatar = avatar;
        if (theme) user.theme = theme;
        await user.save();
        res.status(200).json({ message: 'Preferences updated!', avatar: user.avatar, theme: user.theme });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});


// Settings: Get User Detailed History
app.get('/api/user/detailed-history/:username', async (req, res) => {
    try {
        const scores = await Score.find({ username: req.params.username }).sort({ date: -1 }).lean();
        
        for (let score of scores) {
            const dailyScores = await Score.find({ date: score.date }).sort({ tries: 1, _id: 1 }).lean();
            const rank = dailyScores.findIndex(s => s._id.toString() === score._id.toString()) + 1;
            score.rank = rank;
        }
        res.status(200).json(scores);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch detailed history.' });
    }
});

// Gameplay: Submit Loredle Score
app.post('/api/submit-score', async (req, res) => {
    try {
        const { username, tries, shareText, targetCard, guesses } = req.body;
        const today = getCSTDate();

        const isAnonymous = !username || username === 'Anonymous User';
        const displayUsername = isAnonymous ? 'Anonymous User' : username;

        if (!isAnonymous) {
            const existingScore = await Score.findOne({ username, date: today });
            if (existingScore) return res.status(400).json({ error: "You already submitted today's score!" });

            const newScore = new Score({ username, date: today, tries, guesses });
            await newScore.save();
        }

        if (targetCard) {
            const existingAnswer = await AnswerLog.findOne({ date: today });
            if (!existingAnswer) {
                const newAnswer = new AnswerLog({ date: today, targetCard });
                await newAnswer.save();
            }
        }

        if (process.env.DISCORD_WEBHOOK_URL && shareText) {
            let emojiGrid = "";
            const lines = shareText.split('\n');
            const gridLines = lines.filter(line => line.includes('🟥') || line.includes('🟩') || line.includes('🟨'));
            emojiGrid = gridLines.join('\n');

            fetch(process.env.DISCORD_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: `🚨 **${displayUsername}** completed today's Loredle!\n${emojiGrid}`
                })
            }).catch(err => console.error("Discord Webhook Failed:", err));
        }

        res.status(201).json({ message: "Score processed successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Failed to process score." });
    }
});

// Hub: Get Hall Of Fame
app.get('/api/hall-of-fame', async (req, res) => {
    try {
        const dailyWinners = await Score.aggregate([
            { $sort: { date: -1, tries: 1, _id: 1 } },
            {
                $group: {
                    _id: "$date",
                    username: { $first: "$username" },
                    tries: { $first: "$tries" },
                    date: { $first: "$date" }
                }
            },
            { $sort: { date: -1 } }
        ]);

        for (let winner of dailyWinners) {
            const user = await User.findOne({ username: winner.username }).lean();
            winner.avatar = user ? user.avatar : 'default';
        }

        const winCounts = {};
        for (let winner of dailyWinners) {
            winCounts[winner.username] = (winCounts[winner.username] || 0) + 1;
        }

        const top5 = Object.entries(winCounts)
            .map(([username, count]) => ({ username, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        for (let t of top5) {
            const user = await User.findOne({ username: t.username }).lean();
            t.avatar = user ? user.avatar : 'default';
        }

        res.status(200).json({ top5, recentWinners: dailyWinners });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch hall of fame.' });
    }
});

// --- ARCADE ROUTES ---

// Submit Arcade Score
app.post('/api/arcade-score', async (req, res) => {
    try {
        const { emojis, score } = req.body;
        const newScore = new ArcadeScore({ emojis, score });
        await newScore.save();
        res.status(201).json({ message: "Arcade score saved!" });
    } catch (err) {
        res.status(500).json({ error: "Failed to save arcade score." });
    }
});

// Get Top 25 Arcade Leaderboard
app.get('/api/arcade-leaderboard', async (req, res) => {
    try {
        const scores = await ArcadeScore.find().sort({ score: -1, date: 1 }).limit(25);
        res.status(200).json(scores);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch arcade leaderboard." });
    }
});

// --- MIDDLEWARE: Admin Check ---
async function isAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(403).json({ error: 'Access denied.' });

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err || decoded.role !== 'admin') return res.status(403).json({ error: 'Access denied.' });
        req.adminUser = decoded;
        next();
    });
}

// --- FEEDBACK ROUTES ---
app.post('/api/feedback', async (req, res) => {
    try {
        const { name, type, text, anonymous } = req.body;
        const submitName = anonymous ? 'anonymous' : (name || 'anonymous');
        const newFeedback = new Feedback({ name: submitName, type, text });
        await newFeedback.save();
        res.status(201).json({ message: "Feedback submitted successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Failed to submit feedback." });
    }
});

// --- ADMIN API ROUTES ---
app.get('/api/admin/users', isAdmin, async (req, res) => {
    try {
        const users = await User.find({}, '-password').lean();
        res.status(200).json(users);
    } catch (err) { res.status(500).json({ error: "Failed" }); }
});
app.put('/api/admin/users/:id', isAdmin, async (req, res) => {
    try {
        const { username, role, theme, avatar, newPassword } = req.body;
        const updateData = { username, role, theme, avatar };
        if (newPassword) {
            updateData.password = await bcrypt.hash(newPassword, 10);
        }
        await User.findByIdAndUpdate(req.params.id, updateData);
        res.status(200).json({ message: "Updated" });
    } catch (err) { res.status(500).json({ error: "Failed" }); }
});
app.delete('/api/admin/users/:id', isAdmin, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Deleted" });
    } catch (err) { res.status(500).json({ error: "Failed" }); }
});

app.get('/api/admin/scores', isAdmin, async (req, res) => {
    try {
        const scores = await Score.find().lean();
        const answers = await AnswerLog.find().lean();
        const answerMap = {};
        answers.forEach(a => answerMap[a.date] = a.targetCard);
        
        scores.forEach(s => s.targetCard = answerMap[s.date] || 'Unknown');
        res.status(200).json(scores);
    } catch (err) { res.status(500).json({ error: "Failed" }); }
});
app.put('/api/admin/scores/:id', isAdmin, async (req, res) => {
    try {
        const { username, date, tries, guesses } = req.body;
        await Score.findByIdAndUpdate(req.params.id, { username, date, tries, guesses });
        res.status(200).json({ message: "Updated" });
    } catch (err) { res.status(500).json({ error: "Failed" }); }
});
app.delete('/api/admin/scores/:id', isAdmin, async (req, res) => {
    try {
        await Score.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Deleted" });
    } catch (err) { res.status(500).json({ error: "Failed" }); }
});

app.get('/api/admin/feedbacks', isAdmin, async (req, res) => {
    try {
        const feedbacks = await Feedback.find().sort({ date: -1 }).lean();
        res.status(200).json(feedbacks);
    } catch (err) { res.status(500).json({ error: "Failed" }); }
});
app.put('/api/admin/feedbacks/:id', isAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        await Feedback.findByIdAndUpdate(req.params.id, { status });
        res.status(200).json({ message: "Updated" });
    } catch (err) { res.status(500).json({ error: "Failed" }); }
});
app.post('/api/admin/feedbacks/:id/notes', isAdmin, async (req, res) => {
    try {
        const { text } = req.body;
        const feedback = await Feedback.findById(req.params.id);
        if (!feedback) return res.status(404).json({ error: "Not found" });
        
        feedback.notes.push({ author: req.adminUser.username, text });
        await feedback.save();
        res.status(201).json({ message: "Note added", notes: feedback.notes });
    } catch (err) { res.status(500).json({ error: "Failed" }); }
});
app.delete('/api/admin/feedbacks/:id', isAdmin, async (req, res) => {
    try {
        await Feedback.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Deleted" });
    } catch (err) { res.status(500).json({ error: "Failed" }); }
});

app.get('/api/admin/analytics', isAdmin, async (req, res) => {
    try {
        const users = await User.find().lean();
        const scores = await Score.find().lean();
        const feedbacks = await Feedback.find().lean();
        const answers = await AnswerLog.find().lean();

        const answerMap = {};
        answers.forEach(a => answerMap[a.date] = a.targetCard);

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
                    date: date,
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
    } catch (err) { res.status(500).json({ error: "Failed" }); }
});

app.get('/api/admin/ga-data', isAdmin, async (req, res) => {
    try {
        const propertyId = process.env.GA4_PROPERTY_ID;
        
        // 1. Realtime Active Users
        const [realtimeResponse] = await analyticsDataClient.runRealtimeReport({
            property: `properties/${propertyId}`,
            metrics: [{ name: 'activeUsers' }]
        });
        const activeUsers = realtimeResponse.rows && realtimeResponse.rows.length > 0 ? realtimeResponse.rows[0].metricValues[0].value : 0;

        // 2. Daily Metrics (last 30 days)
        const [dailyResponse] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'date' }],
            metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }],
            orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }]
        });
        const dailyData = (dailyResponse.rows || []).map(row => ({
            date: row.dimensionValues[0].value,
            sessions: parseInt(row.metricValues[0].value),
            users: parseInt(row.metricValues[1].value),
            pageviews: parseInt(row.metricValues[2].value)
        }));

        // 3. Top Pages
        const [pagesResponse] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'pagePath' }],
            metrics: [{ name: 'screenPageViews' }],
            orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
            limit: 10
        });
        const topPages = (pagesResponse.rows || []).map(row => ({
            path: row.dimensionValues[0].value,
            views: parseInt(row.metricValues[0].value)
        }));

        // 4. Device Category
        const [deviceResponse] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'deviceCategory' }],
            metrics: [{ name: 'sessions' }]
        });
        const devices = (deviceResponse.rows || []).map(row => ({
            category: row.dimensionValues[0].value,
            sessions: parseInt(row.metricValues[0].value)
        }));

        // 5. Traffic Sources
        const [sourceResponse] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'sessionSourceMedium' }],
            metrics: [{ name: 'sessions' }],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            limit: 10
        });
        const sources = (sourceResponse.rows || []).map(row => ({
            source: row.dimensionValues[0].value,
            sessions: parseInt(row.metricValues[0].value)
        }));

        // 6. Top Countries
        const [countryResponse] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'country' }],
            metrics: [{ name: 'sessions' }],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            limit: 10
        });
        const countries = (countryResponse.rows || []).map(row => ({
            country: row.dimensionValues[0].value,
            sessions: parseInt(row.metricValues[0].value)
        }));

        // 7. Overall Totals
        const [totalsResponse] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }]
        });
        const totals = totalsResponse.rows && totalsResponse.rows.length > 0 ? {
            sessions: totalsResponse.rows[0].metricValues[0].value,
            users: totalsResponse.rows[0].metricValues[1].value,
            pageviews: totalsResponse.rows[0].metricValues[2].value
        } : { sessions: 0, users: 0, pageviews: 0 };

        // 8. Engagement
        const [engagementResponse] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            metrics: [{ name: 'engagementRate' }, { name: 'bounceRate' }, { name: 'averageSessionDuration' }]
        });
        const engagement = engagementResponse.rows && engagementResponse.rows.length > 0 ? {
            engagementRate: parseFloat(engagementResponse.rows[0].metricValues[0].value).toFixed(2),
            bounceRate: parseFloat(engagementResponse.rows[0].metricValues[1].value).toFixed(2),
            averageSessionDuration: parseFloat(engagementResponse.rows[0].metricValues[2].value).toFixed(2)
        } : { engagementRate: 0, bounceRate: 0, averageSessionDuration: 0 };

        // 9. Top Events
        const [eventsResponse] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'eventName' }],
            metrics: [{ name: 'eventCount' }],
            orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
            limit: 10
        });
        const events = (eventsResponse.rows || []).map(row => ({
            eventName: row.dimensionValues[0].value,
            eventCount: parseInt(row.metricValues[0].value)
        }));

        // 10. OS Breakdown
        const [osResponse] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'operatingSystem' }],
            metrics: [{ name: 'sessions' }],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            limit: 10
        });
        const operatingSystems = (osResponse.rows || []).map(row => ({
            os: row.dimensionValues[0].value,
            sessions: parseInt(row.metricValues[0].value)
        }));

        // 11. Browser Breakdown
        const [browserResponse] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'browser' }],
            metrics: [{ name: 'sessions' }],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            limit: 10
        });
        const browsers = (browserResponse.rows || []).map(row => ({
            browser: row.dimensionValues[0].value,
            sessions: parseInt(row.metricValues[0].value)
        }));

        // 12. New vs Returning
        const [newRetResponse] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'newVsReturning' }],
            metrics: [{ name: 'sessions' }]
        });
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
        console.error("GA Data Error:", err);
        res.status(500).json({ error: "Failed to fetch GA data." });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server sprinting on port ${PORT}`);
});