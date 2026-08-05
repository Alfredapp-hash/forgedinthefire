import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { getSiteSettingsAdmin, upsertSiteSettings } from '@/lib/site-settings'

export async function GET() {
  try {
    await requireAdmin()
    const settings = await getSiteSettingsAdmin()
    return NextResponse.json({ settings }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    if (err instanceof Error && err.message.includes('Admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const message = err instanceof Error ? err.message : 'Failed to load settings'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin()
    const body = (await request.json()) as { settings?: Record<string, string> }
    if (!body.settings || typeof body.settings !== 'object') {
      return NextResponse.json({ error: 'settings object required' }, { status: 400 })
    }
    await upsertSiteSettings(body.settings)
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof Error && err.message.includes('Admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const message = err instanceof Error ? err.message : 'Save failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
