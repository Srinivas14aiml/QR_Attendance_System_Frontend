import { useCallback, useEffect, useState } from 'react';
import './App.css';

const ENV_API_BASE = process.env.REACT_APP_API_BASE?.trim();
const LOCAL_API_BASE = 'https://qr-attendance-backend-x35f.onrender.com';
const LEGACY_API_BASES = ['https://qr-attendance-system-l93g.onrender.com'];
const DEFAULT_API_BASE = ENV_API_BASE || LOCAL_API_BASE;
const TOKEN_KEY = 'attendance-token';
const USER_KEY = 'attendance-user';
const API_BASE_KEY = 'attendance-api-base';

const defaultLoginForm = { username: '', password: '' };
const defaultRegisterForm = { username: '', password: '', fullName: '', role: 'ROLE_STUDENT' };
const defaultSessionForm = {
  subjectName: '',
  className: '',
  totalStudents: 60,
  startAt: '',
  durationMinutes: 30,
};
const defaultStudentForm = { studentName: '', rollNumber: '' };

function readStorage(key, fallback) {
  const value = window.localStorage.getItem(key);
  if (!value) {
    return fallback;
  }

  if (key === USER_KEY) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  return value;
}

function resolveInitialApiBase() {
  const storedValue = readStorage(API_BASE_KEY, '');
  const isLegacyApiBase = LEGACY_API_BASES.includes(storedValue);

  if (ENV_API_BASE) {
    if (!storedValue || isLegacyApiBase || storedValue.includes('localhost') || storedValue.includes('127.0.0.1')) {
      return ENV_API_BASE;
    }
  }

  if (!storedValue || isLegacyApiBase || storedValue.includes('localhost') || storedValue.includes('127.0.0.1')) {
    return DEFAULT_API_BASE;
  }

  return storedValue || DEFAULT_API_BASE;
}

