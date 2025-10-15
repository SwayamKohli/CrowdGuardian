import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import './AlertsPanel.css';

const formatAlertType = (typeString) => {
  if (!typeString) return 'N/A';
  return typeString
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const AlertsPanel = ({ selectedZoneId: externalSelectedZoneId, setSelectedZoneId: externalSetSelectedZoneId }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlZone = searchParams.get('zone');

  const [localSelectedZoneId, setLocalSelectedZoneId] = useState(urlZone || null);
  const selectedZoneId = externalSelectedZoneId !== undefined ? externalSelectedZoneId : localSelectedZoneId;
  const setSelectedZoneId = externalSetSelectedZoneId || ((zoneId) => {
    setLocalSelectedZoneId(zoneId);
    if (zoneId) {
      setSearchParams({ zone: zoneId });
    } else {
      setSearchParams({});
    }
  });

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('http://localhost:3000/api/alerts?limit=50');
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      const data = await response.json();
      setAlerts(data);
    } catch (err) {
      console.error('Error fetching alerts:', err);
      setError(err.message);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);

    const socket = io('http://localhost:3000', { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('risk_alert_generated', (newAlert) => {
      setAlerts(prev => {
        const exists = prev.some(a => a.id === newAlert.id);
        if (exists) return prev;
        return [newAlert, ...prev].slice(0, 50);
      });
    });

    return () => {
      clearInterval(interval);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
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

  const clearZoneFilter = () => {
    setSelectedZoneId(null);
  };

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
                <div className="alert-resolved">
                  Resolved at: {formatTime(alert.resolved_at)}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AlertsPanel;