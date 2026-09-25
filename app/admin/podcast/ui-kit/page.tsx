'use client';

import { useState } from 'react';
import { Circle, Mic, Pause, Play, Scissors, Square } from 'lucide-react';
import {
  Badge,
  Button,
  Chip,
  Fader,
  IconButton,
  Kbd,
  laneColor,
  LANE_IDS,
  Meter,
  Panel,
  RecordButton,
  SegmentedControl,
  Slider,
  type RecordState,
} from '@/components/studio-ui';

/**
 * studio-ui kit reference — how the human approves the design system
 * before it is applied to the studio screens. Self-contained; renders
 * every primitive in its states plus a swatch board of the tokens.
 */
export default function StudioUiKitPage() {
  const [recState, setRecState] = useState<RecordState>('idle');
  const [seg, setSeg] = useState<'edit' | 'mix' | 'export'>('edit');
  const [slider, setSlider] = useState(62);
  const [fader, setFader] = useState(75);
  const [meter, setMeter] = useState(0.7);

  const cycleRec = () =>
    setRecState((s) =>
      s === 'idle' ? 'armed' : s === 'armed' ? 'recording' : 'idle'
    );

  return (
    <div className="admin-portal min-h-full overflow-y-auto bg-obsidian px-8 py-10 text-white">
      <div className="mx-auto max-w-5xl space-y-12">
        <header className="space-y-2">
          <p className="studio-type-label">Design System · Phase 0</p>
          <h1 className="studio-type-section !text-[22px]">Studio UI Kit</h1>
          <p className="studio-type-body max-w-2xl">
            GarageBand-style primitives on the Forged Light brand. Every
            control here is token-driven and additive — nothing below
            replaces existing brand tokens.
          </p>
        </header>

        {/* ---- Palette ---- */}
        <Section title="Brand palette">
          <div className="flex flex-wrap gap-3">
            <Swatch name="obsidian" hex="#05070A" />
            <Swatch name="gunmetal" hex="#11161C" />
            <Swatch name="steel" hex="#1A232C" />
            <Swatch name="card" hex="#151B22" />
            <Swatch name="divider" hex="#27313B" />
            <Swatch name="forged-blue" hex="#53D6FF" />
            <Swatch name="ice-blue" hex="#8DEBFF" />
            <Swatch name="heart" hex="#FF5B73" />
          </div>
        </Section>

        {/* ---- Lane hues ---- */}
        <Section title="Track-lane hues">
          <div className="flex flex-wrap gap-3">
            {LANE_IDS.map((id) => {
              const c = laneColor(id);
              return (
                <div
                  key={id}
                  className="w-40 overflow-hidden rounded-tile border border-divider"
                  style={{ background: c.laneBg }}
                >
                  <div className="h-10" style={{ background: c.clipFill, borderBottom: `1px solid ${c.border}` }} />
                  <div className="flex items-center gap-2 px-3 py-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: c.base }} />
                    <span className="studio-type-label">{id}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ---- Depth + glows ---- */}
        <Section title="Depth & glow">
          <div className="flex flex-wrap gap-4">
            <ShadowTile label="depth-sm" className="shadow-depth-sm" />
            <ShadowTile label="depth-md" className="shadow-depth-md" />
            <ShadowTile label="depth-lg" className="shadow-depth-lg" />
            <ShadowTile label="glow-subtle" className="shadow-glow-subtle" />
            <ShadowTile label="glow-medium" className="shadow-glow-medium" />
            <ShadowTile label="glow-strong" className="shadow-glow-strong" />
            <ShadowTile label="rec-glow" className="shadow-rec" />
            <ShadowTile label="highlight-rim" className="shadow-highlight-rim" />
          </div>
        </Section>

        {/* ---- Type scale ---- */}
        <Section title="Type scale">
          <div className="space-y-3 rounded-panel border border-divider bg-surface-card p-6">
            <p className="studio-type-section">Section header</p>
            <p className="studio-type-column">Column header</p>
            <p className="studio-type-button">Button label</p>
            <p className="studio-type-body">
              Body copy — regular 14, the working text of the studio.
            </p>
            <p className="studio-type-label">Label caps</p>
            <p className="studio-type-timecode">00:12:34:07</p>
          </div>
        </Section>

        {/* ---- Buttons ---- */}
        <Section title="Buttons">
          <div className="space-y-4">
            <Row>
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="secondary" disabled>
                Disabled
              </Button>
            </Row>
            <Row>
              <Button size="touch">Touch 44</Button>
              <Button size="compact">Compact 36</Button>
              <Button size="dense">Dense 28</Button>
            </Row>
            <Row>
              <IconButton aria-label="Play" variant="secondary">
                <Play />
              </IconButton>
              <IconButton aria-label="Pause" variant="ghost">
                <Pause />
              </IconButton>
              <IconButton aria-label="Split clip" variant="ghost" active>
                <Scissors />
              </IconButton>
              <IconButton aria-label="Arm" variant="danger">
                <Circle />
              </IconButton>
            </Row>
          </div>
        </Section>

        {/* ---- Segmented + chips + kbd ---- */}
        <Section title="Segmented, chips & keys">
          <div className="space-y-4">
            <SegmentedControl
              aria-label="Studio mode"
              value={seg}
              onValueChange={setSeg}
              options={[
                { value: 'edit', label: 'Edit' },
                { value: 'mix', label: 'Mix' },
                { value: 'export', label: 'Export' },
              ]}
            />
            <Row>
              <Chip>Neutral</Chip>
              <Chip tone="accent" dot>
                Live
              </Chip>
              <Chip tone="record" dot>
                REC
              </Chip>
              <Chip tone="success" dot>
                Synced
              </Chip>
              <Badge tone="accent">3 takes</Badge>
            </Row>
            <Row>
              <span className="studio-type-body flex items-center gap-2">
                Split <Kbd>⌘</Kbd>
                <Kbd>B</Kbd>
              </span>
              <span className="studio-type-body flex items-center gap-2">
                Play <Kbd>Space</Kbd>
              </span>
            </Row>
          </div>
        </Section>

        {/* ---- Meters, sliders, faders ---- */}
        <Section title="Meters, sliders & faders">
          <div className="flex flex-wrap items-end gap-10">
            <div className="w-64 space-y-4">
              <div>
                <p className="studio-type-label mb-2">Meter</p>
                <Meter level={meter} aria-label="Output level" />
              </div>
              <div>
                <p className="studio-type-label mb-2">Slider · {slider}</p>
                <Slider
                  aria-label="Gain"
                  value={slider}
                  onChange={(e) => setSlider(Number(e.target.value))}
                />
              </div>
              <Button
                size="compact"
                variant="secondary"
                onClick={() => setMeter(Math.random())}
              >
                Randomize meter
              </Button>
            </div>
            <div className="flex items-end gap-4">
              <div className="flex flex-col items-center gap-2">
                <div className="h-40">
                  <Fader
                    aria-label="Channel fader"
                    value={fader}
                    onChange={(e) => setFader(Number(e.target.value))}
                  />
                </div>
                <span className="studio-type-timecode">{fader}</span>
              </div>
              <div className="h-40">
                <Meter level={meter} orientation="vertical" aria-label="Channel level" />
              </div>
            </div>
          </div>
        </Section>

        {/* ---- Record button ---- */}
        <Section title="Record button (signature)">
          <div className="flex items-center gap-8">
            <div className="flex flex-col items-center gap-3">
              <RecordButton
                state={recState}
                onClick={cycleRec}
                size={84}
              />
              <Chip
                tone={recState === 'recording' ? 'record' : recState === 'armed' ? 'accent' : 'neutral'}
                dot
              >
                {recState}
              </Chip>
            </div>
            <div className="flex items-center gap-4">
              <StateHint state="idle" active={recState} label="Idle" icon={<Mic size={16} />} />
              <StateHint state="armed" active={recState} label="Armed · breathes" icon={<Circle size={16} />} />
              <StateHint state="recording" active={recState} label="Recording · heartbeat" icon={<Square size={16} />} />
            </div>
          </div>
          <p className="studio-type-body mt-4 text-silver-label">
            Click the button to cycle idle → armed → recording. Reduced-motion
            replaces the breathe/pulse with strong static rims.
          </p>
        </Section>

        {/* ---- Panels ---- */}
        <Section title="Panels">
          <div className="flex flex-wrap gap-4">
            <Panel elevation="flat" className="w-56 p-5">
              <p className="studio-type-column mb-1">Flat</p>
              <p className="studio-type-body">Sunken card, depth-sm.</p>
            </Panel>
            <Panel elevation="raised" tactile className="w-56 p-5">
              <p className="studio-type-column mb-1">Raised</p>
              <p className="studio-type-body">Default panel, depth-md.</p>
            </Panel>
            <Panel elevation="floating" className="w-56 p-5">
              <p className="studio-type-column mb-1">Floating</p>
              <p className="studio-type-body">depth-lg + subtle glow.</p>
            </Panel>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="studio-type-column border-b border-divider pb-2">{title}</h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function Swatch({ name, hex }: { name: string; hex: string }) {
  return (
    <div className="w-28">
      <div
        className="h-16 rounded-tile border border-divider"
        style={{ background: hex }}
      />
      <p className="studio-type-label mt-1.5">{name}</p>
      <p className="studio-type-timecode">{hex}</p>
    </div>
  );
}

function ShadowTile({ label, className }: { label: string; className: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`h-16 w-16 rounded-tile border border-divider bg-surface-card ${className}`} />
      <span className="studio-type-label">{label}</span>
    </div>
  );
}

function StateHint({
  state,
  active,
  label,
  icon,
}: {
  state: RecordState;
  active: RecordState;
  label: string;
  icon: React.ReactNode;
}) {
  const on = state === active;
  return (
    <div
      className={`flex items-center gap-2 rounded-control border px-3 py-2 transition-colors ${
        on ? 'border-forged/60 text-white' : 'border-divider text-silver-label'
      }`}
    >
      {icon}
      <span className="studio-type-label">{label}</span>
    </div>
  );
}
