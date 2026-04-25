import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import pokemonService from './services/pokemonService';

const DetailPage = () => {
    const { id } = useParams();
    const [pokemon, setPokemon] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchPokemonDetails = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await pokemonService.getById(id);
                setPokemon(data);
            } catch (err) {
                setError(`Failed to fetch details for Pokémon #${id}.`);
                console.error('Error fetching Pokémon details:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchPokemonDetails();
    }, [id]);

    const handleDelete = async () => {
        if (!window.confirm(`Are you sure you want to delete ${pokemon?.name || 'this Pokémon'}? This action cannot be undone.`)) {
            return;
        }

        setIsDeleting(true);
        try {
            await pokemonService.delete(id);
            navigate('/'); // Redirect to homepage on successful deletion
        } catch (err) {
            // Display an error message on the detail page if deletion fails
            setError('Failed to delete Pokémon. It might be an official Pokémon that cannot be deleted, or there was a server error.');
            console.error('Failed to delete Pokémon', err);
            setIsDeleting(false); // Re-enable the button on failure
        }
    };

    if (loading) return <p>Loading details...</p>;
    // Only show a full-page error if the initial data fetch failed
    if (error && !pokemon) return <p className="error-message">{error}</p>;
    if (!pokemon) return <p>No Pokémon data found.</p>;

    // Use a more reliable sprite source, falling back as needed
    const mainSprite = pokemon.sprites?.other?.['official-artwork']?.front_default || pokemon.sprites?.front_default || pokemon.sprite;

    return (
        <div className="detail-container">
            {/* This will now also show errors from a failed delete attempt */}
            {error && <p className="error-message">{error}</p>}
            <div className="detail-header">
                <h2 className="pokemon-name">{pokemon.name}</h2>
                <div className="detail-header-actions">
                    <Link to={`/edit/${pokemon.id}`} className={`edit-button ${isDeleting ? 'disabled-link' : ''}`}>Edit</Link>
                    <button onClick={handleDelete} className="delete-button" disabled={isDeleting}>
                        {isDeleting ? 'Deleting...' : 'Delete'}
                    </button>
                </div>
            </div>

            <div className="detail-main-content">
                <div className="detail-image-container">
                    <img src={mainSprite} alt={pokemon.name} className="detail-image" />
                    {pokemon.cries?.latest && (
                        <div className="audio-player">
                            <p>Cry:</p>
                            <audio controls src={pokemon.cries.latest}>
                                Your browser does not support the audio element.
                            </audio>
                        </div>
                    )}
                </div>

                <div className="detail-info">
                    <div className="metadata-section">
                        <h3>Info</h3>
                        <p><strong>Height:</strong> {pokemon.height / 10} m</p>
                        <p><strong>Weight:</strong> {pokemon.weight / 10} kg</p>
                        <p><strong>Base Experience:</strong> {pokemon.base_experience}</p>
                    </div>

                    <div className="description-section">
                        <h3>Description</h3>
                        <p>{pokemon.description || 'No description available.'}</p>
                    </div>
                </div>
            </div>

            <div className="detail-sections">
                <div className="stats-section">
                    <h3>Base Stats</h3>
                    {pokemon.stats?.map((statInfo) => (
                        <div key={statInfo.stat.name} className="stat-row">
                            <span className="stat-name">{statInfo.stat.name}</span>
                            <div className="stat-bar-container">
                                <div
                                    className="stat-bar"
                                    style={{ width: `${(statInfo.base_stat / 255) * 100}%` }}
                                ></div>
                            </div>
                            <span className="stat-value">{statInfo.base_stat}</span>
                        </div>
                    ))}
                </div>

                <div className="abilities-section">
                    <h3>Abilities</h3>
                    <ul>
                        {pokemon.abilities?.map((abilityInfo) => (
                            <li key={abilityInfo.ability.name}>{abilityInfo.ability.name}</li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default DetailPage;