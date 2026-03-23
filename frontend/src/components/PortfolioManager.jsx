import { useState, useEffect } from "react";
import {
  fetchPortfolios,
  createPortfolio,
  deletePortfolio,
  addHolding,
  removeHolding,
  uploadHoldings,
} from "../api/stocks.js";

export default function PortfolioManager() {
  const [portfolios, setPortfolios] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    fetchPortfolios()
      .then((data) => setPortfolios(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
    } catch (err) {
      setMsg("Failed to create portfolio");
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
    } catch {
      setMsg("Failed to delete");
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
    } catch {
      setMsg("Upload failed");
      setTimeout(() => setMsg(""), 3000);
    } finally {
      setUploading(false);
    }
  };

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

              {/* Holdings table */}
              {selected.holdings && selected.holdings.length > 0 ? (
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
                          <td>{h.avg_cost != null ? `$${h.avg_cost.toFixed(2)}` : "—"}</td>
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
