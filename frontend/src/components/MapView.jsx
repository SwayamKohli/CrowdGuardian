// frontend/src/components/MapView.jsx
import React, { useState, useEffect, useRef } from 'react'; // Import useRef
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './MapView.css';
import { io } from 'socket.io-client'; // Import socket.io-client

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
  // State for zone metrics (simulated for now)
  const [zoneMetrics, setZoneMetrics] = useState([
    { id: 'Z1', zoneId: 'Z1', location: [28.6145, 77.2085], density: 2.5, avgSpeed: 0.9, flowDirection: 90 },
    { id: 'Z2', zoneId: 'Z2', location: [28.6135, 77.2095], density: 4.0, avgSpeed: 0.7, flowDirection: 180 },
    { id: 'Z3', zoneId: 'Z3', location: [28.6142, 77.2092], density: 1.8, avgSpeed: 1.2, flowDirection: 0 },
    { id: 'Z4', zoneId: 'Z4', location: [28.6148, 77.2098], density: 3.2, avgSpeed: 0.8, flowDirection: 270 },
  ]);

  // State for loading/error
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State for real-time messages from Socket.IO (for testing visibility)
  const [socketMessages, setSocketMessages] = useState([]);

  // Ref to hold the socket instance (prevents re-creating socket on every render due to state updates)
  const socketRef = useRef(null);

  // Effect hook to simulate updates to zone density (temporary)
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
    
    // Cleanup interval on component unmount
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

  // Effect hook for Socket.IO Client Setup (Corrected)
  useEffect(() => {
    console.log("MapView: Effect for Socket.IO setup running.");

    // Only create the socket if it doesn't already exist in the ref
    if (!socketRef.current) {
      console.log("MapView: Creating new Socket.IO client...");
      const newSocket = io('http://localhost:3000');

      // Store the socket instance in the ref
      socketRef.current = newSocket;

      // --- Define Listeners ---
      // Listener for the 'server_hello' event (testing)
      const handleHello = (data) => {
        console.log('MapView: Received server hello:', data);
        setSocketMessages(prev => [...prev, { type: 'hello', ...data, timestamp: new Date().toLocaleTimeString() }]);
      };

      // Listener for the 'server_time_update' event (testing)
      const handleTimeUpdate = (data) => {
        console.log('MapView: Received server time update:', data);
        setSocketMessages(prev => [...prev, { type: 'time_update', ...data, timestamp: new Date().toLocaleTimeString() }]);
      };

      // Attach the listeners to the new socket instance
      newSocket.on('server_hello', handleHello);
      newSocket.on('server_time_update', handleTimeUpdate);

      // Store listener functions in the ref for cleanup (important!)
      socketRef.current.handleHello = handleHello;
      socketRef.current.handleTimeUpdate = handleTimeUpdate;

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
        if (socketRef.current.handleTimeUpdate) {
          socketRef.current.off('server_time_update', socketRef.current.handleTimeUpdate);
        }
        // Close the socket connection
        socketRef.current.close();
        // Clear the ref
        socketRef.current = null;
      }
    };
  }, []); // Empty dependency array ensures this runs only once on mount and once on unmount

  // Function to determine marker color based on utilization
  const getMarkerColor = (utilization, capacity) => {
    const util = utilization || 0;
    const cap = capacity || 100;
    const percentage = (util / cap) * 100;
    if (percentage > 80) return '#dc3545'; // Red (High Risk)
    if (percentage > 60) return '#ffc107'; // Yellow (Medium Risk)
    return '#28a745'; // Green (Low Risk)
  };

  // Function to determine circle color based on density
  const getDensityColor = (density) => {
    if (density > 3.5) return '#dc3545'; // Red
    if (density > 2.5) return '#ffc107'; // Yellow
    if (density > 1.5) return '#28a745'; // Green
    return '#17a2b8'; // Blue
  };

  // Function to determine circle radius based on density
  const getCircleRadius = (density) => {
    return 50 + (density * 20);
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
      {/* Display Socket.IO messages (for testing visibility) */}
      <div className="socket-messages">
        <h4>Real-Time Messages:</h4>
        <ul>
          {socketMessages.map((msg, index) => (
            <li key={index}>
              <strong>[{msg.timestamp}] {msg.type}:</strong> {msg.message}
            </li>
          ))}
        </ul>
      </div>
      <MapContainer center={center} zoom={zoom} className="leaflet-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
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

export default MapView;