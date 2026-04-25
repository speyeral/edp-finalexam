const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fetch = require('node-fetch');
const https = require('https');
const crypto = require('crypto');
const debug = require('debug');

const app = express();
const PORT = 5055; // Changed port to rule out interference

// Create namespaced debug loggers

// Create a custom HTTPS agent to modify the TLS handshake.
// This helps bypass advanced bot detection that flags default Node.js TLS fingerprints.
const httpsAgent = new https.Agent({
    family: 4, // Force IPv4, which can resolve stubborn connection issues
    ciphers: [
        'TLS_AES_128_GCM_SHA256',
        'TLS_AES_256_GCM_SHA384',
        'TLS_CHACHA20_POLY1305_SHA256',
        'ECDHE-ECDSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-ECDSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-ECDSA-CHACHA20-POLY1305',
        'ECDHE-RSA-CHACHA20-POLY1305',
        'ECDHE-RSA-AES128-SHA',
        'ECDHE-RSA-AES256-SHA',
        'AES128-GCM-SHA256',
        'AES256-GCM-SHA384',
    ].join(':'),
    minVersion: 'TLSv1.2', // Use modern TLS versions
});
const logServer = debug('pokedex:server');
const logDb = debug('pokedex:db');
const logApi = debug('pokedex:pokeapi');
const logError = debug('pokedex:error');

// This middleware will run for EVERY request that hits the server, before any routing.
app.use((req, res, next) => {
    logServer(`Incoming request: ${req.method} ${req.originalUrl}`);
    next();
});

app.use(cors());
app.use(express.json());

const DB_FILE = './db.json';
const CACHE_DIR = path.join(__dirname, 'cache');
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour cache

// --- CACHING SETUP ---

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR);
    logServer('Created cache directory at ./cache');
}

// Helper to read/write JSON file
const readDB = () => {
    try {
        if (!fs.existsSync(DB_FILE)) {
            // If file doesn't exist, return a default structure.
            // It will be created on the first write.
            return { custom: [], overrides: {} };
        }

        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        if (fileContent.trim() === '') {
            return { custom: [], overrides: {} };
        }
        const data = JSON.parse(fileContent);
        // Ensure the structure is valid to prevent crashes in routes
        data.custom = data.custom || [];
        data.overrides = data.overrides || {};
        return data;
    } catch (error) {
        logError(`Error reading ${DB_FILE}. Returning default structure. %o`, error);
        return { custom: [], overrides: {} };
    }
};
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// Helper to create a safe filename from a URL
const getCacheKey = (url) => {
    return crypto.createHash('md5').update(url).digest('hex');
};

// A wrapper for fetch that uses a file-based cache
const cachedFetchGet = async (url) => {
    const cacheKey = getCacheKey(url);
    const cachePath = path.join(CACHE_DIR, cacheKey);

    // 1. Check for a valid cache entry
    if (fs.existsSync(cachePath)) {
        const stats = fs.statSync(cachePath);
        const age = Date.now() - stats.mtime.getTime();
        if (age < CACHE_DURATION_MS) {
            logApi(`[CACHE HIT] Using cached data for ${url}`);
            const cachedData = fs.readFileSync(cachePath, 'utf-8');
            return JSON.parse(cachedData);
        }
        logApi(`[CACHE STALE] Cache for ${url} has expired.`);
    }

    // 2. If no valid cache, fetch from API
    logApi(`[CACHE MISS] Fetching fresh data for ${url}`);
    const response = await fetch(url, {
        timeout: 15000, // Increased timeout
        agent: (parsedURL) => (parsedURL.protocol === 'https:' ? httpsAgent : undefined),
        headers: {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'keep-alive',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
        }
    });

    if (!response.ok) {
        // Mimic an Axios-style error to fit into our existing catch blocks
        const error = new Error(`Request failed with status ${response.status}`);
        error.response = {
            status: response.status,
            statusText: response.statusText,
            // Try to get error body for logging, but don't fail if it's not there
            data: await response.text().catch(() => 'Could not read error body'),
        };
        throw error;
    }

    const data = await response.json();

    // 3. Store the new data in cache and return it
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
    logApi(`[CACHE SET] Cached new data for ${url}`);
    return data;
};

// --- ROUTES ---

// 1. GET: List Pokémon (30 Official + All Custom)
app.get('/api/pokemon', async (req, res) => {
    logServer('GET /api/pokemon - Request received.');
    try {
        const db = readDB();
        const pokeApiUrl = 'https://pokeapi.co/api/v2/pokemon?limit=30';
        const responseData = await cachedFetchGet(pokeApiUrl);
        
        // Map official ones to a standard format
        const official = responseData.results.map((p, index) => ({
            id: (index + 1).toString(),
            name: p.name,
            url: p.url,
            isCustom: false
        }));

        const custom = db.custom.map(p => ({ ...p, isCustom: true }));
        
        logServer('GET /api/pokemon - Sending combined Pokémon list.');
        res.json([...official, ...custom]);
    } catch (error) {
        // Log the full structured error
        logError('GET /api/pokemon - Detailed Error: %o', error.response || error);
        if (error.response) { // The request was made and the server responded with a status code
            return res.status(502).json({ 
                error: `Bad Gateway: The PokeAPI server responded with status ${error.response.status}.`,
            });
        }
        // For other errors (e.g., network issues, timeouts)
        res.status(500).json({ error: 'Failed to fetch Pokémon list. Check server network connection.' });
    }
});

