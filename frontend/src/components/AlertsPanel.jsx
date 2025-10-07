import React, { useState, useEffect } from 'react';
import './AlertsPanel.css';

const AlertsPanel = () => {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const initialAlerts = [
      {
        id: 1,
        type: 'HIGH_RISK',
        severity: 'CRITICAL',
        message: 'Choke point "Main Entrance A" approaching capacity (85%)',
        timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
      },
      {
        id: 2,
        type: 'EVACUATION',
        severity: 'HIGH',
        message: 'Evacuation route recommended for Zone Z1 due to increased density.',
        timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      },
      {
        id: 3,
        type: 'INFO',
        severity: 'LOW',
        message: 'System operational. No critical risks detected.',
        timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
      },
    ];
    setAlerts(initialAlerts);

    const interval = setInterval(() => {
      const newAlert = {
        id: Date.now(),
        type: 'PANIC_DETECTED',
        severity: 'CRITICAL',
        message: `Potential panic detected near coordinates (simulated).`,
        timestamp: new Date().toISOString(),
      };
      setAlerts(prevAlerts => [newAlert, ...prevAlerts]);
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (isoString) => {
    return new Date(isoString).toLocaleTimeString();
  };

  const getAlertClass = (severity) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'alert-item critical';
      case 'high':
        return 'alert-item high';
      case 'medium':
        return 'alert-item medium';
      case 'low':
        return 'alert-item low';
      default:
        return 'alert-item info';
    }
  };

  return (
    <div className="alerts-panel">
      <h3>Alerts & Notifications</h3>
      <div className="alerts-list">
        {alerts.length === 0 ? (
          <p className="no-alerts">No alerts at this time.</p>
        ) : (
          alerts.map((alert) => (
            <div key={alert.id} className={getAlertClass(alert.severity)}>
              <div className="alert-header">
                <span className="alert-type">{alert.type}</span>
                <span className="alert-severity">{alert.severity}</span>
                <span className="alert-time">{formatTime(alert.timestamp)}</span>
              </div>
              <div className="alert-message">
                {alert.message}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AlertsPanel;