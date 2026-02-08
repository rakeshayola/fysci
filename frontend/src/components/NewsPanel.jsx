import { useState, useEffect } from "react";
import { fetchNews, fetchSentiment } from "../api/stocks.js";

function SentimentBadge({ label, score }) {
  const cls =
    label === "positive" ? "sentiment-badge--pos" :
    label === "negative" ? "sentiment-badge--neg" :
    "sentiment-badge--neu";
  return (
    <span className={`sentiment-badge ${cls}`}>
      {label} {score != null ? `(${score > 0 ? "+" : ""}${score.toFixed(2)})` : ""}
    </span>
  );
}

function SentimentGauge({ summary }) {
  if (!summary || summary.total === 0) {
    return <p className="news-no-data">No sentiment data yet.</p>;
  }

  const posPct = Math.round((summary.positive / summary.total) * 100);
  const neuPct = Math.round((summary.neutral / summary.total) * 100);
  const negPct = 100 - posPct - neuPct;

  const labelCls =
    summary.label === "bullish" ? "sentiment-overall--bullish" :
    summary.label === "bearish" ? "sentiment-overall--bearish" :
    "sentiment-overall--neutral";

  return (
    <div className="sentiment-gauge">
      <div className="sentiment-gauge-header">
        <span className="sentiment-symbol">{summary.symbol}</span>
        <span className={`sentiment-overall ${labelCls}`}>{summary.label.toUpperCase()}</span>
        <span className="sentiment-avg">
          Avg: {summary.avg_score > 0 ? "+" : ""}{summary.avg_score.toFixed(3)}
        </span>
      </div>
      <div className="sentiment-bar">
        {posPct > 0 && <div className="sentiment-bar--pos" style={{ width: `${posPct}%` }}>{posPct}%</div>}
        {neuPct > 0 && <div className="sentiment-bar--neu" style={{ width: `${neuPct}%` }}>{neuPct}%</div>}
        {negPct > 0 && <div className="sentiment-bar--neg" style={{ width: `${negPct}%` }}>{negPct}%</div>}
      </div>
      <div className="sentiment-counts">
        <span className="positive">{summary.positive} positive</span>
        <span style={{ color: "#8b949e" }}>{summary.neutral} neutral</span>
        <span className="negative">{summary.negative} negative</span>
        <span style={{ color: "#8b949e" }}>{summary.total} total</span>
      </div>
    </div>
  );
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NewsPanel({ selectedSymbols }) {
  const [articles, setArticles] = useState({});
  const [sentiments, setSentiments] = useState({});
  const [loading, setLoading] = useState(true);
  const [feedFilter, setFeedFilter] = useState("all"); // all | google | twitter

  useEffect(() => {
    if (selectedSymbols.length === 0) {
      setArticles({});
      setSentiments({});
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([
      ...selectedSymbols.map((s) =>
        fetchNews(s, 30).then((news) => ({ type: "news", symbol: s, data: news }))
      ),
      ...selectedSymbols.map((s) =>
        fetchSentiment(s).then((sent) => ({ type: "sentiment", symbol: s, data: sent }))
      ),
    ])
      .then((results) => {
        const newArticles = {};
        const newSentiments = {};
        results.forEach((r) => {
          if (r.type === "news") newArticles[r.symbol] = r.data;
          else newSentiments[r.symbol] = r.data;
        });
        setArticles(newArticles);
        setSentiments(newSentiments);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [selectedSymbols]);

  if (selectedSymbols.length === 0) {
    return (
      <main className="dashboard dashboard--empty">
        <p>Select one or more stocks from the sidebar to view news.</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="dashboard">
        <p className="widget-loading">Loading news &amp; sentiment...</p>
      </main>
    );
  }

  // Merge and sort all articles across selected symbols
  let allArticles = [];
  selectedSymbols.forEach((symbol) => {
    (articles[symbol] || []).forEach((a) => allArticles.push({ ...a, _symbol: symbol }));
  });
  if (feedFilter !== "all") {
    allArticles = allArticles.filter((a) => a.feed_source === feedFilter);
  }
  allArticles.sort(
    (a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0)
  );

  return (
    <main className="dashboard news-panel">
      {/* Sentiment summary cards */}
      <div className="news-section-title">Sentiment Impact</div>
      <div className="sentiment-grid">
        {selectedSymbols.map((symbol) => (
          <SentimentGauge key={symbol} summary={sentiments[symbol]} />
        ))}
      </div>

      {/* Feed filter + article list */}
      <div className="news-toolbar">
        <span className="news-section-title">Latest Headlines</span>
        <div className="news-feed-filter">
          {["all", "google", "twitter"].map((f) => (
            <button
              key={f}
              className={`news-filter-btn${feedFilter === f ? " news-filter-btn--active" : ""}`}
              onClick={() => setFeedFilter(f)}
            >
              {f === "all" ? "All" : f === "google" ? "Google News" : "Twitter/X"}
            </button>
          ))}
        </div>
      </div>

      <div className="news-feed">
        {allArticles.length === 0 ? (
          <p className="news-no-data">No articles found. Run the news scraper to populate.</p>
        ) : (
          allArticles.map((a) => (
            <div key={a.id} className="news-article">
              <div className="news-article-top">
                <span className="news-article-symbol">{a._symbol}</span>
                <SentimentBadge label={a.sentiment_label} score={a.sentiment_score} />
                <span className="news-article-source">
                  {a.feed_source === "twitter" ? "Twitter/X" : a.source || "Google News"}
                </span>
                <span className="news-article-time">{timeAgo(a.published_at)}</span>
              </div>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="news-article-headline"
              >
                {a.headline}
              </a>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
