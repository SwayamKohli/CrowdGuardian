import React, { useState } from 'react';
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
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import './HistoricalAnalytics.css';

// Register all necessary Chart.js components for rendering
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const HistoricalAnalytics = () => {
  // State for time range filtering (e.g., 'day', 'week', 'month')
  const [timeRange, setTimeRange] = useState('week');

  // Configuration and mock data for Incidents Reported Line Chart
  const incidentsData = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      {
        label: 'Incidents Reported',
        data: [2, 1, 3, 0, 4, 5, 2],
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
      },
    ],
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

  // Configuration and mock data for Average Density Bar Chart
  const densityData = {
    labels: ['Zone A', 'Zone B', 'Zone C', 'Zone D', 'Zone E'],
    datasets: [
      {
        label: 'Avg. Density (p/m²)',
        data: [2.1, 3.5, 1.8, 4.2, 2.9],
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
      },
    ],
  };

  const densityOptions = {
    indexAxis: 'y', // Renders as a horizontal bar chart
    elements: {
      bar: {
        borderWidth: 2,
      },
    },
    responsive: true,
    plugins: {
      legend: {
        position: 'top', // FIX: Set position to 'top' for consistency
      },
      title: {
        display: true,
        text: 'Average Density by Zone',
      },
    },
  };

  // Configuration and mock data for Risk Level Distribution Chart
  const riskDistributionData = {
    labels: ['Low', 'Medium', 'High', 'Critical'],
    datasets: [
      {
        label: 'Risk Level Distribution',
        data: [15, 10, 5, 2],
        backgroundColor: [
          'rgba(75, 192, 192, 0.5)', // Low
          'rgba(54, 162, 235, 0.5)', // Medium
          'rgba(255, 206, 86, 0.5)', // High
          'rgba(255, 99, 132, 0.5)', // Critical
        ],
        borderColor: [
          'rgba(75, 192, 192, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(255, 99, 132, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };

  const riskDistributionOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Risk Level Distribution',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

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
          <Bar options={densityOptions} data={densityData} />
        </div>
        <div className="chart-wrapper">
          <Bar options={riskDistributionOptions} data={riskDistributionData} />
        </div>
      </div>
    </div>
  );
};

export default HistoricalAnalytics;