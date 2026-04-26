import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  fetchAdminUsers,
  fetchAdminAnalytics,
  toggleLockUser,
  approveUser,
  deleteAdminUser,
  toggleAdminRole,
  generateResetToken,
} from "../api/stocks.js";

const PIE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#14b8a6", "#a855f7", "#f97316"];

function StatCard({ label, value, color = "#6366f1" }) {
  return (
    <div className="admin-stat-card" style={{ borderTop: `3px solid ${color}` }}>
      <div className="admin-stat-value">{value}</div>
      <div className="admin-stat-label">{label}</div>
    </div>
  );
}

function Badge({ text, color }) {
  return (
    <span className="admin-badge" style={{ background: color + "22", color }}>
      {text}
    </span>
  );
}

export default function AdminPanel() {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [resetTokenData, setResetTokenData] = useState(null); // { username, token }
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, a] = await Promise.all([fetchAdminUsers(), fetchAdminAnalytics()]);
      setUsers(u);
      setAnalytics(a);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const withLoading = async (key, fn) => {
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    try {
      await fn();
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="admin-loading">Loading admin data...</div>;
  if (error) return <div className="admin-error">Error: {error}</div>;

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h2>Admin Panel</h2>
        <div className="admin-tabs">
          <button
            className={`admin-tab-btn ${tab === "users" ? "active" : ""}`}
            onClick={() => setTab("users")}
          >
            User Management
          </button>
          <button
            className={`admin-tab-btn ${tab === "analytics" ? "active" : ""}`}
            onClick={() => setTab("analytics")}
          >
            Analytics
          </button>
        </div>
        <button className="toolbar-btn" onClick={load} style={{ marginLeft: "auto" }}>
          Refresh
        </button>
      </div>

      {tab === "users" && analytics && (
        <div className="admin-content">
          {/* Summary stats */}
          <div className="admin-stats-row">
            <StatCard label="Total Users" value={analytics.total_users} color="#6366f1" />
            <StatCard label="Active" value={analytics.active_users} color="#22c55e" />
            <StatCard label="Locked" value={analytics.locked_users} color="#ef4444" />
            <StatCard label="Pending Approval" value={analytics.pending_approval} color="#f59e0b" />
            <StatCard label="Portfolios" value={analytics.total_portfolios} color="#14b8a6" />
            <StatCard label="Holdings" value={analytics.total_holdings} color="#a855f7" />
          </div>

          {/* Search */}
          <div className="admin-search-row">
            <input
              className="admin-search"
              placeholder="Search by username or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="admin-count">{filteredUsers.length} users</span>
          </div>

          {/* User table */}
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Portfolios</th>
                  <th>Holdings</th>
                  <th>Est. Value</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id} className={u.is_locked ? "admin-row--locked" : ""}>
                    <td>
                      <div className="admin-user-cell">
                        <span className="admin-username">{u.username}</span>
                        {u.is_admin && <Badge text="Admin" color="#6366f1" />}
                      </div>
                    </td>
                    <td className="admin-email">{u.email}</td>
                    <td>
                      {u.is_locked ? (
                        <Badge text="Locked" color="#ef4444" />
                      ) : !u.is_approved ? (
                        <Badge text="Pending" color="#f59e0b" />
                      ) : (
                        <Badge text="Active" color="#22c55e" />
                      )}
                    </td>
                    <td className="admin-num">{u.portfolio_count}</td>
                    <td className="admin-num">{u.stock_count}</td>
                    <td className="admin-num">
                      {u.total_value > 0 ? `$${u.total_value.toLocaleString()}` : "—"}
                    </td>
                    <td className="admin-date">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div className="admin-actions">
                        {!u.is_approved && (
                          <button
                            className="admin-btn admin-btn--approve"
                            disabled={actionLoading[`approve-${u.id}`]}
                            onClick={() => withLoading(`approve-${u.id}`, () => approveUser(u.id))}
                          >
                            Approve
                          </button>
                        )}
                        <button
                          className={`admin-btn ${u.is_locked ? "admin-btn--unlock" : "admin-btn--lock"}`}
                          disabled={actionLoading[`lock-${u.id}`]}
                          onClick={() => withLoading(`lock-${u.id}`, () => toggleLockUser(u.id))}
                        >
                          {u.is_locked ? "Unlock" : "Lock"}
                        </button>
                        <button
                          className={`admin-btn ${u.is_admin ? "admin-btn--demote" : "admin-btn--promote"}`}
                          disabled={actionLoading[`admin-${u.id}`]}
                          onClick={() => withLoading(`admin-${u.id}`, () => toggleAdminRole(u.id))}
                        >
                          {u.is_admin ? "Demote" : "Promote"}
                        </button>
                        <button
                          className="admin-btn admin-btn--reset"
                          disabled={actionLoading[`reset-${u.id}`]}
                          onClick={async () => {
                            setActionLoading((p) => ({ ...p, [`reset-${u.id}`]: true }));
                            try {
                              const data = await generateResetToken(u.id);
                              setResetTokenData(data);
                            } catch (e) {
                              alert(e.message);
                            } finally {
                              setActionLoading((p) => ({ ...p, [`reset-${u.id}`]: false }));
                            }
                          }}
                        >
                          Reset PW
                        </button>
                        <button
                          className="admin-btn admin-btn--delete"
                          disabled={actionLoading[`delete-${u.id}`]}
                          onClick={() => setConfirmDelete(u)}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "analytics" && analytics && (
        <div className="admin-content">
          <div className="admin-stats-row">
            <StatCard label="Total Users" value={analytics.total_users} color="#6366f1" />
            <StatCard label="Active" value={analytics.active_users} color="#22c55e" />
            <StatCard label="Total Portfolios" value={analytics.total_portfolios} color="#14b8a6" />
            <StatCard label="Total Holdings" value={analytics.total_holdings} color="#a855f7" />
          </div>

          <div className="admin-charts-grid">
            {/* Registrations over time */}
            <div className="admin-chart-card">
              <h3>Registrations (Last 30 Days)</h3>
              {analytics.registrations_over_time.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={analytics.registrations_over_time}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff18" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(d) => d.slice(5)}
                    />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: "#1e293b", border: "none", color: "#e2e8f0" }}
                    />
                    <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="admin-empty">No registrations in last 30 days</div>
              )}
            </div>

            {/* Most tracked stocks */}
            <div className="admin-chart-card">
              <h3>Most Tracked Stocks</h3>
              {analytics.most_tracked_stocks.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={analytics.most_tracked_stocks}
                    layout="vertical"
                    margin={{ left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff18" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="symbol" tick={{ fontSize: 11 }} width={55} />
                    <Tooltip
                      contentStyle={{ background: "#1e293b", border: "none", color: "#e2e8f0" }}
                      formatter={(v, n, p) => [v, p.payload.name || p.payload.symbol]}
                    />
                    <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="admin-empty">No holdings tracked yet</div>
              )}
            </div>

            {/* Net worth distribution */}
            <div className="admin-chart-card admin-chart-card--wide">
              <h3>Estimated Portfolio Value per User</h3>
              {analytics.networth_distribution.filter((u) => u.value > 0).length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={analytics.networth_distribution.filter((u) => u.value > 0)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff18" />
                    <XAxis dataKey="username" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{ background: "#1e293b", border: "none", color: "#e2e8f0" }}
                      formatter={(v) => [`$${v.toLocaleString()}`, "Portfolio Value"]}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {analytics.networth_distribution
                        .filter((u) => u.value > 0)
                        .map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="admin-empty">No portfolio values to display</div>
              )}
            </div>

            {/* User status breakdown */}
            <div className="admin-chart-card">
              <h3>User Status Breakdown</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Active", value: analytics.active_users },
                      { name: "Locked", value: analytics.locked_users },
                      { name: "Pending", value: analytics.pending_approval },
                    ].filter((d) => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                  >
                    {["#22c55e", "#ef4444", "#f59e0b"].map((color, i) => (
                      <Cell key={i} fill={color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "none", color: "#e2e8f0" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Reset token modal */}
      {resetTokenData && (
        <div className="admin-modal-overlay" onClick={() => setResetTokenData(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Password Reset Token</h3>
            <p>
              Share this token with <strong>{resetTokenData.username}</strong>. It expires in{" "}
              <strong>{resetTokenData.expires_in}</strong>. The user will enter it on the login
              page along with their email and new password.
            </p>
            <div className="admin-token-box">
              <code>{resetTokenData.token}</code>
              <button
                className="admin-btn admin-btn--promote"
                onClick={() => navigator.clipboard.writeText(resetTokenData.token)}
              >
                Copy
              </button>
            </div>
            <div className="admin-modal-actions">
              <button className="toolbar-btn toolbar-btn--primary" onClick={() => setResetTokenData(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="admin-modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Remove User</h3>
            <p>
              Permanently remove <strong>{confirmDelete.username}</strong> and all their data?
              This cannot be undone.
            </p>
            <div className="admin-modal-actions">
              <button className="toolbar-btn" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                className="admin-btn admin-btn--delete"
                disabled={actionLoading[`delete-${confirmDelete.id}`]}
                onClick={() => {
                  withLoading(`delete-${confirmDelete.id}`, () =>
                    deleteAdminUser(confirmDelete.id)
                  );
                  setConfirmDelete(null);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
