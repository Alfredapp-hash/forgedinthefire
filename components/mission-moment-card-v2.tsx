'use client';

import { motion, useReducedMotion, useAnimation, Variants, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { useEffect, useState, useRef, useCallback } from 'react';

// Slower, calmer timing for elegance
const TIMING = {
  sparkIn: 0,
  sparkHold: 4000,      // More contemplative
  sparkOut: 5200,       // Gentler overlap
  logoIgnite: 6500,     // Slower emergence
  missionIn: 10500,     // Longer pause to appreciate
  missionHold: 16500,   // Extended contemplative hold
  missionOut: 18200,    // Slower fade
  taglineIn: 20000,     // Graceful, unhurried finale
  sequenceComplete: 26000, // Calm, settled
};

// Silky smooth easing - more organic motion
const EASE = {
  cinematic: [0.22, 0.61, 0.36, 1],      // Smooth deceleration
  dramatic: [0.165, 0.84, 0.44, 1],     // Elegant power
  soft: [0.4, 0, 0.2, 1],               // Gentle ease
  silk: [0.25, 0.46, 0.45, 0.94],        // Buttery smooth
  breathe: { type: 'spring', stiffness: 60, damping: 25, mass: 1.5 },
};

// Silky word animation - slower, more elegant
const wordVariants: Variants = {
  hidden: { opacity: 0, y: 10, filter: 'blur(6px)' },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      delay: i * 0.1,
      duration: 0.7,
      ease: EASE.silk,
    },
  }),
  exit: {
    opacity: 0,
    y: -8,
    filter: 'blur(4px)',
    transition: { duration: 0.6, ease: EASE.soft },
  },
};

const lineVariants: Variants = {
  hidden: { opacity: 0, y: 16, filter: 'blur(8px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.9, ease: EASE.cinematic },
  },
  exit: {
    opacity: 0,
    y: -12,
    filter: 'blur(4px)',
    transition: { duration: 0.7, ease: EASE.soft },
  },
};

