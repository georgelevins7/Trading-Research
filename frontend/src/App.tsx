import { useCallback, useEffect, useState } from 'react'
import type * as React from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity, ArrowLeftRight, ArrowRight, ArrowUpRight,
  BookOpen, Bot, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight,
  CircleHelp, Clock3, Code2, Compass, Copy, Database, Eye, FlaskConical, Gauge,
  Layers3, LayoutDashboard, LoaderCircle, LockKeyhole, LogOut, Menu,
  Play, Plus, RefreshCw, Search, Send, ShieldCheck, SlidersHorizontal,
  Sparkles, Target, Trash2, TrendingDown, TrendingUp, Wallet, X, XCircle,
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import ChatPanel from './components/ChatPanel'
import { Candles } from './components/Candles'
import {
  ApiError, api, displayError, formatMoney, pairs, post, timeframes,
  type Backtest, type BacktestParams, type DraftResult, type StrategyRecord, type User,
} from './lib/api'
import { loadTicker, type Ticker } from './lib/market'

type NavItem = { title: string; href: string; icon: typeof Activity }
type Notification = { id: number; message: string; kind: 'success' | 'error' | 'info' }
type DraftDetail = { id: string; name: string; status: string; source_code: string }
type CompareResult = { leaders: Record<string, { task_id: string; value: number }>; results: Backtest[] }
type EquityPoint = { time: string; balance: number }
const MAIN_NAV: NavItem[] = [
  { title: 'Overview', href: '/', icon: LayoutDashboard },
  { title: 'Terminal', href: '/terminal', icon: Activity },
  { title: 'Strategies', href: '/strategies', icon: Layers3 },
  { title: 'Backtests', href: '/backtests', icon: FlaskConical },
  { title: 'DCA Simulator', href: '/dca', icon: Wallet },
]
const LAB_NAV: NavItem[] = [
  { title: 'AI Strategy Builder', href: '/create', icon: Sparkles },
  { title: 'AI Copilot', href: '/copilot', icon: Bot },
]
const statusLabels: Record<string, string> = {
  pending: 'Queued', running: 'Running', completed: 'Completed', failed: 'Failed',
  approved: 'Approved', rejected: 'Rejected', hidden: 'Hidden', not_requested: 'Private',
  pending_approval: 'Draft', approved_for_backtest: 'Approved for backtest',
}
function dateFor(offsetDays = 0) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}
function prettyDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function shortId(value: string) { return value?.slice(0, 8) ?? '—' }
function clampNum(input: string, fallback: number) { const n = Number(input); return Number.isFinite(n) ? n : fallback }
function Status({ value }: { value: string }) {
  const kind = value === 'completed' || value === 'approved' || value === 'approved_for_backtest' ? 'good' : value === 'failed' || value === 'rejected' || value === 'hidden' ? 'bad' : value === 'pending' || value === 'running' || value === 'pending_approval' ? 'warn' : 'neutral'
  return <span className={`status status-${kind}`}><span className="status-dot"/>{statusLabels[value] || value}</span>
}
function Empty({ icon: Icon = Compass, title, description, action }: { icon?: typeof Activity; title: string; description: string; action?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={23}/></div><strong>{title}</strong><p>{description}</p>{action}</div>
}
function SectionHeading({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: string; children?: React.ReactNode }) {
  return <header className="section-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2>{description && <p>{description}</p>}</div><div className="section-actions">{children}</div></header>
}
function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) { return <div className={`panel ${className}`}>{children}</div> }
function PanelTitle({ icon: Icon, title, hint, children }: { icon?: typeof Activity; title: string; hint?: string; children?: React.ReactNode }) {
  return <div className="panel-title"><div className="panel-name">{Icon && <Icon size={17}/>}<strong>{title}</strong>{hint && <span className="subtle">{hint}</span>}</div>{children}</div>
}
function Loading({ label = 'Loading data…' }: { label?: string }) { return <div className="loading"><LoaderCircle className="spin" size={18}/>{label}</div> }
function Metric({ icon: Icon, label, value, supporting, tone = '' }: { icon: typeof Activity; label: string; value: string | number; supporting?: string; tone?: string }) {
  return <div className="metric"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={18}/></span></div><div className="metric-value">{value}</div>{supporting && <div className="metric-foot">{supporting}</div>}</div>
}
function PairBadge({ pair, size = 'normal' }: { pair: string; size?: 'small' | 'normal' }) {
  const base = pair.split('/')[0] || pair
  const accent: Record<string, string> = { BTC: '#f7a93b', ETH: '#809bff', SOL: '#ad8aff', BNB: '#efc953', XRP: '#80bdea', DOGE: '#c9a767', ADA: '#509fe9', AVAX: '#fa6d78' }
  return <span className={`pair-badge ${size === 'small' ? 'pair-badge-small' : ''}`} style={{ '--coin-color': accent[base] || '#b6f77b' } as React.CSSProperties}>{base === 'BTC' ? '₿' : base === 'ETH' ? 'Ξ' : base.charAt(0)}</span>
}
function PairSelect({ value, onChange, options = pairs }: { value: string; onChange: (v: string) => void; options?: string[] }) {
  return <div className="select-wrap"><select value={value} onChange={e => onChange(e.target.value)}>{options.map(item => <option key={item} value={item}>{item}</option>)}</select><ChevronDown size={14}/></div>
}
function useWatchlist() {
  const [data, setData] = useState<Record<string, Ticker>>({})
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const load = async () => {
      const result = await Promise.allSettled(pairs.slice(0, 8).map(loadTicker))
      if (!active) return
      const map: Record<string, Ticker> = {}
      for (const item of result) if (item.status === 'fulfilled') map[item.value.symbol] = item.value
      if (Object.keys(map).length) setData(map)
      else setError('Market quotes are temporarily unavailable')
    }
    void load()
    const timer = window.setInterval(() => void load(), 60000)
    return () => { active = false; clearInterval(timer) }
  }, [])
  return { data, error }
}
function Watchlist({ selected, onSelect, quotes, compact = false }: { selected: string; onSelect: (s: string) => void; quotes: Record<string, Ticker>; compact?: boolean }) {
  return <div className={`watchlist ${compact ? 'watchlist-compact' : ''}`}>
    {pairs.map(pair => {
      const t = quotes[pair]
      return <button key={pair} type="button" className={`watch-row ${selected === pair ? 'selected' : ''}`} onClick={() => onSelect(pair)}>
        <PairBadge pair={pair} size="small"/><div className="watch-name"><strong>{pair.split('/')[0]}</strong><span>USDT</span></div>
        <div className="watch-price"><strong>{t ? formatMoney(t.price) : '—'}</strong><span className={t ? t.change >= 0 ? 'positive' : 'negative' : ''}>{t ? `${t.change >= 0 ? '+' : ''}${t.change.toFixed(2)}%` : '—'}</span></div>
      </button>
    })}
  </div>
}
function MarketPanel({ pair, onPair, timeframe, onTimeframe, compact = false }: { pair: string; onPair: (v: string) => void; timeframe: string; onTimeframe: (v: string) => void; compact?: boolean }) {
  const [ticker, setTicker] = useState<Ticker | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setTicker(null); setError('')
    loadTicker(pair).then(v => { if (active) setTicker(v) }).catch(e => { if (active) setError(displayError(e)) })
    return () => { active = false }
  }, [pair])
  return <Panel className="chart-panel">
    <div className="chart-header"><div className="chart-symbol"><PairBadge pair={pair}/><div><div className="chart-pair"><strong>{pair}</strong><span className="market-tag">SPOT</span></div><div className="chart-price-row"><span>{ticker ? formatMoney(ticker.price) : '—'}</span><span className={ticker && ticker.change >= 0 ? 'positive' : 'negative'}>{ticker ? `${ticker.change >= 0 ? '+' : ''}${ticker.change.toFixed(2)}% 24h` : error ? 'Quotes unavailable' : 'Loading…'}</span></div></div></div>
    <div className="chart-toolbar"><PairSelect value={pair} onChange={onPair}/><div className="timeframes">{timeframes.map(t => <button key={t} className={timeframe === t ? 'active' : ''} onClick={() => onTimeframe(t)}>{t}</button>)}</div></div></div>
    <Candles pair={pair} timeframe={timeframe} height={compact ? 324 : 425}/>
    <div className="chart-footer"><span><span className="legend-dot green"/> Up</span><span><span className="legend-dot red"/> Down</span><div className="grow"/><span><Activity size={13}/> Source: Binance Spot</span></div>
  </Panel>
}
function AuthScreen({ onLogin }: { onLogin: (token: string) => Promise<void> }) {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setWorking(true); setError('')
    try {
      if (tab === 'register') await post('/auth/register', { username, password })
      const response = await post<{ access_token: string }>('/auth/login', { username, password })
      await onLogin(response.access_token)
    } catch (e) { setError(displayError(e)) } finally { setWorking(false) }
  }
  return <div className="auth-screen"><div className="auth-art"><div className="auth-aurora"/><div className="auth-art-top"><div className="brand-mark"><Activity size={27}/></div><span>QUANT<span className="muted-mark">/</span>FORGE</span></div><div className="auth-art-center"><div className="auth-eyebrow"><span className="live-dot"/> AI TRADING STUDIO</div><h1>Explore the market.<br/><em>Stop guessing.</em></h1><p>Strategies, market data, analytics, and AI tools — all in one workspace to build, test, and analyze trading ideas.</p><div className="auth-feature"><span><Activity size={16}/> Candlestick charts</span><span><FlaskConical size={16}/> Backtests</span><span><Sparkles size={16}/> AI Research</span></div></div><div className="auth-art-bottom">BUILT FOR CURIOUS MINDS <span>✦</span> SPOT MARKETS</div></div>
  <div className="auth-form-side"><div className="auth-form-wrap"><div className="auth-mobile-brand"><Activity size={22}/> QUANTFORGE</div><div className="eyebrow">WELCOME TO YOUR WORKSPACE</div><h2>{tab === 'login' ? 'Welcome back' : 'Create an account'}</h2><p>{tab === 'login' ? 'Sign in to your trading workspace.' : 'Build your space for strategies, backtests, and market insights.'}</p>
    <div className="auth-tabs"><button className={tab === 'login' ? 'active' : ''} onClick={() => { setTab('login'); setError('') }}>Sign in</button><button className={tab === 'register' ? 'active' : ''} onClick={() => { setTab('register'); setError('') }}>Sign up</button></div>
    <form onSubmit={submit} className="auth-form"><label>Username<input autoComplete="username" placeholder="username" minLength={3} maxLength={100} required value={username} onChange={e => setUsername(e.target.value)}/></label><label>Password<input type="password" autoComplete={tab === 'login' ? 'current-password' : 'new-password'} placeholder="••••••••" minLength={tab === 'register' ? 8 : 1} required value={password} onChange={e => setPassword(e.target.value)}/></label>
      {error && <div className="inline-error"><XCircle size={16}/>{error}</div>}
      <button className="btn btn-primary auth-submit" disabled={working}>{working ? <LoaderCircle className="spin" size={17}/> : <LockKeyhole size={17}/>} {working ? 'Connecting…' : tab === 'login' ? 'Sign in to terminal' : 'Create account'} <ArrowRight size={17}/></button></form>
    <div className="auth-legal"><ShieldCheck size={16}/> Your strategies and backtests are securely associated with your account.</div></div></div></div>
}
function Sidebar({ user, logout, close }: { user: User; logout: () => void; close: () => void }) {
  const location = useLocation()
  const links = (items: NavItem[]) => items.map(item => <NavLink key={item.href} to={item.href} onClick={close} end={item.href === '/'} className={({ isActive }) => `side-link ${isActive ? 'side-active' : ''}`}><item.icon size={18}/><span>{item.title}</span>{location.pathname === item.href && <span className="side-active-pill"/>}</NavLink>)
  return <aside className="sidebar"><NavLink to="/" onClick={close} className="sidebar-logo"><span className="logo-square"><Activity size={24}/></span><span className="logo-words"><strong>QUANT</strong><span>FORGE<span className="logo-dot">.</span></span></span></NavLink>
    <div className="sidebar-workspace"><span className="workspace-icon"><Layers3 size={15}/></span><div><strong>Trading workspace</strong><span>Personal environment</span></div><ChevronDown size={14}/></div>
    <div className="sidebar-section"><div className="sidebar-label">WORKSPACE</div>{links(MAIN_NAV)}</div><div className="sidebar-section"><div className="sidebar-label">INTELLIGENCE</div>{links(LAB_NAV)}</div>
    {user.role === 'admin' && <div className="sidebar-section"><div className="sidebar-label">ADMINISTRATION</div>{links([{ title: 'Moderation', href: '/admin', icon: ShieldCheck }])}</div>}
    <div className="sidebar-spacer"/><div className="sidebar-promo"><div className="promo-top"><Sparkles size={16}/> STRATEGY LAB</div><strong>From idea to evidence.</strong><p>Build a strategy, test it, and compare the alternatives.</p><NavLink to="/create" onClick={close}>Open Strategy Lab <ArrowRight size={15}/></NavLink></div>
    <div className="sidebar-user"><span className="user-avatar">{user.username.slice(0, 1).toUpperCase()}</span><div><strong>{user.username}</strong><span>{user.role === 'admin' ? 'Administrator' : 'Trader'}</span></div><button className="icon-btn" title="Log out" onClick={logout}><LogOut size={17}/></button></div></aside>
}
function AppHeader({ user, title, toggleMenu, toggleChat }: { user: User; title: string; toggleMenu: () => void; toggleChat: () => void }) {
  return <header className="topbar"><div className="topbar-left"><button className="icon-btn mobile-menu" aria-label="Open menu" onClick={toggleMenu}><Menu size={21}/></button><span className="breadcrumb-muted">Workspace</span><ChevronRight size={14} className="breadcrumb-chevron"/><strong>{title}</strong></div><div className="topbar-right"><span className="api-live"><span className="live-dot"/> LIVE WORKSPACE</span><button className="topbar-ai" onClick={toggleChat}><Sparkles size={16}/> Ask Copilot</button><span className="top-avatar" title={user.username}>{user.username.slice(0, 1).toUpperCase()}</span></div></header>
}
function Dashboard({ token, pair, onPair, timeframe, onTimeframe, quotes }: { token: string; pair: string; onPair: (s: string) => void; timeframe: string; onTimeframe: (s: string) => void; quotes: Record<string, Ticker> }) {
  const navigate = useNavigate()
  const [runs, setRuns] = useState<Backtest[]>([])
  const [myStrategies, setMyStrategies] = useState<StrategyRecord[]>([])
  useEffect(() => { void api<Backtest[]>('/backtests/', {}, token).then(setRuns).catch(() => {}); void api<StrategyRecord[]>('/strategies/mine', {}, token).then(setMyStrategies).catch(() => {}) }, [token])
  const completed = runs.filter(x => x.status === 'completed')
  const running = runs.filter(x => x.status === 'running' || x.status === 'pending')
  const latest = runs.slice(0, 4)
  return <div className="page-container dashboard"><div className="welcome-band"><div><div className="eyebrow">YOUR TRADING DESK <span className="eyebrow-line"/></div><h1>Markets move.<br/><span>Stay one step ahead.</span></h1><p>Analyze price action, backtest your ideas, and build strategies with AI — all from one terminal.</p><div className="welcome-actions"><button className="btn btn-primary" onClick={() => navigate('/terminal')}>Open terminal <ArrowUpRight size={17}/></button><button className="btn btn-outline" onClick={() => navigate('/create')}><Sparkles size={17}/> Create strategy</button></div></div><div className="hero-emblem"><div className="hero-orbit orbit-one"/><div className="hero-orbit orbit-two"/><div className="hero-core"><Activity size={55}/></div></div></div>
    <div className="metrics-grid"><Metric icon={Layers3} label="My strategies" value={myStrategies.length} supporting="In your library" tone="violet"/><Metric icon={FlaskConical} label="Backtests" value={runs.length} supporting={`${completed.length} completed`}/><Metric icon={Activity} label="Active tasks" value={running.length} supporting="Awaiting results" tone="cyan"/><Metric icon={Target} label="Latest result" value={completed.length ? `${completed[0].metrics?.profit_pct ?? '—'}%` : '—'} supporting={completed.length ? completed[0].strategy : 'No results yet'} tone="gold"/></div>
    <div className="dashboard-grid"><div className="dash-main"><SectionHeading eyebrow="MARKET OVERVIEW" title="Live market overview"><button className="text-link" onClick={() => navigate('/terminal')}>View chart <ArrowRight size={15}/></button></SectionHeading><MarketPanel pair={pair} onPair={onPair} timeframe={timeframe} onTimeframe={onTimeframe} compact/></div><div className="dash-aside"><SectionHeading eyebrow="WATCHLIST" title="Market quotes"><button className="icon-btn" onClick={() => navigate('/terminal')} title="Terminal"><ArrowUpRight size={18}/></button></SectionHeading><Panel className="watch-panel"><Watchlist selected={pair} onSelect={onPair} quotes={quotes} compact/></Panel></div></div>
    <div className="dashboard-bottom"><Panel className="recent-panel"><PanelTitle icon={Clock3} title="Recent backtests"><button className="text-link" onClick={() => navigate('/backtests')}>All backtests <ArrowRight size={15}/></button></PanelTitle>{latest.length ? <div className="recent-table"><div className="table-head"><span>STRATEGY</span><span>PAIR</span><span>RESULT</span><span>STATUS</span></div>{latest.map(t => <button className="recent-row" key={t.task_id} onClick={() => navigate('/backtests')}><strong>{t.strategy}</strong><span>{t.pair}</span><span className={t.metrics?.profit_pct != null ? t.metrics.profit_pct >= 0 ? 'positive' : 'negative' : ''}>{t.metrics?.profit_pct != null ? `${t.metrics.profit_pct > 0 ? '+' : ''}${t.metrics.profit_pct}%` : '—'}</span><Status value={t.status}/></button>)}</div> : <Empty icon={FlaskConical} title="No backtests yet" description="Run your first backtest to see results here." action={<button className="btn btn-outline btn-small" onClick={() => navigate('/strategies')}>Choose a strategy</button>}/>}</Panel>
    <Panel className="ai-teaser"><div className="teaser-glow"/><div className="teaser-icon"><Bot size={25}/></div><div className="eyebrow">YOUR AI COPILOT</div><h3>Got an idea?<br/><span>Put it to the test.</span></h3><p>Copilot can find strategies, explain performance metrics, or create a new strategy from your description.</p><button className="btn btn-primary" onClick={() => navigate('/copilot')}>Open AI chat <ArrowRight size={17}/></button></Panel></div>
  </div>
}
function TerminalPage({ pair, onPair, timeframe, onTimeframe, quotes }: { pair: string; onPair: (v: string) => void; timeframe: string; onTimeframe: (v: string) => void; quotes: Record<string, Ticker> }) {
  const current = quotes[pair]
  return <div className="page-container"><SectionHeading eyebrow="LIVE MARKET DATA" title="Trading terminal" description="Explore Spot candlestick charts. Zoom, pan, and switch timeframes."><span className="label-chip"><span className="live-dot"/> Binance market data</span></SectionHeading>
    <div className="terminal-grid"><div><MarketPanel pair={pair} onPair={onPair} timeframe={timeframe} onTimeframe={onTimeframe}/><div className="terminal-stats"><Metric icon={TrendingUp} label="24h high" value={current ? formatMoney(current.high) : '—'} /><Metric icon={TrendingDown} label="24h low" value={current ? formatMoney(current.low) : '—'}/><Metric icon={ArrowLeftRight} label="24h volume" value={current ? formatMoney(current.volume) : '—'} supporting="In quote currency"/></div></div><Panel className="terminal-watch"><PanelTitle icon={BookOpen} title="Watchlist" hint="Spot / USDT"/><Watchlist selected={pair} onSelect={onPair} quotes={quotes}/><div className="notice-muted"><CircleHelp size={15}/> Charts show market prices, not backtest trade entry or exit markers.</div></Panel></div>
  </div>
}
function TestForm({ onSubmit, disabled, compact = false }: { onSubmit: (data: BacktestParams) => Promise<void>; disabled?: boolean; compact?: boolean }) {
  const [pair, setPair] = useState('BTC/USDT')
  const [timeframe, setTimeframe] = useState('1h')
  const [since, setSince] = useState(dateFor(-120))
  const [until, setUntil] = useState(dateFor(-1))
  const [balance, setBalance] = useState('1000')
  const [stop, setStop] = useState('')
  const [fee, setFee] = useState('')
  const [working, setWorking] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setWorking(true)
    const params: BacktestParams = { pair, timeframe, timerange: `${since.replaceAll('-', '')}-${until.replaceAll('-', '')}`, balance: clampNum(balance, 1000) }
    if (stop) params.stoploss_pct = Number(stop)
    if (fee) params.fee_pct = Number(fee)
    try { await onSubmit(params) } finally { setWorking(false) }
  }
  return <form className={`test-form ${compact ? 'test-form-compact' : ''}`} onSubmit={e => void submit(e)}><div className="field-grid"><label className="field"><span>Trading pair</span><PairSelect value={pair} onChange={setPair}/></label><label className="field"><span>Timeframe</span><PairSelect value={timeframe} onChange={setTimeframe} options={timeframes}/></label><label className="field"><span>Start date</span><input type="date" required value={since} max={until} onChange={e => setSince(e.target.value)}/></label><label className="field"><span>End date</span><input type="date" required min={since} max={dateFor()} value={until} onChange={e => setUntil(e.target.value)}/></label><label className="field"><span>Starting balance, USDT</span><input type="number" required min="1" step="any" value={balance} onChange={e => setBalance(e.target.value)}/></label><label className="field"><span>Stoploss, % <small>optional</small></span><input type="number" min="0.1" max="99" step="any" placeholder="Strategy default" value={stop} onChange={e => setStop(e.target.value)}/></label><label className="field"><span>Fee, % <small>optional</small></span><input type="number" min="0" max="99" step="any" placeholder="Default settings" value={fee} onChange={e => setFee(e.target.value)}/></label></div><button type="submit" className="btn btn-primary test-submit" disabled={disabled || working}>{working ? <LoaderCircle size={17} className="spin"/> : <Play size={16}/>} {working ? 'Starting…' : 'Run backtest'}</button><div className="form-hint"><ShieldCheck size={14}/> Results are saved to your account. Market data is downloaded automatically.</div></form>
}
function StrategiesPage({ token, notify }: { token: string; notify: (msg: string, kind?: Notification['kind']) => void }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'mine' | 'public' | 'builtin'>('public')
  const [mine, setMine] = useState<StrategyRecord[]>([])
  const [published, setPublished] = useState<StrategyRecord[]>([])
  const [builtin, setBuiltin] = useState<string[]>([])
  const [selected, setSelected] = useState<{ type: 'builtin' | 'saved'; name: string; id?: string } | null>(null)
  const [details, setDetails] = useState('')
  const [showTester, setShowTester] = useState(false)
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [builtinLoading, setBuiltinLoading] = useState(false)
  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    const results = await Promise.allSettled([api<StrategyRecord[]>('/strategies/mine', {}, token), api<StrategyRecord[]>('/strategies/catalog')])
    if (results[0].status === 'fulfilled') setMine(results[0].value)
    if (results[1].status === 'fulfilled') setPublished(results[1].value)
    if (results.every(r => r.status === 'rejected')) setError('Could not load the strategy catalog. Check the server.')
    setLoading(false)
  }, [token])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (tab !== 'builtin' || builtin.length) return
    let active = true
    setBuiltinLoading(true)
    api<string[]>('/strategies/')
      .then(list => { if (active) setBuiltin(list) })
      .catch(e => { if (active) setError(displayError(e)) })
      .finally(() => { if (active) setBuiltinLoading(false) })
    return () => { active = false }
  }, [tab, builtin.length])
  const entries: { type: 'builtin' | 'saved'; name: string; id?: string; status?: string; profile?: Record<string, unknown> }[] = tab === 'builtin' ? builtin.map(name => ({ type: 'builtin', name })) : (tab === 'mine' ? mine : published).map(item => ({ type: 'saved', name: item.name, id: item.id, status: item.moderation_status, profile: item.profile }))
  const filtered = entries.filter(item => item.name.toLowerCase().includes(filter.toLowerCase()))
  function choose(item: typeof entries[number]) {
    setSelected({ type: item.type, name: item.name, id: item.id }); setShowTester(false); setDetails('')
    if (item.type === 'builtin') void api<{ source_code: string }>(`/strategies/${encodeURIComponent(item.name)}`).then(v => setDetails(v.source_code)).catch(() => {})
  }
  async function submitStrategy(id: string) {
    try { await post(`/strategies/${id}/submit`, {}, token); notify('Strategy submitted for review'); await refresh() }
    catch (e) { notify(displayError(e), 'error') }
  }
  async function run(data: BacktestParams) {
    if (!selected) return
    try {
      const response = selected.type === 'builtin' ? await post<{ task_id: string }>('/backtests/', { ...data, strategy: selected.name }, token) : await post<{ task_id: string }>(`/strategies/${selected.id}/backtest`, data, token)
      notify(`Backtest started · ${shortId(response.task_id)}`)
      navigate('/backtests')
    } catch (e) { notify(displayError(e), 'error') }
  }
  return <div className="page-container"><SectionHeading eyebrow="STRATEGY LIBRARY" title="Strategies" description="Browse strategies, build your own, and test them against historical data."><button className="btn btn-primary" onClick={() => navigate('/create')}><Plus size={16}/> New strategy</button></SectionHeading>
    <div className="strategies-grid"><Panel className="strategy-browser"><div className="segmented">{([['public','Public'],['mine','My strategies'],['builtin','Freqtrade']] as const).map(([key,label]) => <button className={tab===key?'active':''} key={key} onClick={() => { setTab(key); setSelected(null) }}>{label}</button>)}</div><div className="search-box"><Search size={17}/><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Search by name…"/><button className="icon-btn" onClick={() => void refresh()} title="Refresh"><RefreshCw size={15}/></button></div>
      {(loading || builtinLoading) && !entries.length ? <Loading label="Loading strategies…"/> : error ? <div className="inline-error">{error}</div> : filtered.length === 0 ? <Empty icon={Layers3} title="Nothing here yet" description={tab === 'mine' ? 'Create a strategy in the AI Strategy Builder.' : 'No strategies are available yet.'}/> : <div className="strategy-list">{filtered.map(item => <button key={item.id ?? item.name} className={`strategy-item ${selected?.name === item.name && selected?.id === item.id ? 'active' : ''}`} onClick={() => choose(item)}><span className="strategy-item-icon"><Code2 size={17}/></span><span className="strategy-item-copy"><strong>{item.name}</strong><small>{item.type === 'builtin' ? 'Freqtrade · Built-in' : item.status === 'approved' ? 'Public · Approved' : 'Saved strategy'}</small></span><ChevronRight size={16}/></button>)}</div>}
      <div className="browser-foot"><Database size={14}/> {entries.length} strategies in this section</div></Panel>
      <Panel className="strategy-detail">{!selected ? <Empty icon={BookOpen} title="Select a strategy" description="Select a strategy to view details and run a backtest."/> : <><div className="detail-heading"><span className="detail-icon"><Code2 size={24}/></span><div><div className="eyebrow">STRATEGY DETAILS</div><h3>{selected.name}</h3><p>{selected.type === 'builtin' ? 'Built-in Freqtrade strategy' : 'Catalog strategy'}</p></div></div>
        {selected.type === 'saved' && <div className="detail-data">{(() => { const item = [...mine, ...published].find(s => s.id === selected.id); return <><div><span>Visibility</span><strong>{item?.visibility === 'public' ? 'Public' : 'Private'}</strong></div><div><span>Moderation</span>{item ? <Status value={item.moderation_status}/> : '—'}</div><div><span>Version</span><strong>v{item?.version ?? 1}</strong></div></> })()}</div>}
        {selected.type === 'builtin' && details && <div className="source-preview"><div className="source-caption"><Code2 size={15}/> Source code <span>Python</span></div><pre>{details.slice(0, 4500)}</pre></div>}
        <div className="detail-actions"><button className="btn btn-primary" onClick={() => setShowTester(v => !v)}><FlaskConical size={17}/> {showTester ? 'Hide settings' : 'Run backtest'}</button>{tab === 'mine' && selected.id && mine.find(s => s.id === selected.id)?.moderation_status && ['not_requested','rejected'].includes(mine.find(s => s.id === selected.id)!.moderation_status) && <button className="btn btn-outline" onClick={() => void submitStrategy(selected.id!)}><Send size={16}/> Submit for review</button>}</div>
        {showTester && <div className="detail-tester"><h4>Backtest settings</h4><TestForm onSubmit={run}/></div>}
        <div className="help-strip"><CircleHelp size={16}/> AI strategies run in an isolated sandbox. Built-in strategies run in the standard Freqtrade engine.</div>
      </>}</Panel></div>
  </div>
}
function CreatorPage({ token, notify }: { token: string; notify: (msg: string, kind?: Notification['kind']) => void }) {
  const navigate = useNavigate()
  const [description, setDescription] = useState('')
  const [working, setWorking] = useState(false)
  const [draft, setDraft] = useState<DraftResult | null>(null)
  const [detail, setDetail] = useState<DraftDetail | null>(null)
  const [error, setError] = useState('')
  const [runForm, setRunForm] = useState(false)
  async function generate() {
    if (description.trim().length < 10) return
    setWorking(true); setError(''); setDraft(null); setDetail(null)
    try {
      const result = await post<DraftResult>('/drafts/generate', { request: description }, token)
      setDraft(result)
      void api<DraftDetail>(`/drafts/${result.id}`, {}, token).then(setDetail).catch(() => {})
      notify('Draft generated and automatically validated')
    } catch (e) { setError(displayError(e)) } finally { setWorking(false) }
  }
  async function action(path: string, success: string) {
    if (!draft) return
    setWorking(true)
    try {
      await post(path, {}, token)
      notify(success)
      if (path.endsWith('/approve')) setDraft(d => d ? { ...d, status: 'approved_for_backtest' } : d)
      if (path.endsWith('/save')) navigate('/strategies')
    } catch (e) { notify(displayError(e), 'error') } finally { setWorking(false) }
  }
  async function run(data: BacktestParams) {
    if (!draft) return
    try {
      await post(`/drafts/${draft.id}/backtest`, data, token)
      notify('Draft backtest started'); navigate('/backtests')
    } catch (e) { notify(displayError(e), 'error') }
  }
  return <div className="page-container"><SectionHeading eyebrow="AI STRATEGY LAB" title="AI Strategy Builder" description="Describe a trading idea. The generator writes code, the reviewer checks its logic, and the validator checks Freqtrade compatibility."><span className="label-chip"><ShieldCheck size={14}/> Human-in-the-loop</span></SectionHeading>
    <div className="creator-grid"><Panel className="creator-input"><div className="creator-icon"><Sparkles size={24}/></div><h3>Turn an idea into a strategy</h3><p>Specify indicators, entry and exit rules, timeframe, and risk limits. Generation only starts when you ask.</p><label className="field"><span>Trading idea</span><textarea rows={8} value={description} onChange={e => setDescription(e.target.value)} placeholder="Example: Create a BTC/USDT Spot strategy that buys when EMA 20 crosses above EMA 50, using RSI as an additional filter…"/></label><div className="suggestion-title">STARTING POINTS</div><div className="suggestions">{['EMA 20/50 with RSI filter on 1h', 'Bollinger Bands mean-reversion strategy', 'MACD + trend filter on 4h'].map(t => <button key={t} onClick={() => setDescription(`Create a Freqtrade Spot strategy: ${t}. Define clear entry and exit rules.`)}>{t} <ArrowUpRight size={14}/></button>)}</div>{error && <div className="inline-error"><XCircle size={15}/>{error}</div>}<button className="btn btn-primary generate-button" disabled={working || description.trim().length < 10} onClick={() => void generate()}>{working ? <LoaderCircle className="spin" size={18}/> : <Sparkles size={18}/>} {working ? 'Generator and reviewer are working…' : 'Generate and validate'}</button></Panel>
    <div className="creator-output"><Panel className="pipeline-card"><div className="panel-title"><strong>Review workflow</strong><span className="label-chip">AUTOMATED</span></div><div className="pipeline-steps">{[{ icon: Sparkles, name: 'AI Generator', desc: 'Generate Python code' }, { icon: Eye, name: 'AI Reviewer', desc: 'Review strategy logic' }, { icon: ShieldCheck, name: 'Freqtrade Validator', desc: 'Validate compatibility' }, { icon: CheckCircle2, name: 'Human Approval', desc: 'Your final approval' }].map((step, i) => <div className="pipeline-step" key={step.name}><span className={`pipeline-step-icon ${draft && i < 3 ? 'done' : ''}`}><step.icon size={17}/></span><div><strong>{step.name}</strong><span>{step.desc}</span></div>{draft && i < 3 && <Check size={16} className="positive"/>}</div>)}</div></Panel>
      <Panel className="draft-card"><PanelTitle icon={Code2} title="Generation result"/>{!draft ? <Empty icon={Sparkles} title="Your draft will appear here" description="After generation, you can inspect the code, approve the draft, save it, or backtest it."/> : <><div className="draft-result-heading"><div><div className="eyebrow">GENERATED STRATEGY</div><h3>{draft.name}</h3><small>ID {shortId(draft.id)}</small></div><Status value={draft.status}/></div>{draft.review && <div className="review-result"><span><CheckCircle2 size={16}/> AI review: {draft.review.approved ? 'passed' : 'issues found'}</span><span>Validation: {draft.validation?.status || '—'}</span></div>}{detail?.source_code && <div className="source-preview"><div className="source-caption"><Code2 size={15}/> Python <button onClick={() => { void navigator.clipboard.writeText(detail.source_code); notify('Code copied') }}><Copy size={14}/> Copy</button></div><pre>{detail.source_code}</pre></div>}<div className="draft-actions">{draft.status === 'pending_approval' && <button className="btn btn-primary" disabled={working} onClick={() => void action(`/drafts/${draft.id}/approve`, 'Strategy approved by you')}><Check size={16}/> Approve draft</button>}{draft.status === 'approved_for_backtest' && <><button className="btn btn-outline" disabled={working} onClick={() => void action(`/drafts/${draft.id}/save`, 'Strategy saved')}><Database size={16}/> Save</button><button className="btn btn-primary" onClick={() => setRunForm(v => !v)}><FlaskConical size={16}/> Backtest</button></>}</div>{runForm && draft.status === 'approved_for_backtest' && <div className="draft-test"><TestForm onSubmit={run} compact/></div>}</>}</Panel></div></div>
  </div>
}
function BacktestsPage({ token, notify }: { token: string; notify: (msg: string, kind?: Notification['kind']) => void }) {
  const navigate = useNavigate()
  const [runs, setRuns] = useState<Backtest[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [marked, setMarked] = useState<string[]>([])
  const [compare, setCompare] = useState<CompareResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [equity, setEquity] = useState<{ id: string; points: EquityPoint[] } | null>(null)
  const [equityLoading, setEquityLoading] = useState(false)
  const refresh = useCallback(async () => { try { const result = await api<Backtest[]>('/backtests/', {}, token); setRuns(result); setError('') } catch (e) { setError(displayError(e)) } finally { setLoading(false) } }, [token])
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 10000); return () => clearInterval(timer) }, [refresh])
  const done = runs.filter(x => x.status === 'completed')
  const current = runs.find(x => x.task_id === selected) || runs[0]
  const currentId = current?.task_id
  const currentStatus = current?.status
  useEffect(() => {
    if (!currentId || currentStatus !== 'completed') {
      setEquity(null)
      setEquityLoading(false)
      return
    }
    let alive = true
    setEquity(null)
    setEquityLoading(true)
    void api<Backtest & { equity_curve?: EquityPoint[] }>(`/backtests/${currentId}`, {}, token)
      .then(result => {
        if (!alive) return
        const points = Array.isArray(result.equity_curve)
          ? result.equity_curve.filter(p => p && typeof p.time === 'string' && typeof p.balance === 'number' && Number.isFinite(p.balance))
          : []
        setEquity({ id: currentId, points })
      })
      .catch(() => { if (alive) setEquity({ id: currentId, points: [] }) })
      .finally(() => { if (alive) setEquityLoading(false) })
    return () => { alive = false }
  }, [currentId, currentStatus, token])
  const equityPoints = equity?.id === currentId ? equity.points : []
  const equityPositive = equityPoints.length < 2 || equityPoints[equityPoints.length - 1].balance >= equityPoints[0].balance
  async function deleteRun(run: Backtest) {
    if (run.status === 'running' || run.status === 'pending' || deleting) return
    if (!window.confirm(`Delete ${run.strategy} (${shortId(run.task_id)}) from your backtest history?`)) return
    setDeleting(run.task_id)
    try {
      await api<{ deleted: boolean }>(`/backtests/${run.task_id}`, { method: 'DELETE' }, token)
      setRuns(previous => previous.filter(item => item.task_id !== run.task_id))
      setMarked(previous => previous.filter(id => id !== run.task_id))
      setSelected(previous => previous === run.task_id ? null : previous)
      setCompare(null)
      notify('Backtest deleted')
    } catch (e) {
      notify(displayError(e), 'error')
    } finally {
      setDeleting(null)
    }
  }
  async function runCompare() {
    if (marked.length < 2) return
    try { setCompare(await post('/backtests/compare', { task_ids: marked }, token)); notify('Comparison complete') }
    catch (e) { notify(displayError(e), 'error') }
  }
  return <div className="page-container"><SectionHeading eyebrow="STRATEGY PERFORMANCE" title="Backtests" description="Actual Freqtrade results, backtest comparisons, and run history."><button className="btn btn-outline" onClick={() => void refresh()}><RefreshCw size={16}/> Refresh</button><button className="btn btn-primary" onClick={() => navigate('/strategies')}><Plus size={16}/> New backtest</button></SectionHeading>
    <div className="metrics-grid"><Metric icon={FlaskConical} label="Total runs" value={runs.length}/><Metric icon={CheckCircle2} label="Completed" value={done.length} tone="cyan"/><Metric icon={Clock3} label="In progress" value={runs.filter(x => x.status === 'pending' || x.status === 'running').length}/><Metric icon={Target} label="Best return" value={done.length ? `${Math.max(...done.map(x => x.metrics?.profit_pct ?? -Infinity)).toFixed(2)}%` : '—'} supporting="Across your completed runs" tone="gold"/></div>
    <div className="backtest-grid">
      <Panel className="backtest-list">
        <PanelTitle icon={Clock3} title="Run history" hint={`${runs.length} records`}/>
        {loading ? <Loading/> : error ? <div className="inline-error">{error}</div> : !runs.length ?
          <Empty icon={FlaskConical} title="No backtests yet" description="Select a strategy and run it on historical data." action={<button className="btn btn-outline btn-small" onClick={() => navigate('/strategies')}>Go to strategies</button>}/> :
          <div className="run-list">
            {runs.map(run => (
              <div key={run.task_id} className={`run-item ${current?.task_id === run.task_id ? 'active' : ''}`}>
                <label className="run-check" title={run.status === 'completed' ? 'Add to comparison' : 'Wait for completion first'}>
                  <input type="checkbox" disabled={run.status !== 'completed'} checked={marked.includes(run.task_id)} onChange={e => setMarked(old => e.target.checked ? [...old, run.task_id] : old.filter(x => x !== run.task_id))}/>
                </label>
                <button className="run-main" onClick={() => setSelected(run.task_id)}>
                  <strong>{run.strategy}</strong>
                  <span>{run.pair} · {run.timeframe} · {prettyDate(run.created_at)}</span>
                </button>
                <div className="run-end">
                  <span className={run.metrics?.profit_pct != null ? run.metrics.profit_pct >= 0 ? 'positive' : 'negative' : ''}>
                    {run.metrics?.profit_pct != null ? `${run.metrics.profit_pct > 0 ? '+' : ''}${run.metrics.profit_pct}%` : '—'}
                  </span>
                  <Status value={run.status}/>
                </div>
                <button
                  type="button"
                  className="run-delete"
                  disabled={run.status === 'pending' || run.status === 'running' || deleting !== null}
                  title="Delete from history"
                  aria-label={`Delete ${run.strategy} backtest`}
                  onClick={() => void deleteRun(run)}
                >
                  {deleting === run.task_id ? <LoaderCircle size={16} className="spin"/> : <Trash2 size={16}/>}
                </button>
              </div>
            ))}
          </div>}

        {marked.length >= 2 && <div className="compare-bar"><span>{marked.length} selected for comparison</span><button className="btn btn-primary btn-small" onClick={() => void runCompare()}><ArrowLeftRight size={15}/> Compare</button></div>}</Panel>
      <Panel className="backtest-detail"><PanelTitle icon={Gauge} title="Backtest details"/>{!current ? <Empty icon={Activity} title="Select a backtest" description="Results and metrics will appear after a run completes."/> : <><div className="result-hero"><div className="eyebrow">BACKTEST RESULT</div><h3>{current.strategy}</h3><div className="result-subtitle">{current.pair} · {current.timeframe} · {current.timerange}</div><Status value={current.status}/></div>{current.error && <div className="inline-error"><XCircle size={16}/>{current.error}</div>}{current.status === 'completed' && current.metrics && <div className="result-metrics">{[{ label: 'Profit', key: 'profit_pct', suffix: '%' }, { label: 'Trades', key: 'total_trades', suffix: '' }, { label: 'Max drawdown', key: 'max_drawdown_pct', suffix: '%' }, { label: 'Sharpe', key: 'sharpe', suffix: '' }, { label: 'Win rate', key: 'win_rate_pct', suffix: '%' }, { label: 'Profit factor', key: 'profit_factor', suffix: '' }].map(m => <div key={m.key}><span>{m.label}</span><strong>{current.metrics?.[m.key] == null ? '—' : `${Number(current.metrics[m.key]).toFixed(m.key === 'total_trades' ? 0 : 2)}${m.suffix}`}</strong></div>)}</div>}{current.status !== 'completed' && !current.error && <div className="notice-muted"><LoaderCircle className="spin" size={16}/> {current.status === 'running' ? 'Backtest is running on historical data.' : 'Backtest is queued.'}</div>}</>}</Panel></div>
    {compare && <Panel className="compare-panel"><PanelTitle icon={ArrowLeftRight} title="Strategy comparison"><button className="icon-btn" onClick={() => setCompare(null)}><X size={17}/></button></PanelTitle><div className="compare-results">{Object.entries(compare.leaders).map(([key,value]) => <div key={key}><span>{({ highest_profit: 'Highest profit', lowest_drawdown: 'Lowest drawdown', best_sharpe: 'Best Sharpe', best_sortino: 'Best Sortino', best_win_rate: 'Best win rate', best_profit_factor: 'Best profit factor' } as Record<string,string>)[key] || key}</span><strong>{shortId(value.task_id)} · {Number(value.value).toFixed(2)}</strong></div>)}</div></Panel>}
    <Panel className="performance-panel">
      <PanelTitle icon={Activity} title="Equity Curve" hint={current?.status === 'completed' ? current.strategy : 'Select a completed run'}/>
      {equityLoading ? <Loading label="Loading balance history…"/> : current?.status !== 'completed' ?
        <Empty icon={Activity} title="Select a completed backtest" description="A strategy's balance history will appear here."/> :
        equityPoints.length > 0 ?
          <>
            <div className="equity-summary">
              <div><span>Starting balance</span><strong>{formatMoney(equityPoints[0].balance)}</strong></div>
              <div><span>Final realized balance</span><strong className={equityPositive ? 'positive' : 'negative'}>{formatMoney(equityPoints[equityPoints.length - 1].balance)}</strong></div>
              <div><span>Closed-trade change</span><strong className={equityPositive ? 'positive' : 'negative'}>{formatMoney(equityPoints[equityPoints.length - 1].balance - equityPoints[0].balance)}</strong></div>
            </div>
            <div className="performance-chart equity-chart">
              <ResponsiveContainer width="100%" height={290}>
                <AreaChart data={equityPoints} margin={{ top: 12, right: 20, left: 8, bottom: 5 }}>
                  <defs>
                    <linearGradient id="equityAreaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={equityPositive ? '#b6ef79' : '#ff7d84'} stopOpacity={0.28}/>
                      <stop offset="100%" stopColor={equityPositive ? '#b6ef79' : '#ff7d84'} stopOpacity={0.015}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#1e2a32" strokeDasharray="3 4"/>
                  <XAxis dataKey="time" tickFormatter={value => {
                    const d = new Date(String(value))
                    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  }} minTickGap={35} tick={{ fill: '#8193a0', fontSize: 11 }} axisLine={false} tickLine={false}/>
                  <YAxis domain={['auto', 'auto']} width={78} tickFormatter={v => formatMoney(Number(v))} tick={{ fill: '#8193a0', fontSize: 11 }} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{ background: '#111d25', border: '1px solid #29404a', color: '#eff8f9', borderRadius: 12 }}
                    labelFormatter={value => prettyDate(String(value))}
                    formatter={(v: unknown) => [formatMoney(Number(v)), 'Realized balance']}/>
                  <Area type="monotone" dataKey="balance" stroke={equityPositive ? '#b6ef79' : '#ff7d84'} strokeWidth={2.5}
                    fill="url(#equityAreaFill)" dot={false} activeDot={{ r: 4 }}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="notice-muted">Balance after closed trades. Open-position profit and loss is not included.</div>
          </> :
          <Empty icon={Activity} title="Balance history unavailable" description="This run has no closed-trade balance history yet. Total profit and risk metrics remain available above."/>}
    </Panel>
  </div>
}
type DcaResult = {
  pair: string; purchases: number; total_invested: number; final_price: number;
  final_value: number; profit: number; profit_pct: number;
  orders: { date: string; price: number; amount: number; fee: number; quantity: number }[]
}
function DcaPage({ token, notify }: { token: string; notify: (msg: string, kind?: Notification['kind']) => void }) {
  const [pair, setPair] = useState('BTC/USDT')
  const [amount, setAmount] = useState('100')
  const [weekday, setWeekday] = useState('0')
  const [hour, setHour] = useState('12')
  const [timezone, setTimezone] = useState('Asia/Tbilisi')
  const [start, setStart] = useState(dateFor(-14))
  const [end, setEnd] = useState(dateFor(-1))
  const [working, setWorking] = useState(false)
  const [result, setResult] = useState<DcaResult | null>(null)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setWorking(true); setResult(null)
    try {
      const data = await post<DcaResult>('/investments/dca', {
        pair, amount: Number(amount), weekday: Number(weekday), hour: Number(hour), minute: 0,
        timezone, start: `${start}T00:00:00`, end: `${end}T23:00:00`, fee_pct: 0.1,
      }, token)
      setResult(data); notify('DCA simulation complete')
    } catch (e) { notify(displayError(e), 'error') } finally { setWorking(false) }
  }
  return <div className="page-container"><SectionHeading eyebrow="INVESTMENT SIMULATOR" title="DCA Simulator" description="Simulate recurring investments using historical minute candles without placing real trades."/>
    <div className="dca-grid"><Panel className="dca-config"><PanelTitle icon={SlidersHorizontal} title="Simulation settings"/><form onSubmit={e => void submit(e)} className="dca-form"><label className="field"><span>Trading pair</span><PairSelect value={pair} onChange={setPair}/></label><label className="field"><span>Amount per purchase, USDT</span><input required type="number" min="1" step="any" value={amount} onChange={e => setAmount(e.target.value)}/></label><div className="field-grid"><label className="field"><span>Day of week</span><PairSelect value={weekday} onChange={setWeekday} options={['0','1','2','3','4','5','6']}/><small>0 = Monday, 6 = Sunday</small></label><label className="field"><span>Purchase hour</span><input required type="number" min="0" max="23" value={hour} onChange={e => setHour(e.target.value)}/></label></div><label className="field"><span>Time zone</span><input value={timezone} onChange={e => setTimezone(e.target.value)} placeholder="Asia/Tbilisi"/></label><div className="field-grid"><label className="field"><span>Start</span><input type="date" max={end} required value={start} onChange={e => setStart(e.target.value)}/></label><label className="field"><span>End</span><input type="date" min={start} max={dateFor()} required value={end} onChange={e => setEnd(e.target.value)}/></label></div><div className="help-strip"><CircleHelp size={15}/> Uses the existing DCA API with a 0.1% fee. Each purchase requires a matching historical 1m candle.</div><button className="btn btn-primary" disabled={working}>{working ? <LoaderCircle size={17} className="spin"/> : <Play size={17}/>} {working ? 'Calculating…' : 'Run simulation'}</button></form></Panel>
      <div className="dca-results"><Panel><PanelTitle icon={Target} title="DCA results"/>{result ? <><div className="dca-result-hero"><div className="eyebrow">TOTAL RETURN</div><strong className={result.profit_pct >= 0 ? 'positive' : 'negative'}>{result.profit_pct >= 0 ? '+' : ''}{result.profit_pct.toFixed(2)}%</strong><span>{result.pair} · {result.purchases} purchases</span></div><div className="result-metrics"><div><span>Invested</span><strong>{formatMoney(result.total_invested)}</strong></div><div><span>Final value</span><strong>{formatMoney(result.final_value)}</strong></div><div><span>Profit</span><strong>{formatMoney(result.profit)}</strong></div><div><span>Final price</span><strong>{formatMoney(result.final_price)}</strong></div></div></> : <Empty icon={Wallet} title="Results will appear here" description="Set a purchase schedule and click Run simulation."/>}</Panel>{result && <Panel className="orders-panel"><PanelTitle icon={CalendarDays} title="Purchase history" hint={`${result.orders.length} transactions`}/><div className="orders-table"><div className="table-head"><span>DATE</span><span>PRICE</span><span>PURCHASED</span></div>{result.orders.map(order => <div className="order-row" key={order.date}><span>{prettyDate(order.date)}</span><strong>{formatMoney(order.price)}</strong><span>{order.quantity.toFixed(6)}</span></div>)}</div></Panel>}</div></div>
  </div>
}
function AdminPage({ token, notify }: { token: string; notify: (msg: string, kind?: Notification['kind']) => void }) {
  const [pending, setPending] = useState<StrategyRecord[]>([])
  const [published, setPublished] = useState<StrategyRecord[]>([])
  const [selected, setSelected] = useState<StrategyRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [p, pub] = await Promise.all([api<StrategyRecord[]>('/strategies/moderation/pending', {}, token), api<StrategyRecord[]>('/strategies/catalog', {}, token)])
      setPending(p); setPublished(pub); setError('')
    } catch (e) { setError(displayError(e)) } finally { setLoading(false) }
  }, [token])
  useEffect(() => { void refresh() }, [refresh])
  async function moderate(id: string, action: 'approve' | 'reject') {
    setBusy(true)
    try { await post(`/strategies/${id}/moderate`, { action }, token); notify(action === 'approve' ? 'Strategy published' : 'Strategy rejected'); setSelected(null); await refresh() }
    catch (e) { notify(displayError(e), 'error') } finally { setBusy(false) }
  }
  async function hide(id: string) {
    setBusy(true)
    try { await post(`/strategies/${id}/hide`, {}, token); notify('Strategy hidden from catalog'); await refresh() }
    catch (e) { notify(displayError(e), 'error') } finally { setBusy(false) }
  }
  return <div className="page-container"><SectionHeading eyebrow="ADMIN CONTROL CENTER" title="Strategy moderation" description="Review submitted source code and manage the public catalog."><button className="btn btn-outline" onClick={() => void refresh()}><RefreshCw size={16}/> Refresh</button></SectionHeading>
    <div className="admin-banner"><div className="admin-banner-icon"><ShieldCheck size={24}/></div><div><strong>Admin dashboard</strong><p>Only moderator-approved strategies appear in the public catalog.</p></div><div className="admin-pending-count"><strong>{pending.length}</strong><span>pending review</span></div></div>
    {error && <div className="inline-error">{error}</div>}
    <div className="admin-grid"><Panel className="admin-queue"><PanelTitle icon={Clock3} title="Review queue" hint={`${pending.length} submissions`}/>{loading ? <Loading/> : pending.length === 0 ? <Empty icon={CheckCircle2} title="Queue is clear" description="No new strategies awaiting review."/> : <div className="admin-list">{pending.map(item => <button key={item.id} className={`admin-item ${selected?.id === item.id ? 'active' : ''}`} onClick={() => setSelected(item)}><span className="admin-item-icon"><Code2 size={18}/></span><span><strong>{item.name}</strong><small>Owner {shortId(item.owner_id ?? '')}</small></span><ChevronRight size={16}/></button>)}</div>}</Panel><Panel className="admin-preview"><PanelTitle icon={Eye} title="Source code review"/>{!selected ? <Empty icon={Code2} title="Select a submission" description="The submitted source code will appear here for your review."/> : <><div className="detail-heading"><div><div className="eyebrow">PENDING REVIEW</div><h3>{selected.name}</h3><p>ID {shortId(selected.id)}</p></div><Status value="pending"/></div>{selected.source_code ? <div className="source-preview admin-source"><div className="source-caption"><Code2 size={15}/> Python source</div><pre>{selected.source_code}</pre></div> : <div className="inline-error">Source file is unavailable. Approval is disabled.</div>}<div className="admin-buttons"><button className="btn btn-outline" disabled={busy} onClick={() => void moderate(selected.id, 'reject')}><X size={16}/> Reject</button><button className="btn btn-primary" disabled={busy || !selected.source_code} onClick={() => void moderate(selected.id, 'approve')}><Check size={16}/> Approve</button></div></>}</Panel></div>
    <Panel className="published-panel"><PanelTitle icon={BookOpen} title="Published strategies" hint={`${published.length} in catalog`}/>{published.length === 0 ? <Empty icon={Layers3} title="No published strategies yet" description="Approved strategies will appear here."/> : <div className="published-list">{published.map(item => <div className="published-row" key={item.id}><span className="strategy-item-icon"><Code2 size={16}/></span><div><strong>{item.name}</strong><span>Version {item.version || 1} · {shortId(item.id)}</span></div><Status value="approved"/><button disabled={busy} className="btn btn-outline btn-small" onClick={() => void hide(item.id)}><Eye size={14}/> Hide</button></div>)}</div>}</Panel>
  </div>
}
function NotFound() { const navigate = useNavigate(); return <div className="page-container"><Empty icon={Compass} title="Page not found" description="Return to your workspace." action={<button className="btn btn-primary" onClick={() => navigate('/')}>Back to dashboard</button>}/></div> }
const PAGE_TITLES: Record<string, string> = { '/': 'Overview', '/terminal': 'Terminal', '/strategies': 'Strategies', '/backtests': 'Backtests', '/dca': 'DCA Simulator', '/create': 'AI Strategy Builder', '/copilot': 'AI Copilot', '/admin': 'Moderation' }
function Workspace({ user, token, logout }: { user: User; token: string; logout: () => void }) {
  const location = useLocation()
  const [menu, setMenu] = useState(false)
  const [chat, setChat] = useState(false)
  const [pair, setPair] = useState('BTC/USDT')
  const [timeframe, setTimeframe] = useState('1h')
  const [notifications, setNotifications] = useState<Notification[]>([])
  const { data: quotes } = useWatchlist()
  const notify = useCallback((message: string, kind: Notification['kind'] = 'success') => {
    const id = Date.now() + Math.random()
    setNotifications(old => [...old.slice(-3), { id, message, kind }])
    window.setTimeout(() => setNotifications(old => old.filter(n => n.id !== id)), 6000)
  }, [])
  useEffect(() => { setMenu(false) }, [location.pathname])
  const title = PAGE_TITLES[location.pathname] || 'Workspace'
  return <div className="app-shell"><div className={`side-wrap ${menu ? 'mobile-open' : ''}`}><Sidebar user={user} logout={logout} close={() => setMenu(false)}/></div>{menu && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMenu(false)}/>}
    <div className="main-shell"><AppHeader user={user} title={title} toggleMenu={() => setMenu(v => !v)} toggleChat={() => setChat(v => !v)}/><main className="main-scroll"><Routes><Route path="/" element={<Dashboard token={token} pair={pair} onPair={setPair} timeframe={timeframe} onTimeframe={setTimeframe} quotes={quotes}/>}/><Route path="/terminal" element={<TerminalPage pair={pair} onPair={setPair} timeframe={timeframe} onTimeframe={setTimeframe} quotes={quotes}/>}/><Route path="/strategies" element={<StrategiesPage token={token} notify={notify}/>}/><Route path="/backtests" element={<BacktestsPage token={token} notify={notify}/>}/><Route path="/dca" element={<DcaPage token={token} notify={notify}/>}/><Route path="/create" element={<CreatorPage token={token} notify={notify}/>}/><Route path="/copilot" element={<div className="page-container copilot-page"><SectionHeading eyebrow="AI TRADING ASSISTANT" title="AI Copilot" description="Your assistant for strategies, backtests, and market analysis."/><ChatPanel key={user.username} token={token} username={user.username} embedded/></div>}/><Route path="/admin" element={user.role === 'admin' ? <AdminPage token={token} notify={notify}/> : <Navigate to="/" replace/>}/><Route path="*" element={<NotFound/>}/></Routes></main></div>
    {chat && <><div className="chat-backdrop" onClick={() => setChat(false)}/><div className="floating-chat"><ChatPanel token={token} username={user.username} onClose={() => setChat(false)}/></div></>}
    <div className="toasts">{notifications.map(n => <div key={n.id} className={`toast toast-${n.kind}`}>{n.kind === 'error' ? <XCircle size={17}/> : <CheckCircle2 size={17}/>}<span>{n.message}</span><button onClick={() => setNotifications(old => old.filter(x => x.id !== n.id))}><X size={16}/></button></div>)}</div>
  </div>
}
export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('tr-access-token') || '')
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(Boolean(token))
  const logout = useCallback(() => { sessionStorage.removeItem('tr-access-token'); setToken(''); setUser(null); setChecking(false) }, [])
  useEffect(() => {
    window.addEventListener('tr-auth-expired', logout)
    return () => window.removeEventListener('tr-auth-expired', logout)
  }, [logout])
  useEffect(() => {
    if (!token) { setChecking(false); return }
    let active = true
    setChecking(true)
    api<User>('/auth/me', {}, token)
      .then(result => { if (active) setUser(result) })
      .catch(error => { if (active) { if (error instanceof ApiError && error.status === 401) logout(); else setUser(null) } })
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [token, logout])
  async function login(value: string) {
    const profile = await api<User>('/auth/me', {}, value)
    sessionStorage.setItem('tr-access-token', value)
    setToken(value); setUser(profile); setChecking(false)
  }
  if (checking) return <div className="startup"><span className="logo-square"><Activity size={25}/></span><LoaderCircle className="spin" size={25}/><p>Connecting to your workspace…</p></div>
  if (!token || !user) return <AuthScreen onLogin={login}/>
  return <Workspace user={user} token={token} logout={logout}/>
}
