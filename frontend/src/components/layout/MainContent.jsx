import React from 'react';
import './MainContent.css';
import AlertsPanel from '../../components/AlertsPanel';
import MapView from '../../components/MapView';

const MainContent = () => {
  return (
    <main className="app-main-content">
      <AlertsPanel />
      {/* <MapView /> */}
    </main>
  );
};

export default MainContent;