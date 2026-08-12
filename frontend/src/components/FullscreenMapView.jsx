import React, { useState, useEffect, useRef } from 'react';
// Import necessary Leaflet components
import { MapContainer, TileLayer, Marker, Popup, Circle, Polygon, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './MapView.css'; // Reuse MapView styles
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom'; // Import useNavigate for back button

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

const FullscreenMapView = ({ selectedZoneId, setSelectedZoneId, persistentSocketMessages, setPersistentSocketMessages }) => {
  // Use navigate hook for back button
  const navigate = useNavigate();

  const center = [28.62, 77.23]; // Central Delhi
  const zoom = 12;

  // State for data (similar to MapView)
  const [chokePoints, setChokePoints] = useState([]);
  const [zoneMetrics, setZoneMetrics] = useState([
    { id: 'Z1_CP', zoneId: 'Z1', location: [28.6316, 77.2180], density: 2.5, avgSpeed: 0.9, flowDirection: 90, description: 'Zone Z1 (Connaught Place Area)' },
    { id: 'Z2_IG', zoneId: 'Z2', location: [28.6129, 77.2274], density: 4.0, avgSpeed: 0.7, flowDirection: 180, description: 'Zone Z2 (India Gate Area)' },
    { id: 'Z3_LT', zoneId: 'Z3', location: [28.5535, 77.2588], density: 1.8, avgSpeed: 1.2, flowDirection: 0, description: 'Zone Z3 (Lotus Temple Vicinity)' },
    { id: 'Z4_RF', zoneId: 'Z4', location: [28.6562, 77.2410], density: 3.2, avgSpeed: 0.8, flowDirection: 270, description: 'Zone Z4 (Red Fort Area)' },
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [riskAlerts, setRiskAlerts] = useState([]);
  const [evacuationRoutes, setEvacuationRoutes] = useState({});

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
        setLoading(true);
        setError(null);
        const response = await fetch('http://localhost:3456/api/choke-points');
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

  // Effect hook for Socket.IO Client Setup and Listener Definitions (Updated to use persistent state)
  useEffect(() => {
    console.log("FullscreenMapView: Effect for Socket.IO setup running.");

    if (!socketRef.current) {
      console.log("FullscreenMapView: Creating new Socket.IO client...");
      const newSocket = io('http://localhost:3456');

      socketRef.current = newSocket;

      // --- Define Listeners (Updated to use persistent state) ---
      const handleHello = (data) => {
        console.log('FullscreenMapView: Received server hello:', data);
        // Add to persistent state
        setPersistentSocketMessages(prev => [...prev, { type: 'hello', ...data, timestamp: new Date().toLocaleTimeString() }]);
      };

      const handleRiskAlert = (data) => {
        console.log('FullscreenMapView: Received risk alert:', data);

        // Clear evacuation route if risk drops for the specific zone
        const LOW_RISK_LEVELS = ['Low', 'Medium'];
        if (LOW_RISK_LEVELS.includes(data.severity_level) && evacuationRoutes[data.zone_id]) {
            setEvacuationRoutes(prevRoutes => {
                const updatedRoutes = { ...prevRoutes };
                delete updatedRoutes[data.zone_id];
                return updatedRoutes;
            });
        }

        // Add new alert to local state for Polygon rendering
        setRiskAlerts(prevAlerts => {
          const maxAlerts = 10;
          let updatedAlerts = [...prevAlerts, data];
          if (updatedAlerts.length > maxAlerts) {
            updatedAlerts = updatedAlerts.slice(-maxAlerts);
          }
          return updatedAlerts;
        });

        // Format timestamp robustly and add to persistent state
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
        // Add to persistent state
        setPersistentSocketMessages(prev => [...prev, { type: 'risk_alert', ...data, timestamp: formattedTimestamp }]);
      };

      const handleEvacuationRoute = (data) => {
        console.log('FullscreenMapView: Received evacuation route:', data);
        // Store the received route keyed by zone_id
        setEvacuationRoutes(prevRoutes => ({
            ...prevRoutes,
            [data.zone_id]: data
        }));
        // Add to persistent state
        setPersistentSocketMessages(prev => [...prev, { type: 'evacuation_route', ...data, timestamp: new Date().toLocaleTimeString() }]);
      };

      const handleEvacuationError = (data) => {
        console.error('FullscreenMapView: Received evacuation error:', data);
        // Add to persistent state
        setPersistentSocketMessages(prev => [...prev, { type: 'evacuation_error', error: data.error, zone_id: data.zone_id, timestamp: new Date().toLocaleTimeString() }]);
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

      newSocket.on('connect', () => {
          console.log('FullscreenMapView: Socket.IO client connected successfully.');
      });

      newSocket.on('disconnect', (reason) => {
          console.log('FullscreenMapView: Socket.IO client disconnected:', reason);
      });
    } else {
        console.log("FullscreenMapView: Socket.IO client already exists in ref, not creating a new one.");
    }

    return () => {
      console.log("FullscreenMapView: Cleanup function running. Closing socket if it exists.");
      if (socketRef.current) {
        socketRef.current.off('server_hello', socketRef.current.handleHello);
        socketRef.current.off('risk_alert_generated', socketRef.current.handleRiskAlert);
        socketRef.current.off('evacuation_route_calculated', socketRef.current.handleEvacuationRoute);
        socketRef.current.off('evacuation_error', socketRef.current.handleEvacuationError);
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [evacuationRoutes, setPersistentSocketMessages]); // Add setPersistentSocketMessages to dependencies

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

  // Render loading or error state
  if (loading) {
    return <div className="map-container"><p>Loading map and choke points...</p></div>;
  }

  if (error) {
    return <div className="map-container"><p>Error loading data: {error}</p></div>;
  }

  return (
    <div className="map-container" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Fullscreen Map Header with Back Button */}
      <div className="map-header-with-controls" style={{ padding: '10px 20px', backgroundColor: '#f8f9fa', borderBottom: '1px solid #dee2e6' }}>
        <h3 style={{ margin: 0, flexGrow: 1 }}>Real-Time Crowd Density Map (Fullscreen)</h3>
        <button className="fullscreen-close-btn" onClick={() => navigate(-1)} style={{ padding: '5px 10px' }}>
          Back to Dashboard
        </button>
      </div>

      {/* Main Map Container (takes remaining space) */}
      <MapContainer center={center} zoom={zoom} className="leaflet-map" style={{ flex: 1 }}>
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
                color={getRiskZoneColor(alert.severity_level)}
                fillColor={getRiskZoneColor(alert.severity_level)}
                fillOpacity={0.3}
                weight={2}
                // --- V1.5 FEATURE: Add onClick handler for dynamic linking ---
                eventHandlers={{
                  click: (e) => {
                    console.log(`FullscreenMapView: Risk zone ${alert.zone_id} clicked.`);
                    if (setSelectedZoneId) setSelectedZoneId(alert.zone_id);
                    // Optionally navigate back to main view after click
                    // navigate('/');
                  },
                }}
                // --- END V1.5 FEATURE ---
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

export default FullscreenMapView;