import { useState, useEffect } from "react";
import { fetchSettings, runAnalysis, pollAnalysis, fetchAnalysisHistory } from "../api/stocks.js";
import MarkdownRenderer from "./MarkdownRenderer.jsx";

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
  const [isCached, setIsCached] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    fetchSettings()
      .then((data) => setSettings(data))
      .catch(() => {})
      .finally(() => setSettingsLoading(false));
  }, []);

  const loadHistory = async () => {
    try {
      const data = await fetchAnalysisHistory();
      setHistory(data);
    } catch {
      /* ignore */
    }
  };

  const handleRun = async (customQuery) => {
    setRunning(true);
    setError("");
    setResult(null);
    setIsCached(false);
    try {
      const res = await runAnalysis(selectedSymbols, customQuery);
      if (res.status === "completed") {
        const age = Date.now() - new Date(res.created_at).getTime();
        setIsCached(age > 5000);
        setResult(res);
        setRunning(false);
      } else if (res.status === "running") {
        const interval = setInterval(async () => {
          try {
            const updated = await pollAnalysis(res.id);
            if (updated.status === "completed" || updated.status === "failed") {
              clearInterval(interval);
              setResult(updated);
              setRunning(false);
              if (updated.status === "failed") setError(updated.error || "Analysis failed");
            }
          } catch {
            clearInterval(interval);
            setRunning(false);
            setError("Failed to poll analysis status");
          }
        }, 3000);
      } else if (res.status === "failed") {
        setError(res.error || "Analysis failed");
        setRunning(false);
      }
    } catch (err) {
      setError(err.message);
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
        <button
          className="toolbar-btn"
          style={{ marginLeft: "auto" }}
          onClick={() => {
            setShowHistory(!showHistory);
            if (!showHistory) loadHistory();
          }}
        >
          {showHistory ? "Hide History" : "History"}
        </button>
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

        {result && result.status === "completed" && (
          <div className="agent-result">
            <div className="agent-analysis">
              <MarkdownRenderer content={result.analysis} />
            </div>
            <div className="agent-meta">
              {isCached && <span className="cached-badge">Cached</span>}
              Powered by {result.provider} &middot; {result.model} &middot;{" "}
              {new Date(result.created_at).toLocaleString()}
            </div>
          </div>
        )}

        {showHistory && (
          <div className="finance-card" style={{ marginTop: "1rem" }}>
            <h3>Analysis History</h3>
            <div className="finance-card-body">
              {history.length === 0 ? (
                <p style={{ color: "#8b949e", fontSize: "0.85rem" }}>No past analyses.</p>
              ) : (
                <ul className="portfolio-list">
                  {history.map((h) => (
                    <li
                      key={h.id}
                      className="portfolio-item"
                      onClick={() => {
                        setResult(h);
                        setIsCached(true);
                        setError("");
                      }}
                    >
                      <span className="portfolio-name" style={{ fontSize: "0.8rem" }}>
                        {h.symbols} — {h.query ? h.query.slice(0, 50) + (h.query.length > 50 ? "..." : "") : "Full Analysis"}
                      </span>
                      <span className="portfolio-count">
                        {h.status} &middot; {new Date(h.created_at).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
