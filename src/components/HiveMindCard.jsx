import React from 'react'

export default function HiveMindCard({ globalBrain, userState, onClearRollback, isFullApp = false }) {
  const xpProgress = (globalBrain.xp % 1000) / 10
  const stabilityPercent = Math.round(globalBrain.stability * 100)
  
  const getStabilityColor = () => {
    if (globalBrain.stability > 0.7) return 'text-neon-green'
    if (globalBrain.stability > 0.4) return 'text-yellow-500'
    return 'text-red-500'
  }

  const getCategoryBar = (strength) => {
    const percent = Math.round(strength * 100)
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-dark-bg rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-neon-cyan to-neon-purple"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="text-xs text-gray-400 w-10">{percent}%</span>
      </div>
    )
  }

  const containerClass = isFullApp ? "" : "py-16"
  const wrapperClass = isFullApp ? "" : "max-w-6xl mx-auto px-4"

  return (
    <section className={containerClass}>
      <div className={wrapperClass}>
        {!isFullApp && (
          <>
            <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-4">
              The Hive Mind
            </h2>
            <p className="text-gray-400 text-center mb-8 max-w-2xl mx-auto">
              Everyone who trains the AI contributes to a shared intelligence. See the collective progress.
            </p>
          </>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <div className="glass-card p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-neon-purple/30 to-neon-cyan/30 flex items-center justify-center animate-pulse-glow">
                <span className="text-4xl">🌐</span>
              </div>
              <div>
                <p className="text-sm text-gray-400">Hive Mind Intelligence</p>
                <p className="text-3xl font-bold text-white">Level {globalBrain.level}</p>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">XP Progress</span>
                <span className="text-gray-300">{globalBrain.xp % 1000} / 1000</span>
              </div>
              <div className="h-3 bg-dark-bg rounded-full overflow-hidden">
                <div 
                  className="h-full progress-bar transition-all duration-500"
                  style={{ width: `${xpProgress}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between py-3 border-t border-dark-border">
              <span className="text-gray-400">Stability</span>
              <span className={`font-semibold ${getStabilityColor()}`}>
                {stabilityPercent}%
              </span>
            </div>

            <div className="flex items-center justify-between py-3 border-t border-dark-border">
              <span className="text-gray-400">Total Rollbacks</span>
              <span className="text-white font-semibold">{globalBrain.rollbacks}</span>
            </div>

            {globalBrain.lastRollback && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-red-400">
                    <span className="font-semibold">Last rollback:</span> {globalBrain.lastRollback}
                  </p>
                  {onClearRollback && (
                    <button 
                      onClick={onClearRollback}
                      className="text-red-400 hover:text-red-300 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Category Strengths</h3>
            
            <div className="space-y-4 mb-6">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-300">Logic</span>
                  <span className="text-xs text-gray-500">{globalBrain.categories.logic.samples} samples</span>
                </div>
                {getCategoryBar(globalBrain.categories.logic.strength)}
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-300">Math</span>
                  <span className="text-xs text-gray-500">{globalBrain.categories.math.samples} samples</span>
                </div>
                {getCategoryBar(globalBrain.categories.math.strength)}
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-300">General</span>
                  <span className="text-xs text-gray-500">{globalBrain.categories.general.samples} samples</span>
                </div>
                {getCategoryBar(globalBrain.categories.general.strength)}
              </div>
            </div>

            <div className="pt-4 border-t border-dark-border">
              <h4 className="text-sm font-semibold text-gray-400 mb-3">Your Contribution</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-dark-bg rounded-lg">
                  <p className="text-2xl font-bold text-white">{userState.hiveSessions}</p>
                  <p className="text-xs text-gray-400">Sessions</p>
                </div>
                <div className="text-center p-3 bg-dark-bg rounded-lg">
                  <p className={`text-2xl font-bold ${userState.hiveImpactXp >= 0 ? 'text-neon-green' : 'text-red-400'}`}>
                    {userState.hiveImpactXp >= 0 ? '+' : ''}{userState.hiveImpactXp}
                  </p>
                  <p className="text-xs text-gray-400">Net XP Impact</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
