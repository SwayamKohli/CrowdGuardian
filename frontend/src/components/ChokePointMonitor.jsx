import React, { useState, useEffect } from 'react';
import './ChokePointMonitor.css';

const ChokePointMonitor = () => {
  // State to hold the list of choke points with simulated data
  const [chokePoints, setChokePoints] = useState([
    {
      id: 1,
      name: 'Main Entrance A',
      location: [28.6150, 77.2080],
      capacity: 100,
      currentUtilization: 85,
      description: 'Primary entry gate',
    },
    {
      id: 2,
      name: 'Main Exit B',
      location: [28.6130, 77.2100],
      capacity: 80,
      currentUtilization: 70,
      description: 'Main exit route',
    },
    {
      id: 3,
      name: 'Narrow Corridor C',
      location: [28.6140, 77.2090],
      capacity: 50,
      currentUtilization: 45,
      description: 'Connecting hallways',
    },
  ]);

  // Effect hook to simulate periodic updates to utilization
  useEffect(() => {
    const interval = setInterval(() => {
      setChokePoints(prevPoints =>
        prevPoints.map(point => ({
          ...point,
          currentUtilization: Math.min(
            point.capacity,
            Math.max(0, point.currentUtilization + Math.floor(Math.random() * 5) - 2)
          )
        }))
      );
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []); // Runs once on component mount

  // Function to determine status text based on utilization percentage
  const getStatusText = (utilization, capacity) => {
    const percentage = (utilization / capacity) * 100;
    if (percentage > 80) return 'High Risk';
    if (percentage > 60) return 'Medium Risk';
    return 'Low Risk';
  };

  // Function to determine status color based on utilization percentage
  const getStatusColor = (utilization, capacity) => {
    const percentage = (utilization / capacity) * 100;
    if (percentage > 80) return '#dc3545'; // Red (High Risk)
    if (percentage > 60) return '#ffc107'; // Yellow (Medium Risk)
    return '#28a745'; // Green (Low Risk)
  };

  return (
    <div className="choke-point-monitor">
      <h3>Choke Point Monitor</h3>
      <div className="choke-points-list">
        {chokePoints.length === 0 ? (
          <p className="no-chokepoints">No choke points defined.</p>
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
                  <td>{point.currentUtilization}</td>
                  <td>{point.capacity}</td>
                  <td>
                    <span
                      className="status-indicator"
                      style={{ backgroundColor: getStatusColor(point.currentUtilization, point.capacity) }}
                    >
                      {getStatusText(point.currentUtilization, point.capacity)}
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