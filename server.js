// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to Database (MongoDB Atlas URL will go in Render environment variables)
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("Connected to Loredle Database"))
    .catch(err => console.error("Database connection error:", err));

// --- SCHEMAS ---
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true, lowercase: true, trim: true },
    password: { type: String, required: true }
});

const scoreSchema = new mongoose.Schema({
    username: { type: String, required: true },
    date: { type: String, required: true }, // Format: YYYY-MM-DD
    tries: { type: Number, required: true }
});

const User = mongoose.model('User', userSchema);
const Score = mongoose.model('Score', scoreSchema);

// --- AUTHENTICATION ROUTES ---
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ error: "Username already taken." });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();

        // If this next line fails, it usually means process.env.JWT_SECRET is undefined
        const token = jwt.sign({ username: newUser.username }, process.env.JWT_SECRET);
        res.status(201).json({ token, username: newUser.username });
    } catch (err) {
        console.error("Registration Crash Details:", err); // <-- Added this to expose the exact issue in the console
        res.status(500).json({ error: "Error creating account. Check server console." });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ error: "Invalid username or password." });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Invalid username or password." });

        const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET);
        res.json({ token, username: user.username });
    } catch (err) {
        res.status(500).json({ error: "Login failed." });
    }
});

// --- LEADERBOARD ROUTES ---
app.post('/api/submit-score', async (req, res) => {
    try {
        const { username, tries } = req.body;
        const today = new Date().toISOString().split('T')[0]; // Current date YYYY-MM-DD

        // Prevent duplicate daily entries
        const existingScore = await Score.findOne({ username, date: today });
        if (existingScore) return res.status(400).json({ error: "You already submitted today's score!" });

        const newScore = new Score({ username, date: today, tries });
        await newScore.save();
        res.status(201).json({ message: "Score saved successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Failed to save score." });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        // Fetch today's scores, sorted by lowest number of tries first
        const dailyScores = await Score.find({ date: today }).sort({ tries: 1 }).limit(100);
        res.json(dailyScores);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch leaderboard." });
    }
});

// Fallback to serve index.html for main routes
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server sprinting on port ${PORT}`));