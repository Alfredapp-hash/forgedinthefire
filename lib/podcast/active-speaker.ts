/**
 * Debounced active-speaker tracker.
 *
 * Whoever is talking should become the MAIN camera; the others become PIP. The
 * naive approach — "main = whoever is loudest right now" — flickers badly:
 * backchannel "uh-huh"s, plosives, and mic bleed constantly poke above any
 * threshold for a frame or two. This tracker debounces the decision along three
 * independent axes so the MAIN feed stays calm and readable:
 *
 *   - hold:      a challenger must sustain speech for `holdMs` before we hand it
 *                the MAIN slot — short interjections never win.
 *   - release:   the current MAIN is retained through gaps shorter than
 *                `releaseMs` — a breath or a pause between sentences does not
 *                bounce us to whoever coughs first.
 *   - switch gap: we never switch faster than `minSwitchGapMs`, so even a valid
 *                back-and-forth is rate-limited to something a viewer can follow.
 *
 * The tracker is pure and deterministic: it reads time only from the `nowMs`
 * argument passed to `update`, never `Date.now()` / `performance.now()` / random.
 * That makes the hold/release/debounce behavior unit-testable by feeding a
 * synthetic (samples, time) sequence.
 */

export type SpeakerSample = {
  /** Stable participant id. */
  id: string
  /** Instantaneous level, normalized 0..1 (e.g. from an AnalyserNode meter). */
  level: number
}

export type ActiveSpeakerOptions = {
  /** Below this level a participant is treated as silent. Default ~0.06. */
  thresholdLevel?: number
  /** A challenger must sustain speech this long before becoming MAIN. Default ~700ms. */
  holdMs?: number
  /** Keep the current MAIN this long after they go quiet. Default ~1200ms. */
  releaseMs?: number
  /** Never switch MAIN faster than this. Default ~500ms. */
  minSwitchGapMs?: number
}

export type ActiveSpeakerTracker = {
  /**
   * Feed the latest per-participant levels at time `nowMs` (monotonic ms).
   * Returns the current MAIN id (or `null` when nobody has ever spoken).
   */
  update(samples: SpeakerSample[], nowMs: number): string | null
  /** The current MAIN id without advancing state. */
  current(): string | null
  /** Forget all history (e.g. when the participant set changes wholesale). */
  reset(): void
}

const DEFAULTS = {
  thresholdLevel: 0.06,
  holdMs: 700,
  releaseMs: 1200,
  minSwitchGapMs: 500,
} as const

type SpeakerState = {
  /** Timestamp speech began (above threshold, uninterrupted). null = not speaking. */
  activeSince: number | null
  /** Last timestamp this id was seen above threshold. */
  lastAboveAt: number
}

export function createActiveSpeakerTracker(opts: ActiveSpeakerOptions = {}): ActiveSpeakerTracker {
  const thresholdLevel = opts.thresholdLevel ?? DEFAULTS.thresholdLevel
  const holdMs = opts.holdMs ?? DEFAULTS.holdMs
  const releaseMs = opts.releaseMs ?? DEFAULTS.releaseMs
  const minSwitchGapMs = opts.minSwitchGapMs ?? DEFAULTS.minSwitchGapMs

  const states = new Map<string, SpeakerState>()
  let mainId: string | null = null
  let lastSwitchAt = Number.NEGATIVE_INFINITY

  function reset(): void {
    states.clear()
    mainId = null
    lastSwitchAt = Number.NEGATIVE_INFINITY
  }

  function current(): string | null {
    return mainId
  }

  function update(samples: SpeakerSample[], nowMs: number): string | null {
    // 1. Fold this frame's levels into each id's sustain state.
    const seen = new Set<string>()
    for (const { id, level } of samples) {
      seen.add(id)
      const prev = states.get(id)
      const above = level >= thresholdLevel
      if (above) {
        // Extend an existing run, or start a fresh one.
        states.set(id, {
          activeSince: prev?.activeSince ?? nowMs,
          lastAboveAt: nowMs,
        })
      } else {
        // Silent this frame: end the sustain run but keep lastAboveAt for release.
        states.set(id, {
          activeSince: null,
          lastAboveAt: prev?.lastAboveAt ?? Number.NEGATIVE_INFINITY,
        })
      }
    }

    // 2. Decide whether the current MAIN should be released.
    // The MAIN is retained through gaps shorter than releaseMs — a breath or a
    // between-sentence pause must not drop it. If the current MAIN vanished from
    // the sample set entirely (left the booth), release immediately.
    let mainReleased = false
    if (mainId !== null) {
      const st = states.get(mainId)
      if (!st || !seen.has(mainId)) {
        mainReleased = true
      } else if (st.activeSince === null && nowMs - st.lastAboveAt >= releaseMs) {
        mainReleased = true
      }
    }

    // 3. Find the best challenger: the id (other than the current MAIN) that has
    // sustained speech for at least holdMs, preferring the one speaking longest.
    let challengerId: string | null = null
    let challengerSince = Number.POSITIVE_INFINITY
    for (const [id, st] of states) {
      if (id === mainId) continue
      if (st.activeSince === null) continue
      if (nowMs - st.activeSince < holdMs) continue
      if (st.activeSince < challengerSince) {
        challengerSince = st.activeSince
        challengerId = id
      }
    }

    // 4. Apply switching rules.
    if (mainId === null) {
      // No MAIN yet. Adopt a qualified challenger the moment one exists; if none
      // has cleared holdMs, fall back to anyone currently speaking so a lone
      // host (or a first speaker) still becomes MAIN without waiting.
      if (challengerId !== null) {
        mainId = challengerId
        lastSwitchAt = nowMs
      } else {
        const speaking = firstSpeaking(states)
        if (speaking !== null) {
          mainId = speaking
          lastSwitchAt = nowMs
        }
      }
    } else {
      const gapOk = nowMs - lastSwitchAt >= minSwitchGapMs
      if (challengerId !== null && gapOk) {
        // A challenger cleared hold and enough time passed since the last switch.
        mainId = challengerId
        lastSwitchAt = nowMs
      } else if (mainReleased && gapOk) {
        // Current MAIN went quiet past releaseMs and no qualified challenger.
        // Promote whoever is speaking now (even if they haven't cleared hold) so
        // the MAIN follows the conversation instead of freezing on a silent tile.
        const speaking = firstSpeaking(states)
        if (speaking !== null && speaking !== mainId) {
          mainId = speaking
          lastSwitchAt = nowMs
        }
        // If nobody is speaking, keep the last MAIN on screen (calm hold).
      }
    }

    return mainId
  }

  return { update, current, reset }
}

/** The id with the oldest active run (longest continuous speaker), or null. */
function firstSpeaking(states: Map<string, SpeakerState>): string | null {
  let bestId: string | null = null
  let bestSince = Number.POSITIVE_INFINITY
  for (const [id, st] of states) {
    if (st.activeSince === null) continue
    if (st.activeSince < bestSince) {
      bestSince = st.activeSince
      bestId = id
    }
  }
  return bestId
}
