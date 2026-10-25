const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CACHE_DIR = path.join(__dirname, 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'cards-cache.json');

const OFFICIAL_API_URL = 'https://cards.disneylorcana.com/api/cards/en';
const LORCAST_API_URL = 'https://api.lorcast.com/v0/cards/search?q=""';

const VALID_RARITIES = {
    COMMON: 'Common',
    UNCOMMON: 'Uncommon',
    RARE: 'Rare',
    SUPER: 'Super Rare',
    LEGENDARY: 'Legendary'
};

const SET_CODE_MAP = {
    set1: { code: 'TFC', order: 1, defaultName: 'The First Chapter' },
    set2: { code: 'ROTF', order: 2, defaultName: 'Rise of the Floodborn' },
    set3: { code: 'ITI', order: 3, defaultName: 'Into the Inklands' },
    set4: { code: 'UR', order: 4, defaultName: "Ursula's Return" },
    set5: { code: 'SS', order: 5, defaultName: 'Shimmering Skies' },
    set6: { code: 'AS', order: 6, defaultName: 'Azurite Sea' },
    set7: { code: 'AI', order: 7, defaultName: "Archazia's Island" },
    set8: { code: 'ROJ', order: 8, defaultName: 'Reign of Jafar' },
    set9: { code: 'FAB', order: 9, defaultName: 'Fabled' },
    set10: { code: 'WITW', order: 10, defaultName: 'Whispers in the Well' },
    set11: { code: 'WIN', order: 11, defaultName: 'Winterspell' },
    set12: { code: 'WU', order: 12, defaultName: 'Wilds Unknown' },
    set13: { code: 'AOTV', order: 13, defaultName: 'Attack of the Vine!' },
    set14: { code: 'HC', order: 14, defaultName: 'Hyperia City' },
    quest1: { code: 'Q1', order: 101, defaultName: "Deep Trouble - Illumineer's Quest" },
    quest2: { code: 'Q2', order: 102, defaultName: "Palace Heist - Illumineer's Quest" },
    quest3: { code: 'Q3', order: 103, defaultName: "Hunny Rescue - Illumineer's Quest" },
    gateway1: { code: 'GW', order: 104, defaultName: 'Gateway' }
};

let catalogState = {
    cards: [],
    cardMap: new Map(),      // exact name -> card
    looseCardMap: new Map(), // normalized loose key -> card
    setNames: {},
    lastSync: null,
    versionHash: '',
    source: 'uninitialized',
    rawCount: 0
};

