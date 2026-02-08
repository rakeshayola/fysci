import { useState, useEffect } from "react";
import { fetchMarketStatus } from "../api/stocks.js";

function formatTime(date) {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function StatusBar({ selectedSymbols }) {
  const [now, setNow] = useState(new Date());
  const [status, setStatus] = useState(null);

  // Live clock — tick every second
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Fetch market status on mount and every 60s
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchMarketStatus()
        .then((data) => { if (!cancelled) setStatus(data); })
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Filter stock-level data to selected symbols
  const selectedStocks = status
    ? status.stocks.filter((s) => selectedSymbols.includes(s.symbol))
    : [];

  // Compute overall direction for selected stocks
  const totalPct = selectedStocks.reduce((sum, s) => sum + s.change_pct, 0);
  const avgPct = selectedStocks.length > 0 ? totalPct / selectedStocks.length : 0;
  const direction = avgPct >= 0 ? "up" : "down";

  return (
    <div className="status-bar">
      {/* Clock */}
      <div className="status-widget">
        <span className="status-label">Local Time</span>
        <span className="status-value">{formatDate(now)} {formatTime(now)}</span>
      </div>

      {/* Last Scraped */}
      <div className="status-widget">
        <span className="status-label">Data Pulled</span>
        <span className="status-value">
          {status?.last_scraped
            ? new Date(status.last_scraped).toLocaleString("en-US", {
                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
              })
            : "--"}
        </span>
      </div>

      {/* Exchange chips */}
      {status?.exchanges.map((ex) => (
        <div key={ex.name} className="status-widget status-exchange">
          <span className="status-label">{ex.name}</span>
          <span className="status-value">
            <span className={`status-dot ${ex.is_open ? "status-dot--open" : "status-dot--closed"}`} />
            {ex.is_open ? "Open" : "Closed"}
            <span className={`status-arrow ${ex.direction === "up" ? "status-arrow--up" : "status-arrow--down"}`}>
              {ex.direction === "up" ? "\u25B2" : "\u25BC"}
            </span>
            <span className={ex.direction === "up" ? "positive" : "negative"}>
              {ex.avg_change_pct >= 0 ? "+" : ""}{ex.avg_change_pct}%
            </span>
          </span>
        </div>
      ))}

      {/* Overall selected market direction */}
      {selectedStocks.length > 0 && (
        <div className="status-widget status-market-dir">
          <span className="status-label">Selected Avg</span>
          <span className="status-value">
            <span className={`status-arrow-lg ${direction === "up" ? "status-arrow--up" : "status-arrow--down"}`}>
              {direction === "up" ? "\u25B2" : "\u25BC"}
            </span>
            <span className={direction === "up" ? "positive" : "negative"}>
              {avgPct >= 0 ? "+" : ""}{avgPct.toFixed(2)}%
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
