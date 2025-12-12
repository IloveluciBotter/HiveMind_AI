import React, { useState, useCallback } from 'react'
import { getQuestionsForLevel, getCategoriesFromQuestions } from '../data/questions'
import { getStyleCreditsForScore } from '../data/cosmetics'

export default function InteractiveLab({ 
  globalBrain, 
  userState, 
  onSessionComplete,
  addStyleCredits,
  isFullApp = false
}) {
  const [gameState, setGameState] = useState('idle')
  const [questions, setQuestions] = useState([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState([])
  const [selectedAnswer, setSelectedAnswer] = useState(null)
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
  }, [selectedAnswer, questions, currentQuestionIndex, answers, userState.intelligence, onSessionComplete, addStyleCredits])

  const resetQuiz = useCallback(() => {
    setGameState('idle')
    setQuestions([])
    setCurrentQuestionIndex(0)
    setAnswers([])
    setSelectedAnswer(null)
    setResult(null)
  }, [])

  const currentQuestion = questions[currentQuestionIndex]

  const containerClass = isFullApp 
    ? "" 
    : "py-16"

  return (
    <section id="lab" className={containerClass}>
      <div className={isFullApp ? "" : "max-w-4xl mx-auto px-4"}>
        {!isFullApp && (
          <>
            <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-4">
              Interactive Training Lab
            </h2>
            <p className="text-gray-400 text-center mb-8 max-w-2xl mx-auto">
              Answer questions to train the AI brain. Your accuracy affects the Hive Mind's intelligence level.
            </p>
          </>
        )}

        <div className="glass-card p-6 md:p-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6 pb-6 border-b border-dark-border">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-neon-cyan/20 to-neon-purple/20 flex items-center justify-center animate-pulse-glow">
                <span className="text-3xl">🧠</span>
              </div>
              <div>
                <p className="text-sm text-gray-400">Your Intelligence Level</p>
                <p className="text-2xl font-bold text-white">Level {userState.intelligence}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-xs text-gray-400">Hive Mind Level</p>
                <p className="text-xl font-bold text-neon-cyan">{globalBrain.level}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400">Stability</p>
                <p className="text-xl font-bold text-neon-green">{globalBrain.stability}%</p>
              </div>
            </div>
          </div>

          {gameState === 'idle' && (
            <div className="text-center py-8">
              <div className="mb-6">
                <p className="text-gray-300 text-lg mb-2">
                  Ready to train the AI?
                </p>
                <p className="text-gray-500 text-sm">
                  Answer 10 questions. Score 80%+ to increase the Hive Mind's intelligence.
                </p>
              </div>
              <button
                onClick={startQuiz}
                className="px-8 py-4 bg-gradient-to-r from-neon-cyan to-neon-purple text-black font-semibold rounded-lg hover:opacity-90 transition-all hover:scale-105 text-lg"
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
                <span className="px-3 py-1 text-xs bg-dark-bg rounded-full text-neon-purple capitalize font-medium">
                  {currentQuestion.category}
                </span>
              </div>
              
              <div className="mb-2 h-2 bg-dark-bg rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-neon-cyan to-neon-purple transition-all duration-300"
                  style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
                />
              </div>

              <h3 className="text-xl text-white mb-6 mt-6 leading-relaxed">
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
                        : 'border-dark-border bg-dark-bg text-gray-300 hover:border-gray-600 hover:bg-dark-800'
                    }`}
                  >
                    <span className="inline-flex items-center justify-center w-7 h-7 mr-3 rounded-full bg-dark-card text-sm font-medium">
                      {String.fromCharCode(65 + index)}
                    </span>
                    {option}
                  </button>
                ))}
              </div>

              <button
                onClick={submitAnswer}
                disabled={selectedAnswer === null}
                className={`w-full py-4 rounded-lg font-semibold transition-all text-lg ${
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
                <p className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan to-neon-purple">
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
                  <p className="text-neon-green text-lg">
                    Excellent! Your high-quality data has been accepted. The Hive Mind's intelligence increased!
                  </p>
                ) : result.scorePercent >= 50 ? (
                  <p className="text-yellow-500 text-lg">
                    The AI observed your answers but didn't learn from them. Try again with more focus!
                  </p>
                ) : (
                  <p className="text-red-400 text-lg">
                    Warning: Low score detected. The AI rejected this noisy data to protect its knowledge.
                  </p>
                )}
              </div>

              {result.scorePercent >= 80 && (
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 mb-6">
                  <p className="text-purple-400">
                    +{getStyleCreditsForScore(result.scorePercent, userState.intelligence)} Style Credits earned!
                  </p>
                </div>
              )}

              <div className="flex flex-wrap justify-center gap-4 mb-6">
                <div className="glass-card px-4 py-3">
                  <p className="text-xs text-gray-400">Categories Trained</p>
                  <p className="text-sm text-white capitalize font-medium">{result.categoriesUsed.join(', ')}</p>
                </div>
                <div className="glass-card px-4 py-3">
                  <p className="text-xs text-gray-400">Current Level</p>
                  <p className="text-sm text-neon-cyan font-medium">{userState.intelligence}</p>
                </div>
              </div>

              <button
                onClick={resetQuiz}
                className="px-8 py-4 bg-gradient-to-r from-neon-cyan to-neon-purple text-black font-semibold rounded-lg hover:opacity-90 transition-all text-lg"
              >
                Train Again
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
