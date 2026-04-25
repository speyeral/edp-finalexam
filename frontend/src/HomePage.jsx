import React, { useEffect, useState } from 'react';
import pokemonService from './services/pokemonService'; // Correct path to service
import PokemonCard from './components/PokemonCard'; // Correct path to component

const HomePage = () => {
    const [pokemonList, setPokemonList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchAndSetPokemon = async () => {
            setLoading(true);
            setError(null);
            try {
                // The service now handles all data fetching, caching, and formatting.
                const allPokemon = await pokemonService.getAll();
                setPokemonList(allPokemon);
            } catch (err) {
                setError('Failed to fetch Pokémon. Please ensure the backend is running for the initial setup.');
                console.error('Error fetching Pokémon:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchAndSetPokemon();

        // Subscribe to any changes (create, update, delete) that happen elsewhere in the app
        const unsubscribe = pokemonService.subscribe(async () => {
            const updatedList = await pokemonService.getAll();
            setPokemonList(updatedList);
        });

        // Clean up the subscription when the component unmounts
        return () => unsubscribe();
    }, []); // The empty dependency array ensures this setup runs only once on mount.

    if (loading) return <p>Loading Pokémon...</p>;
    if (error) return <p className="error-message">{error}</p>;

    return (
        <div className="pokemon-list-container">
            <h2>Homepage - Pokémon List</h2>
            <div className="pokemon-grid">
                {pokemonList.map((pokemon) => (
                    <PokemonCard key={pokemon.id} pokemon={pokemon} />
                ))}
            </div>
        </div>
    );
};

export default HomePage;