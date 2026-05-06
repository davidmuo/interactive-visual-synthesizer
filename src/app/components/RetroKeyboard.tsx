import { useState, useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) };
}

const WHITE_KEYS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const BLACK_KEYS: (string | null)[] = ['C#', 'D#', null, 'F#', 'G#', 'A#', null];

const KEY_MAP_WHITE: Record<string, string> = {
  z: 'C', x: 'D', c: 'E', v: 'F', b: 'G', n: 'A', m: 'B',
  ',': 'C+',
};
const KEY_MAP_BLACK: Record<string, string> = {
  s: 'C#', d: 'D#', g: 'F#', h: 'G#', j: 'A#',
};

const WHITE_KEY_LABELS = ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ','];
const BLACK_KEY_LABELS: Record<string, string> = { 'C#': 'S', 'D#': 'D', 'F#': 'G', 'G#': 'H', 'A#': 'J' };

// ── Sound presets with realistic multi-layer synthesis ──
const SOUNDS = [
  { name: 'PIANO', idx: 0 },
  { name: 'ORGAN', idx: 1 },
  { name: 'LEAD', idx: 2 },
  { name: 'BASS', idx: 3 },
] as const;

interface RecordedNote { note: string; time: number; }

interface RetroKeyboardProps {
  octave?: number;
  color?: string;
  glowColor?: string;
  dangerColor?: string;
  bgColor?: string;
  muted?: boolean;
}

// Build effects chains per sound type
function createSoundEngine(destination: Tone.ToneAudioNode) {
  // Shared effects
  const reverb = new Tone.Reverb({ decay: 2.2, wet: 0.2, preDelay: 0.01 }).connect(destination);
  const compressor = new Tone.Compressor({ threshold: -18, ratio: 3, attack: 0.01, release: 0.15 }).connect(reverb);
  const masterGain = new Tone.Gain(0.35).connect(compressor);

  // ── PIANO: PolySynth with hammer-like attack + body resonance ──
  const pianoReverb = new Tone.Reverb({ decay: 3, wet: 0.25 }).connect(masterGain);
  const pianoChorus = new Tone.Chorus({ frequency: 0.3, delayTime: 3.5, depth: 0.15, wet: 0.12 }).connect(pianoReverb);
  pianoChorus.start();
  const piano = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 8,
    voice: Tone.Synth,
    options: {
      oscillator: { type: 'fmtriangle', modulationType: 'sine', modulationIndex: 1.2, harmonicity: 2 } as any,
      envelope: { attack: 0.005, decay: 1.2, sustain: 0.15, release: 1.8 },
      volume: -2,
    },
  }).connect(pianoChorus);

  // ── ORGAN: Multiple harmonics simulating drawbars ──
  const organChorus = new Tone.Chorus({ frequency: 4, delayTime: 2, depth: 0.5, wet: 0.35 }).connect(masterGain);
  organChorus.start();
  const organVibrato = new Tone.Vibrato({ frequency: 5.5, depth: 0.08, wet: 0.6 }).connect(organChorus);
  const organ = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 8,
    voice: Tone.Synth,
    options: {
      oscillator: { type: 'sine', partialCount: 8, partials: [1, 0.8, 0.6, 0, 0.3, 0, 0.15, 0.05] } as any,
      envelope: { attack: 0.02, decay: 0.1, sustain: 0.95, release: 0.15 },
      volume: -4,
    },
  }).connect(organVibrato);

  // ── LEAD: FM synthesis with delay and vibrato ──
  const leadDelay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.25, wet: 0.2 }).connect(masterGain);
  const leadFilter = new Tone.Filter(4500, 'lowpass', -12).connect(leadDelay);
  const lead = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 6,
    voice: Tone.Synth,
    options: {
      oscillator: { type: 'fmsawtooth', modulationType: 'sine', modulationIndex: 3, harmonicity: 1.5 } as any,
      envelope: { attack: 0.06, decay: 0.4, sustain: 0.6, release: 0.5 },
      volume: -4,
    },
  }).connect(leadFilter);

  // ── BASS: Deep sub + harmonics with saturation ──
  const bassFilter = new Tone.Filter(800, 'lowpass', -24).connect(masterGain);
  const bassCompressor = new Tone.Compressor({ threshold: -20, ratio: 6, attack: 0.005, release: 0.1 }).connect(bassFilter);
  const bass = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 4,
    voice: Tone.Synth,
    options: {
      oscillator: { type: 'fmsine', modulationType: 'square', modulationIndex: 0.8, harmonicity: 0.5 } as any,
      envelope: { attack: 0.01, decay: 0.5, sustain: 0.4, release: 0.3 },
      volume: 0,
    },
  }).connect(bassCompressor);

  const synths = [piano, organ, lead, bass];
  const allNodes = [reverb, compressor, masterGain, pianoReverb, pianoChorus, organChorus, organVibrato, leadDelay, leadFilter, bassFilter, bassCompressor, ...synths];

  return {
    synths,
    masterGain,
    play(soundIdx: number, note: string, duration: string = '8n') {
      try { synths[soundIdx]?.triggerAttackRelease(note, duration); } catch { }
    },
    dispose() {
      allNodes.forEach(n => { try { n.dispose(); } catch { } });
    },
  };
}

