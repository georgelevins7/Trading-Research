export type User = { id: string; username: string; role: 'user' | 'admin' }
export type Backtest = {
  task_id: string; strategy: string; pair: string; timeframe: string; timerange: string;
  balance: number; status: 'pending' | 'running' | 'completed' | 'failed';
  metrics: null | Record<string, number | null>; error: string | null; created_at: string;
}
export type StrategyRecord = {
  id: string; name: string; visibility: string; moderation_status: string;
  owner_id?: string | null; source_code?: string | null;
  profile?: Record<string, unknown>; version?: number;
}
export type DraftResult = { id: string; name: string; status: string; review?: { approved?: boolean; issues?: string[] }; validation?: { status?: string; name?: string } }
export type BacktestParams = { pair: string; timeframe: string; timerange: string; balance: number; stoploss_pct?: number; take_profit_pct?: number; fee_pct?: number; stake_amount?: number; trailing_stop?: boolean; max_open_trades?: number }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export async function api<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers: HeadersInit = {
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...init.headers,
  }
  let response: Response
  try {
    response = await fetch(`/api${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, 'Cannot connect to FastAPI. Make sure uvicorn is running on port 8000.')
  }
  if (!response.ok) {
    let message = `HTTP error ${response.status}`
    try {
      const body = await response.json()
      message = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail ?? body)
    } catch { /* no JSON */ }
    if (response.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('tr-auth-expired'))
    throw new ApiError(response.status, message)
  }
  return response.json() as Promise<T>
}

export const post = <T,>(path: string, data: unknown, token?: string | null) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(data) }, token)

export function displayError(error: unknown) { return error instanceof Error ? error.message : 'Unknown error' }
export function formatMoney(value: number | null | undefined, currency = '$') {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${currency}${value.toLocaleString('en-US', { maximumFractionDigits: value > 100 ? 2 : 4 })}`
}
export const pairs = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'DOGE/USDT', 'ADA/USDT', 'AVAX/USDT']
export const timeframes = ['15m', '1h', '4h', '1d', '1w']
