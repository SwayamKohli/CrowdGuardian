import React from 'react';
import './App.css'; // Import global styles
import Header from './components/layout/Header'; // Import Header
import Sidebar from './components/layout/Sidebar'; // Import Sidebar
import MainContent from './components/layout/MainContent'; // Import MainContent

function App() {
  return (
    <div id="root"> {/* Use the id from App.css */}
      <Header />
      <div className="app-container"> {/* Container for sidebar and main content */}
        <Sidebar />
        <MainContent />
      </div>
    </div>
  );
}

export default App;