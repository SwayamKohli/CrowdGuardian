import React, { useState, useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  BarElement,
  ArcElement,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { io } from 'socket.io-client';
import './HistoricalAnalytics.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const HistoricalAnalytics = () => {
  const [timeRange, setTimeRange] = useState('week');
  const [historicalData, setHistoricalData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);
  const initialLoadDone = useRef(false);

  // Fetch historical data
  const fetchHistoricalData = async () => {
    try {
      // Only show loading spinner on initial load
      if (!initialLoadDone.current) setLoading(true);
      setError(null);
      const response = await fetch('http://localhost:3456/api/historical-data?limit=100');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setHistoricalData(data);
    } catch (err) {
      console.error('Error fetching historical data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      initialLoadDone.current = true;
    }
  };

  useEffect(() => {
    fetchHistoricalData();

    // Polling fallback (optional)
    const interval = setInterval(fetchHistoricalData, 60000); // Poll every 60s instead of 3s

    // Socket for real-time incidents
    const socket = io('http://localhost:3456', { transports: ['websocket'] });
    socketRef.current = socket;

    // Listen for new incidents (if your backend emits them)
    socket.on('new_incident_reported', (newIncident) => {
      setHistoricalData(prev => [newIncident, ...prev].slice(0, 100)); // Keep latest 100
    });

    return () => {
      clearInterval(interval);
      if (socketRef.current) socketRef.current.close();
    };
  }, []);

  // Filter data by time range (client-side)
  const getFilteredData = () => {
    const now = new Date();
    let filtered = historicalData;

    switch (timeRange) {
      case 'day':
        filtered = historicalData.filter(item => {
          const reported = new Date(item.reported_at);
          return (now - reported) <= 24 * 60 * 60 * 1000;
        });
        break;
      case 'week':
        filtered = historicalData.filter(item => {
          const reported = new Date(item.reported_at);
          return (now - reported) <= 7 * 24 * 60 * 60 * 1000;
        });
        break;
      case 'month':
        filtered = historicalData.filter(item => {
          const reported = new Date(item.reported_at);
          return (now - reported) <= 30 * 24 * 60 * 60 * 1000;
        });
        break;
      // 'year' or default: show all
    }
    return filtered;
  };

  const filteredData = getFilteredData();

  // --- Chart Processing Functions ---
  const processIncidentsOverTime = () => {
    const incidentsOverTime = {};
    filteredData.forEach(item => {
      const date = new Date(item.reported_at).toISOString().split('T')[0];
      incidentsOverTime[date] = (incidentsOverTime[date] || 0) + 1;
    });
    return {
      labels: Object.keys(incidentsOverTime),
      datasets: [{
        label: 'Incidents Reported',
        data: Object.values(incidentsOverTime),
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
      }],
    };
  };

  const processRiskDistribution = () => {
    const riskLevelCounts = {};
    filteredData.forEach(item => {
      const cause = item.cause || 'Unknown';
      riskLevelCounts[cause] = (riskLevelCounts[cause] || 0) + 1;
    });
    const colors = [
      'rgba(255, 99, 132, 0.7)', 'rgba(54, 162, 235, 0.7)', 'rgba(255, 206, 86, 0.7)',
      'rgba(75, 192, 192, 0.7)', 'rgba(153, 102, 255, 0.7)', 'rgba(255, 159, 64, 0.7)',
    ];
    return {
      labels: Object.keys(riskLevelCounts),
      datasets: [{
        label: 'Incident Cause Distribution',
        data: Object.values(riskLevelCounts),
        backgroundColor: Object.keys(riskLevelCounts).map((_, i) => colors[i % colors.length]),
        borderColor: Object.keys(riskLevelCounts).map((_, i) => colors[i % colors.length].replace('0.7', '1')),
        borderWidth: 1,
      }],
    };
  };

  const processCasualtiesByCause = () => {
    const casualtiesByCause = {};
    filteredData.forEach(item => {
      const cause = item.cause || 'Unknown';
      casualtiesByCause[cause] = (casualtiesByCause[cause] || 0) + (item.casualties || 0);
    });
    return {
      labels: Object.keys(casualtiesByCause),
      datasets: [{
        label: 'Total Casualties',
        data: Object.values(casualtiesByCause),
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
      }],
    };
  };

  // --- Chart Options ---
  const incidentsOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Incidents Reported Over Time' },
    },
    scales: { y: { beginAtZero: true } },
  };

  const riskDistributionOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Incident Cause Distribution' },
    },
  };

  const casualtiesOptions = {
    indexAxis: 'y',
    elements: { bar: { borderWidth: 2 } },
    responsive: true,
    plugins: {
      legend: { position: 'right' },
      title: { display: true, text: 'Total Casualties by Cause' },
    },
  };

  // --- Render ---
  if (loading) {
    return (
      <div className="historical-analytics">
        <h3>Historical Analytics Dashboard</h3>
        <p className="loading-message">Loading historical data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="historical-analytics">
      </div>
    );
  }

  return (
    <div className="historical-analytics">
      <h3>Historical Analytics Dashboard</h3>
      <div className="analytics-controls">
        <label htmlFor="timeRange">Time Range: </label>
        <select
          id="timeRange"
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
        >
          <option value="day">Last 24 Hours</option>
          <option value="week">Last Week</option>
          <option value="month">Last Month</option>
          <option value="year">Last Year</option>
        </select>
      </div>
      <div className="charts-container">
        <div className="chart-wrapper">
          <Line options={incidentsOptions} data={processIncidentsOverTime()} />
        </div>
        <div className="chart-wrapper">
          <Doughnut options={riskDistributionOptions} data={processRiskDistribution()} />
        </div>
        <div className="chart-wrapper">
          <Bar options={casualtiesOptions} data={processCasualtiesByCause()} />
        </div>
      </div>
    </div>
  );
};

export default HistoricalAnalytics;