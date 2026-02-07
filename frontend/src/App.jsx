import { useState, useEffect } from "react";
import StockSidebar from "./components/StockSidebar.jsx";
import Dashboard from "./components/Dashboard.jsx";
import FinancesPanel from "./components/FinancesPanel.jsx";
import { fetchStocks } from "./api/stocks.js";
import "./App.css";

export default function App() {
  const [stocks, setStocks] = useState([]);
  const [selectedSymbols, setSelectedSymbols] = useState([]);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStocks()
      .then((data) => {
        setStocks(data);
        if (data.length > 0) {
          setSelectedSymbols([data[0].symbol]);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const toggleStock = (symbol) => {
    setSelectedSymbols((prev) =>
      prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol]
    );
  };

  if (loading) {
    return <div className="app-loading">Loading...</div>;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Stock Dashboard</h1>
        <nav className="app-tabs">
          <button
            className={`tab-btn ${activeTab === "dashboard" ? "tab-btn--active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={`tab-btn ${activeTab === "finances" ? "tab-btn--active" : ""}`}
            onClick={() => setActiveTab("finances")}
          >
            Finances
          </button>
        </nav>
      </header>
      <div className="app-body">
        <StockSidebar
          stocks={stocks}
          selectedSymbols={selectedSymbols}
          onToggle={toggleStock}
        />
        {activeTab === "dashboard" ? (
          <Dashboard selectedSymbols={selectedSymbols} />
        ) : (
          <FinancesPanel selectedSymbols={selectedSymbols} />
        )}
      </div>
    </div>
  );
}
