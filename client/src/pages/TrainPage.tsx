import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { CheckCircle, XCircle, Brain, Zap, Clock, Award, AlertTriangle, Coins, TrendingDown, TrendingUp, Plus, ArrowUp } from "lucide-react";
import { StakeModal } from "@/components/StakeModal";
import { RankupConfirmModal } from "@/components/RankupConfirmModal";
import { useLocation } from "wouter";

interface TrainPageProps {
  intelligenceLevel: number;
  onCorrectAnswer: () => void;
  onWrongAnswer: () => void;
}

interface Question {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  complexity: number;
  questionType?: "mcq" | "numeric";
  numericTolerance?: number | null;
  numericUnit?: string | null;
}

interface Track {
  id: string;
  name: string;
  description: string | null;
}

interface AutoReviewResult {
  decision: "approved" | "rejected" | "pending";
  message: string;
  scorePct: number;
  attemptDurationSec: number;
  styleCreditsEarned: number;
  intelligenceGain: number;
}

interface EconomyResult {
  feeHive: number;
  costHive: number;
  refundHive: number;
  stakeAfter: number;
}

interface EconomyConfig {
  baseFeeHive: number;
  passThreshold: number;
  fees: {
    low: number;
    medium: number;
    high: number;
    extreme: number;
  };
}

interface RankupTrial {
  id: string;
  fromLevel: number;
  toLevel: number;
  questionCount: number;
  minAccuracy: number;
  minAvgDifficulty: number;
  startedAt: string;
  status: string;
}

interface RankupResult {
  result: "passed" | "failed";
  correctCount: number;
  totalCount: number;
  accuracy: number;
  avgDifficulty: number;
  newLevel?: number;
  failedReason?: string;
  cooldownUntil?: string;
  slashedHive?: number;
}

