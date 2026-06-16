const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- MONGODB CONNECTION ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to Database'))
    .catch(err => console.error('Database connection error:', err));

// --- DATABASE SCHEMAS ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    avatar: { type: String, default: 'default' }
});
const User = mongoose.model('User', userSchema);

const scoreSchema = new mongoose.Schema({
    username: { type: String, required: true },
    date: { type: String, required: true },
    tries: { type: Number, required: true },
    targetCard: { type: String },
    guesses: { type: [String] }
});
const Score = mongoose.model('Score', scoreSchema);

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

        res.status(201).json({ message: 'Registration successful!', avatar: newUser.avatar });
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

        res.status(200).json({ message: 'Login successful!', avatar: user.avatar });
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

// Settings: Update Avatar
app.put('/api/user/avatar', async (req, res) => {
    try {
        const { username, avatar } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: 'User not found.' });

        user.avatar = avatar;
        await user.save();
        res.status(200).json({ message: 'Avatar updated!', avatar: user.avatar });
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

            const newScore = new Score({ username, date: today, tries, targetCard, guesses });
            await newScore.save();
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server sprinting on port ${PORT}`);
});