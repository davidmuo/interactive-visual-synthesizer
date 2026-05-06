import { useState, useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) };
}

const DRUM_NAMES = ['KICK', 'SNARE', 'HI-HAT', 'CLAP', 'TOM', 'RIM', 'COWBELL', 'CLAVE'];
const DRUM_SHORTCUTS = ['1', '2', '3', '4', '5', '6', '7', '8'];
const STEPS = 16;

interface RecordedEvent { drumIdx: number; time: number; }

interface DrumMachineProps {
  bpm: number;
  isPlaying: boolean;
  color?: string;
  glowColor?: string;
  dangerColor?: string;
  bgColor?: string;
  muted?: boolean;
}

// ── Realistic drum synthesis using layered oscillators + noise + filters ──
function triggerDrumSound(drumIdx: number, destination: Tone.Gain) {
  const now = Tone.now();
  try {
    switch (drumIdx) {
      case 0: { // KICK — layered sub + body + click
        // Sub layer
        const sub = new Tone.Synth({
          oscillator: { type: 'sine' },
          envelope: { attack: 0.003, decay: 0.4, sustain: 0, release: 0.3 },
        }).connect(destination);
        sub.triggerAttackRelease('C1', '4n', now);

        // Body with pitch sweep
        const body = new Tone.MembraneSynth({
          pitchDecay: 0.08,
          octaves: 8,
          envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.5 },
        }).connect(destination);
        body.volume.value = -4;
        body.triggerAttackRelease('C1', '8n', now);

        // Click transient
        const click = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: { attack: 0.001, decay: 0.015, sustain: 0, release: 0.01 },
        });
        const clickFilter = new Tone.Filter(3500, 'bandpass', -24).connect(destination);
        click.connect(clickFilter);
        click.volume.value = -8;
        click.triggerAttackRelease('64n', now);

        setTimeout(() => { sub.dispose(); body.dispose(); click.dispose(); clickFilter.dispose(); }, 2000);
        break;
      }
      case 1: { // SNARE — body tone + noise rattle + transient
        // Body tone
        const body = new Tone.Synth({
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.08 },
        }).connect(destination);
        body.volume.value = -6;
        body.triggerAttackRelease('D3', '32n', now);

        // Noise rattle (snare wires)
        const noise = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.12 },
        });
        const noiseBP = new Tone.Filter(3200, 'bandpass', -12).connect(destination);
        const noiseHP = new Tone.Filter(1200, 'highpass', -12).connect(noiseBP);
        noise.connect(noiseHP);
        noise.volume.value = -3;
        noise.triggerAttackRelease('16n', now);

        // High transient
        const click = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: { attack: 0.0005, decay: 0.01, sustain: 0, release: 0.005 },
        });
        const clickHP = new Tone.Filter(6000, 'highpass').connect(destination);
        click.connect(clickHP);
        click.volume.value = -10;
        click.triggerAttackRelease('128n', now);

        setTimeout(() => { body.dispose(); noise.dispose(); noiseBP.dispose(); noiseHP.dispose(); click.dispose(); clickHP.dispose(); }, 1500);
        break;
      }
      case 2: { // HI-HAT — metallic + filtered noise
        const metal = new Tone.MetalSynth({
          envelope: { attack: 0.0005, decay: 0.06, sustain: 0, release: 0.015 },
          harmonicity: 5.1,
          modulationIndex: 40,
          resonance: 5500,
          octaves: 1.2,
        }).connect(destination);
        metal.volume.value = -8;
        metal.triggerAttackRelease('32n', now);

        // Noise shimmer
        const noise = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: { attack: 0.0005, decay: 0.04, sustain: 0, release: 0.02 },
        });
        const hp = new Tone.Filter(8000, 'highpass', -24).connect(destination);
        noise.connect(hp);
        noise.volume.value = -10;
        noise.triggerAttackRelease('64n', now);

        setTimeout(() => { metal.dispose(); noise.dispose(); hp.dispose(); }, 800);
        break;
      }
      case 3: { // CLAP — multi-layered noise bursts
        const burstCount = 3;
        const disposables: Tone.ToneAudioNode[] = [];
        for (let i = 0; i < burstCount; i++) {
          const n = new Tone.NoiseSynth({
            noise: { type: 'pink' },
            envelope: { attack: 0.001, decay: 0.01, sustain: 0, release: 0.005 },
          });
          const bp = new Tone.Filter(1800, 'bandpass', -12).connect(destination);
          n.connect(bp);
          n.volume.value = -4;
          n.triggerAttackRelease('128n', now + i * 0.012);
          disposables.push(n, bp);
        }
        // Tail
        const tail = new Tone.NoiseSynth({
          noise: { type: 'pink' },
          envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.15 },
        });
        const tailBP = new Tone.Filter(1600, 'bandpass', -12).connect(destination);
        tail.connect(tailBP);
        tail.volume.value = -6;
        tail.triggerAttackRelease('16n', now + 0.04);
        disposables.push(tail, tailBP);

        setTimeout(() => disposables.forEach(d => d.dispose()), 1500);
        break;
      }
      case 4: { // TOM — pitched membrane + body resonance
        const body = new Tone.MembraneSynth({
          pitchDecay: 0.06,
          octaves: 5,
          envelope: { attack: 0.001, decay: 0.28, sustain: 0.01, release: 0.25 },
        }).connect(destination);
        body.volume.value = -2;
        body.triggerAttackRelease('G2', '16n', now);

        const resonance = new Tone.Synth({
          oscillator: { type: 'sine' },
          envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.15 },
        }).connect(destination);
        resonance.volume.value = -12;
        resonance.triggerAttackRelease('G3', '32n', now);

        setTimeout(() => { body.dispose(); resonance.dispose(); }, 1500);
        break;
      }
      case 5: { // RIM — sharp click + tone
        const click = new Tone.Synth({
          oscillator: { type: 'square' },
          envelope: { attack: 0.0005, decay: 0.008, sustain: 0, release: 0.005 },
        }).connect(destination);
        click.volume.value = -6;
        click.triggerAttackRelease('G5', '128n', now);

        const tone = new Tone.Synth({
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 },
        }).connect(destination);
        tone.volume.value = -10;
        tone.triggerAttackRelease('C5', '64n', now);

        const noise = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: { attack: 0.0005, decay: 0.006, sustain: 0, release: 0.003 },
        });
        const hp = new Tone.Filter(5000, 'highpass').connect(destination);
        noise.connect(hp);
        noise.volume.value = -12;
        noise.triggerAttackRelease('128n', now);

        setTimeout(() => { click.dispose(); tone.dispose(); noise.dispose(); hp.dispose(); }, 600);
        break;
      }
      case 6: { // COWBELL — dual-tone metallic
        const tone1 = new Tone.Synth({
          oscillator: { type: 'square' },
          envelope: { attack: 0.001, decay: 0.2, sustain: 0.02, release: 0.15 },
        }).connect(destination);
        tone1.volume.value = -8;
        tone1.triggerAttackRelease('A5', '16n', now);

        const tone2 = new Tone.Synth({
          oscillator: { type: 'square' },
          envelope: { attack: 0.001, decay: 0.18, sustain: 0.01, release: 0.12 },
        }).connect(destination);
        tone2.volume.value = -10;
        tone2.triggerAttackRelease('D#6', '16n', now);

        const metal = new Tone.MetalSynth({
          envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 },
          harmonicity: 2.8,
          modulationIndex: 12,
          resonance: 3000,
          octaves: 0.4,
        }).connect(destination);
        metal.volume.value = -14;
        metal.triggerAttackRelease(600, '32n', now);

        setTimeout(() => { tone1.dispose(); tone2.dispose(); metal.dispose(); }, 1200);
        break;
      }
      case 7: { // CLAVE — sharp wooden click
        const click1 = new Tone.Synth({
          oscillator: { type: 'sine' },
          envelope: { attack: 0.0005, decay: 0.04, sustain: 0, release: 0.03 },
        }).connect(destination);
        click1.volume.value = -4;
        click1.triggerAttackRelease('D#5', '64n', now);

        const click2 = new Tone.Synth({
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.0005, decay: 0.025, sustain: 0, release: 0.02 },
        }).connect(destination);
        click2.volume.value = -8;
        click2.triggerAttackRelease('G5', '64n', now);

        const noise = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: { attack: 0.0005, decay: 0.003, sustain: 0, release: 0.002 },
        });
        const bp = new Tone.Filter(4000, 'bandpass', -24).connect(destination);
        noise.connect(bp);
        noise.volume.value = -14;
        noise.triggerAttackRelease('128n', now);

        setTimeout(() => { click1.dispose(); click2.dispose(); noise.dispose(); bp.dispose(); }, 600);
        break;
      }
    }
  } catch { /* ignore */ }
}

