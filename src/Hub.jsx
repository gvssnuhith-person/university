import React from 'react';
import './App.css';

const Hub = () => {
  return (
    <div className="hub-page">
      <div className="cyber-grid"></div>
      <div className="hub-container">
        <header className="hub-header">
          <h1>RISE <span className="gradient-text">GVS PORTAL</span></h1>
          <p>Unifying Campus Excellence & Student Voice</p>
        </header>

        <div className="hub-grid">
          <div className="hub-card" onClick={() => window.location.href = '/university'}>
            <div className="hub-icon">🎓</div>
            <h2>University Portal</h2>
            <p>Access Attendance, Faculty, and Admin Management Systems.</p>
            <button className="hub-btn university-theme">ENTER ACADEMICS</button>
          </div>

          <div className="hub-card" onClick={() => window.location.href = '/voices'}>
            <div className="hub-icon">🎭</div>
            <h2>Campus Voices</h2>
            <p>Connect with the community, share opinions, and stay heard.</p>
            <button className="hub-btn voices-theme">ENTER VOICES</button>
          </div>
        </div>

        <footer className="hub-footer">
          <p>© 2026 RISE KRISHNA SAI GANDHI • SECURE MULTI-PROJECT GATEWAY</p>
        </footer>
      </div>
    </div>
  );
};

export default Hub;