export function TrainPage({
  intelligenceLevel,
  onCorrectAnswer,
  onWrongAnswer,
}: TrainPageProps) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [numericAnswer, setNumericAnswer] = useState<string>("");
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [startTime, setStartTime] = useState<number>(0);
  const [userAnswers, setUserAnswers] = useState<(number | string)[]>([]);
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [autoReviewResult, setAutoReviewResult] = useState<AutoReviewResult | null>(null);
  const [economyResult, setEconomyResult] = useState<EconomyResult | null>(null);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [stakeHive, setStakeHive] = useState<number>(0);
  const [economyConfig, setEconomyConfig] = useState<EconomyConfig | null>(null);
  const [stakeError, setStakeError] = useState<string | null>(null);
  const [showStakeModal, setShowStakeModal] = useState(false);
  const [trialMode, setTrialMode] = useState<"normal" | "trial">("normal");
  const [activeTrial, setActiveTrial] = useState<RankupTrial | null>(null);
  const [rankupResult, setRankupResult] = useState<RankupResult | null>(null);
  const [trialRequirements, setTrialRequirements] = useState<{ walletHold: number; vaultStake: number } | null>(null);
  const [showRankupModal, setShowRankupModal] = useState(false);
  const [startingRankup, setStartingRankup] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const loadData = async () => {
      try {
        // Check for active trial first
        const trialResponse = await api.rankup.getActive().catch(() => ({ ok: true, trial: null }));
        
        if (trialResponse.trial) {
          // Trial mode
          setTrialMode("trial");
          setActiveTrial(trialResponse.trial);
          
          // Get requirements for the target level
          const reqResponse = await fetch(`/api/progression/requirements?level=${trialResponse.trial.toLevel}`)
            .then(r => r.json())
            .catch(() => null);
          
          if (reqResponse?.ok) {
            setTrialRequirements(reqResponse.requirements);
          }
          
          // Load trial questions
          try {
            const questionsData = await api.rankup.getQuestions();
            setQuestions(questionsData.questions);
            setQuestionIds(questionsData.questions.map(q => q.id));
            setCurrentIndex(0);
            setScore({ correct: 0, total: 0 });
            setUserAnswers([]);
            setStartTime(Date.now());
          } catch (error) {
            console.error("Failed to load trial questions:", error);
            setStakeError("Failed to load trial questions");
          }
        } else {
          // Normal mode
          setTrialMode("normal");
        }
        
        // Load other data
        const [tracksData, stakeData, economyData] = await Promise.all([
          api.tracks.getAll(),
          api.stake.getStatus().catch(() => null),
          api.economy.getConfig().catch(() => null),
        ]);
        
        setTracks(tracksData);
        if (stakeData) setStakeHive(stakeData.stakeHive);
        if (economyData) setEconomyConfig(economyData);
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, []);

  const refreshStake = async () => {
    try {
      const stakeData = await api.stake.getStatus();
      setStakeHive(stakeData.stakeHive);
    } catch (error: any) {
      // Network errors are expected if server is temporarily unavailable
      // Only log if it's not a network error
      if (error?.name !== "NetworkError" && !error?.message?.includes("fetch")) {
        console.error("Failed to refresh stake:", error);
      }
      // Don't update stakeHive on error - keep previous value
    }
  };

  const currentFee = economyConfig?.fees.medium || 1;

  const loadQuestions = async (trackId: string) => {
    if (trialMode === "trial") {
      // In trial mode, questions are already loaded
      return;
    }
    
    if (stakeHive < currentFee) {
      setStakeError(`Insufficient stake. You need at least ${currentFee} HIVE to start training.`);
      return;
    }
    setStakeError(null);
    setLoading(true);
    setSelectedTrack(trackId);
    setAutoReviewResult(null);
    setEconomyResult(null);
    setSessionComplete(false);
    setQuestionsError(null);
    try {
      const data = await api.tracks.getQuestions(trackId);
      const shuffled = data.sort(() => Math.random() - 0.5).slice(0, 10);
      setQuestions(shuffled);
      setQuestionIds(shuffled.map(q => q.id));
      setCurrentIndex(0);
      setScore({ correct: 0, total: 0 });
      setUserAnswers([]);
      setStartTime(Date.now());
    } catch (error: any) {
      console.error("Failed to load questions:", error);
      const errorMessage = error?.message || "Failed to load questions";
      if (errorMessage.includes("Too many requests") || errorMessage.includes("429")) {
        setQuestionsError("Rate limit exceeded. Please wait a moment and try again.");
      } else {
        setQuestionsError(errorMessage);
      }
      // Reset state on error
      setQuestions([]);
      setQuestionIds([]);
      setCurrentIndex(0);
      setSelectedTrack(null);
    }
    setLoading(false);
  };

  const handleAnswer = (index: number) => {
    if (showResult) return;
    setSelectedAnswer(index);
    setShowResult(true);
    setUserAnswers((prev) => [...prev, index]);
    
    // Note: Correctness is determined server-side (anti-cheat)
    // For MCQ, we show immediate feedback for UX, but server is source of truth
    const question = questions[currentIndex];
    const correct = index === question.correctIndex;
    setIsCorrect(correct);
    
    // Update score for UI display (server will recalculate on submission)
    if (correct) {
      setScore((s) => ({ ...s, correct: s.correct + 1 }));
      onCorrectAnswer();
    } else {
      onWrongAnswer();
    }
    setScore((s) => ({ ...s, total: s.total + 1 }));
  };

  const handleNumericSubmit = () => {
    if (showResult || !numericAnswer.trim()) return;
    
    const trimmedAnswer = numericAnswer.trim();
    setShowResult(true);
    setUserAnswers((prev) => [...prev, trimmedAnswer]);
    
    // For numeric questions, correctness is determined server-side
    // We'll show submitted state, actual correctness shown after server processes
    setIsCorrect(null);
    setScore((s) => ({ ...s, total: s.total + 1 }));
  };

  const handleNumericKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && numericAnswer.trim() && !showResult) {
      handleNumericSubmit();
    }
  };

  const submitTrainingAttempt = async () => {
    if (trialMode === "trial") {
      // Submit trial completion
      if (!activeTrial || questionIds.length === 0 || userAnswers.length !== questionIds.length) {
        return;
      }

      setSubmitting(true);
      try {
        // Convert answers to the format expected by server
        const answers = userAnswers.map((answer, idx) => {
          const question = questions[idx];
          if (question.questionType === "numeric") {
            return typeof answer === "string" ? answer : String(answer);
          }
          return typeof answer === "number" ? answer : parseInt(String(answer), 10);
        });

        const result = await api.rankup.complete({
          trialId: activeTrial.id,
          questionIds,
          answers: answers as (number | string)[],
        });

        setRankupResult(result);
        setScore({
          correct: result.correctCount,
          total: result.totalCount,
        });
      } catch (error) {
        console.error("Failed to complete rank-up trial:", error);
        setStakeError("Failed to complete trial");
      }
      setSubmitting(false);
      return;
    }

    // Normal training submission
    if (!selectedTrack || questions.length === 0) return;
    
    setSubmitting(true);
    try {
      // Convert answers to the format expected by server
      // For MCQ: keep as numbers (indices), for numeric: keep as strings
      // ANTI-CHEAT: Do NOT send correctAnswers - server calculates correctness
      const answers = userAnswers.map((answer, idx) => {
        const question = questions[idx];
        if (question.questionType === "numeric") {
          return typeof answer === "string" ? answer : String(answer);
        }
        return typeof answer === "number" ? answer : parseInt(String(answer), 10);
      });

      const result = await api.train.submit({
        trackId: selectedTrack,
        difficulty: "medium",
        content: JSON.stringify({ answers: userAnswers }),
        answers: answers as (number | string)[],
        questionIds: questionIds,
        startTime,
      });
      
      // Update score based on server-calculated results (anti-cheat)
      if (result.score) {
        setScore({
          correct: result.score.correctCount,
          total: result.score.total,
        });
      }
      
      setAutoReviewResult(result.autoReview);
      if (result.economy) {
        setEconomyResult(result.economy);
        setStakeHive(result.economy.stakeAfter);
      }
    } catch (error) {
      console.error("Failed to submit training attempt:", error);
    }
    setSubmitting(false);
  };

  const nextQuestion = async () => {
    if (submitting) return;
    
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setSelectedAnswer(null);
      setNumericAnswer("");
      setShowResult(false);
      setIsCorrect(null);
    } else {
      setSessionComplete(true);
      await submitTrainingAttempt();
    }
  };

  const resetToTracks = () => {
    setSelectedTrack(null);
    setQuestions([]);
    setAutoReviewResult(null);
    setEconomyResult(null);
    setRankupResult(null);
    setUserAnswers([]);
    setSessionComplete(false);
    setStakeError(null);
    setTrialMode("normal");
    setActiveTrial(null);
    setTrialRequirements(null);
    refreshStake();
    
    // Reload to check for new trial
    window.location.reload();
  };

  const currentQuestion = questions[currentIndex];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  // Show error if questions failed to load
  if (questionsError && selectedTrack) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2 text-red-400">Failed to Load Questions</h2>
          <p className="text-gray-300 mb-4">{questionsError}</p>
          <button
            onClick={() => {
              setQuestionsError(null);
              setSelectedTrack(null);
            }}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (trialMode === "trial" && questions.length > 0) {
    // Trial mode - questions are loaded, show them below
  } else if (!selectedTrack && trialMode === "normal") {
    const hasInsufficientStake = stakeHive < currentFee;
    
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="inline-flex items-center gap-2 bg-purple-900/30 px-4 py-2 rounded-full">
              <Brain className="w-5 h-5 text-purple-400" />
              <span className="text-purple-400 font-medium">
                AI Level: {intelligenceLevel}
              </span>
            </div>
            <button
              onClick={() => setShowStakeModal(true)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full transition-colors ${
                hasInsufficientStake 
                  ? "bg-red-900/30 hover:bg-red-900/50" 
                  : "bg-green-900/30 hover:bg-green-900/50"
              }`}
            >
              <Coins className={`w-5 h-5 ${hasInsufficientStake ? "text-red-400" : "text-green-400"}`} />
              <span className={`font-medium ${hasInsufficientStake ? "text-red-400" : "text-green-400"}`}>
                {stakeHive.toFixed(2)} HIVE
              </span>
              <Plus className="w-4 h-4 text-gray-400" />
            </button>
          </div>
          <h1 className="text-3xl font-bold mb-2">Train Your AI</h1>
          <p className="text-gray-400">
            Answer questions to make HiveMind smarter!
          </p>
          {economyConfig && (
            <p className="text-gray-500 text-sm mt-2">
              Training fee: {currentFee} HIVE (varies by difficulty)
            </p>
          )}
        </div>

        {stakeError && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 mb-6 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-red-300">{stakeError}</p>
          </div>
        )}

        {hasInsufficientStake && !stakeError && (
          <div className="bg-yellow-900/30 border border-yellow-500/50 rounded-lg p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
              <p className="text-yellow-300">
                You need at least {currentFee} HIVE staked to train. Deposit more HIVE to continue.
              </p>
            </div>
            <button
              onClick={() => setShowStakeModal(true)}
              className="bg-yellow-600 hover:bg-yellow-500 text-black font-medium px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Stake HIVE
            </button>
          </div>
        )}

        {/* Rank-Up Trial Button */}
        <div className="mb-6">
          <button
            onClick={async () => {
              try {
                const targetLevel = intelligenceLevel + 1;
                const reqResponse = await api.progression.getRequirements(targetLevel);
                if (reqResponse?.ok) {
                  setTrialRequirements(reqResponse.requirements);
                  setShowRankupModal(true);
                }
              } catch (error) {
                console.error("Failed to fetch requirements:", error);
                setStakeError("Failed to load rank-up requirements");
              }
            }}
            disabled={hasInsufficientStake}
            className={`w-full rounded-xl p-6 text-left transition-colors border ${
              hasInsufficientStake
                ? "bg-gray-800/50 border-gray-700 opacity-60 cursor-not-allowed"
                : "bg-gradient-to-r from-purple-900/50 to-blue-900/50 hover:from-purple-900/70 hover:to-blue-900/70 border-purple-500/50 hover:border-purple-500"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-purple-600/30 rounded-lg p-3">
                  <ArrowUp className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-1">Rank-Up Trial</h3>
                  <p className="text-gray-400 text-sm">
                    Advance to Level {intelligenceLevel + 1} • Requires stake escrow
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-400 mb-1">Next Level</div>
                <div className="text-2xl font-bold text-purple-400">L{intelligenceLevel + 1}</div>
              </div>
            </div>
          </button>
        </div>

        {tracks.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <p>No training tracks available yet.</p>
            <p className="text-sm mt-2">Check back later or ask an admin to add tracks.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {tracks.map((track) => (
              <button
                key={track.id}
                onClick={() => loadQuestions(track.id)}
                disabled={hasInsufficientStake}
                className={`rounded-xl p-6 text-left transition-colors border ${
                  hasInsufficientStake 
                    ? "bg-gray-800/50 border-gray-700 opacity-60 cursor-not-allowed" 
                    : "bg-gray-800 hover:bg-gray-700 border-gray-700 hover:border-purple-500"
                }`}
              >
                <h3 className="text-xl font-semibold mb-2">{track.name}</h3>
                <p className="text-gray-400 text-sm">
                  {track.description || "Train the AI in this topic"}
                </p>
              </button>
            ))}
          </div>
        )}
        
        <StakeModal
          isOpen={showStakeModal}
          onClose={() => setShowStakeModal(false)}
          currentStake={stakeHive}
          requiredFee={currentFee}
          onStakeUpdated={(newStake) => setStakeHive(newStake)}
        />

        <RankupConfirmModal
          isOpen={showRankupModal}
          onClose={() => {
            setShowRankupModal(false);
            setTrialRequirements(null);
          }}
          onConfirm={async () => {
            if (!trialRequirements) return;
            
            setStartingRankup(true);
            try {
              const response = await api.rankup.start({
                currentLevel: intelligenceLevel,
                targetLevel: intelligenceLevel + 1,
              });
              
              if (response.ok) {
                // Reload page to enter trial mode
                window.location.reload();
              }
            } catch (error: any) {
              console.error("Failed to start rank-up trial:", error);
              setStakeError(error.message || "Failed to start rank-up trial");
              setShowRankupModal(false);
            } finally {
              setStartingRankup(false);
            }
          }}
          currentLevel={intelligenceLevel}
          targetLevel={intelligenceLevel + 1}
          trialStakeHive={trialRequirements?.vaultStake || 0}
          loading={startingRankup}
        />
      </div>
    );
  }

  if (sessionComplete || (!currentQuestion && questions.length > 0)) {
    const scorePctDisplay = autoReviewResult 
      ? Math.round(autoReviewResult.scorePct * 100) 
      : (score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0);
    
    const getDecisionIcon = () => {
      if (!autoReviewResult) return <Zap className="w-16 h-16 text-yellow-400 mx-auto mb-4" />;
      switch (autoReviewResult.decision) {
        case "approved":
          return <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />;
        case "rejected":
          return <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />;
        default:
          return <Clock className="w-16 h-16 text-yellow-400 mx-auto mb-4" />;
      }
    };

    const getDecisionColor = () => {
      if (!autoReviewResult) return "text-purple-400";
      switch (autoReviewResult.decision) {
        case "approved": return "text-green-400";
        case "rejected": return "text-red-400";
        default: return "text-yellow-400";
      }
    };

    return (
      <div className="max-w-2xl mx-auto p-6 text-center">
        <div className="bg-gray-800 rounded-xl p-8">
          {submitting ? (
            <>
              <div className="animate-spin w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-gray-400">Submitting your training attempt...</p>
            </>
          ) : (
            <>
              {/* Trial Results */}
              {trialMode === "trial" && rankupResult ? (
                <>
                  {rankupResult.result === "passed" ? (
                    <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-6 mb-6">
                      <div className="flex items-center justify-center gap-2 mb-4">
                        <CheckCircle className="w-8 h-8 text-green-400" />
                        <h2 className="text-2xl font-bold text-green-400">TRIAL PASSED!</h2>
                      </div>
                      
                      <div className="text-center mb-4">
                        <p className="text-gray-300 mb-2">
                          You got {rankupResult.correctCount} out of {rankupResult.totalCount} correct
                        </p>
                        <div className="text-4xl font-bold text-green-400 mb-2">
                          {(rankupResult.accuracy * 100).toFixed(1)}%
                        </div>
                        <p className="text-gray-400 text-sm">
                          Average Difficulty: {rankupResult.avgDifficulty.toFixed(2)}
                        </p>
                      </div>
                      
                      {rankupResult.newLevel && (
                        <div className="bg-gray-800/50 rounded-lg p-4 mb-4 text-center">
                          <div className="text-gray-400 text-sm mb-1">New Level</div>
                          <div className="text-3xl font-bold text-purple-400">
                            Level {rankupResult.newLevel}
                          </div>
                          <div className="text-gray-500 text-xs mt-2">
                            Vault stake locked for 4 cycles
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-6 mb-6">
                      <div className="flex items-center justify-center gap-2 mb-4">
                        <XCircle className="w-8 h-8 text-red-400" />
                        <h2 className="text-2xl font-bold text-red-400">TRIAL FAILED</h2>
                      </div>
                      
                      <div className="text-center mb-4">
                        <p className="text-gray-300 mb-2">
                          You got {rankupResult.correctCount} out of {rankupResult.totalCount} correct
                        </p>
                        <div className="text-4xl font-bold text-red-400 mb-2">
                          {(rankupResult.accuracy * 100).toFixed(1)}%
                        </div>
                        <p className="text-gray-400 text-sm mb-2">
                          Average Difficulty: {rankupResult.avgDifficulty.toFixed(2)}
                        </p>
                        {rankupResult.failedReason && (
                          <p className="text-red-300 text-sm">{rankupResult.failedReason}</p>
                        )}
                      </div>
                      
                      {rankupResult.cooldownUntil && (
                        <div className="bg-gray-800/50 rounded-lg p-4 mb-4 text-center">
                          <div className="text-gray-400 text-sm mb-1">Cooldown Until</div>
                          <div className="text-lg font-medium text-orange-400">
                            {new Date(rankupResult.cooldownUntil).toLocaleString()}
                          </div>
                        </div>
                      )}
                      
                      {rankupResult.slashedHive !== undefined && rankupResult.slashedHive > 0 && (
                        <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                          <div className="text-gray-400 text-sm mb-1">Slashed Amount</div>
                          <div className="text-lg font-medium text-red-400">
                            {rankupResult.slashedHive.toFixed(4)} HIVE
                          </div>
                          <div className="text-gray-500 text-xs mt-1">(Recorded, transfer pending)</div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Normal Training Results */}
                  {getDecisionIcon()}
                  <h2 className="text-2xl font-bold mb-2">
                    {autoReviewResult?.decision === "approved" && "Approved!"}
                    {autoReviewResult?.decision === "rejected" && "Rejected"}
                    {autoReviewResult?.decision === "pending" && "Pending Review"}
                    {!autoReviewResult && "Session Complete!"}
                  </h2>
                  
                  {autoReviewResult && (
                    <div className={`mb-4 p-3 rounded-lg ${
                      autoReviewResult.decision === "approved" ? "bg-green-900/30" :
                      autoReviewResult.decision === "rejected" ? "bg-red-900/30" :
                      "bg-yellow-900/30"
                    }`}>
                      <p className="text-sm">{autoReviewResult.message}</p>
                    </div>
                  )}

                  <p className="text-gray-400 mb-2">
                    You got {score.correct} out of {score.total} correct
                  </p>
                  
                  <div className={`text-5xl font-bold mb-4 ${getDecisionColor()}`}>
                    {scorePctDisplay}%
                  </div>
                </>
              )}

              {autoReviewResult && (
                <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                  <div className="bg-gray-700/50 p-3 rounded-lg">
                    <Clock className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                    <div className="text-gray-300">{autoReviewResult.attemptDurationSec}s</div>
                    <div className="text-gray-500 text-xs">Duration</div>
                  </div>
                  <div className="bg-gray-700/50 p-3 rounded-lg">
                    <Award className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
                    <div className="text-gray-300">+{autoReviewResult.styleCreditsEarned}</div>
                    <div className="text-gray-500 text-xs">Style Credits</div>
                  </div>
                </div>
              )}

              {economyResult && (
                <div className="bg-gray-700/30 rounded-lg p-4 mb-6">
                  <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center justify-center gap-2">
                    <Coins className="w-4 h-4" />
                    Stake Economy
                  </h3>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="text-center">
                      <div className="text-gray-400 text-xs mb-1">Fee Reserved</div>
                      <div className="text-orange-400 font-medium">{economyResult.feeHive.toFixed(4)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-400 text-xs mb-1">Cost</div>
                      <div className={`font-medium flex items-center justify-center gap-1 ${
                        economyResult.costHive > 0 ? "text-red-400" : "text-green-400"
                      }`}>
                        {economyResult.costHive > 0 ? (
                          <TrendingDown className="w-3 h-3" />
                        ) : (
                          <TrendingUp className="w-3 h-3" />
                        )}
                        {economyResult.costHive.toFixed(4)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-400 text-xs mb-1">Refund</div>
                      <div className="text-green-400 font-medium">+{economyResult.refundHive.toFixed(4)}</div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-600/50 text-center">
                    <div className="text-gray-400 text-xs mb-1">New Balance</div>
                    <div className="text-lg font-semibold text-white">{economyResult.stakeAfter.toFixed(4)} HIVE</div>
                  </div>
                </div>
              )}

              {trialMode === "normal" && autoReviewResult?.decision === "approved" && autoReviewResult.intelligenceGain > 0 && (
                <div className="flex items-center justify-center gap-2 mb-4 text-green-400">
                  <Brain className="w-5 h-5" />
                  <span>+{autoReviewResult.intelligenceGain} Intelligence</span>
                </div>
              )}

              <button
                onClick={resetToTracks}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors"
              >
                {trialMode === "trial" ? "Back to Home" : "Back to Tracks"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Trial Mode Banner */}
      {trialMode === "trial" && activeTrial && (
        <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 border border-purple-500/50 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              <h2 className="text-lg font-bold text-white">
                RANK-UP TRIAL (Level {activeTrial.fromLevel} → {activeTrial.toLevel})
              </h2>
            </div>
          </div>
          
          {trialRequirements && (
            <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
              <div className="bg-gray-800/50 rounded p-2">
                <div className="text-gray-400 text-xs mb-1">Required Wallet Hold</div>
                <div className="text-white font-medium">{trialRequirements.walletHold.toFixed(2)} HIVE</div>
              </div>
              <div className="bg-gray-800/50 rounded p-2">
                <div className="text-gray-400 text-xs mb-1">Required Vault Stake</div>
                <div className="text-white font-medium">{trialRequirements.vaultStake.toFixed(2)} HIVE</div>
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="bg-gray-800/50 rounded p-2">
              <div className="text-gray-400 mb-1">Questions</div>
              <div className="text-white font-medium">{activeTrial.questionCount}</div>
            </div>
            <div className="bg-gray-800/50 rounded p-2">
              <div className="text-gray-400 mb-1">Min Accuracy</div>
              <div className="text-white font-medium">{(activeTrial.minAccuracy * 100).toFixed(0)}%</div>
            </div>
            <div className="bg-gray-800/50 rounded p-2">
              <div className="text-gray-400 mb-1">Min Difficulty</div>
              <div className="text-white font-medium">{activeTrial.minAvgDifficulty.toFixed(1)}</div>
            </div>
          </div>
        </div>
      )}
      
      {!currentQuestion ? (
        <div className="max-w-4xl mx-auto p-6">
          <div className="bg-yellow-900/30 border border-yellow-800 rounded-xl p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2 text-yellow-400">No Question Available</h2>
            <p className="text-gray-300 mb-4">Unable to load the current question. Please try again.</p>
            <button
              onClick={() => {
                setSelectedTrack(null);
                setQuestions([]);
                setCurrentIndex(0);
              }}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-6">
            <span className="text-sm text-gray-400">
              Question {currentIndex + 1} of {questions.length}
            </span>
            <span className="text-sm text-gray-400">
              Score: {score.correct}/{score.total}
            </span>
          </div>

          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <p className="text-lg font-medium">{currentQuestion.text}</p>
          </div>

          {currentQuestion.questionType === "numeric" ? (
        <div className="space-y-4">
          <div>
            <input
              type="text"
              value={numericAnswer}
              onChange={(e) => setNumericAnswer(e.target.value)}
              onKeyPress={handleNumericKeyPress}
              disabled={showResult}
              placeholder="e.g. 0.75 or 3/4"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <div className="mt-2 space-y-1">
              {currentQuestion.numericTolerance !== null && currentQuestion.numericTolerance !== undefined && (
                <p className="text-xs text-gray-400">
                  Accepted within ±{currentQuestion.numericTolerance}
                </p>
              )}
              {currentQuestion.numericUnit && (
                <p className="text-xs text-gray-400">
                  Unit: {currentQuestion.numericUnit}
                </p>
              )}
            </div>
          </div>
          
          {!showResult && (
            <button
              onClick={handleNumericSubmit}
              disabled={!numericAnswer.trim()}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
            >
              Submit Answer
            </button>
          )}

          {showResult && (
            <div className="p-4 rounded-lg border bg-gray-800/50 border-gray-600">
              <div className="flex items-center gap-2">
                <span className="text-gray-300">
                  Answer submitted: {numericAnswer}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Correctness will be determined when you finish the session.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {currentQuestion.options.map((option, index) => {
            const isSelected = selectedAnswer === index;
            const isCorrectAnswer = index === currentQuestion.correctIndex;
            let buttonClass = "bg-gray-800 hover:bg-gray-700 border-gray-700";

            if (showResult) {
              if (isCorrectAnswer) {
                buttonClass = "bg-green-900/50 border-green-500";
              } else if (isSelected && !isCorrectAnswer) {
                buttonClass = "bg-red-900/50 border-red-500";
              }
            } else if (isSelected) {
              buttonClass = "bg-purple-900/50 border-purple-500";
            }

            return (
              <button
                key={index}
                onClick={() => handleAnswer(index)}
                disabled={showResult}
                className={`w-full p-4 rounded-lg text-left transition-colors border ${buttonClass} flex items-center justify-between`}
              >
                <span>{option}</span>
                {showResult && isCorrectAnswer && (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                )}
                {showResult && isSelected && !isCorrectAnswer && (
                  <XCircle className="w-5 h-5 text-red-400" />
                )}
              </button>
            );
          })}
        </div>
      )}

          {showResult && (
            <button
              onClick={nextQuestion}
              className="w-full mt-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors"
            >
              {currentIndex < questions.length - 1 ? "Next Question" : "Finish"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
