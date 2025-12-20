import { storage } from "./storage";
import { logger } from "./middleware/logger";

interface SeedQuestion {
  text: string;
  options: string[];
  correctIndex: number;
  complexity: number;
}

interface SeedTrack {
  name: string;
  description: string;
  questions: SeedQuestion[];
}

const DEFAULT_TRACKS: SeedTrack[] = [
  {
    name: "Core Logic",
    description: "Fundamental logical reasoning and critical thinking",
    questions: [
      {
        text: "If all A are B, and all B are C, what can we conclude?",
        options: ["All A are C", "All C are A", "Some A are not C", "No conclusion possible"],
        correctIndex: 0,
        complexity: 1,
      },
      {
        text: "What is the contrapositive of 'If it rains, then the ground is wet'?",
        options: [
          "If the ground is wet, then it rains",
          "If it doesn't rain, the ground is not wet",
          "If the ground is not wet, then it didn't rain",
          "Rain causes wet ground",
        ],
        correctIndex: 2,
        complexity: 2,
      },
      {
        text: "Which logical fallacy involves attacking the person instead of their argument?",
        options: ["Straw man", "Ad hominem", "False dichotomy", "Slippery slope"],
        correctIndex: 1,
        complexity: 2,
      },
      {
        text: "In Boolean logic, what is the result of TRUE AND FALSE?",
        options: ["TRUE", "FALSE", "NULL", "UNDEFINED"],
        correctIndex: 1,
        complexity: 1,
      },
      {
        text: "What does modus ponens allow us to conclude from 'If P then Q' and 'P is true'?",
        options: ["P is false", "Q is true", "Q is false", "Nothing"],
        correctIndex: 1,
        complexity: 3,
      },
      {
        text: "Which statement is logically equivalent to 'NOT (A AND B)'?",
        options: ["NOT A AND NOT B", "NOT A OR NOT B", "A OR B", "NOT A OR B"],
        correctIndex: 1,
        complexity: 3,
      },
      {
        text: "What is a tautology?",
        options: [
          "A statement that is always false",
          "A statement that is always true",
          "A statement that depends on context",
          "A logical contradiction",
        ],
        correctIndex: 1,
        complexity: 2,
      },
      {
        text: "In set theory, what is the intersection of {1,2,3} and {2,3,4}?",
        options: ["{1,2,3,4}", "{2,3}", "{1,4}", "{}"],
        correctIndex: 1,
        complexity: 1,
      },
    ],
  },
  {
    name: "Math Basics",
    description: "Essential mathematical concepts and operations",
    questions: [
      {
        text: "What is the derivative of x²?",
        options: ["x", "2x", "x²", "2"],
        correctIndex: 1,
        complexity: 2,
      },
      {
        text: "What is the value of 5! (5 factorial)?",
        options: ["25", "120", "60", "720"],
        correctIndex: 1,
        complexity: 1,
      },
      {
        text: "What is the integral of 2x dx?",
        options: ["x²", "x² + C", "2x²", "x² + 2"],
        correctIndex: 1,
        complexity: 3,
      },
      {
        text: "In a right triangle, if one leg is 3 and another is 4, what is the hypotenuse?",
        options: ["5", "7", "6", "12"],
        correctIndex: 0,
        complexity: 1,
      },
      {
        text: "What is the sum of interior angles in a hexagon?",
        options: ["360°", "540°", "720°", "900°"],
        correctIndex: 2,
        complexity: 2,
      },
      {
        text: "What is log₁₀(1000)?",
        options: ["2", "3", "10", "100"],
        correctIndex: 1,
        complexity: 2,
      },
      {
        text: "What is the quadratic formula for ax² + bx + c = 0?",
        options: [
          "x = -b ± √(b² - 4ac) / 2a",
          "x = b ± √(b² - 4ac) / 2a",
          "x = -b ± √(b² + 4ac) / 2a",
          "x = -b / 2a",
        ],
        correctIndex: 0,
        complexity: 3,
      },
      {
        text: "What is the area of a circle with radius 5?",
        options: ["25π", "10π", "5π", "50π"],
        correctIndex: 0,
        complexity: 1,
      },
      {
        text: "What is 2³ × 2⁴?",
        options: ["2⁷", "2¹²", "4⁷", "2¹"],
        correctIndex: 0,
        complexity: 2,
      },
      {
        text: "What is the prime factorization of 60?",
        options: ["2² × 3 × 5", "2 × 3 × 10", "4 × 15", "2³ × 5"],
        correctIndex: 0,
        complexity: 2,
      },
    ],
  },
  {
    name: "Vocabulary",
    description: "Language skills and word understanding",
    questions: [
      {
        text: "What is the meaning of 'ubiquitous'?",
        options: ["Rare", "Present everywhere", "Ancient", "Mysterious"],
        correctIndex: 1,
        complexity: 2,
      },
      {
        text: "Which word is an antonym of 'benevolent'?",
        options: ["Kind", "Generous", "Malevolent", "Charitable"],
        correctIndex: 2,
        complexity: 2,
      },
      {
        text: "What does 'ephemeral' mean?",
        options: ["Long-lasting", "Short-lived", "Heavy", "Bright"],
        correctIndex: 1,
        complexity: 3,
      },
      {
        text: "Which word means 'to make something less severe'?",
        options: ["Exacerbate", "Mitigate", "Aggravate", "Intensify"],
        correctIndex: 1,
        complexity: 2,
      },
      {
        text: "What is a 'paradigm'?",
        options: ["A type of puzzle", "A model or pattern", "A measurement", "A language rule"],
        correctIndex: 1,
        complexity: 3,
      },
      {
        text: "Which word means 'expressed in a very brief way'?",
        options: ["Verbose", "Succinct", "Elaborate", "Redundant"],
        correctIndex: 1,
        complexity: 2,
      },
      {
        text: "What does 'pragmatic' mean?",
        options: ["Idealistic", "Practical and realistic", "Theoretical", "Emotional"],
        correctIndex: 1,
        complexity: 2,
      },
      {
        text: "Which word means 'to prove something false'?",
        options: ["Confirm", "Validate", "Refute", "Support"],
        correctIndex: 2,
        complexity: 1,
      },
      {
        text: "What is the meaning of 'cacophony'?",
        options: ["Harmony", "A harsh mixture of sounds", "Silence", "A musical instrument"],
        correctIndex: 1,
        complexity: 3,
      },
      {
        text: "Which word means 'to officially forbid something'?",
        options: ["Permit", "Proscribe", "Encourage", "Advocate"],
        correctIndex: 1,
        complexity: 3,
      },
    ],
  },
];

