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
import AdminPanel from "./components/AdminPanel.jsx";
import StatusBar from "./components/StatusBar.jsx";
import { fetchStocks, fetchPortfolios, triggerScrapeStream } from "./api/stocks.js";
import "./App.css";

function AppContent() {
  const { user, loading: authLoading, logout } = useAuth();
  const [stocks, setStocks] = useState([]);
  const [portfolios, setPortfolios] = useState([]);
  const [selectedSymbols, setSelectedSymbols] = useState([]);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState(null); // { phase, message, symbol, current, total }

  const handleScrape = async () => {
    if (scraping) return;
    setScraping(true);
    setScrapeStatus({ phase: "start", message: "Starting scrape..." });
    try {
      await triggerScrapeStream((event) => {
        setScrapeStatus(event);
      });
    } catch {
      setScrapeStatus({ phase: "error", message: "Scrape failed" });
    } finally {
      setScraping(false);
      // Clear after 6 seconds
      setTimeout(() => setScrapeStatus(null), 6000);
    }
  };

  const loadData = () => {
    if (!user) return;
    Promise.all([
      fetchStocks().catch(() => []),
      fetchPortfolios().catch(() => []),
    ])
      .then(([stockData, portfolioData]) => {
        setStocks(stockData);
        setPortfolios(portfolioData);
        // Auto-select portfolio holding symbols, fallback to first stock
        const holdingSymbols = [
          ...new Set(
            portfolioData.flatMap((p) =>
              (p.holdings || []).map((h) => h.symbol).filter(Boolean)
            )
          ),
        ];
        if (holdingSymbols.length > 0) {
          setSelectedSymbols(holdingSymbols);
        } else if (stockData.length > 0) {
          setSelectedSymbols([stockData[0].symbol]);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
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
          {user.is_admin && (
            <button
              className={`tab-btn tab-btn--admin ${activeTab === "admin" ? "tab-btn--active" : ""}`}
              onClick={() => setActiveTab("admin")}
            >
              Admin
            </button>
          )}
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
          portfolios={portfolios}
          selectedSymbols={selectedSymbols}
          onToggle={toggleStock}
        />
        {activeTab === "dashboard" && <Dashboard selectedSymbols={selectedSymbols} scraping={scraping} onScrape={handleScrape} />}
        {activeTab === "finances" && <FinancesPanel selectedSymbols={selectedSymbols} scraping={scraping} onScrape={handleScrape} />}
        {activeTab === "news" && <NewsPanel selectedSymbols={selectedSymbols} />}
        {activeTab === "agent" && <AgentPanel selectedSymbols={selectedSymbols} />}
        {activeTab === "portfolio" && <PortfolioManager onChanged={loadData} />}
        {activeTab === "settings" && <SettingsPanel />}
        {activeTab === "admin" && user.is_admin && <AdminPanel />}
      </div>
      <StatusBar selectedSymbols={selectedSymbols} scrapeStatus={scrapeStatus} />
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
