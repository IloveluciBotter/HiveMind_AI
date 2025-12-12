import React, { useState } from 'react'
import { useGameState } from './hooks/useGameState'
import InteractiveLab from './components/InteractiveLab'
import HiveMindCard from './components/HiveMindCard'
import Cosmetics from './components/Cosmetics'
import AiChat from './components/AiChat'

export default function App() {
  const [activeTab, setActiveTab] = useState('train')
  
  const {
    globalBrain,
    userState,
    updateGlobalBrain,
    updateUserStats,
    addStyleCredits,
    unlockCosmetic,
    selectCosmetic,
    clearRollbackMessage,
    logEvent
  } = useGameState()

  const handleSessionComplete = (sessionResult) => {
    logEvent('session_end', {
      score: sessionResult.scorePercent,
      level: sessionResult.level,
      categories: sessionResult.categoriesUsed
    })

    updateUserStats(sessionResult)

    updateGlobalBrain({
      scorePercent: sessionResult.scorePercent,
      level: sessionResult.level,
      categoriesUsed: sessionResult.categoriesUsed
    })
  }

  const tabs = [
    { id: 'train', label: 'Train', icon: '🧠' },
    { id: 'hivemind', label: 'Hive Mind', icon: '🌐' },
    { id: 'cosmetics', label: 'Style Lab', icon: '✨' }
  ]

  return (
    <div className="min-h-screen bg-dark-950 flex flex-col">
      <header className="bg-dark-900/90 backdrop-blur-md border-b border-dark-800 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🧠</span>
              <h1 className="text-xl font-bold text-white">Train Your AI</h1>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-dark-800 rounded-lg px-3 py-1.5">
                <span className="text-cyan-400 text-sm">Level</span>
                <span className="text-white font-bold">{userState.intelligence}</span>
              </div>
              <div className="flex items-center gap-2 bg-dark-800 rounded-lg px-3 py-1.5">
                <span className="text-purple-400 text-sm">Credits</span>
                <span className="text-white font-bold">{userState.styleCredits}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-dark-900 border-b border-dark-800">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex gap-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 font-medium transition-all flex items-center gap-2 border-b-2 ${
                  activeTab === tab.id
                    ? 'text-cyan-400 border-cyan-400 bg-dark-800/50'
                    : 'text-gray-400 border-transparent hover:text-white hover:bg-dark-800/30'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="flex-1">
        {activeTab === 'train' && (
          <div className="py-8">
            <div className="max-w-4xl mx-auto px-4">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-white mb-2">Training Lab</h2>
                <p className="text-gray-400">Answer questions to train the AI brain. Your accuracy affects the Hive Mind's intelligence.</p>
              </div>
              
              <InteractiveLab
                globalBrain={globalBrain}
                userState={userState}
                onSessionComplete={handleSessionComplete}
                addStyleCredits={addStyleCredits}
                isFullApp={true}
              />

              <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-dark-800/50 rounded-xl p-4 border border-dark-700">
                  <div className="text-cyan-400 text-sm mb-1">Your Sessions</div>
                  <div className="text-2xl font-bold text-white">{userState.totalSessions}</div>
                </div>
                <div className="bg-dark-800/50 rounded-xl p-4 border border-dark-700">
                  <div className="text-green-400 text-sm mb-1">Correct Answers</div>
                  <div className="text-2xl font-bold text-white">{userState.totalCorrect}</div>
                </div>
                <div className="bg-dark-800/50 rounded-xl p-4 border border-dark-700">
                  <div className="text-purple-400 text-sm mb-1">Hive Impact</div>
                  <div className="text-2xl font-bold text-white">{userState.hiveImpactXp >= 0 ? '+' : ''}{userState.hiveImpactXp} XP</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'hivemind' && (
          <div className="py-8">
            <div className="max-w-4xl mx-auto px-4">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-white mb-2">The Hive Mind</h2>
                <p className="text-gray-400">The collective intelligence of all trainers. Your contributions shape its growth.</p>
              </div>
              
              <HiveMindCard
                globalBrain={globalBrain}
                userState={userState}
                onClearRollback={clearRollbackMessage}
                isFullApp={true}
              />

              <div className="mt-8 bg-dark-800/50 rounded-xl p-6 border border-dark-700">
                <h3 className="text-xl font-bold text-white mb-4">How Training Affects the Hive Mind</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-3 h-3 rounded-full bg-green-500 mt-1.5"></div>
                    <div>
                      <div className="text-white font-medium">80%+ Score: Training Accepted</div>
                      <div className="text-gray-400 text-sm">High-quality data boosts intelligence and XP</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-3 h-3 rounded-full bg-yellow-500 mt-1.5"></div>
                    <div>
                      <div className="text-white font-medium">50-79% Score: Observed</div>
                      <div className="text-gray-400 text-sm">Moderate data noted but doesn't affect intelligence</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-3 h-3 rounded-full bg-red-500 mt-1.5"></div>
                    <div>
                      <div className="text-white font-medium">Below 50%: Potentially Harmful</div>
                      <div className="text-gray-400 text-sm">Poor data may trigger a rollback to protect the AI</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'cosmetics' && (
          <div className="py-8">
            <div className="max-w-4xl mx-auto px-4">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-white mb-2">Style Lab</h2>
                <p className="text-gray-400">Unlock and equip visual styles with Style Credits earned from training.</p>
              </div>
              
              <Cosmetics
                userState={userState}
                onUnlock={unlockCosmetic}
                onSelect={selectCosmetic}
                isFullApp={true}
              />
            </div>
          </div>
        )}
      </main>

      <footer className="bg-dark-900 border-t border-dark-800 py-4">
        <div className="max-w-6xl mx-auto px-4 text-center text-gray-500 text-sm">
          Train Your AI - An educational experience about how data quality affects machine learning
        </div>
      </footer>

      <AiChat
        globalBrain={globalBrain}
        userState={userState}
      />
    </div>
  )
}
