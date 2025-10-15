import React, { useState, useEffect, useRef } from 'react';
import './ChokePointMonitor.css';
import { io } from 'socket.io-client';

const ChokePointMonitor = () => {
  const [chokePoints, setChokePoints] = useState([]);
  const [zoneMetrics, setZoneMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const socketRef = useRef(null);

  // Unified fetch for both choke points and zone metrics
  const fetchData = async () => {
    try {
      const [cpRes, zmRes] = await Promise.all([
        fetch('http://localhost:3000/api/choke-points'),
        fetch('http://localhost:3000/api/zone-metrics?limit=100')
      ]);

      if (!cpRes.ok || !zmRes.ok) throw new Error('Failed to fetch data');

      const chokeData = await cpRes.json();
      const zoneData = await zmRes.json();

      // Get latest zone metric per zone_id
      const latestZoneMetrics = {};
      zoneData.forEach(metric => {
        const existing = latestZoneMetrics[metric.zone_id];
        if (!existing || new Date(metric.timestamp) > new Date(existing.timestamp)) {
          latestZoneMetrics[metric.zone_id] = metric;
        }
      });

      setChokePoints(chokeData);
      setZoneMetrics(Object.values(latestZoneMetrics));
      setLastUpdate(Date.now());
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const interval = setInterval(fetchData, 5000); // fallback polling

    const socket = io('http://localhost:3000', { transports: ['websocket'] });
    socketRef.current = socket;

    // Real-time zone metrics update
    socket.on('zone_metrics_update', (liveMetrics) => {
      const latestZoneMetrics = {};
      liveMetrics.forEach(metric => {
        const existing = latestZoneMetrics[metric.zone_id];
        if (!existing || new Date(metric.timestamp) > new Date(existing.timestamp)) {
          latestZoneMetrics[metric.zone_id] = metric;
        }
      });
      setZoneMetrics(Object.values(latestZoneMetrics));
      setLastUpdate(Date.now()); // trigger flash effect
    });

    // Optional: Listen for risk alerts
    socket.on('risk_alert_generated', (alert) => {
      console.log('Risk alert received:', alert);
      // Future: Implement visual alert/notification
    });

    return () => {
      clearInterval(interval);
      if (socketRef.current) socketRef.current.close();
    };
  }, []);

  // ----- Helper Functions -----
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
    if (percentage > 80) return '#dc3545'; // Red
    if (percentage > 60) return '#ffc107'; // Yellow
    return '#28a745'; // Green
  };

  const getDensityColor = (density) => {
    if (density > 5.0) return '#8B0000'; // Critical
    if (density > 4.0) return '#dc3545'; // High
    if (density > 3.0) return '#ffc107'; // Medium
    return '#28a745'; // Low
  };

  // ----- UI -----
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
      <div className="monitor-container">

        {/* ZONE METRICS FRAME */}
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
                <tr
                  key={zone.zone_id}
                  className={Date.now() - lastUpdate < 1000 ? 'flash-row' : ''}
                >
                  <td>{zone.zone_id}</td>
                  <td>{zone.description || 'N/A'}</td>
                  <td
                    style={{
                      backgroundColor: getDensityColor(zone.density),
                      color: 'white',
                      fontWeight: 'bold',
                    }}
                  >
                    {parseFloat(zone.density).toFixed(2)}
                  </td>
                  <td>{parseFloat(zone.avg_speed).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">Note: High density/low speed triggers ML prediction.</p>
        </div>

        {/* CHOKE POINTS FRAME */}
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
                      style={{
                        backgroundColor: getStatusColor(point.current_utilization, point.capacity),
                      }}
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