import React from 'react';
// import './Sidebar.css';

const Sidebar = () => {
    return (
        <nav className="app-sidebar">
            <ul>
                <li><a href="#dashboard">Dashboard</a></li>
                <li><a href="#map">Crowd Map</a></li>
                <li><a href="#alerts">Alerts</a></li>
                <li><a href="#chokepoints">Choke Points</a></li>
                <li><a href="#evacuation">Evacuation Planner</a></li>
                <li><a href="#analytics">Analytics</a></li>
                {/* Add more links as needed */}
            </ul>
        </nav>
    );
};

export default Sidebar;