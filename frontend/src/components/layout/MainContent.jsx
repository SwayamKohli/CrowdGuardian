import React from 'react';
import './MainContent.css';
// import MapView from '../../components/MapView'; // Commenting  out for now
// import AlertsPanel from '../../components/AlertsPanel'; // Commenting out for now
import ChokePointMonitor from '../../components/ChokePointMonitor'; // Import ChokePointMonitor

const MainContent = () => {
  return (
    <main className="app-main-content">
      {/* Render the ChokePointMonitor component */}
      <ChokePointMonitor />
      {/* <MapView /> */}
      {/* <AlertsPanel /> */}
    </main>
  );
};

export default MainContent;