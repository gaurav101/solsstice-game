/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { GameState, Difficulty, CosmicEvent } from './types';
import { GameCanvas } from './components/GameCanvas';
import { CosmicHud } from './components/CosmicHud';
import { SolsticeInfo } from './components/SolsticeInfo';
import { AudioEngine } from './components/AudioEngine';

export default function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.START);
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showScienceModal, setShowScienceModal] = useState<boolean>(false);

  // Score states
  const [currentScore, setCurrentScore] = useState<number>(0);
  const [alignmentPercent, setAlignmentPercent] = useState<number>(100);
  const [rpmSpeed, setRpmSpeed] = useState<number>(1.0);

  // Game over state cache
  const [gameOverStats, setGameOverStats] = useState<{
    score: number;
    maxAlignment: number;
    survivalSec: number;
  } | null>(null);

  // Active Cosmic Disturbances state
  const [activeEvents, setActiveEvents] = useState<CosmicEvent[]>([]);

  // Periodically generate dynamic Cosmic Weather (Flares, Tides, Winds)
  useEffect(() => {
    if (gameState !== GameState.PLAYING) return;

    // Tick down event remaining duration
    const durationInterval = setInterval(() => {
      setActiveEvents((prev) => {
        const nextList = prev
          .map((ev) => ({ ...ev, remaining: ev.remaining - 200 }))
          .filter((ev) => ev.remaining > 0);
        return nextList;
      });
    }, 200);

    // Roll for new Cosmic Event based on difficulty intervals
    const rollIntervalTime = difficulty === Difficulty.HARD ? 11000 : (difficulty === Difficulty.MEDIUM ? 18000 : 25000);
    const triggerChance = difficulty === Difficulty.HARD ? 0.75 : (difficulty === Difficulty.MEDIUM ? 0.55 : 0.40);

    const eventSpawner = setInterval(() => {
      if (Math.random() > triggerChance) return; // Unlucky roll, safe space

      // Choose flare or gravitational pull
      const isFlare = Math.random() > 0.5;
      const uid = Math.random().toString(36).substr(2, 9);
      
      const newEvent: CosmicEvent = isFlare 
        ? {
            id: uid,
            name: 'Solar Ion Flare',
            description: 'A burst of high-intensity stellar winds hitting Earth, pushing its rotation speed clockwise!',
            type: 'SOLAR_FLARE',
            duration: 8000,
            remaining: 8000,
            intensity: difficulty === Difficulty.HARD ? 2.5 : (difficulty === Difficulty.MEDIUM ? 1.5 : 0.8),
            direction: [1, 0, 0], // coming from positive X (Sun)
          }
        : {
            id: uid,
            name: 'Lunar Gravitational Tide',
            description: 'Tidal gravity tugging on the polar axis, twisting and tilting the Earth out of alignment!',
            type: 'GRAVITY_TIDE',
            duration: 10000,
            remaining: 10000,
            intensity: difficulty === Difficulty.HARD ? 2.2 : (difficulty === Difficulty.MEDIUM ? 1.4 : 0.7),
            direction: [0, 1, 0],
          };

      // Play alert sirens
      AudioEngine.playSolarFlareAlert();
      setActiveEvents((prev) => [...prev, newEvent]);
    }, rollIntervalTime);

    return () => {
      clearInterval(durationInterval);
      clearInterval(eventSpawner);
    };
  }, [gameState, difficulty]);

  // Clean-up active events when transitioning out of game
  const clearAllActiveEvents = () => {
    setActiveEvents([]);
  };

  // -----------------------------------------------------
  // User Actions handlers
  // -----------------------------------------------------

  const handleStartGame = (selectedDiff: Difficulty) => {
    // Lazy Audio init upon player interaction
    AudioEngine.init();
    
    setDifficulty(selectedDiff);
    setCurrentScore(0);
    setAlignmentPercent(100);
    setRpmSpeed(1.0);
    setGameOverStats(null);
    clearAllActiveEvents();
    
    setGameState(GameState.PLAYING);
  };

  const handlePauseToggle = () => {
    if (gameState === GameState.PLAYING) {
      setGameState(GameState.PAUSED);
    } else if (gameState === GameState.PAUSED) {
      setGameState(GameState.PLAYING);
    }
  };

  const handleToggleMute = () => {
    const isMutedNow = AudioEngine.toggleMute();
    setIsMuted(isMutedNow);
  };

  const handleOpenScienceModal = () => {
    setShowScienceModal(true);
  };

  const handleCloseScienceModal = () => {
    setShowScienceModal(false);
  };

  const handleResetGame = (autoStart?: boolean) => {
    setGameState(GameState.START);
    setGameOverStats(null);
    setCurrentScore(0);
    clearAllActiveEvents();

    // If caller requested an immediate restart (e.g., quick retry), start using current difficulty
    if (autoStart) {
      handleStartGame(difficulty);
    }
  };

  const handleGameOver = (finalScore: number, maxAlignment: number, survivalSec: number) => {
    setGameOverStats({
      score: finalScore,
      maxAlignment,
      survivalSec,
    });
    setGameState(GameState.GAME_OVER);
  };

  const handleUpdateTelemetry = (scoreNum: number, alignNum: number, speedNum: number) => {
    setCurrentScore(scoreNum);
    setAlignmentPercent(alignNum);
    setRpmSpeed(speedNum);
  };

  const handleLaunchCosmicDeflectiveEvent = (event: CosmicEvent) => {
    // Add event
    setActiveEvents((prev) => [...prev, event]);
  };

  const handleClearCosmicEventId = (id: string) => {
    setActiveEvents((prev) => prev.filter((ev) => ev.id !== id));
  };

  return (
    <main 
      id="root-viewport-game"
      className="relative w-screen h-screen bg-[#02050c] font-sans select-none overflow-hidden"
    >
      {/* Immersive UI Cosmic Ambient Atmospheric Layer */}
      <div id="ambient-cyber-atmosphere" className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {/* Left top orange stellar crown flare */}
        <div className="absolute -top-[15%] -left-[15%] w-[60vw] h-[60vh] rounded-full bg-orange-500/8 blur-[140px] animate-pulse" style={{ animationDuration: '11s' }}></div>
        {/* Right bottom polar Aurora cyan glow */}
        <div className="absolute -bottom-[15%] -right-[15%] w-[60vw] h-[60vh] rounded-full bg-sky-500/10 blur-[160px] animate-pulse" style={{ animationDuration: '16s' }}></div>
        {/* Subtle technical digital telemetry crosshairs grid */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.02)_1.5px,transparent_1.5px)] bg-[size:16px_16px]"></div>
      </div>

      {/* ThreeJS WebGL Core Layer */}
      <GameCanvas
        gameState={gameState}
        difficulty={difficulty}
        isMuted={isMuted}
        score={currentScore}
        onUpdateScore={handleUpdateTelemetry}
        onGameOver={handleGameOver}
        onLaunchEvent={handleLaunchCosmicDeflectiveEvent}
        onClearEvent={handleClearCosmicEventId}
        onToggleMute={handleToggleMute}
        activeEvents={activeEvents}
      />

      {/* Head-Up-Displays overlays */}
      <CosmicHud
        gameState={gameState}
        difficulty={difficulty}
        isMuted={isMuted}
        score={currentScore}
        alignment={alignmentPercent}
        rpm={rpmSpeed}
        onStartGame={handleStartGame}
        onPauseToggle={handlePauseToggle}
        onToggleMute={handleToggleMute}
        onOpenScienceModal={handleOpenScienceModal}
        onResetGame={handleResetGame}
        gameOverStats={gameOverStats}
      />

      {/* June Solstice science facts dialogue overlay */}
      {showScienceModal && (
        <SolsticeInfo onClose={handleCloseScienceModal} />
      )}
    </main>
  );
}
