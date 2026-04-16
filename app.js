(function () {
  const root = document.getElementById('root');

  if (!root) return;

  const API_BASE = window.location.protocol === 'file:' ? 'http://127.0.0.1:8000' : '';
  const STORAGE_KEY = 'sgu-upload-history-v1';

  const state = {
    page: 'home',
    feature: 'summarisation',
    loading: false,
    uploadError: '',
    recordingError: '',
    recordingNotice: '',
    selectedFile: null,
    filename: '',
    extractedText: '',
    extractedTextLength: 0,
    summary: '',
    tasks: [],
    documents: [],
    isRecording: false,
    recordingDurationSeconds: 0,
    recordedFromMicrophone: false,
    mediaRecorder: null,
    mediaStream: null,
    recordedChunks: [],
    recordingStartedAt: 0,
    recordingTimerId: null,
  };

  const featureContent = {
    summarisation: {
      title: 'Summarisation',
      subtitle: 'Readable summaries from long documents without leaving the page.',
      points: [
        'Designed for PDFs, DOCX files, and TXT uploads.',
        'Shows extracted text preview alongside generated summaries.',
        'Keeps the reading experience focused and clean.',
      ],
    },
    taskExtraction: {
      title: 'Task Extraction',
      subtitle: 'Turn documents into action items with visible priorities and dates.',
      points: [
        'Pulls likely tasks from uploaded text.',
        'Highlights deadlines and priority in one compact section.',
        'Keeps summary and task outputs connected to the same upload.',
      ],
    },
    deadline: {
      title: 'Deadline View',
      subtitle: 'Keep important due dates visible while you review documents.',
      points: [
        'Deadlines are grouped with extracted tasks.',
        'Priority markers help you scan what matters first.',
        'Built to stay readable on both desktop and mobile.',
      ],
    },
  };

  function readStoredDocuments() {
    if (!('localStorage' in window)) {
      return [];
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(normalizeDocument).filter(Boolean) : [];
    } catch (error) {
      return [];
    }
  }

  function persistDocuments() {
    if (!('localStorage' in window)) {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.documents));
    } catch (error) {}
  }

  function normalizeTask(task, filename, index) {
    return {
      task: task && task.task ? String(task.task) : `Task ${index + 1}`,
      deadline: task && task.deadline ? String(task.deadline) : '',
      detected_deadline: task && task.detected_deadline ? String(task.detected_deadline) : '',
      deadline_source: task && task.deadline_source ? String(task.deadline_source) : 'missing',
      priority: task && task.priority ? String(task.priority) : 'Medium',
      source_filename: filename || 'Uploaded document',
    };
  }

  function normalizeDocument(document) {
    if (!document) {
      return null;
    }

    const filename = document.filename ? String(document.filename) : 'Uploaded document';
    const uploadedAt = document.uploadedAt ? String(document.uploadedAt) : new Date().toISOString();
    const extractedText = document.extractedText ? String(document.extractedText) : '';
    const extractedTextLength =
      typeof document.extractedTextLength === 'number'
        ? document.extractedTextLength
        : extractedText.length;
    const summary = document.summary ? String(document.summary) : '';
    const tasks = Array.isArray(document.tasks)
      ? document.tasks.map((task, index) => normalizeTask(task, filename, index))
      : [];

    return {
      id: document.id ? String(document.id) : `${uploadedAt}-${filename}`,
      filename,
      extractedText,
      extractedTextLength,
      summary,
      tasks,
      uploadedAt,
    };
  }

  function dedupeTasks(tasks) {
    const seen = new Set();
    return tasks.filter((task) => {
      const key = [
        task.source_filename || '',
        task.task || '',
        task.deadline || '',
        task.priority || '',
      ]
        .join('|')
        .toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  function syncDerivedState() {
    const documents = state.documents
      .slice()
      .sort((first, second) => Date.parse(first.uploadedAt || 0) - Date.parse(second.uploadedAt || 0));
    const latestDocument = documents[documents.length - 1];

    state.filename = latestDocument ? latestDocument.filename : '';
    state.extractedText = latestDocument ? latestDocument.extractedText : '';
    state.extractedTextLength = latestDocument ? latestDocument.extractedTextLength : 0;
    state.summary = latestDocument ? latestDocument.summary : '';
    state.tasks = dedupeTasks(documents.flatMap((document) => document.tasks || []));
  }

  state.documents = readStoredDocuments();
  syncDerivedState();

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function glassCard(extra) {
    return `background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);box-shadow:0 18px 40px rgba(0,0,0,.22);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-radius:24px;${extra || ''}`;
  }

  function browserSupportsRecording() {
    return Boolean(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function getPreferredRecordingMimeType() {
    if (!window.MediaRecorder || !window.MediaRecorder.isTypeSupported) {
      return '';
    }

    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
    ];

    for (const candidate of candidates) {
      if (window.MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    }

    return '';
  }

  function getRecordingExtension(mimeType) {
    if (mimeType.includes('ogg')) {
      return 'ogg';
    }
    if (mimeType.includes('mp4')) {
      return 'm4a';
    }
    return 'webm';
  }

  function formatRecordingDuration(totalSeconds) {
    const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
    const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
    const seconds = String(safeSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function stopRecordingTimer() {
    if (state.recordingTimerId) {
      window.clearInterval(state.recordingTimerId);
      state.recordingTimerId = null;
    }
  }

  function cleanupRecordingResources() {
    stopRecordingTimer();

    if (state.mediaStream) {
      state.mediaStream.getTracks().forEach((track) => track.stop());
    }

    state.mediaStream = null;
    state.mediaRecorder = null;
    state.recordedChunks = [];
    state.recordingStartedAt = 0;
    state.isRecording = false;
  }

  async function startMicrophoneRecording() {
    state.recordingError = '';
    state.recordingNotice = '';

    if (!browserSupportsRecording()) {
      state.recordingError = 'This browser does not support microphone recording.';
      render();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getPreferredRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      state.mediaStream = stream;
      state.mediaRecorder = recorder;
      state.recordedChunks = [];
      state.recordingStartedAt = Date.now();
      state.recordingDurationSeconds = 0;
      state.isRecording = true;
      state.recordedFromMicrophone = false;
      state.selectedFile = null;
      state.uploadError = '';

      recorder.addEventListener('dataavailable', function (event) {
        if (event.data && event.data.size > 0) {
          state.recordedChunks.push(event.data);
        }
      });

      recorder.addEventListener('stop', function () {
        const recordingMimeType = recorder.mimeType || mimeType || 'audio/webm';
        const extension = getRecordingExtension(recordingMimeType);
        const blob = new Blob(state.recordedChunks, { type: recordingMimeType });

        if (blob.size > 0) {
          const filename = `voice-note-${Date.now()}.${extension}`;
          state.selectedFile = new File([blob], filename, {
            type: recordingMimeType,
            lastModified: Date.now(),
          });
          state.recordedFromMicrophone = true;
          state.recordingNotice = 'Voice recording is ready. Click Analyze Voice to transcribe it.';
        } else {
          state.recordingError = 'No audio was captured. Please try recording again.';
        }

        cleanupRecordingResources();
        render();
      });

      recorder.start();
      state.recordingTimerId = window.setInterval(function () {
        state.recordingDurationSeconds = Math.floor((Date.now() - state.recordingStartedAt) / 1000);
        const timer = root.querySelector('#recordingTimer');
        if (timer) {
          timer.textContent = formatRecordingDuration(state.recordingDurationSeconds);
        }
      }, 1000);
      render();
    } catch (error) {
      cleanupRecordingResources();
      state.recordingError =
        error && error.name === 'NotAllowedError'
          ? 'Microphone access was blocked. Please allow microphone permission and try again.'
          : 'Could not start microphone recording.';
      render();
    }
  }

  function stopMicrophoneRecording() {
    if (!state.mediaRecorder) {
      return;
    }

    if (state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    } else {
      cleanupRecordingResources();
      render();
    }
  }

  function renderNavbar() {
    const currentTitle =
      state.feature === 'summarisation'
        ? 'Summaries'
        : state.feature === 'taskExtraction'
        ? 'Tasks'
        : 'Deadlines';

    return `
      <header style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;padding:24px 0 30px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="width:42px;height:42px;border-radius:14px;background:linear-gradient(135deg,#00d1ff 0%,#2a7bff 100%);display:flex;align-items:center;justify-content:center;font-weight:800;color:#07111f;">H</div>
          <div>
            <div style="font-size:1.35rem;font-weight:800;letter-spacing:-.03em;color:#fff;">HACKGANGSTERS</div>
            <div style="font-size:.88rem;color:rgba(228,236,247,.6);">Document workspace</div>
          </div>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:10px;padding:8px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);">
          ${[
            ['home', 'Home'],
            ['dashboard', 'Dashboard'],
          ]
            .map(
              ([id, label]) => `
            <button data-page="${id}" style="border:none;cursor:pointer;padding:10px 16px;border-radius:999px;font-weight:700;color:#fff;background:${
                state.page === id ? 'linear-gradient(135deg, #ff8458 0%, #ff4f88 100%)' : 'transparent'
              };">${label}</button>`
            )
            .join('')}
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:10px;">
          ${[
            ['summarisation', 'Summarisation'],
            ['taskExtraction', 'Task Extraction'],
            ['deadline', 'Deadline'],
          ]
            .map(
              ([id, label]) => `
            <button data-feature="${id}" style="border:1px solid rgba(255,255,255,.12);background:${
                state.feature === id ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.04)'
              };color:#fff;cursor:pointer;padding:11px 15px;border-radius:14px;font-weight:600;">${label}</button>`
            )
            .join('')}
        </div>

        <div style="width:100%;display:flex;justify-content:flex-end;">
          <div style="padding:8px 12px;border-radius:999px;background:rgba(143,216,255,.1);border:1px solid rgba(143,216,255,.18);font-size:.82rem;color:#c8e7ff;">
            Focus: ${currentTitle}
          </div>
        </div>
      </header>
    `;
  }

  function renderHome() {
    const active = featureContent[state.feature];

    return `
      <main>
        <section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:22px;">
          <section style="${glassCard('padding:34px;background:linear-gradient(155deg, rgba(255,255,255,.12), rgba(255,255,255,.05));')}">
            <div style="display:inline-flex;padding:8px 12px;border-radius:999px;background:rgba(143,216,255,.1);border:1px solid rgba(143,216,255,.18);font-size:.76rem;letter-spacing:.14em;text-transform:uppercase;color:#cae9ff;">
              Intelligent Document Analysis
            </div>
            <h1 style="margin:18px 0 14px;font-size:clamp(2rem,4vw,3.3rem);line-height:1.05;letter-spacing:-.045em;max-width:620px;">
              Clean summaries, extracted tasks, and deadline visibility from one upload flow.
            </h1>
            <p style="margin:0;max-width:560px;font-size:1rem;line-height:1.82;color:rgba(228,236,247,.72);">
              Upload long files, review extracted text, and move straight into action without switching between disconnected screens.
            </p>

            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-top:28px;">
              ${[
                ['Upload', 'PDF, DOCX, and TXT support with backend processing.'],
                ['Summarise', 'Generate a concise summary from extracted content.'],
                ['Act', 'Review tasks, priorities, and deadlines together.'],
              ]
                .map(
                  ([title, text]) => `
                <div style="padding:18px;border-radius:18px;background:rgba(7,14,26,.24);border:1px solid rgba(255,255,255,.08);">
                  <div style="font-weight:700;font-size:1rem;color:#fff;">${title}</div>
                  <div style="margin-top:8px;font-size:.93rem;line-height:1.65;color:rgba(228,236,247,.68);">${text}</div>
                </div>`
                )
                .join('')}
            </div>
          </section>

          <section style="${glassCard('padding:28px;background:linear-gradient(180deg, rgba(9,18,32,.56), rgba(255,255,255,.05));display:flex;flex-direction:column;')}">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;">
              <div>
                <div style="font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;color:#8fd8ff;">Feature</div>
                <h2 style="margin:10px 0 10px;font-size:1.8rem;letter-spacing:-.03em;">${active.title}</h2>
                <p style="margin:0;font-size:.98rem;line-height:1.75;color:rgba(228,236,247,.74);max-width:420px;">${active.subtitle}</p>
              </div>
            </div>

            <div style="display:flex;flex-wrap:wrap;gap:10px;margin:20px 0 18px;">
              ${[
                ['summarisation', 'Summaries'],
                ['taskExtraction', 'Tasks'],
                ['deadline', 'Deadlines'],
              ]
                .map(
                  ([id, label]) => `
                <button data-feature="${id}" style="cursor:pointer;border:1px solid rgba(255,255,255,.14);background:${
                    state.feature === id
                      ? 'linear-gradient(135deg, rgba(0,209,255,.85), rgba(17,94,255,.82))'
                      : 'rgba(255,255,255,.06)'
                  };color:#fff;border-radius:12px;padding:11px 14px;font-weight:700;">${label}</button>`
                )
                .join('')}
            </div>

            <div style="display:grid;gap:12px;">
              ${active.points
                .map(
                  (point) => `
                <div style="padding:16px 18px;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);line-height:1.65;color:rgba(234,240,248,.8);">
                  ${point}
                </div>`
                )
                .join('')}
            </div>
          </section>
        </section>

        <section style="margin-top:22px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;">
          ${[
            ['Long PDF Ready', 'The backend processes extraction and summarisation server-side for larger files.'],
            ['Single Flow', 'One upload returns extracted text preview, summary, and tasks together.'],
            ['Frontend + Backend', 'Designed to work from the backend server or directly from file mode.'],
          ]
            .map(
              ([title, text]) => `
            <div style="${glassCard('padding:22px;')}">
              <div style="font-size:1.02rem;font-weight:700;color:#fff;">${title}</div>
              <p style="margin:8px 0 0;line-height:1.72;color:rgba(228,236,247,.72);">${text}</p>
            </div>`
            )
            .join('')}
        </section>
      </main>
    `;
  }

  function renderDashboard() {
    return `
      <main style="display:grid;gap:22px;">
        <section style="${glassCard('padding:28px;')}">
          <div style="display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:18px;">
            <div>
              <div style="font-size:.8rem;letter-spacing:.14em;text-transform:uppercase;color:#8fd8ff;">Workspace</div>
              <h1 style="margin:8px 0 0;font-size:2.1rem;letter-spacing:-.03em;">Document Dashboard</h1>
            </div>
            <p style="margin:0;max-width:460px;line-height:1.75;color:rgba(228,236,247,.72);">
              Upload a document to get extracted text, a generated summary, and tasks with predicted deadlines.
            </p>
          </div>
        </section>

        <section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:22px;">
          ${renderUpload()}
          ${renderSummary()}
        </section>

        ${renderTasks()}
      </main>
    `;
  }

  function renderUpload() {
    return `
      <section style="${glassCard('padding:24px;')}">
        <div style="margin-bottom:18px;">
          <h2 style="margin:0 0 8px;font-size:1.45rem;">Upload Area</h2>
          <p style="margin:0;line-height:1.72;color:rgba(228,236,247,.72);">
            Upload a PDF, DOCX, TXT, or audio file. The backend will extract or transcribe text, generate a summary, and return tasks.
          </p>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
          <input id="fileInput" type="file" accept=".pdf,.docx,.txt,.mp3,.wav,.m4a,.ogg,.webm,.mpeg,audio/*"
            style="flex:1;min-width:220px;padding:14px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;" />
          <button id="uploadBtn" style="border:none;cursor:pointer;padding:14px 22px;border-radius:14px;font-weight:700;color:#fff;background:linear-gradient(135deg,#00d1ff 0%,#2a7bff 100%);opacity:${
            state.loading ? '.72' : '1'
          };">${state.loading ? 'Analyzing...' : 'Analyze Voice / File'}</button>
        </div>

        <div style="margin-top:14px;padding:16px;border-radius:16px;background:rgba(5,12,24,.28);border:1px solid rgba(255,255,255,.08);">
          <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;align-items:center;">
            <div>
              <div style="font-weight:700;color:#fff;">Voice Assistant</div>
              <div style="margin-top:6px;line-height:1.65;color:rgba(228,236,247,.68);">
                Record from your microphone, then analyze the captured audio for transcript, summary, and tasks.
              </div>
            </div>
            <div id="recordingTimer" style="padding:8px 12px;border-radius:999px;background:${
              state.isRecording ? 'rgba(255,90,90,.14)' : 'rgba(255,255,255,.06)'
            };border:1px solid ${
      state.isRecording ? 'rgba(255,90,90,.3)' : 'rgba(255,255,255,.08)'
    };color:${state.isRecording ? '#ffb3b3' : 'rgba(228,236,247,.72)'};font-weight:700;">
              ${state.isRecording ? formatRecordingDuration(state.recordingDurationSeconds) : 'Ready to record'}
            </div>
          </div>

          <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:14px;">
            <button id="startRecordingBtn" type="button" ${state.isRecording ? 'disabled' : ''} style="border:none;cursor:${
      state.isRecording ? 'not-allowed' : 'pointer'
    };padding:12px 18px;border-radius:14px;font-weight:700;color:#07111f;background:linear-gradient(135deg,#9cf4c5 0%,#4dd8a6 100%);opacity:${
      state.isRecording ? '.55' : '1'
    };">
              Record Voice
            </button>
            <button id="stopRecordingBtn" type="button" ${state.isRecording ? '' : 'disabled'} style="border:1px solid rgba(255,255,255,.14);cursor:${
      state.isRecording ? 'pointer' : 'not-allowed'
    };padding:12px 18px;border-radius:14px;font-weight:700;color:#fff;background:${
      state.isRecording ? 'rgba(255,90,90,.18)' : 'rgba(255,255,255,.06)'
    };opacity:${state.isRecording ? '1' : '.55'};">
              Finish Recording
            </button>
          </div>

          ${
            browserSupportsRecording()
              ? `<div style="margin-top:10px;font-size:.82rem;line-height:1.6;color:rgba(143,216,255,.72);">
                  Finish recording to auto-select the generated audio file, then click Analyze Voice / File.
                </div>`
              : `<div style="margin-top:10px;font-size:.82rem;line-height:1.6;color:#ffd4a8;">
                  Microphone capture is not available in this browser. You can still upload an audio file manually.
                </div>`
          }
        </div>

        ${
          state.selectedFile
            ? `<div style="margin-top:14px;color:rgba(236,241,248,.84);">Selected file: <strong>${escapeHtml(
                state.selectedFile.name
              )}</strong></div>`
            : ''
        }

        ${
          state.recordedFromMicrophone
            ? `<div style="margin-top:10px;font-size:.84rem;color:rgba(156,244,197,.9);">Selected source: microphone recording</div>`
            : ''
        }

        ${
          state.uploadError
            ? `<div style="margin-top:16px;padding:14px 16px;border-radius:14px;background:rgba(255,90,90,.12);border:1px solid rgba(255,90,90,.25);color:#ffd9d9;">${escapeHtml(
                state.uploadError
              )}</div>`
            : ''
        }

        ${
          state.recordingError
            ? `<div style="margin-top:16px;padding:14px 16px;border-radius:14px;background:rgba(255,90,90,.12);border:1px solid rgba(255,90,90,.25);color:#ffd9d9;">${escapeHtml(
                state.recordingError
              )}</div>`
            : ''
        }

        ${
          state.recordingNotice
            ? `<div style="margin-top:16px;padding:14px 16px;border-radius:14px;background:rgba(126,224,129,.12);border:1px solid rgba(126,224,129,.24);color:#d8ffda;">${escapeHtml(
                state.recordingNotice
              )}</div>`
            : ''
        }

        <div style="margin-top:20px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <h3 style="margin:0;font-size:1rem;">Extracted Text Preview</h3>
            ${
              state.extractedTextLength
                ? `<div style="font-size:.82rem;color:rgba(228,236,247,.58);">Characters extracted: ${state.extractedTextLength}</div>`
                : ''
            }
          </div>
          <div style="margin-top:8px;font-size:.82rem;color:rgba(143,216,255,.72);">
            Saved documents: ${state.documents.length}. Preview shows the latest uploaded file.
          </div>
          <div style="margin-top:10px;min-height:220px;max-height:420px;overflow:auto;padding:18px;border-radius:16px;background:rgba(5,12,24,.34);border:1px solid rgba(255,255,255,.08);white-space:pre-wrap;line-height:1.7;color:rgba(234,240,248,.84);">
            ${state.extractedText ? escapeHtml(state.extractedText) : 'Extracted text preview will appear here after upload.'}
          </div>
        </div>
      </section>
    `;
  }

  function renderSummary() {
    const summaryMarkup = state.documents.length
      ? state.documents
          .slice()
          .reverse()
          .map(
            (document) => `
          <div style="padding:16px 18px;border-radius:16px;background:rgba(5,12,24,.28);border:1px solid rgba(255,255,255,.08);">
            <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;align-items:center;">
              <div style="font-weight:700;color:#fff;">${escapeHtml(document.filename)}</div>
              <div style="font-size:.8rem;color:rgba(228,236,247,.56);">${new Date(document.uploadedAt).toLocaleString()}</div>
            </div>
            <div style="margin-top:10px;line-height:1.8;color:rgba(234,240,248,.82);white-space:pre-wrap;">
              ${escapeHtml(document.summary || 'No summary returned.')}
            </div>
          </div>`
          )
          .join('')
      : `<div style="min-height:220px;padding:18px;border-radius:16px;background:rgba(5,12,24,.28);border:1px solid rgba(255,255,255,.08);line-height:1.8;color:rgba(234,240,248,.82);">
          Generated summaries will appear here after you upload documents.
        </div>`;

    return `
      <section style="${glassCard('padding:24px;')}">
        <h2 style="margin:0 0 10px;font-size:1.45rem;">Summary</h2>
        <div style="margin:-4px 0 16px;color:rgba(228,236,247,.66);line-height:1.7;">
          Saved summaries from all uploaded documents: ${state.documents.length}
        </div>
        <div style="display:grid;gap:12px;">${summaryMarkup}</div>
      </section>
    `;
  }

  function renderTasks() {
    const tasksMarkup = state.tasks.length
      ? state.tasks
          .map(
            (task) => `
          <div style="display:grid;grid-template-columns:minmax(0,1fr) 120px 90px;gap:14px;align-items:center;padding:16px 18px;border-radius:16px;background:rgba(5,12,24,.3);border:1px solid rgba(255,255,255,.08);">
            <div>
              <div style="font-weight:700;color:#fff;">${escapeHtml(task.task || 'Untitled task')}</div>
              <div style="margin-top:6px;font-size:.88rem;color:rgba(228,236,247,.58);">Task name</div>
              <div style="margin-top:6px;font-size:.82rem;color:rgba(143,216,255,.7);">${escapeHtml(
                task.source_filename || 'Uploaded document'
              )}</div>
            </div>
            <div style="color:#8fd8ff;font-weight:700;">${escapeHtml(task.deadline || 'TBD')}</div>
            <div style="display:inline-flex;justify-content:center;padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);font-size:.84rem;color:#fff;">${escapeHtml(
              task.priority || 'Medium'
            )}</div>
          </div>`
          )
          .join('')
      : `<div style="padding:18px;border-radius:16px;background:rgba(5,12,24,.28);border:1px solid rgba(255,255,255,.08);line-height:1.72;color:rgba(228,236,247,.72);">
          Extracted tasks and deadlines will appear here after upload.
        </div>`;

    return `
      <section style="${glassCard('padding:24px;')}">
        <h2 style="margin:0 0 16px;font-size:1.45rem;">Tasks & Deadlines</h2>
        <div style="margin:-4px 0 16px;color:rgba(228,236,247,.66);line-height:1.7;">
          Aggregated results from every uploaded document.
        </div>
        <div style="display:grid;gap:12px;">${tasksMarkup}</div>
      </section>
    `;
  }

  function render() {
    root.innerHTML = `
      <div style="min-height:100vh;background:radial-gradient(circle at top left, rgba(0,209,255,.18), transparent 26%), radial-gradient(circle at top right, rgba(255,116,64,.16), transparent 28%), linear-gradient(135deg,#07111f 0%,#0d1729 52%,#131f34 100%);color:#f4f7fb;font-family:'Segoe UI',Tahoma,sans-serif;">
        <div style="width:min(1160px, calc(100% - 28px));margin:0 auto;padding-bottom:42px;">
          ${renderNavbar()}
          ${state.page === 'home' ? renderHome() : renderDashboard()}
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    root.querySelectorAll('[data-page]').forEach((button) => {
      button.addEventListener('click', function () {
        state.page = this.getAttribute('data-page');
        render();
      });
    });

    root.querySelectorAll('[data-feature]').forEach((button) => {
      button.addEventListener('click', function () {
        state.feature = this.getAttribute('data-feature');
        if (state.page !== 'home' && this.hasAttribute('data-feature')) {
          state.page = 'home';
        }
        render();
      });
    });

    const fileInput = root.querySelector('#fileInput');
    if (fileInput) {
      fileInput.addEventListener('change', function (event) {
        state.selectedFile = event.target.files && event.target.files[0] ? event.target.files[0] : null;
        state.uploadError = '';
        state.recordingError = '';
        state.recordingNotice = '';
        state.recordedFromMicrophone = false;
        render();
      });
    }

    const uploadBtn = root.querySelector('#uploadBtn');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', handleUpload);
    }

    const startRecordingBtn = root.querySelector('#startRecordingBtn');
    if (startRecordingBtn) {
      startRecordingBtn.addEventListener('click', startMicrophoneRecording);
    }

    const stopRecordingBtn = root.querySelector('#stopRecordingBtn');
    if (stopRecordingBtn) {
      stopRecordingBtn.addEventListener('click', stopMicrophoneRecording);
    }
  }

  async function handleUpload() {
    if (!state.selectedFile) {
      state.uploadError = 'Please choose a PDF, DOCX, TXT, or audio file first.';
      render();
      return;
    }

    state.loading = true;
    state.uploadError = '';
    state.recordingError = '';
    state.recordingNotice = '';
    render();

    const formData = new FormData();
    formData.append('file', state.selectedFile);

    try {
      const response = await fetch(`${API_BASE}/analyze/`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorText = 'Upload failed. Please check that the backend is running.';
        try {
          const errorJson = await response.json();
          errorText = errorJson.detail || errorJson.message || errorText;
        } catch (parseError) {
          errorText = `${errorText} (${response.status})`;
        }
        throw new Error(errorText);
      }

      const data = await response.json();
      const nextDocument = normalizeDocument({
        id: `${Date.now()}-${data.filename || state.selectedFile.name}`,
        filename: data.filename || state.selectedFile.name,
        extractedText: data.extracted_text_preview || data.extracted_text || '',
        extractedTextLength: data.extracted_text_length,
        summary: data.summary || 'No summary returned.',
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        uploadedAt: new Date().toISOString(),
      });

      state.documents = [...state.documents, nextDocument];
      syncDerivedState();
      persistDocuments();
      state.selectedFile = null;
      state.recordedFromMicrophone = false;
      state.page = 'dashboard';
    } catch (error) {
      state.uploadError = error.message || 'Upload failed.';
    } finally {
      state.loading = false;
      render();
    }
  }

  render();
})();
