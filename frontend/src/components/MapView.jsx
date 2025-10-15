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
  const [zoneMetrics, setZoneMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [riskAlerts, setRiskAlerts] = useState([]); // Will hold merged alerts
  const [evacuationRoutes, setEvacuationRoutes] = useState({});
  const [isMapFullscreen, setIsMapFullscreen] = useState(false); // Fullscreen state
  const socketRef = useRef(null);

  // Fetch historical alerts + zone metrics + choke points
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [alertsRes, metricsRes, chokeRes] = await Promise.all([
          fetch('http://localhost:3000/api/alerts?limit=20'),
          fetch('http://localhost:3000/api/zone-metrics?limit=100'),
          fetch('http://localhost:3000/api/choke-points')
        ]);

        if (!alertsRes.ok || !metricsRes.ok || !chokeRes.ok) {
          throw new Error('Failed to fetch data');
        }

        const alerts = await alertsRes.json();
        const metrics = await metricsRes.json();
        const choke = await chokeRes.json();

        // Process zone metrics: latest per zone
        const latestPerZone = {};
        metrics.forEach(m => {
          if (!latestPerZone[m.zone_id] || new Date(m.timestamp) > new Date(latestPerZone[m.zone_id].timestamp)) {
            latestPerZone[m.zone_id] = m;
          }
        });

        setRiskAlerts(alerts);
        setZoneMetrics(Object.values(latestPerZone));
        setChokePoints(choke);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const intervalId = setInterval(fetchData, 10000);
    return () => clearInterval(intervalId);
  }, []);

  // Socket for real-time alerts
  useEffect(() => {
    const socket = io('http://localhost:3000', { transports: ['websocket'] });
    socketRef.current = socket;

    const handleRiskAlert = (newAlert) => {
      setRiskAlerts(prev => {
        // Avoid duplicates by id
        const exists = prev.some(a => a.id === newAlert.id);
        if (exists) return prev;
        // Keep max 20 alerts
        return [newAlert, ...prev].slice(0, 20);
      });
    };

    const handleEvacuationRoute = (data) => {
      setEvacuationRoutes(prev => ({ ...prev, [data.zone_id]: data }));
    };

    socket.on('risk_alert_generated', handleRiskAlert);
    socket.on('evacuation_route_calculated', handleEvacuationRoute);

    return () => {
      socket.off('risk_alert_generated', handleRiskAlert);
      socket.off('evacuation_route_calculated', handleEvacuationRoute);
      socket.close();
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

  const getLocationByZoneId = (zoneId) => {
    const metric = zoneMetrics.find(m => m.zone_id === zoneId);
    if (metric?.latitude != null && metric?.longitude != null) {
      const lat = parseFloat(metric.latitude);
      const lng = parseFloat(metric.longitude);
      if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
    }
    return null;
  };

  const toggleFullscreen = () => setIsMapFullscreen(!isMapFullscreen);

  if (loading) return <div className="map-container"><p>Loading...</p></div>;
  if (error) return <div className="map-container"><p>Error: {error}</p></div>;

  // Render map content (used in both normal and fullscreen)
  const renderMapContent = () => (
    <>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
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
    </>
  );

  return (
    <div className="map-container">
      {/* Fullscreen Overlay */}
      {isMapFullscreen && (
        <div className="fullscreen-map-overlay">
          <div className="fullscreen-map-header">
            <h3>Real-Time Crowd Density Map (Fullscreen)</h3>
            <button className="fullscreen-close-btn" onClick={toggleFullscreen}>
              Close
            </button>
          </div>
          <MapContainer
            center={center}
            zoom={zoom}
            className="leaflet-map fullscreen-leaflet-map"
          >
            {renderMapContent()}
          </MapContainer>
        </div>
      )}

      {/* Header with Fullscreen Toggle */}
      <div className="map-header-with-controls">
        <h3>Real-Time Crowd Density Map</h3>
        <button className="fullscreen-toggle-btn" onClick={toggleFullscreen}>
          &#x26F6;
        </button>
      </div>

      {/* Real-Time Alerts */}
      <div className="socket-messages">
        <h4>Real-Time Alerts:</h4>
        <ul>
          {riskAlerts.map((alert, i) => (
            <li key={`alert-${alert.id || i}`}>
              <strong>
                [{new Date(alert.generated_at).toLocaleTimeString()}] {alert.severity_level} Risk:
              </strong>{' '}
              Zone {alert.zone_id} — {alert.message || 'N/A'}
            </li>
          ))}
        </ul>
      </div>

      {/* Main Map */}
      <MapContainer center={center} zoom={zoom} className="leaflet-map">
        {renderMapContent()}
      </MapContainer>
    </div>
  );
};

export default MapView;