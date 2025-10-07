import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './MapView.css';

import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const MapView = () => {
  // Default center (e.g., New Delhi, India) and zoom level
  const center = [28.6139, 77.2090];
  const zoom = 13;

  // State to hold simulated choke point data
  const [chokePoints, setChokePoints] = useState([
    {
      id: 1,
      name: 'Main Entrance A',
      location: [28.6150, 77.2080], // Example coordinates
      capacity: 100,
      currentUtilization: 85, // Simulated current load
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
    }, 5000); // Update every 5 seconds

    // Cleanup interval on component unmount
    return () => clearInterval(interval);
  }, []); // Empty dependency array means this effect runs once on mount


  // Function to determine marker color based on utilization
  const getMarkerColor = (utilization, capacity) => {
    const percentage = (utilization / capacity) * 100;
    if (percentage > 80) return '#dc3545'; // Red for high risk (> 80%)
    if (percentage > 60) return '#ffc107'; // Yellow for medium risk (> 60%)
    return '#28a745'; // Green for low risk (<= 60%)
  };

  // Function to determine marker icon based on utilization
  const getMarkerIcon = (utilization, capacity) => {
    const color = getMarkerColor(utilization, capacity);
    return L.divIcon({
      className: 'custom-marker', // CSS class for styling
      html: `<div style="background-color: ${color}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white;"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  };

  return (
    <div className="map-container">
      <h3>Real-Time Crowd Density Map</h3>
      <MapContainer center={center} zoom={zoom} className="leaflet-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {/* Render markers for each choke point */}
        {chokePoints.map((point) => (
          <Marker
            key={point.id}
            position={point.location}
            icon={getMarkerIcon(point.currentUtilization, point.capacity)} // Use dynamic icon
          >
            <Popup>
              <div>
                <strong>{point.name}</strong><br />
                Status: {point.currentUtilization}/{point.capacity} ({Math.round((point.currentUtilization / point.capacity) * 100)}%)
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