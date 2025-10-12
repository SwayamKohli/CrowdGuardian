// frontend/src/components/MapView.jsx
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
  // --- UPDATED MAP VIEW PARAMETERS FOR BETTER VISUALIZATION ---
  // Center the map on a central point in Delhi that can show all key landmarks reasonably well.
  // Note: Z1 (CP) and Z4 (RF) are quite far apart N-S. Z2 (IG) and Z3 (LT) are E-W.
  // A compromise center is needed.
  const center = [28.61, 77.23]; // Slightly south of CP, central longitude
  const zoom = 11; // Zoom out a bit more to capture the spread (was 12)

  // State for data from API and simulation
  const [chokePoints, setChokePoints] = useState([]);
  // Define zone metrics with locations matching backend simulation and choke point locations
  const [zoneMetrics, setZoneMetrics] = useState([
    // Connaught Place (Z1)
    { id: 'Z1_CP', zoneId: 'Z1', location: [28.6316, 77.2180], density: 2.5, avgSpeed: 0.9, flowDirection: 90, description: 'Zone Z1 (Connaught Place Area)' },
    // India Gate (Z2)
    { id: 'Z2_IG', zoneId: 'Z2', location: [28.6129, 77.2274], density: 4.0, avgSpeed: 0.7, flowDirection: 180, description: 'Zone Z2 (India Gate Area)' },
    // Lotus Temple (Z3)
    { id: 'Z3_LT', zoneId: 'Z3', location: [28.5535, 77.2588], density: 1.8, avgSpeed: 1.2, flowDirection: 0, description: 'Zone Z3 (Lotus Temple Vicinity)' },
    // Red Fort (Z4)
    { id: 'Z4_RF', zoneId: 'Z4', location: [28.6562, 77.2410], density: 3.2, avgSpeed: 0.8, flowDirection: 270, description: 'Zone Z4 (Red Fort Area)' },
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
        console.log("MapView: Fetched choke points from backend:", data);
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
    console.log("MapView: Effect for Socket.IO setup running.");

    if (!socketRef.current) {
      console.log("MapView: Creating new Socket.IO client...");
      const newSocket = io('http://localhost:3000');

      socketRef.current = newSocket;

      // --- Define Listeners ---
      const handleHello = (data) => {
        console.log('MapView: Received server hello:', data);
        setSocketMessages(prev => [...prev, { type: 'hello', ...data, timestamp: new Date().toLocaleTimeString() }]);
      };

      const handleRiskAlert = (data) => {
        console.log('MapView: Received risk alert:', data);

        // --- NEW: Clear evacuation route if risk is low/medium for the same zone ---
        const LOW_RISK_LEVELS = ['Low', 'Medium'];
        if (LOW_RISK_LEVELS.includes(data.severity_level) && evacuationRoute && evacuationRoute.zone_id === data.zone_id) {
            console.log(`MapView: Low/Medium risk for zone ${data.zone_id}. Clearing evacuation route.`);
            setEvacuationRoute(null);
        }

        // Add new alert to state for Polygon rendering
        setRiskAlerts(prevAlerts => {
          const maxAlerts = 10;
          let updatedAlerts = [...prevAlerts, data];
          if (updatedAlerts.length > maxAlerts) {
            updatedAlerts = updatedAlerts.slice(-maxAlerts); // Keep only the last N alerts
          }
          return updatedAlerts;
        });

        // --- FIX: Format timestamp robustly for socketMessages list ---
        let formattedTimestamp = 'N/A';
        // Prefer 'timestamp' as sent by the backend, fallback to 'generated_at' if needed
        const timestampToUse = data.timestamp || data.generated_at;
        if (timestampToUse) {
            const dateObj = new Date(timestampToUse);
            if (dateObj instanceof Date && !isNaN(dateObj)) {
                formattedTimestamp = dateObj.toLocaleTimeString();
            } else {
                console.warn('MapView: Failed to parse risk alert timestamp (using raw):', timestampToUse);
                formattedTimestamp = timestampToUse; // Show raw value if parsing fails
            }
        }
        setSocketMessages(prev => [...prev, { type: 'risk_alert', ...data, timestamp: formattedTimestamp }]);
      };

      const handleEvacuationRoute = (data) => {
        console.log('MapView: Received evacuation route:', data);
        setEvacuationRoute(data);
        setSocketMessages(prev => [...prev, { type: 'evacuation_route', ...data, timestamp: new Date().toLocaleTimeString() }]);
      };

      const handleEvacuationError = (data) => {
        console.error('MapView: Received evacuation error:', data);
        setSocketMessages(prev => [...prev, { type: 'evacuation_error', error: data.error, zone_id: data.zone_id, timestamp: new Date().toLocaleTimeString() }]);
      };

      // Attach the listeners to the new socket instance
      newSocket.on('server_hello', handleHello);
      newSocket.on('risk_alert_generated', handleRiskAlert);
      newSocket.on('evacuation_route_calculated', handleEvacuationRoute);
      newSocket.on('evacuation_error', handleEvacuationError);

      // Store listener functions in the ref for cleanup (important!)
      socketRef.current.handleHello = handleHello;
      socketRef.current.handleRiskAlert = handleRiskAlert;
      socketRef.current.handleEvacuationRoute = handleEvacuationRoute;
      socketRef.current.handleEvacuationError = handleEvacuationError;

      // Log connection
      newSocket.on('connect', () => {
          console.log('MapView: Socket.IO client connected successfully.');
      });

      // Log disconnection (optional)
      newSocket.on('disconnect', (reason) => {
          console.log('MapView: Socket.IO client disconnected:', reason);
      });
    } else {
        console.log("MapView: Socket.IO client already exists in ref, not creating a new one.");
    }

    // Cleanup function: close the socket connection and remove listeners when the component unmounts
    return () => {
      console.log("MapView: Cleanup function running. Closing socket if it exists.");
      if (socketRef.current) {
        // Remove the specific listeners we attached
        if (socketRef.current.handleHello) {
          socketRef.current.off('server_hello', socketRef.current.handleHello);
        }
        if (socketRef.current.handleRiskAlert) {
          socketRef.current.off('risk_alert_generated', socketRef.current.handleRiskAlert);
        }
        if (socketRef.current.handleEvacuationRoute) {
          socketRef.current.off('evacuation_route_calculated', socketRef.current.handleEvacuationRoute);
        }
        if (socketRef.current.handleEvacuationError) {
          socketRef.current.off('evacuation_error', socketRef.current.handleEvacuationError);
        }
        // Close the socket connection
        socketRef.current.close();
        // Clear the ref
        socketRef.current = null;
      }
    };
  }, []); // Empty dependency array means this runs only once on mount, and the cleanup runs on unmount

  // Function to determine marker color based on utilization (SIMPLIFIED)
  const getMarkerColor = (utilization, capacity) => {
    const util = utilization || 0;
    const cap = capacity || 100;
    const percentage = (util / cap) * 100;
    if (percentage > 80) return '#dc3545'; // Red (High Risk)
    if (percentage > 60) return '#ffc107'; // Yellow (Medium Risk)
    return '#28a745'; // Green (Low Risk)
  };

  // Function to determine circle color based on density (Vibrant colors)
  const getDensityColor = (density) => {
    if (density > 3.5) return '#FF0000'; // Bright Red
    if (density > 2.5) return '#FFA500'; // Orange
    if (density > 1.5) return '#FFFF00'; // Yellow
    return '#00FF00'; // Bright Green (instead of blue)
  };

  // Function to determine circle radius based on density (Larger size)
  const getCircleRadius = (density) => {
    return 80 + (density * 30); // Increase base size and scaling factor
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
        return '#6c757d'; // Grey for unknown levels
    }
  };

  // Function to determine evacuation route color
  const getEvacuationRouteColor = (riskLevelThatTriggered) => {
    switch (riskLevelThatTriggered?.toLowerCase()) {
      case 'critical':
        return '#FF4500'; // OrangeRed for critical
      case 'high':
        return '#FF8C00'; // DarkOrange for high
      default:
        return '#0000FF'; // Pure Blue for others or default
    }
  };

  /**
   * Generates a placeholder polygon area (square) around a center point for visualization.
   * @param {string} zoneId - ID of the zone.
   * @param {Array<number>} location - [lat, lng] coordinates of the zone center.
   * @returns {Array<Array<number>> | null} Polygon coordinates.
   */
  const getZoneArea = (zoneId, location) => {
    // Increase the offset for a larger, more visible area
    const offset = 0.002; // Was 0.001, then 0.0005
    if (location && Array.isArray(location) && location.length === 2) {
      const [lat, lng] = location;
      // Return a square polygon around the point
      return [
        [lat - offset, lng - offset],
        [lat - offset, lng + offset],
        [lat + offset, lng + offset],
        [lat + offset, lng - offset]
      ];
    }
    // If location is invalid, return null to prevent rendering
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
          {/* --- FIXED ALERT LIST RENDERING WITH ROBUST TIMESTAMP HANDLING --- */}
          {riskAlerts.map((alert, index) => {
            // --- FIX: Robust timestamp parsing specifically for the alert list ---
            let displayTimestamp = 'N/A';
            // Prefer 'timestamp' as sent by the backend, fallback to 'generated_at' if needed
            const alertTimestampToUse = alert.timestamp || alert.generated_at;
            if (alertTimestampToUse) {
                const alertDateObj = new Date(alertTimestampToUse);
                if (alertDateObj instanceof Date && !isNaN(alertDateObj)) {
                    displayTimestamp = alertDateObj.toLocaleTimeString();
                } else {
                    console.warn('MapView: Failed to parse risk alert timestamp for list (using raw):', alertTimestampToUse);
                    displayTimestamp = alertTimestampToUse; // Show raw value if parsing fails
                }
            }
            // --- END FIX ---
            return (
              <li key={`alert-${index}`}>
                <strong>[{displayTimestamp}] {alert.severity_level} Risk:</strong> Zone {alert.zone_id}
              </li>
            );
          })}
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
                color={getRiskZoneColor(alert.severity_level)} // Use severity_level for color
                fillColor={getRiskZoneColor(alert.severity_level)}
                fillOpacity={0.3}
                weight={2}
              >
                <Popup>
                  <div>
                    <strong>Risk Alert: {alert.severity_level}</strong><br /> {/* Use severity_level */}
                    Zone: {alert.zone_id}<br />
                    Predicted at: {new Date(alert.timestamp || alert.generated_at).toLocaleString()} {/* Fallback */}
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
              // Use the simplified getMarkerColor function
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