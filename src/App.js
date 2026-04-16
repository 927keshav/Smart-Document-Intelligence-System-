import React, { useMemo, useState } from 'react';
import Navbar from './Navbar';
import Dashboard from './Dashboard';

const featureContent = {
      summarisation: {
    title: 'Smart Summarisation',
    subtitle: 'Turn long documents into fast, readable insight.',
    points: [
      'Upload PDF, DOCX, TXT, or audio files from one clean interface.',
      'Preview extracted content before using it in your workflow.',
      'Highlight key takeaways in a compact, glass-style summary panel.',
    ],
  },
  taskExtraction: {
    title: 'Task Extraction',
    subtitle: 'Capture action items automatically from your content.',
    points: [
      'Convert document content into structured next steps.',
      'Display task name, priority, and ownership in an easy scan layout.',
      'Keep action items grouped inside the same dashboard experience.',
    ],
  },
  deadline: {
    title: 'Deadline Tracking',
    subtitle: 'Keep important dates visible before they slip.',
    points: [
      'Show upcoming deadlines in a focused card-based section.',
      'Give every task a date context for quick planning.',
      'Designed for responsive use on desktop and mobile screens.',
    ],
  },
};

const pageShell = {
  minHeight: '100vh',
  background:
    'radial-gradient(circle at top left, rgba(0, 209, 255, 0.22), transparent 28%), radial-gradient(circle at top right, rgba(255, 87, 34, 0.18), transparent 30%), linear-gradient(135deg, #08111f 0%, #101a2f 48%, #18253d 100%)',
  color: '#f4f7fb',
  fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
};

const contentWrap = {
  width: 'min(1180px, calc(100% - 32px))',
  margin: '0 auto',
  paddingBottom: '40px',
};

const heroSection = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: '24px',
  alignItems: 'stretch',
  padding: '12px 0 24px',
};

const glassCard = {
  background: 'rgba(255, 255, 255, 0.12)',
  border: '1px solid rgba(255, 255, 255, 0.18)',
  boxShadow: '0 20px 45px rgba(0, 0, 0, 0.28)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  borderRadius: '28px',
};

function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const [activeFeature, setActiveFeature] = useState('summarisation');

  const activePanel = useMemo(() => featureContent[activeFeature], [activeFeature]);

  return (
    <div style={pageShell}>
      <div style={contentWrap}>
        <Navbar
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          activeFeature={activeFeature}
          onFeatureChange={setActiveFeature}
        />

        {currentPage === 'home' ? (
          <main>
            <section style={heroSection}>
              <div
                style={{
                  ...glassCard,
                  padding: '32px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '420px',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 14px',
                      borderRadius: '999px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      fontSize: '13px',
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                    }}
                  >
                    AI Workflow Hub
                  </div>
                  <h1
                    style={{
                      fontSize: 'clamp(2.6rem, 7vw, 5rem)',
                      lineHeight: 0.96,
                      margin: '22px 0 16px',
                      letterSpacing: '-0.05em',
                    }}
                  >
                    HACKGANGSTERS
                  </h1>
                  <p
                    style={{
                      margin: 0,
                      maxWidth: '540px',
                      fontSize: '1.05rem',
                      lineHeight: 1.8,
                      color: 'rgba(244, 247, 251, 0.82)',
                    }}
                  >
                    Upload documents, generate summaries, extract tasks, and keep every deadline
                    visible in one polished workspace.
                  </p>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: '14px',
                    marginTop: '28px',
                  }}
                >
                  {[
                    { label: 'Summaries', value: 'summarisation' },
                    { label: 'Tasks', value: 'taskExtraction' },
                    { label: 'Deadlines', value: 'deadline' },
                  ].map((item) => (
                    <button
                      key={item.value}
                      onClick={() => setActiveFeature(item.value)}
                      style={{
                        cursor: 'pointer',
                        border: '1px solid rgba(255,255,255,0.16)',
                        background:
                          activeFeature === item.value
                            ? 'linear-gradient(135deg, rgba(0, 209, 255, 0.85), rgba(17, 94, 255, 0.82))'
                            : 'rgba(255,255,255,0.08)',
                        color: '#fff',
                        borderRadius: '18px',
                        padding: '16px 18px',
                        textAlign: 'left',
                        transition: 'transform 0.2s ease, background 0.2s ease',
                      }}
                    >
                      <div style={{ fontSize: '0.8rem', opacity: 0.72 }}>Feature</div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: '6px' }}>
                        {item.label}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div
                style={{
                  ...glassCard,
                  padding: '32px',
                  minHeight: '420px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div
                    style={{
                      color: '#8fd8ff',
                      fontSize: '0.85rem',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      marginBottom: '10px',
                    }}
                  >
                    Live Feature Focus
                  </div>
                  <h2 style={{ margin: '0 0 12px', fontSize: '2rem' }}>{activePanel.title}</h2>
                  <p
                    style={{
                      margin: 0,
                      color: 'rgba(244, 247, 251, 0.8)',
                      fontSize: '1rem',
                      lineHeight: 1.75,
                    }}
                  >
                    {activePanel.subtitle}
                  </p>
                </div>

                <div style={{ marginTop: '24px', display: 'grid', gap: '12px' }}>
                  {activePanel.points.map((point) => (
                    <div
                      key={point}
                      style={{
                        padding: '16px 18px',
                        background: 'rgba(5, 14, 28, 0.3)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '18px',
                        lineHeight: 1.65,
                      }}
                    >
                      {point}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section
              style={{
                ...glassCard,
                padding: '28px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '18px',
              }}
            >
              {[
                ['Document Ingestion', 'Supports PDF, DOCX, TXT, and common audio uploads with backend handoff.'],
                ['Action Visibility', 'See summaries, task extraction, and due dates in one place.'],
                ['Responsive Experience', 'Inline JS styling only, designed to look sharp on any screen.'],
              ].map(([title, text]) => (
                <div
                  key={title}
                  style={{
                    padding: '22px',
                    borderRadius: '22px',
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.12)',
                  }}
                >
                  <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem' }}>{title}</h3>
                  <p style={{ margin: 0, color: 'rgba(244,247,251,0.78)', lineHeight: 1.7 }}>
                    {text}
                  </p>
                </div>
              ))}
            </section>
          </main>
        ) : (
          <Dashboard />
        )}
      </div>
    </div>
  );
}

export default App;
