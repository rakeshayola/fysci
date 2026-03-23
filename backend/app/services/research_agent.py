from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models import LlmSetting, Stock, StockPrice, StockFinancials, StockNews

DEFAULT_MODELS = {
    "openai": "gpt-4o",
    "anthropic": "claude-sonnet-4-20250514",
    "gemini": "gemini-2.0-flash",
}


def _gather_stock_data(db: Session, symbol: str) -> str:
    stock = db.query(Stock).filter(Stock.symbol == symbol).first()
    if not stock:
        return f"[{symbol}]: No data found."

    parts = [f"=== {symbol} ({stock.name}) — Sector: {stock.sector or 'N/A'} ==="]

    # Prices (last 30 days)
    cutoff = datetime.utcnow().date() - timedelta(days=30)
    prices = (
        db.query(StockPrice)
        .filter(StockPrice.stock_id == stock.id, StockPrice.date >= cutoff)
        .order_by(StockPrice.date.desc())
        .all()
    )
    if prices:
        parts.append("Recent Prices (last 30 days):")
        for p in prices[:10]:
            parts.append(
                f"  {p.date}: O={p.open} H={p.high} L={p.low} C={p.close} Vol={p.volume}"
            )
        if len(prices) > 10:
            parts.append(f"  ... and {len(prices) - 10} more days")

    # Financials
    fin = db.query(StockFinancials).filter(StockFinancials.stock_id == stock.id).first()
    if fin:
        parts.append("Key Financials:")
        parts.append(f"  P/E Ratio: {fin.pe_ratio}  Forward P/E: {fin.forward_pe}")
        parts.append(f"  Market Cap: {fin.market_cap}  EPS: {fin.earnings_per_share}")
        parts.append(f"  Revenue: {fin.total_revenue}  Debt: {fin.total_debt}")
        parts.append(f"  OPEX: {fin.operating_expense}  CAPEX: {fin.capital_expenditure}")
        parts.append(f"  Employees: {fin.num_employees}")

    # News / sentiment
    news = (
        db.query(StockNews)
        .filter(StockNews.stock_id == stock.id)
        .order_by(StockNews.published_at.desc())
        .limit(10)
        .all()
    )
    if news:
        parts.append("Recent News:")
        for n in news:
            sent = f" [{n.sentiment_label} {n.sentiment_score}]" if n.sentiment_label else ""
            parts.append(f"  - {n.headline}{sent}")

    return "\n".join(parts)


def _build_prompt(symbols: list[str], stock_data: str, query: str | None) -> str:
    base_query = query or (
        "Provide a comprehensive analysis of the following stocks. "
        "Include price trends, valuation assessment, financial health, "
        "news sentiment summary, and a buy/hold/sell recommendation for each."
    )
    return (
        "You are a professional equity research analyst. "
        "Analyze the following stock data and answer the user's question.\n\n"
        f"USER QUESTION: {base_query}\n\n"
        f"STOCK DATA:\n{stock_data}\n\n"
        "Provide a clear, well-structured analysis."
    )


def _call_openai(api_key: str, model: str, prompt: str) -> str:
    from openai import OpenAI

    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2048,
    )
    return response.choices[0].message.content


def _call_anthropic(api_key: str, model: str, prompt: str) -> str:
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model=model,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text


def _call_gemini(api_key: str, model: str, prompt: str) -> str:
    from google import genai

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(model=model, contents=prompt)
    return response.text


PROVIDERS = {
    "openai": _call_openai,
    "anthropic": _call_anthropic,
    "gemini": _call_gemini,
}


def run_research(
    db: Session, symbols: list[str], query: str | None = None
) -> dict:
    setting = db.query(LlmSetting).filter(LlmSetting.is_active == True).first()
    if not setting:
        raise ValueError("No active LLM provider configured. Please add an API key in Settings.")

    provider = setting.provider
    model = setting.model_name or DEFAULT_MODELS.get(provider, "")
    api_key = setting.api_key

    call_fn = PROVIDERS.get(provider)
    if not call_fn:
        raise ValueError(f"Unsupported provider: {provider}")

    # Gather data for all symbols
    stock_sections = []
    for sym in symbols:
        stock_sections.append(_gather_stock_data(db, sym.upper()))

    stock_data = "\n\n".join(stock_sections)
    prompt = _build_prompt(symbols, stock_data, query)

    analysis = call_fn(api_key, model, prompt)

    return {
        "provider": provider,
        "model": model,
        "symbols": symbols,
        "analysis": analysis,
        "timestamp": datetime.utcnow(),
    }
