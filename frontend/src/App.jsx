import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import HomePage from './HomePage';
import DetailPage from './DetailPage';
import FormPage from './FormPage';

function App() {
  return (
    <div className="app-container">
      <header>
        <nav>
          <h1>
            <Link to="/" className="header-link">Pokedex</Link>
          </h1>
          <Link to="/create" className="edit-button">Create Pokémon</Link>

        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/pokemon/:id" element={<DetailPage />} />
          <Route path="/create" element={<FormPage />} />
          <Route path="/edit/:id" element={<FormPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;