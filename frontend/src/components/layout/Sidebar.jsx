import React from 'react';
import './Sidebar.css';

/**
 * Navigation sidebar component.
 * Manages click events and communicates the chosen view to the parent component.
 *
 * @param {object} props - The component props.
 * @param {string} props.activeItem - The ID of the currently active navigation item.
 * @param {function} props.setActiveItem - Function from parent to update the active view state.
 */
const Sidebar = ({ activeItem, setActiveItem }) => {

  /**
   * Handles navigation item clicks by updating the active state.
   * @param {string} itemName - The ID of the clicked item.
   */
  const handleNavClick = (itemName) => {
    setActiveItem(itemName);
  };

  // Define the list of navigation items
  const navItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'map', label: 'Crowd Map' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'chokepoints', label: 'Choke Points' },
    { id: 'analytics', label: 'Analytics' },
  ];

  return (
    <nav className="app-sidebar">
      <ul>
        {navItems.map((item) => (
          <li key={item.id}>
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