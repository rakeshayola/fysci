import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { fetchStockPrices } from "../api/stocks.js";

const CHART_COLORS = [
  "#58a6ff",
  "#3fb950",
  "#f0883e",
  "#bc8cff",
  "#f85149",
  "#79c0ff",
  "#56d364",
  "#d29922",
  "#db61a2",
  "#388bfd",
];

function getLimit(widgetType) {
  if (widgetType === "history_chart" || widgetType === "volume_bar_chart") {
    return 90;
  }
  return 5;
}

export default function Widget({ widget, selectedSymbols }) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const limit = getLimit(widget.widget_type);
    Promise.all(
      selectedSymbols.map((symbol) =>
        fetchStockPrices(symbol, limit).then((prices) => ({ symbol, prices }))
      )
    )
      .then((results) => {
        const bySymbol = {};
        results.forEach(({ symbol, prices }) => {
          bySymbol[symbol] = prices;
        });
        setData(bySymbol);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [selectedSymbols, widget.widget_type]);

  return (
    <div
      className="widget"
      style={{
        gridColumn: `span ${widget.width}`,
        gridRow: `span ${widget.height}`,
      }}
    >
      <div className="widget-header">
        <h3>{widget.name}</h3>
        <span className="widget-type">{widget.widget_type}</span>
      </div>
      <div className="widget-body">
        {loading ? (
          <p className="widget-loading">Loading data...</p>
        ) : (
          <WidgetContent type={widget.widget_type} data={data} />
        )}
      </div>
    </div>
  );
}

function buildChartData(data) {
  const symbols = Object.keys(data);
  const dateMap = {};

  symbols.forEach((symbol) => {
    (data[symbol] || []).forEach((p) => {
      if (!dateMap[p.date]) dateMap[p.date] = { date: p.date };
      dateMap[p.date][`${symbol}_close`] = Number(p.close);
      dateMap[p.date][`${symbol}_open`] = Number(p.open);
      dateMap[p.date][`${symbol}_high`] = Number(p.high);
      dateMap[p.date][`${symbol}_low`] = Number(p.low);
      dateMap[p.date][`${symbol}_volume`] = Number(p.volume);
    });
  });

  return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
}

function WidgetContent({ type, data }) {
  const symbols = Object.keys(data);

  if (symbols.length === 0) {
    return <p>No data available.</p>;
  }

  if (type === "history_chart") {
    const chartData = buildChartData(data);
    return (
      <div className="widget-chart">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
            <XAxis
              dataKey="date"
              tick={{ fill: "#8b949e", fontSize: 11 }}
              tickFormatter={(d) => d.slice(5)}
            />
            <YAxis
              tick={{ fill: "#8b949e", fontSize: 11 }}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={{
                background: "#161b22",
                border: "1px solid #30363d",
                borderRadius: 6,
                color: "#e1e4e8",
              }}
            />
            <Legend />
            {symbols.map((symbol, i) => (
              <Line
                key={symbol}
                type="monotone"
                dataKey={`${symbol}_close`}
                name={symbol}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                dot={false}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === "volume_bar_chart") {
    const chartData = buildChartData(data);
    return (
      <div className="widget-chart">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
            <XAxis
              dataKey="date"
              tick={{ fill: "#8b949e", fontSize: 11 }}
              tickFormatter={(d) => d.slice(5)}
            />
            <YAxis
              tick={{ fill: "#8b949e", fontSize: 11 }}
              tickFormatter={(v) =>
                v >= 1_000_000
                  ? `${(v / 1_000_000).toFixed(1)}M`
                  : v.toLocaleString()
              }
            />
            <Tooltip
              contentStyle={{
                background: "#161b22",
                border: "1px solid #30363d",
                borderRadius: 6,
                color: "#e1e4e8",
              }}
              formatter={(v) => Number(v).toLocaleString()}
            />
            <Legend />
            {symbols.map((symbol, i) => (
              <Bar
                key={symbol}
                dataKey={`${symbol}_volume`}
                name={symbol}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                opacity={0.8}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === "price_chart") {
    return (
      <div className="widget-table-wrap">
        {symbols.map((symbol) => (
          <div key={symbol} className="widget-section">
            <h4>{symbol}</h4>
            <table className="widget-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Open</th>
                  <th>High</th>
                  <th>Low</th>
                  <th>Close</th>
                </tr>
              </thead>
              <tbody>
                {data[symbol].map((p) => (
                  <tr key={p.id}>
                    <td>{p.date}</td>
                    <td>{Number(p.open).toFixed(2)}</td>
                    <td>{Number(p.high).toFixed(2)}</td>
                    <td>{Number(p.low).toFixed(2)}</td>
                    <td>{Number(p.close).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  }

  if (type === "key_metrics") {
    return (
      <div>
        {symbols.map((symbol) => {
          const prices = data[symbol];
          if (!prices || prices.length === 0) return null;
          const latest = prices[0];
          const oldest = prices[prices.length - 1];
          const change = latest.close - oldest.close;
          const pct = oldest.close
            ? ((change / oldest.close) * 100).toFixed(2)
            : "N/A";
          return (
            <div key={symbol} className="widget-section">
              <h4>{symbol}</h4>
              <p>
                Latest Close:{" "}
                <strong>{Number(latest.close).toFixed(2)}</strong>
              </p>
              <p>
                Change:{" "}
                <strong className={change >= 0 ? "positive" : "negative"}>
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(2)} ({pct}%)
                </strong>
              </p>
            </div>
          );
        })}
      </div>
    );
  }

  if (type === "volume_chart") {
    return (
      <div>
        {symbols.map((symbol) => (
          <div key={symbol} className="widget-section">
            <h4>{symbol}</h4>
            <table className="widget-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Volume</th>
                </tr>
              </thead>
              <tbody>
                {data[symbol].map((p) => (
                  <tr key={p.id}>
                    <td>{p.date}</td>
                    <td>{Number(p.volume).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  }

  return <p>Unknown widget type: {type}</p>;
}
