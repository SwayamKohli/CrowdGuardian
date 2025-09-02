import React from 'react';
import './Header.css';

const Header = () => {
    // Placeholder for user info or system status
    const userInfo = { name: "Admin User" }; // Would come from context/state later

    return (
        <header className="app-header">
            <div className="header-content">
                <div className="header-title">
                    <h1>CrowdGuardian</h1>
                    <p>Real-Time Stampede Risk Prediction & Safety System</p>
                </div>
                <div className="header-user-info">
                    <span>Welcome, {userInfo.name}</span>
                    {/* Addition of icons, notifications, logout button later */}
                </div>
            </div>
        </header>
    );
};

export default Header;