import { useState, useEffect } from "react";
import Widget from "./Widget.jsx";
import { fetchWidgets } from "../api/stocks.js";

export default function Dashboard({ selectedSymbols }) {
  const [widgets, setWidgets] = useState([]);

  useEffect(() => {
    fetchWidgets()
      .then(setWidgets)
      .catch((err) => console.error(err));
  }, []);

  if (selectedSymbols.length === 0) {
    return (
      <main className="dashboard dashboard--empty">
        <p>Select one or more stocks from the sidebar to view widgets.</p>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <div className="dashboard-header">
        <span className="dashboard-selected">
          Viewing: {selectedSymbols.join(", ")}
        </span>
      </div>
      <div className="widget-grid">
        {widgets.map((widget) => (
          <Widget
            key={widget.id}
            widget={widget}
            selectedSymbols={selectedSymbols}
          />
        ))}
        {widgets.length === 0 && (
          <p className="no-widgets">
            No widgets configured. They will appear here once added.
          </p>
        )}
      </div>
    </main>
  );
}
