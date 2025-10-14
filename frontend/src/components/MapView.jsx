import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polygon, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './MapView.css';
import { io } from 'socket.io-client';

import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Essential fix for default marker icons not loading in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const MapView = () => {
  // --- NEW STATE for Fullscreen Modal ---
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const toggleFullscreen = () => {
    setIsMapFullscreen(!isMapFullscreen);
  };
  // --- END NEW STATE ---

  // Map initialization parameters
  const center = [28.62, 77.23]; // Central Delhi
  const zoom = 12; // Zoom level for wide area visibility

  // State for data from API and simulation
  const [chokePoints, setChokePoints] = useState([]);
  // Zone Metrics with Central Delhi locations
  const [zoneMetrics, setZoneMetrics] = useState([
    { id: 'Z1_CP', zoneId: 'Z1', location: [28.6316, 77.2180], density: 2.5, avgSpeed: 0.9, flowDirection: 90, description: 'Zone Z1 (Connaught Place Area)' },
    { id: 'Z2_IG', zoneId: 'Z2', location: [28.6129, 77.2274], density: 4.0, avgSpeed: 0.7, flowDirection: 180, description: 'Zone Z2 (India Gate Area)' },
    { id: 'Z3_LT', zoneId: 'Z3', location: [28.5535, 77.2588], density: 1.8, avgSpeed: 1.2, flowDirection: 0, description: 'Zone Z3 (Lotus Temple Vicinity)' },
    { id: 'Z4_RF', zoneId: 'Z4', location: [28.6575, 77.2340], density: 3.2, avgSpeed: 0.8, flowDirection: 270, description: 'Zone Z4 (Red Fort Area)' },
  ]);

  // State for loading/error
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State for Socket.IO messages (for testing/visibility)
  const [socketMessages, setSocketMessages] = useState([]);

  // State for real-time risk alerts received via Socket.IO
  const [riskAlerts, setRiskAlerts] = useState([]);

  // State for evacuation routes (object keyed by zone_id)
  const [evacuationRoutes, setEvacuationRoutes] = useState({});

  // Ref to hold the socket instance for stable listeners
  const socketRef = useRef(null);

  // Effect hook to simulate periodic updates to zone density (temporary)
  useEffect(() => {
    const interval = setInterval(() => {
      setZoneMetrics(prevMetrics =>
        prevMetrics.map(metric => ({
          ...metric,
          density: Math.max(0, metric.density + (Math.random() * 0.5 - 0.25)),
          avgSpeed: Math.max(0, metric.avgSpeed + (Math.random() * 0.1 - 0.05))
        }))
      );
    }, 3000);
    return () => clearInterval(interval);
  }, []);

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

      // Attach the listeners
      newSocket.on('server_hello', handleHello);
      newSocket.on('risk_alert_generated', handleRiskAlert);
      newSocket.on('evacuation_route_calculated', handleEvacuationRoute);
      newSocket.on('evacuation_error', handleEvacuationError);

      // Store listener functions in the ref for cleanup
      socketRef.current.handleHello = handleHello;
      socketRef.current.handleRiskAlert = handleRiskAlert;
      socketRef.current.handleEvacuationRoute = handleEvacuationRoute;
      socketRef.current.handleEvacuationError = handleEvacuationError;
    }

    return () => {
      if (socketRef.current) {
        // Clean up all event listeners and close the socket connection
        socketRef.current.off('server_hello', socketRef.current.handleHello);
        socketRef.current.off('risk_alert_generated', socketRef.current.handleRiskAlert);
        socketRef.current.off('evacuation_route_calculated', socketRef.current.handleEvacuationRoute);
        socketRef.current.off('evacuation_error', socketRef.current.handleEvacuationError);
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [evacuationRoutes]); // Dependency updated

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
    if (density > 3.5) return '#FF0000'; // Bright Red
    if (density > 2.5) return '#FFA500'; // Orange
    if (density > 1.5) return '#FFFF00'; // Yellow
    return '#00FF00'; // Bright Green
  };

  // Function to determine circle radius based on density (Larger size)
  const getCircleRadius = (density) => {
    return 80 + (density * 30);
  };

  // Function to determine risk zone color based on risk level (Distinct colors)
  const getRiskZoneColor = (riskLevel) => {
    switch (riskLevel?.toLowerCase()) {
      case 'critical':
        return '#8B0000'; // Dark Red
      case 'high':
        return '#FF0000'; // Bright Red
      case 'medium':
        return '#FFA500'; // Orange
      case 'low':
        return '#FFFF00'; // Yellow
      default:
        return '#6c757d'; // Grey
    }
  };

  // Function to determine evacuation route color
  const getEvacuationRouteColor = (riskLevelThatTriggered) => {
    switch (riskLevelThatTriggered?.toLowerCase()) {
      case 'critical':
        return '#FF4500'; // OrangeRed
      case 'high':
        return '#FF8C00'; // DarkOrange
      default:
        return '#0000FF'; // Pure Blue default
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

  // Render loading or error state
  if (loading) {
    return <div className="map-container"><p>Loading map and choke points...</p></div>;
  }

  if (error) {
    return <div className="map-container"><p>Error loading data: {error}</p></div>;
  }

  return (
    <div className="map-container">
      {/* --- MODAL IMPLEMENTATION --- */}
      {isMapFullscreen && (
        <div className="fullscreen-map-overlay">
          <div className="fullscreen-map-header">
            <h3>Real-Time Crowd Density Map (Fullscreen)</h3>
            <button className="fullscreen-close-btn" onClick={toggleFullscreen}>Close</button>
          </div>
          <MapContainer center={center} zoom={zoom} className="leaflet-map fullscreen-leaflet-map">
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
                weight={5}
                opacity={0.8}
                dashArray="10, 10"
              />
            ))}
            {/* Render risk zones */}
            {riskAlerts.map((alert, index) => {
              const zoneMetric = zoneMetrics.find(m => m.zoneId === alert.zone_id);
              const location = zoneMetric ? zoneMetric.location : null;
              const areaCoords = getZoneArea(alert.zone_id, location);

              if (areaCoords) {
                return (
                  <Polygon
                    key={`risk-${alert.zone_id}-${index}`}
                    positions={areaCoords}
                    color={getRiskZoneColor(alert.severity_level)}
                    fillColor={getRiskZoneColor(alert.severity_level)}
                    fillOpacity={0.3}
                    weight={2}
                  />
                );
              }
              return null;
            })}
            {/* Render zone circles */}
            {zoneMetrics.map((metric) => (
              <Circle
                key={metric.id}
                center={metric.location}
                radius={getCircleRadius(metric.density)}
                fillColor={getDensityColor(metric.density)}
                color="#000"
                weight={1}
                fillOpacity={0.5}
              />
            ))}
            {/* Render choke point markers */}
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
              />
            ))}
          </MapContainer>
        </div>
      )}
      {/* --- END MODAL IMPLEMENTATION --- */}

      <div className="map-header-with-controls">
        <h3>Real-Time Crowd Density Map</h3>
        {/* --- FULLSCREEN BUTTON --- */}
        <button className="fullscreen-toggle-btn" onClick={toggleFullscreen}>
          {/* Fullscreen Icon using Unicode or SVG */}
          &#x26F6; {/* Alternative: &#x1F50D; (Magnifying Glass) or &#x1F5A5; (Desktop Window) */}
        </button>
        {/* --- END FULLSCREEN BUTTON --- */}
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
            weight={5}
            opacity={0.8}
            dashArray="10, 10"
          >
            <Popup>
              <div>
                <strong>Evacuation Route</strong><br />
                Zone: {routeData.zone_id}<br />
                Triggered by Risk: {routeData.risk_level_that_triggered}<br />
                Distance: {routeData.distance_kms} km<br />
                Calculated at: {new Date(routeData.calculated_at).toLocaleString()}
              </div>
            </Popup>
          </Polyline>
        ))}
        {/* Render risk zones */}
        {riskAlerts.map((alert, index) => {
          const zoneMetric = zoneMetrics.find(m => m.zoneId === alert.zone_id);
          const location = zoneMetric ? zoneMetric.location : null;
          const areaCoords = getZoneArea(alert.zone_id, location);

          if (areaCoords) {
            return (
              <Polygon
                key={`risk-${alert.zone_id}-${index}`}
                positions={areaCoords}
                color={getRiskZoneColor(alert.severity_level)}
                fillColor={getRiskZoneColor(alert.severity_level)}
                fillOpacity={0.3}
                weight={2}
              >
                <Popup>
                  <div>
                    <strong>Risk Alert: {alert.severity_level}</strong><br />
                    Zone: {alert.zone_id}<br />
                    Predicted at: {new Date(alert.timestamp || alert.generated_at).toLocaleString()}
                  </div>
                </Popup>
              </Polygon>
            );
          }
          return null;
        })}
        {/* Render zone circles */}
        {zoneMetrics.map((metric) => (
          <Circle
            key={metric.id}
            center={metric.location}
            radius={getCircleRadius(metric.density)}
            fillColor={getDensityColor(metric.density)}
            color="#000"
            weight={1}
            fillOpacity={0.5}
          >
            <Popup>
              <div>
                <strong>Zone: {metric.zoneId}</strong><br />
                Density: {metric.density.toFixed(2)} p/m²<br />
                Avg. Speed: {metric.avgSpeed.toFixed(2)} m/s
              </div>
            </Popup>
          </Circle>
        ))}
        {/* Render choke point markers */}
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
            <Popup>
              <div>
                <strong>{point.name}</strong><br />
                Status: {point.current_utilization || 'N/A'}/{point.capacity || 'N/A'} ({point.capacity ? Math.round(((point.current_utilization || 0) / point.capacity) * 100) : 0}%)
                <br />
                {point.description}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default MapView;