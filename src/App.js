import { useCallback, useEffect, useState } from "react";
import "./App.css";

/* ===============================
   API CONFIGURATION
================================ */

const RENDER_API = "https://qr-attendance-backend-x35f.onrender.com";

const ENV_API_BASE = process.env.REACT_APP_API_BASE?.trim();
const DEFAULT_API_BASE = ENV_API_BASE || RENDER_API;

const TOKEN_KEY = "attendance-token";
const USER_KEY = "attendance-user";
const API_BASE_KEY = "attendance-api-base";

/* ===============================
   DEFAULT FORMS
================================ */

const defaultLoginForm = { username: "", password: "" };

const defaultRegisterForm = {
  username: "",
  password: "",
  fullName: "",
  role: "ROLE_STUDENT",
};

const defaultSessionForm = {
  subjectName: "",
  className: "",
  totalStudents: 60,
  startAt: "",
  durationMinutes: 30,
};

const defaultStudentForm = {
  studentName: "",
  rollNumber: "",
};

/* ===============================
   STORAGE HELPERS
================================ */

function readStorage(key, fallback) {
  const value = window.localStorage.getItem(key);

  if (!value) return fallback;

  if (key === USER_KEY) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  return value;
}

function resolveInitialApiBase() {
  const stored = readStorage(API_BASE_KEY, "");

  if (!stored) return DEFAULT_API_BASE;

  return stored;
}

/* ===============================
   DATE HELPERS
================================ */

function formatDateTime(value) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}

function toIsoString(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

/* ===============================
   API REQUEST
================================ */

async function apiRequest(path, { apiBase, token, method = "GET", body } = {}) {
  let response;

  try {
    response = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    throw new Error(
      `Cannot reach backend: ${apiBase}. Render server may be sleeping.`
    );
  }

  const contentType = response.headers.get("content-type") || "";

  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!response.ok) {
    const message =
      typeof payload === "string"
        ? payload
        : payload?.message || payload?.error || "Request failed";

    throw new Error(`${response.status}: ${message}`);
  }

  return payload;
}

/* ===============================
   DEVICE FINGERPRINT
================================ */

async function createDeviceFingerprint() {
  const raw = [
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    new Date().getTimezoneOffset(),
    window.screen.width,
    window.screen.height,
    navigator.hardwareConcurrency || "na",
  ].join("|");

  if (!window.crypto?.subtle) return raw;

  const digest = await window.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw)
  );

  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ===============================
   UI COMPONENTS
================================ */

function StatusMessage({ message, tone = "info" }) {
  if (!message) return null;

  return <p className={`status-banner ${tone}`}>{message}</p>;
}

/* ===============================
   LOGIN + REGISTER PAGE
================================ */

function LoginSection({ apiBase, onAuthenticated }) {
  const [loginForm, setLoginForm] = useState(defaultLoginForm);
  const [registerForm, setRegisterForm] = useState(defaultRegisterForm);

  const [message, setMessage] = useState("");
  const [tone, setTone] = useState("info");

  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      const response = await apiRequest("/api/auth/login", {
        apiBase,
        method: "POST",
        body: loginForm,
      });

      onAuthenticated(response);

      setMessage("Login successful");
      setTone("success");
    } catch (error) {
      setMessage(error.message);
      setTone("error");
    }

    setLoading(false);
  }

  async function handleRegister(e) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      const response = await apiRequest("/api/auth/register", {
        apiBase,
        method: "POST",
        body: registerForm,
      });

      setMessage(typeof response === "string" ? response : "User registered");
      setTone("success");

      setRegisterForm(defaultRegisterForm);
    } catch (error) {
      setMessage(error.message);
      setTone("error");
    }

    setLoading(false);
  }

  return (
    <div className="container">
      <h1>Smart QR Attendance</h1>

      <StatusMessage message={message} tone={tone} />

      <div className="auth-grid">
        <form onSubmit={handleLogin}>
          <h2>Teacher Login</h2>

          <input
            placeholder="Username"
            value={loginForm.username}
            onChange={(e) =>
              setLoginForm((c) => ({ ...c, username: e.target.value }))
            }
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={loginForm.password}
            onChange={(e) =>
              setLoginForm((c) => ({ ...c, password: e.target.value }))
            }
            required
          />

          <button disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <form onSubmit={handleRegister}>
          <h2>Register</h2>

          <input
            placeholder="Full Name"
            value={registerForm.fullName}
            onChange={(e) =>
              setRegisterForm((c) => ({ ...c, fullName: e.target.value }))
            }
            required
          />

          <input
            placeholder="Username"
            value={registerForm.username}
            onChange={(e) =>
              setRegisterForm((c) => ({ ...c, username: e.target.value }))
            }
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={registerForm.password}
            onChange={(e) =>
              setRegisterForm((c) => ({ ...c, password: e.target.value }))
            }
            required
          />

          <select
            value={registerForm.role}
            onChange={(e) =>
              setRegisterForm((c) => ({ ...c, role: e.target.value }))
            }
          >
            <option value="ROLE_STUDENT">Student</option>
            <option value="ROLE_TEACHER">Teacher</option>
          </select>

          <button disabled={loading}>
            {loading ? "Creating..." : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ===============================
   MAIN APP
================================ */

function App() {
  const [apiBase, setApiBase] = useState(resolveInitialApiBase);

  const [token, setToken] = useState(() => readStorage(TOKEN_KEY, ""));
  const [currentUser, setCurrentUser] = useState(() =>
    readStorage(USER_KEY, null)
  );

  useEffect(() => {
    window.localStorage.setItem(API_BASE_KEY, apiBase);
  }, [apiBase]);

  useEffect(() => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }, [token]);

  useEffect(() => {
    if (currentUser)
      localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
    else localStorage.removeItem(USER_KEY);
  }, [currentUser]);

  function handleAuthenticated(res) {
    setToken(res.token);

    setCurrentUser({
      username: res.username,
      fullName: res.fullName,
      role: res.role,
    });
  }

  function logout() {
    setToken("");
    setCurrentUser(null);
  }

  return (
    <>
      <div className="api-base-ribbon">
        <label>API Base</label>

        <input
          value={apiBase}
          onChange={(e) => setApiBase(e.target.value)}
        />
      </div>

      {!token ? (
        <LoginSection apiBase={apiBase} onAuthenticated={handleAuthenticated} />
      ) : (
        <div className="container">
          <h2>Welcome {currentUser.fullName}</h2>
          <button onClick={logout}>Logout</button>
        </div>
      )}
    </>
  );
}

export default App;