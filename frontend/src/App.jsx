import React, { useState, useEffect } from 'react';
import './App.css'; // Import global styles
import Header from './components/layout/Header'; // Import Header
import Sidebar from './components/layout/Sidebar'; // Import Sidebar
import MainContent from './components/layout/MainContent'; // Import MainContent

function App() {
  // State to manage the active navigation item (Sidebar)
  const [activeItem, setActiveItem] = useState('dashboard'); // Default to 'dashboard'

  // --- NEW V1.5 FEATURE: State for Dynamic Linking between Map and Alerts ---
  // State to manage the selected zone ID for filtering alerts
  const [selectedZoneId, setSelectedZoneId] = useState(null); // Default to null (show all alerts)
  // --- END NEW V1.5 FEATURE ---

  return (
    <div id="root"> {/* Use the id from App.css */}
      <Header />
      <div className="app-container"> {/* Container for sidebar and main content */}
        {/* Pass activeItem and setActiveItem to Sidebar */}
        <Sidebar activeItem={activeItem} setActiveItem={setActiveItem} />
        {/* Pass activeItem (renamed as activeView for MainContent), selectedZoneId, and setSelectedZoneId to MainContent */}
        <MainContent activeView={activeItem} selectedZoneId={selectedZoneId} setSelectedZoneId={setSelectedZoneId} />
      </div>
    </div>
  );
}

export default App;