export enum GameState {
  START = 'START',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  GAME_OVER = 'GAME_OVER',
}

export enum Difficulty {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD',
}

export interface CosmicEvent {
  id: string;
  name: string;
  description: string;
  type: 'SOLAR_FLARE' | 'GRAVITY_TIDE' | 'AURORA_STORM';
  duration: number; // in milliseconds
  remaining: number; // in milliseconds
  intensity: number; // multiplier for force / torque
  direction: [number, number, number]; // 3D vector of direction
}

export interface PlayerStats {
  score: number;
  survivalTime: number; // in seconds
  highestBalance: number; // peak alignment % reached
  flaresDeflected: number;
  gamesPlayed: number;
}

export interface LeaderboardEntry {
  playerName: string;
  score: number;
  survivalTime: number;
  highestBalance: number;
  difficulty: Difficulty;
  date: string;
}
