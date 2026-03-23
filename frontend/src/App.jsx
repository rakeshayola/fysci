import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import LoginPage from "./components/LoginPage.jsx";
import StockSidebar from "./components/StockSidebar.jsx";
import Dashboard from "./components/Dashboard.jsx";
import FinancesPanel from "./components/FinancesPanel.jsx";
import NewsPanel from "./components/NewsPanel.jsx";
import AgentPanel from "./components/AgentPanel.jsx";
import SettingsPanel from "./components/SettingsPanel.jsx";
import PortfolioManager from "./components/PortfolioManager.jsx";
import StatusBar from "./components/StatusBar.jsx";
import { fetchStocks } from "./api/stocks.js";
import "./App.css";

function AppContent() {
  const { user, loading: authLoading, logout } = useAuth();
  const [stocks, setStocks] = useState([]);
  const [selectedSymbols, setSelectedSymbols] = useState([]);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchStocks()
      .then((data) => {
        setStocks(data);
        if (data.length > 0) {
          setSelectedSymbols([data[0].symbol]);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [user]);

  const toggleStock = (symbol) => {
    setSelectedSymbols((prev) =>
      prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol]
    );
  };

  if (authLoading) {
    return <div className="app-loading">Loading...</div>;
  }

  if (!user) {
    return <LoginPage />;
  }

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
          <button
            className={`tab-btn ${activeTab === "news" ? "tab-btn--active" : ""}`}
            onClick={() => setActiveTab("news")}
          >
            News
          </button>
          <button
            className={`tab-btn ${activeTab === "agent" ? "tab-btn--active" : ""}`}
            onClick={() => setActiveTab("agent")}
          >
            Agent
          </button>
          <button
            className={`tab-btn ${activeTab === "portfolio" ? "tab-btn--active" : ""}`}
            onClick={() => setActiveTab("portfolio")}
          >
            Portfolio
          </button>
          <button
            className={`tab-btn ${activeTab === "settings" ? "tab-btn--active" : ""}`}
            onClick={() => setActiveTab("settings")}
          >
            Settings
          </button>
        </nav>
        <div className="header-user">
          <span className="header-username">{user.username}</span>
          <button className="toolbar-btn" onClick={logout}>
            Logout
          </button>
        </div>
      </header>
      <div className="app-body">
        <StockSidebar
          stocks={stocks}
          selectedSymbols={selectedSymbols}
          onToggle={toggleStock}
        />
        {activeTab === "dashboard" && <Dashboard selectedSymbols={selectedSymbols} />}
        {activeTab === "finances" && <FinancesPanel selectedSymbols={selectedSymbols} />}
        {activeTab === "news" && <NewsPanel selectedSymbols={selectedSymbols} />}
        {activeTab === "agent" && <AgentPanel selectedSymbols={selectedSymbols} />}
        {activeTab === "portfolio" && <PortfolioManager />}
        {activeTab === "settings" && <SettingsPanel />}
      </div>
      <StatusBar selectedSymbols={selectedSymbols} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
