
import { useEffect, useRef, useState } from 'react'
import { init, dispose, type CandleType } from 'klinecharts'
import { AlertCircle, RotateCw } from 'lucide-react'
import { loadCandles } from '../lib/market'

export function Candles({
  pair,
  timeframe,
  height = 390,
}: {
  pair: string
  timeframe: string
  height?: number
}) {
  const element = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const container = element.current
    if (!container) return
    let cancelled = false

    let socket: WebSocket | null = null

    const chart = init(container, {
      styles: {
        grid: {
          horizontal: { show: true, color: '#1c2a35' },
          vertical: { show: true, color: '#16232d' },
        },
        candle: {
          type: 'candle_solid' as CandleType,
          bar: {
            upColor: '#b6ef79',
            downColor: '#fa6976',
            upBorderColor: '#b6ef79',
            downBorderColor: '#fa6976',
            upWickColor: '#b6ef79',
            downWickColor: '#fa6976',
          },
        },
      },
    })

    if (!chart) {
      setError('Chart initialization failed')
      setLoading(false)
      return
    }

    chart.createIndicator('VOL', false)

    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(container)

    setLoading(true)
    setError('')

    loadCandles(pair, timeframe)
      .then(data => {
        if (cancelled) return
        if (!data.length) throw new Error('No candles returned')

        chart.applyNewData(data)
        console.log('Candles loaded:', pair, data.length)
        const symbol = pair.replace('/', '').toLowerCase()

        socket = new WebSocket(
          `wss://stream.binance.com:9443/ws/${symbol}@kline_${timeframe}`
        )

        socket.onmessage = (event) => {
          if (cancelled) return

          const message = JSON.parse(event.data)
          if (!message.k) return

          const k = message.k

          chart.updateData({
            timestamp: Number(k.t),
            open: Number(k.o),
            high: Number(k.h),
            low: Number(k.l),
            close: Number(k.c),
            volume: Number(k.v),
          })
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      socket?.close()
      observer.disconnect()
      dispose(container)
    }
  }, [pair, timeframe, reload])

  return (
    <div className="chart-wrap" style={{ height }}>
      <div ref={element} className="chart-surface" />

      {loading && (
        <div className="chart-overlay">
          <div className="spinner" />
          <span>Loading historical candles...</span>
        </div>
      )}

      {!loading && error && (
        <div className="chart-overlay chart-error">
          <AlertCircle size={22} />
          <span>{error}</span>
          <button
            className="btn btn-ghost btn-small"
            onClick={() => setReload(x => x + 1)}
          >
            <RotateCw size={14} /> Retry
          </button>
        </div>
      )}
    </div>
  )
}
