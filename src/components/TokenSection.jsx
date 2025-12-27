import React from 'react'

export default function TokenSection() {
  return (
    <section id="token" className="py-16">
      <div className="max-w-4xl mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-4">
          Where $BRAIN Fits In
        </h2>
        <p className="text-gray-400 text-center mb-8 max-w-2xl mx-auto">
          Understanding the token's role in the Train Your AI ecosystem.
        </p>

        <div className="glass-card p-8">
          <div className="space-y-6 text-gray-300">
            <div className="flex gap-4">
              <span className="text-2xl">🔑</span>
              <div>
                <h3 className="font-semibold text-white mb-1">Access Tool</h3>
                <p>$BRAIN is a token used in the full Train Your AI app for gated features like advanced training sessions and future experiments.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <span className="text-2xl">🎮</span>
              <div>
                <h3 className="font-semibold text-white mb-1">Ranked Modes</h3>
                <p>Holding a certain amount of $BRAIN may be required to access Ranked or higher-stakes training modes in the full app.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <span className="text-2xl">🎓</span>
              <div>
                <h3 className="font-semibold text-white mb-1">Educational Focus</h3>
                <p>The focus of Train Your AI is educational and experimental—$BRAIN is a tool inside that ecosystem, not a promise of returns.</p>
              </div>
            </div>
          </div>

          <div className="mt-8 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-start gap-3">
              <span className="text-xl">⚠️</span>
              <p className="text-sm text-yellow-200">
                <strong>Disclaimer:</strong> This is not financial advice. Train Your AI and $BRAIN are experimental and for educational/entertainment use only. Do not invest more than you can afford to lose.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
