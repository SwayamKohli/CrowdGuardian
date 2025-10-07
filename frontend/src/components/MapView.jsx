import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './MapView.css';

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

// Helper function to determine choke point marker color based on utilization
const getMarkerColor = (utilization, capacity) => {
  const percentage = (utilization / capacity) * 100;
  if (percentage > 80) return '#dc3545'; // Critical (Red)
  if (percentage > 60) return '#ffc107'; // High (Yellow)
  return '#28a745'; // Normal (Green)
};

const MapView = () => {
  // Map initialization parameters
  const center = [28.6139, 77.2090]; // New Delhi, India
  const zoom = 13;

  // State for simulated choke point capacity metrics
  const [chokePoints, setChokePoints] = useState([
    {
      id: 1,
      name: 'Main Entrance A',
      location: [28.6150, 77.2080],
      capacity: 100,
      currentUtilization: 85,
      description: 'Primary entry gate',
    },
    {
      id: 2,
      name: 'Main Exit B',
      location: [28.6130, 77.2100],
      capacity: 80,
      currentUtilization: 70,
      description: 'Main exit route',
    },
    {
      id: 3,
      name: 'Narrow Corridor C',
      location: [28.6140, 77.2090],
      capacity: 50,
      currentUtilization: 45,
      description: 'Connecting hallways',
    },
  ]);

  // State for simulated crowd density metrics for various zones
  const [zoneMetrics, setZoneMetrics] = useState([
    { id: 'Z1', zoneId: 'Z1', location: [28.6145, 77.2085], density: 2.5, avgSpeed: 0.9, flowDirection: 90 },
    { id: 'Z2', zoneId: 'Z2', location: [28.6135, 77.2095], density: 4.0, avgSpeed: 0.7, flowDirection: 180 },
    { id: 'Z3', zoneId: 'Z3', location: [28.6142, 77.2092], density: 1.8, avgSpeed: 1.2, flowDirection: 0 },
    { id: 'Z4', zoneId: 'Z4', location: [28.6148, 77.2098], density: 3.2, avgSpeed: 0.8, flowDirection: 270 },
  ]);

  // Effect hook to simulate periodic updates to choke point utilization
  useEffect(() => {
    const interval = setInterval(() => {
      setChokePoints(prevPoints =>
        prevPoints.map(point => ({
          ...point,
          currentUtilization: Math.min(
            point.capacity,
            Math.max(0, point.currentUtilization + Math.floor(Math.random() * 5) - 2)
          )
        }))
      );
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Effect hook to simulate periodic updates to zone density metrics
  useEffect(() => {
    const interval = setInterval(() => {
      setZoneMetrics(prevMetrics =>
        prevMetrics.map(metric => ({
          ...metric,
          density: Math.max(0, metric.density + (Math.random() * 0.5 - 0.25)),
          avgSpeed: Math.max(0, metric.avgSpeed + (Math.random() * 0.1 - 0.05))
        }))
      );
    }, 3000); // Update density every 3 seconds
    return () => clearInterval(interval);
  }, []); // Effect runs once on component mount

  // Function to determine circle color based on density thresholds
  const getDensityColor = (density) => {
    if (density > 3.5) return '#dc3545'; // Red for high density
    if (density > 2.5) return '#ffc107'; // Yellow for medium-high
    if (density > 1.5) return '#28a745'; // Green for medium-low
    return '#17a2b8'; // Blue for low density
  };

  // Function to determine circle radius based on density (for visualization)
  const getCircleRadius = (density) => {
    return 50 + (density * 20);
  };

  return (
    <div className="map-container">
      <h3>Real-Time Crowd Density Map</h3>
      <MapContainer center={center} zoom={zoom} className="leaflet-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {/* Render circles to visualize zone density metrics */}
        {zoneMetrics.map((metric) => (
          <Circle
            key={metric.id}
            center={metric.location}
            radius={getCircleRadius(metric.density)}
            fillColor={getDensityColor(metric.density)}
            color="#000" // Border color
            weight={1} // Border weight
            fillOpacity={0.5} // Fill opacity
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
        {/* Render markers for each critical choke point */}
        {chokePoints.map((point) => (
          <Marker
            key={point.id}
            position={point.location}
            icon={L.divIcon({
              className: 'custom-marker',
              html: `<div style="background-color: ${getMarkerColor(point.currentUtilization, point.capacity)}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white;"></div>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            })}
          >
            <Popup>
              <div>
                <strong>{point.name}</strong><br />
                Status: {point.currentUtilization}/{point.capacity} ({Math.round((point.currentUtilization / point.capacity) * 100)}%)<br />
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