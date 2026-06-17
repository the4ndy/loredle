const mongoose = require('mongoose');
require('dotenv').config();

// Fix fetch for older Node versions if needed, though native fetch should be available in Node 18+
const fetch = global.fetch || require('node-fetch');

const answerLogSchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true },
    targetCard: { type: String, required: true }
});
const AnswerLog = mongoose.model('AnswerLog', answerLogSchema);

const scoreSchema = new mongoose.Schema({
    username: { type: String, required: true },
    date: { type: String, required: true },
    tries: { type: Number, required: true },
    guesses: { type: [String] }
});
const Score = mongoose.model('Score', scoreSchema);

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        console.log('Fetching cards from Lorcast API...');
        const res = await fetch('https://api.lorcast.com/v0/cards/search?q=""');
        const data = await res.json();
        const cards = data.results.map(card => ({
            name: card.version ? `${card.name} - ${card.version}` : card.name
        }));
        cards.sort((a, b) => a.name.localeCompare(b.name));
        console.log(`Loaded ${cards.length} cards.`);

        const scores = await Score.find().lean();
        const uniqueDates = [...new Set(scores.map(s => s.date))];
        console.log(`Found ${uniqueDates.length} unique dates in history.`);

        let added = 0;
        for (const dateStr of uniqueDates) {
            const existing = await AnswerLog.findOne({ date: dateStr });
            if (existing) continue;

            let h = 0xdeadbeef;
            for(let i = 0; i < dateStr.length; i++) {
                h = Math.imul(h ^ dateStr.charCodeAt(i), 2654435761);
            }
            h = (h ^ h >>> 16) >>> 0;
            
            let a = h;
            a |= 0; a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            const rand = ((t ^ t >>> 14) >>> 0) / 4294967296;

            const index = Math.floor(rand * cards.length);
            const targetCard = cards[index].name;

            const newAnswer = new AnswerLog({ date: dateStr, targetCard });
            await newAnswer.save();
            added++;
            console.log(`Added ${dateStr}: ${targetCard}`);
        }

        console.log(`Done. Added ${added} historical answers.`);
        process.exit(0);
    } catch (e) {
        console.error('Error during backfill:', e);
        process.exit(1);
    }
}

run();
