import { useState, useEffect, useRef, useCallback } from "react";

const PRESETS = [
  { name: "Classic Dalek", freq: 30, mix: 1.0, lfoRate: 0, lfoDepth: 0, drive: 1.0, waveform: "sine" },
  { name: "Modern Dalek",  freq: 50, mix: 1.0, lfoRate: 1.5, lfoDepth: 5, drive: 1.2, waveform: "sine" },
  { name: "Cyborg Blend",  freq: 35, mix: 0.5, lfoRate: 0, lfoDepth: 0, drive: 1.0, waveform: "sine" },
  { name: "Gritty Analogue", freq: 30, mix: 1.0, lfoRate: 0.8, lfoDepth: 3, drive: 2.5, waveform: "sine" },
  { name: "Alien Radio",   freq: 80, mix: 0.85, lfoRate: 2.0, lfoDepth: 10, drive: 1.5, waveform: "triangle" },
  { name: "Wobble Drone",  freq: 20, mix: 1.0, lfoRate: 3.0, lfoDepth: 15, drive: 1.0, waveform: "sine" },
];

const WAVEFORMS = ["sine", "triangle", "square", "sawtooth"];

function OscilloscopeCanvas({ analyser, active }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // Grid lines
      ctx.strokeStyle = "rgba(255,165,0,0.08)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(0, (H / 4) * i);
        ctx.lineTo(W, (H / 4) * i);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo((W / 4) * i, 0);
        ctx.lineTo((W / 4) * i, H);
        ctx.stroke();
      }

      // Centre line
      ctx.strokeStyle = "rgba(255,165,0,0.15)";
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();

      if (!analyser || !active) {
        // Flat idle line
        ctx.strokeStyle = "rgba(255,140,0,0.4)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, H / 2);
        ctx.lineTo(W, H / 2);
        ctx.stroke();
        return;
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Float32Array(bufferLength);
      analyser.getFloatTimeDomainData(dataArray);

      ctx.strokeStyle = "#ff8c00";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "#ff6600";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      const sliceWidth = W / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i];
        const y = ((v + 1) / 2) * H;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    draw();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [analyser, active]);

  return (
    <canvas
      ref={canvasRef}
      width={520}
      height={120}
      style={{ width: "100%", height: "120px", display: "block" }}
    />
  );
}

