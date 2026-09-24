'use client';

/**
 * The hero's copy, staged over the intro video and resting over the looping tail.
 *
 * Placement is the hard part. Both hero videos render with `object-fit: cover`.
 * Copy sits inside a 16:9 frame sized with the same cover math, so `top: 71.11%`
 * (source row 512 of 720) lands on the anvil at every viewport — including the
 * mobile stage, which is itself 16:9 so cover equals contain.
 *
 * Row choice comes from scripts/analyze-intro-geometry.mjs. The intro is not a
 * locked-off shot: a droplet falls while the camera pulls back, so the anvil's top
 * plate travels from row ~702 up to ~388 and then settles at ~470 for the tail.
 * The droplet always lands *on* the anvil, so the flame never reaches below the
 * anvil's top plate — which makes any row below the plate's settled position safe
 * from the flame for the entire runtime.
 */

/**
 * Where the copy block starts, in source rows.
 *
 * Below the anvil's settled top plate (rows 470..506) so the copy rests on the
 * plate and upper body, and far below the flame at every moment of the intro. Early
 * on, while the anvil is still rising into frame, this row sits over pure black,
 * which is the strongest contrast the shot ever offers.
 */
const COPY_TOP_ROW = 512;

/**
 * The copy reads as iron at working heat: a near-white core, because that is where
 * the metal is hottest, with hue appearing only in the falloff — a tight 5600K edge
 * that keeps the letterform crisp inside its own bloom, then successively wider and
 * cooler layers out through amber to forge red. The ramp stops are blackbody colours
 * (see the --heat-* tokens in app/globals.css), so the falloff follows the sequence a
 * cooling billet actually passes through rather than an arbitrary orange gradient.
 *
 * Legibility is still built into the glyphs, never by dimming the artwork — the anvil
 * is finished work and is not tinted, scrimmed or vignetted.
 */
const DISPLAY_GLOW = 'var(--heat-glow-display)';
const NARRATIVE_GLOW = 'var(--heat-glow-narrative)';

/**
 * The small sizes cannot carry a wide bloom: their strokes are thin enough that it
 * clogs the counters, and one specular pixel on the polished steel can eat a letter's
 * edge. They take a tight hot edge and keep the dark separation that holds them off
 * the highlights, so they stay in the same family without going mushy.
 */
const SMALL_GLOW = 'var(--heat-glow-small)';

/** Which beat is on screen. Derived from the intro video's own currentTime. */
export type HeroCopyStage = 'none' | 'dark' | 'forged' | 'brand';

/** The hero section borrows the wordmark as its accessible name. */
export const HERO_HEADING_ID = 'hero-wordmark';

interface HeroCopyProps {
  stage: HeroCopyStage;
}

/**
 * Type scales against both axes, and its ceiling is set by the anvil rather than by
 * taste. Measured with scripts/analyze-copy-band.mjs, white text clears AAA against
 * rows 505..586 — the plate's shadowed underside and upper waist — then collapses to
 * between 1.2:1 and 3.2:1 across rows 586..667, where the waist and feet carry the
 * specular highlights. Since the artwork may not be dimmed to compensate, the whole
 * block has to fit inside that 81-row window, which caps the wordmark near 3.25rem.
 *
 * The height term also matters on its own: at short, wide viewports the cover crop
 * discards the bottom of the frame, leaving little room below the plate.
 */
const WORDMARK_SIZE = 'clamp(1.6rem, min(5.2vw, 5.6vh), 3.25rem)';
const NARRATIVE_SIZE = 'clamp(1.125rem, min(3.2vw, 4.2vh), 2rem)';
const TAGLINE_SIZE = 'clamp(0.8rem, min(1.5vw, 2vh), 1.125rem)';

/** Fades are slow and deliberate, with a 5px rise to match the site's card motion. */
const TRANSITION = 'opacity 900ms ease-out, transform 900ms ease-out';

function beatStyle(visible: boolean): React.CSSProperties {
  return {
    transition: TRANSITION,
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(5px)',
  };
}

export function HeroCopy({ stage }: HeroCopyProps) {
  return (
    <div
      // Never interactive, so it can never intercept the Quick Exit button even
      // where the two overlap on short viewports.
      className="pointer-events-none absolute inset-x-0 z-[2] select-none"
      style={{
        top: `${(COPY_TOP_ROW / 720) * 100}%`,
      }}
    >
      {/*
        All three beats stay mounted and only their opacity animates, so assistive
        technology reads one stable, complete narrative in order instead of having
        text inserted and removed underneath it.
      */}
      <div className="relative mx-auto w-full max-w-[min(92vw,64rem)] px-4 text-center">
        <p
          className="absolute inset-x-0 top-0 px-4 font-serif italic leading-tight text-[color:var(--heat-core)]"
          style={{
            ...beatStyle(stage === 'dark'),
            fontSize: NARRATIVE_SIZE,
            textShadow: NARRATIVE_GLOW,
          }}
        >
          When the world grows dark&hellip;
        </p>

        <p
          className="absolute inset-x-0 top-0 px-4 font-serif italic leading-tight text-[color:var(--heat-core)]"
          style={{
            ...beatStyle(stage === 'forged'),
            fontSize: NARRATIVE_SIZE,
            textShadow: NARRATIVE_GLOW,
          }}
        >
          Hope is not found. It is forged.
        </p>

        <div
          className="absolute inset-x-0 top-0 px-4"
          style={beatStyle(stage === 'brand')}
        >
          <h1
            id={HERO_HEADING_ID}
            className="font-serif font-bold leading-[1.05] tracking-[0.01em] text-[color:var(--heat-core)]"
            style={{ fontSize: WORDMARK_SIZE, textShadow: DISPLAY_GLOW }}
          >
            {/*
              The bloom is anchored to this inline-block, which shrink-wraps the
              wordmark, rather than to the h1 — the h1 is a block as wide as the
              container, so a percentage box on it spread the glow right across the
              page. Its own stacking context, so the bloom sits behind the glyphs and
              nothing else, without depending on which ancestor happens to establish
              one. The bloom span is empty, so the h1 still reads "Forged in the Fire"
              exactly once for search engines and assistive technology alike.
            */}
            <span className="relative inline-block" style={{ isolation: 'isolate' }}>
              <span
                aria-hidden="true"
                className="hero-heat-breathe absolute"
                style={{
                  zIndex: -1,
                  inset: '-14% -5%',
                  background: 'var(--heat-bloom-field)',
                }}
              />
              Forged in the Fire
            </span>
          </h1>
          {/*
            Each sentence is kept whole, so narrow viewports break between clauses
            instead of orphaning "Freedom." onto its own line.
          */}
          <p
            className="mx-auto mt-[0.5em] font-sans font-semibold uppercase leading-relaxed tracking-[0.16em] text-[color:var(--heat-core)]"
            style={{ fontSize: TAGLINE_SIZE, textShadow: SMALL_GLOW }}
          >
            <span className="whitespace-nowrap">Restoring Hope.</span>{' '}
            <span className="whitespace-nowrap">Defending Freedom.</span>{' '}
            <span className="whitespace-nowrap">Changing Lives.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
