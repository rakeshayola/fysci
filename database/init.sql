CREATE TABLE IF NOT EXISTS stocks (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    sector VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_prices (
    id SERIAL PRIMARY KEY,
    stock_id INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    open NUMERIC(12,4),
    high NUMERIC(12,4),
    low NUMERIC(12,4),
    close NUMERIC(12,4),
    volume BIGINT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(stock_id, date)
);

CREATE TABLE IF NOT EXISTS stock_financials (
    id SERIAL PRIMARY KEY,
    stock_id INTEGER REFERENCES stocks(id) ON DELETE CASCADE UNIQUE,
    pe_ratio NUMERIC(12,4),
    forward_pe NUMERIC(12,4),
    market_cap BIGINT,
    total_debt BIGINT,
    total_revenue BIGINT,
    operating_expense BIGINT,
    capital_expenditure BIGINT,
    num_employees INTEGER,
    earnings_per_share NUMERIC(12,4),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS widgets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    widget_type VARCHAR(50) NOT NULL,
    config JSONB DEFAULT '{}',
    position_x INTEGER DEFAULT 0,
    position_y INTEGER DEFAULT 0,
    width INTEGER DEFAULT 1,
    height INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_news (
    id SERIAL PRIMARY KEY,
    stock_id INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
    headline VARCHAR(500) NOT NULL,
    url VARCHAR(1000),
    source VARCHAR(200),
    published_at TIMESTAMP,
    sentiment_score NUMERIC(5,4),   -- -1.0 (bearish) to +1.0 (bullish)
    sentiment_label VARCHAR(10),    -- positive / negative / neutral
    feed_source VARCHAR(20) DEFAULT 'google', -- google / twitter
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(stock_id, url)
);

CREATE TABLE IF NOT EXISTS llm_settings (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    api_key VARCHAR(500) NOT NULL,
    model_name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portfolios (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portfolio_holdings (
    id SERIAL PRIMARY KEY,
    portfolio_id INTEGER REFERENCES portfolios(id) ON DELETE CASCADE NOT NULL,
    stock_id INTEGER REFERENCES stocks(id) ON DELETE CASCADE NOT NULL,
    shares NUMERIC(12,4) NOT NULL,
    avg_cost NUMERIC(12,4),
    added_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(portfolio_id, stock_id)
);

CREATE TABLE IF NOT EXISTS stock_analyses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    symbols VARCHAR(500) NOT NULL,
    query TEXT,
    provider VARCHAR(50),
    model VARCHAR(100),
    analysis TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    error TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_analyses_lookup ON stock_analyses(user_id, symbols, created_at DESC);

-- Seed some sample stocks
INSERT INTO stocks (symbol, name, sector) VALUES
    ('AAPL', 'Apple Inc.', 'Technology'),
    ('GOOGL', 'Alphabet Inc.', 'Technology'),
    ('MSFT', 'Microsoft Corporation', 'Technology'),
    ('AMZN', 'Amazon.com Inc.', 'Consumer Cyclical'),
    ('TSLA', 'Tesla Inc.', 'Automotive'),
    ('JPM', 'JPMorgan Chase & Co.', 'Financial Services'),
    ('JNJ', 'Johnson & Johnson', 'Healthcare'),
    ('V', 'Visa Inc.', 'Financial Services'),
    ('NVDA', 'NVIDIA Corporation', 'Technology'),
    ('META', 'Meta Platforms Inc.', 'Technology'),
    ('^GSPC', 'S&P 500', 'Index'),
    ('^IXIC', 'NASDAQ Composite', 'Index'),
    ('^DJI', 'Dow Jones Industrial Average', 'Index'),
    ('^RUT', 'Russell 2000', 'Index'),
    ('^VIX', 'CBOE Volatility Index', 'Index'),
    ('^FTSE', 'FTSE 100', 'Index'),
    ('^N225', 'Nikkei 225', 'Index')
ON CONFLICT (symbol) DO NOTHING;

-- Seed some sample daily prices (last 5 days of fake data)
INSERT INTO stock_prices (stock_id, date, open, high, low, close, volume)
SELECT
    s.id,
    d.date,
    round((random() * 100 + 100)::numeric, 4),
    round((random() * 100 + 150)::numeric, 4),
    round((random() * 100 + 80)::numeric, 4),
    round((random() * 100 + 100)::numeric, 4),
    (random() * 10000000)::bigint
FROM stocks s
CROSS JOIN (
    SELECT generate_series(CURRENT_DATE - INTERVAL '4 days', CURRENT_DATE, '1 day')::date AS date
) d
ON CONFLICT (stock_id, date) DO NOTHING;

-- Seed default widgets
INSERT INTO widgets (name, widget_type, config, position_x, position_y, width, height) VALUES
    ('Historic Close Price', 'history_chart', '{"period": "90d"}', 0, 0, 3, 2),
    ('Volume History', 'volume_bar_chart', '{"period": "90d"}', 0, 2, 3, 2),
    ('Price Table', 'price_chart', '{"interval": "daily"}', 0, 4, 2, 2),
    ('Key Metrics', 'key_metrics', '{}', 2, 4, 1, 1),
    ('Volume Table', 'volume_chart', '{"interval": "daily"}', 2, 5, 1, 1)
ON CONFLICT DO NOTHING;
