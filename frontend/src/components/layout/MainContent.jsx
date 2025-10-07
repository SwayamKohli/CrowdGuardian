import React from 'react';
import './MainContent.css';
// import AlertsPanel from '../../components/AlertsPanel'; // Commenting out for now
import MapView from '../../components/MapView'; 

const MainContent = () => {
  return (
    <main className="app-main-content">
      {/* Render the MapView component */}
      <MapView />
      {/* <AlertsPanel /> */} {/* Keep this commented out for now */}
    </main>
  );
};

export default MainContent;