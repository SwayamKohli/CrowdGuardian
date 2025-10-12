import React, { useState, useEffect } from 'react';
import './ChokePointMonitor.css';

const ChokePointMonitor = () => {
  // State for Choke Point data fetched from API
  const [chokePoints, setChokePoints] = useState([]);
  
  // Simulated Zone Metrics (matching MapView.jsx for consistency)
  const [zoneMetrics, setZoneMetrics] = useState([
    { id: 'Z1', zoneId: 'Z1', density: 5.8, avgSpeed: 0.1, description: 'Connaught Place Area' },
    { id: 'Z2', zoneId: 'Z2', density: 5.5, avgSpeed: 0.3, description: 'India Gate Area' },
    { id: 'Z3', zoneId: 'Z3', density: 3.9, avgSpeed: 0.6, description: 'Lotus Temple Vicinity' },
    { id: 'Z4', zoneId: 'Z4', density: 5.1, avgSpeed: 0.25, description: 'Red Fort Area' },
  ]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Effect hook to fetch static Choke Points data periodically from backend API
  useEffect(() => {
    const fetchChokePoints = async () => {
      try {
        setError(null);
        // Backend query is intentionally kept simple: it only fetches choke points
        const response = await fetch('http://localhost:3000/api/choke-points');
        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }
        const data = await response.json();
        setChokePoints(data);
      } catch (err) {
        console.error('Error fetching choke points:', err);
        setError(err.message);
        setChokePoints([]);
      } finally {
        setLoading(false);
      }
    };

    fetchChokePoints();
    const interval = setInterval(fetchChokePoints, 5000);
    return () => clearInterval(interval);
  }, []);

  /** Determines status text based on utilization percentage. */
  const getStatusText = (utilization, capacity) => {
    const util = utilization || 0;
    const cap = capacity || 100;
    const percentage = (util / cap) * 100;
    if (percentage > 80) return 'High Risk';
    if (percentage > 60) return 'Medium Risk';
    return 'Low Risk';
  };

  /** Determines status color (hex code) based on utilization percentage. */
  const getStatusColor = (utilization, capacity) => {
    const util = utilization || 0;
    const cap = capacity || 100;
    const percentage = (util / cap) * 100;
    if (percentage > 80) return '#dc3545'; // Red
    if (percentage > 60) return '#ffc107'; // Yellow
    return '#28a745'; // Green
  };

  /** Determines zone density risk color (e.g., density 5.8 -> Critical). */
  const getDensityColor = (density) => {
    if (density > 5.0) return '#8B0000'; // Critical (Dark Red)
    if (density > 4.0) return '#dc3545'; // High (Red)
    if (density > 3.0) return '#ffc107'; // Medium (Yellow)
    return '#28a745'; // Low (Green)
  };
  
  // Render loading or error state
  if (loading) {
    return (
      <div className="choke-point-monitor">
        <h3>Crowd Monitoring Dashboard</h3>
        <p className="loading-message">Loading monitoring data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="choke-point-monitor">
        <h3>Crowd Monitoring Dashboard</h3>
        <p className="error-message">Error loading monitoring data: {error}</p>
      </div>
    );
  }

  return (
    <div className="choke-point-monitor">
      <h3>Crowd Monitoring Dashboard</h3>
      <div className="monitor-container"> {/* NEW CONTAINER FOR SPLIT VIEW */}
        
        {/* FRAME 1: ZONE METRICS (Density & Speed) */}
        <div className="zone-metrics-frame">
          <h4>Zone Density Metrics (Trigger Status)</h4>
          <table className="zone-metrics-table">
            <thead>
              <tr>
                <th>Zone ID</th>
                <th>Description</th>
                <th>Density (p/m²)</th>
                <th>Avg. Speed (m/s)</th>
              </tr>
            </thead>
            <tbody>
              {zoneMetrics.map((zone) => (
                <tr key={zone.id}>
                  <td>{zone.zoneId}</td>
                  <td>{zone.description}</td>
                  <td style={{ backgroundColor: getDensityColor(zone.density), color: 'white', fontWeight: 'bold' }}>
                    {zone.density.toFixed(2)}
                  </td>
                  <td>{zone.avgSpeed.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">Note: High density/low speed triggers ML prediction.</p>
        </div>

        {/* FRAME 2: CHOKE POINT UTILIZATION (Bottlenecks) */}
        <div className="choke-points-frame">
          <h4>Choke Point Utilization (Bottlenecks)</h4>
          <table className="choke-points-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Capacity</th>
                <th>Utilization</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {chokePoints.map((point) => (
                <tr key={point.id}>
                  <td>{point.name}</td>
                  <td>{point.capacity || 'N/A'}</td>
                  <td>{point.current_utilization || 'N/A'}</td>
                  <td>
                    <span
                      className="status-indicator"
                      style={{ backgroundColor: getStatusColor(point.current_utilization, point.capacity) }}
                    >
                      {getStatusText(point.current_utilization, point.capacity)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ChokePointMonitor;