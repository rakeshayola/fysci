import { useState, useEffect } from "react";
import { fetchSettings, runAgent } from "../api/stocks.js";

const PRESETS = [
  { label: "Full Analysis", query: null },
  {
    label: "Buy / Sell / Hold",
    query:
      "For each stock, give a clear Buy, Sell, or Hold recommendation with reasoning.",
  },
  {
    label: "Risk Assessment",
    query:
      "Assess the risk profile of each stock. Consider volatility, debt levels, sector risks, and news sentiment.",
  },
  {
    label: "Compare Selected",
    query:
      "Compare these stocks against each other. Which is the better investment and why?",
  },
];

export default function AgentPanel({ selectedSymbols }) {
  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSettings()
      .then((data) => setSettings(data))
      .catch(() => {})
      .finally(() => setSettingsLoading(false));
  }, []);

  const handleRun = async (customQuery) => {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const res = await runAgent(selectedSymbols, customQuery);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  if (selectedSymbols.length === 0) {
    return (
      <main className="dashboard dashboard--empty">
        <p>Select one or more stocks from the sidebar to run the research agent.</p>
      </main>
    );
  }

  if (settingsLoading) {
    return (
      <main className="dashboard">
        <p className="widget-loading">Loading...</p>
      </main>
    );
  }

  if (!settings) {
    return (
      <main className="dashboard dashboard--empty">
        <p>
          No LLM provider configured. Go to the{" "}
          <strong>Settings</strong> tab to add your API key.
        </p>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <div className="dashboard-toolbar">
        <span className="dashboard-selected">
          Research Agent: {selectedSymbols.join(", ")}
        </span>
        <span className="provider-badge">{settings.provider}</span>
      </div>

      <div className="agent-panel">
        <div className="agent-presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className="toolbar-btn"
              disabled={running}
              onClick={() => handleRun(p.query)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="agent-query-area">
          <textarea
            className="agent-textarea"
            rows={3}
            placeholder="Or type a custom question about the selected stocks..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className="toolbar-btn toolbar-btn--primary"
            disabled={running || !query.trim()}
            onClick={() => handleRun(query.trim())}
          >
            {running ? "Analyzing..." : "Run Analysis"}
          </button>
        </div>

        {running && (
          <div className="agent-loading">
            <p>Running research agent with {settings.provider} ({settings.model_name || "default"})...</p>
          </div>
        )}

        {error && (
          <div className="agent-error">
            <p>{error}</p>
          </div>
        )}

        {result && (
          <div className="agent-result">
            <pre className="agent-analysis">{result.analysis}</pre>
            <div className="agent-meta">
              Powered by {result.provider} &middot; {result.model} &middot;{" "}
              {new Date(result.timestamp).toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
