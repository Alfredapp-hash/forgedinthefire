'use client';

import { useEffect, useRef, useState } from 'react';
import { HeroAmbientField } from '@/components/hero-ambient-field';
import { HeroCopy, HERO_HEADING_ID, type HeroCopyStage } from '@/components/hero-copy';

interface HeroAnimationProps {
  children?: React.ReactNode;
}

/** Cache-bust when swapping hero assets during iteration */
const HERO_VIDEO_SRC = '/hero-background.mp4?v=seamless1';
/** Mid-loop still so the lockup is painted before the first video frame. */
const HERO_POSTER_SRC = '/hero-poster.jpg?v=loop1';
/**
 * The loop clip is not simply the intro's tail: the anvil below the flame is a
 * single frozen frame, re-lit per frame to keep breathing with the fire. See
 * scripts/build-hero-loop.mjs. Compositing is baked into the asset rather than
 * layered in CSS because both videos render with `object-fit: cover`, and a DOM
 * plate would have to reproduce that cover scaling at every aspect ratio or the
 * anvil would visibly mis-register.
 */
const HERO_LOOP_SRC = '/hero-flame-loop.mp4?v=staticanvil1';

/**
 * Where the intro hands off to the looping tail.
 *
 * The loop clip's first frame is source frame 349 of the intro, so handing off
 * at exactly that timestamp puts both videos on the same content for the whole
 * crossfade — there is nothing for the fade to reveal. Keep in sync with
 * scripts/build-hero-loop.mjs if the loop window changes.
 */
const LOOP_HANDOFF_SECONDS = 349 / 24;

/** Crossfade duration; mirrored by the opacity transition on the loop video. */
const HANDOFF_MS = 450;

/**
 * Copy beats, in seconds of intro playback.
 *
 * Anchored to what is actually on screen rather than to round numbers, measured
 * with scripts/analyze-intro-beats.mjs and scripts/analyze-intro-geometry.mjs.
 */
const COPY_BEATS = {
  /** The shot's darkest stretch: frame luma starts at 1.4 and the droplet is still falling. */
  DARK_IN: 0.6,
  DARK_OUT: 2.6,
  /** The droplet strikes the anvil around 2.1s; by here the fire has taken hold and is growing. */
  FORGED_IN: 3.2,
  FORGED_OUT: 6.8,
  /**
   * The heart finishes forming. It does not exist at all before 7.0s, reaches 90%
   * of its final area at 8.25s and comes within 3% of it at 8.83s — so a 6s cue
   * would have landed on a frame with no heart in it.
   */
  BRAND_IN: 8.8,
} as const;

function stageForTime(seconds: number): HeroCopyStage {
  if (seconds >= COPY_BEATS.BRAND_IN) return 'brand';
  if (seconds >= COPY_BEATS.FORGED_IN && seconds < COPY_BEATS.FORGED_OUT) return 'forged';
  if (seconds >= COPY_BEATS.DARK_IN && seconds < COPY_BEATS.DARK_OUT) return 'dark';
  return 'none';
}

