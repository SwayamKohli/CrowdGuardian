// src/components/MapView.jsx
import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polygon, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './MapView.css';
import { io } from 'socket.io-client';
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

const MapView = ({ selectedZoneId, setSelectedZoneId }) => {
  const center = [28.62, 77.23];
  const zoom = 12;

  const [chokePoints, setChokePoints] = useState([]);
  const [zoneMetrics, setZoneMetrics] = useState([]); // Now empty — will fetch from API
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [socketMessages, setSocketMessages] = useState([]);
  const [riskAlerts, setRiskAlerts] = useState([]);
  const [evacuationRoutes, setEvacuationRoutes] = useState({});
  const socketRef = useRef(null);

  // Fetch zone metrics (with latitude/longitude)
  useEffect(() => {
    const fetchZoneMetrics = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/zone-metrics?limit=100');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        const latestPerZone = {};
        data.forEach(metric => {
          if (!latestPerZone[metric.zone_id] || new Date(metric.timestamp) > new Date(latestPerZone[metric.zone_id].timestamp)) {
            latestPerZone[metric.zone_id] = metric;
          }
        });
        setZoneMetrics(Object.values(latestPerZone));
      } catch (err) {
        console.error('Error fetching zone metrics:', err);
        setError(err.message);
      }
    };

    fetchZoneMetrics();
    const intervalId = setInterval(fetchZoneMetrics, 5000);
    return () => clearInterval(intervalId);
  }, []);

  // Fetch choke points
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
    const intervalId = setInterval(fetchChokePoints, 5000);
    return () => clearInterval(intervalId);
  }, []);

  // Socket logic
  useEffect(() => {
    if (!socketRef.current) {
      const newSocket = io('http://localhost:3000', {
        transports: ['websocket'] // Prevent blinking
      });
      socketRef.current = newSocket;

      const handleRiskAlert = (data) => {
        setRiskAlerts(prev => {
          const max = 10;
          const updated = [...prev, data];
          return updated.length > max ? updated.slice(-max) : updated;
        });
      };

      const handleEvacuationRoute = (data) => {
        setEvacuationRoutes(prev => ({ ...prev, [data.zone_id]: data }));
      };

      newSocket.on('risk_alert_generated', handleRiskAlert);
      newSocket.on('evacuation_route_calculated', handleEvacuationRoute);

      socketRef.current.handleRiskAlert = handleRiskAlert;
      socketRef.current.handleEvacuationRoute = handleEvacuationRoute;
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.off('risk_alert_generated', socketRef.current.handleRiskAlert);
        socketRef.current.off('evacuation_route_calculated', socketRef.current.handleEvacuationRoute);
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, []);

  const getMarkerColor = (utilization, capacity) => {
    const util = utilization || 0;
    const cap = capacity || 100;
    const pct = (util / cap) * 100;
    if (pct > 80) return '#dc3545';
    if (pct > 60) return '#ffc107';
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
    if (!location) return null;
    const offset = 0.002;
    const [lat, lng] = location;
    return [
      [lat - offset, lng - offset],
      [lat - offset, lng + offset],
      [lat + offset, lng + offset],
      [lat + offset, lng - offset]
    ];
  };

  if (loading) return <div className="map-container"><p>Loading...</p></div>;
  if (error) return <div className="map-container"><p>Error: {error}</p></div>;

  // ✅ Helper: Get [lat, lng] from zoneMetrics by zone_id
  const getLocationByZoneId = (zoneId) => {
    const metric = zoneMetrics.find(m => m.zone_id === zoneId);
    if (metric && metric.latitude != null && metric.longitude != null) {
      const lat = parseFloat(metric.latitude);
      const lng = parseFloat(metric.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        return [lat, lng];
      }
    }
    return null;
  };

  return (
    <div className="map-container">
      <h3>Real-Time Crowd Density Map</h3>
      <div className="socket-messages">
        <h4>Real-Time Alerts:</h4>
        <ul>
          {riskAlerts.map((alert, i) => (
            <li key={i}>
              <strong>[{new Date().toLocaleTimeString()}] {alert.severity_level} Risk:</strong> Zone {alert.zone_id}
            </li>
          ))}
        </ul>
      </div>

      <MapContainer center={center} zoom={zoom} className="leaflet-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Evacuation Routes */}
        {Object.entries(evacuationRoutes).map(([zoneId, route]) => {
          let coords = [];
          try {
            coords = route.path_coordinates ? JSON.parse(route.path_coordinates) : [];
          } catch (e) {
            console.warn('Invalid route coordinates');
          }
          return (
            <Polyline
              key={`route-${zoneId}`}
              positions={coords}
              color={getEvacuationRouteColor(route.risk_level_that_triggered)}
              weight={5}
              opacity={0.8}
              dashArray="10,10"
            />
          );
        })}

        {/* Risk Alert Polygons */}
        {riskAlerts.map((alert, i) => {
          const location = getLocationByZoneId(alert.zone_id);
          const area = getZoneArea(alert.zone_id, location);
          if (!area) return null;
          return (
            <Polygon
              key={`poly-${alert.zone_id}-${i}`}
              positions={area}
              color={getRiskZoneColor(alert.severity_level)}
              fillColor={getRiskZoneColor(alert.severity_level)}
              fillOpacity={0.3}
              weight={2}
              eventHandlers={{
                click: () => setSelectedZoneId && setSelectedZoneId(alert.zone_id)
              }}
            />
          );
        })}

        {/* Zone Circles — ✅ USE latitude/longitude */}
        {zoneMetrics.map((metric) => {
          const lat = parseFloat(metric.latitude);
          const lng = parseFloat(metric.longitude);
          if (isNaN(lat) || isNaN(lng)) return null;
          return (
            <Circle
              key={metric.zone_id}
              center={[lat, lng]}
              radius={getCircleRadius(parseFloat(metric.density) || 0)}
              fillColor={getDensityColor(parseFloat(metric.density) || 0)}
              color="#000"
              weight={1}
              fillOpacity={0.5}
            >
              <Popup>
                <strong>Zone: {metric.zone_id}</strong><br />
                Density: {parseFloat(metric.density).toFixed(2)} p/m²
              </Popup>
            </Circle>
          );
        })}

        {/* Choke Point Markers */}
        {chokePoints.map((point) => {
          if (!point.location) return null;
          return (
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
                <strong>{point.name}</strong><br />
                {point.current_utilization}/{point.capacity}
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default MapView;