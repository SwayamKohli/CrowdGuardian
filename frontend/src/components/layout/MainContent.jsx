import React from 'react';
import './MainContent.css';
// Import the components to be rendered based on navigation
import MapView from '../../components/MapView';
import AlertsPanel from '../../components/AlertsPanel';
import ChokePointMonitor from '../../components/ChokePointMonitor';
import HistoricalAnalytics from '../../components/HistoricalAnalytics';
// import EvacuationPlanner from '../../components/EvacuationPlanner'; // Import when created

// Accept activeView, selectedZoneId, and setSelectedZoneId as props
const MainContent = ({ activeView, selectedZoneId, setSelectedZoneId }) => {

  // Function to render the correct component based on activeView
  const renderActiveComponent = () => {
    switch (activeView) {
      case 'map':
        // Pass props for dynamic linking
        return <MapView selectedZoneId={selectedZoneId} setSelectedZoneId={setSelectedZoneId} />;
      case 'alerts':
        // Pass props for dynamic linking
        return <AlertsPanel selectedZoneId={selectedZoneId} setSelectedZoneId={setSelectedZoneId} />;
      case 'chokepoints':
        return <ChokePointMonitor />;
      case 'analytics':
        return <HistoricalAnalytics />;
      // case 'evacuation': // Add case when EvacuationPlanner is ready
      //   return <EvacuationPlanner />;
      case 'dashboard': // Default or specific dashboard view
      default:
        return (
          <div className="dashboard-container">
            <div className="dashboard-header">
              <h1>Welcome to CrowdGuardian</h1>
              <p className="dashboard-subtitle">Real-Time Stampede Risk Prediction & Safety System</p>
            </div>
            <div className="dashboard-content">
              <div className="dashboard-intro">
                <h2>About CrowdGuardian</h2>
                <p>
                  CrowdGuardian is an intelligent platform designed to prevent stampede incidents by leveraging real-time crowd monitoring, advanced algorithms, and predictive analytics.
                </p>
                <p>
                  Our system continuously analyzes crowd density, flow patterns, and choke point pressures to predict potential risks before they escalate. It provides dynamic evacuation planning and coordinated emergency response tools to ensure public safety at mass gatherings.
                </p>
              </div>
              <div className="dashboard-features">
                <h2>Key Features</h2>
                <ul>
                  <li><strong>Real-Time Crowd Density Monitoring:</strong> Visualize crowd distribution and identify high-density areas.</li>
                  <li><strong>Intelligent Risk Prediction:</strong> Predict stampede risks using advanced algorithms.</li>
                  <li><strong>Dynamic Evacuation Planning:</strong> Calculate and display optimal evacuation routes.</li>
                  <li><strong>Choke Point Management:</strong> Monitor and manage critical areas prone to bottlenecks.</li>
                  <li><strong>Historical Analytics:</strong> Analyze past incidents and trends for improved safety strategies.</li>
                  <li><strong>Multi-Channel Alerts:</strong> Trigger automated warnings via various communication channels.</li>
                </ul>
              </div>
              <div className="dashboard-call-to-action">
                <h2>Get Started</h2>
                <p>Explore the system using the navigation menu on the left.</p>
                <ul>
                  <li>View the <strong>Crowd Map</strong> for real-time density visualization.</li>
                  <li>Check the <strong>Alerts Panel</strong> for current warnings.</li>
                  <li>Monitor <strong>Choke Points</strong> for utilization status.</li>
                  <li>Analyze <strong>Historical Data</strong> for trends.</li>
                </ul>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <main className="app-main-content">
      {/* Render the component based on activeView */}
      {renderActiveComponent()}
    </main>
  );
};

export default MainContent;