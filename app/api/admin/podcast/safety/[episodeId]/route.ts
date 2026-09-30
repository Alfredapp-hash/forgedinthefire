import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin } from '@/lib/studio/api'
import { hashRemoteAudio } from '@/lib/podcast/safety/audio-hash'
import { SAFETY_MIGRATION, SAFETY_TABLE, missingSafetyTable } from '@/lib/podcast/safety/server'
import {
  cleanDecisions,
  cleanPlan,
  cleanSafetyRecord,
  cleanTerms,
  emptySafetyRecord,
  isApprovalMethod,
  isIsoDate,
  textHash,
  type SafetyRecord,
} from '@/lib/podcast/safety/record'
import { cleanWords } from '@/lib/studio/transcript'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ episodeId: string }> }

const noStore = { 'Cache-Control': 'private, no-store' }

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: noStore })
}

type Episode = Record<string, unknown> & { id: string; audio_url: string | null; transcript: string | null }

/**
 * Admin-only Clean-up & safety record for one episode:
 *   record  — the working plan (protected terms + decisions) from podcast_episode_safety
 *   episode — the episode row (sign-off columns live there)
 * Never cached, never public.
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { episodeId } = await params
    const { supabase } = await withStudioAdmin()
    const { data, error } = await supabase.from(SAFETY_TABLE).select('*').eq('episode_id', episodeId).maybeSingle()
    if (error) {
      if (missingSafetyTable(error)) return NextResponse.json({ available: false, record: null }, { headers: noStore })
      throw error
    }
    return NextResponse.json({ available: true, record: cleanSafetyRecord(episodeId, data ?? emptySafetyRecord(episodeId)) }, { headers: noStore })
  } catch (err) {
    return studioError(err)
  }
}

/**
 * PATCH body (all optional):
 *   protected_terms, term_decisions, filler_decisions, plan   → upsert into podcast_episode_safety
 *   guest_final_cut: { approved: true, on, method, note? } | { approved: false }
 *   transcript_reviewed: boolean
 *   protected_words_reviewed: boolean
 *   guest_consent_confirmed: boolean        (paper release on file — stamped here)
 *   transcript_words, audio_url_previous, post_edit_snapshot
 *       → episode-row post-production columns (shape-checked; the generic episodes PATCH
 *         whitelist does not carry them)
 * Sign-offs are stamped server-side (who, when, which audio file — hashed here, not trusted
 * from the browser). Responds with { available, record, episode }.
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { episodeId } = await params
    const { user, supabase } = await withStudioAdmin()
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') return bad('Invalid body')

    const { data: episode, error: epError } = await supabase.from('podcast_episodes').select('*').eq('id', episodeId).single()
    if (epError) throw epError
    const ep = episode as Episode
    const now = new Date().toISOString()

    // ── Working plan ────────────────────────────────────────────────────────
    const planPatch: Partial<SafetyRecord> = {}
    if (body.protected_terms !== undefined) {
      if (!Array.isArray(body.protected_terms)) return bad('protected_terms must be a list')
      planPatch.protected_terms = cleanTerms(body.protected_terms)
    }
    if (body.term_decisions !== undefined) {
      if (!body.term_decisions || typeof body.term_decisions !== 'object' || Array.isArray(body.term_decisions)) return bad('term_decisions must be an object')
      planPatch.term_decisions = cleanDecisions(body.term_decisions)
    }
    if (body.filler_decisions !== undefined) {
      if (!body.filler_decisions || typeof body.filler_decisions !== 'object' || Array.isArray(body.filler_decisions)) return bad('filler_decisions must be an object')
      planPatch.filler_decisions = cleanDecisions(body.filler_decisions)
    }
    if (body.plan !== undefined) {
      if (!body.plan || typeof body.plan !== 'object' || Array.isArray(body.plan)) return bad('plan must be an object')
      planPatch.plan = cleanPlan(body.plan)
    }

    // ── Sign-offs (episode row) ─────────────────────────────────────────────
    const signoff: Record<string, unknown> = {}
    if (body.guest_final_cut !== undefined) {
      const g = (body.guest_final_cut ?? {}) as Record<string, unknown>
      if (g.approved === true) {
        if (!isIsoDate(g.on)) return bad('Add the date the guest approved (YYYY-MM-DD, not in the future)')
        if (!isApprovalMethod(g.method)) return bad('Choose how the guest approved')
        if (!ep.audio_url) return bad('Upload the final audio before recording approval')
        const hashed = await hashRemoteAudio(ep.audio_url)
        Object.assign(signoff, {
          guest_final_cut_approved: true,
          guest_final_cut_approved_at: now,
          guest_final_cut_approved_by: user.email ?? null,
          guest_final_cut_approved_on: g.on,
          guest_final_cut_method: g.method,
          guest_final_cut_note: String(g.note ?? '').trim().slice(0, 1000) || null,
          guest_final_cut_audio_url: ep.audio_url,
          guest_final_cut_audio_hash: hashed?.sha256 ?? null,
          audio_sha256: hashed?.sha256 ?? ep.audio_sha256 ?? null,
        })
      } else {
        Object.assign(signoff, {
          guest_final_cut_approved: false,
          guest_final_cut_approved_at: null,
          guest_final_cut_approved_by: null,
          guest_final_cut_approved_on: null,
          guest_final_cut_method: null,
          guest_final_cut_note: null,
          guest_final_cut_audio_url: null,
          guest_final_cut_audio_hash: null,
        })
      }
    }
    if (body.transcript_reviewed !== undefined) {
      if (body.transcript_reviewed === true) {
        const text = (ep.transcript || '').trim()
        if (!text) return bad('There is no transcript to review yet')
        Object.assign(signoff, { transcript_reviewed_at: now, transcript_reviewed_by: user.email ?? null, transcript_reviewed_hash: textHash(text) })
      } else {
        Object.assign(signoff, { transcript_reviewed_at: null, transcript_reviewed_by: null, transcript_reviewed_hash: null })
      }
    }
    if (body.protected_words_reviewed !== undefined) {
      const yes = body.protected_words_reviewed === true
      Object.assign(signoff, { protected_words_reviewed_at: yes ? now : null, protected_words_reviewed_by: yes ? user.email ?? null : null })
    }
    if (body.guest_consent_confirmed !== undefined) {
      const yes = body.guest_consent_confirmed === true
      Object.assign(signoff, {
        guest_consent_confirmed: yes,
        guest_consent_confirmed_at: yes ? now : null,
        guest_consent_confirmed_by: yes ? user.email ?? null : null,
      })
    }

    // ── Post-production columns (episode row) ───────────────────────────────
    if (body.transcript_words !== undefined) {
      if (body.transcript_words !== null && !Array.isArray(body.transcript_words)) return bad('transcript_words must be a list or null')
      signoff.transcript_words = body.transcript_words === null ? null : cleanWords(body.transcript_words)
    }
    if (body.audio_url_previous !== undefined) {
      const v = body.audio_url_previous
      if (v !== null && (typeof v !== 'string' || v.length > 2048)) return bad('audio_url_previous must be a URL or null')
      signoff.audio_url_previous = v
    }
    if (body.post_edit_snapshot !== undefined) {
      const snap = body.post_edit_snapshot
      signoff.post_edit_snapshot = snap && typeof snap === 'object' && !Array.isArray(snap) ? snap : null
    }

    const missing = Object.keys(signoff).filter((key) => !(key in ep))
    if (missing.length) {
      return bad(`The database needs the ${SAFETY_MIGRATION} update before this can be saved (${missing.join(', ')}).`)
    }

    // ── Write ───────────────────────────────────────────────────────────────
    let record: SafetyRecord | null = null
    let available = true
    if (Object.keys(planPatch).length) {
      const { data, error } = await supabase
        .from(SAFETY_TABLE)
        .upsert({ episode_id: episodeId, ...planPatch, updated_at: now, updated_by: user.email ?? null }, { onConflict: 'episode_id' })
        .select('*')
        .single()
      if (error) {
        if (missingSafetyTable(error)) {
          return bad(`Protected terms and decisions cannot be saved yet. Ask an admin to run ${SAFETY_MIGRATION}.`, 503)
        }
        throw error
      }
      record = cleanSafetyRecord(episodeId, data)
    } else {
      const { data, error } = await supabase.from(SAFETY_TABLE).select('*').eq('episode_id', episodeId).maybeSingle()
      if (error && !missingSafetyTable(error)) throw error
      available = !error
      record = error ? null : cleanSafetyRecord(episodeId, data ?? emptySafetyRecord(episodeId))
    }

    let updated: Episode = ep
    if (Object.keys(signoff).length) {
      const { data, error } = await supabase
        .from('podcast_episodes')
        .update({ ...signoff, updated_at: now })
        .eq('id', episodeId)
        .select('*')
        .single()
      if (error) throw error
      updated = data as Episode
    }

    return NextResponse.json({ available, record, episode: updated }, { headers: noStore })
  } catch (err) {
    return studioError(err)
  }
}
