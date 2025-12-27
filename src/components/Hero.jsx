import React from 'react'

export default function Hero({ userState }) {
  const scrollToLab = () => {
    document.getElementById('lab')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section id="hero" className="min-h-screen flex items-center pt-20 pb-16">
      <div className="max-w-7xl mx-auto px-4 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
            Train an AI brain by{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan to-neon-purple">
              training your own.
            </span>
          </h1>
          
          <p className="text-lg text-gray-300 mb-8 leading-relaxed">
            Train Your AI is an educational lab where you answer focused quizzes and see how clean data shapes a virtual AI's intelligence.
          </p>

          <div className="flex flex-wrap gap-4 mb-8">
            <button
              onClick={scrollToLab}
              className="px-6 py-3 bg-gradient-to-r from-neon-cyan to-neon-purple text-black font-semibold rounded-lg hover:opacity-90 transition-all hover:scale-105"
            >
              Try the Interactive Lab
            </button>
            <a
              href="https://x.com"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 border border-gray-600 text-white font-semibold rounded-lg hover:border-neon-cyan hover:text-neon-cyan transition-all"
            >
              Follow on X
            </a>
          </div>

          <div className="flex flex-wrap gap-3">
            {['Educational quizzes', 'Adaptive difficulty', 'AI personality', 'Token-gated features'].map(tag => (
              <span
                key={tag}
                className="px-3 py-1 text-sm bg-dark-card border border-dark-border rounded-full text-gray-400"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="flex justify-center">
          <div className="relative">
            <div className="w-64 h-64 md:w-80 md:h-80 rounded-full bg-gradient-to-br from-neon-cyan/20 to-neon-purple/20 flex items-center justify-center animate-pulse-glow">
              <div className="w-48 h-48 md:w-60 md:h-60 rounded-full bg-gradient-to-br from-dark-card to-dark-bg border border-neon-cyan/30 flex flex-col items-center justify-center animate-float">
                <span className="text-6xl md:text-7xl mb-2">🧠</span>
                <div className="text-center">
                  <p className="text-sm text-gray-400">Intelligence Level</p>
                  <p className="text-2xl font-bold text-neon-cyan">
                    {userState.intelligence} → {userState.intelligence + 1}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 glass-card px-4 py-2">
              <p className="text-sm text-gray-300">
                <span className="text-neon-green">●</span> Ready to train
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
