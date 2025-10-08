import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './MapView.css';
// import { useSocket } from '../contexts/SocketContext'; // Keep this line ready for Socket integration

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
  const center = [28.6139, 77.2090]; // Map center (e.g., New Delhi)
  const zoom = 13;

  // State for data from API and simulation
  const [chokePoints, setChokePoints] = useState([]);
  const [zoneMetrics, setZoneMetrics] = useState([
    { id: 'Z1', zoneId: 'Z1', location: [28.6145, 77.2085], density: 2.5, avgSpeed: 0.9, flowDirection: 90 },
    { id: 'Z2', zoneId: 'Z2', location: [28.6135, 77.2095], density: 4.0, avgSpeed: 0.7, flowDirection: 180 },
    { id: 'Z3', zoneId: 'Z3', location: [28.6142, 77.2092], density: 1.8, avgSpeed: 1.2, flowDirection: 0 },
    { id: 'Z4', zoneId: 'Z4', location: [28.6148, 77.2098], density: 3.2, avgSpeed: 0.8, flowDirection: 270 },
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Effect hook to fetch static Choke Points data once from backend
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
  }, []); // Runs once on component mount

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
    return () => clearInterval(interval);
  }, []);

  // Function to determine marker color based on utilization (from fetched data)
  const getMarkerColor = (utilization, capacity) => {
    const util = utilization || 0;
    const cap = capacity || 100;
    const percentage = (util / cap) * 100;
    if (percentage > 80) return '#dc3545'; // Red (High Risk)
    if (percentage > 60) return '#ffc107'; // Yellow (Medium Risk)
    return '#28a745'; // Green (Low Risk)
  };

  // Function to determine circle color based on density (from simulated data)
  const getDensityColor = (density) => {
    if (density > 3.5) return '#dc3545'; // Red for high density
    if (density > 2.5) return '#ffc107'; // Yellow for medium-high
    if (density > 1.5) return '#28a745'; // Green for medium-low
    return '#17a2b8'; // Blue for low density
  };

  // Function to determine circle radius based on density (from simulated data)
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
            position={point.location} // location is [lat, lng] from backend
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
                {/* Display utilization details with fallbacks */}
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