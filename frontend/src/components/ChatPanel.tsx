import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Bot, CircleHelp, LoaderCircle, MessageCircle, Plus, Sparkles, X } from 'lucide-react'
import { displayError, post } from '../lib/api'

type Message = { role: 'user' | 'assistant'; content: string }

export default function ChatPanel({ token, username, embedded = false, onClose }: { token: string; username: string; embedded?: boolean; onClose?: () => void }) {
  const key = `tr-chat-${username}`
  const [messages, setMessages] = useState<Message[]>(() => {
    try { return (JSON.parse(localStorage.getItem(key) || '[]') as Message[]).slice(-60) } catch { return [] }
  })
  const [draft, setDraft] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const bottom = useRef<HTMLDivElement>(null)
  useEffect(() => { localStorage.setItem(key, JSON.stringify(messages.slice(-60))); bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [key, messages])

  async function send(text = draft) {
    const value = text.trim()
    if (!value || working) return
    setError('')
    setDraft('')
    const previous = messages
    setMessages([...previous, { role: 'user', content: value }])
    setWorking(true)
    try {
      const result = await post<{ reply: string }>('/ai/chat', { message: value, history: previous.slice(-10) }, token)
      setMessages(old => [...old, { role: 'assistant', content: result.reply || 'No response received.' }])
    } catch (e) { setError(displayError(e)) }
    finally { setWorking(false) }
  }
  return <section className={`chat-panel ${embedded ? 'chat-page' : ''}`}>
    <header className="chat-heading">
      <div className="chat-avatar"><Sparkles size={20}/></div>
      <div className="chat-heading-text"><strong>QuantForge Copilot</strong><span><i className="online-dot"/> AI assistant · Gemini</span></div>
      <button className="icon-btn" title="New conversation" onClick={() => { setMessages([]); setError('') }}><Plus size={18}/></button>
      {onClose && <button className="icon-btn" title="Close" onClick={onClose}><X size={18}/></button>}
    </header>
    <div className="chat-messages">
      {!messages.length && <div className="chat-welcome">
        <div className="chat-welcome-icon"><Bot size={29}/></div>
        <h3>Your trading copilot</h3>
        <p>Ask about strategies, indicators, and results. New strategies are generated only when you request them.</p>
        <div className="prompt-chips">
          {['What strategies are available?', 'Explain RSI and MACD', 'How do I assess drawdown?'].map(v => <button key={v} onClick={() => send(v)}>{v}</button>)}
        </div>
      </div>}
      {messages.map((message, index) => <div key={index} className={`message ${message.role}`}>
        {message.role === 'assistant' && <span className="mini-bot"><Sparkles size={14}/></span>}
        <div className="message-content">{message.content}</div>
      </div>)}
      {working && <div className="message assistant"><span className="mini-bot"><Sparkles size={14}/></span><div className="message-content typing"><span/><span/><span/></div></div>}
      {error && <div className="error-text" role="alert"><CircleHelp size={15}/> {error} <button onClick={() => { setDraft(messages.at(-1)?.role === 'user' ? messages.at(-1)!.content : ''); setMessages(v => v.at(-1)?.role === 'user' ? v.slice(0,-1) : v); setError('') }}>Retry</button></div>}
      <div ref={bottom}/>
    </div>
    <form className="chat-compose" onSubmit={e => { e.preventDefault(); void send() }}>
      <textarea placeholder="Ask about markets or strategies…" rows={2} maxLength={5000} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }} />
      <button type="submit" disabled={!draft.trim() || working} title="Send">{working ? <LoaderCircle className="spin" size={18}/> : <ArrowUp size={18}/>}</button>
    </form>
    <div className="chat-disclaimer"><MessageCircle size={12}/> AI can make mistakes. Make your own trading decisions.</div>
  </section>
}