function normalizeText(str) {
    return (str || '')
        .replace(/[\u2018\u2019\u02BC]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
}

function makeLooseKey(str) {
    return normalizeText(str)
        .toLowerCase()
        .replace(/['"`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function deriveSetMeta(setId, setName) {
    const cleanName = normalizeText(setName);
    if (SET_CODE_MAP[setId]) {
        return {
            code: SET_CODE_MAP[setId].code,
            order: SET_CODE_MAP[setId].order,
            name: cleanName || SET_CODE_MAP[setId].defaultName
        };
    }
    const numMatch = (setId || '').match(/^set(\d+)$/i);
    if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        const words = cleanName.split(/\s+/).filter(Boolean);
        const acronym = words.length > 1
            ? words.map(w => w[0].toUpperCase()).join('')
            : cleanName.slice(0, 3).toUpperCase();
        return { code: acronym || `S${num}`, order: num, name: cleanName };
    }
    return { code: 'PRM', order: 500, name: cleanName || 'Promo' };
}

function rebuildMaps(cards) {
    const exact = new Map();
    const loose = new Map();
    for (const c of cards) {
        exact.set(c.name, c);
        loose.set(makeLooseKey(c.name), c);
    }
    catalogState.cardMap = exact;
    catalogState.looseCardMap = loose;
}

function normalizeOfficialData(data) {
    const rawCards = Array.isArray(data.cards) ? data.cards : [];
    const setNamesOut = {};
    if (data.setNames && typeof data.setNames === 'object') {
        for (const [id, info] of Object.entries(data.setNames)) {
            const meta = deriveSetMeta(id, info.name);
            setNamesOut[id] = {
                id,
                name: meta.name,
                code: meta.code,
                order: meta.order,
                icon: info.thumbnail_image_url || null
            };
        }
    }

    const dedupMap = new Map();

    for (const c of rawCards) {
        if (!c || c.card_type === 'supplies') continue;
        const mappedRarity = VALID_RARITIES[c.rarity];
        if (!mappedRarity) continue;

        const baseName = normalizeText(c.name);
        const version = c.subtitle ? normalizeText(c.subtitle) : null;
        const fullName = version ? `${baseName} - ${version}` : baseName;

        // Parse collector number and set number from card_identifier (e.g., "163/204 EN 1")
        const idStr = c.card_identifier || '';
        const stdIdMatch = idStr.match(/^(\d+)\/(\d+)\s+EN\s+(\d+)/i);
        const fallbackNum = parseInt(idStr, 10) || 0;
        const cardNumber = stdIdMatch ? parseInt(stdIdMatch[1], 10) : fallbackNum;
        if (cardNumber <= 0) continue;

        // Prefer main booster sets (set1..set14) over quest/gateway deck inclusions
        const cardSets = Array.isArray(c.card_sets) ? c.card_sets : [];
        const mainSet = cardSets.find(s => /^set\d+$/i.test(s.id)) || cardSets[0] || { id: 'set1', name: 'The First Chapter' };
        const setMeta = deriveSetMeta(mainSet.id, mainSet.name);
        const setOrder = stdIdMatch ? parseInt(stdIdMatch[3], 10) : setMeta.order;

        const variants = Array.isArray(c.variants) ? c.variants : [];
        const regVar = variants.find(v => v.variant_id === 'Regular') || variants[0];
        const foilVar = variants.find(v => v.foil_mask_url);

        const imageUrl = regVar && regVar.detail_image_url
            ? (regVar.detail_image_url.endsWith('/') ? `${regVar.detail_image_url}card` : regVar.detail_image_url)
            : '';
        const foilMaskUrl = foilVar && foilVar.foil_mask_url
            ? (foilVar.foil_mask_url.endsWith('/') ? `${foilVar.foil_mask_url}mask` : foilVar.foil_mask_url)
            : null;

        let cardType = 'Character';
        const rawType = (c.card_type || '').toLowerCase();
        const subtypes = Array.isArray(c.subtypes) ? c.subtypes.map(s => normalizeText(s)) : [];
        if (rawType === 'actions') {
            cardType = subtypes.some(s => s.toLowerCase() === 'song') ? 'Action - Song' : 'Action';
        } else if (rawType === 'items') {
            cardType = 'Item';
        } else if (rawType === 'locations') {
            cardType = 'Location';
        } else {
            cardType = 'Character';
        }

        const colors = Array.isArray(c.magic_ink_colors) && c.magic_ink_colors.length > 0
            ? c.magic_ink_colors.map(col => col.charAt(0).toUpperCase() + col.slice(1).toLowerCase())
            : ['Colorless'];

        const entry = {
            name: fullName,
            baseName,
            version,
            number: cardNumber,
            set: setMeta.name,
            setId: mainSet.id,
            setCode: setMeta.code,
            setOrder,
            cost: typeof c.ink_cost === 'number' ? c.ink_cost : 0,
            inkable: Boolean(c.ink_convertible),
            colors,
            type: cardType,
            rarity: mappedRarity,
            subtypes,
            image: imageUrl,
            foilMask: foilMaskUrl,
            reprintSets: [setMeta.name]
        };

        const key = makeLooseKey(fullName);
        if (!dedupMap.has(key)) {
            dedupMap.set(key, entry);
        } else {
            const existing = dedupMap.get(key);
            if (!existing.reprintSets.includes(setMeta.name)) {
                existing.reprintSets.push(setMeta.name);
            }
            // Keep the earliest main-set release as canonical
            if (entry.setOrder < existing.setOrder) {
                entry.reprintSets = existing.reprintSets;
                if (!entry.foilMask && existing.foilMask) entry.foilMask = existing.foilMask;
                dedupMap.set(key, entry);
            } else if (!existing.foilMask && entry.foilMask) {
                existing.foilMask = entry.foilMask;
            }
        }
    }

    const cards = Array.from(dedupMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    return { cards, setNames: setNamesOut, rawCount: rawCards.length };
}

function normalizeLorcastData(data) {
    const rawResults = Array.isArray(data.results) ? data.results : [];
    const dedupMap = new Map();

    const rarityMap = {
        Common: 'Common',
        Uncommon: 'Uncommon',
        Rare: 'Rare',
        Super_rare: 'Super Rare',
        Legendary: 'Legendary'
    };

    for (const card of rawResults) {
        if (!card || !rarityMap[card.rarity]) continue;
        const baseName = normalizeText(card.name);
        const version = card.version ? normalizeText(card.version) : null;
        const fullName = version ? `${baseName} - ${version}` : baseName;
        const setName = normalizeText(card.set?.name || 'Unknown');
        const setId = card.set?.code ? `set${card.set.code}` : 'set1';
        const setMeta = deriveSetMeta(setId, setName);

        const entry = {
            name: fullName,
            baseName,
            version,
            number: parseInt(card.collector_number, 10) || 0,
            set: setMeta.name,
            setId,
            setCode: setMeta.code,
            setOrder: setMeta.order,
            cost: typeof card.cost === 'number' ? card.cost : 0,
            inkable: Boolean(card.inkwell),
            colors: Array.isArray(card.inks) && card.inks.length > 0
                ? card.inks
                : (card.ink ? [card.ink.charAt(0).toUpperCase() + card.ink.slice(1).toLowerCase()] : ['Colorless']),
            type: Array.isArray(card.type) ? card.type.join(' - ') : 'Character',
            rarity: rarityMap[card.rarity],
            subtypes: Array.isArray(card.classifications) ? card.classifications : [],
            image: card.image_uris?.digital?.normal || card.image_uris?.digital?.large || '',
            foilMask: null,
            reprintSets: [setMeta.name]
        };

        const key = makeLooseKey(fullName);
        if (!dedupMap.has(key)) {
            dedupMap.set(key, entry);
        } else {
            const existing = dedupMap.get(key);
            if (!existing.reprintSets.includes(setMeta.name)) {
                existing.reprintSets.push(setMeta.name);
            }
            if (entry.setOrder < existing.setOrder) {
                entry.reprintSets = existing.reprintSets;
                dedupMap.set(key, entry);
            }
        }
    }

    const cards = Array.from(dedupMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    return { cards, setNames: {}, rawCount: rawResults.length };
}

function computeVersionHash(cards) {
    const summary = `${cards.length}:${cards[0]?.name || ''}:${cards[cards.length - 1]?.name || ''}`;
    return crypto.createHash('md5').update(summary).digest('hex').slice(0, 12);
}

function saveCacheToDisk() {
    try {
        if (!fs.existsSync(CACHE_DIR)) {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
        }
        const payload = {
            cards: catalogState.cards,
            setNames: catalogState.setNames,
            lastSync: catalogState.lastSync,
            versionHash: catalogState.versionHash,
            source: catalogState.source,
            rawCount: catalogState.rawCount
        };
        fs.writeFileSync(CACHE_FILE, JSON.stringify(payload), 'utf8');
    } catch (err) {
        console.error('Failed to write cards cache to disk:', err.message);
    }
}

function loadCacheFromDisk() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const raw = fs.readFileSync(CACHE_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed.cards) && parsed.cards.length > 0) {
                catalogState.cards = parsed.cards;
                catalogState.setNames = parsed.setNames || {};
                catalogState.lastSync = parsed.lastSync || new Date().toISOString();
                catalogState.versionHash = parsed.versionHash || computeVersionHash(parsed.cards);
                catalogState.source = parsed.source || 'disk-cache';
                catalogState.rawCount = parsed.rawCount || parsed.cards.length;
                rebuildMaps(catalogState.cards);
                console.log(`Loaded ${catalogState.cards.length} canonical cards from disk cache.`);
                return true;
            }
        }
    } catch (err) {
        console.error('Error reading disk card cache:', err.message);
    }
    return false;
}

