import { API_URL } from '../config';
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
  const [riskAlerts, setRiskAlerts] = useState([]);
  const [evacuationRoutes, setEvacuationRoutes] = useState({});
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [alertsRes, metricsRes, chokeRes] = await Promise.all([
          fetch(`${API_URL}/api/alerts?limit=20`),
          fetch(`${API_URL}/api/zone-metrics?limit=200`),
          fetch(`${API_URL}/api/choke-points`),
        ]);

        if (!alertsRes.ok || !metricsRes.ok || !chokeRes.ok) {
          throw new Error('Failed to fetch data');
        }

        const alerts = await alertsRes.json();
        let metrics = await metricsRes.json();
        const choke = await chokeRes.json();

        metrics = metrics.filter((m) => m.latitude != null && m.longitude != null);

        const latestPerZone = {};
        metrics.forEach((m) => {
          if (
            !latestPerZone[m.zone_id] ||
            new Date(m.timestamp) > new Date(latestPerZone[m.zone_id].timestamp)
          ) {
            latestPerZone[m.zone_id] = m;
          }
        });

        // Merge DB alerts with existing socket-pushed alerts
        setRiskAlerts(prev => {
          const merged = [...alerts];
          prev.forEach(existing => {
            if (!merged.some(a => a.id === existing.id)) {
              merged.push(existing);
            }
          });
          merged.sort((a, b) => new Date(b.generated_at) - new Date(a.generated_at));
          return merged.slice(0, 20);
        });
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
    const intervalId = setInterval(fetchData, 30000); // Poll every 30s, Socket.IO handles real-time
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const socket = io(API_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    const handleRiskAlert = (newAlert) => {
      setRiskAlerts((prev) => {
        const exists = prev.some((a) => a.id === newAlert.id);
        if (exists) return prev;
        return [newAlert, ...prev].slice(0, 20);
      });
    };

    const handleEvacuationRoute = (data) => {
      console.log('🧭 Evacuation route received:', data);
      setEvacuationRoutes((prev) => ({ ...prev, [data.zone_id]: data }));
    };

    // 🔥 Added: Handle evacuation errors for debugging
    const handleEvacuationError = (data) => {
      console.error('🚨 Evacuation route error for zone', data.zone_id, ':', data.error);
    };

    socket.on('risk_alert_generated', handleRiskAlert);
    socket.on('evacuation_route_calculated', handleEvacuationRoute);
    socket.on('evacuation_error', handleEvacuationError); // 🔥

    return () => {
      socket.off('risk_alert_generated', handleRiskAlert);
      socket.off('evacuation_route_calculated', handleEvacuationRoute);
      socket.off('evacuation_error', handleEvacuationError); // 🔥
      socket.close();
    };
  }, []);

  const getMarkerColor = (utilization, capacity) => {
    const pct = ((utilization || 0) / (capacity || 100)) * 100;
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

  const getCircleRadius = (density) => 80 + density * 30;

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

  const getEvacuationRouteColor = (riskLevel) => {
    switch (riskLevel?.toLowerCase()) {
      case 'critical':
        return '#FF4500';
      case 'high':
        return '#FF8C00';
      default:
        return '#0000FF';
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
      [lat + offset, lng - offset],
    ];
  };

  const getLocationByZoneId = (zoneId) => {
    const metric = zoneMetrics.find((m) => m.zone_id === zoneId);
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

  const renderMapContent = () => (
    <>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* 🧭 Evacuation Routes */}
      {Object.entries(evacuationRoutes).map(([zoneId, route]) => {
        const coords = Array.isArray(route.path_coordinates)
          ? route.path_coordinates.map(([lat, lng]) => [parseFloat(lat), parseFloat(lng)])
          : [];

        const validCoords = coords.filter(
          (pair) => Array.isArray(pair) && pair.length === 2 && !isNaN(pair[0]) && !isNaN(pair[1])
        );

        if (validCoords.length < 2) return null;

        return (
          <Polyline
            key={`route-${zoneId}`}
            positions={validCoords}
            color={getEvacuationRouteColor(route.risk_level_that_triggered)}
            weight={5}
            opacity={0.8}
            dashArray="10,10"
          />
        );
      })}

      {/* 🔶 Risk Zones */}
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
              click: () => setSelectedZoneId && setSelectedZoneId(alert.zone_id),
            }}
          />
        );
      })}

      {/* 🟢 Zone Circles */}
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
              <strong>Zone: {metric.zone_id}</strong>
              <br />
              Density: {parseFloat(metric.density).toFixed(2)} p/m²
            </Popup>
          </Circle>
        );
      })}

      {/* 🔵 Choke Points */}
      {chokePoints.map((point) => {
        if (!point.location) return null;
        return (
          <Marker
            key={point.id}
            position={point.location}
            icon={L.divIcon({
              className: 'custom-marker',
              html: `<div style="background-color: ${getMarkerColor(
                point.current_utilization,
                point.capacity
              )}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white;"></div>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            })}
          >
            <Popup>
              <strong>{point.name}</strong>
              <br />
              {point.current_utilization}/{point.capacity}
            </Popup>
          </Marker>
        );
      })}
    </>
  );

  return (
    <div className="map-container">
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

      <div className="map-header-with-controls">
        <h3>Real-Time Crowd Density Map</h3>
        <button className="fullscreen-toggle-btn" onClick={toggleFullscreen}>
          &#x26F6;
        </button>
      </div>

      <div className="socket-messages">
        <h4>Real-Time Alerts:</h4>
        <ul>
          {riskAlerts.map((alert, i) => (
            <li key={`alert-${alert.id || i}`}>
              <strong>
                [{new Date(alert.generated_at).toLocaleTimeString()}]{' '}
                {alert.severity_level} Risk:
              </strong>{' '}
              Zone {alert.zone_id} — {alert.message || 'N/A'}
            </li>
          ))}
        </ul>
      </div>

      <MapContainer center={center} zoom={zoom} className="leaflet-map">
        {renderMapContent()}
      </MapContainer>
    </div>
  );
};

export default MapView;