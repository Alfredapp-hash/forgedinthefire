import { describe, expect, it } from 'vitest'
import {
  PRIVATE_MEDIA_PREFIX,
  isReleasedStatus,
  mediaPlacement,
  parsePrivateMediaRef,
  privateMediaRef,
  releaseSensitiveChanged,
} from '@/lib/podcast/enterprise'
import { feedsToAnnounce } from '@/lib/podcast/feed-announce'
import { listenerHash, requestCountry, requestIp } from '@/lib/podcast/listener'
import { isOwnerRole, isProducerRole, isStaffRole } from '@/lib/admin/roles'

const publicAudio =
  'https://mxjsbhldmovwpjcotmsd.supabase.co/storage/v1/object/public/media/episodes/a.mp3'

describe('releaseSensitiveChanged', () => {
  it('ignores an edit that leaves the approved file and transcript alone', () => {
    expect(releaseSensitiveChanged({ audio_url: 'a', transcript: 't' }, { audio_url: 'a', transcript: 't' })).toBe(false)
  })

  it('notices an audio swap on a released episode', () => {
    expect(releaseSensitiveChanged({ audio_url: 'a' }, { audio_url: 'b' })).toBe(true)
  })

  it('treats a missing value and null as the same', () => {
    expect(releaseSensitiveChanged({ transcript: null }, {})).toBe(false)
  })
})

describe('mediaPlacement', () => {
  it('keeps a private ref on a private episode', () => {
    expect(mediaPlacement('private', privateMediaRef('episodes/a.mp3'))).toBe('keep')
  })

  it('moves a public media object when the episode becomes private', () => {
    expect(mediaPlacement('private', publicAudio)).toBe('to-private')
  })

  it('rejects an external URL on a private episode', () => {
    expect(mediaPlacement('private', 'https://cdn.example.com/a.mp3')).toBe('reject')
  })

  it('moves a private ref back to the public bucket when the episode is public', () => {
    expect(mediaPlacement('public', privateMediaRef('episodes/a.mp3'))).toBe('to-public')
  })

  it('keeps a public URL on a public episode', () => {
    expect(mediaPlacement('public', publicAudio)).toBe('keep')
  })

  it('keeps an empty file', () => {
    expect(mediaPlacement('private', null)).toBe('keep')
  })
})

describe('parsePrivateMediaRef', () => {
  it('rejects path traversal and absolute paths', () => {
    expect(parsePrivateMediaRef(`${PRIVATE_MEDIA_PREFIX}../secret`)).toBeNull()
    expect(parsePrivateMediaRef(`${PRIVATE_MEDIA_PREFIX}/abs`)).toBeNull()
    expect(parsePrivateMediaRef('https://example.com/a.mp3')).toBeNull()
  })

  it('returns the path inside the private bucket', () => {
    expect(parsePrivateMediaRef(privateMediaRef('episodes/ep/audio.mp3'))).toBe('episodes/ep/audio.mp3')
  })
})

describe('isReleasedStatus', () => {
  it('is scheduled or published', () => {
    expect(isReleasedStatus('scheduled')).toBe(true)
    expect(isReleasedStatus('published')).toBe(true)
    expect(isReleasedStatus('draft')).toBe(false)
    expect(isReleasedStatus(null)).toBe(false)
  })
})

describe('listenerHash', () => {
  it('is stable, short, and does not echo the IP', () => {
    const hash = listenerHash('203.0.113.5', 'Podcasts/1', 'ep-1', '2026-10-11')
    expect(hash).toHaveLength(32)
    expect(hash).not.toContain('203')
    expect(hash).toBe(listenerHash('203.0.113.5', 'Podcasts/1', 'ep-1', '2026-10-11'))
    expect(hash).not.toBe(listenerHash('203.0.113.6', 'Podcasts/1', 'ep-1', '2026-10-11'))
  })
})

describe('feedsToAnnounce', () => {
  const audio = 'https://cdn.example.com/a.mp3'
  const video = 'https://cdn.example.com/a.mp4'
  const publicFeed = 'https://forgedinthefireohio.org/podcast/rss.xml'
  const videoFeed = 'https://forgedinthefireohio.org/podcast/video.xml'

  it('announces the public audio feed when a public episode is published', () => {
    expect(feedsToAnnounce(
      { status: 'scheduled', visibility: 'public', audio_url: audio },
      { status: 'published', visibility: 'public', audio_url: audio },
    )).toEqual([publicFeed])
  })

  it('announces the video feed only when a public video enclosure is new', () => {
    expect(feedsToAnnounce(
      { status: 'published', visibility: 'public', audio_url: audio, video_url: null },
      { status: 'published', visibility: 'public', audio_url: audio, video_url: video },
    )).toEqual([videoFeed])
  })

  it('stays quiet for a private release and for a title-only edit', () => {
    expect(feedsToAnnounce(null, { status: 'published', visibility: 'private', audio_url: audio })).toEqual([])
    expect(feedsToAnnounce(
      { status: 'published', visibility: 'public', audio_url: audio },
      { status: 'published', visibility: 'public', audio_url: audio },
    )).toEqual([])
  })
})

describe('requestCountry', () => {
  function headers(map: Record<string, string>) {
    return { headers: { get: (name: string) => map[name] ?? null } } as Request
  }

  it('reads the Vercel country and drops unknown codes', () => {
    expect(requestCountry(headers({ 'x-vercel-ip-country': 'us' }))).toBe('US')
    expect(requestCountry(headers({ 'x-vercel-ip-country': 'XX' }))).toBeNull()
    expect(requestCountry(headers({}))).toBeNull()
  })

  it('prefers the Vercel client IP', () => {
    expect(requestIp(headers({ 'x-vercel-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9')
  })
})

describe('staff roles', () => {
  it('lets safeguarding review without producing or owning', () => {
    expect(isStaffRole('safeguarding')).toBe(true)
    expect(isProducerRole('safeguarding')).toBe(false)
    expect(isOwnerRole('safeguarding')).toBe(false)
    expect(isProducerRole('admin')).toBe(true)
    expect(isOwnerRole('owner')).toBe(true)
    expect(isStaffRole('editor')).toBe(false)
  })
})
