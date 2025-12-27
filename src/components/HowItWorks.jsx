import React from 'react'

const steps = [
  {
    number: 1,
    icon: '📝',
    title: 'Answer focused quizzes',
    description: 'You get a short set of questions around logic, general knowledge, and tech literacy.'
  },
  {
    number: 2,
    icon: '🧠',
    title: 'Train the virtual AI',
    description: 'High scores are treated as clean training data. The AI\'s intelligence score increases.'
  },
  {
    number: 3,
    icon: '🛡️',
    title: 'Protect the AI from bad data',
    description: 'If you score poorly, the AI may roll back some intelligence to avoid learning from noise.'
  },
  {
    number: 4,
    icon: '📈',
    title: 'Climb difficulty levels',
    description: 'As you and the AI improve, the questions get more challenging.'
  }
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-16">
      <div className="max-w-6xl mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-4">
          How It Works
        </h2>
        <p className="text-gray-400 text-center mb-12 max-w-2xl mx-auto">
          The training loop is simple but powerful. Your answers become the AI's learning material.
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map(step => (
            <div
              key={step.number}
              className="glass-card p-6 hover:border-neon-cyan/50 transition-colors group"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-neon-cyan to-neon-purple flex items-center justify-center text-black font-bold">
                  {step.number}
                </div>
                <span className="text-3xl">{step.icon}</span>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-neon-cyan transition-colors">
                {step.title}
              </h3>
              <p className="text-gray-400 text-sm">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
