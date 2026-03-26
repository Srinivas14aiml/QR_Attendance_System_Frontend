// 🔥 FULLY FIXED VERSION (FRONTEND SYNCED WITH BACKEND)

import { useCallback, useEffect, useState } from 'react';
import './App.css';

const ENV_API_BASE = process.env.REACT_APP_API_BASE?.trim();
const LOCAL_API_BASE = 'https://qr-attendance-backend-x35f.onrender.com';
const DEFAULT_API_BASE = ENV_API_BASE || LOCAL_API_BASE;

const defaultSessionForm = {
  subjectName: '',
  className: '',
  totalStudents: 60,
  startAt: '',
  durationMinutes: 30,
};

// ================= COMMON API =================
async function apiRequest(path, { apiBase, token, method = 'GET', body } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status}: ${text}`);
  }

  return response.json();
}

// ================= TEACHER DASHBOARD =================
function TeacherDashboard({ apiBase, token }) {
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [sessionDetail, setSessionDetail] = useState(null);
  const [qrData, setQrData] = useState(null);
  const [sessionForm, setSessionForm] = useState(defaultSessionForm);
  const [loading, setLoading] = useState(false);

  // ✅ LOAD ALL SESSIONS
  const loadSessions = useCallback(async () => {
    const res = await apiRequest('/api/sessions', { apiBase, token });
    setSessions(res);
  }, [apiBase, token]);

  // ✅ LOAD ATTENDANCE
  const loadSessionAttendance = useCallback(async (id) => {
    const res = await apiRequest(`/api/sessions/${id}/attendance`, { apiBase, token });
    setSessionDetail(res);
  }, [apiBase, token]);

  // ✅ CREATE SESSION
  async function handleCreateSession(e) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await apiRequest('/api/sessions', {
        apiBase,
        token,
        method: 'POST',
        body: {
          subjectName: sessionForm.subjectName,
          className: sessionForm.className,
          totalStudents: sessionForm.totalStudents,
          startAt: new Date(sessionForm.startAt).toISOString(),
          durationMinutes: sessionForm.durationMinutes,
        },
      });

      setSelectedSessionId(res.id);
      await loadSessions();
      await loadQr(res.id);
      await loadSessionAttendance(res.id);

    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ✅ LOAD QR
  async function loadQr(id = selectedSessionId) {
    const res = await apiRequest(`/api/sessions/${id}/qr`, { apiBase, token });
    setQrData(res);
  }

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (selectedSessionId) {
      loadSessionAttendance(selectedSessionId);
    }
  }, [selectedSessionId]);

  return (
    <div>
      <h1>Teacher Dashboard</h1>

      {/* CREATE SESSION */}
      <form onSubmit={handleCreateSession}>
        <input placeholder="Subject" onChange={e => setSessionForm({...sessionForm, subjectName: e.target.value})}/>
        <input placeholder="Class" onChange={e => setSessionForm({...sessionForm, className: e.target.value})}/>
        <input type="datetime-local" onChange={e => setSessionForm({...sessionForm, startAt: e.target.value})}/>
        <input type="number" onChange={e => setSessionForm({...sessionForm, durationMinutes: e.target.value})}/>
        <button disabled={loading}>Create</button>
      </form>

      {/* SESSION SELECT */}
      <select onChange={e => setSelectedSessionId(e.target.value)}>
        <option>Select</option>
        {sessions.map(s => (
          <option key={s.id} value={s.id}>{s.subjectName}</option>
        ))}
      </select>

      {/* QR */}
      <button onClick={() => loadQr()}>Generate QR</button>
      {qrData && <img src={`data:image/png;base64,${qrData.qrBase64}`} width="200"/>}

      {/* ATTENDANCE */}
      {sessionDetail && (
        <div>
          <h3>Present: {sessionDetail.stats.presentStudents}</h3>
          <h3>Absent: {sessionDetail.stats.absentStudents}</h3>
        </div>
      )}
    </div>
  );
}

// ================= APP =================
function App() {
  const [apiBase] = useState(DEFAULT_API_BASE);
  const [token] = useState('');

  return (
    <TeacherDashboard apiBase={apiBase} token={token} />
  );
}

export default App;
