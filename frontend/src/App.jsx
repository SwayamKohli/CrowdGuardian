import React, { useState } from 'react';
import './App.css';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import MainContent from './components/layout/MainContent';

/**
 * Main application component that manages the global navigation state (active view)
 * and controls the overall application layout.
 */
function App() {
  // State to manage the currently active navigation item, defaulting to 'dashboard'
  const [activeItem, setActiveItem] = useState('dashboard');

  return (
    <div id="root">
      <Header />
      <div className="app-container">
        {/* Sidebar passes the desired view ID up to setActiveItem */}
        <Sidebar activeItem={activeItem} setActiveItem={setActiveItem} />
        {/* MainContent renders the component corresponding to the activeItem */}
        <MainContent activeView={activeItem} />
      </div>
    </div>
  );
}

export default App;