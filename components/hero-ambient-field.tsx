'use client';

import { useEffect, useRef, useState } from 'react';
import {
  analyzeVideoFrame,
  blendToPageBg,
  buildHeroBackground,
  DEFAULT_PALETTE,
  HERO_PAGE_BG,
  paletteSmoothingAlpha,
  smoothPalette,
  type VideoAmbientPalette,
} from '@/lib/hero/video-ambient';
import {
  computeMainVideoDrawRect,
  getFocalPoint,
  getRelativeRect,
} from '@/lib/hero/video-layout';

interface HeroAmbientFieldProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  ambientRootRef: React.RefObject<HTMLElement | null>;
  videoStageRef: React.RefObject<HTMLElement | null>;
  active: boolean;
  onPaletteChange?: (palette: VideoAmbientPalette) => void;
}

function drawAmbientVideo(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  rect: { x: number; y: number; width: number; height: number },
  blurPx: number,
  brightness: number,
  alpha: number
) {
  ctx.save();
  ctx.filter = `blur(${blurPx}px) saturate(115%) brightness(${brightness}) contrast(0.94)`;
  ctx.globalAlpha = alpha;
  ctx.drawImage(video, rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function paintAtmosphereOverlays(
  ctx: CanvasRenderingContext2D,
  displayW: number,
  displayH: number,
  focalY: number,
  palette: VideoAmbientPalette
) {
  const bottomSettle = blendToPageBg(palette.bottom, 0.78);

  const fade = ctx.createLinearGradient(0, 0, 0, displayH);
  fade.addColorStop(0, 'rgba(0,0,0,0.08)');
  fade.addColorStop(0.42, 'rgba(0,0,0,0)');
  fade.addColorStop(0.62, 'rgba(0,0,0,0.06)');
  fade.addColorStop(0.82, `rgba(${bottomSettle[0]},${bottomSettle[1]},${bottomSettle[2]},0.38)`);
  fade.addColorStop(1, HERO_PAGE_BG);
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, displayW, displayH);

  const vignette = ctx.createRadialGradient(
    displayW / 2,
    focalY,
    displayW * 0.2,
    displayW / 2,
    focalY,
    displayW * 0.95
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(0.55, 'rgba(0,0,0,0.03)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, displayW, displayH);
}

/**
 * Live ambient field scoped to the visual hero block only.
 */
export function HeroAmbientField({
  videoRef,
  ambientRootRef,
  videoStageRef,
  active,
  onPaletteChange,
}: HeroAmbientFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paletteRef = useRef<VideoAmbientPalette>(DEFAULT_PALETTE);
  const onPaletteChangeRef = useRef(onPaletteChange);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const [background, setBackground] = useState(buildHeroBackground(DEFAULT_PALETTE));

  useEffect(() => {
    onPaletteChangeRef.current = onPaletteChange;
  }, [onPaletteChange]);

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ambientRoot = ambientRootRef.current;
    const videoStage = videoStageRef.current;
    if (!canvas || !video || !ambientRoot || !videoStage) return;

    if (!sampleCanvasRef.current) {
      sampleCanvasRef.current = document.createElement('canvas');
    }
    const sampleCanvas = sampleCanvasRef.current;
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    const ctx = canvas.getContext('2d');
    if (!ctx || !sampleCtx) return;

    let cancelled = false;
    let frameHandle = 0;
    let frameCount = 0;

    const syncCanvasSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const displayW = canvas.clientWidth;
      const displayH = canvas.clientHeight;
      if (displayW <= 0 || displayH <= 0) return false;

      if (sizeRef.current.w !== displayW || sizeRef.current.h !== displayH || sizeRef.current.dpr !== dpr) {
        canvas.width = Math.floor(displayW * dpr);
        canvas.height = Math.floor(displayH * dpr);
        sizeRef.current = { w: displayW, h: displayH, dpr };
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    };

    const resizeObserver = new ResizeObserver(() => syncCanvasSize());
    resizeObserver.observe(canvas);
    resizeObserver.observe(ambientRoot);

    const render = () => {
      if (cancelled) return;

      if (video.readyState >= 2 && !video.paused && syncCanvasSize()) {
        const { w: displayW, h: displayH } = sizeRef.current;
        const vw = video.videoWidth;
        const vh = video.videoHeight;

        const rootRect = ambientRoot.getBoundingClientRect();
        const stageRect = getRelativeRect(rootRect, videoStage.getBoundingClientRect());
        const drawRect = computeMainVideoDrawRect(
          stageRect.x,
          stageRect.y,
          stageRect.width,
          stageRect.height,
          vw,
          vh
        );

        const focal = getFocalPoint(stageRect);

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, displayW, displayH);

        drawAmbientVideo(ctx, video, drawRect, 88, 0.52, 0.62);
        drawAmbientVideo(ctx, video, drawRect, 44, 0.66, 0.34);

        paintAtmosphereOverlays(ctx, displayW, displayH, focal.y, paletteRef.current);

        frameCount += 1;
        if (frameCount % 3 === 0) {
          const sampleW = 128;
          const sampleH = 72;
          sampleCanvas.width = sampleW;
          sampleCanvas.height = sampleH;
          sampleCtx.drawImage(video, 0, 0, sampleW, sampleH);

          const sampled = analyzeVideoFrame(sampleCtx, sampleW, sampleH);
          const alpha = paletteSmoothingAlpha(video.currentTime, video.duration);
          paletteRef.current = smoothPalette(paletteRef.current, sampled, alpha);
          setBackground(buildHeroBackground(paletteRef.current));
          onPaletteChangeRef.current?.(paletteRef.current);
        }
      }

      if ('requestVideoFrameCallback' in video) {
        frameHandle = (
          video as HTMLVideoElement & {
            requestVideoFrameCallback: (cb: VideoFrameRequestCallback) => number;
          }
        ).requestVideoFrameCallback(render);
      } else {
        frameHandle = window.requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      if ('cancelVideoFrameCallback' in video && frameHandle) {
        (
          video as HTMLVideoElement & {
            cancelVideoFrameCallback: (id: number) => void;
          }
        ).cancelVideoFrameCallback(frameHandle);
      } else {
        cancelAnimationFrame(frameHandle);
      }
    };
  }, [active, videoRef, ambientRootRef, videoStageRef]);

  if (!active) {
    return (
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{ background: buildHeroBackground(DEFAULT_PALETTE) }}
      />
    );
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.58] transition-[background] duration-[3200ms] ease-out"
        aria-hidden="true"
        style={{ background }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background: `linear-gradient(180deg, rgba(0,0,0,0.1) 0%, transparent 30%, rgba(0,0,0,0.04) 58%, rgba(36,27,24,0.28) 100%)`,
        }}
      />
    </>
  );
}
