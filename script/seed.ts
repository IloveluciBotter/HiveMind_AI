import { db } from "../server/db";
import { tracks, questions, cycles, trainingPool } from "@shared/schema";
import { sql } from "drizzle-orm";

async function seed() {
  console.log("Starting seed...");

  // Create initial cycle
  const [cycle] = await db
    .insert(cycles)
    .values({ cycleNumber: 1, isActive: true })
    .returning();
  console.log("Created cycle:", cycle.cycleNumber);

  // Create tracks
  const trackData = [
    { name: "General Knowledge", description: "General knowledge questions" },
    { name: "Science", description: "Science and technology questions" },
    { name: "Mathematics", description: "Math and logic questions" },
    { name: "Programming", description: "Programming and computer science questions" },
  ];

  const insertedTracks = await db.insert(tracks).values(trackData).returning();
  console.log(`Created ${insertedTracks.length} tracks`);

  // Create benchmark questions (using questions from gameData.ts as reference)
  const benchmarkQuestions = [
    {
      text: "What is the capital of France?",
      options: ["Berlin", "Paris", "Madrid", "Rome"],
      correctIndex: 1,
      complexity: 1,
      isBenchmark: true,
    },
    {
      text: "What is 12 + 8?",
      options: ["18", "20", "22", "19"],
      correctIndex: 1,
      complexity: 1,
      isBenchmark: true,
    },
    {
      text: "Which planet is known as the Red Planet?",
      options: ["Venus", "Mars", "Jupiter", "Saturn"],
      correctIndex: 1,
      complexity: 1,
      isBenchmark: true,
    },
    {
      text: "What is the boiling point of water in Celsius?",
      options: ["90", "100", "110", "120"],
      correctIndex: 1,
      complexity: 2,
      isBenchmark: true,
    },
    {
      text: "What is the chemical symbol for gold?",
      options: ["Go", "Gd", "Au", "Ag"],
      correctIndex: 2,
      complexity: 2,
      isBenchmark: true,
    },
    {
      text: "What is the speed of light in a vacuum (approx)?",
      options: ["300,000 m/s", "300,000 km/s", "300 km/s", "3,000 km/s"],
      correctIndex: 1,
      complexity: 3,
      isBenchmark: true,
    },
    {
      text: "What is the derivative of x^2 with respect to x?",
      options: ["x", "2x", "x^2", "2"],
      correctIndex: 1,
      complexity: 3,
      isBenchmark: true,
    },
    {
      text: "Which programming language was created by Guido van Rossum?",
      options: ["JavaScript", "Ruby", "Python", "Java"],
      correctIndex: 2,
      complexity: 3,
      isBenchmark: true,
    },
    {
      text: "What is the time complexity of binary search?",
      options: ["O(n)", "O(log n)", "O(n log n)", "O(n^2)"],
      correctIndex: 1,
      complexity: 4,
      isBenchmark: true,
    },
    {
      text: "In machine learning, what does 'overfitting' mean?",
      options: [
        "Model is too simple",
        "Model learns noise in training data",
        "Model has too few parameters",
        "Model trains too slowly",
      ],
      correctIndex: 1,
      complexity: 4,
      isBenchmark: true,
    },
  ];

  await db.insert(questions).values(benchmarkQuestions);
  console.log(`Created ${benchmarkQuestions.length} benchmark questions`);

  // Create track-specific questions
  const generalTrack = insertedTracks.find((t) => t.name === "General Knowledge");
  const scienceTrack = insertedTracks.find((t) => t.name === "Science");
  const mathTrack = insertedTracks.find((t) => t.name === "Mathematics");
  const programmingTrack = insertedTracks.find((t) => t.name === "Programming");

  if (generalTrack) {
    const generalQuestions = [
      {
        trackId: generalTrack.id,
        text: "Who wrote 'Romeo and Juliet'?",
        options: ["Charles Dickens", "William Shakespeare", "Jane Austen", "Mark Twain"],
        correctIndex: 1,
        complexity: 2,
        isBenchmark: false,
      },
      {
        trackId: generalTrack.id,
        text: "What is the capital of Japan?",
        options: ["Seoul", "Beijing", "Tokyo", "Bangkok"],
        correctIndex: 2,
        complexity: 1,
        isBenchmark: false,
      },
    ];
    await db.insert(questions).values(generalQuestions);
    console.log(`Created ${generalQuestions.length} questions for General Knowledge`);
  }

  if (scienceTrack) {
    const scienceQuestions = [
      {
        trackId: scienceTrack.id,
        text: "Which gas do plants absorb from the atmosphere?",
        options: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Hydrogen"],
        correctIndex: 2,
        complexity: 1,
        isBenchmark: false,
      },
      {
        trackId: scienceTrack.id,
        text: "What is the primary function of mitochondria?",
        options: ["Protein synthesis", "Energy production", "Cell division", "Waste removal"],
        correctIndex: 1,
        complexity: 3,
        isBenchmark: false,
      },
    ];
    await db.insert(questions).values(scienceQuestions);
    console.log(`Created ${scienceQuestions.length} questions for Science`);
  }

  if (mathTrack) {
    const mathQuestions = [
      {
        trackId: mathTrack.id,
        text: "What is 15% of 200?",
        options: ["25", "30", "35", "40"],
        correctIndex: 1,
        complexity: 2,
        isBenchmark: false,
      },
      {
        trackId: mathTrack.id,
        text: "What is the square root of 144?",
        options: ["10", "11", "12", "14"],
        correctIndex: 2,
        complexity: 2,
        isBenchmark: false,
      },
    ];
    await db.insert(questions).values(mathQuestions);
    console.log(`Created ${mathQuestions.length} questions for Mathematics`);
  }

  if (programmingTrack) {
    const programmingQuestions = [
      {
        trackId: programmingTrack.id,
        text: "Which data structure uses LIFO principle?",
        options: ["Queue", "Stack", "Array", "Linked List"],
        correctIndex: 1,
        complexity: 3,
        isBenchmark: false,
      },
      {
        trackId: programmingTrack.id,
        text: "Which HTTP status code indicates 'Not Found'?",
        options: ["200", "301", "404", "500"],
        correctIndex: 2,
        complexity: 2,
        isBenchmark: false,
      },
    ];
    await db.insert(questions).values(programmingQuestions);
    console.log(`Created ${programmingQuestions.length} questions for Programming`);
  }

  // Initialize training pool
  const poolExists = await db.select().from(trainingPool).limit(1);
  if (poolExists.length === 0) {
    await db.insert(trainingPool).values({ amount: "0" });
    console.log("Initialized training pool");
  }

  console.log("Seed completed!");
  process.exit(0);
}

seed().catch((error) => {
  console.error("Seed error:", error);
  process.exit(1);
});

