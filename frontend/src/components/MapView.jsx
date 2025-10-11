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
  const center = [28.6139, 77.2090];
  const zoom = 13;

  // State for data from API and simulation
  const [chokePoints, setChokePoints] = useState([]);
  const [zoneMetrics, setZoneMetrics] = useState([
    { id: 'Z1', zoneId: 'Z1', location: [28.6145, 77.2085], density: 2.5, avgSpeed: 0.9, flowDirection: 90 },
    { id: 'Z2', zoneId: 'Z2', location: [28.6135, 77.2095], density: 4.0, avgSpeed: 0.7, flowDirection: 180 },
    { id: 'Z3', zoneId: 'Z3', location: [28.6142, 77.2092], density: 1.8, avgSpeed: 1.2, flowDirection: 0 },
    { id: 'Z4', zoneId: 'Z4', location: [28.6148, 77.2098], density: 3.2, avgSpeed: 0.8, flowDirection: 270 },
  ]);

  // State for loading/error
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State for Socket.IO messages (for testing/visibility)
  const [socketMessages, setSocketMessages] = useState([]);

  // State for real-time risk alerts received via Socket.IO
  const [riskAlerts, setRiskAlerts] = useState([]);

  // State for the evacuation route received via Socket.IO
  const [evacuationRoute, setEvacuationRoute] = useState(null);

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

  // Effect hook to fetch static Choke Points data once from backend API
  useEffect(() => {
    const fetchChokePoints = async () => {
      try {
        setLoading(true);
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
        // Add new alert to state for Polygon rendering
        setRiskAlerts(prevAlerts => {
          const maxAlerts = 10;
          let updatedAlerts = [...prevAlerts, data];
          if (updatedAlerts.length > maxAlerts) {
            updatedAlerts = updatedAlerts.slice(-maxAlerts);
          }
          return updatedAlerts;
        });
        setSocketMessages(prev => [...prev, { type: 'risk_alert', ...data, timestamp: new Date().toLocaleTimeString() }]);
      };

      const handleEvacuationRoute = (data) => {
        // Store the received route data for Polyline rendering
        setEvacuationRoute(data);
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
  }, []);

  // Function to determine marker color based on utilization
  const getMarkerColor = (utilization, capacity) => {
    const util = utilization || 0;
    const cap = capacity || 100;
    const percentage = (util / cap) * 100;
    if (percentage > 80) return '#dc3545'; // High Risk
    if (percentage > 60) return '#ffc107'; // Medium Risk
    return '#28a745'; // Low Risk
  };

  // Function to determine circle color based on density
  const getDensityColor = (density) => {
    if (density > 3.5) return '#dc3545';
    if (density > 2.5) return '#ffc107';
    if (density > 1.5) return '#28a745';
    return '#17a2b8';
  };

  // Function to determine circle radius based on density
  const getCircleRadius = (density) => {
    return 50 + (density * 20);
  };

  // Function to determine risk zone color based on risk level
  const getRiskZoneColor = (riskLevel) => {
    switch (riskLevel?.toLowerCase()) {
      case 'critical':
        return '#8B0000';
      case 'high':
        return '#dc3545';
      case 'medium':
        return '#ffc107';
      case 'low':
        return '#28a745';
      default:
        return '#6c757d';
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
        return '#0000FF'; // Blue default
    }
  };

  /**
   * Generates a placeholder polygon area (square) around a center point for visualization.
   * @param {string} zoneId - ID of the zone.
   * @param {Array<number>} location - [lat, lng] coordinates of the zone center.
   * @returns {Array<Array<number>> | null} Polygon coordinates.
   */
  const getZoneArea = (zoneId, location) => {
    const offset = 0.0005;
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
      <h3>Real-Time Crowd Density Map</h3>
      {/* Display Socket.IO messages for testing/visibility */}
      <div className="socket-messages">
        <h4>Real-Time Alerts:</h4>
        <ul>
          {riskAlerts.map((alert, index) => (
            <li key={`alert-${index}`}>
              <strong>[{new Date(alert.timestamp).toLocaleTimeString()}] {alert.severity_level} Risk:</strong> Zone {alert.zone_id}
            </li>
          ))}
          {/* Display evacuation route status if available */}
          {evacuationRoute && (
            <li key="evac-status" className="evacuation-message">
              <strong>[{new Date().toLocaleTimeString()}] EVACUATION:</strong> Route calculated for {evacuationRoute.zone_id}. Distance: {evacuationRoute.distance_kms} km.
            </li>
          )}
          {/* Display hello message for connection confirmation */}
          {socketMessages.find(msg => msg.type === 'hello') && (
            <li key="hello-status">
              <strong>[{socketMessages.find(msg => msg.type === 'hello').timestamp}] Status:</strong> Socket connected.
            </li>
          )}
        </ul>
      </div>
      <MapContainer center={center} zoom={zoom} className="leaflet-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* Render the evacuation route as a Polyline if it exists */}
        {evacuationRoute && (
          <Polyline
            positions={evacuationRoute.route_coordinates} // Array of [lat, lng] pairs
            color={getEvacuationRouteColor(evacuationRoute.risk_level_that_triggered)}
            weight={5}
            opacity={0.8}
            dashArray="10, 10"
          >
            <Popup>
              <div>
                <strong>Evacuation Route</strong><br />
                Zone: {evacuationRoute.zone_id}<br />
                Triggered by Risk: {evacuationRoute.risk_level_that_triggered}<br />
                Distance: {evacuationRoute.distance_kms} km<br />
                Calculated at: {new Date(evacuationRoute.calculated_at).toLocaleString()}
              </div>
            </Popup>
          </Polyline>
        )}

        {/* Render risk zones as Polygons based on received alerts */}
        {riskAlerts.map((alert, index) => {
          const zoneMetric = zoneMetrics.find(m => m.zoneId === alert.zone_id);
          const location = zoneMetric ? zoneMetric.location : null;
          const areaCoords = getZoneArea(alert.zone_id, location);

          if (areaCoords) {
            return (
              <Polygon
                key={`risk-${alert.zone_id}-${index}`}
                positions={areaCoords}
                color={getRiskZoneColor(alert.predicted_risk_level)}
                fillColor={getRiskZoneColor(alert.predicted_risk_level)}
                fillOpacity={0.3}
                weight={2}
              >
                <Popup>
                  <div>
                    <strong>Risk Alert: {alert.predicted_risk_level}</strong><br />
                    Zone: {alert.zone_id}<br />
                    Predicted at: {new Date(alert.timestamp).toLocaleString()}
                  </div>
                </Popup>
              </Polygon>
            );
          }
          return null;
        })}
        
        {/* Render circles for each zone based on simulated density */}
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
        
        {/* Render markers for each choke point fetched from backend */}
        {chokePoints.map((point) => (
          <Marker
            key={point.id}
            position={point.location}
            icon={L.divIcon({
              className: 'custom-marker',
              // Use assumed column names for color calculation
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