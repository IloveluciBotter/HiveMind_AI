import React from 'react'
import { useGameState } from './hooks/useGameState'
import Header from './components/Header'
import Hero from './components/Hero'
import Clarification from './components/Clarification'
import HowItWorks from './components/HowItWorks'
import InteractiveLab from './components/InteractiveLab'
import HiveMindCard from './components/HiveMindCard'
import WhyEducational from './components/WhyEducational'
import TokenSection from './components/TokenSection'
import Cosmetics from './components/Cosmetics'
import FAQ from './components/FAQ'
import Footer from './components/Footer'
import AiChat from './components/AiChat'

export default function App() {
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

  return (
    <div className="min-h-screen">
      <Header />
      
      <main>
        <Hero userState={userState} />
        <Clarification />
        <HowItWorks />
        <InteractiveLab
          globalBrain={globalBrain}
          userState={userState}
          onSessionComplete={handleSessionComplete}
          addStyleCredits={addStyleCredits}
        />
        <HiveMindCard
          globalBrain={globalBrain}
          userState={userState}
          onClearRollback={clearRollbackMessage}
        />
        <WhyEducational />
        <TokenSection />
        <Cosmetics
          userState={userState}
          onUnlock={unlockCosmetic}
          onSelect={selectCosmetic}
        />
        <FAQ />
        <Footer />
      </main>

      <AiChat
        globalBrain={globalBrain}
        userState={userState}
      />
    </div>
  )
}
