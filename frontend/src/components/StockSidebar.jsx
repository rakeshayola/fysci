export default function StockSidebar({ stocks, portfolios = [], selectedSymbols, onToggle }) {
  // Collect unique portfolio holding symbols
  const portfolioSymbols = [
    ...new Set(
      portfolios.flatMap((p) =>
        (p.holdings || []).map((h) => h.symbol).filter(Boolean)
      )
    ),
  ];

  // Separate index stocks from regular stocks
  const indexStocks = stocks.filter((s) => s.sector === "Index");
  const portfolioStocks = stocks.filter(
    (s) => portfolioSymbols.includes(s.symbol) && s.sector !== "Index"
  );

  return (
    <aside className="sidebar">
      {portfolioStocks.length > 0 && (
        <>
          <h2>Portfolio</h2>
          <ul className="stock-list">
            {portfolioStocks.map((stock) => {
              const active = selectedSymbols.includes(stock.symbol);
              return (
                <li
                  key={stock.symbol}
                  className={`stock-item ${active ? "stock-item--active" : ""}`}
                  onClick={() => onToggle(stock.symbol)}
                >
                  <span className="stock-symbol">{stock.symbol}</span>
                  <span className="stock-name">{stock.name}</span>
                </li>
              );
            })}
            {/* Portfolio symbols not yet in the stocks DB */}
            {portfolioSymbols
              .filter((sym) => !stocks.find((s) => s.symbol === sym))
              .map((symbol) => {
                const active = selectedSymbols.includes(symbol);
                return (
                  <li
                    key={symbol}
                    className={`stock-item ${active ? "stock-item--active" : ""}`}
                    onClick={() => onToggle(symbol)}
                  >
                    <span className="stock-symbol">{symbol}</span>
                    <span className="stock-name">{symbol}</span>
                  </li>
                );
              })}
          </ul>
        </>
      )}
      <h2>Index</h2>
      <ul className="stock-list">
        {indexStocks.length === 0 ? (
          <li className="stock-item" style={{ opacity: 0.5, cursor: "default" }}>
            <span className="stock-name">No indices loaded</span>
          </li>
        ) : (
          indexStocks.map((stock) => {
            const active = selectedSymbols.includes(stock.symbol);
            return (
              <li
                key={stock.symbol}
                className={`stock-item ${active ? "stock-item--active" : ""}`}
                onClick={() => onToggle(stock.symbol)}
              >
                <span className="stock-symbol">{stock.symbol}</span>
                <span className="stock-name">{stock.name}</span>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}
