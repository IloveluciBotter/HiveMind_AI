import React from 'react'

const benefits = [
  {
    icon: '🎯',
    title: 'Makes AI training concepts tangible',
    description: 'Through quiz-based feedback, you experience how data quality directly affects model performance.'
  },
  {
    icon: '📊',
    title: 'Encourages deliberate practice',
    description: 'Consistent improvement through structured sessions builds lasting knowledge.'
  },
  {
    icon: '🔬',
    title: 'Shows how data quality matters',
    description: 'See firsthand how clean data helps and noisy data harms an AI\'s learning.'
  },
  {
    icon: '🧪',
    title: 'Risk-free experimentation',
    description: 'Experiment with an AI brain without any real-world consequences.'
  }
]

export default function WhyEducational() {
  return (
    <section className="py-16">
      <div className="max-w-6xl mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-4">
          Why Train Your AI is Educational
        </h2>
        <p className="text-gray-400 text-center mb-12 max-w-2xl mx-auto">
          More than just a game—it's a hands-on introduction to how AI learns.
        </p>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {benefits.map((benefit, index) => (
            <div key={index} className="glass-card p-6 flex gap-4">
              <span className="text-3xl">{benefit.icon}</span>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">{benefit.title}</h3>
                <p className="text-gray-400 text-sm">{benefit.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="glass-card p-6 border-l-4 border-neon-cyan bg-gradient-to-r from-neon-cyan/5 to-transparent">
          <p className="text-lg text-white text-center font-medium">
            "You're not just training a virtual AI. <span className="text-neon-cyan">You're training your own thinking.</span>"
          </p>
        </div>
      </div>
    </section>
  )
}
