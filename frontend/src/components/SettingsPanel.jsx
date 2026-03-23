import { useState, useEffect } from "react";
import { fetchSettings, saveSettings, deleteSettings } from "../api/stocks.js";

const DEFAULT_MODELS = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-20250514",
  gemini: "gemini-2.0-flash",
};

export default function SettingsPanel({ onSettingsSaved }) {
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState("");

  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [modelName, setModelName] = useState(DEFAULT_MODELS.openai);

  useEffect(() => {
    fetchSettings()
      .then((data) => setCurrent(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleProviderChange = (e) => {
    const p = e.target.value;
    setProvider(p);
    setModelName(DEFAULT_MODELS[p] || "");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setSaving(true);
    setMsg("");
    try {
      const result = await saveSettings({
        provider,
        api_key: apiKey.trim(),
        model_name: modelName.trim() || null,
      });
      setCurrent(result);
      setApiKey("");
      setMsg("Settings saved successfully");
      onSettingsSaved?.();
    } catch (err) {
      setMsg("Failed to save settings");
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 4000);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setMsg("");
    try {
      await deleteSettings();
      setCurrent(null);
      setMsg("Settings deleted");
      onSettingsSaved?.();
    } catch {
      setMsg("Failed to delete settings");
    } finally {
      setDeleting(false);
      setTimeout(() => setMsg(""), 4000);
    }
  };

  if (loading) {
    return (
      <main className="dashboard">
        <p className="widget-loading">Loading settings...</p>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <div className="dashboard-toolbar">
        <span className="dashboard-selected">LLM API Settings</span>
        {msg && <span className="toolbar-msg">{msg}</span>}
      </div>

      {current && (
        <div className="finance-card" style={{ marginBottom: "1rem" }}>
          <h3>Active Provider</h3>
          <div className="finance-card-body">
            <div className="settings-current">
              <span className="provider-badge">{current.provider}</span>
              <span className="settings-model">{current.model_name || "default"}</span>
              <span className="settings-key-masked">Key: {current.api_key_masked}</span>
              <button
                className="toolbar-btn"
                onClick={handleDelete}
                disabled={deleting}
                style={{ marginLeft: "auto" }}
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="finance-card">
        <h3>{current ? "Update Provider" : "Configure LLM Provider"}</h3>
        <div className="finance-card-body">
          <form className="settings-form" onSubmit={handleSave}>
            <div className="settings-field">
              <label>Provider</label>
              <select value={provider} onChange={handleProviderChange}>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="gemini">Google Gemini</option>
              </select>
            </div>
            <div className="settings-field">
              <label>API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key"
                required
              />
            </div>
            <div className="settings-field">
              <label>Model</label>
              <input
                type="text"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="Model name (optional)"
              />
            </div>
            <button
              type="submit"
              className="toolbar-btn toolbar-btn--primary"
              disabled={saving || !apiKey.trim()}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
