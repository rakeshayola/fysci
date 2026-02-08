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
