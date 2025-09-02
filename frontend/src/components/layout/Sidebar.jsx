import React, { useState } from 'react';
import './Sidebar.css';

const Sidebar = () => {
    // State to manage the active navigation item
    const [activeItem, setActiveItem] = useState('dashboard'); // Default to 'dashboard'

    // Function to handle navigation item clicks
    const handleNavClick = (itemName) => {
        setActiveItem(itemName);
        // TODO: Implement actual navigation/view switching logic later
        console.log(`Navigating to: ${itemName}`); // Temporary log
    };

    return (
        <nav className="app-sidebar">
            <ul>
                {/* Map through navigation items for cleaner code (optional but good practice) */}
                {[
                    { id: 'dashboard', label: 'Dashboard' },
                    { id: 'map', label: 'Crowd Map' },
                    { id: 'alerts', label: 'Alerts' },
                    { id: 'chokepoints', label: 'Choke Points' },
                    { id: 'evacuation', label: 'Evacuation Planner' },
                    { id: 'analytics', label: 'Analytics' },
                ].map((item) => (
                    <li key={item.id}>
                        {/* Add onClick handler and className based on active state */}
                        <button
                            className={`nav-link ${activeItem === item.id ? 'active' : ''}`}
                            onClick={() => handleNavClick(item.id)}
                        >
                            {item.label}
                        </button>
                    </li>
                ))}
            </ul>
        </nav>
    );
};

export default Sidebar;