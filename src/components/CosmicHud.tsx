/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Play, RotateCcw, Volume2, VolumeX, HelpCircle, Sun, Award, Clock, Activity, Calendar } from 'lucide-react';
import { GameState, Difficulty, LeaderboardEntry, PlayerStats } from '../types';

interface CosmicHudProps {
  gameState: GameState;
  difficulty: Difficulty;
  isMuted: boolean;
  score: number;
  alignment: number;
  rpm: number;
  onStartGame: (diff: Difficulty) => void;
  onPauseToggle: () => void;
  onToggleMute: () => void;
  onOpenScienceModal: () => void;
  onResetGame: (autoStart?: boolean) => void;
  gameOverStats: { score: number; maxAlignment: number; survivalSec: number } | null;
}

export const CosmicHud: React.FC<CosmicHudProps> = ({
  gameState,
  difficulty,
  isMuted,
  score,
  alignment,
  rpm,
  onStartGame,
  onPauseToggle,
  onToggleMute,
  onOpenScienceModal,
  onResetGame,
  gameOverStats,
}) => {
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  const [playerName, setPlayerName] = useState<string>('Solstice Commander');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [hasNewHighScore, setHasNewHighScore] = useState<boolean>(false);

  // Load leaderboard from Local Storage
  useEffect(() => {
    const saved = localStorage.getItem('solstice_balance_leaderboard');
    if (saved) {
      try {
        setLeaderboard(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse leaderboard from localstorage:', e);
      }
    } else {
      // Default initial records (realistic scientific names)
      const initial: LeaderboardEntry[] = [
        { playerName: 'Kepler Orbiter', score: 25000, survivalTime: 120, highestBalance: 98, difficulty: Difficulty.HARD, date: 'June 21, 2026' },
        { playerName: 'Copernicus Heliostat', score: 18000, survivalTime: 95, highestBalance: 94, difficulty: Difficulty.MEDIUM, date: 'June 20, 2026' },
        { playerName: 'Galileo Gaze', score: 12000, survivalTime: 70, highestBalance: 88, difficulty: Difficulty.EASY, date: 'June 18, 2026' },
      ];
      localStorage.setItem('solstice_balance_leaderboard', JSON.stringify(initial));
      setLeaderboard(initial);
    }
  }, []);

  // Check and save score when Game Over triggers
  useEffect(() => {
    if (gameState === GameState.GAME_OVER && gameOverStats) {
      // Check if this score is in top 5 or just add it
      const entry: LeaderboardEntry = {
        playerName: playerName.trim() || 'Anonymous Cadet',
        score: gameOverStats.score,
        survivalTime: gameOverStats.survivalSec,
        highestBalance: Math.round(gameOverStats.maxAlignment),
        difficulty,
        date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      };

      setLeaderboard(prev => {
        const nextList = [...prev, entry]
          .sort((a, b) => b.score - a.score)
          .slice(0, 5); // Keep top 5
        localStorage.setItem('solstice_balance_leaderboard', JSON.stringify(nextList));
        
        // Trigger highscore success celebration flag
        if (nextList[0].score === entry.score || nextList.some(item => item.score === entry.score)) {
          setHasNewHighScore(true);
        }
        return nextList;
      });
    } else {
      setHasNewHighScore(false);
    }
  }, [gameState, gameOverStats]);

  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between">
      
      {/* ----------------- HUD Left Vertical Nav ----------------- */}
      <div className="p-2 sm:p-3 lg:p-6 h-full w-16 lg:w-64 flex flex-col justify-between items-center bg-gradient-to-r from-[#02050c]/95 to-transparent pointer-events-auto border-r border-white/[0.03] backdrop-blur-[2px]">

        {/* Top: Solstice Title Logo (condensed for vertical layout) */}
        <div className="flex flex-col items-center gap-3 mt-2">
          <div className="w-10 h-10 lg:w-14 lg:h-14 rounded-full border border-orange-500/30 bg-orange-950/20 shadow-[0_0_15px_rgba(249,115,22,0.25)] flex items-center justify-center relative group">
            <div className="absolute inset-0.5 rounded-full border border-orange-500/60 animate-spin" style={{ animationDuration: '10s' }} />
            <div className="w-5 h-5 lg:w-7 lg:h-7 bg-gradient-to-tr from-orange-500 to-amber-400 rounded-full flex items-center justify-center shadow-[0_0_8px_#f97316]">
              <Sun className="w-4 h-4 text-slate-950" />
            </div>
          </div>
          <div className="hidden lg:block text-center">
            <h1 className="text-sm font-black tracking-[0.15em] text-white leading-none font-sans uppercase">SOLSTICE</h1>
            <span className="text-[9px] font-mono tracking-[0.25em] text-orange-400 uppercase font-semibold block">JUNE CONTROL</span>
          </div>
        </div>

        {/* Middle: Live Score / Stats (compact) */}
        <div className="flex-1 flex items-center justify-center">
          {gameState === GameState.PLAYING && (
            <div className="flex flex-col items-center gap-1 bg-white/[0.02] border border-white/5 px-3 py-2 rounded-xl">
              <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest">Points</span>
              <span className="text-base font-bold font-mono text-orange-400">{score}</span>
              <span className="text-[9px] text-slate-400 mt-1">{alignment}% • {rpm.toFixed(2)} RPM</span>
            </div>
          )}
        </div>

        {/* Bottom: Vertical Action Buttons */}
        <div className="flex flex-col gap-3 items-center w-full mb-3">
          <button
            id="open-science-btn"
            onClick={onOpenScienceModal}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 rounded-lg text-slate-300 hover:text-white transition-all text-xs font-semibold"
            title="June Solstice Science Guide"
          >
            <HelpCircle className="w-4 h-4 text-sky-400" />
            <span className="hidden lg:inline font-mono tracking-wider text-[10px] uppercase">Science</span>
          </button>

          <button
            id="mute-sound-btn"
            onClick={onToggleMute}
            className="w-full flex items-center justify-center px-3 py-2 bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 rounded-lg text-slate-300 hover:text-white transition-all"
            title={isMuted ? 'Unmute Synth' : 'Mute Synth'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            <span className="hidden lg:inline ml-2 text-[10px] font-mono uppercase">Sound</span>
          </button>

          {gameState === GameState.PLAYING ? (
            <button
              id="pause-game-btn"
              onClick={onPauseToggle}
              className="w-full px-3 py-2 bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 rounded-lg text-slate-300 hover:text-white font-bold text-[10px] transition-all"
            >
              Pause
            </button>
          ) : (
            <button
              id="start-simulation-btn-compact"
              onClick={() => onStartGame(selectedDifficulty)}
              className="w-full px-3 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 font-black rounded-lg text-[10px]"
            >
              Start
            </button>
          )}

        </div>
      </div>

      {/* ----------------- Screens / Overlays ----------------- */}
      <div className="absolute top-0 right-0 bottom-0 left-16 lg:left-64 flex items-center justify-center p-4 pointer-events-none">

        {/* --- START MENU SCREEN --- */}
        {gameState === GameState.START && (
          <div className="w-full max-w-lg bg-[#040815]/90 border border-slate-800/80 rounded-2xl p-6 sm:p-8 pointer-events-auto shadow-[0_0_80px_rgba(249,115,22,0.12)] flex flex-col gap-6 text-slate-100 backdrop-blur-xl relative overflow-hidden">
            
            {/* Top orange status beam */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-orange-500 to-transparent" />
            
            <div className="text-center">
              <span className="text-[9px] font-mono font-bold tracking-widest text-orange-400 uppercase bg-orange-500/10 px-3.5 py-1 rounded-full border border-orange-500/20 inline-block">
                🌍 Space Station Calibration System
              </span>
              <h2 className="text-3xl font-sans font-black tracking-tight text-white mt-4 uppercase">
                Solstice Balance
              </h2>
              <div className="w-12 h-0.5 bg-orange-500 mx-auto mt-2.5 rounded-full shadow-[0_0_10px_#f97316]" />
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto mt-3 font-sans">
                Align Earth's obliquity tilt precisely at the June Solstice threshold of <strong className="text-white">23.44°</strong> and regulate rotational momentum to prevent thermal collapse.
              </p>
            </div>

            {/* Inputs & Settings */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1.5 uppercase tracking-wider">
                  <Activity className="w-3.5 h-3.5 text-orange-500" /> Executive Commander Name
                </label>
                <input
                  id="player-name-input"
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  maxLength={20}
                  className="w-full bg-slate-950/60 border border-slate-800/80 focus:border-orange-500/70 focus:shadow-[0_0_15px_rgba(249,115,22,0.1)] rounded-xl py-2.5 px-4 text-sm text-slate-200 font-mono transition-all outline-none"
                  placeholder="Enter Commander name..."
                />
              </div>

              {/* Difficulty selector */}
              <div className="space-y-2">
                <label className="text-[9px] text-slate-400 font-mono uppercase tracking-wider block">Orbital Interruption Level</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(Difficulty) as Array<keyof typeof Difficulty>).map((diffKey) => {
                    const diffValue = Difficulty[diffKey];
                    const isActive = selectedDifficulty === diffValue;
                    return (
                      <button
                        key={diffValue}
                        id={`diff-btn-${diffValue.toLowerCase()}`}
                        onClick={() => setSelectedDifficulty(diffValue)}
                        className={`py-2 text-[10px] font-bold tracking-widest font-mono rounded-lg border transition-all duration-300 cursor-pointer ${
                          isActive
                            ? 'bg-gradient-to-r from-orange-500 to-amber-500 border-none text-slate-950 shadow-[0_0_15px_rgba(249,115,22,0.3)] font-black'
                            : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/5 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {diffKey}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[9px] text-slate-500 font-mono tracking-wide">
                  {selectedDifficulty === Difficulty.EASY && '🛰️ Mild stellar drifts. Recommended for cadet training.'}
                  {selectedDifficulty === Difficulty.MEDIUM && '🛰️ Frequent magnetic solar flares & atmospheric friction.'}
                  {selectedDifficulty === Difficulty.HARD && '🛰️ Extreme coronal mass ejections + fast axial tumbling.'}
                </p>
              </div>
            </div>

            {/* Start Button with Dynamic Hover Glow */}
            <button
              id="start-simulation-btn"
              onClick={() => onStartGame(selectedDifficulty)}
              className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-slate-950 font-black tracking-widest uppercase rounded-xl shadow-[0_0_20px_rgba(249,115,22,0.25)] hover:shadow-[0_0_35px_rgba(249,115,22,0.45)] transition-all duration-300 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 font-mono text-xs"
            >
              <Play className="w-3.5 h-3.5 fill-slate-950 text-slate-950" />
              Engage Calibration
            </button>

            {/* Quick instructions cheat-sheet */}
            <div className="border-t border-slate-800/80 pt-4 text-center">
              <span className="text-[9px] text-orange-500/70 block uppercase tracking-widest font-mono font-bold">SOLSTICE PRINCIPLE</span>
              <span className="text-[11px] text-slate-400 mt-1 block">
                At Solstice equilibrium, Earth tilts North Pole directly toward solar energy, locking tropic overlays in radiant geometry.
              </span>
            </div>

          </div>
        )}

        {/* --- PAUSED SCREEN --- */}
        {gameState === GameState.PAUSED && (
          <div className="w-full max-w-sm bg-[#040815]/95 border border-slate-800/80 rounded-2xl p-6 pointer-events-auto shadow-[0_0_80px_rgba(59,130,246,0.1)] text-center space-y-6 text-slate-100 backdrop-blur-xl animate-fade-in relative">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-sky-500 to-transparent" />
            
            <div>
              <span className="text-[10px] font-mono text-sky-400 uppercase tracking-widest">DRIVE STANDBY</span>
              <h3 className="text-xl font-bold text-white mt-1 uppercase">Simulation Idle</h3>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                id="resume-simulation-btn"
                onClick={onPauseToggle}
                className="w-full py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold font-mono text-xs tracking-widest uppercase rounded-xl shadow-[0_0_15px_rgba(14,165,233,0.2)] cursor-pointer transition-all active:scale-[0.98]"
              >
                Resume Orbit
              </button>
              <button
                id="reset-simulation-paused-btn"
                onClick={() => onResetGame()}
                className="w-full py-2.5 bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-white/10 text-slate-300 font-bold font-mono text-[10px] tracking-wider uppercase rounded-xl cursor-pointer transition-all"
              >
                Return to Control Deck
              </button>
            </div>
          </div>
        )}

        {/* --- GAME OVER SCREEN --- */}
        {gameState === GameState.GAME_OVER && gameOverStats && (
          <div className="w-full max-w-2xl bg-[#0a0505]/95 border border-rose-950/60 rounded-2xl p-6 sm:p-8 pointer-events-auto shadow-[0_0_80px_rgba(244,63,94,0.15)] text-slate-100 backdrop-blur-xl flex flex-col md:flex-row gap-6 relative">
            
            {/* Top rose failure accent line */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-rose-600 to-transparent" />
            
            {/* Left Column: Player performance */}
            <div className="flex-1 space-y-5">
              <div>
                <span className="text-[9px] font-mono font-black tracking-widest text-rose-500 uppercase px-2.5 py-0.5 rounded border border-rose-500/20 bg-rose-500/10 inline-block">
                  Thermal Integrity Broken
                </span>
                <h3 className="text-2xl font-sans font-black tracking-tight text-white mt-3 uppercase md:text-3xl">
                  Stabilization Failed
                </h3>
                <p className="text-xs text-slate-400 mt-2 font-sans font-normal leading-relaxed">
                  Planetary thermal parameters drifted past critical limits. Magnetic winds disrupted the atmospheric balance, cascading a core obliquity breach and halting the calibration sequence.
                </p>
              </div>

              {/* Stats block */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                  <span className="text-[9px] text-[#f97316] uppercase font-bold tracking-wider block font-mono">Sim Equilibrium Score</span>
                  <span className="text-2xl font-bold font-mono text-white mt-1 block glow-orange">{gameOverStats.score}</span>
                </div>
                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                  <span className="text-[9px] text-sky-400 uppercase font-bold tracking-wider block font-mono">Calibrated Active Time</span>
                  <span className="text-2xl font-bold font-mono text-white mt-1 block glow-blue">{gameOverStats.survivalSec}s</span>
                </div>
                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl col-span-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] text-emerald-400 uppercase font-bold tracking-wider font-mono">Peak Obliquity Alignment</span>
                    <span className="text-sm font-bold font-mono text-white">{Math.round(gameOverStats.maxAlignment)}%</span>
                  </div>
                  <div className="w-full bg-slate-950 h-2 rounded-full mt-2.5 overflow-hidden border border-white/5">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.3)] animate-pulse" style={{ width: `${gameOverStats.maxAlignment}%` }} />
                  </div>
                </div>
              </div>

              {/* Quick Retry */}
              <button
                id="game-over-retry-btn"
                onClick={() => onResetGame(true)}
                className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-slate-950 font-black tracking-widest uppercase rounded-xl shadow-[0_0_20px_rgba(249,115,22,0.25)] hover:shadow-[0_0_35px_rgba(249,115,22,0.45)] transition-all duration-300 active:scale-95 cursor-pointer flex items-center justify-center gap-1 font-mono text-xs"
              >
                <RotateCcw className="w-4 h-4 text-slate-950" />
                Recalibrate Simulator
              </button>
            </div>

            {/* Right Column: High scores Leaderboard */}
            <div className="w-full md:w-[280px] border-t md:border-t-0 md:border-l border-slate-800/80 pt-5 md:pt-0 md:pl-6 space-y-4">
              <h4 className="text-[10px] uppercase font-bold tracking-widest text-slate-300 flex items-center gap-1.5 border-b border-slate-800 pb-2.5 font-mono">
                <Award className="w-4 h-4 text-emerald-400" />
                COMMUNAL HIGH RECORDS
              </h4>

              {hasNewHighScore && (
                <div className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/20 px-2 py-1.5 rounded text-center animate-pulse font-mono">
                  🎉 New Record Registered!
                </div>
              )}

              <div className="space-y-2 max-h-[190px] overflow-y-auto pr-1">
                {leaderboard.map((entry, idx) => (
                  <div 
                    key={idx} 
                    className={`p-2.5 rounded-xl flex justify-between items-center text-xs font-mono border ${
                      entry.playerName === playerName && entry.score === gameOverStats.score
                        ? 'bg-orange-500/10 border-orange-500/40'
                        : 'bg-white/[0.02] border-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-slate-500">0{idx + 1}</span>
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-200 truncate max-w-[124px]">{entry.playerName}</span>
                        <span className="text-[8px] text-slate-500 lowercase">{entry.difficulty} • L{entry.highestBalance}%</span>
                      </div>
                    </div>
                    <span className="font-bold text-orange-400">{entry.score}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>

      {/* ----------------- HUD Bottom Footer Bar ----------------- */}
      <div className="p-4 w-full bg-gradient-to-t from-[#02050c]/90 to-transparent flex justify-between items-center text-[9px] text-slate-500 border-t border-white/[0.02] backdrop-blur-[2.5px] pointer-events-auto">
        <span className="flex items-center gap-1.5 font-mono uppercase tracking-wider">
          <Calendar className="w-3.5 h-3.5 text-orange-500/80" />
          ASTRONOMICAL SOLSTICE PHASES INTEGRATION
        </span>
        <span className="font-mono tracking-wider uppercase text-[8px] px-2.5 py-0.5 rounded border border-white/[0.04] bg-white/[0.02]">
          {gameState === GameState.PLAYING ? 'CALIBRATION FLIGHT ACTIVE' : 'STELLAR STANDBY'}
        </span>
      </div>

    </div>
  );
};
