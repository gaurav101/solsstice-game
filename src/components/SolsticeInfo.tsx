/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Sun, RotateCw, RefreshCw, Compass, ShieldAlert, Award } from 'lucide-react';

interface SolsticeInfoProps {
  onClose: () => void;
}

export const SolsticeInfo: React.FC<SolsticeInfoProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div 
        id="info-modal"
        className="relative w-full max-w-4xl bg-[#040815]/95 border border-slate-800/80 rounded-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto shadow-[0_0_80px_rgba(59,130,246,0.15)] text-slate-100 backdrop-blur-xl overflow-hidden"
      >
        {/* Top styling beam */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-orange-500 to-transparent" />
        
        {/* Header */}
        <div className="flex justify-between items-start mb-6 border-b border-white/[0.04] pb-4">
          <div>
            <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-orange-400">TELEMETRY & GEOMETRIC SPECIFICATION</span>
            <h2 className="text-xl sm:text-2xl font-sans font-black tracking-tight text-white mt-1 uppercase">
              June Solstice & Planetary Balance
            </h2>
          </div>
          <button
            id="close-info-btn"
            onClick={onClose}
            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-slate-950 font-bold font-mono text-[10px] tracking-widest uppercase rounded-lg shadow-[0_0_15px_rgba(249,115,22,0.2)] cursor-pointer transition-all hover:scale-105"
          >
            Acknowledge & Play
          </button>
        </div>

        {/* Content Tabs / Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 leading-relaxed text-sm text-slate-300">
          
          {/* Science Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold font-mono uppercase tracking-widest text-orange-400 flex items-center gap-2 border-b border-white/[0.03] pb-2">
              <Compass className="w-4 h-4 text-orange-500" />
              Obliquity Mechanics
            </h3>
            
            <p className="text-xs text-slate-400 font-sans leading-relaxed">
              In astronometrics, the <strong className="text-slate-200">June Solstice</strong> occurs when Earth's geographical North pole reaches its maximum inclination toward the Sun. Because Earth's rotational axis maintains an obliquity tilt of approximately <strong className="text-orange-400 font-mono">23.44°</strong> relative to its orbital plane, solar radiation covers northern latitudes at their most direct angle.
            </p>

            <div className="bg-white/[0.02] p-4 border border-white/5 rounded-xl space-y-2 font-mono text-xs">
              <h4 className="font-bold text-white flex items-center gap-2 text-[10px] uppercase tracking-wider text-orange-400">
                <Sun className="w-3.5 h-3.5 text-orange-500" />
                Astronomical Thresholds
              </h4>
              <ul className="space-y-2 text-[11px] text-slate-400">
                <li><strong className="text-orange-400">📍 Tropic of Cancer</strong>: The latitude (23.44° N) where solar radiation targets directly overhead at local noon.</li>
                <li><strong className="text-sky-400">📍 Arctic Zenith Circle</strong>: Everything north of 66.56° N benefits from 24 hours of light (the Midnight Sun).</li>
                <li><strong className="text-rose-400">📍 Antarctic Eclipse Circle</strong>: Southern latitudes below 66.56° S roll into absolute planetary shadow.</li>
              </ul>
            </div>

            <p className="text-xs text-slate-400 font-sans leading-relaxed">
              This geometric alignment generates an unequal thermal balance. Throughout human history, the June Solstice marks a seasonal boundary, a celebration of light, and the critical marker for planetary ecological cycles.
            </p>
          </div>

          {/* Gameplay Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold font-mono uppercase tracking-widest text-sky-400 flex items-center gap-2 border-b border-white/[0.03] pb-2">
              <RotateCw className="w-4 h-4 text-sky-400" />
              Equilibrium Instructions
            </h3>

            <p className="text-xs text-slate-400 font-sans leading-relaxed">
              In this computer simulation, the Earth undergoes active force disruptions from cyclic <strong className="text-amber-400">Solar Flares, Lunar Gravitational Tides and Meteor Impacts</strong>. Use the booster thrusters to align the planet to its target June configuration!
            </p>

            <div className="bg-emerald-500/[0.02] border border-emerald-500/20 p-4 rounded-xl space-y-3 font-mono text-xs">
              <h4 className="font-bold text-emerald-400 flex items-center gap-1.5 text-[10px] uppercase tracking-widest">
                <Award className="w-3.5 h-3.5" />
                Dwell Zone Criteria
              </h4>
              <div className="space-y-2 text-[11px] text-slate-400">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">01/</span>
                  <span><strong>Optimal Obliquity:</strong> Guide the dynamic axial tilt into the target zone of <strong>23.0° to 23.9°</strong>.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">02/</span>
                  <span><strong>Stellar Spin Velocity:</strong> Keep the Earth spinning smoothly inside the stable band of <strong>1.0 to 2.5 RPM</strong>. Over-spinning destroys atmospheric layers; static halts cook local ecosystems.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">03/</span>
                  <span><strong>Energy Index Stability:</strong> Maintain equilibrium around 50% day / night light ratio. If either day ratio or night ratio drops to absolute zero, failure occurs.</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-400 font-sans leading-relaxed">
              Applying torque controls counters gravitational anomalies. Each second within stable thresholds accumulates <strong className="text-orange-400">Equilibrium points</strong>.
            </p>
          </div>

        </div>

        {/* Visual Diagram / Infographic */}
        <div className="mt-6 bg-[#02050b]/80 p-5 rounded-xl border border-white/[0.03] text-center space-y-4 font-mono">
          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">SYSTEM CALIBRATION SPECTRA</div>
          
          <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-2">
            {/* Sun Block */}
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-orange-500 to-amber-400 shadow-[0_0_20px_#f97316] flex items-center justify-center font-bold text-slate-950 text-[10px]">
                STELLAR CORE
              </div>
              <span className="text-[10px] text-orange-400 mt-2">Active Solar Flare Source</span>
            </div>

            {/* Ray lines (SVG concept) */}
            <div className="hidden sm:block flex-1 max-w-[200px] h-[2px] border-t-2 border-dashed border-orange-500/20 relative">
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-t-transparent border-b-4 border-b-transparent border-l-8 border-l-orange-500/60"></div>
              <span className="absolute left-1/2 -translate-x-1/2 -top-5 text-[9px] text-orange-500/60 tracking-wider">SOLAR ENERGY RADIATION LOBES</span>
            </div>

            {/* Earth block */}
            <div className="flex flex-col items-center">
              <div className="relative w-16 h-16 rounded-full border border-sky-500/20 flex items-center justify-center bg-gradient-to-tr from-slate-950 to-sky-950 overflow-hidden shadow-[0_0_15px_rgba(56,189,248,0.15)]">
                {/* Axial Tilt line */}
                <div className="absolute w-[2px] h-20 bg-emerald-400 rotate-[23.44deg]"></div>
                {/* Sun Terminator line */}
                <div className="absolute w-[1px] h-16 bg-orange-500/30 left-1/2 -translate-x-1/2"></div>
                {/* Solstice North tilt crown */}
                <div className="absolute top-2 left-6 text-[8px] text-emerald-400 font-black">N (23.44°)</div>
              </div>
              <span className="text-[10px] text-sky-400 mt-2">CALIBRATION TARGET: ~23.44°</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left text-xs">
            <div className="p-2.5 border border-white/5 rounded-xl bg-white/[0.01]">
              <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wide">Controls</div>
              <div className="text-[11px] text-slate-300 font-semibold mt-0.5">W,A,S,D / Arrow Keys</div>
            </div>
            <div className="p-2.5 border border-white/5 rounded-xl bg-white/[0.01]">
              <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wide">Stellar weather</div>
              <div className="text-[11px] text-orange-400 font-semibold mt-0.5 font-sans">Knocks obliquity axis</div>
            </div>
            <div className="p-2.5 border border-white/5 rounded-xl bg-white/[0.01]">
              <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wide">Atmosphere Glow</div>
              <div className="text-[11px] text-sky-400 font-semibold mt-0.5">Procedural Night shader</div>
            </div>
            <div className="p-2.5 border border-white/5 rounded-xl bg-white/[0.01]">
              <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wide">Historic metrics</div>
              <div className="text-[11px] text-emerald-400 font-semibold mt-0.5">Persisted High Records</div>
            </div>
          </div>
        </div>

        {/* Footer info button */}
        <div className="mt-6 flex justify-between items-center text-[10px] text-slate-500 border-t border-white/[0.04] pt-4 font-mono">
          <span>SPATIAL SIMULATION V4 | EARTH BALANCE ENGINE</span>
          <button
            id="modal-underlay-close-btn"
            onClick={onClose}
            className="px-4 py-2 bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 rounded-lg text-slate-300 font-bold uppercase tracking-widest text-[9px] cursor-pointer transition-all"
          >
            Access Core Simulator Console
          </button>
        </div>
      </div>
    </div>
  );
};
