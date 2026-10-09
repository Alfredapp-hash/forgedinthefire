import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin } from '@/lib/studio/api'
import { APPLE_CATEGORIES } from '@/lib/podcast-meta'
import { isSafeHttpUrl } from '@/lib/podcast'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Directory-facing fields are validated so the feed never ships something Apple rejects. */
function validate(patch: Record<string, unknown>, current: Record<string, unknown>): string | null {
  const category = String(patch.category ?? current.category ?? '')
  if (patch.category !== undefined && !(category in APPLE_CATEGORIES)) {
    return `Category must be an Apple Podcasts category (e.g. "Society & Culture")`
  }
  if (patch.subcategory != null) {
    const subs = APPLE_CATEGORIES[category] || []
    if (!subs.includes(String(patch.subcategory))) {
      return subs.length
        ? `Subcategory for ${category} must be one of: ${subs.join(', ')}`
        : `${category} has no subcategories — leave it blank`
    }
  }
  if (patch.email != null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(patch.email))) {
    return 'Owner email must be a valid address (Apple and Spotify send verification here)'
  }
  for (const key of ['cover_url', 'website_url', 'funding_url'] as const) {
    if (patch[key] != null && !isSafeHttpUrl(patch[key])) return `${key.replace('_', ' ')} must start with https://`
  }
  if (patch.cover_url != null && !/\.(jpe?g|png)(\?|$)/i.test(String(patch.cover_url))) {
    return 'Cover must be a JPG or PNG (3000×3000 recommended)'
  }
  if (patch.language != null && !/^[a-z]{2,3}(-[a-z]{2,4})?$/i.test(String(patch.language))) {
    return 'Language must be a code like en-us'
  }
  if (patch.podcast_guid != null && !UUID.test(String(patch.podcast_guid))) {
    return 'podcast:guid must be a UUID (leave blank to derive it from the feed URL)'
  }
  if (patch.itunes_type != null && !['episodic', 'serial'].includes(String(patch.itunes_type))) {
    return 'Show type must be episodic or serial'
  }
  return null
}

const ALLOWED = [
  'title', 'author', 'email', 'description', 'category', 'subcategory',
  'language', 'explicit', 'cover_url', 'website_url', 'copyright',
  'itunes_type', 'owner_name', 'slug', 'podcast_guid', 'funding_url', 'locked',
] as const

export async function GET() {
  try {
    const { supabase } = await withStudioAdmin()
    const { data, error } = await supabase
      .from('podcast_shows')
      .select('*')
      .order('is_default', { ascending: false })
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    return studioError(err)
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase } = await withStudioAdmin()
    const body = await request.json() as Record<string, unknown>
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of ALLOWED) {
      if (body[key] !== undefined) patch[key] = body[key] === '' ? null : body[key]
    }
    if (patch.explicit != null) patch.explicit = Boolean(patch.explicit)
    if (patch.locked != null) patch.locked = Boolean(patch.locked)
    if (typeof patch.language === 'string') patch.language = patch.language.toLowerCase()
    // Changing the top category invalidates an old subcategory.
    if (patch.category !== undefined && patch.subcategory === undefined) patch.subcategory = null
    const { data: current, error: currentError } = await supabase
      .from('podcast_shows')
      .select('*')
      .eq('id', id)
      .single()
    if (currentError) throw currentError
    const invalid = validate(patch, current)
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
    const { data, error } = await supabase
      .from('podcast_shows')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    return studioError(err)
  }
}
