import { useState, useEffect } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  fetchPortfolios,
  createPortfolio,
  deletePortfolio,
  addHolding,
  removeHolding,
  uploadHoldings,
  fetchPortfolioSummary,
  fetchSectorAnalysis,
} from "../api/stocks.js";

const SECTOR_COLORS = [
  "#58a6ff", "#3fb950", "#d2a8ff", "#f0883e", "#f85149",
  "#79c0ff", "#56d364", "#e3b341", "#ff7b72", "#8b949e",
  "#db61a2", "#7ee787", "#a5d6ff", "#ffa657", "#d73a49",
];

function formatCurrency(val) {
  if (val == null) return "—";
  return val < 0
    ? `-$${Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function GainBadge({ value, pct }) {
  if (value == null) return <span style={{ color: "#8b949e" }}>—</span>;
  const color = value >= 0 ? "#3fb950" : "#f85149";
  const sign = value >= 0 ? "+" : "";
  return (
    <span style={{ color, fontWeight: 600 }}>
      {sign}{formatCurrency(value)}
      {pct != null && (
        <span style={{ fontSize: "0.78rem", marginLeft: 4, opacity: 0.85 }}>
          ({sign}{pct.toFixed(2)}%)
        </span>
      )}
    </span>
  );
}

export default function PortfolioManager({ onChanged }) {
  const [portfolios, setPortfolios] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Create form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Add holding form
  const [holdSymbol, setHoldSymbol] = useState("");
  const [holdShares, setHoldShares] = useState("");
  const [holdCost, setHoldCost] = useState("");
  const [addingHold, setAddingHold] = useState(false);

  // Upload
  const [uploadFile, setUploadFile] = useState(null);
  const [symbolCol, setSymbolCol] = useState("symbol");
  const [sharesCol, setSharesCol] = useState("shares");
  const [avgCostCol, setAvgCostCol] = useState("avg_cost");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  // Sector analysis
  const [sectorAnalysis, setSectorAnalysis] = useState(null);
  const [sectorLoading, setSectorLoading] = useState(false);

  const [msg, setMsg] = useState("");

  const reload = async () => {
    try {
      const data = await fetchPortfolios();
      setPortfolios(data);
      if (selected) {
        const updated = data.find((p) => p.id === selected.id);
        setSelected(updated || null);
      }
    } catch {
      /* ignore */
    }
  };

  const loadSummary = async (portfolioId) => {
    setSummaryLoading(true);
    try {
      const data = await fetchPortfolioSummary(portfolioId);
      setSummary(data);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    fetchPortfolios()
      .then((data) => setPortfolios(data))
      .catch((err) => setMsg(err.message || "Failed to load portfolios"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selected) {
      loadSummary(selected.id);
    } else {
      setSummary(null);
    }
  }, [selected]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const p = await createPortfolio({ name: newName.trim(), description: newDesc.trim() || null });
      setPortfolios((prev) => [p, ...prev]);
      setSelected(p);
      setNewName("");
      setNewDesc("");
      setMsg("Portfolio created");
      onChanged?.();
    } catch (err) {
      setMsg(err.message || "Failed to create portfolio");
    } finally {
      setCreating(false);
      setTimeout(() => setMsg(""), 3000);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    try {
      await deletePortfolio(selected.id);
      setPortfolios((prev) => prev.filter((p) => p.id !== selected.id));
      setSelected(null);
      setMsg("Portfolio deleted");
      onChanged?.();
    } catch (err) {
      setMsg(err.message || "Failed to delete");
    }
    setTimeout(() => setMsg(""), 3000);
  };

  const handleAddHolding = async (e) => {
    e.preventDefault();
    if (!selected || !holdSymbol.trim() || !holdShares) return;
    setAddingHold(true);
    try {
      await addHolding(selected.id, {
        symbol: holdSymbol.trim(),
        shares: parseFloat(holdShares),
        avg_cost: holdCost ? parseFloat(holdCost) : null,
      });
      await reload();
      setHoldSymbol("");
      setHoldShares("");
      setHoldCost("");
      onChanged?.();
      loadSummary(selected.id);
    } catch (err) {
      setMsg(err.message);
      setTimeout(() => setMsg(""), 3000);
    } finally {
      setAddingHold(false);
    }
  };

  const handleRemoveHolding = async (holdingId) => {
    if (!selected) return;
    try {
      await removeHolding(selected.id, holdingId);
      await reload();
      onChanged?.();
      loadSummary(selected.id);
    } catch {
      setMsg("Failed to remove holding");
      setTimeout(() => setMsg(""), 3000);
    }
  };

  const handleUpload = async () => {
    if (!selected || !uploadFile) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const result = await uploadHoldings(selected.id, uploadFile, {
        symbol_col: symbolCol,
        shares_col: sharesCol,
        avg_cost_col: avgCostCol,
      });
      setUploadResult(result);
      await reload();
      setUploadFile(null);
      onChanged?.();
      loadSummary(selected.id);
    } catch {
      setMsg("Upload failed");
      setTimeout(() => setMsg(""), 3000);
    } finally {
      setUploading(false);
    }
  };

  const handleSectorAnalysis = async () => {
    if (!selected) return;
    setSectorLoading(true);
    setSectorAnalysis(null);
    try {
      const data = await fetchSectorAnalysis(selected.id);
      setSectorAnalysis(data);
    } catch (err) {
      setMsg(err.message || "Sector analysis failed");
      setTimeout(() => setMsg(""), 4000);
    } finally {
      setSectorLoading(false);
    }
  };

  // Reset sector analysis when portfolio changes
  useEffect(() => {
    setSectorAnalysis(null);
  }, [selected]);

  // Check if any holding is an ETF
  const hasEtf = summary?.holdings?.some((h) => h.is_etf) || false;

  if (loading) {
    return (
      <main className="dashboard">
        <p className="widget-loading">Loading portfolios...</p>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <div className="dashboard-toolbar">
        <span className="dashboard-selected">Portfolio Manager</span>
        {msg && <span className="toolbar-msg">{msg}</span>}
      </div>

      {/* Create + Select */}
      <div className="finances-grid">
        <div className="finance-card">
          <h3>Create Portfolio</h3>
          <div className="finance-card-body">
            <form className="settings-form" onSubmit={handleCreate}>
              <div className="settings-field">
                <label>Name</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} required />
              </div>
              <div className="settings-field">
                <label>Description</label>
                <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
              </div>
              <button type="submit" className="toolbar-btn toolbar-btn--primary" disabled={creating}>
                {creating ? "Creating..." : "Create"}
              </button>
            </form>
          </div>
        </div>

        <div className="finance-card">
          <h3>Your Portfolios</h3>
          <div className="finance-card-body">
            {portfolios.length === 0 ? (
              <p style={{ color: "#8b949e", fontSize: "0.85rem" }}>No portfolios yet.</p>
            ) : (
              <ul className="portfolio-list">
                {portfolios.map((p) => (
                  <li
                    key={p.id}
                    className={`portfolio-item ${selected?.id === p.id ? "portfolio-item--active" : ""}`}
                    onClick={() => setSelected(p)}
                  >
                    <span className="portfolio-name">{p.name}</span>
                    <span className="portfolio-count">{p.holdings?.length || 0} holdings</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Selected portfolio details */}
      {selected && (
        <>
          {/* Net Worth / Gains Summary */}
          {summary && (
            <div className="finances-grid" style={{ marginTop: "1rem" }}>
              <div className="finance-card">
                <h3>Net Worth</h3>
                <div className="finance-card-body" style={{ textAlign: "center" }}>
                  <div className="portfolio-networth">{formatCurrency(summary.net_worth)}</div>
                  <div style={{ fontSize: "0.8rem", color: "#8b949e", marginTop: 4 }}>
                    Cost Basis: {formatCurrency(summary.total_cost)}
                  </div>
                </div>
              </div>
              <div className="finance-card">
                <h3>Total Gain / Loss</h3>
                <div className="finance-card-body" style={{ textAlign: "center" }}>
                  <div className="portfolio-networth">
                    <GainBadge value={summary.total_gain} pct={summary.total_gain_pct} />
                  </div>
                </div>
              </div>
            </div>
          )}
          {summaryLoading && (
            <p className="widget-loading" style={{ marginTop: "0.5rem" }}>Loading summary...</p>
          )}

          {/* Sector Allocation */}
          {summary && summary.sector_allocation && summary.sector_allocation.length > 0 && (
            <div className="finances-grid" style={{ marginTop: "1rem" }}>
              <div className="finance-card">
                <h3>Sector Allocation</h3>
                <div className="finance-card-body">
                  <div style={{ width: "100%", height: 260 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={summary.sector_allocation}
                          dataKey="value"
                          nameKey="sector"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          label={({ sector, pct }) => `${sector} ${pct}%`}
                          labelLine={true}
                        >
                          {summary.sector_allocation.map((entry, i) => (
                            <Cell key={entry.sector} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 6, color: "#e1e4e8" }}
                          formatter={(value) => formatCurrency(value)}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: "0.75rem", color: "#c9d1d9" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="finance-card">
                <h3>
                  Sector Risk & Growth
                  <button
                    className="toolbar-btn toolbar-btn--primary"
                    style={{ float: "right", fontSize: "0.75rem", padding: "0.2rem 0.6rem" }}
                    onClick={handleSectorAnalysis}
                    disabled={sectorLoading}
                  >
                    {sectorLoading ? "Analyzing..." : "Run AI Analysis"}
                  </button>
                </h3>
                <div className="finance-card-body">
                  {sectorLoading && (
                    <p className="widget-loading">Running sector analysis...</p>
                  )}
                  {!sectorAnalysis && !sectorLoading && (
                    <p style={{ color: "#8b949e", fontSize: "0.85rem" }}>
                      Click "Run AI Analysis" to get risk scores and growth potential per sector.
                    </p>
                  )}
                  {sectorAnalysis && sectorAnalysis.sector_scores && sectorAnalysis.sector_scores.length > 0 ? (
                    <div className="widget-table-wrap">
                      <table className="widget-table">
                        <thead>
                          <tr>
                            <th>Sector</th>
                            <th>Risk Score</th>
                            <th>Growth Potential</th>
                            <th>Justification</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sectorAnalysis.sector_scores.map((s) => (
                            <tr key={s.sector}>
                              <td style={{ color: "#58a6ff", fontWeight: 600 }}>{s.sector}</td>
                              <td>
                                <span className={`sector-score ${s.risk_score >= 7 ? "sector-score--high" : s.risk_score >= 4 ? "sector-score--med" : "sector-score--low"}`}>
                                  {s.risk_score}/10
                                </span>
                              </td>
                              <td>
                                <span className={`sector-score ${s.growth_potential >= 7 ? "sector-score--high-growth" : s.growth_potential >= 4 ? "sector-score--med-growth" : "sector-score--low-growth"}`}>
                                  {s.growth_potential}/10
                                </span>
                              </td>
                              <td style={{ fontSize: "0.75rem", color: "#8b949e", maxWidth: 300 }}>{s.justification}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {sectorAnalysis.provider && (
                        <div style={{ fontSize: "0.7rem", color: "#484f58", marginTop: "0.5rem" }}>
                          Powered by {sectorAnalysis.provider} / {sectorAnalysis.model}
                        </div>
                      )}
                    </div>
                  ) : sectorAnalysis && !sectorLoading ? (
                    <div style={{ fontSize: "0.82rem", color: "#c9d1d9", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                      {sectorAnalysis.raw_analysis}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          <div className="finance-card" style={{ marginTop: "1rem" }}>
            <h3>
              {selected.name}
              <button
                className="widget-remove"
                onClick={handleDelete}
                title="Delete portfolio"
                style={{ float: "right" }}
              >
                x
              </button>
            </h3>
            <div className="finance-card-body">
              {selected.description && (
                <p style={{ color: "#8b949e", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
                  {selected.description}
                </p>
              )}

              {/* Holdings table with gains */}
              {summary && summary.holdings.length > 0 ? (
                <div className="widget-table-wrap">
                  <table className="widget-table">
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Name</th>
                        <th>Sector</th>
                        <th>Shares</th>
                        <th>Avg Cost</th>
                        <th>Price</th>
                        <th>Value</th>
                        <th>Gain / Loss</th>
                        {hasEtf && <th>Fee (ER)</th>}
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.holdings.map((h) => (
                        <tr key={h.id}>
                          <td style={{ color: "#58a6ff", fontWeight: 700 }}>
                            {h.symbol}
                            {h.is_etf && <span className="etf-badge">ETF</span>}
                          </td>
                          <td>{h.stock_name || "—"}</td>
                          <td style={{ fontSize: "0.78rem", color: "#8b949e" }}>{h.sector || "—"}</td>
                          <td>{h.shares}</td>
                          <td>{h.avg_cost != null ? formatCurrency(h.avg_cost) : "—"}</td>
                          <td>{h.current_price != null ? formatCurrency(h.current_price) : "—"}</td>
                          <td>{formatCurrency(h.current_value)}</td>
                          <td>
                            <GainBadge value={h.gain} pct={h.gain_pct} />
                          </td>
                          {hasEtf && (
                            <td>
                              {h.is_etf ? (
                                h.expense_ratio != null ? (
                                  <span className="etf-fee">{(h.expense_ratio * 100).toFixed(2)}%</span>
                                ) : (
                                  <span style={{ color: "#8b949e", fontSize: "0.75rem" }}>N/A</span>
                                )
                              ) : (
                                <span style={{ color: "#484f58" }}>—</span>
                              )}
                            </td>
                          )}
                          <td>
                            <button
                              className="widget-remove"
                              onClick={() => handleRemoveHolding(h.id)}
                            >
                              x
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : !summaryLoading && selected.holdings && selected.holdings.length > 0 ? (
                <div className="widget-table-wrap">
                  <table className="widget-table">
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Name</th>
                        <th>Shares</th>
                        <th>Avg Cost</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.holdings.map((h) => (
                        <tr key={h.id}>
                          <td style={{ color: "#58a6ff", fontWeight: 700 }}>{h.symbol}</td>
                          <td>{h.stock_name || "—"}</td>
                          <td>{h.shares}</td>
                          <td>{h.avg_cost != null ? formatCurrency(h.avg_cost) : "—"}</td>
                          <td>
                            <button
                              className="widget-remove"
                              onClick={() => handleRemoveHolding(h.id)}
                            >
                              x
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: "#8b949e", fontSize: "0.85rem" }}>No holdings yet.</p>
              )}

              {/* Add holding */}
              <form
                className="settings-form"
                onSubmit={handleAddHolding}
                style={{ marginTop: "1rem", flexDirection: "row", flexWrap: "wrap", gap: "0.5rem", alignItems: "flex-end" }}
              >
                <div className="settings-field" style={{ flex: "1", minWidth: "80px" }}>
                  <label>Symbol</label>
                  <input value={holdSymbol} onChange={(e) => setHoldSymbol(e.target.value)} required />
                </div>
                <div className="settings-field" style={{ flex: "1", minWidth: "80px" }}>
                  <label>Shares</label>
                  <input type="number" step="any" value={holdShares} onChange={(e) => setHoldShares(e.target.value)} required />
                </div>
                <div className="settings-field" style={{ flex: "1", minWidth: "80px" }}>
                  <label>Avg Cost</label>
                  <input type="number" step="any" value={holdCost} onChange={(e) => setHoldCost(e.target.value)} />
                </div>
                <button type="submit" className="toolbar-btn toolbar-btn--primary" disabled={addingHold}>
                  Add
                </button>
              </form>
            </div>
          </div>

          {/* CSV/XLSX Upload */}
          <div className="finance-card" style={{ marginTop: "1rem" }}>
            <h3>Upload Holdings (CSV / XLSX)</h3>
            <div className="finance-card-body">
              <div className="settings-form" style={{ flexDirection: "row", flexWrap: "wrap", gap: "0.5rem", alignItems: "flex-end" }}>
                <div className="settings-field" style={{ flex: "2", minWidth: "200px" }}>
                  <label>File</label>
                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={(e) => setUploadFile(e.target.files[0] || null)}
                    style={{ background: "transparent", border: "none", padding: "0.3rem 0" }}
                  />
                </div>
                <div className="settings-field" style={{ flex: "1", minWidth: "100px" }}>
                  <label>Symbol Col</label>
                  <input value={symbolCol} onChange={(e) => setSymbolCol(e.target.value)} />
                </div>
                <div className="settings-field" style={{ flex: "1", minWidth: "100px" }}>
                  <label>Shares Col</label>
                  <input value={sharesCol} onChange={(e) => setSharesCol(e.target.value)} />
                </div>
                <div className="settings-field" style={{ flex: "1", minWidth: "100px" }}>
                  <label>Avg Cost Col</label>
                  <input value={avgCostCol} onChange={(e) => setAvgCostCol(e.target.value)} />
                </div>
                <button
                  className="toolbar-btn toolbar-btn--primary"
                  onClick={handleUpload}
                  disabled={uploading || !uploadFile}
                >
                  {uploading ? "Uploading..." : "Upload"}
                </button>
              </div>
              {uploadResult && (
                <div style={{ marginTop: "0.75rem", fontSize: "0.85rem" }}>
                  <span className="positive">Imported: {uploadResult.imported}</span>
                  {uploadResult.skipped?.length > 0 && (
                    <span className="negative" style={{ marginLeft: "1rem" }}>
                      Skipped: {uploadResult.skipped.join(", ")}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
