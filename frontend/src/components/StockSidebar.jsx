export default function StockSidebar({ stocks, portfolios = [], selectedSymbols, onToggle }) {
  // Collect unique portfolio holding symbols
  const portfolioSymbols = [
    ...new Set(
      portfolios.flatMap((p) =>
        (p.holdings || []).map((h) => h.symbol).filter(Boolean)
      )
    ),
  ];

  // Stocks not in any portfolio
  const otherStocks = stocks.filter(
    (s) => !portfolioSymbols.includes(s.symbol)
  );

  return (
    <aside className="sidebar">
      {portfolioSymbols.length > 0 && (
        <>
          <h2>Portfolio</h2>
          <ul className="stock-list">
            {portfolioSymbols.map((symbol) => {
              const active = selectedSymbols.includes(symbol);
              const stock = stocks.find((s) => s.symbol === symbol);
              return (
                <li
                  key={symbol}
                  className={`stock-item ${active ? "stock-item--active" : ""}`}
                  onClick={() => onToggle(symbol)}
                >
                  <span className="stock-symbol">{symbol}</span>
                  <span className="stock-name">{stock?.name || symbol}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <h2>All Stocks</h2>
      <ul className="stock-list">
        {otherStocks.map((stock) => {
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
