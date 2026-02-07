import { useState, useEffect } from "react";
import StockSidebar from "./components/StockSidebar.jsx";
import Dashboard from "./components/Dashboard.jsx";
import { fetchStocks } from "./api/stocks.js";

export default function App() {
  const [stocks, setStocks] = useState([]);
  const [selectedSymbols, setSelectedSymbols] = useState([]);
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
      </header>
      <div className="app-body">
        <StockSidebar
          stocks={stocks}
          selectedSymbols={selectedSymbols}
          onToggle={toggleStock}
        />
        <Dashboard selectedSymbols={selectedSymbols} />
      </div>
    </div>
  );
}
