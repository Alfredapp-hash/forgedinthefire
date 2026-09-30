import { describe, expect, it } from 'vitest'
import { CLIP_DIMENSIONS, clipLayout, rectContains, rectsOverlap, type Rect } from '@/lib/podcast/clips/layout'
import { CLIP_ASPECTS } from '@/lib/podcast/clips/types'

describe('clipLayout safe areas', () => {
  for (const aspect of CLIP_ASPECTS) {
    describe(aspect, () => {
      const layout = clipLayout(aspect)
      const regions: [string, Rect][] = [
        ['art', layout.art],
        ['title', layout.title],
        ['wave', layout.wave],
        ['caption', layout.caption],
      ]

      it('matches the canvas size for the aspect', () => {
        expect({ width: layout.width, height: layout.height }).toEqual(CLIP_DIMENSIONS[aspect])
        const [a, b] = aspect.split(':').map(Number)
        expect(layout.width / layout.height).toBeCloseTo(a / b, 5)
      })

      it('safe rect is the canvas minus the platform chrome', () => {
        expect(layout.safeRect.x).toBe(layout.safe.left)
        expect(layout.safeRect.y).toBe(layout.safe.top)
        expect(layout.safeRect.w).toBe(layout.width - layout.safe.left - layout.safe.right)
        expect(layout.safeRect.h).toBe(layout.height - layout.safe.top - layout.safe.bottom)
        expect(rectContains({ x: 0, y: 0, w: layout.width, h: layout.height }, layout.safeRect)).toBe(true)
      })

      it('every region sits inside the safe area', () => {
        for (const [name, r] of regions) {
          expect(r.w, `${name} width`).toBeGreaterThan(0)
          expect(r.h, `${name} height`).toBeGreaterThan(0)
          expect(rectContains(layout.safeRect, r), `${name} inside safe area`).toBe(true)
        }
      })

      it('regions do not overlap each other', () => {
        for (let i = 0; i < regions.length; i++) {
          for (let j = i + 1; j < regions.length; j++) {
            expect(rectsOverlap(regions[i][1], regions[j][1]), `${regions[i][0]} vs ${regions[j][0]}`).toBe(false)
          }
        }
      })

      it('art is square and captions sit lowest', () => {
        expect(layout.art.w).toBe(layout.art.h)
        for (const [name, r] of regions) {
          if (name === 'caption') continue
          expect(r.y + r.h, `${name} above captions`).toBeLessThanOrEqual(layout.caption.y + 0.5)
        }
      })

      it('the caption box fits its lines', () => {
        expect(layout.caption.h).toBeGreaterThanOrEqual(layout.font.caption * 1.28 * layout.captionLines)
        expect(layout.caption.w).toBeGreaterThanOrEqual(layout.captionChars * layout.font.caption * 0.5)
      })
    })
  }

  it('vertical video reserves more at the top and bottom than square', () => {
    const v = clipLayout('9:16')
    const s = clipLayout('1:1')
    expect(v.safe.top).toBeGreaterThan(s.safe.top)
    expect(v.safe.bottom).toBeGreaterThan(v.safe.top)
  })

  it('wide puts the art beside the text rather than above it', () => {
    const w = clipLayout('16:9')
    expect(w.title.x).toBeGreaterThan(w.art.x + w.art.w)
    expect(w.caption.y).toBeGreaterThan(w.wave.y + w.wave.h)
  })
})

describe('rect helpers', () => {
  it('rectContains tolerates half-pixel rounding', () => {
    expect(rectContains({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10.4, h: 10 })).toBe(true)
    expect(rectContains({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 11, h: 10 })).toBe(false)
  })
  it('rectsOverlap treats touching edges as not overlapping', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false)
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 10, h: 10 })).toBe(true)
  })
})
