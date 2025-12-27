export const coreStyles = [
  { id: 'default', name: 'Default Core', description: 'The standard AI core', cost: 0, color: '#00f5ff', unlocked: true },
  { id: 'glitched', name: 'Glitched Core', description: 'A corrupted, glitchy appearance', cost: 500, color: '#ff00ff', unlocked: false },
  { id: 'overclocked', name: 'Overclocked Core', description: 'Running at maximum capacity', cost: 1000, color: '#ff6600', unlocked: false },
  { id: 'quantum', name: 'Quantum Core', description: 'Exists in multiple states', cost: 2000, color: '#00ff88', unlocked: false },
  { id: 'void', name: 'Void Core', description: 'Pure darkness with a spark', cost: 3000, color: '#4a0080', unlocked: false }
]

export const auraStyles = [
  { id: 'none', name: 'No Aura', description: 'Clean, no effects', cost: 0, color: 'transparent', unlocked: true },
  { id: 'neon-blue', name: 'Neon Blue Aura', description: 'Electric blue glow', cost: 300, color: '#00f5ff', unlocked: false },
  { id: 'neon-purple', name: 'Neon Purple Aura', description: 'Mystical purple glow', cost: 300, color: '#b794f6', unlocked: false },
  { id: 'neon-green', name: 'Neon Green Aura', description: 'Matrix-style green glow', cost: 300, color: '#39ff14', unlocked: false },
  { id: 'rainbow', name: 'Rainbow Aura', description: 'Shifting spectrum colors', cost: 1500, color: 'linear-gradient(45deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #8b00ff)', unlocked: false }
]

export function getStyleCreditsForScore(scorePercent, level) {
  if (scorePercent >= 90) return Math.floor(50 * level)
  if (scorePercent >= 80) return Math.floor(30 * level)
  if (scorePercent >= 70) return Math.floor(15 * level)
  if (scorePercent >= 50) return Math.floor(5 * level)
  return 0
}
