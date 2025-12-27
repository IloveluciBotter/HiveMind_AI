import React, { useState } from 'react'

const faqs = [
  {
    question: 'Is this site the app?',
    answer: 'No. This is the official landing and educational companion site for Train Your AI. The full app lives separately but uses the same AI-training system demonstrated in the interactive demo here. This site helps you understand the concept and try a simplified version.'
  },
  {
    question: 'Do I need crypto to use Train Your AI?',
    answer: 'The on-page demo does not require any crypto or wallet connection. The full app uses $BRAIN tokens for certain advanced modes like Ranked training, but there are free training modes available as well.'
  },
  {
    question: 'Is this financial advice?',
    answer: 'No. Train Your AI is an educational and experimental project. $BRAIN is a utility token within the app ecosystem. Nothing on this site or in the app should be considered financial advice. Only participate with what you can afford to lose.'
  },
  {
    question: 'Do you store my private keys or wallet info?',
    answer: 'No. The full app uses standard wallet connections (like MetaMask) which never share your private keys. Your keys always stay secure in your own wallet. The demo on this site stores data only in your browser\'s local storage.'
  },
  {
    question: 'What kind of questions does the AI use?',
    answer: 'Questions span several categories including logic and reasoning puzzles, basic math and calculations, general knowledge, and AI/tech literacy. The difficulty adapts as you and the AI progress to higher levels.'
  },
  {
    question: 'How does the Hive Mind work?',
    answer: 'The Hive Mind represents a collective AI that everyone trains together. When you score well, you contribute positive XP and strengthen the Hive Mind. When you score poorly, you may introduce noise that destabilizes it. This creates a shared progression system.'
  },
  {
    question: 'Are the cosmetics just visual?',
    answer: 'Yes. Cosmetics like AI core styles and neon auras are purely visual customizations. They don\'t affect gameplay, intelligence scores, or give any competitive advantage. They\'re there to make progress feel satisfying and let you personalize your AI.'
  }
]

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(null)

  return (
    <section id="faq" className="py-16">
      <div className="max-w-3xl mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-4">
          Frequently Asked Questions
        </h2>
        <p className="text-gray-400 text-center mb-8">
          Clear answers to common questions about Train Your AI.
        </p>

        <div className="space-y-3">
          {faqs.map((faq, index) => (
            <div key={index} className="glass-card overflow-hidden">
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
              >
                <span className="font-medium text-white pr-4">{faq.question}</span>
                <span className={`text-neon-cyan transform transition-transform ${openIndex === index ? 'rotate-180' : ''}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </button>
              {openIndex === index && (
                <div className="px-4 pb-4">
                  <p className="text-gray-400 text-sm leading-relaxed">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
