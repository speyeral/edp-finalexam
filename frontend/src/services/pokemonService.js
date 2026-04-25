import axios from 'axios';

// The port must match your Express server.js PORT
const API_BASE_URL = 'http://localhost:5055/api';
const STORAGE_KEY = 'pokedex_data';

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// --- Local State & Subscription ---
let pokemonCache = null; // In-memory cache to avoid constant localStorage parsing
let listeners = []; // Array of listener callbacks to notify components of changes

const subscribe = (listener) => {
    listeners.push(listener);
    return () => { // Unsubscribe function
        listeners = listeners.filter(l => l !== listener);
    };
};

const notify = () => {
    for (const listener of listeners) {
        listener();
    }
};

const getLocalData = () => {
    if (pokemonCache) return pokemonCache;
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
        pokemonCache = JSON.parse(data);
        return pokemonCache;
    }
    return null;
};

const setLocalData = (data) => {
    // Sort by ID to keep the list consistent
    const sortedData = data.sort((a, b) => {
        const idA = parseInt(a.id, 10);
        const idB = parseInt(b.id, 10);

        // If both are valid numbers, sort numerically
        if (!isNaN(idA) && !isNaN(idB)) {
            return idA - idB;
        }
        // If only A is a number, it comes first
        if (!isNaN(idA)) return -1;
        // If only B is a number, it comes first
        if (!isNaN(idB)) return 1;
        // If both are non-numbers (UUIDs), sort alphabetically
        return String(a.id).localeCompare(String(b.id));
    });
    pokemonCache = sortedData;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sortedData));
    notify(); // Notify all subscribed components that data has changed
};

// --- Initialization Logic ---
const initializeData = async () => {
    if (getLocalData()) {
        return getLocalData();
    }

    console.log('No local data found. Seeding from backend...');
    const summaryListResponse = await api.get('/pokemon');
    const rawList = summaryListResponse.data;

    // Fetch full details for each Pokémon to create a complete local database
    const detailedPokemonPromises = rawList.map(p => {
        if (p.url) { // Official Pokémon need details fetched
            const id = p.url.split('/').filter(Boolean).pop();
            return api.get(`/pokemon/${id}`).catch(err => {
                console.error(`Failed to fetch initial details for Pokémon ID ${id}. It will be skipped.`, err);
                return null; // Prevent Promise.all from failing on a single error
            });
        }
        return Promise.resolve({ data: p }); // Custom Pokémon are already detailed
    });

    const detailedPokemonResponses = (await Promise.all(detailedPokemonPromises)).filter(Boolean);
    const fullPokemonList = detailedPokemonResponses.map(res => {
        const pokemon = res.data;
        // Normalize sprite URL for consistent display in PokemonCard
        if (pokemon && pokemon.sprites && !pokemon.sprite) {
            pokemon.sprite = pokemon.sprites.front_default;
        }
        return pokemon;
    }).filter(Boolean); // Filter out any null/undefined pokemon that may have resulted from errors

    setLocalData(fullPokemonList);
    console.log('Local data seeded successfully.');
    return fullPokemonList;
};

/**
 * POKEDEX API SERVICES (Hybrid Model: localStorage first, then backend sync)
 */
const pokemonService = {
    subscribe,

    // [READ] Gets all Pokémon from local storage, seeding from backend if needed.
    getAll: async () => {
        return await initializeData();
    },

    // [READ] Gets a single Pokémon from local storage.
    getById: async (id) => {
        const pokemonList = await initializeData();
        const pokemon = pokemonList.find(p => p.id == id); // Loose equality for string/number IDs
        if (!pokemon) throw new Error(`Pokemon with id ${id} not found locally.`);
        return pokemon;
    },

    // [CREATE] Creates on backend, then adds to local storage.
    create: async (pokemonData) => {
        // 1. Create the Pokémon on the backend. The POST response contains the full new object.
        const createResponse = await api.post('/pokemon', pokemonData);
        const newPokemonInfo = createResponse.data;

        if (!newPokemonInfo || !newPokemonInfo.id) {
            throw new Error("Backend did not return a valid Pokémon with an ID after creation.");
        }

        // 2. The object from the POST response is our source of truth for the new Pokémon.
        const finalNewPokemon = newPokemonInfo;

        // 3. Add the new Pokémon to the local cache and notify subscribers.
        const pokemonList = await initializeData();
        setLocalData([...pokemonList, finalNewPokemon]);

        return finalNewPokemon;
    },

    // [UPDATE] Updates local storage first (optimistic), then syncs with backend.
    update: async (id, updatedData) => {
        const pokemonList = await initializeData();
        let updatedPokemon = null;
        const updatedList = pokemonList.map(p => {
            if (p.id == id) {
                updatedPokemon = { ...p, ...updatedData };
                return updatedPokemon;
            }
            return p;
        });
        if (!updatedPokemon) throw new Error(`Pokemon with id ${id} not found for update.`);
        setLocalData(updatedList); // Optimistic update
        api.patch(`/pokemon/${id}`, updatedData).catch(err => {
            console.error(`Failed to sync update for Pokémon ${id} with backend.`, err);
            // Consider reverting local change here in a real app
        });
        return updatedPokemon;
    },

    // [DELETE] Deletes from local storage first (optimistic), then syncs with backend.
    delete: async (id) => {
        const pokemonList = await initializeData();
        const pokemonToDelete = pokemonList.find(p => p.id == id);
        if (!pokemonToDelete) throw new Error(`Pokemon with id ${id} not found for deletion.`);
        const updatedList = pokemonList.filter(p => p.id != id);
        setLocalData(updatedList); // Optimistic update
        api.delete(`/pokemon/${id}`).catch(err => {
            console.warn(`Could not sync deletion for Pokémon ${id} with backend. This is expected for official Pokémon not in db.json.`, err);
        });
        return pokemonToDelete;
    }
};

export default pokemonService;