export function MissionMomentCardV2() {
  const prefersReducedMotion = useReducedMotion();
  const [phase, setPhase] = useState(0);
  const [sparkWords, setSparkWords] = useState<string[]>([]);
  const [missionWords, setMissionWords] = useState<string[]>([]);
  const [sequenceKey, setSequenceKey] = useState(0);
  const [showBurst, setShowBurst] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const controls = useAnimation();
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef(false);

  // Split text for word animation
  useEffect(() => {
    setSparkWords('A spark lit the forge to illuminate the night.'.split(' '));
    setMissionWords("Now we stand resolute, to bring what's in darkness to light.".split(' '));
  }, []);

  // Scroll-triggered restart - only when section fully leaves and reenters
  useEffect(() => {
    if (prefersReducedMotion || !containerRef.current) return;

    let wasFullyVisible = false;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Only restart when section becomes visible AND was previously hidden
          if (entry.isIntersecting && entry.intersectionRatio >= 0.3) {
            if (!wasFullyVisible && hasAnimatedRef.current) {
              // Section reentered after being hidden - restart
              setPhase(0);
              setShowBurst(false);
              setSequenceKey(prev => prev + 1);
            }
            wasFullyVisible = true;
            hasAnimatedRef.current = true;
          } else if (!entry.isIntersecting || entry.intersectionRatio < 0.1) {
            // Section left viewport
            wasFullyVisible = false;
          }
        });
      },
      {
        threshold: [0, 0.1, 0.3, 0.9],
        rootMargin: '0px',
      }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  // Sequence timing - restarted by sequenceKey change
  useEffect(() => {
    if (prefersReducedMotion) {
      setPhase(4);
      controls.start('complete');
      return;
    }

    const sequence = async () => {
      // Reset
      setPhase(0);
      setShowBurst(false);
      
      // Spark line appears
      await new Promise(r => setTimeout(r, 100));
      setPhase(1);
      await new Promise(r => setTimeout(r, TIMING.sparkHold));
      
      // Spark fades, logo ignites
      setPhase(2);
      setShowBurst(true);
      await new Promise(r => setTimeout(r, TIMING.logoIgnite - TIMING.sparkHold));
      
      // Mission line appears
      setPhase(3);
      await new Promise(r => setTimeout(r, TIMING.missionHold - TIMING.logoIgnite));
      
      // Mission fades, tagline appears
      setPhase(4);
      await new Promise(r => setTimeout(r, TIMING.sequenceComplete - TIMING.missionHold));
      
      controls.start('complete');
    };

    sequence();
  }, [prefersReducedMotion, controls, sequenceKey]);

  // Mouse-reactive glow tracking
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || prefersReducedMotion) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    // Clamp to 0-1 range with padding for edge effects
    setMousePos({
      x: Math.max(0.1, Math.min(0.9, x)),
      y: Math.max(0.1, Math.min(0.9, y)),
    });
  }, [prefersReducedMotion]);

  const handleMouseLeave = useCallback(() => {
    setMousePos({ x: 0.5, y: 0.5 });
  }, []);

  if (prefersReducedMotion) {
    return <ReducedMotionCard />;
  }

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="aspect-square rounded-xl p-[2px] relative cursor-default"
      style={{
        background: 'linear-gradient(135deg, rgba(83, 214, 255,0.18) 0%, rgba(26, 35, 44,0.6) 50%, rgba(83, 214, 255,0.18) 100%)',
      }}
    >
      <div 
        className="w-full h-full rounded-[10px] flex items-center justify-center relative overflow-hidden"
        style={{
          background: '#11161C',
          boxShadow: '0 0 40px rgba(83,214,255,0.12), inset 0 1px 0 rgba(141, 235, 255,0.08)',
        }}
      >
        {/* Vignette overlay */}
        <div 
          className="absolute inset-0 pointer-events-none z-[1]"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.4) 100%)',
          }}
        />

        {/* Mouse-reactive ambient glow */}
        <MouseReactiveGlow mousePos={mousePos} phase={phase} />

        {/* Ambient glow layers */}
        <AmbientGlow phase={phase} />

        {/* Ember particles */}
        <EmberParticles />

        {/* Particle burst on logo ignition */}
        <ParticleBurst show={showBurst && phase === 2} />

        {/* Content container */}
        <div className="text-center px-5 py-6 relative z-10 flex flex-col items-center justify-center h-full max-w-[260px]">
          
          {/* Glass morphism text backdrop - slimmer */}
          <motion.div
            className="absolute inset-0 rounded-[10px] pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase >= 1 && phase <= 3 ? 0.25 : 0 }}
            transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              background: 'linear-gradient(180deg, rgba(36,27,24,0.5) 0%, rgba(83, 214, 255,0.08) 50%, rgba(36,27,24,0.5) 100%)',
              backdropFilter: 'blur(6px)',
            }}
          />

          {/* Phase 1: Spark Line */}
          <AnimatePresence mode="wait">
            {phase === 1 && (
              <motion.div
                key={`spark-${sequenceKey}`}
                className="relative z-10"
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <p className="font-serif text-lg italic text-[#8DEBFF] leading-relaxed">
                  {sparkWords.map((word, i) => (
                    <motion.span
                      key={i}
                      custom={i}
                      variants={wordVariants}
                      initial="hidden"
                      animate="visible"
                      className="inline-block mr-[0.3em]"
                    >
                      {word}
                    </motion.span>
                  ))}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Phase 2 & 3 & 4: Logo with calm, subtle breathing */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, filter: 'blur(3px)' }}
            animate={{ 
              opacity: phase >= 2 ? 1 : 0,
              scale: phase >= 2 ? 1 : 0.92,
              filter: phase >= 2 ? 'blur(0px)' : 'blur(3px)',
            }}
            transition={{ duration: 1.8, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="relative my-3"
            style={{ width: '7rem', height: '10.5rem' }}
          >
            <LogoGlow phase={phase} mousePos={mousePos} />
            
            <motion.div
              animate={phase >= 4 ? {
                scale: [1, 1.003, 1],
                opacity: [0.995, 1, 0.995],
              } : {}}
              transition={{
                duration: 10,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="relative w-full h-full"
            >
              <Image
                src="/brand/fitf-mark.png"
                alt="Forged in the Fire"
                fill
                className="object-contain drop-shadow-xl"
                priority
              />
            </motion.div>
          </motion.div>

          {/* Phase 3: Mission Line */}
          <AnimatePresence mode="wait">
            {phase === 3 && (
              <motion.div
                key={`mission-${sequenceKey}`}
                variants={lineVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="relative z-10"
              >
                <p className="font-serif text-base italic text-[#E4EBF1] leading-relaxed tracking-wide">
                  "Now we stand resolute, to bring
                  <br />
                  what's in darkness to light."
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Phase 4: Final Tagline - Calm, elegant entrance */}
          <AnimatePresence mode="wait">
            {phase >= 4 && (
              <motion.div
                key={`tagline-${sequenceKey}`}
                initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
                animate={{ 
                  opacity: 1, 
                  y: 0,
                  filter: 'blur(0px)',
                }}
                transition={{ 
                  duration: 1.8, 
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
                className="relative z-10"
              >
                <p 
                  className="font-serif text-xl italic text-[#F6FAFC] leading-relaxed tracking-tight"
                  style={{ textShadow: '0 2px 20px rgba(83, 214, 255,0.15)' }}
                >
                  "The fire that forges us
                  <br />
                  also frees us."
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// Mouse-reactive glow that follows cursor
function MouseReactiveGlow({ mousePos, phase }: { mousePos: { x: number; y: number }; phase: number }) {
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: phase >= 1 ? 0.5 : 0 }}
      transition={{ duration: 1 }}
      style={{
        background: `radial-gradient(circle at ${mousePos.x * 100}% ${mousePos.y * 100}%, rgba(83, 214, 255,0.25) 0%, transparent 50%)`,
      }}
    />
  );
}

// Ambient glow - slimmer, more refined
function AmbientGlow({ phase }: { phase: number }) {
  return (
    <>
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ 
          opacity: phase >= 1 ? (phase >= 4 ? 0.4 : 0.7) : 0,
        }}
        transition={{ duration: 1.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{
          background: 'radial-gradient(circle at 30% 30%, rgba(83, 214, 255,0.15) 0%, transparent 55%)',
        }}
      />
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 2 ? 0.4 : 0 }}
        transition={{ duration: 1.8, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{
          background: 'radial-gradient(circle at 70% 70%, rgba(83, 214, 255,0.1) 0%, transparent 50%)',
        }}
      />
      <motion.div
        className="absolute inset-0 pointer-events-none flex items-center justify-center"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ 
          opacity: phase >= 2 ? (phase >= 4 ? 0.35 : 0.6) : 0,
          scale: phase >= 2 ? 1 : 0.9,
        }}
        transition={{ duration: 1.8, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <motion.div
          className="w-44 h-44 rounded-full"
          animate={phase >= 2 ? {
            opacity: [0.3, 0.38, 0.3],
            scale: [1, 1.025, 1],
          } : {}}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{
            background: 'radial-gradient(circle, rgba(83, 214, 255,0.25) 0%, rgba(141, 235, 255,0.1) 40%, transparent 70%)',
            filter: 'blur(28px)',
          }}
        />
      </motion.div>
    </>
  );
}

// Logo glow - slimmer, calmer, with subtle mouse reactivity
function LogoGlow({ phase, mousePos }: { phase: number; mousePos: { x: number; y: number } }) {
  // Subtle parallax offset based on mouse
  const parallaxX = (mousePos.x - 0.5) * 6;
  const parallaxY = (mousePos.y - 0.5) * 6;

  return (
    <>
      {/* Outer aura with parallax - reduced spread */}
      <motion.div
        className="absolute inset-0 -m-6 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ 
          opacity: phase >= 2 ? 0.45 : 0,
          x: parallaxX,
          y: parallaxY,
        }}
        transition={{ opacity: { duration: 1.5 }, x: { duration: 0.4 }, y: { duration: 0.4 } }}
      >
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full rounded-full"
          animate={phase >= 2 ? {
            opacity: [0.3, 0.38, 0.3],
            scale: [0.99, 1.01, 0.99],
          } : {}}
          transition={{
            duration: 7,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{
            background: 'radial-gradient(circle, rgba(83, 214, 255,0.3) 0%, rgba(141, 235, 255,0.1) 50%, transparent 70%)',
            filter: 'blur(16px)',
          }}
        />
      </motion.div>

      {/* Heart/core glow - slimmer, calmer pulse */}
      <motion.div
        className="absolute top-[35%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ 
          opacity: phase >= 2 ? 0.75 : 0,
          scale: phase >= 2 ? [1, 1.06, 1] : 1,
          x: parallaxX * 1.2,
          y: parallaxY * 1.2,
        }}
        transition={{
          opacity: { duration: 1.5 },
          scale: {
            duration: 5,
            repeat: Infinity,
            ease: 'easeInOut',
          },
          x: { duration: 0.5 },
          y: { duration: 0.5 },
        }}
        style={{
          background: 'radial-gradient(circle, rgba(83, 214, 255,0.4) 0%, rgba(141, 235, 255,0.2) 50%, transparent 70%)',
          filter: 'blur(8px)',
        }}
      />
    </>
  );
}

// Silk-smooth particle burst on logo ignition
function ParticleBurst({ show }: { show: boolean }) {
  const particles = [...Array(10)].map((_, i) => ({
    id: i,
    angle: (i / 10) * 360 + Math.random() * 25,
    distance: 35 + Math.random() * 30,
    size: 2 + Math.random() * 2,
    duration: 0.8 + Math.random() * 0.5,
    delay: Math.random() * 0.08,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
      <AnimatePresence>
        {show && particles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full"
            initial={{ 
              opacity: 0,
              scale: 0,
              x: 0,
              y: 0,
            }}
            animate={{ 
              opacity: [0, 0.9, 0],
              scale: [0, 1, 0.3],
              x: Math.cos((p.angle * Math.PI) / 180) * p.distance,
              y: Math.sin((p.angle * Math.PI) / 180) * p.distance,
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              ease: EASE.silk,
            }}
            style={{
              width: p.size,
              height: p.size,
              background: `radial-gradient(circle, rgba(${210 + Math.random() * 30}, ${170 + Math.random() * 25}, ${120 + Math.random() * 30}, 0.85) 0%, transparent 70%)`,
              boxShadow: `0 0 ${p.size * 2.5}px rgba(141, 235, 255, 0.5)`,
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

// Elegant floating ember particles
function EmberParticles() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: 1.5 + (i % 2) * 0.5,
            height: 1.5 + (i % 2) * 0.5,
            background: 'radial-gradient(circle, rgba(141, 235, 255, 0.5) 0%, transparent 70%)',
            left: `${25 + i * 11}%`,
            top: `${35 + (i % 3) * 18}%`,
          }}
          animate={{
            y: [0, -25, 0],
            opacity: [0, 0.4, 0],
            x: [0, (i % 2 === 0 ? 8 : -8), 0],
          }}
          transition={{
            duration: 7 + i * 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 2,
          }}
        />
      ))}
    </div>
  );
}

// Reduced motion version - calm, static elegance
function ReducedMotionCard() {
  return (
    <div 
      className="aspect-square rounded-xl p-[2px]"
      style={{
        background: 'linear-gradient(135deg, rgba(83, 214, 255,0.18) 0%, rgba(26, 35, 44,0.6) 50%, rgba(83, 214, 255,0.18) 100%)',
      }}
    >
      <div 
        className="w-full h-full rounded-[10px] flex items-center justify-center relative overflow-hidden"
        style={{
          background: '#11161C',
          boxShadow: '0 0 40px rgba(83,214,255,0.12), inset 0 1px 0 rgba(141, 235, 255,0.08)',
        }}
      >
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 30% 30%, rgba(83, 214, 255,0.12) 0%, transparent 55%)',
          }}
        />
        
        <div className="text-center px-5 py-6 relative z-10 flex flex-col items-center justify-center h-full max-w-[260px]">
          <div className="relative mb-4" style={{ width: '7rem', height: '10.5rem' }}>
            <div 
              className="absolute inset-0 -m-4 pointer-events-none"
              style={{
                background: 'radial-gradient(circle, rgba(83, 214, 255,0.25) 0%, rgba(141, 235, 255,0.1) 50%, transparent 70%)',
                filter: 'blur(12px)',
              }}
            />
            <Image
              src="/brand/fitf-mark.png"
              alt="Forged in the Fire"
              fill
              className="object-contain drop-shadow-xl"
              priority
            />
          </div>

          <p className="font-serif text-xl italic text-[#F6FAFC] leading-relaxed tracking-tight"
             style={{ textShadow: '0 2px 20px rgba(83, 214, 255,0.15)' }}>
            "The fire that forges us
            <br />
            also frees us."
          </p>
        </div>
      </div>
    </div>
  );
}