export function DrumMachine({ bpm, isPlaying, color = '#ffb000', glowColor: _glowColor, dangerColor = '#ff4444', bgColor = '#0c0c14', muted = false }: DrumMachineProps) {
  const tc = color;
  const rgb = hexToRgb(tc);
  const [pattern, setPattern] = useState<boolean[][]>(() =>
    Array.from({ length: 8 }, () => Array(STEPS).fill(false))
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [activePads, setActivePads] = useState<Set<number>>(new Set());
  const [isRecording, setIsRecording] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [recordedEvents, setRecordedEvents] = useState<RecordedEvent[]>([]);
  const [loopLength, setLoopLength] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const drumGainRef = useRef<Tone.Gain | null>(null);
  const compressorRef = useRef<Tone.Compressor | null>(null);
  const initRef = useRef(false);
  const recordStartRef = useRef(0);
  const loopIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loopTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (initRef.current) return;
    // Drum bus: Gain → Compressor → Destination
    const compressor = new Tone.Compressor({ threshold: -12, ratio: 4, attack: 0.003, release: 0.1 }).toDestination();
    const gain = new Tone.Gain(0.7).connect(compressor);
    drumGainRef.current = gain;
    compressorRef.current = compressor;
    initRef.current = true;
    return () => { gain.dispose(); compressor.dispose(); initRef.current = false; };
  }, []);

  // Mute control — ramp gain to 0 when muted (e.g. by solo on another channel)
  useEffect(() => {
    if (!drumGainRef.current) return;
    drumGainRef.current.gain.rampTo(muted ? 0 : 0.7, 0.02);
  }, [muted]);

  useEffect(() => {
    if (!isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setCurrentStep(0);
      return;
    }
    const interval = (60000 / bpm) / 4;
    intervalRef.current = setInterval(() => {
      setCurrentStep(prev => (prev + 1) % STEPS);
    }, interval);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, bpm]);

  useEffect(() => {
    if (!isPlaying || !drumGainRef.current) return;
    const startAudio = async () => { if (Tone.getContext().state !== 'running') await Tone.start(); };
    startAudio();
    const triggered = new Set<number>();
    pattern.forEach((steps, drumIdx) => {
      if (steps[currentStep]) {
        triggered.add(drumIdx);
        triggerDrumSound(drumIdx, drumGainRef.current!);
      }
    });
    setActivePads(triggered);
  }, [currentStep, isPlaying, pattern]);

  useEffect(() => {
    if (!isLooping || recordedEvents.length === 0 || loopLength === 0 || !drumGainRef.current) {
      if (loopIntervalRef.current) clearInterval(loopIntervalRef.current);
      loopTimeoutsRef.current.forEach(t => clearTimeout(t));
      loopTimeoutsRef.current = [];
      return;
    }
    const scheduleLoop = () => {
      loopTimeoutsRef.current.forEach(t => clearTimeout(t));
      loopTimeoutsRef.current = [];
      recordedEvents.forEach(evt => {
        const t = setTimeout(() => {
          if (drumGainRef.current) {
            triggerDrumSound(evt.drumIdx, drumGainRef.current);
            setActivePads(prev => { const n = new Set(prev); n.add(evt.drumIdx); return n; });
            setTimeout(() => setActivePads(prev => { const n = new Set(prev); n.delete(evt.drumIdx); return n; }), 100);
          }
        }, evt.time);
        loopTimeoutsRef.current.push(t);
      });
    };
    scheduleLoop();
    loopIntervalRef.current = setInterval(scheduleLoop, loopLength);
    return () => {
      if (loopIntervalRef.current) clearInterval(loopIntervalRef.current);
      loopTimeoutsRef.current.forEach(t => clearTimeout(t));
      loopTimeoutsRef.current = [];
    };
  }, [isLooping, recordedEvents, loopLength]);

  const toggleCell = (drum: number, step: number) => {
    setPattern(prev => {
      const next = prev.map(r => [...r]);
      next[drum][step] = !next[drum][step];
      return next;
    });
  };

  const triggerPad = useCallback(async (drumIdx: number) => {
    if (Tone.getContext().state !== 'running') await Tone.start();
    if (!drumGainRef.current) return;
    setActivePads(prev => new Set([...prev, drumIdx]));
    setTimeout(() => setActivePads(prev => { const n = new Set(prev); n.delete(drumIdx); return n; }), 150);
    triggerDrumSound(drumIdx, drumGainRef.current);
    if (isRecording) {
      const time = Date.now() - recordStartRef.current;
      setRecordedEvents(prev => [...prev, { drumIdx, time }]);
    }
  }, [isRecording]);

  const startRecording = () => { setRecordedEvents([]); recordStartRef.current = Date.now(); setIsRecording(true); setIsLooping(false); };
  const stopRecording = () => { const length = Date.now() - recordStartRef.current; setLoopLength(length); setIsRecording(false); };
  const toggleLoop = () => { if (isLooping) setIsLooping(false); else if (recordedEvents.length > 0) setIsLooping(true); };
  const clearRecording = () => { setIsLooping(false); setIsRecording(false); setRecordedEvents([]); setLoopLength(0); };
  const clearPattern = () => setPattern(Array.from({ length: 8 }, () => Array(STEPS).fill(false)));
  const randomPattern = () => {
    setPattern(Array.from({ length: 8 }, (_, i) =>
      Array.from({ length: STEPS }, () => {
        if (i === 0) return Math.random() < 0.3;
        if (i === 1) return Math.random() < 0.2;
        if (i === 2) return Math.random() < 0.4;
        return Math.random() < 0.1;
      })
    ));
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const idx = DRUM_SHORTCUTS.indexOf(e.key);
      if (idx >= 0) triggerPad(idx);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [triggerPad]);

  return (
    <div className="flex flex-col h-full" style={{ gap: 8 }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <span style={{ fontSize: '10px', letterSpacing: '0.15em', color: tc, textShadow: `0 0 8px rgba(${rgb.r},${rgb.g},${rgb.b},0.3)` }}>
            DRUM MACHINE
          </span>
          <div className="flex gap-1">
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{
                width: 4, height: 4,
                background: isPlaying && currentStep % 4 === i ? tc : `rgba(${rgb.r},${rgb.g},${rgb.b},0.1)`,
                boxShadow: isPlaying && currentStep % 4 === i ? `0 0 6px ${tc}` : 'none',
                borderRadius: '50%',
              }} />
            ))}
          </div>
        </div>
        <div className="flex gap-1.5 items-center">
          <button onClick={isRecording ? stopRecording : startRecording} className="transition-all" style={{
            fontSize: '7px', color: isRecording ? bgColor : dangerColor,
            border: `1px solid ${isRecording ? dangerColor : `${dangerColor}4d`}`,
            padding: '2px 6px', background: isRecording ? dangerColor : `${dangerColor}0f`,
            boxShadow: isRecording ? `0 0 8px ${dangerColor}66` : 'none', letterSpacing: '0.08em', borderRadius: 3,
          }}>
            {isRecording ? '■ STOP' : '● REC'}
          </button>
          <button onClick={toggleLoop} className="transition-all" style={{
            fontSize: '7px', color: isLooping ? bgColor : tc,
            border: `1px solid ${isLooping ? tc : `rgba(${rgb.r},${rgb.g},${rgb.b},0.2)`}`,
            padding: '2px 6px', background: isLooping ? tc : `rgba(${rgb.r},${rgb.g},${rgb.b},0.04)`,
            boxShadow: isLooping ? `0 0 6px rgba(${rgb.r},${rgb.g},${rgb.b},0.3)` : 'none',
            opacity: recordedEvents.length === 0 ? 0.3 : 1, letterSpacing: '0.08em', borderRadius: 3,
          }}>
            ⟳ LOOP
          </button>
          {recordedEvents.length > 0 && (
            <button onClick={clearRecording} style={{
              fontSize: '7px', color: tc, opacity: 0.5,
              border: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`,
              padding: '2px 6px', background: `rgba(${rgb.r},${rgb.g},${rgb.b},0.04)`,
              letterSpacing: '0.08em', borderRadius: 3,
            }}>
              ✕
            </button>
          )}
          <div style={{ width: 1, height: 12, background: `rgba(${rgb.r},${rgb.g},${rgb.b},0.1)` }} />
          <button onClick={randomPattern} style={{ fontSize: '7px', color: tc, border: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.2)`, padding: '2px 6px', background: `rgba(${rgb.r},${rgb.g},${rgb.b},0.04)`, borderRadius: 3, letterSpacing: '0.08em' }}>
            RANDOM
          </button>
          <button onClick={clearPattern} style={{ fontSize: '7px', color: tc, border: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.2)`, padding: '2px 6px', background: `rgba(${rgb.r},${rgb.g},${rgb.b},0.04)`, borderRadius: 3, letterSpacing: '0.08em' }}>
            CLEAR
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex gap-3 flex-1 min-h-0">
        {/* MPC Pads */}
        <div className="flex flex-col gap-1 flex-shrink-0">
          <div style={{ fontSize: '6px', opacity: 0.3, letterSpacing: '0.12em', color: tc }}>PADS</div>
          <div className="grid grid-cols-4 gap-1.5" style={{ width: 'fit-content' }}>
            {DRUM_NAMES.map((name, idx) => {
              const isActive = activePads.has(idx);
              return (
                <button
                  key={idx}
                  onClick={() => triggerPad(idx)}
                  className="flex flex-col items-center justify-center transition-all duration-75 active:scale-95"
                  style={{
                    width: 52, height: 52,
                    background: isActive
                      ? `linear-gradient(135deg, ${tc}, ${tc}88)`
                      : `linear-gradient(180deg, rgba(${rgb.r},${rgb.g},${rgb.b},0.06) 0%, rgba(${rgb.r},${rgb.g},${rgb.b},0.02) 100%)`,
                    border: `1px solid ${isActive ? tc : `rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`}`,
                    boxShadow: isActive ? `0 0 14px ${tc}55, inset 0 0 8px ${tc}22` : `inset 0 1px 0 rgba(${rgb.r},${rgb.g},${rgb.b},0.04)`,
                    borderRadius: 4,
                    color: isActive ? bgColor : tc,
                  }}
                >
                  <span style={{ fontSize: '7px', letterSpacing: '0.05em' }}>{name}</span>
                  <span style={{ fontSize: '6px', opacity: 0.2, marginTop: 2 }}>{DRUM_SHORTCUTS[idx]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step Sequencer */}
        <div className="flex-1 flex flex-col min-w-0" style={{ gap: 2 }}>
          <div className="flex items-center justify-between">
            <div style={{ fontSize: '6px', opacity: 0.3, letterSpacing: '0.12em', color: tc }}>STEP SEQUENCER</div>
            {(isRecording || (isLooping && !isRecording)) && (
              <div className="flex items-center gap-1" style={{ fontSize: '6px' }}>
                {isRecording ? (
                  <>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: dangerColor, boxShadow: `0 0 6px ${dangerColor}`, animation: 'pulse 1s infinite' }} />
                    <span style={{ color: dangerColor, letterSpacing: '0.1em' }}>REC</span>
                  </>
                ) : (
                  <span style={{ color: tc, opacity: 0.4, letterSpacing: '0.1em' }}>⟳ LOOP {recordedEvents.length}ev</span>
                )}
              </div>
            )}
          </div>
          {/* Step numbers */}
          <div className="flex gap-px" style={{ paddingLeft: 36 }}>
            {Array.from({ length: STEPS }, (_, s) => (
              <div
                key={s}
                className="flex-1 text-center"
                style={{
                  fontSize: '5px',
                  color: currentStep === s && isPlaying ? tc : `rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`,
                  textShadow: currentStep === s && isPlaying ? `0 0 4px ${tc}` : 'none',
                }}
              >
                {s + 1}
              </div>
            ))}
          </div>
          {/* Grid */}
          <div className="flex flex-col gap-px flex-1">
            {DRUM_NAMES.map((name, drumIdx) => (
              <div key={drumIdx} className="flex items-center gap-0">
                <div style={{ width: 36, fontSize: '5px', color: tc, opacity: 0.35, letterSpacing: '0.05em', flexShrink: 0 }}>
                  {name}
                </div>
                <div className="flex gap-px flex-1">
                  {Array.from({ length: STEPS }, (_, s) => {
                    const on = pattern[drumIdx]?.[s];
                    const isCurrent = currentStep === s && isPlaying;
                    return (
                      <button
                        key={s}
                        onClick={() => toggleCell(drumIdx, s)}
                        className="flex-1 transition-all duration-50"
                        style={{
                          height: 16,
                          background: on
                            ? (isCurrent ? '#ffffff' : tc)
                            : (isCurrent ? `rgba(${rgb.r},${rgb.g},${rgb.b},0.12)` : s % 4 === 0 ? `rgba(${rgb.r},${rgb.g},${rgb.b},0.04)` : `rgba(${rgb.r},${rgb.g},${rgb.b},0.015)`),
                          border: `1px solid ${on ? tc + '44' : `rgba(${rgb.r},${rgb.g},${rgb.b},0.06)`}`,
                          boxShadow: on && isCurrent ? `0 0 6px ${tc}` : 'none',
                          borderRadius: 1,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}