async function syncCardCatalog() {
    // 1. Try Official Ravensburger Catalog (cards.disneylorcana.com)
    try {
        const res = await fetch(OFFICIAL_API_URL, {
            method: 'GET',
            headers: { Accept: 'application/json' }
        });
        if (!res.ok) throw new Error(`Official API returned HTTP ${res.status}`);
        const data = await res.json();
        const normalized = normalizeOfficialData(data);
        if (normalized.cards.length > 0) {
            catalogState.cards = normalized.cards;
            catalogState.setNames = normalized.setNames;
            catalogState.lastSync = new Date().toISOString();
            catalogState.versionHash = computeVersionHash(normalized.cards);
            catalogState.source = 'cards.disneylorcana.com';
            catalogState.rawCount = normalized.rawCount;
            rebuildMaps(catalogState.cards);
            saveCacheToDisk();
            console.log(`Synced ${catalogState.cards.length} canonical cards (from ${normalized.rawCount} total printings) via cards.disneylorcana.com`);
            return catalogState;
        }
    } catch (officialErr) {
        console.warn('Primary card sync (cards.disneylorcana.com) failed, attempting Lorcast fallback:', officialErr.message);
    }

    // 2. Fallback to Lorcast API
    try {
        const res = await fetch(LORCAST_API_URL);
        if (!res.ok) throw new Error(`Lorcast API returned HTTP ${res.status}`);
        const data = await res.json();
        const normalized = normalizeLorcastData(data);
        if (normalized.cards.length > 0) {
            catalogState.cards = normalized.cards;
            catalogState.setNames = normalized.setNames;
            catalogState.lastSync = new Date().toISOString();
            catalogState.versionHash = computeVersionHash(normalized.cards);
            catalogState.source = 'api.lorcast.com (fallback)';
            catalogState.rawCount = normalized.rawCount;
            rebuildMaps(catalogState.cards);
            saveCacheToDisk();
            console.log(`Synced ${catalogState.cards.length} canonical cards via Lorcast fallback.`);
            return catalogState;
        }
    } catch (lorcastErr) {
        console.error('Fallback card sync (lorcast.com) also failed:', lorcastErr.message);
    }

    return catalogState;
}