function formatDateTime(value) {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function toIsoString(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function apiRequest(path, { apiBase, token, method = 'GET', body } = {}) {
  let response;

  try {
    response = await fetch(`${apiBase.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    throw new Error(`Cannot reach the backend at ${apiBase}. Verify the backend URL and make sure the server is running.`);
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');

  if (!response.ok) {
    const message =
      typeof payload === 'string'
        ? payload || `Request failed with status ${response.status}`
        : payload?.message || payload?.error || `Request failed with status ${response.status}`;
    throw new Error(
      `${response.status}: ${message}`,
    );
  }

  return payload;
}

async function createDeviceFingerprint() {
  const raw = [
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    new Date().getTimezoneOffset(),
    window.screen.width,
    window.screen.height,
    navigator.hardwareConcurrency || 'na',
  ].join('|');

  if (!window.crypto?.subtle) {
    return raw;
  }

  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('');
}

function getStudentSubmissionKey(token, rollNumber) {
  return `attendance-submitted:${token}:${rollNumber.trim().toLowerCase()}`;
}

function StatusMessage({ message, tone = 'info' }) {
  if (!message) {
    return null;
  }

  return <p className={`status-banner ${tone}`}>{message}</p>;
}

function StudentAttendancePage({ apiBase }) {
  const params = new URLSearchParams(window.location.search);
  const qrToken = params.get('token') || '';
  const [studentForm, setStudentForm] = useState(defaultStudentForm);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [networkInfo, setNetworkInfo] = useState(null);
  const [pageMessage, setPageMessage] = useState('');
  const [pageTone, setPageTone] = useState('info');
  const [submitting, setSubmitting] = useState(false);
  const [fingerprint, setFingerprint] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    createDeviceFingerprint().then(setFingerprint);
  }, []);

  useEffect(() => {
    if (!qrToken) {
      setPageMessage('Missing QR session token.');
      setPageTone('error');
      return;
    }

    let active = true;

    async function loadPublicContext() {
      try {
        const [sessionResponse, proxyResponse] = await Promise.all([
          apiRequest(`/api/student-session/${qrToken}`, { apiBase }),
          apiRequest('/api/ai/proxy-check', { apiBase }),
        ]);

        if (!active) {
          return;
        }

        setSessionInfo(sessionResponse);
        setNetworkInfo(proxyResponse);
      } catch (error) {
        if (active) {
          setPageMessage(error.message);
          setPageTone('error');
        }
      }
    }

    loadPublicContext();
    return () => {
      active = false;
    };
  }, [apiBase, qrToken]);

  useEffect(() => {
    if (!qrToken || !studentForm.rollNumber) {
      setSubmitted(false);
      return;
    }

    setSubmitted(Boolean(window.localStorage.getItem(getStudentSubmissionKey(qrToken, studentForm.rollNumber))));
  }, [qrToken, studentForm.rollNumber]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setPageMessage('');

    try {
      const response = await apiRequest('/api/submit-attendance', {
        apiBase,
        method: 'POST',
        body: {
          qrToken,
          studentName: studentForm.studentName.trim(),
          rollNumber: studentForm.rollNumber.trim(),
          deviceFingerprint: fingerprint,
        },
      });

      window.localStorage.setItem(getStudentSubmissionKey(qrToken, studentForm.rollNumber), 'true');
      setSubmitted(true);
      setPageMessage(response.message);
      setPageTone(response.record?.suspicious ? 'warning' : 'success');
    } catch (error) {
      setPageMessage(error.message);
      setPageTone('error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="orb orb-a" />
      <div className="orb orb-b" />
      <main className="container student-mode">
        <section className="hero-card">
          <div className="hero-topline">Smart QR Attendance</div>
          <h1>Student Attendance Page</h1>
          <p className="hero-copy">
            Scan the classroom QR, verify the session, and submit attendance from the campus network only.
          </p>
          <div className="session-pill-row">
            <span className="session-pill">{sessionInfo?.subjectName || 'Session'}</span>
            <span className="session-pill">{sessionInfo?.className || 'Class'}</span>
            <span className={`session-pill ${sessionInfo?.active ? 'live' : 'muted'}`}>
              {sessionInfo?.active ? 'Live session' : 'Session closed'}
            </span>
          </div>
        </section>

        <section className="glass-card student-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Attendance Form</p>
              <h2>{sessionInfo?.teacherName || 'Teacher session'}</h2>
            </div>
            <div className="meta-stack">
              <span>{formatDateTime(sessionInfo?.startAt)}</span>
              <span>Ends {formatDateTime(sessionInfo?.endAt)}</span>
            </div>
          </div>

          <StatusMessage message={pageMessage} tone={pageTone} />

          <div className="network-strip">
            <span>Campus network: {networkInfo?.inCampusNetwork ? 'Validated' : 'Blocked'}</span>
            <span>IP: {networkInfo?.ip || 'Unknown'}</span>
            <span>{networkInfo?.reason || 'Network status unavailable'}</span>
          </div>

          <form className="form-grid" onSubmit={handleSubmit}>
            <label>
              Student Name
              <input
                value={studentForm.studentName}
                onChange={(event) =>
                  setStudentForm((current) => ({ ...current, studentName: event.target.value }))
                }
                placeholder="Enter your full name"
                required
                disabled={submitted}
              />
            </label>

            <label>
              Roll Number
              <input
                value={studentForm.rollNumber}
                onChange={(event) =>
                  setStudentForm((current) => ({ ...current, rollNumber: event.target.value }))
                }
                placeholder="Enter your roll number"
                required
                disabled={submitted}
              />
            </label>

            <button
              type="submit"
              className="primary-button"
              disabled={submitted || submitting || !sessionInfo?.active}
            >
              {submitted ? 'Attendance Locked' : submitting ? 'Submitting...' : 'Submit Attendance'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

function TeacherDashboard({ apiBase, token, currentUser, onLogout }) {
  const [sessionForm, setSessionForm] = useState(defaultSessionForm);
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [sessionDetail, setSessionDetail] = useState(null);
  const [qrData, setQrData] = useState(null);
  const [actionMessage, setActionMessage] = useState('');
  const [actionTone, setActionTone] = useState('info');
  const [loading, setLoading] = useState({
    sessions: false,
    create: false,
    detail: false,
    qr: false,
    end: false,
  });

  useEffect(() => {
    setSessionForm((current) => (
      current.startAt
        ? current
        : {
            ...current,
            startAt: new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
              .toISOString()
              .slice(0, 16),
          }
    ));
  }, []);

  const loadSessions = useCallback(async () => {
    setLoading((current) => ({ ...current, sessions: true }));
    try {
      const response = await apiRequest('/api/sessions', { apiBase, token });
      setSessions(response);
      setSelectedSessionId((current) => (current || response.length === 0 ? current : String(response[0].id)));
    } catch (error) {
      setActionMessage(error.message);
      setActionTone('error');
    } finally {
      setLoading((current) => ({ ...current, sessions: false }));
    }
  }, [apiBase, token]);

  const loadSessionAttendance = useCallback(async (sessionId, options = {}) => {
    setLoading((current) => ({ ...current, detail: !options.silent }));
    try {
      const response = await apiRequest(`/api/session-attendance/${sessionId}`, { apiBase, token });
      setSessionDetail(response);
      setSessions((current) =>
        current.map((item) => (item.id === response.session.id ? response.session : item)),
      );
    } catch (error) {
      if (error.message.includes('403')) {
        setActionMessage('This session is not available for the current teacher account. Log in again or create a new session.');
        setActionTone('error');
        if (!options.silent) {
          setSelectedSessionId('');
          setSessionDetail(null);
        }
        return;
      }
      if (!options.silent) {
        setActionMessage(error.message);
        setActionTone('error');
      }
    } finally {
      setLoading((current) => ({ ...current, detail: false }));
    }
  }, [apiBase, token]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!selectedSessionId) {
      return;
    }

    loadSessionAttendance(selectedSessionId);
    const interval = window.setInterval(() => {
      loadSessionAttendance(selectedSessionId, { silent: true });
    }, 5000);

    return () => window.clearInterval(interval);
  }, [loadSessionAttendance, selectedSessionId]);

  async function handleCreateSession(event) {
    event.preventDefault();
    setLoading((current) => ({ ...current, create: true }));
    setActionMessage('');

    try {
      const response = await apiRequest('/api/create-session', {
        apiBase,
        token,
        method: 'POST',
        body: {
          subjectName: sessionForm.subjectName.trim(),
          className: sessionForm.className.trim(),
          totalStudents: Number(sessionForm.totalStudents),
          startAt: toIsoString(sessionForm.startAt),
          durationMinutes: Number(sessionForm.durationMinutes),
        },
      });

      setSessionForm(defaultSessionForm);
      setSelectedSessionId(String(response.id));
      setActionMessage('Attendance session created.');
      setActionTone('success');
      await loadSessions();
      await loadQr(response.id);
      await loadSessionAttendance(response.id);
    } catch (error) {
      setActionMessage(error.message);
      setActionTone('error');
    } finally {
      setLoading((current) => ({ ...current, create: false }));
    }
  }

  async function loadQr(sessionId = selectedSessionId) {
    if (!sessionId) {
      return;
    }

    setLoading((current) => ({ ...current, qr: true }));
    try {
      const response = await apiRequest(`/api/generate-qr?sessionId=${sessionId}`, { apiBase, token });
      setQrData(response);
    } catch (error) {
      setActionMessage(error.message);
      setActionTone('error');
    } finally {
      setLoading((current) => ({ ...current, qr: false }));
    }
  }

  async function handleEndSession() {
    if (!selectedSessionId) {
      return;
    }

    setLoading((current) => ({ ...current, end: true }));
    try {
      const response = await apiRequest(`/api/end-session/${selectedSessionId}`, {
        apiBase,
        token,
        method: 'POST',
      });
      setSessionDetail(response);
      setSessions((current) =>
        current.map((item) => (item.id === response.session.id ? response.session : item)),
      );
      setActionMessage('Session ended. QR is now invalid.');
      setActionTone('success');
    } catch (error) {
      setActionMessage(error.message);
      setActionTone('error');
    } finally {
      setLoading((current) => ({ ...current, end: false }));
    }
  }

  const stats = sessionDetail?.stats;
  const records = sessionDetail?.records || [];
  const suspiciousPatterns = sessionDetail?.suspiciousPatterns || [];

  return (
    <div className="page-shell">
      <div className="orb orb-a" />
      <div className="orb orb-b" />
      <main className="container">
        <section className="hero-card">
          <div className="hero-topline">Smart QR Attendance</div>
          <div className="hero-header-row">
            <div>
              <h1>Teacher Dashboard</h1>
              <p className="hero-copy">
                Create timed QR attendance sessions, monitor live statistics, review suspicious patterns,
                and close sessions the moment class ends.
              </p>
            </div>
            <div className="profile-chip">
              <span>{currentUser.fullName}</span>
              <span>{currentUser.role}</span>
              <button type="button" className="ghost-button" onClick={onLogout}>
                Logout
              </button>
            </div>
          </div>
        </section>

        <StatusMessage message={actionMessage} tone={actionTone} />

        <section className="dashboard-grid">
          <article className="glass-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Card 1</p>
                <h2>Create Session</h2>
              </div>
              <span className="muted-text">POST /create-session</span>
            </div>

            <form className="form-grid" onSubmit={handleCreateSession}>
              <label>
                Subject Name
                <input
                  value={sessionForm.subjectName}
                  onChange={(event) =>
                    setSessionForm((current) => ({ ...current, subjectName: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                Class Name
                <input
                  value={sessionForm.className}
                  onChange={(event) =>
                    setSessionForm((current) => ({ ...current, className: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                Date & Time
                <input
                  type="datetime-local"
                  value={sessionForm.startAt}
                  onChange={(event) =>
                    setSessionForm((current) => ({ ...current, startAt: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                Session Duration (minutes)
                <input
                  type="number"
                  min="1"
                  value={sessionForm.durationMinutes}
                  onChange={(event) =>
                    setSessionForm((current) => ({ ...current, durationMinutes: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                Total Students
                <input
                  type="number"
                  min="1"
                  value={sessionForm.totalStudents}
                  onChange={(event) =>
                    setSessionForm((current) => ({ ...current, totalStudents: event.target.value }))
                  }
                  required
                />
              </label>

              <button type="submit" className="primary-button" disabled={loading.create}>
                {loading.create ? 'Creating...' : 'Create Attendance Session'}
              </button>
            </form>
          </article>

          <article className="glass-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Card 2</p>
                <h2>QR Code Display</h2>
              </div>
              <div className="action-row">
                <select
                  value={selectedSessionId}
                  onChange={(event) => setSelectedSessionId(event.target.value)}
                >
                  <option value="">Select session</option>
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.subjectName} | {session.className}
                    </option>
                  ))}
                </select>
                <button type="button" className="ghost-button" onClick={() => loadQr()} disabled={loading.qr}>
                  {loading.qr ? 'Loading...' : 'Generate QR'}
                </button>
              </div>
            </div>

            {qrData ? (
              <div className="qr-panel">
                <img src={`data:image/png;base64,${qrData.qrBase64}`} alt="Attendance QR" className="qr-image" />
                <div className="link-box">
                  <span>Student page</span>
                  <code>{qrData.attendanceUrl}</code>    
                   {qrData}
              
                </div>
                <p className="muted-text">QR expires at {formatDateTime(qrData.expiresAt)}</p>
              </div>
            ) : (
              <p className="empty-state">Select a session and generate the QR code.</p>
            )}
          </article>

          <article className="glass-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Card 3</p>
                <h2>Attendance Stats</h2>
              </div>
              <div className="action-row">
                <button type="button" className="ghost-button" onClick={loadSessions} disabled={loading.sessions}>
                  {loading.sessions ? 'Refreshing...' : 'Refresh'}
                </button>
                <button type="button" className="danger-button" onClick={handleEndSession} disabled={loading.end || !selectedSessionId}>
                  {loading.end ? 'Ending...' : 'End Session'}
                </button>
              </div>
            </div>

            <div className="stats-grid">
              <div className="stat-tile">
                <span>Total Students</span>
                <strong>{stats?.totalStudents ?? 0}</strong>
              </div>
              <div className="stat-tile">
                <span>Present Students</span>
                <strong>{stats?.presentStudents ?? 0}</strong>
              </div>
              <div className="stat-tile">
                <span>Absent Students</span>
                <strong>{stats?.absentStudents ?? 0}</strong>
              </div>
              <div className="stat-tile warning">
                <span>Suspicious Flags</span>
                <strong>{stats?.suspiciousSubmissions ?? 0}</strong>
              </div>
            </div>

            {sessionDetail?.session ? (
              <div className="summary-block">
                <p>
                  <strong>{sessionDetail.session.subjectName}</strong> · {sessionDetail.session.className}
                </p>
                <p>{sessionDetail.session.active ? 'Session is live.' : 'Session closed.'}</p>
                <p>Starts {formatDateTime(sessionDetail.session.startAt)}</p>
                <p>Ends {formatDateTime(sessionDetail.session.endAt)}</p>
              </div>
            ) : (
              <p className="empty-state">Live stats will appear after you select a session.</p>
            )}
          </article>
        </section>

        <section className="dashboard-grid bottom-grid">
          <article className="glass-card table-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Card 4</p>
                <h2>Live Attendance Table</h2>
              </div>
              <span className="muted-text">
                {loading.detail ? 'Updating now' : 'Polling every 5 seconds'}
              </span>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Roll Number</th>
                    <th>Time Submitted</th>
                    <th>IP Address</th>
                    <th>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td>{record.studentName}</td>
                      <td>{record.rollNumber}</td>
                      <td>{formatDateTime(record.timestamp)}</td>
                      <td>{record.ipAddress}</td>
                      <td>
                        <span className={`risk-badge ${record.suspicious ? 'flagged' : 'clean'}`}>
                          {record.suspicious ? `Flagged (${record.riskScore})` : 'Clean'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!records.length ? (
                    <tr>
                      <td colSpan="5" className="empty-table">
                        No attendance submissions yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>

          <article className="glass-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">AI Review</p>
                <h2>Proxy Detection</h2>
              </div>
              <span className="muted-text">Heuristic risk scoring</span>
            </div>

            <div className="alert-list">
              {suspiciousPatterns.map((item, index) => (
                <div key={`${item.value}-${index}`} className="alert-card">
                  <strong>{item.value}</strong>
                  <p>{item.detail}</p>
                  <span>Risk score: {item.count}</span>
                </div>
              ))}
              {!suspiciousPatterns.length ? (
                <p className="empty-state">No suspicious attendance patterns flagged for the selected session.</p>
              ) : null}
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}

function LoginSection({ apiBase, onAuthenticated }) {
  const [loginForm, setLoginForm] = useState(defaultLoginForm);
  const [registerForm, setRegisterForm] = useState(defaultRegisterForm);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState('info');
  const [loading, setLoading] = useState(false);

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await apiRequest('/api/auth/login', {
        apiBase,
        method: 'POST',
        body: loginForm,
      });
      onAuthenticated(response);
      setMessage('Login successful.');
      setTone('success');
    } catch (error) {
      setMessage(error.message);
      setTone('error');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await apiRequest('/api/auth/register', {
        apiBase,
        method: 'POST',
        body: registerForm,
      });
      setMessage(typeof response === 'string' ? response : 'User registered.');
      setTone('success');
      setRegisterForm(defaultRegisterForm);
    } catch (error) {
      setMessage(error.message);
      setTone('error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="orb orb-a" />
      <div className="orb orb-b" />
      <main className="container">
        <section className="hero-card">
          <div className="hero-topline">Smart QR Attendance</div>
          <h1>Campus-secure attendance with live teacher monitoring.</h1>
          <p className="hero-copy">
            Timed QR sessions, campus network enforcement, duplicate prevention, device fingerprint checks,
            live attendance polling, and suspicious proxy detection are handled from one flow.
          </p>
        </section>

        <StatusMessage message={message} tone={tone} />

        <section className="auth-grid">
          <article className="glass-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Teacher Access</p>
                <h2>Login</h2>
              </div>
              <span className="muted-text">Teacher dashboard</span>
            </div>
            <form className="form-grid" onSubmit={handleLogin}>
              <label>
                Username
                <input
                  value={loginForm.username}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, username: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, password: event.target.value }))
                  }
                  required
                />
              </label>
              <button type="submit" className="primary-button" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </article>

          <article className="glass-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">User Setup</p>
                <h2>Register</h2>
              </div>
              <span className="muted-text">Teacher or student</span>
            </div>
            <form className="form-grid" onSubmit={handleRegister}>
              <label>
                Full Name
                <input
                  value={registerForm.fullName}
                  onChange={(event) =>
                    setRegisterForm((current) => ({ ...current, fullName: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Username
                <input
                  value={registerForm.username}
                  onChange={(event) =>
                    setRegisterForm((current) => ({ ...current, username: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={registerForm.password}
                  onChange={(event) =>
                    setRegisterForm((current) => ({ ...current, password: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Role
                <select
                  value={registerForm.role}
                  onChange={(event) =>
                    setRegisterForm((current) => ({ ...current, role: event.target.value }))
                  }
                >
                  <option value="ROLE_STUDENT">Student</option>
                  <option value="ROLE_TEACHER">Teacher</option>
                </select>
              </label>
              <button type="submit" className="primary-button" disabled={loading}>
                {loading ? 'Saving...' : 'Create Account'}
              </button>
            </form>
          </article>
        </section>
      </main>
    </div>
  );
}

function App() {
  const [apiBase, setApiBase] = useState(resolveInitialApiBase);
  const [token, setToken] = useState(() => readStorage(TOKEN_KEY, ''));
  const [currentUser, setCurrentUser] = useState(() => readStorage(USER_KEY, null));
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!ENV_API_BASE) {
      return;
    }

    if (!apiBase || apiBase.includes('localhost') || apiBase.includes('127.0.0.1')) {
      setApiBase(ENV_API_BASE);
    }
  }, [apiBase]);

  useEffect(() => {
    window.localStorage.setItem(API_BASE_KEY, apiBase);
  }, [apiBase]);

  useEffect(() => {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
    }
  }, [token]);

  useEffect(() => {
    if (currentUser) {
      window.localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
    } else {
      window.localStorage.removeItem(USER_KEY);
    }
  }, [currentUser]);

  useEffect(() => {
    let active = true;

    async function syncAuthenticatedUser() {
      if (!token) {
        if (active) {
          setAuthReady(true);
        }
        return;
      }

      try {
        const response = await apiRequest('/api/auth/me', { apiBase, token });
        if (!active) {
          return;
        }
        setCurrentUser({
          username: response.username,
          fullName: response.fullName,
          role: response.role,
        });
      } catch (error) {
        if (!active) {
          return;
        }
        setToken('');
        setCurrentUser(null);
      } finally {
        if (active) {
          setAuthReady(true);
        }
      }
    }

    setAuthReady(false);
    syncAuthenticatedUser();

    return () => {
      active = false;
    };
  }, [apiBase, token]);

  function handleAuthenticated(response) {
    setToken(response.token || '');
    setCurrentUser({
      username: response.username,
      fullName: response.fullName,
      role: response.role,
    });
  }

  function handleLogout() {
    setToken('');
    setCurrentUser(null);
  }

  const params = new URLSearchParams(window.location.search);
  const view = params.get('page');

  if (view === 'student') {
    return <StudentAttendancePage apiBase={apiBase} />;
  }

  if (!authReady) {
    return (
      <>
        <div className="api-base-ribbon">
          <label htmlFor="api-base">API Base</label>
          <input
            id="api-base"
            value={apiBase}
            onChange={(event) => setApiBase(event.target.value)}
            placeholder={DEFAULT_API_BASE}
          />
        </div>
        <div className="page-shell">
          <main className="container">
            <section className="hero-card">
              <div className="hero-topline">Smart QR Attendance</div>
              <h1>Checking session access.</h1>
            </section>
          </main>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="api-base-ribbon">
        <label htmlFor="api-base">API Base</label>
        <input
          id="api-base"
          value={apiBase}
          onChange={(event) => setApiBase(event.target.value)}
          placeholder={DEFAULT_API_BASE}
        />
      </div>
      {token && currentUser?.role === 'ROLE_TEACHER' ? (
        <TeacherDashboard apiBase={apiBase} token={token} currentUser={currentUser} onLogout={handleLogout} />
      ) : (
        <LoginSection apiBase={apiBase} onAuthenticated={handleAuthenticated} />
      )}
    </>
  );
}

export default App;
