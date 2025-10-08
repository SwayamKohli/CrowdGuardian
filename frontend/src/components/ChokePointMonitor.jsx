import React, { useState, useEffect } from 'react';
import './ChokePointMonitor.css';

const ChokePointMonitor = () => {
  const [chokePoints, setChokePoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchChokePoints = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('http://localhost:3000/api/choke-points');
        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }
        const data = await response.json();
        setChokePoints(data);
      } catch (err) {
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

  const getStatusText = (utilization, capacity) => {
    const util = utilization || 0;
    const cap = capacity || 100;
    const percentage = (util / cap) * 100;
    if (percentage > 80) return 'High Risk';
    if (percentage > 60) return 'Medium Risk';
    return 'Low Risk';
  };

  const getStatusColor = (utilization, capacity) => {
    const util = utilization || 0;
    const cap = capacity || 100;
    const percentage = (util / cap) * 100;
    if (percentage > 80) return '#dc3545';
    if (percentage > 60) return '#ffc107';
    return '#28a745';
  };

  if (loading) {
    return (
      <div className="choke-point-monitor">
        <h3>Choke Point Monitor</h3>
        <p className="loading-message">Loading choke point data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="choke-point-monitor">
        <h3>Choke Point Monitor</h3>
        <p className="error-message">Error loading choke point data: {error}</p>
      </div>
    );
  }

  return (
    <div className="choke-point-monitor">
      <h3>Choke Point Monitor</h3>
      <div className="choke-points-list">
        {chokePoints.length === 0 ? (
          <p className="no-chokepoints">No choke points available.</p>
        ) : (
          <table className="choke-points-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Utilization</th>
                <th>Capacity</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {chokePoints.map((point) => (
                <tr key={point.id}>
                  <td>{point.name}</td>
                  <td>{point.description}</td>
                  <td>{point.current_utilization || 'N/A'}</td>
                  <td>{point.capacity || 'N/A'}</td>
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
        )}
      </div>
    </div>
  );
};

export default ChokePointMonitor;