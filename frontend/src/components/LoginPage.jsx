import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { resetPassword } from "../api/stocks.js";

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "register" | "reset"
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (m) => {
    setMode(m);
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (mode === "register" && password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    if (mode === "reset" && password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else if (mode === "register") {
        await register(email, username, password);
      } else {
        await resetPassword(email, resetToken, password);
        setSuccess("Password reset successfully. You can now sign in.");
        setPassword("");
        setConfirm("");
        setResetToken("");
        setMode("login");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Stock Dashboard</h1>
        <div className="login-tabs">
          <button
            className={`login-tab ${mode === "login" ? "login-tab--active" : ""}`}
            onClick={() => switchMode("login")}
          >
            Login
          </button>
          <button
            className={`login-tab ${mode === "register" ? "login-tab--active" : ""}`}
            onClick={() => switchMode("register")}
          >
            Register
          </button>
          <button
            className={`login-tab ${mode === "reset" ? "login-tab--active" : ""}`}
            onClick={() => switchMode("reset")}
          >
            Reset Password
          </button>
        </div>

        {mode === "reset" && (
          <p className="login-hint">
            Ask your admin to generate a reset token for your account, then enter it below.
          </p>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="settings-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {mode === "register" && (
            <div className="settings-field">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          )}

          {mode === "reset" && (
            <div className="settings-field">
              <label>Reset Token</label>
              <input
                type="text"
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                placeholder="Paste token from admin"
                required
              />
            </div>
          )}

          <div className="settings-field">
            <label>{mode === "reset" ? "New Password" : "Password"}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {(mode === "register" || mode === "reset") && (
            <div className="settings-field">
              <label>Confirm Password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
          )}

          {error && <div className="login-error">{error}</div>}
          {success && <div className="login-success">{success}</div>}

          <button
            type="submit"
            className="toolbar-btn toolbar-btn--primary login-submit"
            disabled={submitting}
          >
            {submitting
              ? "Please wait..."
              : mode === "login"
              ? "Sign In"
              : mode === "register"
              ? "Create Account"
              : "Reset Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
