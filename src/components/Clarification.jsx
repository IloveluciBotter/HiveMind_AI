import React from 'react'

export default function Clarification() {
  return (
    <section className="py-16">
      <div className="max-w-4xl mx-auto px-4">
        <div className="glass-card p-8">
          <h2 className="text-2xl font-bold text-white mb-4">
            What this site is (and isn't)
          </h2>
          
          <div className="space-y-4 text-gray-300">
            <p>
              <span className="text-neon-cyan font-semibold">This website is the official landing page for Train Your AI.</span> Here, you can learn what the project is about and try a small interactive demo.
            </p>
            
            <p>
              The full Train Your AI app is a separate, more advanced experience that uses the same training system, more question content, wallet integration, and progression features.
            </p>
            
            <div className="flex items-start gap-3 p-4 bg-dark-bg rounded-lg border border-dark-border">
              <span className="text-xl">💡</span>
              <p className="text-sm">
                The demo on this site mirrors the core training loop but is simpler than the full app. It's designed to give you a taste of how training the AI works.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
