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
    ('META', 'Meta Platforms Inc.', 'Technology')
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
    ('Price Chart', 'price_chart', '{"interval": "daily"}', 0, 0, 2, 2),
    ('Key Metrics', 'key_metrics', '{}', 2, 0, 1, 1),
    ('Volume', 'volume_chart', '{"interval": "daily"}', 2, 1, 1, 1)
ON CONFLICT DO NOTHING;
