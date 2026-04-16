import React from 'react';

const defaultSummary = `Upload a document or audio file to see a generated summary here.`;

function SummaryView({ summary = defaultSummary, fileName }) {
  return (
    <section
      style={{
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '24px',
        padding: '24px',
        backdropFilter: 'blur(16px)',
      }}
    >
      <h2 style={{ margin: '0 0 10px', fontSize: '1.45rem' }}>Summary</h2>
      {fileName ? (
        <p style={{ margin: '0 0 12px', color: '#8fd8ff', fontSize: '0.95rem' }}>
          Latest file: {fileName}
        </p>
      ) : null}
      <p
        style={{
          margin: 0,
          lineHeight: 1.8,
          color: 'rgba(255,255,255,0.82)',
          whiteSpace: 'pre-line',
        }}
      >
        {summary}
      </p>
    </section>
  );
}

export default SummaryView;
