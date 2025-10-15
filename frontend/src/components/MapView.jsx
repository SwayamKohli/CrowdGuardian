import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polygon, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './MapView.css';
import { io } from 'socket.io-client';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// --- FIX: Ensure default Leaflet marker icons load properly in bundled environments ---
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const MapView = () => {
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const toggleFullscreen = () => setIsMapFullscreen(!isMapFullscreen);

  const center = [28.62, 77.23]; // Central Delhi
  const zoom = 12;

  const [chokePoints, setChokePoints] = useState([]);
  const [zoneMetrics, setZoneMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [socketMessages, setSocketMessages] = useState([]);
  const [riskAlerts, setRiskAlerts] = useState([]);
  const [evacuationRoutes, setEvacuationRoutes] = useState({});

  const socketRef = useRef(null);

  // --- Fetch Choke Points periodically ---
  useEffect(() => {
    const fetchChokePoints = async () => {
      try {
        setError(null);
        const response = await fetch('http://localhost:3000/api/choke-points');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        setChokePoints(data);
      } catch (err) {
        console.error('Error fetching choke points:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchChokePoints();
    const intervalId = setInterval(fetchChokePoints, 5000);
    return () => clearInterval(intervalId);
  }, []);

  // --- Socket.IO Setup ---
  useEffect(() => {
    if (!socketRef.current) {
      const newSocket = io('http://localhost:3000');
      socketRef.current = newSocket;

      const handleHello = (data) => {
        setSocketMessages(prev => [...prev, { type: 'hello', ...data, timestamp: new Date().toLocaleTimeString() }]);
      };

      const handleRiskAlert = (data) => {
        const LOW_RISK_LEVELS = ['Low', 'Medium'];
        if (LOW_RISK_LEVELS.includes(data.severity_level) && evacuationRoutes[data.zone_id]) {
          setEvacuationRoutes(prevRoutes => {
            const updated = { ...prevRoutes };
            delete updated[data.zone_id];
            return updated;
          });
        }

        setRiskAlerts(prev => {
          const updated = [...prev, data].slice(-10);
          return updated;
        });

        let formattedTimestamp = 'N/A';
        const ts = data.timestamp || data.generated_at;
        if (ts) {
          const d = new Date(ts);
          formattedTimestamp = d instanceof Date && !isNaN(d) ? d.toLocaleTimeString() : ts;
        }

        setSocketMessages(prev => [...prev, { type: 'risk_alert', ...data, timestamp: formattedTimestamp }]);
      };

      const handleEvacuationRoute = (data) => {
        setEvacuationRoutes(prev => ({ ...prev, [data.zone_id]: data }));
        setSocketMessages(prev => [...prev, { type: 'evacuation_route', ...data, timestamp: new Date().toLocaleTimeString() }]);
      };

      const handleEvacuationError = (data) => {
        setSocketMessages(prev => [...prev, { type: 'evacuation_error', error: data.error, zone_id: data.zone_id, timestamp: new Date().toLocaleTimeString() }]);
      };

      // --- FIX/ENHANCE: Listener for real-time zone metrics updates with robust numeric parsing ---
      const handleZoneMetricsUpdate = (data) => {
        const parsedData = data.map(metric => {
          const parsedLatitude = parseFloat(metric.latitude);
          const parsedLongitude = parseFloat(metric.longitude);
          const parsedDensity = parseFloat(metric.density);
          const parsedAvgSpeed = parseFloat(metric.avg_speed);

          return {
            ...metric,
            latitude: !isNaN(parsedLatitude) ? parsedLatitude : 0,
            longitude: !isNaN(parsedLongitude) ? parsedLongitude : 0,
            density: !isNaN(parsedDensity) ? parsedDensity : 0,
            avg_speed: !isNaN(parsedAvgSpeed) ? parsedAvgSpeed : 0,
          };
        });

        setZoneMetrics(parsedData);

        // Optional: socketMessages for visibility
        // setSocketMessages(prev => [...prev, { type: 'zone_metrics_update', count: parsedData.length, timestamp: new Date().toLocaleTimeString() }]);
      };
      // --- END FIX/ENHANCE ---

      newSocket.on('server_hello', handleHello);
      newSocket.on('risk_alert_generated', handleRiskAlert);
      newSocket.on('evacuation_route_calculated', handleEvacuationRoute);
      newSocket.on('evacuation_error', handleEvacuationError);
      newSocket.on('zone_metrics_update', handleZoneMetricsUpdate);

      socketRef.current.handleHello = handleHello;
      socketRef.current.handleRiskAlert = handleRiskAlert;
      socketRef.current.handleEvacuationRoute = handleEvacuationRoute;
      socketRef.current.handleEvacuationError = handleEvacuationError;
      socketRef.current.handleZoneMetricsUpdate = handleZoneMetricsUpdate;
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.off('server_hello', socketRef.current.handleHello);
        socketRef.current.off('risk_alert_generated', socketRef.current.handleRiskAlert);
        socketRef.current.off('evacuation_route_calculated', socketRef.current.handleEvacuationRoute);
        socketRef.current.off('evacuation_error', socketRef.current.handleEvacuationError);
        socketRef.current.off('zone_metrics_update', socketRef.current.handleZoneMetricsUpdate);
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [evacuationRoutes]);

  // --- Map Utility Functions ---
  const getMarkerColor = (utilization, capacity) => {
    const util = utilization || 0;
    const cap = capacity || 100;
    const percentage = (util / cap) * 100;
    if (percentage > 80) return '#dc3545';
    if (percentage > 60) return '#ffc107';
    return '#28a745';
  };

  const getDensityColor = (density) => {
    if (density > 3.5) return '#FF0000';
    if (density > 2.5) return '#FFA500';
    if (density > 1.5) return '#FFFF00';
    return '#00FF00';
  };

  const getCircleRadius = (density) => 80 + (density * 30);

  const getRiskZoneColor = (riskLevel) => {
    switch (riskLevel?.toLowerCase()) {
      case 'critical': return '#8B0000';
      case 'high': return '#FF0000';
      case 'medium': return '#FFA500';
      case 'low': return '#FFFF00';
      default: return '#6c757d';
    }
  };

  const getEvacuationRouteColor = (riskLevel) => {
    switch (riskLevel?.toLowerCase()) {
      case 'critical': return '#FF4500';
      case 'high': return '#FF8C00';
      default: return '#0000FF';
    }
  };

  const getZoneArea = (zoneId, location) => {
    const offset = 0.002;
    if (location && Array.isArray(location) && location.length === 2) {
      const [lat, lng] = location;
      return [
        [lat - offset, lng - offset],
        [lat - offset, lng + offset],
        [lat + offset, lng + offset],
        [lat + offset, lng - offset]
      ];
    }
    return null;
  };

  // --- Render Map Layers ---
  const renderMapLayers = (isFullscreen) => (
    <>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Evacuation Routes */}
      {Object.entries(evacuationRoutes).map(([zoneId, routeData]) => (
        <Polyline
          key={`evac-route-${zoneId}`}
          positions={routeData.route_coordinates}
          color={getEvacuationRouteColor(routeData.risk_level_that_triggered)}
          weight={isFullscreen ? 7 : 5}
          opacity={0.9}
          dashArray="10, 10"
        >
          {!isFullscreen && (
            <Popup>
              <div>
                <strong>Evacuation Route</strong><br />
                Zone: {routeData.zone_id}<br />
                Triggered by Risk: {routeData.risk_level_that_triggered}<br />
                Distance: {routeData.distance_kms} km<br />
                Calculated at: {new Date(routeData.calculated_at).toLocaleString()}
              </div>
            </Popup>
          )}
        </Polyline>
      ))}

      {/* Risk Zones */}
      {riskAlerts.map((alert, index) => {
        const zoneMetric = zoneMetrics.find(m => m.zone_id === alert.zone_id);
        const location = zoneMetric ? [zoneMetric.latitude, zoneMetric.longitude] : null;
        const areaCoords = getZoneArea(alert.zone_id, location);
        if (!areaCoords) return null;

        return (
          <Polygon
            key={`risk-${alert.zone_id}-${index}`}
            positions={areaCoords}
            color={getRiskZoneColor(alert.severity_level)}
            fillColor={getRiskZoneColor(alert.severity_level)}
            fillOpacity={isFullscreen ? 0.4 : 0.3}
            weight={2}
          >
            {!isFullscreen && (
              <Popup>
                <div>
                  <strong>Risk Alert: {alert.severity_level}</strong><br />
                  Zone: {alert.zone_id}<br />
                  Predicted at: {new Date(alert.timestamp || alert.generated_at).toLocaleString()}
                </div>
              </Popup>
            )}
          </Polygon>
        );
      })}

      {/* Render circles for each zone based on REAL-TIME density from Socket.IO */}
      {zoneMetrics.map((metric) => (
        <Circle
          key={metric.id || `${metric.zone_id}-${metric.timestamp}`}
          center={[metric.latitude, metric.longitude]}
          radius={getCircleRadius(metric.density)}
          fillColor={getDensityColor(metric.density)}
          color="#000"
          weight={1}
          fillOpacity={0.5}
        >
          {!isFullscreen && (
            <Popup>
              <div>
                <strong>Zone: {metric.zone_id}</strong><br />
                Density: {metric.density.toFixed(2)} p/m²<br />
                Avg. Speed: {metric.avg_speed.toFixed(2)} m/s
              </div>
            </Popup>
          )}
        </Circle>
      ))}

      {/* Choke Point Markers */}
      {chokePoints.map((point) => (
        <Marker
          key={point.id}
          position={point.location}
          icon={L.divIcon({
            className: 'custom-marker',
            html: `<div style="background-color: ${getMarkerColor(point.current_utilization, point.capacity)}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white;"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          })}
        >
          {!isFullscreen && (
            <Popup>
              <div>
                <strong>{point.name}</strong><br />
                Status: {point.current_utilization || 'N/A'}/{point.capacity || 'N/A'} (
                {point.capacity ? Math.round(((point.current_utilization || 0) / point.capacity) * 100) : 0}%)
                <br />
                {point.description}
              </div>
            </Popup>
          )}
        </Marker>
      ))}
    </>
  );

  if (loading) return <div className="map-container"><p>Loading map and choke points...</p></div>;
  if (error) return <div className="map-container"><p>Error loading data: {error}</p></div>;

  return (
    <div className="map-container">
      {/* Fullscreen Map */}
      {isMapFullscreen && (
        <div className="fullscreen-map-overlay">
          <div className="fullscreen-map-header">
            <h3>Real-Time Crowd Density Map (Fullscreen)</h3>
            <button className="fullscreen-close-btn" onClick={toggleFullscreen}>Close</button>
          </div>
          <MapContainer center={center} zoom={zoom} className="leaflet-map fullscreen-leaflet-map">
            {renderMapLayers(true)}
          </MapContainer>
        </div>
      )}

      <div className="map-header-with-controls">
        <h3>Real-Time Crowd Density Map</h3>
        <button className="fullscreen-toggle-btn" onClick={toggleFullscreen}>
          &#x26F6;
        </button>
      </div>

      {/* Socket Messages Display */}
      <div className="socket-messages">
        <h4>Real-Time Alerts:</h4>
        <ul>
          {riskAlerts.map((alert, index) => {
            let ts = alert.timestamp || alert.generated_at;
            const alertDate = new Date(ts);
            const displayTimestamp = alertDate instanceof Date && !isNaN(alertDate)
              ? alertDate.toLocaleTimeString()
              : ts || 'N/A';
            return (
              <li key={`alert-${index}`}>
                <strong>[{displayTimestamp}] {alert.severity_level} Risk:</strong> Zone {alert.zone_id}
              </li>
            );
          })}
          {Object.entries(evacuationRoutes).map(([zoneId, routeData]) => (
            <li key={`evac-status-${zoneId}`} className="evacuation-message">
              <strong>[{new Date().toLocaleTimeString()}] EVACUATION:</strong> Route calculated for {routeData.zone_id}. Distance: {routeData.distance_kms} km.
            </li>
          ))}
          {socketMessages.find(msg => msg.type === 'hello') && (
            <li key="hello-status">
              <strong>[{socketMessages.find(msg => msg.type === 'hello').timestamp}] Status:</strong> Socket connected.
            </li>
          )}
        </ul>
      </div>

      {/* Main Map */}
      <MapContainer center={center} zoom={zoom} className="leaflet-map">
        {renderMapLayers(false)}
      </MapContainer>
    </div>
  );
};

export default MapView;