export function RetroKeyboard({ octave: initialOctave = 4, color = '#ffb000', glowColor, dangerColor = '#ff4444', bgColor = '#0c0c14', muted = false }: RetroKeyboardProps) {
  const tc = color;
  const rgb = hexToRgb(tc);
  const [octave, setOctave] = useState(initialOctave);
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const [selectedSound, setSelectedSound] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [recordedNotes, setRecordedNotes] = useState<RecordedNote[]>([]);
  const [loopLength, setLoopLength] = useState(0);
  const engineRef = useRef<ReturnType<typeof createSoundEngine> | null>(null);
  const initRef = useRef(false);
  const recordStartRef = useRef(0);
  const loopIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loopTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (initRef.current) return;
    const engine = createSoundEngine(Tone.getDestination());
    engineRef.current = engine;
    initRef.current = true;
    return () => { engine.dispose(); initRef.current = false; };
  }, []);

  // Mute control — ramp gain to 0 when muted (e.g. by solo on another channel)
  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.masterGain.gain.rampTo(muted ? 0 : 0.35, 0.02);
  }, [muted]);

  useEffect(() => {
    if (!isLooping || recordedNotes.length === 0 || loopLength === 0) {
      if (loopIntervalRef.current) clearInterval(loopIntervalRef.current);
      loopTimeoutsRef.current.forEach(t => clearTimeout(t));
      loopTimeoutsRef.current = [];
      return;
    }
    const scheduleLoop = () => {
      loopTimeoutsRef.current.forEach(t => clearTimeout(t));
      loopTimeoutsRef.current = [];
      recordedNotes.forEach(evt => {
        const t = setTimeout(() => {
          engineRef.current?.play(selectedSound, evt.note);
          setPressedKeys(prev => new Set([...prev, evt.note]));
          setTimeout(() => setPressedKeys(prev => { const n = new Set(prev); n.delete(evt.note); return n; }), 150);
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
  }, [isLooping, recordedNotes, loopLength, selectedSound]);

  const playNote = useCallback(async (noteName: string) => {
    if (Tone.getContext().state !== 'running') await Tone.start();
    setPressedKeys(prev => new Set([...prev, noteName]));
    // Use longer duration for organ sustain, shorter for bass punch
    const durations = ['8n', '4n', '8n', '16n'];
    engineRef.current?.play(selectedSound, noteName, durations[selectedSound]);
    setTimeout(() => { setPressedKeys(prev => { const n = new Set(prev); n.delete(noteName); return n; }); }, 200);
    if (isRecording) {
      const time = Date.now() - recordStartRef.current;
      setRecordedNotes(prev => [...prev, { note: noteName, time }]);
    }
  }, [isRecording, selectedSound]);

  const startRecording = () => { setRecordedNotes([]); recordStartRef.current = Date.now(); setIsRecording(true); setIsLooping(false); };
  const stopRecording = () => { const length = Date.now() - recordStartRef.current; setLoopLength(length); setIsRecording(false); };
  const toggleLoop = () => { if (isLooping) setIsLooping(false); else if (recordedNotes.length > 0) setIsLooping(true); };
  const clearRecording = () => { setIsLooping(false); setIsRecording(false); setRecordedNotes([]); setLoopLength(0); };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      if (key === 'arrowup') { setOctave(prev => Math.min(7, prev + 1)); return; }
      if (key === 'arrowdown') { setOctave(prev => Math.max(1, prev - 1)); return; }
      if (key === 'arrowleft') { setSelectedSound(prev => (prev - 1 + SOUNDS.length) % SOUNDS.length); return; }
      if (key === 'arrowright') { setSelectedSound(prev => (prev + 1) % SOUNDS.length); return; }
      const whiteNote = KEY_MAP_WHITE[key];
      if (whiteNote) {
        const oct = whiteNote === 'C+' ? octave + 1 : octave;
        const note = whiteNote === 'C+' ? 'C' : whiteNote;
        playNote(`${note}${oct}`);
        return;
      }
      const blackNote = KEY_MAP_BLACK[key];
      if (blackNote) playNote(`${blackNote}${octave}`);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [octave, playNote]);

  const isNotePressed = (note: string, oct: number) => pressedKeys.has(`${note}${oct}`);

  const blackKeyColor = `rgba(${Math.min(255, rgb.r + 30)}, ${Math.min(255, Math.round(rgb.g * 0.5))}, ${Math.min(255, rgb.b + 60)}, 0.7)`;
  const blackKeyPressedColor = `rgba(${Math.min(255, rgb.r + 40)}, ${Math.min(255, Math.round(rgb.g * 0.6))}, ${Math.min(255, rgb.b + 80)}, 1)`;

  return (
    <div className="flex flex-col h-full" style={{ gap: 6 }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: '10px', letterSpacing: '0.15em', color: tc, textShadow: `0 0 8px rgba(${rgb.r},${rgb.g},${rgb.b},0.3)` }}>
            KEYBOARD
          </span>
          <div className="flex gap-0.5">
            {SOUNDS.map((s, i) => (
              <button
                key={s.name}
                onClick={() => setSelectedSound(i)}
                className="transition-all"
                style={{
                  fontSize: '6px', padding: '2px 6px',
                  color: selectedSound === i ? bgColor : tc,
                  background: selectedSound === i ? tc : `rgba(${rgb.r},${rgb.g},${rgb.b},0.04)`,
                  border: `1px solid ${selectedSound === i ? tc : `rgba(${rgb.r},${rgb.g},${rgb.b},0.2)`}`,
                  letterSpacing: '0.08em', borderRadius: 3,
                }}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
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
            opacity: recordedNotes.length === 0 ? 0.3 : 1, letterSpacing: '0.08em', borderRadius: 3,
          }}>
            ⟳ LOOP
          </button>
          {recordedNotes.length > 0 && (
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
          <span style={{ fontSize: '6px', opacity: 0.3, letterSpacing: '0.1em', color: tc }}>OCT</span>
          <button onClick={() => setOctave(Math.max(1, octave - 1))} className="opacity-40 hover:opacity-80 transition-opacity" style={{ fontSize: '10px', color: tc, padding: '0 2px' }}>-</button>
          <span style={{ fontSize: '10px', color: tc, textShadow: `0 0 6px rgba(${rgb.r},${rgb.g},${rgb.b},0.3)`, minWidth: 12, textAlign: 'center' as const }}>{octave}</span>
          <button onClick={() => setOctave(Math.min(7, octave + 1))} className="opacity-40 hover:opacity-80 transition-opacity" style={{ fontSize: '10px', color: tc, padding: '0 2px' }}>+</button>
        </div>
      </div>

      {/* Piano keys — takes remaining space */}
      <div className="relative flex-1 min-h-0" style={{ userSelect: 'none', minHeight: 70 }}>
        <div className="flex h-full gap-px">
          {[...WHITE_KEYS, 'C+'].map((note, i) => {
            const actualNote = note === 'C+' ? 'C' : note;
            const oct = note === 'C+' ? octave + 1 : octave;
            const pressed = isNotePressed(actualNote, oct);
            return (
              <button
                key={`white-${i}`}
                onMouseDown={() => playNote(`${actualNote}${oct}`)}
                className="flex-1 flex flex-col items-center justify-end relative transition-all duration-50"
                style={{
                  background: pressed
                    ? `linear-gradient(180deg, ${tc} 0%, ${tc}aa 100%)`
                    : `linear-gradient(180deg, rgba(${rgb.r},${rgb.g},${rgb.b},0.12) 0%, rgba(${rgb.r},${rgb.g},${rgb.b},0.03) 100%)`,
                  border: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.2)`,
                  borderRadius: '0 0 3px 3px',
                  boxShadow: pressed
                    ? `0 0 12px rgba(${rgb.r},${rgb.g},${rgb.b},0.5), inset 0 -2px 4px rgba(0,0,0,0.2)`
                    : 'inset 0 -2px 4px rgba(0,0,0,0.1)',
                  transform: pressed ? 'translateY(1px)' : 'none',
                }}
              >
                <span style={{ fontSize: '7px', color: pressed ? bgColor : tc, opacity: pressed ? 1 : 0.35, marginBottom: 3 }}>
                  {WHITE_KEY_LABELS[i]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="absolute top-0 left-0 right-0 flex" style={{ height: '58%', pointerEvents: 'none' }}>
          {WHITE_KEYS.map((_, i) => {
            const blackNote = BLACK_KEYS[i];
            if (!blackNote) return <div key={`spacer-${i}`} className="flex-1" />;
            const pressed = isNotePressed(blackNote, octave);
            return (
              <div key={`black-container-${i}`} className="flex-1 flex justify-end" style={{ pointerEvents: 'none' }}>
                <button
                  onMouseDown={() => playNote(`${blackNote}${octave}`)}
                  className="flex flex-col items-center justify-end transition-all duration-50"
                  style={{
                    width: '65%', height: '100%', pointerEvents: 'auto',
                    background: pressed
                      ? `linear-gradient(180deg, ${blackKeyPressedColor} 0%, ${blackKeyColor} 100%)`
                      : `linear-gradient(180deg, ${blackKeyColor} 0%, rgba(${Math.round(rgb.r * 0.3)},${Math.round(rgb.g * 0.2)},${Math.round(rgb.b * 0.4)},0.8) 100%)`,
                    border: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.3)`,
                    borderRadius: '0 0 2px 2px',
                    boxShadow: pressed ? `0 0 8px rgba(${rgb.r},${rgb.g},${rgb.b},0.4)` : '0 2px 4px rgba(0,0,0,0.3)',
                    transform: pressed ? 'translateY(1px)' : 'none',
                    zIndex: 10, position: 'relative', marginRight: '-32.5%',
                  }}
                >
                  <span style={{ fontSize: '6px', color: pressed ? '#ffffff' : `rgba(${rgb.r},${rgb.g},${rgb.b},0.5)`, marginBottom: 2 }}>
                    {BLACK_KEY_LABELS[blackNote]}
                  </span>
                </button>
              </div>
            );
          })}
          <div className="flex-1" />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between flex-shrink-0" style={{ fontSize: '6px', opacity: 0.2, letterSpacing: '0.08em', color: tc }}>
        <span>Z-M white · S D G H J black · arrows: oct/sound</span>
        {(isRecording || isLooping) && (
          <span style={{ opacity: 1, color: isRecording ? dangerColor : tc }}>
            {isRecording ? '● REC' : `⟳ ${recordedNotes.length} notes`}
          </span>
        )}
      </div>
    </div>
  );
}