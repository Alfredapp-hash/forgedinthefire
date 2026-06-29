'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { HeroAmbientField } from '@/components/hero-ambient-field';
import {
  buildHeroBridgeFade,
  buildHeroCopyBackdrop,
  DEFAULT_PALETTE,
  type VideoAmbientPalette,
} from '@/lib/hero/video-ambient';
import {
  getMainVideoStyle,
  getVideoMaskGradient,
  HERO_VIDEO_LAYOUT,
} from '@/lib/hero/video-layout';

interface HeroAnimationProps {
  children: React.ReactNode;
}

const HERO_VIDEO_SRC = '/hero-background.mp4';

export function HeroAnimation({ children }: HeroAnimationProps) {
  const visualRef = useRef<HTMLDivElement>(null);
  const videoStageRef = useRef<HTMLDivElement>(null);
  const mainVideoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [copyBackdrop, setCopyBackdrop] = useState(buildHeroCopyBackdrop(DEFAULT_PALETTE));
  const [bridgeFade, setBridgeFade] = useState(buildHeroBridgeFade(DEFAULT_PALETTE));

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updateMotionPreference();
    mediaQuery.addEventListener('change', updateMotionPreference);
    return () => mediaQuery.removeEventListener('change', updateMotionPreference);
  }, []);

  useEffect(() => {
    const main = mainVideoRef.current;
    if (!main || prefersReducedMotion) return;

    const startPlayback = async () => {
      try {
        main.currentTime = 0;
        await main.play();
      } catch {
        // Autoplay may be blocked until user interaction.
      }
    };

    startPlayback();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && main.paused) {
        void startPlayback();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [prefersReducedMotion]);

  const showVideo = !prefersReducedMotion;
  const videoMask = getVideoMaskGradient();

  const handlePaletteChange = (palette: VideoAmbientPalette) => {
    setBridgeFade(buildHeroBridgeFade(palette));
    setCopyBackdrop(buildHeroCopyBackdrop(palette));
  };

  return (
    <div className="relative flex flex-col overflow-x-hidden bg-[#241B18]">
      {/* Visual hero — video + ambient only; no copy overlaps this block */}
      <div ref={visualRef} className="relative isolate w-full shrink-0 bg-black">
        <HeroAmbientField
          videoRef={mainVideoRef}
          ambientRootRef={visualRef}
          videoStageRef={videoStageRef}
          active={showVideo && videoReady}
          onPaletteChange={handlePaletteChange}
        />

        <div
          className="relative z-[1] w-full overflow-hidden pb-0 pt-20 sm:pt-[5.25rem]"
          aria-hidden={!showVideo}
        >
          {showVideo && (
            <div
              ref={videoStageRef}
              className="relative w-full"
              style={{ aspectRatio: `${HERO_VIDEO_LAYOUT.aspectRatio}` }}
            >
              <video
                ref={mainVideoRef}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                onCanPlay={() => setVideoReady(true)}
                className={`absolute transition-opacity duration-[1000ms] ease-out ${
                  videoReady ? 'opacity-100' : 'opacity-0'
                }`}
                style={{
                  ...getMainVideoStyle(),
                  WebkitMaskImage: videoMask,
                  maskImage: videoMask,
                }}
              >
                <source src={HERO_VIDEO_SRC} type="video/mp4" />
              </video>
            </div>
          )}
        </div>

        {/* Bridge fade — palette-synced dissolve into copy backdrop */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[min(34vh,300px)] transition-[background] duration-[3200ms] ease-out"
          aria-hidden="true"
          style={{ background: bridgeFade }}
        />
      </div>

      {/* All copy lives below the visual hero on a synced smooth backdrop */}
      <motion.div
        className="relative z-10 -mt-px shrink-0 px-4 pb-10 pt-8 transition-[background] duration-[3200ms] ease-out sm:px-6 sm:pb-14 sm:pt-10 lg:px-8"
        style={{ background: copyBackdrop }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.15, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </div>
  );
}