export async function seedDefaultTracks(): Promise<void> {
  try {
    const existingTracks = await storage.getAllTracks();
    
    if (existingTracks.length > 0) {
      logger.info({ 
        trackCount: existingTracks.length,
        message: "Tracks already exist, skipping seed" 
      });
      return;
    }

    logger.info({ message: "Seeding default tracks..." });

    for (const trackData of DEFAULT_TRACKS) {
      const track = await storage.createTrack(trackData.name, trackData.description);
      logger.info({ trackId: track.id, trackName: track.name, message: "Created track" });

      for (const questionData of trackData.questions) {
        await storage.createQuestion({
          trackId: track.id,
          text: questionData.text,
          options: questionData.options,
          correctIndex: questionData.correctIndex,
          complexity: questionData.complexity,
        });
      }
      
      logger.info({ 
        trackId: track.id, 
        questionCount: trackData.questions.length,
        message: "Created questions for track" 
      });
    }

    logger.info({ 
      trackCount: DEFAULT_TRACKS.length,
      totalQuestions: DEFAULT_TRACKS.reduce((sum, t) => sum + t.questions.length, 0),
      message: "Seed completed successfully" 
    });
  } catch (error) {
    logger.error({ error, message: "Failed to seed default tracks" });
    throw error;
  }
}