function findCard(nameOrQuery) {
    if (!nameOrQuery) return null;
    if (catalogState.cardMap.has(nameOrQuery)) {
        return catalogState.cardMap.get(nameOrQuery);
    }
    const loose = makeLooseKey(nameOrQuery);
    return catalogState.looseCardMap.get(loose) || null;
}

// Deterministic PRNG (Mulberry32) seeded by date string YYYY-MM-DD
function computeDeterministicCardForDate(dateStr, excludedCardNames = new Set()) {
    const cards = catalogState.cards;
    if (!cards || cards.length === 0) return null;

    let h = 0xdeadbeef;
    for (let i = 0; i < dateStr.length; i++) {
        h = Math.imul(h ^ dateStr.charCodeAt(i), 2654435761);
    }
    h = (h ^ (h >>> 16)) >>> 0;

    let a = h;
    const nextRand = () => {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    // Pick first candidate; if it was used in the recent exclusion window, advance PRNG
    let candidate = cards[Math.floor(nextRand() * cards.length)];
    let attempts = 0;
    while (excludedCardNames.has(candidate.name) && attempts < 25) {
        candidate = cards[Math.floor(nextRand() * cards.length)];
        attempts++;
    }
    return candidate;
}

async function initCardEngine() {
    loadCacheFromDisk();
    await syncCardCatalog();
    // Refresh every 12 hours automatically
    setInterval(() => {
        syncCardCatalog().catch(err => console.error('Scheduled card sync error:', err));
    }, 12 * 60 * 60 * 1000);
}

module.exports = {
    initCardEngine,
    syncCardCatalog,
    getCatalogState: () => catalogState,
    findCard,
    computeDeterministicCardForDate,
    normalizeText,
    makeLooseKey
};
