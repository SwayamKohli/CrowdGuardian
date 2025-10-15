import React, { useState, useEffect } from 'react';
import './AlertsPanel.css';

// Helper function to format ALERT_TYPE strings (e.g., CHOKE_POINT_ALERT -> Choke Point Alert)
const formatAlertType = (typeString) => {
  if (!typeString) return 'N/A';
  return typeString
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const AlertsPanel = ({ selectedZoneId, setSelectedZoneId }) => { // <-- Accept props
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch alerts from backend periodically
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('http://localhost:3000/api/alerts?limit=20');
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        setAlerts(data);
      } catch (err) {
        setError(err.message);
        setAlerts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (isoString) => {
    if (typeof isoString === 'string' && !isNaN(Date.parse(isoString))) {
      return new Date(isoString).toLocaleTimeString();
    }
    return isoString || 'N/A';
  };

  const getAlertClass = (severity) => {
    const lowerSeverity = severity ? severity.toLowerCase() : 'info';
    switch (lowerSeverity) {
      case 'critical': return 'alert-item critical';
      case 'high': return 'alert-item high';
      case 'medium': return 'alert-item medium';
      case 'low': return 'alert-item low';
      default: return 'alert-item info';
    }
  };

  // --- V1.5 FEATURE: Clear zone filter ---
  const clearZoneFilter = () => {
    if (setSelectedZoneId) setSelectedZoneId(null);
  };

  // --- V1.5 FEATURE: Filter alerts by selectedZoneId ---
  const filteredAlerts = selectedZoneId
    ? alerts.filter(alert => alert.zone_id === selectedZoneId)
    : alerts;

  if (loading) {
    return (
      <div className="alerts-panel">
        <h3>Alerts & Notifications</h3>
        <p className="loading-message">Loading alerts...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alerts-panel">
        <h3>Alerts & Notifications</h3>
        <p className="error-message">Error loading alerts: {error}</p>
      </div>
    );
  }

  return (
    <div className="alerts-panel">
      <h3>Alerts & Notifications</h3>

      {/* V1.5: Show filter info and clear button */}
      {selectedZoneId && (
        <div className="filter-info">
          <p>
            Showing alerts for <strong>Zone {selectedZoneId}</strong>.{' '}
            <button className="clear-filter-btn" onClick={clearZoneFilter}>
              Show All Alerts
            </button>
          </p>
        </div>
      )}

      <div className="alerts-list">
        {filteredAlerts.length === 0 ? (
          <p className="no-alerts">No alerts at this time.</p>
        ) : (
          filteredAlerts.map((alert) => (
            <div key={alert.id} className={getAlertClass(alert.severity_level)}>
              <div className="alert-header">
                <span className="alert-type">{formatAlertType(alert.alert_type)}</span>
                <span className="alert-severity">{alert.severity_level}</span>
                <span className="alert-time">{formatTime(alert.generated_at)}</span>
              </div>
              <div className="alert-message">{alert.message}</div>
              {alert.resolved && (
                <div className="alert-resolved">Resolved at: {formatTime(alert.resolved_at)}</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AlertsPanel;