export default function StockSidebar({ stocks, selectedSymbols, onToggle }) {
  return (
    <aside className="sidebar">
      <h2>Stocks</h2>
      <ul className="stock-list">
        {stocks.map((stock) => {
          const active = selectedSymbols.includes(stock.symbol);
          return (
            <li
              key={stock.symbol}
              className={`stock-item ${active ? "stock-item--active" : ""}`}
              onClick={() => onToggle(stock.symbol)}
            >
              <span className="stock-symbol">{stock.symbol}</span>
              <span className="stock-name">{stock.name}</span>
              {stock.sector && (
                <span className="stock-sector">{stock.sector}</span>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
