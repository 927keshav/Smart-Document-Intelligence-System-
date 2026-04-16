import React, { useState } from 'react';
import Upload from './Upload';
import SummaryView from './SummaryView';
import TaskList from './TaskList';

function Dashboard() {
  const [analysis, setAnalysis] = useState({
    fileName: '',
    extractedText: '',
    summary: '',
  });

  return (
    <main style={{ display: 'grid', gap: '22px' }}>
      <section
        style={{
          background: 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '28px',
          padding: '28px',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: '18px',
            alignItems: 'center',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.85rem',
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                color: '#8fd8ff',
              }}
            >
              Dashboard
            </div>
            <h1 style={{ margin: '8px 0 0', fontSize: '2.2rem' }}>Document Intelligence Workspace</h1>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.76)', maxWidth: '420px', lineHeight: 1.7 }}>
            Upload files, inspect extracted text, read a concise summary, and review task deadlines
            in a single responsive view.
          </div>
        </div>
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '22px',
        }}
      >
        <Upload onAnalysisComplete={setAnalysis} />
        <SummaryView summary={analysis.summary} fileName={analysis.fileName} />
      </div>

      <TaskList />
    </main>
  );
}

export default Dashboard;
