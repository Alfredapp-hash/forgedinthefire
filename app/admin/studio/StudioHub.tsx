'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, PenSquare, Plus } from 'lucide-react'
import type { ContentTopic } from '@/lib/studio/types'
import { topicCoverUrl } from '@/lib/studio/topic-covers'

type View = 'calendar' | 'topics'

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function startOfWeek(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  return d.toISOString().slice(0, 10)
}

function nextBiweeklySlots(count = 8) {
  const slots: string[] = []
  let cursor = startOfWeek()
  for (let i = 0; i < count; i++) {
    slots.push(cursor)
    cursor = addDays(cursor, 14)
  }
  return slots
}

export function StudioHub() {
  const [view, setView] = useState<View>('calendar')
  const [topics, setTopics] = useState<ContentTopic[]>([])
  const [title, setTitle] = useState('')
  const [bulk, setBulk] = useState('')
  const [scheduledOn, setScheduledOn] = useState(nextBiweeklySlots(1)[0])
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const topicRes = await fetch('/api/admin/studio/topics')
    const topicRows = await topicRes.json()
    if (Array.isArray(topicRows)) setTopics(topicRows)
    else setError(topicRows.error || 'Could not load topics')
  }

  useEffect(() => { void load() }, [])

  const slots = useMemo(() => nextBiweeklySlots(8), [])

  async function createTopic(when = scheduledOn, name = title) {
    setError(null)
    const res = await fetch('/api/admin/studio/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: name, scheduled_on: when, status: 'planned' }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Could not create topic')
      return
    }
    setTitle('')
    await load()
  }

  async function createBulk() {
    setError(null)
    const res = await fetch('/api/admin/studio/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bulk, scheduled_on: scheduledOn, status: 'idea' }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Could not create topics')
      return
    }
    setBulk('')
    await load()
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#8DEBFF] mb-1">Production</p>
          <h1 className="text-2xl font-bold text-[#F6FAFC]">Content Studio</h1>
          <p className="text-sm text-[#A9B8C6] max-w-2xl">
            Plan biweekly topics here. Each topic fans out to Blog, Podcast, and Social as separate desks —
            open those tabs when you are ready to produce.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/blog" className="px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]">
            Blog
          </Link>
          <Link href="/admin/podcast" className="px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]">
            Podcast
          </Link>
          <Link href="/admin/social" className="px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]">
            Social
          </Link>
        </div>
      </header>

      <div className="flex gap-2">
        {([
          ['calendar', 'Biweekly calendar', CalendarDays],
          ['topics', 'Topics', PenSquare],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              view === id ? 'bg-[#1A232C] text-[#8DEBFF]' : 'text-[#B8C4CF] hover:bg-[#1A232C]'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-4">
        <div className="grid md:grid-cols-[1fr_160px_auto] gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New topic — e.g. Housing after crisis, without the spectacle"
            className="rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-[#F6FAFC]"
          />
          <input
            type="date"
            value={scheduledOn}
            onChange={(e) => setScheduledOn(e.target.value)}
            className="rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-[#F6FAFC]"
          />
          <button
            type="button"
            onClick={() => void createTopic()}
            disabled={!title.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#53D6FF] text-[#061016] px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            <Plus size={14} />
            Create topic
          </button>
        </div>
        <textarea
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          rows={3}
          placeholder="Or paste many topics, one per line"
          className="w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]"
        />
        <button
          type="button"
          onClick={() => void createBulk()}
          disabled={!bulk.trim()}
          className="text-sm text-[#8DEBFF] disabled:opacity-40"
        >
          Add all lines as ideas
        </button>
      </section>

      {view === 'calendar' && (
        <>
        <MonthCalendar
          topics={topics}
          onAdd={(iso) => {
            const name = window.prompt('Topic for this day?')
            if (name?.trim()) void createTopic(iso, name.trim())
          }}
        />
        <div className="grid md:grid-cols-2 gap-4">
          {slots.map((slot) => {
            const assigned = topics.filter((t) => t.scheduled_on === slot)
            return (
              <div key={slot} className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#8DEBFF]">
                    Week of {new Date(`${slot}T12:00:00`).toLocaleDateString()}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const name = window.prompt('Topic for this fortnight?')
                      if (name?.trim()) void createTopic(slot, name.trim())
                    }}
                    className="text-xs text-[#53D6FF]"
                  >
                    Add
                  </button>
                </div>
                {assigned.length === 0 ? (
                  <p className="text-sm text-[#A9B8C6]">Open slot. One topic drives the whole package.</p>
                ) : (
                  <ul className="space-y-2">
                    {assigned.map((topic) => {
                      const cover = topicCoverUrl(topic)
                      return (
                      <li key={topic.id}>
                        <Link href={`/admin/studio/topics/${topic.id}`} className="flex items-center gap-3 text-[#F6FAFC] hover:text-[#8DEBFF]">
                          {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cover} alt="" className="h-12 w-12 rounded-lg object-cover border border-[#27313B] shrink-0" />
                          ) : null}
                          <span>
                            {topic.title}
                            <span className="block text-xs text-[#A9B8C6]">{topic.status.replace('_', ' ')}</span>
                          </span>
                        </Link>
                      </li>
                    )})}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
        </>
      )}

      {view === 'topics' && (
        <div className="rounded-2xl border border-[#27313B] overflow-hidden bg-[#151B22]">
          <table className="w-full text-sm">
            <thead className="bg-[#05070A] text-[#A9B8C6] text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-3">Topic</th>
                <th className="text-left px-5 py-3">Date</th>
                <th className="text-left px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#27313B]">
              {topics.map((topic) => {
                const cover = topicCoverUrl(topic)
                return (
                <tr key={topic.id} className="hover:bg-[#1A232C]/50">
                  <td className="px-5 py-3">
                    <Link href={`/admin/studio/topics/${topic.id}`} className="flex items-center gap-3 text-[#F6FAFC] hover:text-[#8DEBFF]">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="" className="h-10 w-10 rounded-md object-cover border border-[#27313B] shrink-0" />
                      ) : (
                        <span className="h-10 w-10 rounded-md border border-[#27313B] bg-[#05070A] shrink-0" />
                      )}
                      <span>{topic.title}</span>
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-[#A9B8C6]">{topic.scheduled_on || '—'}</td>
                  <td className="px-5 py-3 text-[#8DEBFF]">{topic.status.replace('_', ' ')}</td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function MonthCalendar({
  topics,
  onAdd,
}: {
  topics: ContentTopic[]
  onAdd: (iso: string) => void
}) {
  const [cursor, setCursor] = useState(() => new Date())
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  const byDay = new Map<string, ContentTopic[]>()
  for (const topic of topics) {
    if (!topic.scheduled_on) continue
    const list = byDay.get(topic.scheduled_on) ?? []
    list.push(topic)
    byDay.set(topic.scheduled_on, list)
  }

  return (
    <div className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[#F6FAFC]">
          {cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </p>
        <div className="flex gap-1">
          <button type="button" className="px-2 py-1 text-[#8DEBFF]" onClick={() => setCursor(new Date(year, month - 1, 1))}>Prev</button>
          <button type="button" className="px-2 py-1 text-[#8DEBFF]" onClick={() => setCursor(new Date(year, month + 1, 1))}>Next</button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px bg-[#27313B] rounded-xl overflow-hidden">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="bg-[#0C141C] p-2 text-center text-[11px] uppercase tracking-wider text-[#A9B8C6]">{d}</div>
        ))}
        {cells.map((day, i) => {
          const iso = day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : ''
          const items = iso ? byDay.get(iso) ?? [] : []
          return (
            <div key={i} className="min-h-[84px] bg-[#151B22] p-2">
              {day && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#B8C4CF]">{day}</span>
                    <button type="button" onClick={() => onAdd(iso)} className="text-[10px] text-[#53D6FF]">+</button>
                  </div>
                  {items.map((topic) => (
                    <Link key={topic.id} href={`/admin/studio/topics/${topic.id}`} className="block mt-1 text-[11px] text-[#8DEBFF] truncate">
                      {topic.title}
                    </Link>
                  ))}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
