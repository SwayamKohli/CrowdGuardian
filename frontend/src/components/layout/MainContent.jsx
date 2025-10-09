import React from 'react';
import './MainContent.css';
import MapView from '../../components/MapView';
import AlertsPanel from '../../components/AlertsPanel';
import ChokePointMonitor from '../../components/ChokePointMonitor';
import HistoricalAnalytics from '../../components/HistoricalAnalytics';

/**
 * Main application content wrapper responsible for rendering the active component
 * based on the current view state controlled by the sidebar.
 *
 * @param {object} props - The component props.
 * @param {string} props.activeView - Identifier for the currently active view (e.g., 'map', 'analytics').
 */
const MainContent = ({ activeView }) => {
  
  // Function to determine which primary component to render
  const renderActiveComponent = () => {
    switch (activeView) {
      case 'map':
        return <MapView />;
      case 'alerts':
        return <AlertsPanel />;
      case 'chokepoints':
        return <ChokePointMonitor />;
      case 'analytics':
        return <HistoricalAnalytics />;
      // case 'evacuation': // Placeholder for EvacuationPlanner component
      //   return <EvacuationPlanner />;
      case 'dashboard':
      default:
        return (
          <div className="dashboard-placeholder">
            <h2>Welcome to CrowdGuardian Dashboard</h2>
            <p>Select an option from the sidebar to view details.</p>
            {/* Placeholder for quick stats or summary cards */}
          </div>
        );
    }
  };

  return (
    <main className="app-main-content">
      {renderActiveComponent()}
    </main>
  );
};

export default MainContent;