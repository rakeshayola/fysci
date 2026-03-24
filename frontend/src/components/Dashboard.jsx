import { useState, useEffect } from "react";
import Widget from "./Widget.jsx";
import { fetchWidgets, createWidget, deleteWidget } from "../api/stocks.js";

const WIDGET_TEMPLATES = [
  { name: "Historic Close Price", widget_type: "history_chart", width: 3, height: 2 },
  { name: "Volume History", widget_type: "volume_bar_chart", width: 3, height: 2 },
  { name: "Price Table", widget_type: "price_chart", width: 2, height: 2 },
  { name: "Key Metrics", widget_type: "key_metrics", width: 1, height: 1 },
  { name: "Volume Table", widget_type: "volume_chart", width: 1, height: 1 },
];

const TIMEFRAMES = [
  { label: "1W", value: "1w", days: 5 },
  { label: "1M", value: "1m", days: 22 },
  { label: "6M", value: "6m", days: 130 },
  { label: "1Y", value: "1y", days: 252 },
  { label: "5Y", value: "5y", days: 1260 },
];

export default function Dashboard({ selectedSymbols, scraping, onScrape }) {
  const [widgets, setWidgets] = useState([]);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[3]); // default 1Y

  useEffect(() => {
    fetchWidgets()
      .then(setWidgets)
      .catch((err) => console.error(err));
  }, []);

  const handleAddWidget = async (template) => {
    try {
      const widget = await createWidget({ ...template, config: {} });
      setWidgets((prev) => [...prev, widget]);
    } catch (err) {
      console.error(err);
    }
    setShowAddMenu(false);
  };

  const handleRemoveWidget = async (widgetId) => {
    try {
      await deleteWidget(widgetId);
      setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
    } catch (err) {
      console.error(err);
    }
  };

  if (selectedSymbols.length === 0) {
    return (
      <main className="dashboard dashboard--empty">
        <p>Select one or more stocks from the sidebar to view widgets.</p>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <div className="dashboard-toolbar">
        <span className="dashboard-selected">
          Viewing: {selectedSymbols.join(", ")}
        </span>
        <div className="toolbar-actions">
          <div className="timeframe-slider">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                className={`timeframe-btn${timeframe.value === tf.value ? " timeframe-btn--active" : ""}`}
                onClick={() => setTimeframe(tf)}
              >
                {tf.label}
              </button>
            ))}
          </div>
          <button
            className="toolbar-btn"
            onClick={onScrape}
            disabled={scraping}
          >
            {scraping ? "Scraping..." : "Scrape Now"}
          </button>
          <div className="add-widget-wrap">
            <button
              className="toolbar-btn toolbar-btn--primary"
              onClick={() => setShowAddMenu((v) => !v)}
            >
              + Add Widget
            </button>
            {showAddMenu && (
              <ul className="add-widget-menu">
                {WIDGET_TEMPLATES.map((t) => (
                  <li key={t.widget_type}>
                    <button onClick={() => handleAddWidget(t)}>{t.name}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      <div className="widget-grid">
        {widgets.map((widget) => (
          <Widget
            key={widget.id}
            widget={widget}
            selectedSymbols={selectedSymbols}
            timeframe={timeframe}
            onRemove={() => handleRemoveWidget(widget.id)}
          />
        ))}
        {widgets.length === 0 && (
          <p className="no-widgets">
            No widgets configured. Click "+ Add Widget" to get started.
          </p>
        )}
      </div>
    </main>
  );
}
