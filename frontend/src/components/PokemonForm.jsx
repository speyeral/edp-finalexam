import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import pokemonService from '../services/pokemonService';

const PokemonForm = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const isEditMode = Boolean(id);

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        height: '',
        weight: '',
        base_experience: '',
        sprite: '',
        abilities: '', // Comma-separated string
        stats: {
            hp: '',
            attack: '',
            defense: '',
            'special-attack': '',
            'special-defense': '',
            speed: '',
        },
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isEditMode) {
            setLoading(true);
            pokemonService.getById(id)
                .then(data => {
                    const statsObject = data.stats?.reduce((acc, stat) => {
                        acc[stat.stat.name] = stat.base_stat;
                        return acc;
                    }, {}) || {};

                    const abilitiesString = data.abilities?.map(a => a.ability.name).join(', ') || '';

                    setFormData({
                        name: data.name || '',
                        description: data.description || '',
                        height: data.height ? data.height * 10 : '', // Convert decimeters to centimeters for display
                        weight: data.weight ? data.weight / 10 : '', // Convert hectograms to kilograms for display
                        base_experience: data.base_experience || '',
                        sprite: data.sprite || data.sprites?.front_default || '',
                        abilities: abilitiesString,
                        stats: {
                            hp: statsObject.hp || '',
                            attack: statsObject.attack || '',
                            defense: statsObject.defense || '',
                            'special-attack': statsObject['special-attack'] || '',
                            'special-defense': statsObject['special-defense'] || '',
                            speed: statsObject.speed || '',
                        }
                    });
                })
                .catch(err => {
                    setError('Failed to load Pokémon data for editing.');
                    console.error(err);
                })
                .finally(() => setLoading(false));
        }
    }, [id, isEditMode]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleStatChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            stats: {
                ...prev.stats,
                [name]: value,
            }
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const payload = {
            ...formData,
            abilities: formData.abilities.split(',').map(name => ({ ability: { name: name.trim() } })),
            stats: Object.entries(formData.stats).map(([name, value]) => ({
                stat: { name },
                base_stat: Number(value) || 0,
            })),
            height: Number(formData.height) ? Number(formData.height) / 10 : 0, // Convert centimeters back to decimeters for API
            weight: Number(formData.weight) ? Number(formData.weight) * 10 : 0, // Convert kilograms back to hectograms for API
            base_experience: Number(formData.base_experience) || 0,
        };

        try {
            if (isEditMode) {
                await pokemonService.update(id, payload);
                navigate(`/pokemon/${id}`);
            } else {
                const newPokemon = await pokemonService.create(payload);
                navigate(`/pokemon/${newPokemon.id}`);
            }
        } catch (err) {
            setError('Failed to save Pokémon. Please check your input and try again.');
            console.error(err);
            setLoading(false);
        }
    };

    if (loading && isEditMode) return <p>Loading form...</p>;

    return (
        <form onSubmit={handleSubmit} className="pokemon-form">
            <h2>{isEditMode ? `Edit ${formData.name || 'Pokémon'}` : 'Create New Pokémon'}</h2>
            {error && <p className="error-message">{error}</p>}

            <fieldset>
                <legend>Basic Information</legend>
                <div className="form-group">
                    <label htmlFor="name">Name</label>
                    <input type="text" id="name" name="name" value={formData.name} onChange={handleChange} required />
                </div>
                <div className="form-group">
                    <label htmlFor="description">Description</label>
                    <textarea id="description" name="description" value={formData.description} onChange={handleChange}></textarea>
                </div>
                <div className="form-group">
                    <label htmlFor="sprite">Image URL</label>
                    <input type="text" id="sprite" name="sprite" value={formData.sprite} onChange={handleChange} />
                </div>
            </fieldset>

            <fieldset>
                <legend>Physical Attributes</legend>
                <div className="form-group">
                    <label htmlFor="height">Height (centimeters)</label>
                    <input type="number" id="height" name="height" value={formData.height} onChange={handleChange} />
                </div>
                <div className="form-group">
                    <label htmlFor="weight">Weight (kilograms)</label>
                    <input type="number" id="weight" name="weight" value={formData.weight} onChange={handleChange} />
                </div>
                <div className="form-group">
                    <label htmlFor="base_experience">Base Experience</label>
                    <input type="number" id="base_experience" name="base_experience" value={formData.base_experience} onChange={handleChange} />
                </div>
            </fieldset>

            <fieldset>
                <legend>Abilities</legend>
                <div className="form-group">
                    <label htmlFor="abilities">Abilities (comma-separated)</label>
                    <input type="text" id="abilities" name="abilities" value={formData.abilities} onChange={handleChange} />
                </div>
            </fieldset>

            <fieldset>
                <legend>Base Stats</legend>
                {Object.keys(formData.stats).map(statName => (
                    <div className="form-group stat-input" key={statName}>
                        <label htmlFor={statName}>{statName}</label>
                        <input
                            type="number"
                            id={statName}
                            name={statName}
                            value={formData.stats[statName]}
                            onChange={handleStatChange}
                        />
                    </div>
                ))}
            </fieldset>

            <div className="form-actions">
                <button type="button" onClick={() => navigate(isEditMode ? `/pokemon/${id}` : '/')}>
                    Cancel
                </button>
                <button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : (isEditMode ? 'Save Changes' : 'Create Pokémon')}
                </button>
            </div>
        </form>
    );
};

export default PokemonForm;