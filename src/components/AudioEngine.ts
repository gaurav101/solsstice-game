/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class AudioEngineClass {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private droneOsc: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private lfo: OscillatorNode | null = null;
  private thrusterNoiseNode: AudioWorkletNode | ScriptProcessorNode | null = null;
  private thrusterFilter: BiquadFilterNode | null = null;
  private thrusterGain: GainNode | null = null;
  private warningOsc: OscillatorNode | null = null;
  private warningGain: GainNode | null = null;
  private isMuted: boolean = false;
  private isInitialized: boolean = false;

  constructor() {
    // Lazy initialisation to comply with browser autoplay security policies
  }

  public init() {
    if (this.isInitialized) return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.3, this.ctx.currentTime); // default volume 30%
      this.masterGain.connect(this.ctx.destination);

      this.startAmbientDrone();
      this.setupThrusters();
      this.setupWarning();

      this.isInitialized = true;
    } catch (e) {
      console.warn('Web Audio API is not supported in this browser:', e);
    }
  }

  public setVolume(volume: number) {
    this.init();
    if (!this.masterGain || !this.ctx) return;
    const clampedVolume = Math.max(0, Math.min(1, volume));
    this.masterGain.gain.setValueAtTime(clampedVolume, this.ctx.currentTime);
  }

  public toggleMute(): boolean {
    this.init();
    if (!this.masterGain) return false;
    this.isMuted = !this.isMuted;
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.3, this.ctx?.currentTime || 0);
    return this.isMuted;
  }

  private startAmbientDrone() {
    if (!this.ctx || !this.masterGain) return;

    // Deep cosmic space drone oscillator
    this.droneOsc = this.ctx.createOscillator();
    this.droneOsc.type = 'triangle';
    this.droneOsc.frequency.setValueAtTime(55, this.ctx.currentTime); // A1 note

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0.4, this.ctx.currentTime);

    // Filter to make it cozy and warm (deep space)
    this.droneFilter = this.ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.setValueAtTime(150, this.ctx.currentTime);
    this.droneFilter.Q.setValueAtTime(3, this.ctx.currentTime);

    // LFO to sweep the filter slowly, creating space movement
    this.lfo = this.ctx.createOscillator();
    this.lfo.frequency.setValueAtTime(0.08, this.ctx.currentTime); // Very slow sweep (12 seconds)
    
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(60, this.ctx.currentTime);

    // Connect LFO -> Filter frequency
    this.lfo.connect(lfoGain);
    lfoGain.connect(this.droneFilter.frequency);

    // Signal chain: Osc -> Filter -> Gain -> Master
    this.droneOsc.connect(this.droneFilter);
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.masterGain);

    this.droneOsc.start();
    this.lfo.start();
  }

  private setupThrusters() {
    if (!this.ctx || !this.masterGain) return;

    // Create a procedural noise buffer for thrusters (plasma fire)
    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const outputList = noiseBuffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      outputList[i] = Math.random() * 2 - 1;
    }

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    this.thrusterFilter = this.ctx.createBiquadFilter();
    this.thrusterFilter.type = 'lowpass';
    this.thrusterFilter.frequency.setValueAtTime(120, this.ctx.currentTime);
    this.thrusterFilter.Q.setValueAtTime(1, this.ctx.currentTime);

    this.thrusterGain = this.ctx.createGain();
    this.thrusterGain.gain.setValueAtTime(0, this.ctx.currentTime); // Starts silent

    noiseSource.connect(this.thrusterFilter);
    this.thrusterFilter.connect(this.thrusterGain);
    this.thrusterGain.connect(this.masterGain);

    try {
      noiseSource.start();
    } catch (e) {
      // Handle safari start issue
    }
  }

  public setThrusterActive(active: boolean, intensity: number = 1.0) {
    this.init();
    if (!this.ctx || !this.thrusterGain || !this.thrusterFilter) return;

    const targetGain = active ? 0.35 * intensity : 0.0;
    const targetFreq = active ? 180 + intensity * 150 : 120;

    const time = this.ctx.currentTime;
    this.thrusterGain.gain.setTargetAtTime(targetGain, time, 0.1);
    this.thrusterFilter.frequency.setTargetAtTime(targetFreq, time, 0.15);
  }

  private setupWarning() {
    if (!this.ctx || !this.masterGain) return;

    this.warningOsc = this.ctx.createOscillator();
    this.warningOsc.type = 'sine';
    this.warningOsc.frequency.setValueAtTime(220, this.ctx.currentTime); // pulsating alarm

    this.warningGain = this.ctx.createGain();
    this.warningGain.gain.setValueAtTime(0, this.ctx.currentTime); // Starts off

    this.warningOsc.connect(this.warningGain);
    this.warningGain.connect(this.masterGain);

    this.warningOsc.start();
  }

  public setWarningActive(active: boolean) {
    this.init();
    if (!this.ctx || !this.warningGain || !this.warningOsc) return;

    if (active) {
      // Modulation: Pulse the volume
      const pulseSpeed = 4.0; // Fast pulsing
      const time = this.ctx.currentTime;
      this.warningGain.gain.cancelScheduledValues(time);
      
      // Infinite-like pulse using ramp schedule
      for (let i = 0; i < 30; i++) {
        const tStart = time + i * (1 / pulseSpeed);
        const tMid = tStart + 0.12;
        const tEnd = tStart + (1 / pulseSpeed) - 0.05;
        this.warningGain.gain.setValueAtTime(0, tStart);
        this.warningGain.gain.linearRampToValueAtTime(0.18, tMid);
        this.warningGain.gain.linearRampToValueAtTime(0, tEnd);
      }
    } else {
      const time = this.ctx.currentTime;
      this.warningGain.gain.cancelScheduledValues(time);
      this.warningGain.gain.setTargetAtTime(0, time, 0.1);
    }
  }

  public playSolarFlareAlert() {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 1.2);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 1.5);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 1.6);
  }

  public playDynamicImpact(forceIntensity: number = 1.0) {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    // Low-frequency slam sound
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(90, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(30, this.ctx.currentTime + 0.6);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(120, this.ctx.currentTime);

    const impactVolume = Math.min(0.4, 0.15 * forceIntensity);
    gain.gain.setValueAtTime(impactVolume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.8);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.9);
  }

  public playAlignmentSuccess() {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    // Arpeggio chime notes
    const now = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5 (major chord)
    
    notes.forEach((freq, index) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + index * 0.12);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.setValueAtTime(0, now + index * 0.12);
      gain.gain.linearRampToValueAtTime(0.12, now + index * 0.12 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.12 + 0.7);
      
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + index * 0.12);
      osc.stop(now + index * 0.12 + 0.8);
    });
  }

  public playGameOver() {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const notes = [196.00, 164.81, 130.81, 98.00]; // G3, E3, C3, G2 (sad downward theme)

    notes.forEach((freq, index) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + index * 0.2);

      gain.gain.setValueAtTime(0, now);
      gain.gain.setValueAtTime(0, now + index * 0.2);
      gain.gain.linearRampToValueAtTime(0.2, now + index * 0.2 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.2 + 1.2);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + index * 0.2);
      osc.stop(now + index * 0.2 + 1.4);
    });
  }
}

export const AudioEngine = new AudioEngineClass();
