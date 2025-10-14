import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polygon, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './MapView.css';
import { io } from 'socket.io-client';

import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

/**
 * Fixes a common issue where Leaflet marker icons fail to load in bundled environments.
 */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const MapView = () => {
  // State for map controls and fullscreen view
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const toggleFullscreen = () => {
    setIsMapFullscreen(!isMapFullscreen);
  };
  
  // Map initialization parameters
  const center = [28.62, 77.23]; // Central Delhi
  const zoom = 12;

  // State for data fetched from API and pushed via Socket.IO
  const [chokePoints, setChokePoints] = useState([]);
  // State for REAL-TIME zone metrics (initial state is empty, populated by Socket.IO)
  const [zoneMetrics, setZoneMetrics] = useState([]);

  // State for fetch status and errors
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State for Socket.IO communication
  const [socketMessages, setSocketMessages] = useState([]);
  const [riskAlerts, setRiskAlerts] = useState([]);
  const [evacuationRoutes, setEvacuationRoutes] = useState({});

  // Ref to hold the socket instance
  const socketRef = useRef(null);

  // Effect hook to fetch static Choke Points data periodically from backend API
  useEffect(() => {
    const fetchChokePoints = async () => {
      try {
        setError(null);
        const response = await fetch('http://localhost:3000/api/choke-points');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
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

  // Effect hook for Socket.IO Client Setup and Listener Definitions
  useEffect(() => {
    if (!socketRef.current) {
      const newSocket = io('http://localhost:3000');
      socketRef.current = newSocket;

      // --- Define Listeners ---
      const handleHello = (data) => {
        setSocketMessages(prev => [...prev, { type: 'hello', ...data, timestamp: new Date().toLocaleTimeString() }]);
      };

      const handleRiskAlert = (data) => {
        const LOW_RISK_LEVELS = ['Low', 'Medium'];

        // Clear evacuation route if risk drops for the specific zone
        if (LOW_RISK_LEVELS.includes(data.severity_level) && evacuationRoutes[data.zone_id]) {
            setEvacuationRoutes(prevRoutes => {
                const updatedRoutes = { ...prevRoutes };
                delete updatedRoutes[data.zone_id];
                return updatedRoutes;
            });
        }

        // Add new alert to state for Polygon rendering
        setRiskAlerts(prevAlerts => {
          const maxAlerts = 10;
          let updatedAlerts = [...prevAlerts, data];
          if (updatedAlerts.length > maxAlerts) {
            updatedAlerts = updatedAlerts.slice(-maxAlerts);
          }
          return updatedAlerts;
        });

        // Robust timestamp parsing for socketMessages list
        let formattedTimestamp = 'N/A';
        const timestampToUse = data.timestamp || data.generated_at;
        if (timestampToUse) {
            const dateObj = new Date(timestampToUse);
            if (dateObj instanceof Date && !isNaN(dateObj)) {
                formattedTimestamp = dateObj.toLocaleTimeString();
            } else {
                formattedTimestamp = timestampToUse;
            }
        }
        setSocketMessages(prev => [...prev, { type: 'risk_alert', ...data, timestamp: formattedTimestamp }]);
      };

      const handleEvacuationRoute = (data) => {
        // Store the received route keyed by zone_id
        setEvacuationRoutes(prevRoutes => ({
            ...prevRoutes,
            [data.zone_id]: data
        }));
        setSocketMessages(prev => [...prev, { type: 'evacuation_route', ...data, timestamp: new Date().toLocaleTimeString() }]);
      };

      const handleEvacuationError = (data) => {
        setSocketMessages(prev => [...prev, { type: 'evacuation_error', error: data.error, zone_id: data.zone_id, timestamp: new Date().toLocaleTimeString() }]);
      };

      const handleZoneMetricsUpdate = (data) => {
        // Update the zoneMetrics state with the latest data from the backend
        setZoneMetrics(data);
      };

      // Attach the listeners
      newSocket.on('server_hello', handleHello);
      newSocket.on('risk_alert_generated', handleRiskAlert);
      newSocket.on('evacuation_route_calculated', handleEvacuationRoute);
      newSocket.on('evacuation_error', handleEvacuationError);
      newSocket.on('zone_metrics_update', handleZoneMetricsUpdate);

      // Store listener functions in the ref for cleanup
      socketRef.current.handleHello = handleHello;
      socketRef.current.handleRiskAlert = handleRiskAlert;
      socketRef.current.handleEvacuationRoute = handleEvacuationRoute;
      socketRef.current.handleEvacuationError = handleEvacuationError;
      socketRef.current.handleZoneMetricsUpdate = handleZoneMetricsUpdate;
    }

    return () => {
      if (socketRef.current) {
        // Clean up all event listeners and close the socket connection
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

  // Function to determine marker color based on utilization
  const getMarkerColor = (utilization, capacity) => {
    const util = utilization || 0;
    const cap = capacity || 100;
    const percentage = (util / cap) * 100;
    if (percentage > 80) return '#dc3545';
    if (percentage > 60) return '#ffc107';
    return '#28a745';
  };

  // Function to determine circle color based on density (Vibrant colors)
  const getDensityColor = (density) => {
    if (density > 3.5) return '#FF0000';
    if (density > 2.5) return '#FFA500';
    if (density > 1.5) return '#FFFF00';
    return '#00FF00';
  };

  // Function to determine circle radius based on density (Larger size)
  const getCircleRadius = (density) => {
    return 80 + (density * 30);
  };

  // Function to determine risk zone color based on risk level (Distinct colors)
  const getRiskZoneColor = (riskLevel) => {
    switch (riskLevel?.toLowerCase()) {
      case 'critical':
        return '#8B0000';
      case 'high':
        return '#FF0000';
      case 'medium':
        return '#FFA500';
      case 'low':
        return '#FFFF00';
      default:
        return '#6c757d';
    }
  };

  // Function to determine evacuation route color
  const getEvacuationRouteColor = (riskLevelThatTriggered) => {
    switch (riskLevelThatTriggered?.toLowerCase()) {
      case 'critical':
        return '#FF4500';
      case 'high':
        return '#FF8C00';
      default:
        return '#0000FF';
    }
  };

  /**
   * Generates a placeholder polygon area (square) around a center point for visualization.
   * @param {string} zoneId - ID of the zone.
   * @param {Array<number>} location - [lat, lng] coordinates of the zone center.
   * @returns {Array<Array<number>> | null} Polygon coordinates.
   */
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

  /**
   * Reusable component rendering map layers (zones, routes, markers).
   * @param {boolean} isFullscreen - Indicates if the map is being rendered in the overlay.
   */
  const renderMapLayers = (isFullscreen) => (
    <>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      {/* Render evacuation routes */}
      {Object.entries(evacuationRoutes).map(([zoneId, routeData]) => (
        <Polyline
          key={`evac-route-${zoneId}`}
          positions={routeData.route_coordinates}
          color={getEvacuationRouteColor(routeData.risk_level_that_triggered)}
          weight={isFullscreen ? 7 : 5}
          opacity={0.9}
          dashArray="10, 10"
        >
          {!isFullscreen && <Popup>
            <div>
              <strong>Evacuation Route</strong><br />
              Zone: {routeData.zone_id}<br />
              Triggered by Risk: {routeData.risk_level_that_triggered}<br />
              Distance: {routeData.distance_kms} km<br />
              Calculated at: {new Date(routeData.calculated_at).toLocaleString()}
            </div>
          </Popup>}
        </Polyline>
      ))}

      {/* Render risk zones (Polygons) */}
      {riskAlerts.map((alert, index) => {
        // Map zone ID from alert to its location coordinates
        const zoneMetric = zoneMetrics.find(m => m.zone_id === alert.zone_id); 
        // CRITICAL FIX: The location array must be constructed from individual DB columns (latitude, longitude)
        const location = zoneMetric ? [parseFloat(zoneMetric.latitude), parseFloat(zoneMetric.longitude)] : null; 
        const areaCoords = getZoneArea(alert.zone_id, location);

        if (areaCoords) {
          return (
            <Polygon
              key={`risk-${alert.zone_id}-${index}`}
              positions={areaCoords}
              color={getRiskZoneColor(alert.severity_level)}
              fillColor={getRiskZoneColor(alert.severity_level)}
              fillOpacity={isFullscreen ? 0.4 : 0.3}
              weight={2}
            >
              {!isFullscreen && <Popup>
                <div>
                  <strong>Risk Alert: {alert.severity_level}</strong><br />
                  Zone: {alert.zone_id}<br />
                  Predicted at: {new Date(alert.timestamp || alert.generated_at).toLocaleString()}
                </div>
              </Popup>}
            </Polygon>
          );
        }
        return null;
      })}
      
      {/* Render circles for each zone based on REAL-TIME density */}
      {zoneMetrics.map((metric) => (
        <Circle
          key={metric.id}
          // CRITICAL FIX: Access location using individual DB columns
          center={[parseFloat(metric.latitude), parseFloat(metric.longitude)]}
          radius={getCircleRadius(metric.density)}
          fillColor={getDensityColor(metric.density)}
          color="#000"
          weight={1}
          fillOpacity={0.5}
        >
          {!isFullscreen && <Popup>
            <div>
              <strong>Zone: {metric.zone_id}</strong><br />
              Density: {parseFloat(metric.density).toFixed(2)} p/m²<br />
              Avg. Speed: {parseFloat(metric.avg_speed).toFixed(2)} m/s
            </div>
          </Popup>}
        </Circle>
      ))}
      
      {/* Render choke point markers */}
      {chokePoints.map((point) => (
        <Marker
          key={point.id}
          position={point.location} // This is already processed to [lat, lng] in the chokePoints router
          icon={L.divIcon({
            className: 'custom-marker',
            html: `<div style="background-color: ${getMarkerColor(point.current_utilization, point.capacity)}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white;"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          })}
        >
          {!isFullscreen && <Popup>
            <div>
              <strong>{point.name}</strong><br />
              Status: {point.current_utilization || 'N/A'}/{point.capacity || 'N/A'} ({point.capacity ? Math.round(((point.current_utilization || 0) / point.capacity) * 100) : 0}%)
              <br />
              {point.description}
            </div>
          </Popup>}
        </Marker>
      ))}
    </>
  );


  // Render loading or error state
  if (loading) {
    return <div className="map-container"><p>Loading map and choke points...</p></div>;
  }

  if (error) {
    return <div className="map-container"><p>Error loading data: {error}</p></div>;
  }

  return (
    <div className="map-container">
      {/* --- Fullscreen Modal Overlay --- */}
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
      {/* --- End Fullscreen Modal Overlay --- */}

      <div className="map-header-with-controls">
        <h3>Real-Time Crowd Density Map</h3>
        {/* Fullscreen Button */}
        <button className="fullscreen-toggle-btn" onClick={toggleFullscreen}>
          &#x26F6;
        </button>
      </div>
      
      {/* Display Socket.IO messages for testing/visibility */}
      <div className="socket-messages">
        <h4>Real-Time Alerts:</h4>
        <ul>
          {/* Robust timestamp parsing for riskAlerts display */}
          {riskAlerts.map((alert, index) => {
            let displayTimestamp = 'N/A';
            const timestampToUse = alert.timestamp || alert.generated_at;
            if (timestampToUse) {
                const alertDate = new Date(timestampToUse);
                if (alertDate instanceof Date && !isNaN(alertDate)) {
                    displayTimestamp = alertDate.toLocaleTimeString();
                } else {
                    displayTimestamp = timestampToUse;
                }
            }
            return (
              <li key={`alert-${index}`}>
                <strong>[{displayTimestamp}] {alert.severity_level} Risk:</strong> Zone {alert.zone_id}
              </li>
            );
          })}
          {/* Display evacuation route status */}
          {Object.entries(evacuationRoutes).map(([zoneId, routeData]) => (
            <li key={`evac-status-${zoneId}`} className="evacuation-message">
              <strong>[{new Date().toLocaleTimeString()}] EVACUATION:</strong> Route calculated for {routeData.zone_id}. Distance: {routeData.distance_kms} km.
            </li>
          ))}
          {/* Display hello message */}
          {socketMessages.find(msg => msg.type === 'hello') && (
            <li key="hello-status">
              <strong>[{socketMessages.find(msg => msg.type === 'hello').timestamp}] Status:</strong> Socket connected.
            </li>
          )}
        </ul>
      </div>

      {/* Main Map Container */}
      <MapContainer center={center} zoom={zoom} className="leaflet-map">
        {renderMapLayers(false)}
      </MapContainer>
    </div>
  );
};

export default MapView;