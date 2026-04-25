import React from 'react';
import { Link } from 'react-router-dom';

const PokemonCard = ({ pokemon }) => {
    // Determine the image source
    // For official Pokémon, use the standard sprite URL
    // For custom ones, use the provided URL from the API response
    const imageUrl = pokemon.sprite || 'https://via.placeholder.com/96x96?text=No+Image';

    return (
        <Link to={`/pokemon/${pokemon.id}`} className="pokemon-card">
            <div className="pokemon-card-image-container">
                <img src={imageUrl} alt={pokemon.name} className="pokemon-card-image" />
            </div>
            <div className="pokemon-card-name">
                {pokemon.name}
                {pokemon.isCustom && <span className="custom-tag"> (Custom)</span>}
            </div>
        </Link>
    );
};

export default PokemonCard;