export function HeroAnimation({ children }: HeroAnimationProps) {
  const visualRef = useRef<HTMLDivElement>(null);
  const videoStageRef = useRef<HTMLDivElement>(null);
  const introVideoRef = useRef<HTMLVideoElement>(null);
  const loopVideoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [loopActive, setLoopActive] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [copyStage, setCopyStage] = useState<HeroCopyStage>('none');

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updateMotionPreference();
    mediaQuery.addEventListener('change', updateMotionPreference);
    return () => mediaQuery.removeEventListener('change', updateMotionPreference);
  }, []);

  // Reduced motion skips the staged narrative and rests on the final state at once.
  useEffect(() => {
    if (prefersReducedMotion) setCopyStage('brand');
  }, [prefersReducedMotion]);

  // A cached video can reach `canplay` before React attaches its listener.
  useEffect(() => {
    const intro = introVideoRef.current;
    if (!intro || prefersReducedMotion) return;

    const markReady = () => setVideoReady(true);
    if (intro.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) markReady();

    intro.addEventListener('loadeddata', markReady);
    intro.addEventListener('canplay', markReady);
    return () => {
      intro.removeEventListener('loadeddata', markReady);
      intro.removeEventListener('canplay', markReady);
    };
  }, [prefersReducedMotion]);

  useEffect(() => {
    const intro = introVideoRef.current;
    const loop = loopVideoRef.current;
    if (!intro || !loop || prefersReducedMotion) return;

    let disposed = false;
    let frameHandle = 0;
    let handedOff = false;
    let pauseIntroTimer: ReturnType<typeof setTimeout> | undefined;

    const revealLoop = () => {
      if (disposed) return;
      setLoopActive(true);
      // The loop sits above the intro and fades in, so the intro stays opaque
      // underneath for the whole crossfade and can only be retired afterwards.
      pauseIntroTimer = setTimeout(() => {
        if (!disposed) intro.pause();
      }, HANDOFF_MS + 100);
    };

    const handOff = async () => {
      if (handedOff) return;
      handedOff = true;
      try {
        loop.currentTime = 0;
        await loop.play();
      } catch {
        // Autoplay may be blocked until user interaction.
      }
      if (disposed) return;
      // Wait for a painted frame so the fade never uncovers an empty element.
      if (typeof loop.requestVideoFrameCallback === 'function') {
        loop.requestVideoFrameCallback(() => revealLoop());
      } else {
        revealLoop();
      }
    };

    // Beats are driven by the video's own clock, so buffering or a late start moves
    // the copy with the footage instead of desyncing from it.
    const syncCopy = (seconds: number) => {
      const next = stageForTime(seconds);
      setCopyStage((current) => (current === next ? current : next));
    };

    const watchIntro = () => {
      if (disposed) return;
      syncCopy(intro.currentTime);
      if (!handedOff && intro.currentTime >= LOOP_HANDOFF_SECONDS) {
        void handOff();
      }
      frameHandle = intro.requestVideoFrameCallback(watchIntro);
    };

    const startIntro = async () => {
      try {
        await intro.play();
      } catch {
        // Autoplay may be blocked until user interaction.
      }
    };

    void startIntro();

    if (typeof intro.requestVideoFrameCallback === 'function') {
      frameHandle = intro.requestVideoFrameCallback(watchIntro);
    }
    // Safety net for browsers without rVFC: never strand the hero on a still frame.
    intro.addEventListener('ended', handOff);
    // Coarser, but still the video's clock, so the beats survive a missing rVFC.
    const handleTimeUpdate = () => syncCopy(intro.currentTime);
    intro.addEventListener('timeupdate', handleTimeUpdate);

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const target = handedOff ? loop : intro;
      if (target.paused) void target.play().catch(() => {});
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      disposed = true;
      clearTimeout(pauseIntroTimer);
      if (frameHandle && typeof intro.cancelVideoFrameCallback === 'function') {
        intro.cancelVideoFrameCallback(frameHandle);
      }
      intro.removeEventListener('ended', handOff);
      intro.removeEventListener('timeupdate', handleTimeUpdate);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [prefersReducedMotion]);

  const showVideo = !prefersReducedMotion;

  return (
    <section
      ref={visualRef}
      className="relative isolate w-full overflow-hidden bg-black max-lg:pb-16 max-lg:pt-20 lg:h-[100dvh] lg:min-h-[100svh]"
      // Named by the wordmark itself rather than a literal aria-label, which would
      // otherwise announce "Forged in the Fire" twice.
      aria-labelledby={HERO_HEADING_ID}
    >
      <HeroAmbientField
        videoRef={loopActive ? loopVideoRef : introVideoRef}
        ambientRootRef={visualRef}
        videoStageRef={videoStageRef}
        active={showVideo && videoReady}
      />

      {/*
        Desktop: full-viewport cover. Below lg: a 16:9 stage under the nav so
        portrait object-fit:cover cannot zoom past the anvil. The inner cover
        frame is the 16:9 box that `object-fit: cover` would paint, so copy
        percentages stay on the same source row as the artwork.
      */}
      <div
        ref={videoStageRef}
        className="relative z-[1] aspect-video w-full overflow-hidden bg-black max-lg:max-h-[calc(100dvh-9rem)] lg:absolute lg:inset-0 lg:max-h-none lg:aspect-auto"
        aria-hidden="true"
      >
        {/* Painted immediately; videos fade over it. Reduced motion keeps this still. */}
        <img
          src={HERO_POSTER_SRC}
          alt=""
          width={1280}
          height={720}
          decoding="async"
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />

        {showVideo ? (
          <>
            <video
              ref={introVideoRef}
              autoPlay
              muted
              playsInline
              preload="auto"
              poster={HERO_POSTER_SRC}
              onLoadedData={() => setVideoReady(true)}
              onCanPlay={() => setVideoReady(true)}
              onPlaying={() => setVideoReady(true)}
              className="absolute inset-0 z-0 h-full w-full object-cover object-center"
            >
              <source src={HERO_VIDEO_SRC} type="video/mp4" />
            </video>

            {/* Seamless tail; the browser loops this natively so nothing seeks. */}
            <video
              ref={loopVideoRef}
              muted
              loop
              playsInline
              preload="auto"
              poster={HERO_POSTER_SRC}
              aria-hidden="true"
              className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-[450ms] ease-linear ${
                loopActive ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <source src={HERO_LOOP_SRC} type="video/mp4" />
            </video>
          </>
        ) : null}
      </div>

      {/*
        Cover-sized 16:9 overlay, sibling of the video plane so a GPU video
        layer cannot paint over the wordmark. Sized to match the stage.
      */}
      <div className="pointer-events-none absolute inset-x-0 top-20 z-20 aspect-video overflow-hidden [container-type:size] max-lg:max-h-[calc(100dvh-9rem)] lg:inset-0 lg:top-0 lg:aspect-auto">
        <div
          className="absolute left-1/2 top-1/2 aspect-video -translate-x-1/2 -translate-y-1/2"
          style={{ width: 'max(100%, calc(100cqh * 16 / 9))' }}
        >
          <HeroCopy stage={loopActive ? 'brand' : copyStage} />
        </div>
      </div>

      {/* Overlay slot for anything a caller wants above the copy */}
      {children ? (
        <div className="pointer-events-none absolute inset-0 z-[2] flex flex-col">
          <div className="pointer-events-auto flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
      ) : null}
    </section>
  );
}
