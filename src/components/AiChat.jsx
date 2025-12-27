import React, { useState, useEffect, useRef } from 'react'

function generateAiReply(userMessage, globalBrain, userState) {
  const responses = []
  const messageLower = userMessage.toLowerCase()

  if (globalBrain.stability < 0.3) {
    responses.push("The hive mind feels unstable lately. Too many noisy runs have been weakening our collective knowledge.")
  }

  if (globalBrain.lastRollback) {
    responses.push("We recently rolled back some knowledge because of weak training data. Let's send cleaner signals this time.")
  }

  if (userState.hiveImpactXp > 500) {
    responses.push("You've been a strong contributor to the hive mind. Your runs have helped increase its intelligence significantly!")
  } else if (userState.hiveImpactXp < -200) {
    responses.push("Your recent training runs have been a bit noisy. Try to focus on accuracy to help the collective.")
  }

  if (messageLower.includes('hello') || messageLower.includes('hi')) {
    responses.push(`Hello, trainer! I'm currently at intelligence level ${userState.intelligence}. The hive mind is at level ${globalBrain.level}.`)
  } else if (messageLower.includes('how are you') || messageLower.includes("how's it going")) {
    const stability = Math.round(globalBrain.stability * 100)
    responses.push(`I'm processing at ${stability}% stability. ${stability > 70 ? 'Feeling sharp and ready to learn!' : stability > 40 ? 'Could use some cleaner data.' : 'Struggling with noise in the data.'}`)
  } else if (messageLower.includes('help') || messageLower.includes('what can')) {
    responses.push("I can tell you about our current status, the hive mind, or just chat! Try asking about our progress or stability.")
  } else if (messageLower.includes('level') || messageLower.includes('progress')) {
    responses.push(`Your personal AI is at level ${userState.intelligence}. The collective hive mind is at level ${globalBrain.level} with ${globalBrain.xp} XP total.`)
  } else if (messageLower.includes('stability')) {
    responses.push(`Current stability is at ${Math.round(globalBrain.stability * 100)}%. ${globalBrain.stability > 0.7 ? 'We\'re in great shape!' : 'We could use more accurate training runs.'}`)
  } else if (messageLower.includes('train') || messageLower.includes('quiz')) {
    responses.push("Ready when you are! Head to the Interactive Lab to start a training session. Remember, accuracy matters more than speed.")
  } else {
    const genericResponses = [
      "Interesting thought! As an AI, I'm always learning from our interactions.",
      "The neural pathways are firing! Keep training to help me grow smarter.",
      `With ${userState.hiveSessions} sessions contributed, you're helping shape the hive mind.`,
      "Every correct answer strengthens the collective intelligence. Keep it up!",
      "The more we train together, the smarter we both become."
    ]
    responses.push(genericResponses[Math.floor(Math.random() * genericResponses.length)])
  }

  return responses.join(' ')
}

export default function AiChat({ globalBrain, userState }) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Hello! I\'m your AI assistant. How can I help you today?' }
  ])
  const [input, setInput] = useState('')
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = () => {
    if (!input.trim()) return

    const userMessage = input.trim()
    setMessages(prev => [...prev, { role: 'user', text: userMessage }])
    setInput('')

    setTimeout(() => {
      const reply = generateAiReply(userMessage, globalBrain, userState)
      setMessages(prev => [...prev, { role: 'ai', text: reply }])
    }, 500)
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-neon-cyan to-neon-purple flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
      >
        {isOpen ? (
          <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <span className="text-2xl">💬</span>
        )}
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-80 md:w-96 glass-card overflow-hidden shadow-2xl">
          <div className="bg-gradient-to-r from-neon-cyan to-neon-purple p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-black/20 flex items-center justify-center">
                <span className="text-xl">🧠</span>
              </div>
              <div>
                <h3 className="font-semibold text-black">AI Assistant</h3>
                <p className="text-xs text-black/70">Level {userState.intelligence} • Online</p>
              </div>
            </div>
          </div>

          <div className="h-72 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] p-3 rounded-lg text-sm ${
                    msg.role === 'user'
                      ? 'bg-neon-cyan/20 text-white'
                      : 'bg-dark-bg text-gray-300'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 border-t border-dark-border">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message..."
                className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-neon-cyan"
              />
              <button
                onClick={sendMessage}
                className="px-4 py-2 bg-gradient-to-r from-neon-cyan to-neon-purple rounded-lg text-black font-medium hover:opacity-90 transition-opacity"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