function Knob({ label, value, min, max, step = 0.1, unit = "", onChange, decimals = 1 }) {
  const pct = (value - min) / (max - min);
  const angle = -140 + pct * 280;
  const r = 20;
  const cx = 24, cy = 24;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const arcX = (deg) => cx + r * Math.cos(toRad(deg - 90));
  const arcY = (deg) => cy + r * Math.sin(toRad(deg - 90));
  const startAngle = -140;
  const endAngle = angle;
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const arcPath = `M ${arcX(startAngle)} ${arcY(startAngle)} A ${r} ${r} 0 ${largeArc} 1 ${arcX(endAngle)} ${arcY(endAngle)}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ position: "relative", width: 48, height: 48 }}>
        <svg width="48" height="48" viewBox="0 0 48 48">
          {/* Track */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,140,0,0.12)" strokeWidth="3"
            strokeDasharray={`${2 * Math.PI * r * 280 / 360} 9999`}
            strokeDashoffset={-2 * Math.PI * r * (-140 + 360) / 360 + 2 * Math.PI * r}
            transform={`rotate(-140 ${cx} ${cy})`} />
          {/* Active arc */}
          {pct > 0 && (
            <path d={arcPath} fill="none" stroke="#ff8c00" strokeWidth="3" strokeLinecap="round" />
          )}
          {/* Knob body */}
          <circle cx={cx} cy={cy} r={14} fill="#1a1200" stroke="#ff6600" strokeWidth="1" />
          {/* Indicator dot */}
          <circle
            cx={cx + 10 * Math.cos(toRad(angle - 90))}
            cy={cy + 10 * Math.sin(toRad(angle - 90))}
            r={2.5} fill="#ffaa00" />
        </svg>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{
            position: "absolute", inset: 0, opacity: 0, cursor: "pointer",
            width: "100%", height: "100%", margin: 0,
          }}
        />
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 13, fontFamily: "'Courier New', monospace", color: "#ff8c00", fontWeight: 700, letterSpacing: 1 }}>
          {value.toFixed(decimals)}{unit}
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,140,0,0.55)", textTransform: "uppercase", letterSpacing: 1.5, marginTop: 2 }}>
          {label}
        </div>
      </div>
    </div>
  );
}

export default function RingVoiceModulator() {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState("dormant");
  const [preset, setPreset] = useState(0);
  const [params, setParams] = useState(PRESETS[0]);
  const [analyserNode, setAnalyserNode] = useState(null);
  const [error, setError] = useState(null);
  const [vu, setVu] = useState(0);

  const audioRef = useRef(null); // { ctx, source, carrier, lfo, lfoGain, gainNode, analyser, worklet }
  const vuRafRef = useRef(null);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      try {
        const { ctx, source, carrier, lfo } = audioRef.current;
        source?.disconnect();
        carrier?.stop();
        lfo?.stop();
        ctx?.close();
      } catch (e) { /* ignore */ }
      audioRef.current = null;
    }
    setAnalyserNode(null);
    setActive(false);
    setStatus("dormant");
    setVu(0);
    if (vuRafRef.current) cancelAnimationFrame(vuRafRef.current);
  }, []);

  const buildGraph = useCallback(async (p) => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = ctx.createMediaStreamSource(stream);

    // Pre-bandpass filter (100Hz – 8kHz)
    const bpFilter = ctx.createBiquadFilter();
    bpFilter.type = "bandpass";
    bpFilter.frequency.value = 2000;
    bpFilter.Q.value = 0.4;

    // Saturation (waveshaper)
    const waveshaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    const drive = p.drive;
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 256 - 1;
      curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }
    waveshaper.curve = curve;
    waveshaper.oversample = "4x";

    // Ring modulator: carrier → gain.gain of a gain node
    const ringGain = ctx.createGain();
    ringGain.gain.value = 0;

    const carrier = ctx.createOscillator();
    carrier.type = p.waveform;
    carrier.frequency.value = p.freq;
    carrier.start();

    // LFO on carrier frequency
    let lfo = null;
    if (p.lfoRate > 0) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = p.lfoRate;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = p.lfoDepth;
      lfo.connect(lfoGain);
      lfoGain.connect(carrier.frequency);
      lfo.start();
    }

    // Carrier drives the gain of ringGain (amplitude modulation)
    carrier.connect(ringGain.gain);

    // Wet/dry mix
    const dryGain = ctx.createGain();
    dryGain.gain.value = 1 - p.mix;
    const wetGain = ctx.createGain();
    wetGain.gain.value = p.mix;

    // Analyser
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;

    // Output gain / normaliser
    const outGain = ctx.createGain();
    outGain.gain.value = 0.9;

    // Graph:
    // source → bpFilter → waveshaper → ringGain (wet) → wetGain → analyser → outGain → dest
    //                                → dryGain →
    source.connect(bpFilter);
    bpFilter.connect(waveshaper);
    waveshaper.connect(ringGain);
    waveshaper.connect(dryGain);
    ringGain.connect(wetGain);
    dryGain.connect(analyser);
    wetGain.connect(analyser);
    analyser.connect(outGain);
    outGain.connect(ctx.destination);

    audioRef.current = { ctx, source, carrier, lfo, ringGain, bpFilter, dryGain, wetGain, outGain, analyser };
    setAnalyserNode(analyser);
    return analyser;
  }, []);

  const startAudio = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    try {
      await buildGraph(params);
      setActive(true);
      setStatus("active");

      // VU meter
      const tick = () => {
        if (!audioRef.current) return;
        const { analyser } = audioRef.current;
        const data = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatTimeDomainData(data);
        let rms = 0;
        for (let i = 0; i < data.length; i++) rms += data[i] * data[i];
        rms = Math.sqrt(rms / data.length);
        setVu(Math.min(1, rms * 6));
        vuRafRef.current = requestAnimationFrame(tick);
      };
      vuRafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      setError(e.message || "Microphone access denied");
      setStatus("dormant");
    }
  }, [params, buildGraph]);

  // Live param updates
  useEffect(() => {
    if (!audioRef.current || !active) return;
    const { carrier, dryGain, wetGain, waveshaper } = audioRef.current;
    carrier.frequency.value = params.freq;
    carrier.type = params.waveform;
    dryGain.gain.value = 1 - params.mix;
    wetGain.gain.value = params.mix;
    // Update saturation curve
    const curve = new Float32Array(256);
    const drive = params.drive;
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 256 - 1;
      curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }
    waveshaper.curve = curve;
  }, [params, active]);

  const applyPreset = (idx) => {
    setPreset(idx);
    setParams(PRESETS[idx]);
  };

  const setParam = (key) => (val) => setParams((p) => ({ ...p, [key]: val }));

  // VU bar segments
  const vuSegments = 16;
  const litSegments = Math.round(vu * vuSegments);

  return (
    <div style={{
      background: "#0d0900",
      minHeight: "100vh",
      fontFamily: "'Courier New', monospace",
      color: "#ff8c00",
      padding: "2rem 1rem",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "2rem", maxWidth: 600 }}>
        <div style={{ fontSize: 10, letterSpacing: 6, color: "rgba(255,140,0,0.4)", marginBottom: 6 }}>
          BBC RADIOPHONIC WORKSHOP ✦ 1963
        </div>
        <h1 style={{
          fontSize: 28, fontWeight: 700, letterSpacing: 4, margin: 0,
          textTransform: "uppercase", color: "#ffaa00",
          textShadow: "0 0 20px rgba(255,140,0,0.4)",
        }}>
          DJZ Ring Voice
        </h1>
        <div style={{ fontSize: 11, letterSpacing: 3, color: "rgba(255,140,0,0.5)", marginTop: 4 }}>
          MODULATOR · MK IV · SERIES
        </div>
      </div>

      {/* Main chassis */}
      <div style={{
        width: "100%", maxWidth: 620,
        border: "1px solid rgba(255,140,0,0.25)",
        borderTop: "2px solid rgba(255,140,0,0.5)",
        background: "linear-gradient(180deg, #111000 0%, #0a0800 100%)",
        padding: "1.5rem",
        boxShadow: "0 0 40px rgba(255,100,0,0.08) inset, 0 4px 32px rgba(0,0,0,0.6)",
      }}>

        {/* Oscilloscope */}
        <div style={{
          border: "1px solid rgba(255,140,0,0.2)",
          background: "#050300",
          padding: "8px",
          marginBottom: "1.5rem",
          position: "relative",
        }}>
          <div style={{
            position: "absolute", top: 6, left: 10,
            fontSize: 9, letterSpacing: 3, color: "rgba(255,140,0,0.3)",
          }}>WAVEFORM · MONITOR</div>
          <OscilloscopeCanvas analyser={analyserNode} active={active} />
        </div>

        {/* VU Meter + Status */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: "1.5rem" }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: "rgba(255,140,0,0.4)", minWidth: 24 }}>VU</div>
          <div style={{ display: "flex", gap: 3, flex: 1 }}>
            {Array.from({ length: vuSegments }).map((_, i) => {
              const lit = i < litSegments;
              const isHot = i >= vuSegments * 0.8;
              const isMid = i >= vuSegments * 0.6;
              const color = isHot ? "#ff2200" : isMid ? "#ffcc00" : "#ff8c00";
              return (
                <div key={i} style={{
                  flex: 1, height: 12,
                  background: lit ? color : "rgba(255,140,0,0.06)",
                  border: `1px solid ${lit ? color : "rgba(255,140,0,0.1)"}`,
                  boxShadow: lit ? `0 0 4px ${color}` : "none",
                  transition: "background 0.05s, box-shadow 0.05s",
                }} />
              );
            })}
          </div>
          <div style={{
            fontSize: 9, letterSpacing: 2,
            color: status === "active" ? "#00ff88" : status === "connecting" ? "#ffcc00" : "rgba(255,140,0,0.3)",
            minWidth: 70, textAlign: "right",
            textShadow: status === "active" ? "0 0 8px #00ff88" : "none",
          }}>
            ● {status.toUpperCase()}
          </div>
        </div>

        {/* Preset buttons */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: 9, letterSpacing: 3, color: "rgba(255,140,0,0.35)", marginBottom: 8 }}>
            PRESET BANK
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PRESETS.map((p, i) => (
              <button key={i} onClick={() => applyPreset(i)} style={{
                background: preset === i ? "rgba(255,140,0,0.15)" : "transparent",
                border: `1px solid ${preset === i ? "rgba(255,140,0,0.6)" : "rgba(255,140,0,0.18)"}`,
                color: preset === i ? "#ffaa00" : "rgba(255,140,0,0.5)",
                padding: "4px 12px",
                fontSize: 10,
                letterSpacing: 1.5,
                cursor: "pointer",
                textTransform: "uppercase",
                fontFamily: "'Courier New', monospace",
                transition: "all 0.15s",
                boxShadow: preset === i ? "0 0 8px rgba(255,140,0,0.15)" : "none",
              }}>
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Parameter knobs */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))",
          gap: "1.5rem 1rem",
          marginBottom: "1.5rem",
          padding: "1.25rem",
          border: "1px solid rgba(255,140,0,0.1)",
          background: "rgba(255,140,0,0.02)",
        }}>
          <Knob label="Carrier" value={params.freq} min={10} max={200} step={1} unit=" Hz" onChange={setParam("freq")} decimals={0} />
          <Knob label="Wet Mix" value={params.mix} min={0} max={1} step={0.01} unit="%" onChange={(v) => setParam("mix")(v)} decimals={2} />
          <Knob label="LFO Rate" value={params.lfoRate} min={0} max={10} step={0.1} unit=" Hz" onChange={setParam("lfoRate")} decimals={1} />
          <Knob label="LFO Depth" value={params.lfoDepth} min={0} max={20} step={0.5} unit=" Hz" onChange={setParam("lfoDepth")} decimals={1} />
          <Knob label="Drive" value={params.drive} min={1} max={5} step={0.1} unit="×" onChange={setParam("drive")} decimals={1} />
        </div>

        {/* Waveform selector */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: 9, letterSpacing: 3, color: "rgba(255,140,0,0.35)", marginBottom: 8 }}>
            CARRIER WAVEFORM
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {WAVEFORMS.map((w) => (
              <button key={w} onClick={() => setParam("waveform")(w)} style={{
                flex: 1,
                background: params.waveform === w ? "rgba(255,140,0,0.15)" : "transparent",
                border: `1px solid ${params.waveform === w ? "rgba(255,140,0,0.6)" : "rgba(255,140,0,0.15)"}`,
                color: params.waveform === w ? "#ffaa00" : "rgba(255,140,0,0.4)",
                padding: "6px 4px",
                fontSize: 9,
                letterSpacing: 1.5,
                cursor: "pointer",
                textTransform: "uppercase",
                fontFamily: "'Courier New', monospace",
              }}>
                {w}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: "rgba(255,0,0,0.06)", border: "1px solid rgba(255,60,0,0.3)",
            padding: "8px 12px", marginBottom: "1rem",
            fontSize: 11, color: "#ff4422", letterSpacing: 1,
          }}>
            ⚠ {error}
          </div>
        )}

        {/* Activate button */}
        <button
          onClick={active ? stopAudio : startAudio}
          disabled={status === "connecting"}
          style={{
            width: "100%",
            background: active ? "rgba(255,30,0,0.1)" : "rgba(255,140,0,0.08)",
            border: `2px solid ${active ? "rgba(255,60,0,0.6)" : "rgba(255,140,0,0.5)"}`,
            color: active ? "#ff4422" : "#ffaa00",
            padding: "14px",
            fontSize: 13,
            letterSpacing: 4,
            textTransform: "uppercase",
            fontFamily: "'Courier New', monospace",
            cursor: status === "connecting" ? "wait" : "pointer",
            fontWeight: 700,
            boxShadow: active
              ? "0 0 20px rgba(255,30,0,0.15) inset"
              : "0 0 20px rgba(255,140,0,0.06) inset",
            transition: "all 0.2s",
          }}
        >
          {status === "connecting" ? "◌ Initialising..." : active ? "◼ Deactivate Modulator" : "◉ Activate Modulator"}
        </button>

        {/* Spec readout */}
        <div style={{
          display: "flex", justifyContent: "space-between",
          marginTop: "1.25rem",
          paddingTop: "1rem",
          borderTop: "1px solid rgba(255,140,0,0.1)",
          fontSize: 9, letterSpacing: 2, color: "rgba(255,140,0,0.25)",
        }}>
          <span>y(t) = x(t) · sin(2π·{params.freq.toFixed(0)}·t)</span>
          <span>WEB AUDIO API · REAL-TIME DSP</span>
        </div>
      </div>

      {/* Footer note */}
      <div style={{
        marginTop: "1.5rem",
        fontSize: 9, letterSpacing: 2, color: "rgba(255,140,0,0.2)",
        textAlign: "center", maxWidth: 480,
      }}>
        RING MODULATION PRODUCES ONLY SUM + DIFFERENCE SIDEBANDS · NO ORIGINAL FREQUENCIES SURVIVE
        <br />
        SPEAK WITH ELONGATED VOWELS FOR AUTHENTIC DALEK EFFECT
      </div>
    </div>
  );
}
