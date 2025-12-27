import React, { useState, useCallback } from 'react'
import { getQuestionsForLevel, getCategoriesFromQuestions } from '../data/questions'
import { getStyleCreditsForScore } from '../data/cosmetics'

export default function InteractiveLab({ 
  globalBrain, 
  userState, 
  onSessionComplete,
  addStyleCredits 
}) {
  const [gameState, setGameState] = useState('idle')
  const [questions, setQuestions] = useState([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState([])
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [demoIntelligence, setDemoIntelligence] = useState(1)
  const [demoXp, setDemoXp] = useState(0)
  const [result, setResult] = useState(null)

  const startQuiz = useCallback(() => {
    const level = Math.max(1, userState.intelligence)
    const quizQuestions = getQuestionsForLevel(level, 10)
    setQuestions(quizQuestions)
    setCurrentQuestionIndex(0)
    setAnswers([])
    setSelectedAnswer(null)
    setResult(null)
    setGameState('playing')
  }, [userState.intelligence])

  const submitAnswer = useCallback(() => {
    if (selectedAnswer === null) return

    const currentQuestion = questions[currentQuestionIndex]
    const isCorrect = selectedAnswer === currentQuestion.correctIndex
    
    const newAnswers = [...answers, { questionId: currentQuestion.id, isCorrect, category: currentQuestion.category }]
    setAnswers(newAnswers)
    setSelectedAnswer(null)

    if (currentQuestionIndex + 1 < questions.length) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
    } else {
      const correct = newAnswers.filter(a => a.isCorrect).length
      const scorePercent = Math.round((correct / newAnswers.length) * 100)
      const categoriesUsed = getCategoriesFromQuestions(questions)
      
      let newIntelligence = demoIntelligence
      let newXp = demoXp
      
      if (scorePercent >= 80) {
        newIntelligence = Math.min(10, demoIntelligence + 1)
        newXp = demoXp + Math.floor((scorePercent - 70) * userState.intelligence)
      } else if (scorePercent < 50 && demoIntelligence > 1) {
        newIntelligence = demoIntelligence - 1
        newXp = Math.max(0, demoXp - 50)
      }
      
      setDemoIntelligence(newIntelligence)
      setDemoXp(newXp)
      
      const sessionResult = {
        correct,
        total: newAnswers.length,
        scorePercent,
        level: userState.intelligence,
        categoriesUsed,
        answers: newAnswers
      }
      
      setResult(sessionResult)
      setGameState('result')
      
      if (onSessionComplete) {
        onSessionComplete(sessionResult)
      }
      
      const credits = getStyleCreditsForScore(scorePercent, userState.intelligence)
      if (credits > 0 && addStyleCredits) {
        addStyleCredits(credits)
      }
    }
  }, [selectedAnswer, questions, currentQuestionIndex, answers, demoIntelligence, demoXp, userState.intelligence, onSessionComplete, addStyleCredits])

  const resetQuiz = useCallback(() => {
    setGameState('idle')
    setQuestions([])
    setCurrentQuestionIndex(0)
    setAnswers([])
    setSelectedAnswer(null)
    setResult(null)
  }, [])

  const currentQuestion = questions[currentQuestionIndex]

  return (
    <section id="lab" className="py-16">
      <div className="max-w-4xl mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-4">
          Interactive Training Lab
        </h2>
        <p className="text-gray-400 text-center mb-8 max-w-2xl mx-auto">
          This is a simplified version of the training loop from the full app. Answer a few questions and see how the demo AI's intelligence score changes.
        </p>

        <div className="glass-card p-6 md:p-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6 pb-6 border-b border-dark-border">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-neon-cyan/20 to-neon-purple/20 flex items-center justify-center animate-pulse-glow">
                <span className="text-3xl">🧠</span>
              </div>
              <div>
                <p className="text-sm text-gray-400">Demo AI Intelligence</p>
                <p className="text-2xl font-bold text-white">Level {demoIntelligence}</p>
              </div>
            </div>
            
            <div className="w-full md:w-48">
              <p className="text-xs text-gray-400 mb-1">XP Progress</p>
              <div className="h-3 bg-dark-bg rounded-full overflow-hidden">
                <div 
                  className="h-full progress-bar transition-all duration-500"
                  style={{ width: `${(demoXp % 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">{demoXp} XP</p>
            </div>
          </div>

          {gameState === 'idle' && (
            <div className="text-center py-8">
              <p className="text-gray-300 mb-6">
                Ready to train the AI? Answer questions to improve its intelligence.
              </p>
              <button
                onClick={startQuiz}
                className="px-8 py-3 bg-gradient-to-r from-neon-cyan to-neon-purple text-black font-semibold rounded-lg hover:opacity-90 transition-all hover:scale-105"
              >
                Start Training Session
              </button>
            </div>
          )}

          {gameState === 'playing' && currentQuestion && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm text-gray-400">
                  Question {currentQuestionIndex + 1} of {questions.length}
                </span>
                <span className="px-2 py-1 text-xs bg-dark-bg rounded-full text-neon-purple capitalize">
                  {currentQuestion.category}
                </span>
              </div>
              
              <div className="mb-2 h-1 bg-dark-bg rounded-full overflow-hidden">
                <div 
                  className="h-full bg-neon-cyan transition-all duration-300"
                  style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
                />
              </div>

              <h3 className="text-xl text-white mb-6 mt-6">
                {currentQuestion.question}
              </h3>

              <div className="space-y-3 mb-6">
                {currentQuestion.options.map((option, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedAnswer(index)}
                    className={`w-full p-4 text-left rounded-lg border transition-all ${
                      selectedAnswer === index
                        ? 'border-neon-cyan bg-neon-cyan/10 text-white'
                        : 'border-dark-border bg-dark-bg text-gray-300 hover:border-gray-600'
                    }`}
                  >
                    <span className="inline-block w-6 h-6 mr-3 text-center rounded-full bg-dark-card text-sm leading-6">
                      {String.fromCharCode(65 + index)}
                    </span>
                    {option}
                  </button>
                ))}
              </div>

              <button
                onClick={submitAnswer}
                disabled={selectedAnswer === null}
                className={`w-full py-3 rounded-lg font-semibold transition-all ${
                  selectedAnswer === null
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-neon-cyan to-neon-purple text-black hover:opacity-90'
                }`}
              >
                Submit Answer
              </button>
            </div>
          )}

          {gameState === 'result' && result && (
            <div className="text-center py-4">
              <div className="mb-6">
                <span className="text-6xl mb-4 block">
                  {result.scorePercent >= 80 ? '🎉' : result.scorePercent >= 50 ? '🤔' : '⚠️'}
                </span>
                <h3 className="text-2xl font-bold text-white mb-2">
                  You scored {result.correct}/{result.total}
                </h3>
                <p className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan to-neon-purple">
                  {result.scorePercent}%
                </p>
              </div>

              <div className={`p-4 rounded-lg mb-6 ${
                result.scorePercent >= 80 
                  ? 'bg-neon-green/10 border border-neon-green/30' 
                  : result.scorePercent >= 50 
                    ? 'bg-yellow-500/10 border border-yellow-500/30'
                    : 'bg-red-500/10 border border-red-500/30'
              }`}>
                {result.scorePercent >= 80 ? (
                  <p className="text-neon-green">
                    Excellent! Your clean data has been accepted. The AI's intelligence increased!
                  </p>
                ) : result.scorePercent >= 50 ? (
                  <p className="text-yellow-500">
                    The AI observed your answers but didn't learn from them. Try again for cleaner data!
                  </p>
                ) : (
                  <p className="text-red-400">
                    Warning: Low score detected. The AI rejected this noisy data to protect its knowledge.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap justify-center gap-4 mb-6">
                <div className="glass-card px-4 py-2">
                  <p className="text-xs text-gray-400">Categories</p>
                  <p className="text-sm text-white capitalize">{result.categoriesUsed.join(', ')}</p>
                </div>
                <div className="glass-card px-4 py-2">
                  <p className="text-xs text-gray-400">Demo AI Level</p>
                  <p className="text-sm text-neon-cyan">{demoIntelligence}</p>
                </div>
              </div>

              <button
                onClick={resetQuiz}
                className="px-8 py-3 bg-gradient-to-r from-neon-cyan to-neon-purple text-black font-semibold rounded-lg hover:opacity-90 transition-all"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
