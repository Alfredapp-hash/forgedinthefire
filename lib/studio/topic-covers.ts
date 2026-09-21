import coverManifest from '@/public/content-covers/manifest.json'

type CoverRow = {
  cycle: number
  theme: string
  topic?: string
  podcast?: string
  blog?: string
}

const byCycle = new Map<number, CoverRow>(
  (coverManifest as CoverRow[]).map((row) => [row.cycle, row]),
)

/** Resolve branded cover path from a calendar topic slug like `c12-court-preparation`. */
export function resolveAdvocacyCover(slug: string | null | undefined): string | null {
  if (!slug) return null
  const match = slug.match(/^c(\d+)(?:-|$)/i)
  if (!match) return null
  const cycle = Number(match[1])
  const row = byCycle.get(cycle)
  if (!row) return null
  return row.topic || row.podcast || row.blog || null
}

export function topicCoverUrl(topic: { slug: string; cover_url?: string | null }): string | null {
  return topic.cover_url || resolveAdvocacyCover(topic.slug)
}
