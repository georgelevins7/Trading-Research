export type Candle = { timestamp: number; open: number; high: number; low: number; close: number; volume: number }
export type Ticker = { symbol: string; price: number; change: number; high: number; low: number; volume: number }
const hosts = ['https://data-api.binance.vision', 'https://api.binance.com']
const memo = new Map<string, { time: number; data: unknown }>()

async function publicBinance<T>(path: string, cacheMs = 15000): Promise<T> {
  const cached = memo.get(path)
  if (cached && Date.now() - cached.time < cacheMs) return cached.data as T
  for (const host of hosts) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10000)
      try {
        const res = await fetch(`${host}${path}`, { signal: controller.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json() as T
        memo.set(path, { time: Date.now(), data })
        return data
      } finally { clearTimeout(timer) }
    } catch { /* try next public market data host */ }
  }
  throw new Error('Binance market data is unavailable. Check your connection or access restrictions.')
}

export async function loadCandles(pair: string, interval: string): Promise<Candle[]> {
  const symbol = pair.replace('/', '')
  const data = await publicBinance<(string | number)[][]>(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=500`, 30000)
  return data.map(row => ({ timestamp: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) }))
}
export async function loadTicker(pair: string): Promise<Ticker> {
  const symbol = pair.replace('/', '')
  const t = await publicBinance<Record<string, string>>(`/api/v3/ticker/24hr?symbol=${symbol}`, 20000)
  return { symbol: pair, price: Number(t.lastPrice), change: Number(t.priceChangePercent), high: Number(t.highPrice), low: Number(t.lowPrice), volume: Number(t.quoteVolume) }
}