// 2. GET: Pokémon Details
app.get('/api/pokemon/:id', async (req, res) => {
    const { id } = req.params;
    logServer(`GET /api/pokemon/${id} - Request received.`);
    const db = readDB();

    try {
        // Check if it's a custom UUID first
        const customPoke = db.custom.find(p => p.id === id);
        if (customPoke) {
            logDb(`GET /api/pokemon/${id} - Found custom Pokémon in db.json.`);
            return res.json(customPoke);
        }

        // Fetch official data
        const [pokeData, speciesData] = await Promise.all([
            cachedFetchGet(`https://pokeapi.co/api/v2/pokemon/${id}`),
            cachedFetchGet(`https://pokeapi.co/api/v2/pokemon-species/${id}`)
        ]);

        let pokemonData = {
            id: pokeData.id.toString(),
            name: pokeData.name,
            sprites: pokeData.sprites,
            weight: pokeData.weight,
            height: pokeData.height,
            base_experience: pokeData.base_experience,
            stats: pokeData.stats,
            abilities: pokeData.abilities,
            cries: pokeData.cries,
            description: speciesData.flavor_text_entries.find(e => e.language.name === 'en')?.flavor_text.replace(/[\n\f]/g, ' ') || ""
        };

        // Apply overrides if user edited this official Pokémon
        if (db.overrides[id]) {
            pokemonData = { ...pokemonData, ...db.overrides[id] };
        }

        logServer(`GET /api/pokemon/${id} - Sending Pokémon details.`);
        res.json(pokemonData);
    } catch (error) {
        logError(`GET /api/pokemon/${id} - Detailed Error: %o`, error.response || error);

        if (error.response) { // Upstream API error
            const status = error.response.status === 404 ? 404 : 502;
            const errorMsg = status === 404
                ? 'Pokémon not found.'
                : `Bad Gateway: The upstream API responded with status ${error.response.status}.`;

            return res.status(status).json({ error: errorMsg });
        }
        // For other errors (e.g., network issues)
        res.status(500).json({ error: 'Failed to fetch Pokémon details. Check server network connection.' });
    }
});

// 3. POST: Create Custom Pokémon
app.post('/api/pokemon', (req, res) => {
    logServer('POST /api/pokemon - Request received.');
    try {
        const db = readDB();
        const newPokemon = {
            ...req.body,
            id: uuidv4(),
            isCustom: true
        };
        db.custom.push(newPokemon);
        writeDB(db);
        logDb(`POST /api/pokemon - Created new Pokémon with id ${newPokemon.id}.`);
        res.status(201).json(newPokemon);
    } catch (error) {
        logError('POST /api/pokemon - Error: %s', error.message);
        res.status(500).json({ error: 'Failed to create Pokémon' });
    }
});

// 4. PATCH: Update Pokémon
app.patch('/api/pokemon/:id', (req, res) => {
    const { id } = req.params;
    logServer(`PATCH /api/pokemon/${id} - Request received.`);
    try {
        const db = readDB();
        const isCustom = id.includes('-'); // UUIDs contain hyphens

        if (isCustom) {
            const index = db.custom.findIndex(p => p.id === id);
            if (index !== -1) {
                db.custom[index] = { ...db.custom[index], ...req.body };
            }
        } else {
            // Store as override for official Pokémon
            db.overrides[id] = { ...db.overrides[id], ...req.body };
        }

        writeDB(db);
        logDb(`PATCH /api/pokemon/${id} - Updated successfully.`);
        res.json({ message: 'Updated successfully' });
    } catch (error) {
        logError(`PATCH /api/pokemon/${id} - Error: %s`, error.message);
        res.status(500).json({ error: 'Failed to update Pokémon' });
    }
});

// 5. DELETE: Delete Pokémon
app.delete('/api/pokemon/:id', (req, res) => {
    const { id } = req.params;
    logServer(`DELETE /api/pokemon/${id} - Request received.`);
    try {
        const db = readDB();

        db.custom = db.custom.filter(p => p.id !== id);
        delete db.overrides[id];

        writeDB(db);
        logDb(`DELETE /api/pokemon/${id} - Deleted successfully.`);
        res.json({ message: 'Deleted successfully' });
    } catch (error) {
        logError(`DELETE /api/pokemon/${id} - Error: %s`, error.message);
        res.status(500).json({ error: 'Failed to delete Pokémon' });
    }
});

app.listen(PORT, () => logServer(`Server running on http://localhost:${PORT}`));