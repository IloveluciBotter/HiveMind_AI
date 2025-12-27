import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'trainYourAI_gameState'
const XP_PER_LEVEL = 1000

const defaultGlobalBrain = {
  level: 1,
  xp: 0,
  stability: 1,
  categories: {
    logic: { strength: 0.5, samples: 0 },
    math: { strength: 0.5, samples: 0 },
    general: { strength: 0.5, samples: 0 }
  },
  lastRollback: null,
  recentMaxXp: 0,
  lowScoreStreak: 0
}

const defaultUserState = {
  intelligence: 1,
  totalSessions: 0,
  correctAnswers: 0,
  totalQuestions: 0,
  styleCredits: 0,
  unlockedCores: ['default'],
  unlockedAuras: ['none'],
  selectedCore: 'default',
  selectedAura: 'none',
  hiveImpactXp: 0,
  hiveSessions: 0,
  lastSessionScore: null
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        globalBrain: { ...defaultGlobalBrain, ...parsed.globalBrain },
        userState: { ...defaultUserState, ...parsed.userState }
      }
    }
  } catch (e) {
    console.error('Failed to load game state:', e)
  }
  return { globalBrain: defaultGlobalBrain, userState: defaultUserState }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    console.error('Failed to save game state:', e)
  }
}

export function useGameState() {
  const [state, setState] = useState(() => loadState())
  const { globalBrain, userState } = state

  useEffect(() => {
    saveState(state)
  }, [state])

  const logEvent = useCallback((eventType, data = {}) => {
    console.log(`[Event] ${eventType}:`, { timestamp: new Date().toISOString(), ...data })
  }, [])

  const updateGlobalBrain = useCallback((result) => {
    const { scorePercent, level, categoriesUsed } = result

    setState(prev => {
      const newGlobalBrain = { ...prev.globalBrain }
      const newUserState = { ...prev.userState }
      let xpChange = 0

      if (scorePercent >= 80) {
        xpChange = Math.floor((scorePercent - 70) * level)
        newGlobalBrain.xp += xpChange

        categoriesUsed.forEach(cat => {
          if (newGlobalBrain.categories[cat]) {
            newGlobalBrain.categories[cat].strength = Math.min(1, 
              newGlobalBrain.categories[cat].strength + 0.01 * (scorePercent / 100)
            )
            newGlobalBrain.categories[cat].samples += 1
          }
        })

        newGlobalBrain.stability = Math.min(1, newGlobalBrain.stability + 0.02)
        newGlobalBrain.lowScoreStreak = 0

        if (newGlobalBrain.xp > newGlobalBrain.recentMaxXp) {
          newGlobalBrain.recentMaxXp = newGlobalBrain.xp
        }

      } else if (scorePercent >= 50) {
        categoriesUsed.forEach(cat => {
          if (newGlobalBrain.categories[cat]) {
            newGlobalBrain.categories[cat].samples += 1
          }
        })

        newGlobalBrain.lowScoreStreak += 1
        if (newGlobalBrain.lowScoreStreak > 3) {
          newGlobalBrain.stability = Math.max(0, newGlobalBrain.stability - 0.02)
        }

      } else {
        xpChange = -Math.floor((50 - scorePercent) * (level / 2))
        newGlobalBrain.xp = Math.max(0, newGlobalBrain.xp + xpChange)

        categoriesUsed.forEach(cat => {
          if (newGlobalBrain.categories[cat]) {
            newGlobalBrain.categories[cat].strength = Math.max(0,
              newGlobalBrain.categories[cat].strength - 0.01 * ((50 - scorePercent) / 50)
            )
            newGlobalBrain.categories[cat].samples += 1
          }
        })

        newGlobalBrain.stability = Math.max(0, newGlobalBrain.stability - 0.05)
        newGlobalBrain.lowScoreStreak += 1

        const xpDrop = newGlobalBrain.recentMaxXp - newGlobalBrain.xp
        if (newGlobalBrain.stability < 0.3 || xpDrop > 500) {
          if (newGlobalBrain.level > 1) {
            newGlobalBrain.level -= 1
            newGlobalBrain.lastRollback = 'Rollback triggered: too many low-scoring training runs. The hive mind reverted some knowledge to avoid learning from noisy data.'
            logEvent('hive_rollback', { newLevel: newGlobalBrain.level })
          }
        }
      }

      const oldLevel = newGlobalBrain.level
      const newLevel = Math.floor(newGlobalBrain.xp / XP_PER_LEVEL) + 1
      if (newLevel > oldLevel) {
        newGlobalBrain.level = newLevel
        logEvent('hive_level_up', { newLevel })
      }

      newUserState.hiveImpactXp += xpChange
      newUserState.hiveSessions += 1

      return { globalBrain: newGlobalBrain, userState: newUserState }
    })
  }, [logEvent])

  const updateUserStats = useCallback((sessionResult) => {
    setState(prev => {
      const newUserState = { ...prev.userState }
      newUserState.totalSessions += 1
      newUserState.correctAnswers += sessionResult.correct
      newUserState.totalQuestions += sessionResult.total
      newUserState.lastSessionScore = sessionResult.scorePercent

      if (sessionResult.scorePercent >= 80) {
        newUserState.intelligence = Math.min(100, newUserState.intelligence + 1)
      } else if (sessionResult.scorePercent < 50 && newUserState.intelligence > 1) {
        newUserState.intelligence -= 1
      }

      return { ...prev, userState: newUserState }
    })
  }, [])

  const addStyleCredits = useCallback((amount) => {
    setState(prev => ({
      ...prev,
      userState: { ...prev.userState, styleCredits: prev.userState.styleCredits + amount }
    }))
  }, [])

  const unlockCosmetic = useCallback((type, id, cost) => {
    setState(prev => {
      if (prev.userState.styleCredits < cost) return prev

      const newUserState = { ...prev.userState }
      newUserState.styleCredits -= cost

      if (type === 'core') {
        if (!newUserState.unlockedCores.includes(id)) {
          newUserState.unlockedCores = [...newUserState.unlockedCores, id]
        }
      } else if (type === 'aura') {
        if (!newUserState.unlockedAuras.includes(id)) {
          newUserState.unlockedAuras = [...newUserState.unlockedAuras, id]
        }
      }

      return { ...prev, userState: newUserState }
    })
  }, [])

  const selectCosmetic = useCallback((type, id) => {
    setState(prev => {
      const newUserState = { ...prev.userState }
      if (type === 'core') {
        newUserState.selectedCore = id
      } else if (type === 'aura') {
        newUserState.selectedAura = id
      }
      return { ...prev, userState: newUserState }
    })
  }, [])

  const clearRollbackMessage = useCallback(() => {
    setState(prev => ({
      ...prev,
      globalBrain: { ...prev.globalBrain, lastRollback: null }
    }))
  }, [])

  return {
    globalBrain,
    userState,
    updateGlobalBrain,
    updateUserStats,
    addStyleCredits,
    unlockCosmetic,
    selectCosmetic,
    clearRollbackMessage,
    logEvent
  }
}
