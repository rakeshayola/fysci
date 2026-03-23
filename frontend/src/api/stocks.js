import { authFetch } from "./auth.js";

const BASE = "/api";

export async function fetchStocks() {
  const res = await fetch(`${BASE}/stocks/`);
  if (!res.ok) throw new Error("Failed to fetch stocks");
  return res.json();
}

export async function fetchStockPrices(symbol, limit = 30) {
  const res = await fetch(`${BASE}/stocks/${symbol}/prices?limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to fetch prices for ${symbol}`);
  return res.json();
}

export async function fetchWidgets() {
  const res = await fetch(`${BASE}/widgets/`);
  if (!res.ok) throw new Error("Failed to fetch widgets");
  return res.json();
}

export async function createWidget(widget) {
  const res = await fetch(`${BASE}/widgets/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(widget),
  });
  if (!res.ok) throw new Error("Failed to create widget");
  return res.json();
}

export async function deleteWidget(widgetId) {
  const res = await fetch(`${BASE}/widgets/${widgetId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete widget");
}

export async function triggerScrape() {
  const res = await fetch(`${BASE}/scraper/run`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to trigger scrape");
  return res.json();
}

export async function fetchMarketStatus() {
  const res = await fetch(`${BASE}/status/`);
  if (!res.ok) throw new Error("Failed to fetch market status");
  return res.json();
}

export async function fetchNews(symbol, limit = 30) {
  const res = await fetch(`${BASE}/news/${symbol}?limit=${limit}`);
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Failed to fetch news for ${symbol}`);
  }
  return res.json();
}

export async function fetchSentiment(symbol) {
  const res = await fetch(`${BASE}/news/${symbol}/sentiment`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Failed to fetch sentiment for ${symbol}`);
  }
  return res.json();
}

export async function fetchFinancials(symbol) {
  const res = await fetch(`${BASE}/financials/${symbol}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Failed to fetch financials for ${symbol}`);
  }
  return res.json();
}

// --- LLM Settings ---

export async function fetchSettings() {
  const res = await fetch(`${BASE}/settings/`);
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json();
}

export async function saveSettings(data) {
  const res = await fetch(`${BASE}/settings/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to save settings");
  return res.json();
}

export async function deleteSettings() {
  const res = await fetch(`${BASE}/settings/`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete settings");
}

// --- Research Agent ---

export async function runAgent(symbols, query) {
  const res = await fetch(`${BASE}/agent/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbols, query: query || null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Agent request failed" }));
    throw new Error(err.detail || "Agent request failed");
  }
  return res.json();
}

// --- Portfolios ---

export async function fetchPortfolios() {
  const res = await authFetch(`${BASE}/portfolios/`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to fetch portfolios" }));
    throw new Error(err.detail || `Failed to fetch portfolios (${res.status})`);
  }
  return res.json();
}

export async function createPortfolio(data) {
  const res = await authFetch(`${BASE}/portfolios/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to create portfolio" }));
    throw new Error(err.detail || `Failed to create portfolio (${res.status})`);
  }
  return res.json();
}

export async function deletePortfolio(id) {
  const res = await authFetch(`${BASE}/portfolios/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to delete portfolio" }));
    throw new Error(err.detail || `Failed to delete portfolio (${res.status})`);
  }
}

export async function addHolding(portfolioId, data) {
  const res = await authFetch(`${BASE}/portfolios/${portfolioId}/holdings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to add holding" }));
    throw new Error(err.detail || "Failed to add holding");
  }
  return res.json();
}

export async function removeHolding(portfolioId, holdingId) {
  const res = await authFetch(`${BASE}/portfolios/${portfolioId}/holdings/${holdingId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to remove holding");
}

export async function uploadHoldings(portfolioId, file, mapping) {
  const formData = new FormData();
  formData.append("file", file);
  const params = new URLSearchParams(mapping);
  const res = await authFetch(`${BASE}/portfolios/${portfolioId}/upload?${params}`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

// --- Analysis ---

export async function runAnalysis(symbols, query) {
  const res = await authFetch(`${BASE}/analysis/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbols, query: query || null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Analysis request failed" }));
    throw new Error(err.detail || "Analysis request failed");
  }
  return res.json();
}

export async function pollAnalysis(analysisId) {
  const res = await fetch(`${BASE}/analysis/${analysisId}`);
  if (!res.ok) throw new Error("Failed to poll analysis");
  return res.json();
}

export async function fetchAnalysisHistory() {
  const res = await authFetch(`${BASE}/analysis/history`);
  if (!res.ok) throw new Error("Failed to fetch analysis history");
  return res.json();
}
