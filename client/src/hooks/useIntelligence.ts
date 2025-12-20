import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "hivemind_intelligence";

interface IntelligenceState {
  level: number;
  xp: number;
  xpToNextLevel: number;
}

function loadState(): IntelligenceState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {}
  return { level: 1, xp: 0, xpToNextLevel: 100 };
}

function saveState(state: IntelligenceState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useIntelligence() {
  const [state, setState] = useState<IntelligenceState>(loadState);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const addXp = useCallback((amount: number) => {
    setState((prev) => {
      let newXp = prev.xp + amount;
      let newLevel = prev.level;
      let xpToNext = prev.xpToNextLevel;

      while (newXp >= xpToNext) {
        newXp -= xpToNext;
        newLevel++;
        xpToNext = Math.floor(xpToNext * 1.2);
      }

      return { level: newLevel, xp: newXp, xpToNextLevel: xpToNext };
    });
  }, []);

  const loseXp = useCallback((amount: number) => {
    setState((prev) => {
      let newXp = prev.xp - amount;
      let newLevel = prev.level;
      let xpToNext = prev.xpToNextLevel;

      while (newXp < 0 && newLevel > 1) {
        newLevel--;
        xpToNext = Math.floor(xpToNext / 1.2);
        newXp += xpToNext;
      }

      if (newXp < 0) newXp = 0;

      return { level: newLevel, xp: newXp, xpToNextLevel: xpToNext };
    });
  }, []);

  return {
    level: state.level,
    xp: state.xp,
    xpToNextLevel: state.xpToNextLevel,
    addXp,
    loseXp,
  };
}
