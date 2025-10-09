import React, { useState, useEffect } from 'react';
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
  ArcElement, // Component for Pie/Doughnut charts
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import './HistoricalAnalytics.css';

// Register all necessary Chart.js components for rendering
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
  // State for time range filter, controlling API queries
  const [timeRange, setTimeRange] = useState('week');
  // State for raw historical data fetched from the backend
  const [historicalData, setHistoricalData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Effect hook to fetch historical incident data from the backend API
  useEffect(() => {
    const fetchHistoricalData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch historical data, adding a filter for timeRange if the backend supports it later
        const response = await fetch('http://localhost:3000/api/historical-data?limit=50');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setHistoricalData(data);
      } catch (err) {
        console.error('Error fetching historical data:', err);
        setError(err.message);
        setHistoricalData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHistoricalData();
  }, [timeRange]); // Re-fetches data when the time range filter changes

  /**
   * Processes raw incident data to aggregate incident counts over time.
   * @returns {Object} Chart.js data object for the Line Chart.
   */
  const processIncidentsOverTime = () => {
    const incidentsOverTime = {};
    historicalData.forEach(item => {
      // Grouping by date (YYYY-MM-DD)
      const date = new Date(item.reported_at).toISOString().split('T')[0];
      incidentsOverTime[date] = (incidentsOverTime[date] || 0) + 1;
    });

    return {
      labels: Object.keys(incidentsOverTime),
      datasets: [
        {
          label: 'Incidents Reported',
          data: Object.values(incidentsOverTime),
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.5)',
        },
      ],
    };
  };

  const incidentsOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Incidents Reported Over Time',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };
  const incidentsData = processIncidentsOverTime();

  /**
   * Processes raw incident data to determine the distribution of incident causes.
   * @returns {Object} Chart.js data object for the Doughnut Chart.
   */
  const processRiskDistribution = () => {
    const riskLevelCounts = {};
    historicalData.forEach(item => {
      const cause = item.cause || 'Unknown'; // Group by incident cause
      riskLevelCounts[cause] = (riskLevelCounts[cause] || 0) + 1;
    });

    // Color array for the doughnut segments
    const colors = [
      'rgba(255, 99, 132, 0.7)', 'rgba(54, 162, 235, 0.7)', 'rgba(255, 206, 86, 0.7)',
      'rgba(75, 192, 192, 0.7)', 'rgba(153, 102, 255, 0.7)', 'rgba(255, 159, 64, 0.7)',
    ];

    return {
      labels: Object.keys(riskLevelCounts),
      datasets: [
        {
          label: 'Incident Cause Distribution',
          data: Object.values(riskLevelCounts),
          backgroundColor: Object.keys(riskLevelCounts).map((_, index) => colors[index % colors.length]),
          borderColor: Object.keys(riskLevelCounts).map((_, index) => colors[index % colors.length].replace('0.7', '1')),
          borderWidth: 1,
        },
      ],
    };
  };

  const riskDistributionOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Incident Cause Distribution',
      },
    },
  };
  const riskDistributionData = processRiskDistribution();

  /**
   * Processes raw incident data to aggregate total casualties per cause.
   * @returns {Object} Chart.js data object for the Bar Chart.
   */
  const processCasualtiesByCause = () => {
    const casualtiesByCause = {};
    historicalData.forEach(item => {
      const cause = item.cause || 'Unknown';
      casualtiesByCause[cause] = (casualtiesByCause[cause] || 0) + (item.casualties || 0);
    });

    return {
      labels: Object.keys(casualtiesByCause),
      datasets: [
        {
          label: 'Total Casualties',
          data: Object.values(casualtiesByCause),
          backgroundColor: 'rgba(53, 162, 235, 0.5)', // Blue
        },
      ],
    };
  };

  const casualtiesOptions = {
    indexAxis: 'y', // Horizontal bar chart
    elements: {
      bar: {
        borderWidth: 2,
      },
    },
    responsive: true,
    plugins: {
      legend: {
        position: 'right',
      },
      title: {
        display: true,
        text: 'Total Casualties by Cause',
      },
    },
  };
  const casualtiesData = processCasualtiesByCause();


  // Render loading or error state
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
        <h3>Historical Analytics Dashboard</h3>
        <p className="error-message">Error loading historical data: {error}</p>
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
          <Line options={incidentsOptions} data={incidentsData} />
        </div>
        <div className="chart-wrapper">
          <Doughnut options={riskDistributionOptions} data={riskDistributionData} />
        </div>
        <div className="chart-wrapper">
          <Bar options={casualtiesOptions} data={casualtiesData} />
        </div>
      </div>
    </div>
  );
};

export default HistoricalAnalytics;