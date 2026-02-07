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
