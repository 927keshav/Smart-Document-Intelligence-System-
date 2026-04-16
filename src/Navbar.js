import React from 'react';

const shell = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '18px',
  padding: '22px 0 28px',
};

function Navbar({ currentPage, onPageChange, activeFeature, onFeatureChange }) {
  const navItems = [
    { id: 'summarisation', label: 'Summarisation' },
    { id: 'taskExtraction', label: 'Task Extraction' },
    { id: 'deadline', label: 'Deadline' },
  ];

  const routeItems = [
    { id: 'home', label: 'Home' },
    { id: 'dashboard', label: 'Dashboard' },
  ];

  return (
    <header style={shell}>
      <div>
        <div style={{ fontSize: '0.82rem', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
          Brand
        </div>
        <div style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.04em' }}>
          HACKGANGSTERS
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          padding: '10px',
          borderRadius: '999px',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.12)',
          backdropFilter: 'blur(14px)',
        }}
      >
        {routeItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onPageChange(item.id)}
            style={{
              border: 'none',
              cursor: 'pointer',
              padding: '10px 16px',
              borderRadius: '999px',
              fontWeight: 700,
              color: '#fff',
              background:
                currentPage === item.id
                  ? 'linear-gradient(135deg, rgba(255, 129, 72, 0.95), rgba(255, 70, 112, 0.9))'
                  : 'transparent',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <nav
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          justifyContent: 'flex-end',
        }}
      >
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              onPageChange('home');
              onFeatureChange(item.id);
            }}
            style={{
              border: '1px solid rgba(255,255,255,0.14)',
              background:
                activeFeature === item.id
                  ? 'rgba(255,255,255,0.18)'
                  : 'rgba(255,255,255,0.07)',
              color: '#fff',
              cursor: 'pointer',
              padding: '12px 16px',
              borderRadius: '16px',
              fontWeight: 600,
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}

export default Navbar;
