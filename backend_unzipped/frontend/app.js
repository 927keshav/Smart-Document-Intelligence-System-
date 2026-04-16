(function () {
  const root = document.getElementById('root');

  if (!root) return;

  const API_BASE = '';
  const STORAGE_KEY = 'sgu-upload-history-v1';
  const AUTH_TOKEN_KEY = 'sgu-auth-token-v1';
  const AUTH_USER_KEY = 'sgu-auth-user-v1';

  const state = {
    page: 'home',
    feature: 'summarisation',
    dashboardTab: 'summary',
    calendarMonth: new Date().getMonth(),
    calendarYear: new Date().getFullYear(),
    selectedCalendarDay: null,
    loading: false,
    uploadError: '',
    uploadNotice: '',
    selectedFile: null,
    pendingFiles: [],
    dragOverUpload: false,
    uploadActionMenuOpen: false,
    filename: '',
    extractedText: '',
    extractedTextLength: 0,
    summary: '',
    activeDocumentId: '',
    compareSummaryDocumentId: '',
    summaryNotice: '',
    tasks: [],
    documents: [],
    historySearch: '',
    historyTypeFilter: 'all',
    historyDateFilter: '',
    taskSortMode: 'deadline',
    taskEditModalOpen: false,
    editingTaskId: '',
    taskDraft: {
      task: '',
      deadline: '',
      priority: 'Medium',
      source_filename: '',
    },
    authMode: 'login',
    authToken: '',
    currentUser: null,
    authError: '',
    authLoading: true,
    googleClientId: '',
    isRecording: false,
    recordingError: '',
    recordingNotice: '',
    recordingDurationSeconds: 0,
    recordedFromMicrophone: false,
    mediaRecorder: null,
    mediaStream: null,
    recordedChunks: [],
    recordingStartedAt: 0,
    recordingTimerId: null,
    recordingModalOpen: false,
    discardRecordingOnStop: false,
    recordedAudioPreviewUrl: '',
    pendingRecordedFile: null,
    speechRecognition: null,
    liveTranscript: '',
    finalTranscript: '',
    cameraActive: false,
    cameraStream: null,
    cameraError: '',
    cameraNotice: '',
    capturedFromCamera: false,
    cameraModalOpen: false,
    capturedImagePreviewUrl: '',
    pendingCapturedImageFile: null,
  };

  const notifiedDeadlines = new Set();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }

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
    calendar: {
      title: 'Calendar View',
      subtitle: 'See all deadline events arranged on their actual dates.',
      points: [
        'Each deadline appears on its date in the calendar.',
        'Multiple events on the same date are grouped together.',
        'Use month navigation to browse upcoming events.',
      ],
    },
  };

  function getDocumentsStorageKey() {
    return `${STORAGE_KEY}-${state.currentUser ? state.currentUser.id : 'guest'}`;
  }

  function readStoredDocuments() {
    if (!state.currentUser) {
      return [];
    }

    if (!('localStorage' in window)) {
      return [];
    }

    try {
      const raw = window.localStorage.getItem(getDocumentsStorageKey());
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
    if (!state.currentUser) {
      return;
    }

    if (!('localStorage' in window)) {
      return;
    }

    try {
      window.localStorage.setItem(getDocumentsStorageKey(), JSON.stringify(state.documents));
    } catch (error) {}
  }

  function getStoredAuthToken() {
    if (!('localStorage' in window)) {
      return '';
    }

    try {
      return window.localStorage.getItem(AUTH_TOKEN_KEY) || '';
    } catch (error) {
      return '';
    }
  }

  function persistAuthToken(token) {
    if (!('localStorage' in window)) {
      return;
    }

    try {
      if (token) {
        window.localStorage.setItem(AUTH_TOKEN_KEY, token);
      } else {
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
      }
    } catch (error) {}
  }

  function getStoredAuthUser() {
    if (!('localStorage' in window)) {
      return null;
    }

    try {
      const raw = window.localStorage.getItem(AUTH_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function persistAuthUser(user) {
    if (!('localStorage' in window)) {
      return;
    }

    try {
      if (user) {
        window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
      } else {
        window.localStorage.removeItem(AUTH_USER_KEY);
      }
    } catch (error) {}
  }

  function createPendingFileEntry(file, source = 'manual') {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      source,
      addedAt: new Date().toISOString(),
      progress: 0,
      status: 'ready',
      error: '',
    };
  }

  function formatFileSize(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getFileTypeLabel(file) {
    const name = (file && file.name ? file.name : '').toLowerCase();
    if (name.endsWith('.pdf')) return 'PDF';
    if (name.endsWith('.docx')) return 'DOCX';
    if (name.endsWith('.txt')) return 'TXT';
    if (name.match(/\.(png|jpg|jpeg|bmp|gif|tiff|tif|webp)$/)) return 'Image';
    if (name.match(/\.(mp3|wav|m4a|ogg|webm|mpeg)$/)) return 'Audio';
    return file && file.type ? file.type.split('/')[0].toUpperCase() : 'File';
  }

  function getFileTypeAccent(file) {
    const label = getFileTypeLabel(file);
    if (label === 'PDF' || label === 'DOCX' || label === 'TXT') return '#8fd8ff';
    if (label === 'Image') return '#ffd166';
    if (label === 'Audio') return '#9cf4c5';
    return '#fff';
  }

  function getDocumentTypeLabel(document) {
    const filename = document && document.filename ? document.filename.toLowerCase() : '';
    if (filename.endsWith('.pdf')) return 'PDF';
    if (filename.endsWith('.docx')) return 'DOCX';
    if (filename.endsWith('.txt')) return 'TXT';
    if (filename.match(/\.(png|jpg|jpeg|bmp|gif|tiff|tif|webp)$/)) return 'Image';
    if (filename.match(/\.(mp3|wav|m4a|ogg|webm|mpeg)$/)) return 'Audio';
    return 'Other';
  }

  function mergePendingFiles(files, source = 'manual') {
    const nextEntries = Array.from(files || [])
      .filter(Boolean)
      .map((file) => createPendingFileEntry(file, source));

    if (!nextEntries.length) {
      return;
    }

    state.pendingFiles = [...nextEntries, ...state.pendingFiles];
    state.uploadError = '';
    state.uploadNotice = '';
  }

  function updatePendingFile(id, updates) {
    state.pendingFiles = state.pendingFiles.map((entry) =>
      entry.id === id ? { ...entry, ...updates } : entry
    );
  }

  function normalizeTask(task, filename, index) {
    return {
      id: task && task.id ? String(task.id) : `${filename || 'document'}-${index + 1}-${task && task.task ? String(task.task) : 'task'}`,
      task: task && task.task ? String(task.task) : `Task ${index + 1}`,
      deadline: task && task.deadline ? String(task.deadline) : '',
      detected_deadline: task && task.detected_deadline ? String(task.detected_deadline) : '',
      deadline_source: task && task.deadline_source ? String(task.deadline_source) : 'missing',
      priority: task && task.priority ? String(task.priority) : 'Medium',
      source_filename: filename || 'Uploaded document',
      completed: Boolean(task && task.completed),
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
        task.id || '',
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
    const activeDocument = state.activeDocumentId
      ? documents.find((document) => document.id === state.activeDocumentId) || null
      : null;

    state.filename = latestDocument ? latestDocument.filename : '';
    state.extractedText = latestDocument ? latestDocument.extractedText : '';
    state.extractedTextLength = latestDocument ? latestDocument.extractedTextLength : 0;
    state.summary = activeDocument ? activeDocument.summary : '';
    state.tasks = dedupeTasks(documents.flatMap((document) => document.tasks || []));
  }

  async function authFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (state.authToken) {
      headers.set('Authorization', `Bearer ${state.authToken}`);
    }

    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
  }

  function authUploadFile(path, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}${path}`);
      if (state.authToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${state.authToken}`);
      }

      xhr.upload.onprogress = function (event) {
        if (!event.lengthComputable || !onProgress) {
          return;
        }
        const percent = Math.max(5, Math.min(100, Math.round((event.loaded / event.total) * 100)));
        onProgress(percent);
      };

      xhr.onload = function () {
        let data = null;
        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch (error) {}

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data || {});
          return;
        }

        const message =
          (data && (data.detail || data.message)) ||
          `Upload failed. Please check that the backend is running. (${xhr.status})`;
        reject({ status: xhr.status, message });
      };

      xhr.onerror = function () {
        reject({ status: 0, message: 'Upload failed. Please check that the backend is running.' });
      };

      const formData = new FormData();
      formData.append('file', file);
      xhr.send(formData);
    });
  }

  async function fetchAuthConfig() {
    try {
      const response = await fetch(`${API_BASE}/auth/config`);
      if (!response.ok) {
        return;
      }

      const data = await response.json();
      state.googleClientId = data.google_client_id || '';
    } catch (error) {}
  }

  function ensureGoogleButton() {
    const googleButton = root.querySelector('#googleSignInButton');
    if (!googleButton || !state.googleClientId || !window.google || !window.google.accounts || !window.google.accounts.id) {
      return;
    }

    googleButton.innerHTML = '';
    window.google.accounts.id.initialize({
      client_id: state.googleClientId,
      callback: handleGoogleCredentialResponse,
    });
    window.google.accounts.id.renderButton(googleButton, {
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      width: 320,
      text: 'continue_with',
    });
  }

  async function fetchCurrentUser() {
    if (!state.authToken) {
      state.currentUser = null;
      return false;
    }

    try {
      const response = await authFetch('/auth/me');
      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      const nextUser = data.user || null;
      const expectedUser = getStoredAuthUser();

      if (expectedUser && nextUser && expectedUser.id && nextUser.id && expectedUser.id !== nextUser.id) {
        state.authError = 'Your saved session belonged to a different account. Please log in again.';
        state.currentUser = null;
        state.authToken = '';
        persistAuthToken('');
        persistAuthUser(null);
        return false;
      }

      state.currentUser = nextUser;
      persistAuthUser(nextUser);
      state.documents = readStoredDocuments();
      state.activeDocumentId = '';
      syncDerivedState();
      return Boolean(state.currentUser);
    } catch (error) {
      return false;
    }
  }

  async function fetchStoredDocuments() {
    if (!state.currentUser) {
      state.documents = [];
      syncDerivedState();
      return false;
    }

    try {
      const response = await authFetch('/documents/');
      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      const documents = Array.isArray(data.documents)
        ? data.documents.map(normalizeDocument).filter(Boolean)
        : [];

      state.documents = documents;
      state.activeDocumentId = '';
      syncDerivedState();
      persistDocuments();
      return true;
    } catch (error) {}

    return false;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function glassCard(extra) {
    return `background:linear-gradient(180deg, rgba(255,255,255,.105), rgba(255,255,255,.062));border:1px solid rgba(255,255,255,.14);box-shadow:0 24px 58px rgba(0,0,0,.26), 0 8px 22px rgba(2,8,20,.18), inset 0 1px 0 rgba(255,255,255,.09);backdrop-filter:blur(18px) saturate(1.08);-webkit-backdrop-filter:blur(18px) saturate(1.08);border-radius:24px;position:relative;${extra || ''}`;
  }

  function getReminderMeta(deadline) {
    const timestamp = Date.parse(deadline);
    if (Number.isNaN(timestamp)) {
      return null;
    }

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startOfDeadline = new Date(new Date(timestamp).getFullYear(), new Date(timestamp).getMonth(), new Date(timestamp).getDate()).getTime();
    const daysLeft = Math.round((startOfDeadline - startOfToday) / 86400000);

    if (daysLeft < 0) {
      return { label: 'Overdue', tone: '#ff6b6b', bg: 'rgba(255,107,107,.14)' };
    }
    if (daysLeft === 0) {
      return { label: 'Reminder: Today', tone: '#ff9f43', bg: 'rgba(255,159,67,.16)' };
    }
    if (daysLeft === 1) {
      return { label: 'Reminder: Tomorrow', tone: '#ffd166', bg: 'rgba(255,209,102,.16)' };
    }
    if (daysLeft <= 3) {
      return { label: `Reminder: ${daysLeft} days left`, tone: '#7ee081', bg: 'rgba(126,224,129,.14)' };
    }
    return null;
  }

  function getPriorityMeta(priority) {
    const normalized = String(priority || 'Medium').toLowerCase();
    if (normalized === 'high') {
      return {
        label: 'High',
        bg: 'rgba(255,110,110,.14)',
        tone: '#ff9b9b',
        border: 'rgba(255,110,110,.24)',
      };
    }
    if (normalized === 'low') {
      return {
        label: 'Low',
        bg: 'rgba(126,224,129,.14)',
        tone: '#9df3a0',
        border: 'rgba(126,224,129,.24)',
      };
    }
    return {
      label: 'Medium',
      bg: 'rgba(255,209,102,.14)',
      tone: '#ffd88e',
      border: 'rgba(255,209,102,.22)',
    };
  }

  function isTaskOverdue(task) {
    if (!task || task.completed || !task.deadline) {
      return false;
    }

    const timestamp = Date.parse(task.deadline);
    if (Number.isNaN(timestamp)) {
      return false;
    }

    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
    return timestamp < todayEnd && new Date(timestamp).getDate() !== now.getDate();
  }

  function compareTasksByDeadline(firstTask, secondTask) {
    if (firstTask.completed !== secondTask.completed) {
      return firstTask.completed ? 1 : -1;
    }

    const first = Date.parse(firstTask.deadline || '');
    const second = Date.parse(secondTask.deadline || '');

    if (Number.isNaN(first) && Number.isNaN(second)) {
      return String(firstTask.task || '').localeCompare(String(secondTask.task || ''));
    }
    if (Number.isNaN(first)) return 1;
    if (Number.isNaN(second)) return -1;
    return first - second;
  }

  function openTaskEditModal(task) {
    if (!task) {
      return;
    }

    state.editingTaskId = task.id || '';
    state.taskDraft = {
      task: task.task || '',
      deadline: task.deadline || '',
      priority: getPriorityMeta(task.priority).label,
      source_filename: task.source_filename || 'Uploaded document',
    };
    state.taskEditModalOpen = true;
    render();
  }

  function closeTaskEditModal() {
    state.taskEditModalOpen = false;
    state.editingTaskId = '';
    state.taskDraft = {
      task: '',
      deadline: '',
      priority: 'Medium',
      source_filename: '',
    };
    render();
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function splitSummarySentences(summary) {
    return String(summary || '')
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
  }

  function getSummarySections(document) {
    const summary = document && document.summary ? document.summary : '';
    const sentences = splitSummarySentences(summary);
    const tasks = document && Array.isArray(document.tasks) ? document.tasks : [];
    const riskKeywords = ['risk', 'delay', 'delayed', 'missing', 'blocked', 'issue', 'problem', 'urgent', 'overdue', 'fail', 'failed'];
    const actionKeywords = ['submit', 'complete', 'finish', 'review', 'prepare', 'send', 'upload', 'schedule', 'create', 'update', 'follow up'];

    const keyPoints = sentences.length
      ? sentences.slice(0, 5)
      : summary
      ? [summary]
      : ['No summary returned.'];
    const actionItems = tasks.length
      ? tasks.slice(0, 6).map((task) => {
          const parts = [task.task || 'Untitled task'];
          if (task.deadline) {
            parts.push(`Deadline: ${task.deadline}`);
          }
          if (task.priority) {
            parts.push(`Priority: ${task.priority}`);
          }
          return parts.join(' | ');
        })
      : sentences.filter((sentence) => actionKeywords.some((keyword) => sentence.toLowerCase().includes(keyword))).slice(0, 5);
    const risks = sentences
      .filter((sentence) => riskKeywords.some((keyword) => sentence.toLowerCase().includes(keyword)))
      .slice(0, 5);

    return {
      bullets: keyPoints,
      keyPoints,
      actionItems,
      risks,
    };
  }

  function renderHighlightedText(text) {
    const keywords = [
      'deadline',
      'tomorrow',
      'today',
      'urgent',
      'important',
      'risk',
      'overdue',
      'submit',
      'submission',
      'complete',
      'action',
      'task',
      'high',
      'priority',
    ];
    const pattern = new RegExp(`\\b(${keywords.map(escapeRegExp).join('|')})\\b`, 'gi');

    return String(text || '')
      .split(pattern)
      .map((part) => {
        if (keywords.some((keyword) => keyword.toLowerCase() === part.toLowerCase())) {
          return `<mark style="padding:2px 6px;border-radius:999px;background:rgba(255,209,102,.16);color:#ffe4a3;">${escapeHtml(part)}</mark>`;
        }
        return escapeHtml(part);
      })
      .join('');
  }

  function buildSummaryPlainText(document) {
    if (!document) {
      return '';
    }

    const sections = getSummarySections(document);
    const lines = [
      `Summary: ${document.filename || 'Uploaded document'}`,
      `Uploaded: ${document.uploadedAt ? new Date(document.uploadedAt).toLocaleString() : 'Unknown'}`,
      '',
      'Bullet Summary:',
      ...sections.bullets.map((item) => `- ${item}`),
      '',
      'Key Points:',
      ...sections.keyPoints.map((item) => `- ${item}`),
      '',
      'Action Items:',
      ...(sections.actionItems.length ? sections.actionItems.map((item) => `- ${item}`) : ['- No action items detected.']),
    ];

    if (sections.risks.length) {
      lines.push('', 'Risks:', ...sections.risks.map((item) => `- ${item}`));
    }

    return lines.join('\n');
  }

  function downloadTextFile(filename, text, type = 'text/plain') {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function wrapPdfText(text, maxLength = 86) {
    const lines = [];
    String(text || '')
      .split(/\r?\n/)
      .forEach((line) => {
        const words = line.split(/\s+/).filter(Boolean);
        if (!words.length) {
          lines.push('');
          return;
        }

        let current = '';
        words.forEach((word) => {
          if (`${current} ${word}`.trim().length > maxLength) {
            lines.push(current);
            current = word;
          } else {
            current = `${current} ${word}`.trim();
          }
        });
        lines.push(current);
      });
    return lines;
  }

  function escapePdfText(text) {
    return String(text || '')
      .normalize('NFKD')
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  function createSummaryPdfBlob(title, text) {
    const lines = wrapPdfText(`${title}\n\n${text}`, 84);
    const pages = [];
    for (let index = 0; index < lines.length; index += 44) {
      pages.push(lines.slice(index, index + 44));
    }
    if (!pages.length) {
      pages.push(['No summary available.']);
    }

    const objects = [];
    const addObject = (id, content) => {
      objects[id] = `${id} 0 obj\n${content}\nendobj\n`;
    };

    const pageRefs = [];
    addObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
    addObject(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    pages.forEach((pageLines, index) => {
      const pageId = 4 + index * 2;
      const contentId = pageId + 1;
      pageRefs.push(`${pageId} 0 R`);
      const stream = `BT\n/F1 10 Tf\n50 760 Td\n14 TL\n${pageLines
        .map((line) => `(${escapePdfText(line)}) Tj\nT*`)
        .join('')}ET`;
      addObject(
        pageId,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`
      );
      addObject(contentId, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    });

    addObject(2, `<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pages.length} >>`);

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (let index = 1; index < objects.length; index += 1) {
      offsets[index] = pdf.length;
      pdf += objects[index];
    }

    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let index = 1; index < objects.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return new Blob([pdf], { type: 'application/pdf' });
  }

  function renderStructuredSummaryDocument(document, options = {}) {
    if (!document) {
      return '';
    }

    const sections = getSummarySections(document);
    const compact = Boolean(options.compact);
    const sectionIcons = {
      'Key Points': 'KP',
      'Action Items': 'AI',
      Risks: 'RK',
    };
    const listStyle = `margin:10px 0 0;padding-left:20px;display:grid;gap:${compact ? '8px' : '10px'};line-height:1.75;color:rgba(234,240,248,.84);`;
    const sectionCard = (title, items, emptyText) => `
      <div style="padding:${compact ? '14px' : '16px'};border-radius:16px;background:linear-gradient(180deg, rgba(5,12,24,.3), rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.08);display:grid;gap:10px;">
        <div style="display:flex;align-items:center;gap:10px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.06);">
          <div style="width:30px;height:30px;border-radius:10px;background:rgba(143,216,255,.1);border:1px solid rgba(143,216,255,.18);display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:800;color:#8fd8ff;flex:0 0 auto;">${sectionIcons[title] || 'IN'}</div>
          <div style="font-size:.82rem;letter-spacing:.1em;text-transform:uppercase;color:#8fd8ff;font-weight:800;">${title}</div>
        </div>
        ${
          items.length
            ? `<ul style="${listStyle}">${items
                .map((item) => `<li>${renderHighlightedText(item)}</li>`)
                .join('')}</ul>`
            : `<div style="margin-top:10px;color:rgba(228,236,247,.62);line-height:1.7;">${emptyText}</div>`
        }
      </div>
    `;

    return `
      <div style="padding:${compact ? '14px' : '16px 18px'};border-radius:16px;background:rgba(5,12,24,.28);border:1px solid rgba(255,255,255,.08);min-height:${compact ? 'auto' : '220px'};">
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;align-items:center;">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;">
            <div style="width:34px;height:34px;border-radius:12px;background:linear-gradient(135deg, rgba(0,209,255,.16), rgba(42,123,255,.14));border:1px solid rgba(143,216,255,.18);display:flex;align-items:center;justify-content:center;color:#8fd8ff;font-size:.72rem;font-weight:800;flex:0 0 auto;">SUM</div>
            <div style="font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(document.filename)}</div>
          </div>
          <div style="font-size:.8rem;color:rgba(228,236,247,.56);">${new Date(document.uploadedAt).toLocaleString()}</div>
        </div>
        <div style="margin-top:14px;height:1px;background:linear-gradient(90deg, rgba(143,216,255,.24), rgba(255,255,255,.05), transparent);"></div>
        <div style="margin-top:14px;display:grid;gap:12px;">
          ${sectionCard('Key Points', sections.keyPoints, 'No key points detected.')}
          ${sectionCard('Action Items', sections.actionItems, 'No action items detected.')}
          ${sections.risks.length ? sectionCard('Risks', sections.risks, '') : ''}
        </div>
      </div>
    `;
  }

  function getActiveSummaryDocument() {
    return state.activeDocumentId
      ? state.documents.find((document) => document.id === state.activeDocumentId) || null
      : null;
  }

  function getSafeDownloadBaseName(document) {
    return String((document && document.filename) || 'summary')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'summary';
  }

  async function copyActiveSummary() {
    const activeDocument = getActiveSummaryDocument();
    if (!activeDocument) {
      return;
    }

    const text = buildSummaryPlainText(activeDocument);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'readonly');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      state.summaryNotice = 'Summary copied to clipboard.';
    } catch (error) {
      state.summaryNotice = 'Could not copy the summary. Please try again.';
    }
    render();
  }

  function downloadActiveSummary(format) {
    const activeDocument = getActiveSummaryDocument();
    if (!activeDocument) {
      return;
    }

    const baseName = getSafeDownloadBaseName(activeDocument);
    const text = buildSummaryPlainText(activeDocument);
    if (format === 'pdf') {
      const blob = createSummaryPdfBlob(`Summary - ${activeDocument.filename}`, text);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${baseName}-summary.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      state.summaryNotice = 'Summary PDF download started.';
    } else {
      downloadTextFile(`${baseName}-summary.txt`, text);
      state.summaryNotice = 'Summary TXT download started.';
    }
    render();
  }

  function formatMonthYear(year, month) {
    return new Date(year, month, 1).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  }

  function formatDeadlineDay(deadline) {
    const timestamp = Date.parse(deadline);
    if (Number.isNaN(timestamp)) return null;
    const date = new Date(timestamp);
    return {
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate(),
    };
  }

  function getCalendarDeadlineMap(year, month) {
    const deadlineMap = new Map();

    state.tasks
      .filter((task) => task.deadline && !task.completed)
      .forEach((task) => {
        const parts = formatDeadlineDay(task.deadline);
        if (!parts || parts.year !== year || parts.month !== month) {
          return;
        }

        const key = String(parts.day);
        if (!deadlineMap.has(key)) {
          deadlineMap.set(key, []);
        }
        deadlineMap.get(key).push(task);
      });

    return deadlineMap;
  }

  function getCalendarDayDetails(year, month, day) {
    const deadlineMap = getCalendarDeadlineMap(year, month);
    const key = String(day);
    return deadlineMap.get(key) || [];
  }

  function getNotificationButtonLabel() {
    if (!('Notification' in window)) {
      return 'Notifications unsupported';
    }

    if (Notification.permission === 'granted') {
      return 'Notifications enabled';
    }

    if (Notification.permission === 'denied') {
      return 'Notifications blocked';
    }

    return 'Enable notifications';
  }

  function isMobileDevice() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  function browserSupportsRecording() {
    return Boolean(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function browserSupportsCamera() {
    return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function getSpeechRecognitionConstructor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function browserSupportsSpeechRecognition() {
    return Boolean(getSpeechRecognitionConstructor());
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

  function revokeRecordedAudioPreview() {
    if (state.recordedAudioPreviewUrl) {
      URL.revokeObjectURL(state.recordedAudioPreviewUrl);
    }
    state.recordedAudioPreviewUrl = '';
  }

  function resetRecordedAudioDraft() {
    revokeRecordedAudioPreview();
    state.pendingRecordedFile = null;
    state.recordedFromMicrophone = false;
  }

  function cleanupSpeechRecognition() {
    if (state.speechRecognition) {
      try {
        state.speechRecognition.onresult = null;
        state.speechRecognition.onerror = null;
        state.speechRecognition.onend = null;
        state.speechRecognition.stop();
      } catch (error) {}
    }

    state.speechRecognition = null;
  }

  function cleanupCameraResources() {
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach((track) => track.stop());
    }

    state.cameraStream = null;
    state.cameraActive = false;
  }

  function revokeCapturedImagePreview() {
    if (state.capturedImagePreviewUrl) {
      URL.revokeObjectURL(state.capturedImagePreviewUrl);
    }
    state.capturedImagePreviewUrl = '';
  }

  function resetCapturedImageDraft() {
    revokeCapturedImagePreview();
    state.pendingCapturedImageFile = null;
    state.capturedFromCamera = false;
  }

  function attachCameraPreview() {
    const video = root.querySelector('#cameraPreview');
    if (!video || !state.cameraStream) {
      return;
    }

    if (video.srcObject !== state.cameraStream) {
      video.srcObject = state.cameraStream;
    }

    video.play().catch(() => {});
  }

  function getCameraTrack() {
    if (!state.cameraStream) {
      return null;
    }

    const tracks = state.cameraStream.getVideoTracks();
    return tracks && tracks.length ? tracks[0] : null;
  }

  async function takePhotoFromCameraTrack() {
    const track = getCameraTrack();
    if (!track || typeof window.ImageCapture !== 'function') {
      return null;
    }

    try {
      const imageCapture = new window.ImageCapture(track);
      const photoBlob = await imageCapture.takePhoto();
      if (photoBlob && photoBlob.size > 0) {
        return photoBlob;
      }
    } catch (error) {}

    return null;
  }

  async function capturePhotoFromPreview(video) {
    const width = video.videoWidth || 1920;
    const height = video.videoHeight || 1080;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.filter = 'contrast(1.08) saturate(0.95) brightness(1.03)';
    context.drawImage(video, 0, 0, width, height);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.98));
  }

  function getCurrentTranscript() {
    return [state.finalTranscript, state.liveTranscript].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  function startSpeechRecognition() {
    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) {
      return;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = function (event) {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let index = 0; index < event.results.length; index += 1) {
          const segment = event.results[index];
          const transcript = segment[0] ? segment[0].transcript : '';
          if (!transcript) {
            continue;
          }

          if (segment.isFinal) {
            finalTranscript += ` ${transcript}`;
          } else {
            interimTranscript += ` ${transcript}`;
          }
        }

        if (finalTranscript.trim()) {
          state.finalTranscript = `${state.finalTranscript} ${finalTranscript}`.trim();
        }
        state.liveTranscript = interimTranscript.trim();
      };

      recognition.onerror = function () {};
      recognition.onend = function () {
        if (state.isRecording) {
          try {
            recognition.start();
          } catch (error) {}
        }
      };

      state.speechRecognition = recognition;
      recognition.start();
    } catch (error) {}
  }

  async function analyzeTranscriptText(transcriptText, filename) {
    const [summaryResponse, tasksResponse] = await Promise.all([
      fetch(`${API_BASE}/summarize/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: transcriptText }),
      }),
      fetch(`${API_BASE}/tasks/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: transcriptText }),
      }),
    ]);

    if (!summaryResponse.ok || !tasksResponse.ok) {
      throw new Error('Recorded voice was captured, but text analysis failed.');
    }

    const summaryData = await summaryResponse.json();
    const tasksData = await tasksResponse.json();
    const nextDocument = normalizeDocument({
      id: `${Date.now()}-${filename}`,
      filename,
      extractedText: transcriptText,
      extractedTextLength: transcriptText.length,
      summary: summaryData.summary || 'No summary returned.',
      tasks: Array.isArray(tasksData.tasks) ? tasksData.tasks : [],
      uploadedAt: new Date().toISOString(),
    });

    state.documents = [...state.documents, nextDocument];
    state.activeDocumentId = nextDocument.id;
    syncDerivedState();
    persistDocuments();
    state.selectedFile = null;
    state.recordedFromMicrophone = false;
    state.recordingNotice = 'Voice recording analyzed successfully.';
    state.page = 'dashboard';
  }

  function maybeNotifyUrgentDeadlines() {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    state.tasks.forEach((task) => {
      if (!task.deadline || task.completed) {
        return;
      }

      const reminder = getReminderMeta(task.deadline);
      if (!reminder) {
        return;
      }

      const key = `${task.task}|${task.deadline}`;
      if (notifiedDeadlines.has(key)) {
        return;
      }

      notifiedDeadlines.add(key);
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification('Deadline Reminder', {
            body: `${task.task} - ${reminder.label} (${task.deadline})`,
            tag: key,
            renotify: false,
          });
        });
      } else {
        new Notification('Deadline Reminder', {
          body: `${task.task} - ${reminder.label} (${task.deadline})`,
        });
      }
    });
  }

  async function startMicrophoneRecording() {
    state.recordingError = '';
    state.recordingNotice = '';
    state.cameraError = '';
    state.cameraNotice = '';
    resetRecordedAudioDraft();
    state.recordingModalOpen = true;

    if (!browserSupportsRecording()) {
      state.recordingError = 'This browser does not support microphone recording.';
      render();
      return;
    }

    try {
      if (state.cameraActive) {
        cleanupCameraResources();
      }
      state.capturedFromCamera = false;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getPreferredRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      state.mediaStream = stream;
      state.mediaRecorder = recorder;
      state.recordedChunks = [];
      state.recordingStartedAt = Date.now();
      state.recordingDurationSeconds = 0;
      state.isRecording = true;
      state.discardRecordingOnStop = false;
      state.recordedFromMicrophone = false;
      state.selectedFile = null;
      state.uploadError = '';
      state.liveTranscript = '';
      state.finalTranscript = '';
      cleanupSpeechRecognition();
      startSpeechRecognition();

      recorder.addEventListener('dataavailable', function (event) {
        if (event.data && event.data.size > 0) {
          state.recordedChunks.push(event.data);
        }
      });

      recorder.addEventListener('stop', async function () {
        if (state.discardRecordingOnStop) {
          state.discardRecordingOnStop = false;
          resetRecordedAudioDraft();
          cleanupRecordingResources();
          render();
          cleanupSpeechRecognition();
          return;
        }

        const recordingMimeType = recorder.mimeType || mimeType || 'audio/webm';
        const extension = getRecordingExtension(recordingMimeType);
        const blob = new Blob(state.recordedChunks, { type: recordingMimeType });
        const filename = `voice-note-${Date.now()}.${extension}`;

        if (blob.size > 0) {
          const generatedFile = new File([blob], filename, {
            type: recordingMimeType,
            lastModified: Date.now(),
          });
          state.pendingRecordedFile = generatedFile;
          revokeRecordedAudioPreview();
          state.recordedAudioPreviewUrl = URL.createObjectURL(blob);
          state.recordedFromMicrophone = true;
          state.recordingNotice = 'Recording captured. Review it and confirm to add it to the upload queue.';
        } else {
          state.recordingError = 'No audio was captured. Please try recording again.';
        }

        cleanupRecordingResources();
        render();
        cleanupSpeechRecognition();
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
      cleanupSpeechRecognition();
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

    if (state.speechRecognition) {
      try {
        state.speechRecognition.stop();
      } catch (error) {}
    }

    if (state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    } else {
      cleanupRecordingResources();
      render();
    }
  }

  async function startCameraCapture() {
    state.cameraError = '';
    state.cameraNotice = '';
    state.recordingError = '';
    resetCapturedImageDraft();
    state.cameraModalOpen = true;

    if (!browserSupportsCamera()) {
      state.cameraError = 'This browser does not support camera capture.';
      render();
      return;
    }

    try {
      if (state.isRecording && state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
        state.mediaRecorder.stop();
      }
      cleanupSpeechRecognition();
      cleanupRecordingResources();
      state.recordedFromMicrophone = false;
      state.recordingNotice = '';

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      cleanupCameraResources();
      state.cameraStream = stream;
      state.cameraActive = true;
      state.capturedFromCamera = false;
      state.selectedFile = null;
      state.uploadError = '';
      render();
      attachCameraPreview();
    } catch (error) {
      state.cameraError =
        error && error.name === 'NotAllowedError'
          ? 'Camera access was blocked. Please allow camera permission and try again.'
          : 'Could not start the camera.';
      render();
    }
  }

  function stopCameraCapture(options = {}) {
    const { preserveNotice = false } = options;
    cleanupCameraResources();
    if (!preserveNotice) {
      state.cameraNotice = '';
    }
    render();
  }

  async function captureCameraImage() {
    const video = root.querySelector('#cameraPreview');
    if (!video || !state.cameraStream) {
      state.cameraError = 'The camera is not ready yet. Please try again.';
      render();
      return;
    }

    const blob = (await takePhotoFromCameraTrack()) || (await capturePhotoFromPreview(video));
    if (!blob) {
      state.cameraError = 'Image capture failed. Please try again.';
      render();
      return;
    }

    const extension = blob.type && blob.type.includes('png') ? 'png' : 'jpg';
    const filename = `camera-capture-${Date.now()}.${extension}`;
    const generatedFile = new File([blob], filename, {
      type: blob.type || 'image/jpeg',
      lastModified: Date.now(),
    });
    state.pendingCapturedImageFile = generatedFile;
    revokeCapturedImagePreview();
    state.capturedImagePreviewUrl = URL.createObjectURL(blob);
    state.capturedFromCamera = true;
    state.cameraNotice = 'Image captured. Review it and confirm to add it to the upload queue.';
    state.cameraError = '';
    cleanupCameraResources();
    render();
  }

  function confirmRecordedAudio() {
    if (!state.pendingRecordedFile) {
      return;
    }

    mergePendingFiles([state.pendingRecordedFile], 'microphone');
    state.selectedFile = state.pendingRecordedFile;
    state.recordingModalOpen = false;
    state.uploadActionMenuOpen = false;
    state.recordingNotice = 'Recorded audio added to the upload queue.';
    resetRecordedAudioDraft();
    render();
  }

  function discardRecordedAudio() {
    resetRecordedAudioDraft();
    state.recordingError = '';
    state.recordingNotice = '';
    state.recordingModalOpen = false;
    cleanupSpeechRecognition();
    cleanupRecordingResources();
    render();
  }

  function confirmCapturedImage() {
    if (!state.pendingCapturedImageFile) {
      return;
    }

    mergePendingFiles([state.pendingCapturedImageFile], 'camera');
    state.selectedFile = state.pendingCapturedImageFile;
    state.cameraModalOpen = false;
    state.uploadActionMenuOpen = false;
    state.cameraNotice = 'Captured image added to the upload queue.';
    resetCapturedImageDraft();
    render();
  }

  function discardCapturedImage() {
    resetCapturedImageDraft();
    state.cameraError = '';
    state.cameraNotice = '';
    state.cameraModalOpen = false;
    cleanupCameraResources();
    render();
  }

  function closeUploadActionMenu() {
    state.uploadActionMenuOpen = false;
    render();
  }

  function closeRecordingModal() {
    state.recordingModalOpen = false;
    state.recordingError = '';
    state.recordingNotice = '';
    cleanupSpeechRecognition();
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.discardRecordingOnStop = true;
      stopMicrophoneRecording();
      return;
    }
    cleanupRecordingResources();
    resetRecordedAudioDraft();
    render();
  }

  function closeCameraModal() {
    state.cameraModalOpen = false;
    state.cameraError = '';
    state.cameraNotice = '';
    cleanupCameraResources();
    resetCapturedImageDraft();
    render();
  }

  state.authToken = getStoredAuthToken();

  function renderNavbar() {
    const currentTitle =
      state.feature === 'summarisation'
        ? 'Summaries'
        : state.feature === 'taskExtraction'
        ? 'Tasks'
        : state.feature === 'deadline'
        ? 'Deadlines'
        : 'Calendar';

    return `
      <header style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;padding:24px 0 30px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="width:42px;height:42px;border-radius:14px;background:linear-gradient(135deg,#00d1ff 0%,#2a7bff 100%);display:flex;align-items:center;justify-content:center;font-weight:800;color:#07111f;">H</div>
          <div>
            <div style="font-size:1.35rem;font-weight:800;letter-spacing:-.03em;color:#fff;">HACKGANGSTERS</div>
            <div style="font-size:.88rem;color:rgba(228,236,247,.6);">Document workspace for ${escapeHtml(
              state.currentUser ? state.currentUser.name : 'user'
            )}</div>
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
            ['calendar', 'Calendar'],
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
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
            <div style="padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);font-size:.82rem;color:rgba(228,236,247,.78);">
              ${escapeHtml(state.currentUser ? state.currentUser.email : '')}
            </div>
            <button id="logoutBtn" style="cursor:pointer;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;border-radius:999px;padding:8px 12px;font-size:.82rem;font-weight:700;">
              Logout
            </button>
            <button id="enableNotificationsBtn" style="cursor:pointer;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;border-radius:999px;padding:8px 12px;font-size:.82rem;font-weight:700;">
              ${getNotificationButtonLabel()}
            </button>
            ${
              isMobileDevice()
                ? `<div style="padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);font-size:.82rem;color:rgba(228,236,247,.72);">Install on mobile for better alerts</div>`
                : ''
            }
            <div style="padding:8px 12px;border-radius:999px;background:rgba(143,216,255,.1);border:1px solid rgba(143,216,255,.18);font-size:.82rem;color:#c8e7ff;">
              Focus: ${currentTitle}
            </div>
          </div>
        </div>
      </header>
    `;
  }

  function renderAuthScreen() {
    return `
      <main style="min-height:100vh;display:grid;place-items:center;padding:28px 0;">
        <section style="${glassCard('width:min(520px, calc(100% - 28px));padding:32px;background:linear-gradient(180deg, rgba(9,18,32,.7), rgba(255,255,255,.05));')}">
          <div style="display:inline-flex;padding:8px 12px;border-radius:999px;background:rgba(143,216,255,.1);border:1px solid rgba(143,216,255,.18);font-size:.76rem;letter-spacing:.14em;text-transform:uppercase;color:#cae9ff;">
            Secure Workspace Access
          </div>
          <h1 style="margin:18px 0 12px;font-size:2.4rem;letter-spacing:-.04em;">${state.authMode === 'login' ? 'Login first' : 'Create your account'}</h1>
          <p style="margin:0 0 22px;line-height:1.8;color:rgba(228,236,247,.74);">
            Uploads, summaries, tasks, deadlines, and calendar entries are private to each logged-in user.
          </p>
          <div style="display:flex;gap:10px;margin-bottom:18px;">
            ${['login', 'register']
              .map(
                (mode) => `
              <button data-auth-mode="${mode}" style="cursor:pointer;border:1px solid rgba(255,255,255,.14);background:${
                  state.authMode === mode
                    ? 'linear-gradient(135deg, rgba(0,209,255,.85), rgba(17,94,255,.82))'
                    : 'rgba(255,255,255,.06)'
                };color:#fff;border-radius:12px;padding:11px 14px;font-weight:700;flex:1;">
                ${mode === 'login' ? 'Login' : 'Register'}
              </button>`
              )
              .join('')}
          </div>
          <form id="authForm" style="display:grid;gap:14px;">
            ${
              state.authMode === 'register'
                ? `<input id="authName" type="text" placeholder="Full name" required style="padding:14px 16px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#fff;" />`
                : ''
            }
            <input id="authEmail" type="email" placeholder="Email address" required style="padding:14px 16px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#fff;" />
            <input id="authPassword" type="password" placeholder="Password" required style="padding:14px 16px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#fff;" />
            ${
              state.authError
                ? `<div style="padding:14px 16px;border-radius:14px;background:rgba(255,90,90,.12);border:1px solid rgba(255,90,90,.25);color:#ffd9d9;">${escapeHtml(
                    state.authError
                  )}</div>`
                : ''
            }
            <button type="submit" style="border:none;cursor:pointer;padding:14px 18px;border-radius:14px;font-weight:700;color:#fff;background:linear-gradient(135deg,#00d1ff 0%,#2a7bff 100%);">
              ${state.authMode === 'login' ? 'Login to continue' : 'Create account'}
            </button>
          </form>
          <div style="display:grid;justify-items:center;gap:12px;margin-top:18px;">
            <div style="font-size:.84rem;color:rgba(228,236,247,.62);">or continue with</div>
            ${
              state.googleClientId
                ? '<div id="googleSignInButton" style="min-height:44px;"></div>'
                : '<div style="font-size:.82rem;color:rgba(228,236,247,.54);">Google sign-in becomes available after GOOGLE_CLIENT_ID is configured.</div>'
            }
          </div>
        </section>
      </main>
    `;
  }

  function renderHome() {
    const active = featureContent[state.feature];

    return `
      <main>
        <section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px;">
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
                ['calendar', 'Calendar'],
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

        <section style="margin-top:24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;">
          ${[
            ['Long PDF Ready', 'The backend processes extraction and summarisation server-side for larger files.'],
            ['Single Flow', 'One upload returns extracted text preview, summary, and tasks together.'],
            ['Frontend + Backend', 'Served directly by FastAPI so the website and API stay in sync.'],
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
      <main style="display:grid;gap:24px;">
        <section style="${glassCard('padding:28px;')}">
          <div style="display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:16px;">
            <div>
              <div style="font-size:.8rem;letter-spacing:.14em;text-transform:uppercase;color:#8fd8ff;">Workspace</div>
              <h1 style="margin:8px 0 0;font-size:2.1rem;letter-spacing:-.03em;">Document Dashboard</h1>
            </div>
            <p style="margin:0;max-width:460px;line-height:1.75;color:rgba(228,236,247,.72);">
              Upload a document to get extracted text, a generated summary, and tasks with predicted deadlines.
            </p>
          </div>
        </section>

        ${renderDashboardStats()}

        <section style="${glassCard('padding:16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;')}">
          ${[
            ['summary', 'Summaries'],
            ['tasks', 'Tasks'],
            ['deadlines', 'Deadlines'],
            ['calendar', 'Calendar'],
          ]
            .map(
              ([id, label]) => `
            <button data-dashboard-tab="${id}" style="cursor:pointer;border:1px solid rgba(255,255,255,.14);background:${
                state.dashboardTab === id
                  ? 'linear-gradient(135deg, rgba(0,209,255,.85), rgba(17,94,255,.82))'
                  : 'rgba(255,255,255,.06)'
              };color:#fff;border-radius:14px;padding:12px 18px;font-weight:700;">${label}</button>`
            )
            .join('')}
        </section>

        <section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px;">
          ${renderUpload()}
          ${state.dashboardTab === 'summary' ? renderSummary() : ''}
        </section>

        ${state.dashboardTab === 'summary' ? renderHistorySection() : ''}

        ${state.dashboardTab === 'tasks' ? renderTasksSection() : ''}
        ${state.dashboardTab === 'deadlines' ? renderDeadlinesSection() : ''}
        ${state.dashboardTab === 'calendar' ? renderCalendarSection() : ''}
      </main>
    `;
  }

  function renderDashboardStats() {
    const totalUploads = state.documents.length;
    const totalTasks = state.tasks.length;
    const completedTasks = state.tasks.filter((task) => task.completed).length;
    const pendingDeadlines = state.tasks.filter((task) => task.deadline && !task.completed).length;
    const summariesWithText = state.documents
      .map((document) => String(document.summary || '').trim())
      .filter(Boolean);
    const averageSummaryLength = summariesWithText.length
      ? Math.round(
          summariesWithText.reduce((total, summary) => total + summary.length, 0) / summariesWithText.length
        )
      : 0;
    const stats = [
      ['Total uploads', totalUploads, 'UP'],
      ['Total tasks extracted', totalTasks, 'TS'],
      ['Completed tasks', completedTasks, 'OK'],
      ['Pending deadlines', pendingDeadlines, 'DL'],
      ['Average summary length', averageSummaryLength, 'AZ'],
    ];

    return `
      <section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:16px;">
        ${stats
          .map(
            ([label, value, icon]) => `
              <div style="${glassCard('padding:16px;background:rgba(255,255,255,.06);')}display:flex;align-items:center;gap:16px;min-height:92px;">
                <div style="width:42px;height:42px;border-radius:14px;background:linear-gradient(135deg, rgba(0,209,255,.18), rgba(42,123,255,.18));border:1px solid rgba(143,216,255,.18);display:flex;align-items:center;justify-content:center;color:#8fd8ff;font-weight:800;font-size:.8rem;flex:0 0 auto;">${icon}</div>
                <div style="min-width:0;">
                  <div style="font-size:.78rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(228,236,247,.58);line-height:1.5;">${label}</div>
                  <div style="margin-top:6px;font-size:1.65rem;font-weight:800;letter-spacing:-.03em;color:#fff;">${value}</div>
                  ${
                    label === 'Average summary length'
                      ? `<div style="margin-top:2px;font-size:.78rem;color:rgba(228,236,247,.5);">characters</div>`
                      : ''
                  }
                </div>
              </div>
            `
          )
          .join('')}
      </section>
    `;
  }

  function renderUpload() {
    const pendingCardsMarkup = state.pendingFiles.length
      ? state.pendingFiles
          .map((entry) => {
            const accent = getFileTypeAccent(entry.file);
            const progressWidth = `${Math.max(0, Math.min(100, entry.progress || 0))}%`;
            const statusLabel =
              entry.status === 'uploading'
                ? 'Processing'
                : entry.status === 'done'
                ? 'Completed'
                : entry.status === 'error'
                ? 'Failed'
                : 'Ready';

            return `
              <div style="padding:16px;border-radius:18px;background:rgba(5,12,24,.32);border:1px solid rgba(255,255,255,.08);display:grid;gap:12px;">
                <div style="display:flex;flex-wrap:wrap;align-items:start;justify-content:space-between;gap:12px;">
                  <div style="display:flex;gap:12px;min-width:0;">
                    <div style="width:42px;height:42px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);display:grid;place-items:center;color:${accent};font-size:.82rem;font-weight:800;flex:0 0 auto;">${escapeHtml(
                      getFileTypeLabel(entry.file)
                    )}</div>
                    <div style="min-width:0;">
                      <div style="font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;">${escapeHtml(
                        entry.file.name
                      )}</div>
                      <div style="margin-top:6px;font-size:.82rem;color:rgba(228,236,247,.62);display:flex;flex-wrap:wrap;gap:10px;">
                        <span>${escapeHtml(getFileTypeLabel(entry.file))}</span>
                        <span>${escapeHtml(formatFileSize(entry.file.size))}</span>
                        <span>${new Date(entry.addedAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>
                  <div style="display:inline-flex;align-items:center;justify-content:center;padding:7px 10px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);font-size:.78rem;color:#fff;">${statusLabel}</div>
                </div>
                <div style="display:grid;gap:8px;">
                  <div style="height:8px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden;border:1px solid rgba(255,255,255,.06);">
                    <div style="width:${progressWidth};height:100%;background:linear-gradient(135deg,#00d1ff 0%,#2a7bff 100%);transition:width .2s ease;"></div>
                  </div>
                  <div style="display:flex;justify-content:space-between;gap:12px;font-size:.8rem;color:rgba(228,236,247,.62);">
                    <span>${entry.source === 'camera' ? 'Captured from camera' : entry.source === 'microphone' ? 'Recorded from microphone' : 'Selected from device'}</span>
                    <span>${entry.progress || 0}%</span>
                  </div>
                  ${entry.error ? `<div style="font-size:.82rem;color:#ffd9d9;">${escapeHtml(entry.error)}</div>` : ''}
                </div>
              </div>
            `;
          })
          .join('')
      : `<div style="padding:18px;border-radius:16px;background:rgba(5,12,24,.24);border:1px dashed rgba(255,255,255,.1);line-height:1.7;color:rgba(228,236,247,.6);">No files in the queue yet. Drop files here, browse, use the camera, or record audio.</div>`;

    return `
      <section style="${glassCard('padding:24px;')}">
        <div style="margin-bottom:18px;">
          <h2 style="margin:0 0 8px;font-size:1.45rem;">Upload Area</h2>
          <p style="margin:0;line-height:1.72;color:rgba(228,236,247,.72);">
            Upload a PDF, DOCX, TXT, image, or audio file. The backend will extract or transcribe text, generate a summary, and return tasks.
          </p>
        </div>

        <input id="fileInput" type="file" multiple accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.bmp,.gif,.tiff,.tif,.webp,.mp3,.wav,.m4a,.ogg,.webm,.mpeg,image/*,audio/*" style="display:none;" />
        <div id="uploadDropZone" style="padding:22px;border-radius:20px;background:${
          state.dragOverUpload ? 'rgba(0,209,255,.14)' : 'rgba(255,255,255,.05)'
        };border:1px dashed ${
          state.dragOverUpload ? 'rgba(143,216,255,.48)' : 'rgba(255,255,255,.12)'
        };box-shadow:${state.dragOverUpload ? '0 0 24px rgba(0,209,255,.12)' : 'none'};transition:background .18s ease,border-color .18s ease,box-shadow .18s ease;display:grid;gap:16px;">
          <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;">
            <div>
              <div style="font-size:1.02rem;font-weight:800;color:#fff;">Drop files here or browse to upload</div>
              <div style="margin-top:8px;line-height:1.7;color:rgba(228,236,247,.68);">Supports documents, images, and audio. You can upload multiple files together and review each one below.</div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;position:relative;">
              <button id="uploadActionsBtn" type="button" style="border:1px solid ${state.uploadActionMenuOpen ? 'rgba(143,216,255,.3)' : 'rgba(255,255,255,.12)'};cursor:pointer;padding:12px 16px;border-radius:14px;font-weight:700;color:#fff;background:${state.uploadActionMenuOpen ? 'rgba(143,216,255,.12)' : 'rgba(255,255,255,.06)'};min-width:150px;display:inline-flex;align-items:center;justify-content:center;gap:10px;transition:background .18s ease,border-color .18s ease,transform .18s ease;">Add file <span style="font-size:.9rem;opacity:.74;">${state.uploadActionMenuOpen ? '▲' : '▼'}</span></button>
              ${
                state.uploadActionMenuOpen
                  ? `
                    <div data-close-upload-menu="true" style="position:fixed;inset:0;z-index:90;"></div>
                    <div style="position:absolute;top:calc(100% + 10px);left:0;width:min(220px,78vw);padding:10px;border-radius:18px;background:rgba(11,18,31,.96);border:1px solid rgba(255,255,255,.1);box-shadow:0 24px 50px rgba(2,8,20,.34);display:grid;gap:6px;z-index:91;">
                      ${[
                        ['browse', 'Browse File', 'Choose one or many files from your device.'],
                        ['record', 'Record Audio', 'Open a clean recorder popup and confirm the result.'],
                        ['camera', 'Camera Capture', 'Capture a photo, preview it, and add it to the queue.'],
                      ]
                        .map(
                          ([action, title, description]) => `
                            <button data-upload-action="${action}" type="button" style="cursor:pointer;text-align:left;border:none;border-radius:14px;padding:12px 14px;background:rgba(255,255,255,.04);color:#fff;display:grid;gap:4px;transition:background .16s ease,transform .16s ease;">
                              <span style="font-weight:700;">${title}</span>
                              <span style="font-size:.78rem;line-height:1.55;color:rgba(228,236,247,.64);">${description}</span>
                            </button>
                          `
                        )
                        .join('')}
                    </div>
                  `
                  : ''
              }
              <button id="uploadBtn" type="button" style="border:none;cursor:pointer;padding:12px 18px;border-radius:14px;font-weight:700;color:#fff;background:linear-gradient(135deg,#00d1ff 0%,#2a7bff 100%);opacity:${
                state.loading ? '.72' : '1'
              };">${state.loading ? 'Analyzing...' : 'Process queue'}</button>
            </div>
          </div>
          <div style="display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));">
            ${pendingCardsMarkup}
          </div>
        </div>

        ${
          state.recordedFromMicrophone
            ? `<div style="margin-top:10px;font-size:.84rem;color:rgba(156,244,197,.9);">Selected source: microphone recording</div>`
            : ''
        }
        ${
          state.capturedFromCamera
            ? `<div style="margin-top:10px;font-size:.84rem;color:rgba(255,226,138,.95);">Selected source: live camera capture</div>`
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
          state.cameraError
            ? `<div style="margin-top:16px;padding:14px 16px;border-radius:14px;background:rgba(255,90,90,.12);border:1px solid rgba(255,90,90,.25);color:#ffd9d9;">${escapeHtml(
                state.cameraError
              )}</div>`
            : ''
        }
        ${
          state.uploadNotice
            ? `<div style="margin-top:16px;padding:14px 16px;border-radius:14px;background:rgba(126,224,129,.12);border:1px solid rgba(126,224,129,.25);color:#dcffe1;">${escapeHtml(
                state.uploadNotice
              )}</div>`
            : ''
        }
        ${
          state.recordingNotice
            ? `<div style="margin-top:16px;padding:14px 16px;border-radius:14px;background:rgba(126,224,129,.12);border:1px solid rgba(126,224,129,.25);color:#dcffe1;">${escapeHtml(
                state.recordingNotice
              )}</div>`
            : ''
        }
        ${
          state.cameraNotice
            ? `<div style="margin-top:16px;padding:14px 16px;border-radius:14px;background:rgba(255,226,138,.12);border:1px solid rgba(255,226,138,.25);color:#fff0be;">${escapeHtml(
                state.cameraNotice
              )}</div>`
            : ''
        }
        ${
          state.loading
            ? `<div style="margin-top:16px;padding:14px 16px;border-radius:14px;background:rgba(0,209,255,.12);border:1px solid rgba(0,209,255,.22);color:#d8f6ff;">Analyzing your document. This can take a little time for larger files.</div>`
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

  function renderRecordingModal() {
    if (!state.recordingModalOpen) {
      return '';
    }

    const hasPreview = Boolean(state.pendingRecordedFile && state.recordedAudioPreviewUrl);

    return `
      <div data-recording-modal-backdrop="true" style="position:fixed;inset:0;background:rgba(3,8,18,.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:grid;place-items:center;padding:20px;z-index:1210;">
        <div style="width:min(440px,100%);${glassCard('padding:22px;background:rgba(14,22,39,.96);border:1px solid rgba(255,255,255,.12);')}">
          <div style="display:flex;align-items:start;justify-content:space-between;gap:14px;margin-bottom:18px;">
            <div>
              <h2 style="margin:0;font-size:1.3rem;">Record Audio</h2>
              <div style="margin-top:8px;color:rgba(228,236,247,.66);line-height:1.65;">Capture a voice note, preview it, and confirm before adding it to the upload queue.</div>
            </div>
            <button data-close-recording-modal="true" type="button" style="cursor:pointer;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;border-radius:12px;padding:9px 12px;font-weight:700;">Close</button>
          </div>

          ${
            hasPreview
              ? `
                <div style="display:grid;gap:16px;">
                  <div style="padding:16px;border-radius:18px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);">
                    <div style="font-size:.84rem;color:rgba(228,236,247,.58);">Preview ready</div>
                    <div style="margin-top:8px;font-weight:700;color:#fff;">${escapeHtml(state.pendingRecordedFile.name)}</div>
                    <div style="margin-top:6px;font-size:.82rem;color:rgba(228,236,247,.58);">${escapeHtml(formatFileSize(state.pendingRecordedFile.size))}</div>
                    <audio controls src="${state.recordedAudioPreviewUrl}" style="width:100%;margin-top:14px;"></audio>
                  </div>
                  <div style="display:flex;justify-content:flex-end;gap:12px;">
                    <button data-discard-recording="true" type="button" style="width:46px;height:46px;border:none;border-radius:14px;cursor:pointer;background:rgba(255,107,107,.14);color:#ffd7d7;font-size:1.15rem;font-weight:800;">✕</button>
                    <button data-confirm-recording="true" type="button" style="width:46px;height:46px;border:none;border-radius:14px;cursor:pointer;background:linear-gradient(135deg,#7ee081 0%,#4eb874 100%);color:#07111f;font-size:1.15rem;font-weight:900;">✓</button>
                  </div>
                </div>
              `
              : `
                <div style="display:grid;gap:16px;">
                  <div style="padding:18px;border-radius:18px;background:radial-gradient(circle at top, rgba(0,209,255,.12), transparent 58%), rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);display:grid;justify-items:center;text-align:center;gap:10px;">
                    <div style="width:74px;height:74px;border-radius:999px;background:${state.isRecording ? 'radial-gradient(circle, rgba(255,95,95,.95) 0%, rgba(255,95,95,.22) 62%, rgba(255,95,95,0) 100%)' : 'radial-gradient(circle, rgba(0,209,255,.9) 0%, rgba(0,209,255,.14) 62%, rgba(0,209,255,0) 100%)'};display:grid;place-items:center;box-shadow:${state.isRecording ? '0 0 28px rgba(255,95,95,.2)' : '0 0 26px rgba(0,209,255,.14)'};">
                      <div style="width:22px;height:22px;border-radius:${state.isRecording ? '8px' : '999px'};background:#fff;"></div>
                    </div>
                    <div style="font-size:.82rem;letter-spacing:.12em;text-transform:uppercase;color:${state.isRecording ? '#ffbaba' : '#8fd8ff'};">${state.isRecording ? 'Recording live' : 'Ready to record'}</div>
                    <div id="recordingTimer" style="font-size:2rem;font-weight:800;letter-spacing:.04em;color:#fff;">${formatRecordingDuration(
                      state.recordingDurationSeconds
                    )}</div>
                    <div style="max-width:300px;line-height:1.68;color:rgba(228,236,247,.66);">${state.isRecording ? 'Speak clearly and stop when you are ready to preview the captured audio.' : 'Start a recording from this popup, then confirm it with the tick button after previewing.'}</div>
                  </div>
                  <div style="display:flex;justify-content:center;gap:12px;">
                    <button data-recording-control="${state.isRecording ? 'stop' : 'start'}" type="button" style="cursor:pointer;border:none;border-radius:14px;padding:12px 18px;font-weight:800;color:#fff;background:${state.isRecording ? 'linear-gradient(135deg,#ff7a7a 0%,#ff5757 100%)' : 'linear-gradient(135deg,#00d1ff 0%,#2a7bff 100%)'};min-width:160px;">
                      ${state.isRecording ? 'Stop recording' : 'Start recording'}
                    </button>
                  </div>
                </div>
              `
          }

          ${
            state.recordingError
              ? `<div style="margin-top:16px;padding:13px 14px;border-radius:14px;background:rgba(255,90,90,.12);border:1px solid rgba(255,90,90,.22);color:#ffd9d9;">${escapeHtml(
                  state.recordingError
                )}</div>`
              : ''
          }
        </div>
      </div>
    `;
  }

  function renderCameraModal() {
    if (!state.cameraModalOpen) {
      return '';
    }

    const hasPreview = Boolean(state.pendingCapturedImageFile && state.capturedImagePreviewUrl);

    return `
      <div data-camera-modal-backdrop="true" style="position:fixed;inset:0;background:rgba(3,8,18,.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:grid;place-items:center;padding:20px;z-index:1210;">
        <div style="width:min(520px,100%);${glassCard('padding:22px;background:rgba(14,22,39,.96);border:1px solid rgba(255,255,255,.12);')}">
          <div style="display:flex;align-items:start;justify-content:space-between;gap:14px;margin-bottom:18px;">
            <div>
              <h2 style="margin:0;font-size:1.3rem;">Camera Capture</h2>
              <div style="margin-top:8px;color:rgba(228,236,247,.66);line-height:1.65;">Capture a clean photo, preview it, and confirm before it joins the upload queue.</div>
            </div>
            <button data-close-camera-modal="true" type="button" style="cursor:pointer;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;border-radius:12px;padding:9px 12px;font-weight:700;">Close</button>
          </div>

          ${
            hasPreview
              ? `
                <div style="display:grid;gap:16px;">
                  <div style="padding:14px;border-radius:20px;background:rgba(4,10,22,.5);border:1px solid rgba(255,255,255,.08);display:grid;gap:12px;">
                    <img src="${state.capturedImagePreviewUrl}" alt="Captured preview" style="width:100%;aspect-ratio:4 / 3;object-fit:cover;border-radius:16px;background:#08101d;" />
                    <div>
                      <div style="font-weight:700;color:#fff;">${escapeHtml(state.pendingCapturedImageFile.name)}</div>
                      <div style="margin-top:6px;font-size:.82rem;color:rgba(228,236,247,.58);">${escapeHtml(
                        formatFileSize(state.pendingCapturedImageFile.size)
                      )}</div>
                    </div>
                  </div>
                  <div style="display:flex;justify-content:flex-end;gap:12px;">
                    <button data-discard-camera-capture="true" type="button" style="width:46px;height:46px;border:none;border-radius:14px;cursor:pointer;background:rgba(255,107,107,.14);color:#ffd7d7;font-size:1.15rem;font-weight:800;">✕</button>
                    <button data-confirm-camera-capture="true" type="button" style="width:46px;height:46px;border:none;border-radius:14px;cursor:pointer;background:linear-gradient(135deg,#7ee081 0%,#4eb874 100%);color:#07111f;font-size:1.15rem;font-weight:900;">✓</button>
                  </div>
                </div>
              `
              : `
                <div style="display:grid;gap:16px;">
                  <div style="padding:14px;border-radius:20px;background:rgba(4,10,22,.5);border:1px solid rgba(255,255,255,.08);">
                    <div style="position:relative;overflow:hidden;border-radius:16px;background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03));aspect-ratio:4 / 3;border:1px solid rgba(255,255,255,.06);display:grid;place-items:center;">
                      ${
                        state.cameraActive
                          ? `
                            <video id="cameraPreview" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;"></video>
                            <div style="position:absolute;inset:12px;border:1px solid rgba(255,255,255,.16);border-radius:14px;box-shadow:inset 0 0 0 1px rgba(143,216,255,.08);pointer-events:none;"></div>
                          `
                          : `
                            <div style="padding:22px;text-align:center;">
                              <div style="font-size:.82rem;letter-spacing:.12em;text-transform:uppercase;color:#8fd8ff;">Camera ready</div>
                              <div style="margin-top:10px;line-height:1.72;color:rgba(228,236,247,.66);">Open the camera from this popup, frame the document, then capture a still image for review.</div>
                            </div>
                          `
                      }
                    </div>
                  </div>
                  <div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap;">
                    ${
                      state.cameraActive
                        ? `
                          <button data-camera-control="capture" type="button" style="cursor:pointer;border:none;border-radius:14px;padding:12px 18px;font-weight:800;color:#07111f;background:linear-gradient(135deg,#ffd47a 0%,#ffbd45 100%);min-width:160px;">Capture image</button>
                        `
                        : `
                          <button data-camera-control="start" type="button" style="cursor:pointer;border:none;border-radius:14px;padding:12px 18px;font-weight:800;color:#fff;background:linear-gradient(135deg,#00d1ff 0%,#2a7bff 100%);min-width:160px;">Open camera</button>
                        `
                    }
                  </div>
                </div>
              `
          }

          ${
            state.cameraError
              ? `<div style="margin-top:16px;padding:13px 14px;border-radius:14px;background:rgba(255,90,90,.12);border:1px solid rgba(255,90,90,.22);color:#ffd9d9;">${escapeHtml(
                  state.cameraError
                )}</div>`
              : ''
          }
        </div>
      </div>
    `;
  }

  function renderSummary() {
    const activeDocument = state.activeDocumentId
      ? state.documents.find((document) => document.id === state.activeDocumentId) || null
      : null;
    const compareDocument =
      state.compareSummaryDocumentId && state.compareSummaryDocumentId !== state.activeDocumentId
        ? state.documents.find((document) => document.id === state.compareSummaryDocumentId) || null
        : null;
    const summaryMarkup = activeDocument
      ? renderStructuredSummaryDocument(activeDocument)
      : `<div style="min-height:220px;padding:18px;border-radius:16px;background:rgba(5,12,24,.28);border:1px solid rgba(255,255,255,.08);line-height:1.8;color:rgba(234,240,248,.82);">
          Select an item from recent uploads to view its summary here.
        </div>`;
    const compareOptions = state.documents
      .filter((document) => !activeDocument || document.id !== activeDocument.id)
      .map(
        (document) =>
          `<option value="${escapeHtml(document.id)}" ${state.compareSummaryDocumentId === document.id ? 'selected' : ''}>${escapeHtml(
            document.filename
          )}</option>`
      )
      .join('');
    const comparisonMarkup =
      activeDocument && compareDocument
        ? `
          <div style="margin-top:14px;padding:16px;border-radius:18px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);">
            <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;">
              <div>
                <div style="font-size:.82rem;letter-spacing:.1em;text-transform:uppercase;color:#8fd8ff;font-weight:800;">Summary Compare</div>
                <div style="margin-top:6px;color:rgba(228,236,247,.66);line-height:1.7;">Side-by-side view of the selected upload and comparison file.</div>
              </div>
              <button data-clear-summary-compare="true" style="cursor:pointer;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;border-radius:12px;padding:10px 12px;font-weight:700;">Clear compare</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;">
              ${renderStructuredSummaryDocument(activeDocument, { compact: true })}
              ${renderStructuredSummaryDocument(compareDocument, { compact: true })}
            </div>
          </div>
        `
        : '';

    return `
      <section style="${glassCard('padding:24px;')}">
        <div style="display:flex;flex-wrap:wrap;align-items:start;justify-content:space-between;gap:14px;margin-bottom:16px;">
          <div>
            <h2 style="margin:0 0 10px;font-size:1.45rem;">Summary</h2>
            <div style="color:rgba(228,236,247,.66);line-height:1.7;">
              Structured summary view. History items can be reopened below without leaving this page.
            </div>
          </div>
          ${
            activeDocument
              ? `
                <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;">
                  <button data-copy-summary="true" style="cursor:pointer;border:1px solid rgba(143,216,255,.2);background:rgba(143,216,255,.08);color:#8fd8ff;border-radius:12px;padding:10px 12px;font-weight:700;">Copy Summary</button>
                  <button data-download-summary="txt" style="cursor:pointer;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;border-radius:12px;padding:10px 12px;font-weight:700;">Download TXT</button>
                  <button data-download-summary="pdf" style="cursor:pointer;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;border-radius:12px;padding:10px 12px;font-weight:700;">Download PDF</button>
                </div>
              `
              : ''
          }
        </div>
        ${
          activeDocument && state.documents.length > 1
            ? `
              <div style="margin-bottom:14px;display:grid;gap:8px;">
                <label for="summaryCompareSelect" style="font-size:.84rem;color:rgba(228,236,247,.72);">Compare with another upload</label>
                <select id="summaryCompareSelect" style="padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;">
                  <option value="">Select a file to compare</option>
                  ${compareOptions}
                </select>
              </div>
            `
            : ''
        }
        ${
          state.summaryNotice
            ? `<div style="margin-bottom:14px;padding:12px 14px;border-radius:14px;background:rgba(126,224,129,.12);border:1px solid rgba(126,224,129,.22);color:#dcffe1;">${escapeHtml(
                state.summaryNotice
              )}</div>`
            : ''
        }
        <div style="display:grid;gap:12px;">${summaryMarkup}</div>
        ${comparisonMarkup}
      </section>
    `;
  }

  function renderHistorySection() {
    const filteredDocuments = state.documents
      .slice()
      .sort((first, second) => Date.parse(second.uploadedAt || 0) - Date.parse(first.uploadedAt || 0))
      .filter((document) => {
        const matchesSearch = state.historySearch
          ? document.filename.toLowerCase().includes(state.historySearch.toLowerCase())
          : true;
        const matchesType =
          state.historyTypeFilter === 'all'
            ? true
            : getDocumentTypeLabel(document).toLowerCase() === state.historyTypeFilter;
        const matchesDate = state.historyDateFilter
          ? (document.uploadedAt || '').slice(0, 10) === state.historyDateFilter
          : true;
        return matchesSearch && matchesType && matchesDate;
      });

    const historyMarkup = filteredDocuments.length
      ? filteredDocuments
          .map(
            (document) => `
              <div style="padding:16px;border-radius:16px;background:rgba(5,12,24,.28);border:1px solid ${
                state.activeDocumentId === document.id ? 'rgba(143,216,255,.3)' : 'rgba(255,255,255,.08)'
              };display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;">
                <button data-history-open="${escapeHtml(document.id)}" style="cursor:pointer;flex:1;min-width:240px;text-align:left;border:none;background:transparent;color:#fff;padding:0;">
                  <div style="font-weight:700;color:#fff;">${escapeHtml(document.filename)}</div>
                  <div style="margin-top:6px;font-size:.84rem;color:rgba(228,236,247,.62);display:flex;flex-wrap:wrap;gap:10px;">
                    <span>${new Date(document.uploadedAt).toLocaleString()}</span>
                    <span>${escapeHtml(getDocumentTypeLabel(document))}</span>
                  </div>
                </button>
                <div style="display:flex;flex-wrap:wrap;gap:10px;">
                  <button data-history-open="${escapeHtml(document.id)}" style="cursor:pointer;border:1px solid rgba(143,216,255,.18);background:rgba(143,216,255,.08);color:#8fd8ff;border-radius:12px;padding:10px 12px;font-weight:700;">Open summary</button>
                  <button data-history-delete="${escapeHtml(document.id)}" style="cursor:pointer;border:1px solid rgba(255,110,110,.2);background:rgba(255,110,110,.1);color:#ffd3d3;border-radius:12px;padding:10px 12px;font-weight:700;">Delete</button>
                </div>
              </div>
            `
          )
          .join('')
      : `<div style="padding:18px;border-radius:16px;background:rgba(5,12,24,.28);border:1px solid rgba(255,255,255,.08);line-height:1.72;color:rgba(228,236,247,.72);">
          No history items match the current search or filters.
        </div>`;

    return `
      <section style="${glassCard('padding:24px;')}">
        <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;margin-bottom:16px;">
          <div>
            <h2 style="margin:0;font-size:1.45rem;">Recent Uploads</h2>
            <div style="margin-top:8px;color:rgba(228,236,247,.66);line-height:1.7;">Browse uploaded documents, reopen summaries, and manage history.</div>
          </div>
          <button data-history-clear="true" style="cursor:pointer;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;border-radius:12px;padding:10px 14px;font-weight:700;">Clear history</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px;">
          <input id="historySearchInput" type="text" value="${escapeHtml(state.historySearch)}" placeholder="Search by filename" style="padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;" />
          <select id="historyTypeFilter" style="padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;">
            <option value="all" ${state.historyTypeFilter === 'all' ? 'selected' : ''}>All types</option>
            <option value="pdf" ${state.historyTypeFilter === 'pdf' ? 'selected' : ''}>PDF</option>
            <option value="docx" ${state.historyTypeFilter === 'docx' ? 'selected' : ''}>DOCX</option>
            <option value="txt" ${state.historyTypeFilter === 'txt' ? 'selected' : ''}>TXT</option>
            <option value="image" ${state.historyTypeFilter === 'image' ? 'selected' : ''}>Image</option>
            <option value="audio" ${state.historyTypeFilter === 'audio' ? 'selected' : ''}>Audio</option>
          </select>
          <input id="historyDateFilter" type="date" value="${escapeHtml(state.historyDateFilter)}" style="padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;" />
        </div>
        <div style="display:grid;gap:12px;">${historyMarkup}</div>
      </section>
    `;
  }

  function renderTasksSection() {
    const sortedTasks = state.tasks.slice().sort(compareTasksByDeadline);
    const groupedTasks = sortedTasks.reduce((groups, task) => {
      const key = task.source_filename || 'Uploaded document';
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(task);
      return groups;
    }, {});

    const tasksMarkup = sortedTasks.length
      ? Object.entries(groupedTasks)
          .map(([sourceFilename, tasks]) => {
            const pendingCount = tasks.filter((task) => !task.completed).length;
            return `
              <div style="display:grid;gap:12px;padding:16px;border-radius:18px;background:rgba(5,12,24,.24);border:1px solid rgba(255,255,255,.08);">
                <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;">
                  <div>
                    <div style="font-weight:700;color:#fff;font-size:1rem;">${escapeHtml(sourceFilename)}</div>
                    <div style="margin-top:6px;font-size:.82rem;color:rgba(143,216,255,.7);">${tasks.length} task${tasks.length === 1 ? '' : 's'} • ${pendingCount} pending</div>
                  </div>
                  <div style="display:inline-flex;align-items:center;padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);font-size:.8rem;color:rgba(228,236,247,.78);">Sorted by earliest deadline</div>
                </div>
                <div style="display:grid;gap:12px;">
                  ${tasks
                    .map((task) => {
                      const priority = getPriorityMeta(task.priority);
                      const reminder = getReminderMeta(task.deadline);
                      const overdue = isTaskOverdue(task);

                      return `
                        <div style="display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:start;padding:16px 18px;border-radius:16px;background:${task.completed ? 'rgba(255,255,255,.035)' : overdue ? 'rgba(255,110,110,.08)' : 'rgba(255,255,255,.05)'};border:1px solid ${overdue ? 'rgba(255,110,110,.2)' : 'rgba(255,255,255,.08)'};opacity:${task.completed ? '.6' : '1'};">
                          <label style="padding-top:2px;cursor:pointer;">
                            <input type="checkbox" data-task-toggle="${escapeHtml(task.id)}" ${task.completed ? 'checked' : ''} style="width:18px;height:18px;accent-color:#7ee081;cursor:pointer;" />
                          </label>
                          <div style="min-width:0;">
                            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;">
                              <div style="font-weight:700;color:#fff;text-decoration:${task.completed ? 'line-through' : 'none'};word-break:break-word;">${escapeHtml(
                                task.task || 'Untitled task'
                              )}</div>
                              <div style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:${priority.bg};border:1px solid ${priority.border};font-size:.76rem;font-weight:700;color:${priority.tone};">${escapeHtml(
                                priority.label
                              )}</div>
                              ${overdue ? `<div style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:rgba(255,110,110,.14);border:1px solid rgba(255,110,110,.24);font-size:.76rem;font-weight:700;color:#ff9b9b;">Overdue</div>` : ''}
                            </div>
                            <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:10px;font-size:.84rem;color:rgba(228,236,247,.62);line-height:1.65;">
                              <span>${task.deadline_source === 'suggested' ? 'Suggested from audio' : 'Extracted from document'}</span>
                              <span>Deadline: ${escapeHtml(task.deadline || 'No deadline')}</span>
                              <span>Status: ${task.completed ? 'Completed' : 'Pending'}</span>
                            </div>
                            ${
                              reminder && !task.completed
                                ? `<div style="margin-top:10px;display:inline-flex;align-items:center;padding:7px 11px;border-radius:999px;background:${reminder.bg};border:1px solid rgba(255,255,255,.08);font-size:.8rem;font-weight:700;color:${reminder.tone};">${escapeHtml(
                                    reminder.label
                                  )}</div>`
                                : ''
                            }
                          </div>
                          <div style="display:flex;align-items:center;justify-content:flex-end;">
                            <button data-edit-task="${escapeHtml(task.id)}" style="cursor:pointer;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;border-radius:12px;padding:10px 12px;font-size:.82rem;font-weight:700;">Edit</button>
                          </div>
                        </div>
                      `;
                    })
                    .join('')}
                </div>
              </div>
            `;
          })
          .join('')
      : `<div style="padding:18px;border-radius:16px;background:rgba(5,12,24,.28);border:1px solid rgba(255,255,255,.08);line-height:1.72;color:rgba(228,236,247,.72);">
          Extracted tasks and deadlines will appear here after upload.
        </div>`;

    return `
      <section style="${glassCard('padding:24px;')}">
        <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;margin-bottom:16px;">
          <div>
            <h2 style="margin:0;font-size:1.45rem;">Tasks</h2>
            <div style="margin-top:8px;color:rgba(228,236,247,.66);line-height:1.7;">
              Grouped by source document, sorted by earliest deadline, with inline completion and editing.
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <label for="taskSortMode" style="font-size:.82rem;color:rgba(228,236,247,.62);">Sort</label>
            <select id="taskSortMode" style="padding:11px 14px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;">
              <option value="deadline" ${state.taskSortMode === 'deadline' ? 'selected' : ''}>Deadline: earliest first</option>
            </select>
          </div>
        </div>
        <div style="display:grid;gap:12px;">${tasksMarkup}</div>
      </section>
    `;
  }

  function renderTaskEditModal() {
    if (!state.taskEditModalOpen || !state.editingTaskId) {
      return '';
    }

    return `
      <div data-task-edit-backdrop="true" style="position:fixed;inset:0;background:rgba(3,8,18,.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:grid;place-items:center;padding:20px;z-index:1200;">
        <div style="width:min(460px,100%);${glassCard('padding:24px;background:rgba(14,22,39,.96);border:1px solid rgba(255,255,255,.12);')}">
          <div style="display:flex;flex-wrap:wrap;align-items:start;justify-content:space-between;gap:14px;margin-bottom:18px;">
            <div>
              <h2 style="margin:0;font-size:1.35rem;">Edit task</h2>
              <div style="margin-top:8px;color:rgba(228,236,247,.66);line-height:1.7;">Update the task name, deadline, and priority without leaving the dashboard.</div>
            </div>
            <button data-close-task-edit="true" style="cursor:pointer;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;border-radius:12px;padding:10px 12px;font-weight:700;">Close</button>
          </div>
          <div style="display:grid;gap:14px;">
            <div style="display:grid;gap:8px;">
              <label for="taskNameInput" style="font-size:.84rem;color:rgba(228,236,247,.72);">Task name</label>
              <input id="taskNameInput" data-task-draft="task" type="text" value="${escapeHtml(
                state.taskDraft.task
              )}" style="padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;" />
            </div>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">
              <div style="display:grid;gap:8px;">
                <label for="taskDeadlineInput" style="font-size:.84rem;color:rgba(228,236,247,.72);">Deadline</label>
                <input id="taskDeadlineInput" data-task-draft="deadline" type="text" value="${escapeHtml(
                  state.taskDraft.deadline
                )}" placeholder="YYYY-MM-DD or extracted text" style="padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;" />
              </div>
              <div style="display:grid;gap:8px;">
                <label for="taskPriorityInput" style="font-size:.84rem;color:rgba(228,236,247,.72);">Priority</label>
                <select id="taskPriorityInput" data-task-draft="priority" style="padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;">
                  ${['High', 'Medium', 'Low']
                    .map(
                      (option) =>
                        `<option value="${option}" ${state.taskDraft.priority === option ? 'selected' : ''}>${option}</option>`
                    )
                    .join('')}
                </select>
              </div>
            </div>
            <div style="padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);font-size:.84rem;color:rgba(228,236,247,.68);">
              Source document: ${escapeHtml(state.taskDraft.source_filename || 'Uploaded document')}
            </div>
            <div style="display:flex;justify-content:flex-end;gap:12px;">
              <button data-cancel-task-edit="true" style="cursor:pointer;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;border-radius:12px;padding:11px 14px;font-weight:700;">Cancel</button>
              <button data-save-task-edit="true" style="cursor:pointer;border:none;background:linear-gradient(135deg,#00d1ff 0%,#2a7bff 100%);color:#fff;border-radius:12px;padding:11px 16px;font-weight:700;">Save changes</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderDeadlinesSection() {
    const deadlineTasks = state.tasks
      .filter((task) => task.deadline && !task.completed)
      .slice()
      .sort((a, b) => {
        const first = Date.parse(a.deadline);
        const second = Date.parse(b.deadline);

        if (Number.isNaN(first) && Number.isNaN(second)) return 0;
        if (Number.isNaN(first)) return 1;
        if (Number.isNaN(second)) return -1;
        return first - second;
      });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const endOfWeek = new Date(endOfToday);
    endOfWeek.setDate(endOfToday.getDate() + (7 - endOfToday.getDay()));
    endOfWeek.setHours(23, 59, 59, 999);
    const dueSoonEnd = new Date(endOfToday);
    dueSoonEnd.setDate(endOfToday.getDate() + 3);
    dueSoonEnd.setHours(23, 59, 59, 999);

    const overdueTasks = deadlineTasks.filter((task) => isTaskOverdue(task));
    const dueSoonTasks = deadlineTasks.filter((task) => {
      const timestamp = Date.parse(task.deadline);
      if (Number.isNaN(timestamp) || isTaskOverdue(task)) {
        return false;
      }
      return timestamp <= dueSoonEnd.getTime();
    });

    const groupedDeadlineTasks = {
      Today: deadlineTasks.filter((task) => {
        const timestamp = Date.parse(task.deadline);
        return !Number.isNaN(timestamp) && timestamp >= startOfToday.getTime() && timestamp <= endOfToday.getTime();
      }),
      'This Week': deadlineTasks.filter((task) => {
        const timestamp = Date.parse(task.deadline);
        return !Number.isNaN(timestamp) && timestamp > endOfToday.getTime() && timestamp <= endOfWeek.getTime();
      }),
      Later: deadlineTasks.filter((task) => {
        const timestamp = Date.parse(task.deadline);
        return !Number.isNaN(timestamp) && timestamp > endOfWeek.getTime();
      }),
    };

    const timelineGroups = deadlineTasks.reduce((groups, task) => {
      const timestamp = Date.parse(task.deadline);
      const key = Number.isNaN(timestamp)
        ? 'No date'
        : new Date(timestamp).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(task);
      return groups;
    }, {});

    const summaryStrip = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px;">
        <div style="padding:14px 16px;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);">
          <div style="font-size:.78rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(228,236,247,.58);">Overdue</div>
          <div style="margin-top:8px;display:flex;align-items:center;gap:10px;">
            <div style="display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:34px;padding:0 12px;border-radius:999px;background:rgba(255,110,110,.14);border:1px solid rgba(255,110,110,.24);color:#ff9b9b;font-weight:800;">${overdueTasks.length}</div>
            <div style="font-size:.88rem;color:rgba(228,236,247,.72);">tasks need attention</div>
          </div>
        </div>
        <div style="padding:14px 16px;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);">
          <div style="font-size:.78rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(228,236,247,.58);">Due Soon</div>
          <div style="margin-top:8px;display:flex;align-items:center;gap:10px;">
            <div style="display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:34px;padding:0 12px;border-radius:999px;background:rgba(255,209,102,.14);border:1px solid rgba(255,209,102,.24);color:#ffd88e;font-weight:800;">${dueSoonTasks.length}</div>
            <div style="font-size:.88rem;color:rgba(228,236,247,.72);">within the next few days</div>
          </div>
        </div>
      </div>
    `;

    const dueSoonMarkup = dueSoonTasks.length
      ? dueSoonTasks
          .slice(0, 4)
          .map((task) => {
            const priority = getPriorityMeta(task.priority);
            return `
              <div style="padding:14px 16px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);display:grid;gap:8px;">
                <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;">
                  <div style="font-weight:700;color:#fff;">${escapeHtml(task.task || 'Untitled task')}</div>
                  <div style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:${priority.bg};border:1px solid ${priority.border};font-size:.76rem;font-weight:700;color:${priority.tone};">${escapeHtml(
                    priority.label
                  )}</div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:.84rem;color:rgba(228,236,247,.62);">
                  <span>${escapeHtml(task.deadline)}</span>
                  <span>${escapeHtml(task.source_filename || 'Uploaded document')}</span>
                </div>
              </div>
            `;
          })
          .join('')
      : `<div style="padding:16px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:rgba(228,236,247,.68);line-height:1.7;">No tasks are due soon.</div>`;

    const groupedMarkup = Object.entries(groupedDeadlineTasks)
      .map(([label, tasks]) => {
        const content = tasks.length
          ? tasks
              .slice(0, 4)
              .map(
                (task) => `
                  <div style="padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);display:grid;gap:6px;">
                    <div style="font-weight:700;color:#fff;">${escapeHtml(task.task || 'Untitled task')}</div>
                    <div style="font-size:.82rem;color:rgba(228,236,247,.6);">${escapeHtml(task.deadline || 'No deadline')}</div>
                  </div>
                `
              )
              .join('')
          : `<div style="padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);font-size:.84rem;color:rgba(228,236,247,.56);">No tasks</div>`;

        return `
          <div style="padding:16px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);display:grid;gap:12px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
              <div style="font-weight:700;color:#fff;">${label}</div>
              <div style="display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;padding:0 10px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);font-size:.78rem;color:#fff;">${tasks.length}</div>
            </div>
            <div style="display:grid;gap:10px;">${content}</div>
          </div>
        `;
      })
      .join('');

    const timelineMarkup = deadlineTasks.length
      ? Object.entries(timelineGroups)
          .map(
            ([dateLabel, tasks]) => `
              <div style="display:grid;grid-template-columns:110px minmax(0,1fr);gap:14px;align-items:start;">
                <div style="padding-top:2px;font-size:.84rem;font-weight:700;color:#8fd8ff;">${escapeHtml(dateLabel)}</div>
                <div style="display:grid;gap:10px;position:relative;">
                  ${tasks
                    .map((task) => {
                      const priority = getPriorityMeta(task.priority);
                      const overdue = isTaskOverdue(task);
                      return `
                        <div style="position:relative;padding:12px 14px 12px 18px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid ${overdue ? 'rgba(255,110,110,.2)' : 'rgba(255,255,255,.08)'};">
                          <div style="position:absolute;left:0;top:12px;bottom:12px;width:4px;border-radius:999px;background:${overdue ? '#ff6b6b' : '#39c6ff'};"></div>
                          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;">
                            <div style="font-weight:700;color:#fff;">${escapeHtml(task.task || 'Untitled task')}</div>
                            <div style="display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;background:${priority.bg};border:1px solid ${priority.border};font-size:.74rem;font-weight:700;color:${priority.tone};">${escapeHtml(
                              priority.label
                            )}</div>
                          </div>
                          <div style="margin-top:6px;font-size:.82rem;color:rgba(228,236,247,.62);">${escapeHtml(
                            task.source_filename || 'Uploaded document'
                          )}</div>
                        </div>
                      `;
                    })
                    .join('')}
                </div>
              </div>
            `
          )
          .join('')
      : `<div style="padding:16px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:rgba(228,236,247,.68);line-height:1.7;">No timeline items yet.</div>`;

    const deadlineMarkup = deadlineTasks.length
      ? deadlineTasks
          .map(
            (task) => {
              const reminder = getReminderMeta(task.deadline);
              return `
          <div style="display:grid;grid-template-columns:minmax(0,1fr) 130px 140px;gap:14px;align-items:center;padding:16px 18px;border-radius:16px;background:rgba(5,12,24,.3);border:1px solid rgba(255,255,255,.08);">
            <div>
              <div style="font-weight:700;color:#fff;">${escapeHtml(task.task || 'Untitled task')}</div>
              <div style="margin-top:6px;font-size:.88rem;color:rgba(228,236,247,.58);">${
                task.deadline_source === 'suggested'
                  ? 'Suggested deadline from audio task'
                  : 'Detected deadline task'
              }</div>
              <div style="margin-top:6px;font-size:.82rem;color:rgba(143,216,255,.7);">${escapeHtml(
                task.source_filename || 'Uploaded document'
              )}</div>
              ${
                reminder
                  ? `<div style="margin-top:10px;display:inline-flex;align-items:center;padding:7px 11px;border-radius:999px;background:${reminder.bg};border:1px solid rgba(255,255,255,.08);font-size:.8rem;font-weight:700;color:${reminder.tone};">${escapeHtml(
                      reminder.label
                    )}</div>`
                  : ''
              }
            </div>
            <div style="color:#8fd8ff;font-weight:700;">${escapeHtml(task.deadline)}</div>
            <div style="display:grid;gap:10px;justify-items:end;">
              <div style="display:inline-flex;justify-content:center;padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);font-size:.84rem;color:#fff;">${escapeHtml(
                task.priority || 'Detected'
              )}</div>
              <button data-complete-task="${escapeHtml(task.id)}" style="cursor:pointer;border:1px solid rgba(126,224,129,.3);background:rgba(126,224,129,.14);color:#9df3a0;border-radius:999px;padding:9px 12px;font-size:.82rem;font-weight:700;">
                Completed
              </button>
            </div>
          </div>`;
            }
          )
          .join('')
      : `<div style="padding:18px;border-radius:16px;background:rgba(5,12,24,.28);border:1px solid rgba(255,255,255,.08);line-height:1.72;color:rgba(228,236,247,.72);">
          No explicit deadlines were found in this document.
        </div>`;

    return `
      <section style="${glassCard('padding:24px;')}">
        <h2 style="margin:0 0 16px;font-size:1.45rem;">Deadlines</h2>
        <div style="margin:-4px 0 16px;color:rgba(228,236,247,.66);line-height:1.7;">
          Deadlines collected across every uploaded document. Tick a task to remove it from deadlines and calendar.
        </div>
        ${summaryStrip}
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-bottom:16px;">
          <div style="padding:18px;border-radius:18px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);display:grid;gap:12px;">
            <div>
              <div style="font-size:.82rem;letter-spacing:.1em;text-transform:uppercase;color:#8fd8ff;">Upcoming / Due Soon</div>
              <div style="margin-top:6px;color:rgba(228,236,247,.66);line-height:1.7;">Tasks coming up in the next few days.</div>
            </div>
            <div style="display:grid;gap:10px;">${dueSoonMarkup}</div>
          </div>
          <div style="padding:18px;border-radius:18px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);display:grid;gap:12px;">
            <div>
              <div style="font-size:.82rem;letter-spacing:.1em;text-transform:uppercase;color:#8fd8ff;">Timeline View</div>
              <div style="margin-top:6px;color:rgba(228,236,247,.66);line-height:1.7;">A compact date-first view of pending deadlines.</div>
            </div>
            <div style="display:grid;gap:12px;">${timelineMarkup}</div>
          </div>
        </div>
        <div style="margin-bottom:16px;padding:18px;border-radius:18px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);">
          <div style="font-size:.82rem;letter-spacing:.1em;text-transform:uppercase;color:#8fd8ff;">Grouped View</div>
          <div style="margin:6px 0 14px;color:rgba(228,236,247,.66);line-height:1.7;">Scan deadlines by time window: Today, This Week, and Later.</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;">${groupedMarkup}</div>
        </div>
        <div style="display:grid;gap:12px;">${deadlineMarkup}</div>
      </section>
    `;
  }

  function renderCalendarSection() {
    const year = state.calendarYear;
    const month = state.calendarMonth;
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = (firstDay.getDay() + 6) % 7;
    const cells = [];
    const deadlineMap = getCalendarDeadlineMap(year, month);
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (let index = 0; index < startOffset; index += 1) {
      cells.push('<div style="min-height:110px;border-radius:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.04);"></div>');
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dayTasks = deadlineMap.get(String(day)) || [];
      const countBadge = dayTasks.length
        ? `<div style="margin-top:10px;display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;padding:0 10px;border-radius:999px;background:rgba(0,209,255,.14);border:1px solid rgba(143,216,255,.26);color:#8fd8ff;font-size:.8rem;font-weight:800;">${dayTasks.length}</div>`
        : '';

      cells.push(`
        <button data-calendar-day="${day}" data-has-events="${dayTasks.length ? 'true' : 'false'}" data-hover-kind="calendar-day" style="cursor:pointer;min-height:110px;padding:10px;border-radius:16px;background:${dayTasks.length ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.04)'};border:1px solid ${dayTasks.length ? 'rgba(143,216,255,.18)' : 'rgba(255,255,255,.06)'};text-align:left;display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;color:#fff;position:relative;z-index:0;transform-origin:center center;transition:transform .18s cubic-bezier(.2,.8,.2,1), border-color .18s ease, background .18s ease, box-shadow .18s ease, filter .18s ease;">
          <div style="font-weight:700;color:#fff;">${day}</div>
          <div style="display:grid;gap:8px;">
            ${countBadge}
            <div style="font-size:.74rem;color:rgba(228,236,247,.58);">${dayTasks.length ? `${dayTasks.length} pending` : 'No events'}</div>
          </div>
        </button>
      `);
    }

    return `
      <section style="${glassCard('padding:24px;')}">
        <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;">
          <div>
            <h2 style="margin:0;font-size:1.45rem;">Calendar</h2>
            <div style="margin-top:6px;color:rgba(228,236,247,.66);line-height:1.7;">Deadline calendar for the selected month across all uploaded documents.</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <button data-calendar-nav="prev" data-hover-kind="calendar-control" style="cursor:pointer;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;border-radius:12px;padding:10px 12px;font-weight:700;transition:transform .16s ease, border-color .16s ease, background .16s ease;">Prev</button>
            <div style="min-width:170px;text-align:center;color:#fff;font-weight:700;">${formatMonthYear(year, month)}</div>
            <button data-calendar-nav="next" data-hover-kind="calendar-control" style="cursor:pointer;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;border-radius:12px;padding:10px 12px;font-weight:700;transition:transform .16s ease, border-color .16s ease, background .16s ease;">Next</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px;">
          ${dayNames
            .map(
              (name) => `<div style="padding:8px 6px;text-align:center;color:rgba(228,236,247,.62);font-size:.82rem;font-weight:700;">${name}</div>`
            )
            .join('')}
          ${cells.join('')}
        </div>
      </section>
    `;
  }

  function renderCalendarModal() {
    if (!state.selectedCalendarDay) {
      return '';
    }

    const { year, month, day } = state.selectedCalendarDay;
    const tasks = getCalendarDayDetails(year, month, day);
    const formattedDate = new Date(year, month, day).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    const contentMarkup = tasks.length
      ? tasks
          .map((task) => {
            const reminder = getReminderMeta(task.deadline);
            return `
              <div style="padding:16px 18px;border-radius:16px;background:rgba(5,12,24,.34);border:1px solid rgba(255,255,255,.08);display:grid;gap:10px;">
                <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;">
                  <div style="font-weight:700;color:#fff;">${escapeHtml(task.task || 'Untitled event')}</div>
                  <div style="display:inline-flex;justify-content:center;padding:7px 11px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);font-size:.8rem;color:#fff;">${escapeHtml(
                    task.priority || 'Medium'
                  )}</div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:10px;color:rgba(228,236,247,.72);font-size:.9rem;line-height:1.6;">
                  <div>Deadline: ${escapeHtml(task.deadline || 'No deadline')}</div>
                  <div>Status: ${task.completed ? 'Completed' : 'Pending'}</div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;">
                  <div style="font-size:.84rem;color:rgba(143,216,255,.72);">${escapeHtml(task.source_filename || 'Uploaded document')}</div>
                  ${
                    reminder
                      ? `<div style="display:inline-flex;align-items:center;padding:7px 11px;border-radius:999px;background:${reminder.bg};border:1px solid rgba(255,255,255,.08);font-size:.8rem;font-weight:700;color:${reminder.tone};">${escapeHtml(
                          reminder.label
                        )}</div>`
                      : ''
                  }
                </div>
              </div>
            `;
          })
          .join('')
      : `
          <div style="padding:18px;border-radius:16px;background:rgba(5,12,24,.28);border:1px solid rgba(255,255,255,.08);line-height:1.72;color:rgba(228,236,247,.72);">
            No events for this date
          </div>
        `;

    return `
      <div data-calendar-modal-backdrop="true" style="position:fixed;inset:0;background:rgba(3,8,18,.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:grid;place-items:center;padding:20px;z-index:1200;">
        <div style="width:min(680px,100%);max-height:min(80vh,760px);overflow:auto;${glassCard('padding:24px;background:rgba(14,22,39,.94);border:1px solid rgba(255,255,255,.12);')}">
          <div style="display:flex;flex-wrap:wrap;align-items:start;justify-content:space-between;gap:14px;margin-bottom:18px;">
            <div>
              <h2 style="margin:0;font-size:1.45rem;">Events for ${escapeHtml(formattedDate)}</h2>
              <div style="margin-top:8px;color:rgba(228,236,247,.66);line-height:1.7;">Pending actions and deadlines scheduled for this date.</div>
            </div>
            <button data-close-calendar-modal="true" data-hover-kind="calendar-control" style="cursor:pointer;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;border-radius:12px;padding:10px 14px;font-weight:700;transition:transform .16s ease, border-color .16s ease, background .16s ease;">Close</button>
          </div>
          <div style="display:grid;gap:12px;">${contentMarkup}</div>
        </div>
      </div>
    `;
  }

  function render() {
    const bodyMarkup = state.authLoading
      ? `
        <main style="min-height:100vh;display:grid;place-items:center;">
          <div style="padding:18px 22px;border-radius:16px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);color:#fff;display:flex;align-items:center;gap:12px;">
            <span class="ui-spinner" aria-hidden="true"></span>
            Restoring your workspace...
          </div>
        </main>
      `
      : !state.currentUser
      ? renderAuthScreen()
      : `
        <div class="app-view" style="width:min(1160px, calc(100% - 28px));margin:0 auto;padding-bottom:42px;">
          ${renderNavbar()}
          ${state.page === 'home' ? renderHome() : renderDashboard()}
        </div>
      `;

    root.innerHTML = `
      <div style="min-height:100vh;position:relative;overflow:hidden;background:radial-gradient(circle at 12% 8%, rgba(0,209,255,.2), transparent 26%), radial-gradient(circle at 88% 10%, rgba(255,116,64,.16), transparent 28%), radial-gradient(circle at 50% 100%, rgba(143,216,255,.08), transparent 30%), linear-gradient(135deg,#07111f 0%,#0d1729 52%,#131f34 100%);color:#f4f7fb;font-family:'Segoe UI',Tahoma,sans-serif;">
        <style>
          #root > div::before {
            content: "";
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: 0;
            background-image:
              linear-gradient(rgba(255,255,255,.022) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px),
              radial-gradient(circle at 35% 20%, rgba(255,255,255,.035), transparent 18%);
            background-size: 42px 42px, 42px 42px, 100% 100%;
            opacity: .65;
            mix-blend-mode: screen;
          }

          #root > div::after {
            content: "";
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: 0;
            background: radial-gradient(circle at center, transparent 52%, rgba(2,8,20,.28) 100%);
          }

          #root > div > * {
            position: relative;
            z-index: 1;
          }

          *,
          *::before,
          *::after {
            box-sizing: border-box;
          }

          section,
          header > div,
          main > div,
          main > section {
            transform-style: preserve-3d;
          }

          section {
            transition: transform .2s cubic-bezier(.2,.8,.2,1), box-shadow .22s ease, border-color .22s ease, background .22s ease, filter .18s ease;
          }

          section:hover {
            filter: brightness(1.015);
            box-shadow: 0 28px 64px rgba(0,0,0,.28), 0 10px 24px rgba(2,8,20,.18), inset 0 1px 0 rgba(255,255,255,.1);
          }

          .app-view {
            animation: viewEnter .22s cubic-bezier(.2,.8,.2,1) both;
          }

          main > section,
          main > div,
          .app-view > * {
            animation: softReveal .26s cubic-bezier(.2,.8,.2,1) both;
          }

          main > section:nth-child(2) {
            animation-delay: .025s;
          }

          main > section:nth-child(3),
          main > div:nth-child(3) {
            animation-delay: .05s;
          }

          main > section:nth-child(4),
          main > div:nth-child(4) {
            animation-delay: .075s;
          }

          [data-page],
          [data-dashboard-tab],
          [data-feature],
          [data-history-open],
          [data-history-delete],
          [data-upload-action] {
            transition: transform .18s cubic-bezier(.2,.8,.2,1), box-shadow .2s ease, background .18s ease, border-color .18s ease, filter .18s ease;
          }

          [data-page]:hover,
          [data-dashboard-tab]:hover,
          [data-feature]:hover,
          [data-history-open]:hover,
          [data-upload-action]:hover {
            transform: translateY(-1px);
            filter: brightness(1.05);
          }

          .ui-spinner {
            width: 18px;
            height: 18px;
            border-radius: 999px;
            border: 2px solid rgba(255,255,255,.18);
            border-top-color: #8fd8ff;
            box-shadow: 0 0 18px rgba(143,216,255,.18);
            animation: spin .7s linear infinite;
            flex: 0 0 auto;
          }

          #uploadBtn[style*="Analyzing"],
          button[style*="Analyzing"] {
            position: relative;
            overflow: hidden;
          }

          #uploadBtn[style*="Analyzing"]::after,
          button[style*="Analyzing"]::after {
            content: "";
            position: absolute;
            inset: 0;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,.18), transparent);
            transform: translateX(-100%);
            animation: shimmer 1s ease-in-out infinite;
          }

          @keyframes viewEnter {
            from {
              opacity: .88;
              transform: translateY(6px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes softReveal {
            from {
              opacity: 0;
              transform: translateY(8px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }

          @keyframes shimmer {
            to {
              transform: translateX(100%);
            }
          }

          @media (prefers-reduced-motion: reduce) {
            *,
            *::before,
            *::after {
              animation-duration: .001ms !important;
              animation-iteration-count: 1 !important;
              transition-duration: .001ms !important;
              scroll-behavior: auto !important;
            }
          }

          h1 {
            font-size: clamp(2rem, 3vw, 3.15rem) !important;
            line-height: 1.08 !important;
            font-weight: 850 !important;
            letter-spacing: -.045em !important;
            color: #fff !important;
          }

          h2 {
            font-size: clamp(1.42rem, 1.8vw, 1.8rem) !important;
            line-height: 1.18 !important;
            font-weight: 800 !important;
            letter-spacing: -.03em !important;
            color: #fff !important;
          }

          h3 {
            font-size: 1.08rem !important;
            line-height: 1.28 !important;
            font-weight: 760 !important;
            letter-spacing: -.01em !important;
            color: #f7fbff !important;
          }

          p {
            font-weight: 500;
          }

          div[style*="text-transform:uppercase"],
          label {
            font-weight: 800 !important;
          }

          div[style*="color:rgba(228,236,247,.66)"],
          div[style*="color:rgba(228,236,247,.68)"],
          div[style*="color:rgba(228,236,247,.72)"],
          p[style*="color:rgba(228,236,247,.72)"] {
            font-size: .96rem;
            font-weight: 500;
          }

          div[style*="font-size:.82rem"],
          div[style*="font-size:.84rem"],
          span[style*="font-size:.82rem"],
          span[style*="font-size:.84rem"] {
            line-height: 1.55;
          }

          input,
          select,
          textarea {
            min-height: 44px;
            line-height: 1.4;
            font: inherit;
            vertical-align: middle;
          }

          input[type="checkbox"] {
            min-height: auto;
          }

          button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            line-height: 1.2;
            text-align: center;
            transition:
              transform .2s cubic-bezier(.2,.8,.2,1),
              box-shadow .22s ease,
              filter .18s ease,
              background .18s ease,
              border-color .18s ease,
              opacity .18s ease !important;
            will-change: transform, box-shadow;
          }

          button[style*="text-align:left"] {
            justify-content: flex-start;
          }

          button:hover {
            transform: translateY(-2px);
            box-shadow: 0 14px 28px rgba(2, 8, 20, .22), 0 0 0 1px rgba(143, 216, 255, .06);
            filter: brightness(1.04);
          }

          button:active {
            transform: translateY(0) scale(.985);
            box-shadow: 0 8px 16px rgba(2, 8, 20, .18);
            filter: brightness(.98);
          }

          button:focus-visible {
            outline: none;
            box-shadow: 0 0 0 3px rgba(143, 216, 255, .16), 0 14px 28px rgba(2, 8, 20, .22);
          }
        </style>
        ${bodyMarkup}
        ${renderCalendarModal()}
        ${renderTaskEditModal()}
        ${renderRecordingModal()}
        ${renderCameraModal()}
      </div>
    `;

    bindEvents();
    attachCameraPreview();
  }

  function bindEvents() {
    if (!state.currentUser) {
      root.querySelectorAll('[data-auth-mode]').forEach((button) => {
        button.addEventListener('click', function () {
          state.authMode = this.getAttribute('data-auth-mode');
          state.authError = '';
          render();
        });
      });

      const authForm = root.querySelector('#authForm');
      if (authForm) {
        authForm.addEventListener('submit', handleAuthSubmit);
      }
      ensureGoogleButton();
      return;
    }

    root.querySelectorAll('[data-page]').forEach((button) => {
      button.addEventListener('click', function () {
        const page = this.getAttribute('data-page');
        state.selectedCalendarDay = null;
        if (page === 'calendarPage') {
          state.page = 'dashboard';
          state.feature = 'calendar';
          state.dashboardTab = 'calendar';
        } else {
          state.page = page;
        }
        render();
      });
    });

    root.querySelectorAll('[data-feature]').forEach((button) => {
      button.addEventListener('click', function () {
        const feature = this.getAttribute('data-feature');
        state.feature = feature;
        state.page = 'dashboard';
        state.selectedCalendarDay = null;
        state.dashboardTab =
          feature === 'summarisation'
            ? 'summary'
            : feature === 'taskExtraction'
            ? 'tasks'
            : feature === 'deadline'
            ? 'deadlines'
            : 'calendar';
        render();
      });
    });

    root.querySelectorAll('[data-dashboard-tab]').forEach((button) => {
      button.addEventListener('click', function () {
        state.page = 'dashboard';
        const tab = this.getAttribute('data-dashboard-tab');
        state.dashboardTab = tab;
        state.selectedCalendarDay = null;
        state.feature =
          tab === 'summary'
            ? 'summarisation'
            : tab === 'tasks'
            ? 'taskExtraction'
            : tab === 'deadlines'
            ? 'deadline'
            : 'calendar';
        render();
      });
    });

    root.querySelectorAll('[data-calendar-nav]').forEach((button) => {
      button.addEventListener('click', function () {
        const direction = this.getAttribute('data-calendar-nav');
        if (direction === 'prev') {
          state.calendarMonth -= 1;
          if (state.calendarMonth < 0) {
            state.calendarMonth = 11;
            state.calendarYear -= 1;
          }
        } else {
          state.calendarMonth += 1;
          if (state.calendarMonth > 11) {
            state.calendarMonth = 0;
            state.calendarYear += 1;
          }
        }
        state.selectedCalendarDay = null;
        render();
      });
    });

    root.querySelectorAll('[data-calendar-day]').forEach((button) => {
      button.addEventListener('click', function () {
        const dayValue = Number(this.getAttribute('data-calendar-day'));
        if (!Number.isFinite(dayValue)) {
          return;
        }

        state.selectedCalendarDay = {
          year: state.calendarYear,
          month: state.calendarMonth,
          day: dayValue,
        };
        render();
      });
    });

    root.querySelectorAll('[data-hover-kind]').forEach((element) => {
      element.addEventListener('mouseenter', function () {
        const hoverKind = this.getAttribute('data-hover-kind');
        if (hoverKind === 'calendar-day') {
          this.style.zIndex = '4';
          this.style.transform = 'translateY(-6px) scale(1.03)';
          this.style.borderColor = 'rgba(143,216,255,.42)';
          this.style.background = 'linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.08))';
          this.style.boxShadow = '0 20px 34px rgba(2,8,20,.28), 0 0 0 1px rgba(143,216,255,.12), 0 0 18px rgba(0,209,255,.12)';
          this.style.filter = 'brightness(1.04)';
        } else {
          this.style.transform = 'translateY(-1px)';
          this.style.borderColor = 'rgba(143,216,255,.34)';
          this.style.background = 'rgba(255,255,255,.1)';
        }
      });

      element.addEventListener('mouseleave', function () {
        const hoverKind = this.getAttribute('data-hover-kind');
        if (hoverKind === 'calendar-day') {
          const hasEvents = this.getAttribute('data-has-events') === 'true';
          this.style.zIndex = '0';
          this.style.transform = 'translateY(0) scale(1)';
          this.style.boxShadow = 'none';
          this.style.filter = 'none';
          this.style.borderColor = hasEvents ? 'rgba(143,216,255,.18)' : 'rgba(255,255,255,.06)';
          this.style.background = hasEvents ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.04)';
        } else {
          this.style.transform = 'translateY(0)';
          this.style.borderColor = 'rgba(255,255,255,.12)';
          this.style.background = 'rgba(255,255,255,.06)';
        }
      });
    });

    const closeCalendarModalBtn = root.querySelector('[data-close-calendar-modal]');
    if (closeCalendarModalBtn) {
      closeCalendarModalBtn.addEventListener('click', function () {
        state.selectedCalendarDay = null;
        render();
      });
    }

    const calendarModalBackdrop = root.querySelector('[data-calendar-modal-backdrop]');
    if (calendarModalBackdrop) {
      calendarModalBackdrop.addEventListener('click', function (event) {
        if (event.target !== calendarModalBackdrop) {
          return;
        }
        state.selectedCalendarDay = null;
        render();
      });
    }

    root.querySelectorAll('[data-complete-task]').forEach((button) => {
      button.addEventListener('click', function () {
        handleCompleteTask(this.getAttribute('data-complete-task'));
      });
    });

    const taskSortMode = root.querySelector('#taskSortMode');
    if (taskSortMode) {
      taskSortMode.addEventListener('change', function () {
        state.taskSortMode = this.value || 'deadline';
        render();
      });
    }

    root.querySelectorAll('[data-task-toggle]').forEach((input) => {
      input.addEventListener('change', function () {
        handleCompleteTask(this.getAttribute('data-task-toggle'), this.checked);
      });
    });

    root.querySelectorAll('[data-edit-task]').forEach((button) => {
      button.addEventListener('click', function () {
        const taskId = this.getAttribute('data-edit-task');
        const task = state.tasks.find((entry) => entry.id === taskId);
        openTaskEditModal(task || null);
      });
    });

    const taskEditBackdrop = root.querySelector('[data-task-edit-backdrop]');
    if (taskEditBackdrop) {
      taskEditBackdrop.addEventListener('click', function (event) {
        if (event.target !== taskEditBackdrop) {
          return;
        }
        closeTaskEditModal();
      });
    }

    root.querySelectorAll('[data-close-task-edit], [data-cancel-task-edit]').forEach((button) => {
      button.addEventListener('click', closeTaskEditModal);
    });

    root.querySelectorAll('[data-task-draft]').forEach((input) => {
      input.addEventListener('input', function () {
        const key = this.getAttribute('data-task-draft');
        if (!key) {
          return;
        }
        state.taskDraft = {
          ...state.taskDraft,
          [key]: this.value,
        };
      });
      input.addEventListener('change', function () {
        const key = this.getAttribute('data-task-draft');
        if (!key) {
          return;
        }
        state.taskDraft = {
          ...state.taskDraft,
          [key]: this.value,
        };
      });
    });

    const saveTaskEditBtn = root.querySelector('[data-save-task-edit]');
    if (saveTaskEditBtn) {
      saveTaskEditBtn.addEventListener('click', handleSaveTaskEdit);
    }

    const copySummaryBtn = root.querySelector('[data-copy-summary]');
    if (copySummaryBtn) {
      copySummaryBtn.addEventListener('click', copyActiveSummary);
    }

    root.querySelectorAll('[data-download-summary]').forEach((button) => {
      button.addEventListener('click', function () {
        downloadActiveSummary(this.getAttribute('data-download-summary') || 'txt');
      });
    });

    const summaryCompareSelect = root.querySelector('#summaryCompareSelect');
    if (summaryCompareSelect) {
      summaryCompareSelect.addEventListener('change', function () {
        state.compareSummaryDocumentId = this.value;
        state.summaryNotice = '';
        render();
      });
    }

    const clearSummaryCompareBtn = root.querySelector('[data-clear-summary-compare]');
    if (clearSummaryCompareBtn) {
      clearSummaryCompareBtn.addEventListener('click', function () {
        state.compareSummaryDocumentId = '';
        render();
      });
    }

    const fileInput = root.querySelector('#fileInput');
    if (fileInput) {
      fileInput.addEventListener('change', function (event) {
        mergePendingFiles(event.target.files || [], 'manual');
        state.selectedFile = event.target.files && event.target.files[0] ? event.target.files[0] : null;
        state.uploadError = '';
        state.uploadNotice = '';
        state.recordingError = '';
        state.recordingNotice = '';
        state.cameraError = '';
        state.cameraNotice = '';
        state.recordedFromMicrophone = false;
        state.capturedFromCamera = false;
        fileInput.value = '';
        render();
      });
    }

    const uploadActionsBtn = root.querySelector('#uploadActionsBtn');
    if (uploadActionsBtn) {
      uploadActionsBtn.addEventListener('click', function () {
        state.uploadActionMenuOpen = !state.uploadActionMenuOpen;
        render();
      });
    }

    const closeUploadMenuLayer = root.querySelector('[data-close-upload-menu]');
    if (closeUploadMenuLayer) {
      closeUploadMenuLayer.addEventListener('click', function () {
        closeUploadActionMenu();
      });
    }

    root.querySelectorAll('[data-upload-action]').forEach((button) => {
      button.addEventListener('click', function () {
        const action = this.getAttribute('data-upload-action');
        state.uploadActionMenuOpen = false;

        if (action === 'browse') {
          if (fileInput) {
            fileInput.click();
          }
          return;
        }

        if (action === 'record') {
          startMicrophoneRecording();
          return;
        }

        if (action === 'camera') {
          startCameraCapture();
        }
      });
    });

    const uploadDropZone = root.querySelector('#uploadDropZone');
    if (uploadDropZone) {
      ['dragenter', 'dragover'].forEach((eventName) => {
        uploadDropZone.addEventListener(eventName, function (event) {
          event.preventDefault();
          state.dragOverUpload = true;
          render();
        });
      });

      ['dragleave', 'dragend', 'drop'].forEach((eventName) => {
        uploadDropZone.addEventListener(eventName, function (event) {
          event.preventDefault();
          state.dragOverUpload = false;
          if (eventName === 'drop' && event.dataTransfer && event.dataTransfer.files) {
            mergePendingFiles(event.dataTransfer.files, 'manual');
          }
          render();
        });
      });
    }

    const uploadBtn = root.querySelector('#uploadBtn');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', handleUpload);
    }

    const recordingModalBackdrop = root.querySelector('[data-recording-modal-backdrop]');
    if (recordingModalBackdrop) {
      recordingModalBackdrop.addEventListener('click', function (event) {
        if (event.target !== recordingModalBackdrop) {
          return;
        }
        closeRecordingModal();
      });
    }

    const closeRecordingModalBtn = root.querySelector('[data-close-recording-modal]');
    if (closeRecordingModalBtn) {
      closeRecordingModalBtn.addEventListener('click', closeRecordingModal);
    }

    const recordingControl = root.querySelector('[data-recording-control]');
    if (recordingControl) {
      recordingControl.addEventListener('click', function () {
        const action = this.getAttribute('data-recording-control');
        if (action === 'start') {
          startMicrophoneRecording();
        } else {
          stopMicrophoneRecording();
        }
      });
    }

    const confirmRecordingBtn = root.querySelector('[data-confirm-recording]');
    if (confirmRecordingBtn) {
      confirmRecordingBtn.addEventListener('click', confirmRecordedAudio);
    }

    const discardRecordingBtn = root.querySelector('[data-discard-recording]');
    if (discardRecordingBtn) {
      discardRecordingBtn.addEventListener('click', function () {
        resetRecordedAudioDraft();
        state.recordingError = '';
        state.recordingNotice = '';
        render();
      });
    }

    const cameraModalBackdrop = root.querySelector('[data-camera-modal-backdrop]');
    if (cameraModalBackdrop) {
      cameraModalBackdrop.addEventListener('click', function (event) {
        if (event.target !== cameraModalBackdrop) {
          return;
        }
        closeCameraModal();
      });
    }

    const closeCameraModalBtn = root.querySelector('[data-close-camera-modal]');
    if (closeCameraModalBtn) {
      closeCameraModalBtn.addEventListener('click', closeCameraModal);
    }

    const cameraControl = root.querySelector('[data-camera-control]');
    if (cameraControl) {
      cameraControl.addEventListener('click', function () {
        const action = this.getAttribute('data-camera-control');
        if (action === 'start') {
          startCameraCapture();
        } else if (action === 'capture') {
          captureCameraImage();
        }
      });
    }

    const confirmCameraCaptureBtn = root.querySelector('[data-confirm-camera-capture]');
    if (confirmCameraCaptureBtn) {
      confirmCameraCaptureBtn.addEventListener('click', confirmCapturedImage);
    }

    const discardCameraCaptureBtn = root.querySelector('[data-discard-camera-capture]');
    if (discardCameraCaptureBtn) {
      discardCameraCaptureBtn.addEventListener('click', function () {
        resetCapturedImageDraft();
        state.cameraError = '';
        state.cameraNotice = '';
        startCameraCapture();
      });
    }

    const enableNotificationsBtn = root.querySelector('#enableNotificationsBtn');
    if (enableNotificationsBtn) {
      enableNotificationsBtn.addEventListener('click', async function () {
        if (!('Notification' in window)) {
          return;
        }

        if (Notification.permission === 'default') {
          await Notification.requestPermission();
          render();
          maybeNotifyUrgentDeadlines();
        }
      });
    }

    const logoutBtn = root.querySelector('#logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', handleLogout);
    }

    const historySearchInput = root.querySelector('#historySearchInput');
    if (historySearchInput) {
      historySearchInput.addEventListener('input', function () {
        state.historySearch = this.value;
        render();
      });
    }

    const historyTypeFilter = root.querySelector('#historyTypeFilter');
    if (historyTypeFilter) {
      historyTypeFilter.addEventListener('change', function () {
        state.historyTypeFilter = this.value;
        render();
      });
    }

    const historyDateFilter = root.querySelector('#historyDateFilter');
    if (historyDateFilter) {
      historyDateFilter.addEventListener('change', function () {
        state.historyDateFilter = this.value;
        render();
      });
    }

    root.querySelectorAll('[data-history-open]').forEach((button) => {
      button.addEventListener('click', function () {
        const documentId = this.getAttribute('data-history-open') || '';
        state.activeDocumentId = documentId;
        state.summaryNotice = '';
        if (state.compareSummaryDocumentId === documentId) {
          state.compareSummaryDocumentId = '';
        }
        render();
      });
    });

    root.querySelectorAll('[data-history-delete]').forEach((button) => {
      button.addEventListener('click', function () {
        handleDeleteHistoryItem(this.getAttribute('data-history-delete'));
      });
    });

    const historyClearBtn = root.querySelector('[data-history-clear]');
    if (historyClearBtn) {
      historyClearBtn.addEventListener('click', handleClearHistory);
    }

  }

  async function handleAuthSubmit(event) {
    event.preventDefault();

    const emailInput = root.querySelector('#authEmail');
    const passwordInput = root.querySelector('#authPassword');
    const nameInput = root.querySelector('#authName');

    const payload =
      state.authMode === 'register'
        ? {
            name: nameInput ? nameInput.value.trim() : '',
            email: emailInput ? emailInput.value.trim() : '',
            password: passwordInput ? passwordInput.value : '',
          }
        : {
            email: emailInput ? emailInput.value.trim() : '',
            password: passwordInput ? passwordInput.value : '',
          };

    state.authError = '';
    state.authLoading = true;
    render();

    try {
      const response = await fetch(`${API_BASE}/auth/${state.authMode}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.message || 'Authentication failed.');
      }

      state.authToken = data.token || '';
      state.currentUser = data.user || null;
      persistAuthToken(state.authToken);
      persistAuthUser(state.currentUser);
      state.documents = readStoredDocuments();
      syncDerivedState();
      await fetchStoredDocuments();
      maybeNotifyUrgentDeadlines();
      state.page = 'home';
    } catch (error) {
      state.authError = error.message || 'Authentication failed.';
      state.currentUser = null;
      state.authToken = '';
      state.documents = [];
      persistAuthToken('');
      persistAuthUser(null);
    } finally {
      state.authLoading = false;
      render();
    }
  }

  async function handleLogout() {
    try {
      await authFetch('/auth/logout', { method: 'POST' });
    } catch (error) {}

    state.authToken = '';
    state.currentUser = null;
    state.documents = [];
    state.tasks = [];
    state.summary = '';
    state.extractedText = '';
    state.extractedTextLength = 0;
    state.authError = '';
    state.activeDocumentId = '';
    state.compareSummaryDocumentId = '';
    state.summaryNotice = '';
    state.historySearch = '';
    state.historyTypeFilter = 'all';
    state.historyDateFilter = '';
    state.taskSortMode = 'deadline';
    state.taskEditModalOpen = false;
    state.editingTaskId = '';
    state.taskDraft = {
      task: '',
      deadline: '',
      priority: 'Medium',
      source_filename: '',
    };
    state.selectedFile = null;
    state.pendingFiles = [];
    state.dragOverUpload = false;
    state.uploadActionMenuOpen = false;
    state.recordedFromMicrophone = false;
    state.capturedFromCamera = false;
    state.recordingError = '';
    state.recordingNotice = '';
    state.cameraError = '';
    state.cameraNotice = '';
    state.recordingModalOpen = false;
    state.cameraModalOpen = false;
    state.discardRecordingOnStop = false;
    cleanupCameraResources();
    cleanupSpeechRecognition();
    cleanupRecordingResources();
    resetRecordedAudioDraft();
    resetCapturedImageDraft();
    persistAuthToken('');
    persistAuthUser(null);
    render();
  }

  async function handleDeleteHistoryItem(documentId) {
    if (!documentId) {
      return;
    }

    try {
      const response = await authFetch(`/documents/${encodeURIComponent(documentId)}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.message || 'Could not delete the history item.');
      }

      state.documents = state.documents.filter((document) => document.id !== documentId);
      if (state.activeDocumentId === documentId) {
        state.activeDocumentId = '';
      }
      if (state.compareSummaryDocumentId === documentId) {
        state.compareSummaryDocumentId = '';
      }
      state.summaryNotice = '';
      syncDerivedState();
      persistDocuments();
      render();
    } catch (error) {
      state.uploadError = error.message || 'Could not delete the history item.';
      render();
    }
  }

  async function handleClearHistory() {
    try {
      const response = await authFetch('/documents/', {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.message || 'Could not clear history.');
      }

      state.documents = [];
      state.activeDocumentId = '';
      state.compareSummaryDocumentId = '';
      state.summaryNotice = '';
      syncDerivedState();
      persistDocuments();
      render();
    } catch (error) {
      state.uploadError = error.message || 'Could not clear history.';
      render();
    }
  }

  async function handleGoogleCredentialResponse(response) {
    state.authError = '';
    state.authLoading = true;
    render();

    try {
      const authResponse = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credential: response.credential,
        }),
      });

      const data = await authResponse.json();
      if (!authResponse.ok) {
        throw new Error(data.detail || data.message || 'Google sign-in failed.');
      }

      state.authToken = data.token || '';
      state.currentUser = data.user || null;
      persistAuthToken(state.authToken);
      persistAuthUser(state.currentUser);
      state.documents = readStoredDocuments();
      syncDerivedState();
      await fetchStoredDocuments();
      maybeNotifyUrgentDeadlines();
      state.page = 'home';
    } catch (error) {
      state.authError = error.message || 'Google sign-in failed.';
      state.currentUser = null;
      state.authToken = '';
      state.documents = [];
      persistAuthToken('');
      persistAuthUser(null);
    } finally {
      state.authLoading = false;
      render();
    }
  }

  async function handleUpload(options = {}) {
    const { preserveRecordingNotice = false, preserveCameraNotice = false } = options;

    const queuedEntries = state.pendingFiles.filter((entry) => entry.status !== 'done');
    if (!queuedEntries.length) {
      state.uploadError = 'Please add at least one PDF, DOCX, TXT, image, or audio file first.';
      state.uploadNotice = '';
      render();
      return;
    }

    state.loading = true;
    state.uploadError = '';
    state.uploadNotice = '';
    state.recordingError = '';
    state.cameraError = '';
    if (!preserveRecordingNotice) {
      state.recordingNotice = '';
    }
    if (!preserveCameraNotice) {
      state.cameraNotice = '';
    }
    render();

    try {
      let processedCount = 0;
      let lastUploadNotice = '';

      for (const entry of queuedEntries) {
        updatePendingFile(entry.id, {
          status: 'uploading',
          progress: 8,
          error: '',
        });
        render();

        try {
          const data = await authUploadFile('/analyze/', entry.file, function (percent) {
            updatePendingFile(entry.id, {
              progress: percent,
            });
            render();
          });

          const nextDocument = normalizeDocument(
            data.document || {
              id: `${Date.now()}-${data.filename || entry.file.name}`,
              filename: data.filename || entry.file.name,
              extractedText: data.extracted_text_preview || data.extracted_text || '',
              extractedTextLength: data.extracted_text_length,
              summary: data.summary || 'No summary returned.',
              tasks: Array.isArray(data.tasks) ? data.tasks : [],
              uploadedAt: new Date().toISOString(),
            }
          );

          state.documents = [...state.documents, nextDocument];
          state.activeDocumentId = nextDocument.id;
          state.compareSummaryDocumentId = '';
          state.summaryNotice = '';
          updatePendingFile(entry.id, {
            status: 'done',
            progress: 100,
            error: '',
          });
          processedCount += 1;
          lastUploadNotice =
            data.same_day_reminders_sent > 0
              ? `Today’s deadline reminder email was sent to ${state.currentUser ? state.currentUser.email : 'your login email'}.`
              : data.same_day_deadlines_detected > 0
              ? `A same-day deadline was detected, but the reminder email could not be sent${
                  data.same_day_reminder_error ? `. Error: ${data.same_day_reminder_error}` : '.'
                }`
              : data.summary_email_sent
              ? `Deadline summary emailed to ${state.currentUser ? state.currentUser.email : 'your login email'}.`
              : `Upload completed, but no deadline for today was detected in this file.`;
          syncDerivedState();
          persistDocuments();
        } catch (error) {
          if (error && error.status === 401) {
            state.authError = 'Your session expired. Please log in again.';
            state.authToken = '';
            state.currentUser = null;
            persistAuthToken('');
            throw new Error('Your session expired. Please log in again.');
          }

          updatePendingFile(entry.id, {
            status: 'error',
            progress: 0,
            error: error && error.message ? error.message : 'Upload failed.',
          });
        }
      }

      await fetchStoredDocuments();
      state.selectedFile = null;
      state.recordedFromMicrophone = false;
      state.capturedFromCamera = false;
      state.recordingNotice = preserveRecordingNotice ? 'Voice recording analyzed successfully.' : '';
      state.cameraNotice = preserveCameraNotice ? 'Camera image analyzed successfully.' : '';
      state.uploadNotice =
        processedCount > 0
          ? `${processedCount} file${processedCount === 1 ? '' : 's'} processed successfully. ${lastUploadNotice}`.trim()
          : '';
      state.page = 'dashboard';
      maybeNotifyUrgentDeadlines();
    } catch (error) {
      state.uploadError = error.message || 'Upload failed.';
    } finally {
      state.loading = false;
      render();
    }
  }

  async function handleCompleteTask(taskId, completed = true) {
    if (!taskId) {
      return;
    }

    try {
      const response = await authFetch(`/documents/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ completed }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.message || 'Could not update the task.');
      }

      await fetchStoredDocuments();
      if (state.taskEditModalOpen && state.editingTaskId === taskId) {
        closeTaskEditModal();
        return;
      }
      render();
    } catch (error) {
      state.uploadError = error.message || 'Could not update the task.';
      render();
    }
  }

  async function handleSaveTaskEdit() {
    if (!state.editingTaskId) {
      return;
    }

    const trimmedTaskName = (state.taskDraft.task || '').trim();
    const trimmedDeadline = (state.taskDraft.deadline || '').trim();
    const normalizedPriority = getPriorityMeta(state.taskDraft.priority).label;

    if (!trimmedTaskName) {
      state.uploadError = 'Task name cannot be empty.';
      render();
      return;
    }

    try {
      const response = await authFetch(`/documents/tasks/${encodeURIComponent(state.editingTaskId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task: trimmedTaskName,
          deadline: trimmedDeadline,
          priority: normalizedPriority,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.message || 'Could not save the task changes.');
      }

      await fetchStoredDocuments();
      state.uploadError = '';
      closeTaskEditModal();
    } catch (error) {
      state.uploadError = error.message || 'Could not save the task changes.';
      render();
    }
  }

  async function initializeApp() {
    await fetchAuthConfig();
    state.authLoading = true;
    render();

    const hasSession = await fetchCurrentUser();
    if (hasSession) {
      await fetchStoredDocuments();
      maybeNotifyUrgentDeadlines();
    } else {
      state.authToken = '';
      state.currentUser = null;
      state.documents = [];
      persistAuthToken('');
      persistAuthUser(null);
    }

    state.authLoading = false;
    render();
  }

  initializeApp();
})();
