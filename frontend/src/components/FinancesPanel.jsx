import { useState, useEffect } from "react";
import { fetchFinancials } from "../api/stocks.js";

function fmt(value, type) {
  if (value == null) return "N/A";
  if (type === "money") {
    const abs = Math.abs(value);
    if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toLocaleString()}`;
  }
  if (type === "number") return value.toLocaleString();
  if (type === "ratio") return value.toFixed(2);
  return String(value);
}

export default function FinancesPanel({ selectedSymbols, scraping, onScrape }) {
  const [financials, setFinancials] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (selectedSymbols.length === 0) {
      setFinancials({});
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all(
      selectedSymbols.map((symbol) =>
        fetchFinancials(symbol).then((data) => ({ symbol, data }))
      )
    )
      .then((results) => {
        const bySymbol = {};
        results.forEach(({ symbol, data }) => {
          bySymbol[symbol] = data;
        });
        setFinancials(bySymbol);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [selectedSymbols]);

  // Re-fetch financials after scrape completes
  useEffect(() => {
    if (scraping === false && selectedSymbols.length > 0) {
      Promise.all(
        selectedSymbols.map((symbol) =>
          fetchFinancials(symbol).then((data) => ({ symbol, data }))
        )
      ).then((results) => {
        const bySymbol = {};
        results.forEach(({ symbol, data }) => {
          bySymbol[symbol] = data;
        });
        setFinancials(bySymbol);
      }).catch(() => {});
    }
  }, [scraping]);

  if (selectedSymbols.length === 0) {
    return (
      <main className="dashboard dashboard--empty">
        <p>Select one or more stocks from the sidebar to view financials.</p>
      </main>
    );
  }

  const hasAnyData = Object.values(financials).some((d) => d !== null);

  return (
    <main className="dashboard">
      <div className="dashboard-toolbar">
        <span className="dashboard-selected">
          Finances: {selectedSymbols.join(", ")}
        </span>
        <div className="toolbar-actions">
          <button
            className="toolbar-btn"
            onClick={onScrape}
            disabled={scraping}
          >
            {scraping ? "Scraping..." : "Scrape Now"}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="widget-loading">Loading financial data...</p>
      ) : !hasAnyData ? (
        <div className="finances-empty">
          <p>No financial data available yet.</p>
          <p>Click "Scrape Now" to fetch data from Yahoo Finance.</p>
        </div>
      ) : (
        <div className="finances-grid">
          {/* P/E Ratio Card */}
          <div className="finance-card">
            <h3>Price / Earnings Ratio</h3>
            <div className="finance-card-body">
              {selectedSymbols.map((sym) => {
                const d = financials[sym];
                return (
                  <div key={sym} className="finance-row">
                    <span className="finance-symbol">{sym}</span>
                    <div className="finance-values">
                      <div>
                        <span className="finance-label">Trailing P/E</span>
                        <span className="finance-value">{fmt(d?.pe_ratio, "ratio")}</span>
                      </div>
                      <div>
                        <span className="finance-label">Forward P/E</span>
                        <span className="finance-value">{fmt(d?.forward_pe, "ratio")}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CAPEX & OPEX Card */}
          <div className="finance-card">
            <h3>CAPEX & OPEX</h3>
            <div className="finance-card-body">
              {selectedSymbols.map((sym) => {
                const d = financials[sym];
                return (
                  <div key={sym} className="finance-row">
                    <span className="finance-symbol">{sym}</span>
                    <div className="finance-values">
                      <div>
                        <span className="finance-label">Capital Expenditure</span>
                        <span className="finance-value">{fmt(d?.capital_expenditure, "money")}</span>
                      </div>
                      <div>
                        <span className="finance-label">Operating Expense</span>
                        <span className="finance-value">{fmt(d?.operating_expense, "money")}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Debt Card */}
          <div className="finance-card">
            <h3>Debt & Revenue</h3>
            <div className="finance-card-body">
              {selectedSymbols.map((sym) => {
                const d = financials[sym];
                return (
                  <div key={sym} className="finance-row">
                    <span className="finance-symbol">{sym}</span>
                    <div className="finance-values">
                      <div>
                        <span className="finance-label">Total Debt</span>
                        <span className="finance-value">{fmt(d?.total_debt, "money")}</span>
                      </div>
                      <div>
                        <span className="finance-label">Total Revenue</span>
                        <span className="finance-value">{fmt(d?.total_revenue, "money")}</span>
                      </div>
                      <div>
                        <span className="finance-label">Market Cap</span>
                        <span className="finance-value">{fmt(d?.market_cap, "money")}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Employees Card */}
          <div className="finance-card">
            <h3>Employees & Earnings</h3>
            <div className="finance-card-body">
              {selectedSymbols.map((sym) => {
                const d = financials[sym];
                const revenuePerEmp =
                  d?.total_revenue && d?.num_employees
                    ? d.total_revenue / d.num_employees
                    : null;
                const medianSalaryEst =
                  d?.operating_expense && d?.num_employees
                    ? Math.round((d.operating_expense * 0.7) / d.num_employees)
                    : null;
                return (
                  <div key={sym} className="finance-row">
                    <span className="finance-symbol">{sym}</span>
                    <div className="finance-values">
                      <div>
                        <span className="finance-label">Employees</span>
                        <span className="finance-value">{fmt(d?.num_employees, "number")}</span>
                      </div>
                      <div>
                        <span className="finance-label">EPS</span>
                        <span className="finance-value">{fmt(d?.earnings_per_share, "ratio")}</span>
                      </div>
                      <div>
                        <span className="finance-label">Revenue / Employee</span>
                        <span className="finance-value">{fmt(revenuePerEmp, "money")}</span>
                      </div>
                      <div>
                        <span className="finance-label">Est. Median Salary</span>
                        <span className="finance-value">{fmt(medianSalaryEst, "money")}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
