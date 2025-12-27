import React from 'react'
import { coreStyles, auraStyles } from '../data/cosmetics'

export default function Cosmetics({ userState, onUnlock, onSelect }) {
  return (
    <section className="py-16">
      <div className="max-w-6xl mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-4">
          Cosmetics, Styles, and Motivation
        </h2>
        <p className="text-gray-400 text-center mb-8 max-w-2xl mx-auto">
          In the full app, earn Style Credits by performing well and unlock cosmetic upgrades. These are purely visual—they don't increase intelligence or give gameplay power.
        </p>

        <div className="flex justify-center mb-8">
          <div className="glass-card px-6 py-3 inline-flex items-center gap-2">
            <span className="text-xl">💎</span>
            <span className="text-gray-400">Your Style Credits:</span>
            <span className="text-2xl font-bold text-neon-cyan">{userState.styleCredits}</span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <span>🧠</span> AI Core Styles
            </h3>
            <div className="grid gap-3">
              {coreStyles.map(style => {
                const isUnlocked = userState.unlockedCores.includes(style.id)
                const isSelected = userState.selectedCore === style.id
                const canAfford = userState.styleCredits >= style.cost

                return (
                  <div 
                    key={style.id}
                    className={`glass-card p-4 flex items-center gap-4 transition-all ${
                      isSelected ? 'border-neon-cyan' : ''
                    }`}
                  >
                    <div 
                      className="w-12 h-12 rounded-full flex items-center justify-center"
                      style={{ 
                        background: `radial-gradient(circle, ${style.color}40, transparent)`,
                        border: `2px solid ${style.color}`
                      }}
                    >
                      <span className="text-xl">🧠</span>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-white">{style.name}</h4>
                      <p className="text-xs text-gray-400">{style.description}</p>
                    </div>
                    <div>
                      {isUnlocked ? (
                        <button
                          onClick={() => onSelect?.('core', style.id)}
                          className={`px-3 py-1 text-sm rounded-lg transition-all ${
                            isSelected 
                              ? 'bg-neon-cyan text-black' 
                              : 'border border-gray-600 text-gray-300 hover:border-neon-cyan'
                          }`}
                        >
                          {isSelected ? 'Equipped' : 'Select'}
                        </button>
                      ) : (
                        <button
                          onClick={() => onUnlock?.('core', style.id, style.cost)}
                          disabled={!canAfford}
                          className={`px-3 py-1 text-sm rounded-lg transition-all ${
                            canAfford
                              ? 'bg-neon-purple text-white hover:opacity-90'
                              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          {style.cost} 💎
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <span>✨</span> Aura Effects
            </h3>
            <div className="grid gap-3">
              {auraStyles.map(style => {
                const isUnlocked = userState.unlockedAuras.includes(style.id)
                const isSelected = userState.selectedAura === style.id
                const canAfford = userState.styleCredits >= style.cost

                return (
                  <div 
                    key={style.id}
                    className={`glass-card p-4 flex items-center gap-4 transition-all ${
                      isSelected ? 'border-neon-purple' : ''
                    }`}
                  >
                    <div 
                      className="w-12 h-12 rounded-full"
                      style={{ 
                        background: style.color.includes('gradient') ? style.color : `radial-gradient(circle, ${style.color}60, transparent)`,
                        border: style.color === 'transparent' ? '2px dashed #444' : `2px solid ${style.color.includes('gradient') ? '#fff' : style.color}`
                      }}
                    />
                    <div className="flex-1">
                      <h4 className="font-medium text-white">{style.name}</h4>
                      <p className="text-xs text-gray-400">{style.description}</p>
                    </div>
                    <div>
                      {isUnlocked ? (
                        <button
                          onClick={() => onSelect?.('aura', style.id)}
                          className={`px-3 py-1 text-sm rounded-lg transition-all ${
                            isSelected 
                              ? 'bg-neon-purple text-white' 
                              : 'border border-gray-600 text-gray-300 hover:border-neon-purple'
                          }`}
                        >
                          {isSelected ? 'Equipped' : 'Select'}
                        </button>
                      ) : (
                        <button
                          onClick={() => onUnlock?.('aura', style.id, style.cost)}
                          disabled={!canAfford}
                          className={`px-3 py-1 text-sm rounded-lg transition-all ${
                            canAfford
                              ? 'bg-neon-cyan text-black hover:opacity-90'
                              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          {style.cost} 💎
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
