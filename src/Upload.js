import React, { useState } from 'react';
import axios from 'axios';

const card = {
  background: 'rgba(255, 255, 255, 0.1)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  borderRadius: '24px',
  padding: '24px',
  backdropFilter: 'blur(16px)',
};

const acceptedFileTypes = '.pdf,.docx,.txt,.mp3,.wav,.m4a,.ogg,.webm,.mpeg';

function Upload({ onAnalysisComplete }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extractedText, setExtractedText] = useState('');
  const [error, setError] = useState('');

  const handleUpload = async () => {
    if (!file) {
      setError('Please choose a document or audio file first.');
      return;
    }

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadResponse = await axios.post('/upload/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const extracted =
        uploadResponse?.data?.extracted_text ||
        uploadResponse?.data?.text ||
        'Upload succeeded, but no extracted text was returned by the backend.';

      setExtractedText(extracted);

      const summaryResponse = await axios.post('/summarize/', {
        text: extracted,
      });

      onAnalysisComplete?.({
        fileName: file.name,
        extractedText: extracted,
        summary: summaryResponse?.data?.summary || 'No summary available.',
      });
    } catch (uploadError) {
      setError(
        uploadError?.response?.data?.detail ||
          uploadError?.response?.data?.message ||
          uploadError?.message ||
          'Upload failed. Please check that the backend is running.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={card}>
      <div style={{ marginBottom: '18px' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '1.5rem' }}>Upload Document</h2>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.78)', lineHeight: 1.7 }}>
          Upload a PDF, DOCX, TXT, or audio file and send it to the backend for extraction and summarization.
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '14px',
          alignItems: 'center',
        }}
      >
        <input
          type="file"
          accept={acceptedFileTypes}
          onChange={(event) => setFile(event.target.files?.[0] || null)}
          style={{
            flex: 1,
            minWidth: '220px',
            color: '#fff',
            padding: '14px',
            borderRadius: '16px',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        />

        <button
          onClick={handleUpload}
          disabled={loading}
          style={{
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            borderRadius: '16px',
            padding: '14px 24px',
            fontWeight: 700,
            color: '#fff',
            background: 'linear-gradient(135deg, #00d1ff 0%, #2a7bff 100%)',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Processing...' : 'Upload & Summarize'}
        </button>
      </div>

      {file ? (
        <p style={{ margin: '14px 0 0', color: 'rgba(255,255,255,0.86)' }}>
          Selected file: <strong>{file.name}</strong>
        </p>
      ) : null}

      {error ? (
        <div
          style={{
            marginTop: '18px',
            padding: '14px 16px',
            borderRadius: '16px',
            background: 'rgba(255, 82, 82, 0.12)',
            border: '1px solid rgba(255, 82, 82, 0.3)',
            color: '#ffd8d8',
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={{ marginTop: '22px' }}>
        <h3 style={{ margin: '0 0 10px', fontSize: '1.05rem' }}>Extracted Text</h3>
        <div
          style={{
            minHeight: '180px',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.7,
            padding: '18px',
            borderRadius: '18px',
            background: 'rgba(8, 17, 31, 0.38)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.88)',
          }}
        >
          {extractedText || 'Extracted text from the backend will appear here.'}
        </div>
      </div>
    </section>
  );
}

export default Upload;
