import { useState, useEffect } from "react";
import { fetchStockPrices } from "../api/stocks.js";

export default function Widget({ widget, selectedSymbols }) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all(
      selectedSymbols.map((symbol) =>
        fetchStockPrices(symbol, 5).then((prices) => ({ symbol, prices }))
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
  }, [selectedSymbols]);

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

function WidgetContent({ type, data }) {
  const symbols = Object.keys(data);

  if (symbols.length === 0) {
    return <p>No data available.</p>;
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
          const pct = oldest.close ? ((change / oldest.close) * 100).toFixed(2) : "N/A";
          return (
            <div key={symbol} className="widget-section">
              <h4>{symbol}</h4>
              <p>Latest Close: <strong>{Number(latest.close).toFixed(2)}</strong></p>
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
