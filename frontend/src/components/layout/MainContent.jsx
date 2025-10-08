import React from 'react';
import './MainContent.css';
import MapView from '../../components/MapView'; // Commenting out for now
// import AlertsPanel from '../../components/AlertsPanel'; // Commenting out for now
// import ChokePointMonitor from '../../components/ChokePointMonitor'; // Commenting out for now
import HistoricalAnalytics from '../../components/HistoricalAnalytics'; // Import HistoricalAnalytics

const MainContent = () => {
  return (
    <main className="app-main-content">
      {/* Render the HistoricalAnalytics component */}
       {/*  <HistoricalAnalytics /> */}
      <MapView />
      {/* <AlertsPanel /> */}
      {/* <ChokePointMonitor /> */}
    </main>
  );
};

export default MainContent;