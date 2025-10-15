import React, { useState } from 'react';
import './App.css';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import MainContent from './components/layout/MainContent';
// --- NEW V1.5 FEATURE: Import for Fullscreen Map Route ---
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'; // Import Router, Routes, Route
import FullscreenMapView from './components/FullscreenMapView'; // Import the new component
// --- END NEW V1.5 FEATURE ---

function App() {
  const [activeItem, setActiveItem] = useState('dashboard');
  const [selectedZoneId, setSelectedZoneId] = useState(null);

  // --- NEW V1.5 FEATURE: State for Persistent Socket Messages ---
  const [persistentSocketMessages, setPersistentSocketMessages] = useState([]);
  // --- END NEW V1.5 FEATURE ---

  return (
    // --- NEW V1.5 FEATURE: Wrap App with Router ---
    <Router>
      <div id="root">
        <Header />
        {/* Use Routes to define different page views */}
        <Routes>
          {/* Main application layout with sidebar and dynamic content */}
          <Route
            path="/"
            element={
              <div className="app-container">
                <Sidebar activeItem={activeItem} setActiveItem={setActiveItem} />
                {/* Pass the new persistent state and setter */}
                <MainContent
                  activeView={activeItem}
                  selectedZoneId={selectedZoneId}
                  setSelectedZoneId={setSelectedZoneId}
                  persistentSocketMessages={persistentSocketMessages}
                  setPersistentSocketMessages={setPersistentSocketMessages}
                />
              </div>
            }
          />
          {/* Dedicated fullscreen map route */}
          <Route
            path="/map-fullscreen"
            element={
              // Pass the persistent state and setter to the fullscreen map as well
              <FullscreenMapView
                selectedZoneId={selectedZoneId}
                setSelectedZoneId={setSelectedZoneId}
                persistentSocketMessages={persistentSocketMessages}
                setPersistentSocketMessages={setPersistentSocketMessages}
              />
            }
          />
        </Routes>
      </div>
    </Router>
    // --- END NEW V1.5 FEATURE ---
  );
}

export default App;