// server/scripts/generateQuestionsJsonl.ts
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

// ============================================================================
// Types
// ============================================================================

type TrackName = "General Knowledge" | "Science" | "Mathematics" | "Programming";
type QuestionType = "mcq" | "true_false";
type Difficulty = 1 | 2 | 3 | 4 | 5;

interface GenQuestion {
  track: TrackName;
  complexity: Difficulty;
  text: string;
  options: string[];
  correctIndex: number;
  questionType: QuestionType;
  level?: number;
  tags?: string[];
  explanation?: string;
}

interface QuestionTemplate {
  text: string | ((params: Record<string, unknown>) => string);
  options: string[] | ((params: Record<string, unknown>) => string[]);
  correctIndex: number | ((params: Record<string, unknown>) => number);
  tags?: string[];
  explanation?: string | ((params: Record<string, unknown>) => string);
  paramGenerator?: () => Record<string, unknown>;
}

type Factory = (complexity: Difficulty) => Omit<GenQuestion, "track" | "complexity">;

// ============================================================================
// Utilities
// ============================================================================

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

function argBool(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseCsv<T extends string>(v: string | undefined, fallback: T[]): T[] {
  if (!v) return fallback;
  return v.split(",").map(s => s.trim()).filter(Boolean) as T[];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number, decimals = 2): number {
  const val = Math.random() * (max - min) + min;
  return Number(val.toFixed(decimals));
}

function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function pickN<T>(arr: readonly T[], n: number): T[] {
  const shuffled = shuffle([...arr]);
  return shuffled.slice(0, Math.min(n, arr.length));
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleWithAnswer(options: string[], correctIndex: number): { options: string[]; correctIndex: number } {
  const tagged = options.map((opt, i) => ({ opt, isCorrect: i === correctIndex }));
  const shuffled = shuffle(tagged);
  const newCorrectIndex = shuffled.findIndex(x => x.isCorrect);
  return { options: shuffled.map(x => x.opt), correctIndex: newCorrectIndex };
}

function generateDistractors(correct: number, count: number, range: [number, number] = [1, 50]): number[] {
  const distractors = new Set<number>();
  const [min, max] = range;
  
  // Generate some close distractors
  const closeOffsets = [-2, -1, 1, 2, 3, 5, 10, -10];
  for (const offset of shuffle(closeOffsets)) {
    const val = correct + offset;
    if (val !== correct && val >= min && val <= max) {
      distractors.add(val);
      if (distractors.size >= count) break;
    }
  }
  
  // Fill remaining with random values
  let attempts = 0;
  while (distractors.size < count && attempts < 100) {
    const val = randInt(min, max);
    if (val !== correct) distractors.add(val);
    attempts++;
  }
  
  return [...distractors].slice(0, count);
}

function levelToComplexity(level: number): Difficulty {
  const c = Math.ceil(level / 20);
  return clamp(c, 1, 5) as Difficulty;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

// Seeded random number generator
function createSeededRandom(seed: string): () => number {
  let s = 0;
  for (const ch of seed) {
    s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  }
  let x = s || 123456789;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17; x >>>= 0;
    x ^= x << 5;  x >>>= 0;
    return (x >>> 0) / 4294967296;
  };
}

// ============================================================================
// Question Banks - Mathematics
// ============================================================================

const MATH_TEMPLATES: Record<Difficulty, QuestionTemplate[]> = {
  1: [
    {
      paramGenerator: () => ({ a: randInt(1, 20), b: randInt(1, 20) }),
      text: (p) => `What is ${p.a} + ${p.b}?`,
      options: (p) => {
        const ans = (p.a as number) + (p.b as number);
        return shuffle([ans, ...generateDistractors(ans, 3, [2, 50])].map(String));
      },
      correctIndex: (p) => {
        const ans = String((p.a as number) + (p.b as number));
        const opts = shuffle([Number(ans), ...generateDistractors(Number(ans), 3, [2, 50])].map(String));
        return opts.indexOf(ans);
      },
      tags: ["arithmetic", "addition"],
      explanation: (p) => `${p.a} + ${p.b} = ${(p.a as number) + (p.b as number)}`,
    },
    {
      paramGenerator: () => ({ a: randInt(10, 50), b: randInt(1, 15) }),
      text: (p) => `What is ${p.a} - ${p.b}?`,
      options: (p) => {
        const ans = (p.a as number) - (p.b as number);
        return shuffle([ans, ...generateDistractors(ans, 3, [1, 60])].map(String));
      },
      correctIndex: (p) => {
        const ans = String((p.a as number) - (p.b as number));
        const opts = shuffle([Number(ans), ...generateDistractors(Number(ans), 3, [1, 60])].map(String));
        return opts.indexOf(ans);
      },
      tags: ["arithmetic", "subtraction"],
    },
    {
      paramGenerator: () => ({ a: randInt(2, 10), b: randInt(2, 10) }),
      text: (p) => `What is ${p.a} × ${p.b}?`,
      options: (p) => {
        const ans = (p.a as number) * (p.b as number);
        return shuffle([ans, ...generateDistractors(ans, 3, [4, 120])].map(String));
      },
      correctIndex: (p) => {
        const ans = String((p.a as number) * (p.b as number));
        const opts = shuffle([Number(ans), ...generateDistractors(Number(ans), 3, [4, 120])].map(String));
        return opts.indexOf(ans);
      },
      tags: ["arithmetic", "multiplication"],
    },
    {
      text: "What is the value of 10²?",
      options: ["100", "20", "1000", "10"],
      correctIndex: 0,
      tags: ["arithmetic", "exponents"],
    },
    {
      text: "How many sides does a triangle have?",
      options: ["3", "4", "5", "6"],
      correctIndex: 0,
      tags: ["geometry", "shapes"],
    },
  ],
  2: [
    {
      paramGenerator: () => {
        const a = randInt(12, 99);
        const b = randInt(2, 9);
        return { a, b, quotient: Math.floor(a / b), remainder: a % b };
      },
      text: (p) => `What is ${p.a} ÷ ${p.b}? (round down to nearest whole number)`,
      options: (p) => {
        const ans = p.quotient as number;
        return shuffle([ans, ...generateDistractors(ans, 3, [1, 50])].map(String));
      },
      correctIndex: (p) => {
        const ans = String(p.quotient);
        const opts = shuffle([Number(ans), ...generateDistractors(Number(ans), 3, [1, 50])].map(String));
        return opts.indexOf(ans);
      },
      tags: ["arithmetic", "division"],
    },
    {
      paramGenerator: () => ({ n: randInt(2, 12) }),
      text: (p) => `What is ${p.n}² (${p.n} squared)?`,
      options: (p) => {
        const ans = (p.n as number) ** 2;
        return shuffle([ans, ...generateDistractors(ans, 3, [1, 200])].map(String));
      },
      correctIndex: (p) => {
        const ans = String((p.n as number) ** 2);
        const opts = shuffle([Number(ans), ...generateDistractors(Number(ans), 3, [1, 200])].map(String));
        return opts.indexOf(ans);
      },
      tags: ["arithmetic", "exponents"],
    },
    {
      paramGenerator: () => {
        const whole = randInt(1, 5);
        const num = randInt(1, 3);
        const denom = 4;
        return { whole, num, denom, decimal: whole + num / denom };
      },
      text: (p) => `Convert ${p.whole} ${p.num}/${p.denom} to a decimal.`,
      options: (p) => {
        const ans = (p.decimal as number).toFixed(2);
        const distractors = [
          ((p.decimal as number) + 0.25).toFixed(2),
          ((p.decimal as number) - 0.25).toFixed(2),
          ((p.decimal as number) + 0.5).toFixed(2),
        ];
        return shuffle([ans, ...distractors]);
      },
      correctIndex: 0,
      tags: ["fractions", "decimals"],
    },
    {
      paramGenerator: () => ({ percent: pick([10, 20, 25, 50]), of: pick([40, 60, 80, 100, 200]) }),
      text: (p) => `What is ${p.percent}% of ${p.of}?`,
      options: (p) => {
        const ans = ((p.percent as number) / 100) * (p.of as number);
        return shuffle([ans, ...generateDistractors(ans, 3, [1, 200])].map(String));
      },
      correctIndex: (p) => {
        const ans = String(((p.percent as number) / 100) * (p.of as number));
        const opts = shuffle([Number(ans), ...generateDistractors(Number(ans), 3, [1, 200])].map(String));
        return opts.indexOf(ans);
      },
      tags: ["percentages"],
    },
    {
      text: "What is the perimeter of a square with side length 7?",
      options: ["28", "49", "14", "21"],
      correctIndex: 0,
      tags: ["geometry", "perimeter"],
    },
  ],
  3: [
    {
      paramGenerator: () => {
        const x = randInt(2, 10);
        const m = randInt(2, 8);
        const b = randInt(1, 15);
        return { x, m, b, result: m * x + b };
      },
      text: (p) => `Solve for x: ${p.m}x + ${p.b} = ${p.result}`,
      options: (p) => {
        const ans = p.x as number;
        return shuffle([ans, ...generateDistractors(ans, 3, [1, 20])].map(String));
      },
      correctIndex: (p) => {
        const ans = String(p.x);
        const opts = shuffle([Number(ans), ...generateDistractors(Number(ans), 3, [1, 20])].map(String));
        return opts.indexOf(ans);
      },
      tags: ["algebra", "linear-equations"],
      explanation: (p) => `${p.m}x + ${p.b} = ${p.result} → ${p.m}x = ${(p.result as number) - (p.b as number)} → x = ${p.x}`,
    },
    {
      paramGenerator: () => {
        const base = randInt(3, 8);
        const height = randInt(4, 10);
        return { base, height, area: (base * height) / 2 };
      },
      text: (p) => `What is the area of a triangle with base ${p.base} and height ${p.height}?`,
      options: (p) => {
        const ans = p.area as number;
        return shuffle([ans, (p.base as number) * (p.height as number), ans + 5, ans - 3].map(String));
      },
      correctIndex: 0,
      tags: ["geometry", "area"],
      explanation: (p) => `Area = (base × height) / 2 = (${p.base} × ${p.height}) / 2 = ${p.area}`,
    },
    {
      paramGenerator: () => {
        const a = randInt(-5, 5);
        const b = randInt(-5, 5);
        return { a, b, sum: a + b, product: a * b };
      },
      text: (p) => `If x + y = ${p.sum} and x × y = ${p.product}, and both x and y are integers, what are the possible values of x?`,
      options: (p) => {
        const ans = `${p.a} or ${p.b}`;
        const wrongPairs = [
          `${(p.a as number) + 1} or ${(p.b as number) - 1}`,
          `${(p.a as number) - 1} or ${(p.b as number) + 1}`,
          `${(p.a as number) * 2} or ${Math.floor((p.b as number) / 2)}`,
        ];
        return shuffle([ans, ...wrongPairs]);
      },
      correctIndex: 0,
      tags: ["algebra", "systems"],
    },
    {
      text: "What is the slope of a horizontal line?",
      options: ["0", "1", "Undefined", "-1"],
      correctIndex: 0,
      tags: ["algebra", "slope"],
    },
    {
      paramGenerator: () => ({ r: randInt(3, 10) }),
      text: (p) => `What is the circumference of a circle with radius ${p.r}? (Use π ≈ 3.14)`,
      options: (p) => {
        const ans = (2 * 3.14 * (p.r as number)).toFixed(2);
        const wrong1 = (3.14 * (p.r as number) ** 2).toFixed(2);
        const wrong2 = (3.14 * (p.r as number)).toFixed(2);
        const wrong3 = (2 * (p.r as number)).toFixed(2);
        return shuffle([ans, wrong1, wrong2, wrong3]);
      },
      correctIndex: 0,
      tags: ["geometry", "circles"],
    },
  ],
  4: [
    {
      paramGenerator: () => {
        const r = randInt(3, 12);
        return { r, area: Math.round(Math.PI * r * r) };
      },
      text: (p) => `A circle has radius ${p.r}. What is the approximate area? (Use π ≈ 3.1416)`,
      options: (p) => {
        const ans = p.area as number;
        return shuffle([ans, ...generateDistractors(ans, 3, [10, 600])].map(String));
      },
      correctIndex: (p) => {
        const ans = String(p.area);
        const opts = shuffle([Number(ans), ...generateDistractors(Number(ans), 3, [10, 600])].map(String));
        return opts.indexOf(ans);
      },
      tags: ["geometry", "circles", "area"],
    },
    {
      paramGenerator: () => {
        const a = randInt(1, 5);
        const b = randInt(-10, 10);
        const c = randInt(-20, 20);
        return { a, b, c, discriminant: b * b - 4 * a * c };
      },
      text: (p) => `For the quadratic ${p.a}x² + ${p.b}x + ${p.c} = 0, what is the discriminant (b² - 4ac)?`,
      options: (p) => {
        const ans = p.discriminant as number;
        return shuffle([ans, ...generateDistractors(ans, 3, [-100, 200])].map(String));
      },
      correctIndex: (p) => {
        const ans = String(p.discriminant);
        const opts = shuffle([Number(ans), ...generateDistractors(Number(ans), 3, [-100, 200])].map(String));
        return opts.indexOf(ans);
      },
      tags: ["algebra", "quadratics"],
    },
    {
      text: "What is log₁₀(1000)?",
      options: ["3", "10", "100", "30"],
      correctIndex: 0,
      tags: ["logarithms"],
    },
    {
      text: "In a right triangle, if one leg is 3 and another is 4, what is the hypotenuse?",
      options: ["5", "7", "6", "√7"],
      correctIndex: 0,
      tags: ["geometry", "pythagorean"],
      explanation: "By Pythagorean theorem: c² = 3² + 4² = 9 + 16 = 25, so c = 5",
    },
    {
      paramGenerator: () => {
        const n = randInt(3, 8);
        const r = randInt(1, Math.min(3, n));
        const perm = factorial(n) / factorial(n - r);
        return { n, r, perm };
      },
      text: (p) => `How many ways can you arrange ${p.r} items from a set of ${p.n} distinct items? (Permutation)`,
      options: (p) => {
        const ans = p.perm as number;
        return shuffle([ans, ...generateDistractors(ans, 3, [1, 1000])].map(String));
      },
      correctIndex: 0,
      tags: ["combinatorics", "permutations"],
    },
  ],
  5: [
    {
      paramGenerator: () => {
        const n = randInt(8, 20);
        return { n, sum: (n * (n + 1)) / 2 };
      },
      text: (p) => `What is the sum of the first ${p.n} positive integers?`,
      options: (p) => {
        const ans = p.sum as number;
        return shuffle([ans, ...generateDistractors(ans, 3, [10, 300])].map(String));
      },
      correctIndex: (p) => {
        const ans = String(p.sum);
        const opts = shuffle([Number(ans), ...generateDistractors(Number(ans), 3, [10, 300])].map(String));
        return opts.indexOf(ans);
      },
      tags: ["series", "arithmetic"],
      explanation: (p) => `Sum = n(n+1)/2 = ${p.n}(${(p.n as number) + 1})/2 = ${p.sum}`,
    },
    {
      text: "What is the derivative of x³?",
      options: ["3x²", "x²", "3x³", "x⁴/4"],
      correctIndex: 0,
      tags: ["calculus", "derivatives"],
    },
    {
      text: "What is the integral of 2x?",
      options: ["x² + C", "2x² + C", "x + C", "2 + C"],
      correctIndex: 0,
      tags: ["calculus", "integrals"],
    },
    {
      text: "What is lim(x→0) sin(x)/x?",
      options: ["1", "0", "∞", "undefined"],
      correctIndex: 0,
      tags: ["calculus", "limits"],
    },
    {
      text: "In a geometric sequence where a₁ = 2 and r = 3, what is a₄?",
      options: ["54", "18", "162", "24"],
      correctIndex: 0,
      tags: ["sequences", "geometric"],
      explanation: "a₄ = a₁ × r³ = 2 × 27 = 54",
    },
    {
      paramGenerator: () => {
        const n = randInt(4, 7);
        return { n, fact: factorial(n) };
      },
      text: (p) => `What is ${p.n}! (${p.n} factorial)?`,
      options: (p) => {
        const ans = p.fact as number;
        return shuffle([ans, ...generateDistractors(ans, 3, [10, 10000])].map(String));
      },
      correctIndex: 0,
      tags: ["combinatorics", "factorial"],
    },
  ],
};

function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

// ============================================================================
// Question Banks - Science
// ============================================================================

const SCIENCE_TEMPLATES: Record<Difficulty, QuestionTemplate[]> = {
  1: [
    {
      text: "What gas do plants primarily take in for photosynthesis?",
      options: ["Carbon dioxide", "Oxygen", "Nitrogen", "Hydrogen"],
      correctIndex: 0,
      tags: ["biology", "photosynthesis"],
    },
    {
      text: "What is the chemical symbol for water?",
      options: ["H₂O", "CO₂", "O₂", "NaCl"],
      correctIndex: 0,
      tags: ["chemistry", "compounds"],
    },
    {
      text: "What force pulls objects toward Earth?",
      options: ["Gravity", "Friction", "Magnetism", "Inertia"],
      correctIndex: 0,
      tags: ["physics", "forces"],
    },
    {
      text: "What planet is known as the Red Planet?",
      options: ["Mars", "Venus", "Jupiter", "Saturn"],
      correctIndex: 0,
      tags: ["astronomy", "planets"],
    },
    {
      text: "What is the largest organ in the human body?",
      options: ["Skin", "Liver", "Heart", "Brain"],
      correctIndex: 0,
      tags: ["biology", "anatomy"],
    },
    {
      text: "What do we call animals that eat only plants?",
      options: ["Herbivores", "Carnivores", "Omnivores", "Decomposers"],
      correctIndex: 0,
      tags: ["biology", "ecology"],
    },
  ],
  2: [
    {
      text: "What is the smallest unit of life?",
      options: ["Cell", "Atom", "Molecule", "Organ"],
      correctIndex: 0,
      tags: ["biology", "cells"],
    },
    {
      text: "Which state of matter has a definite volume but no definite shape?",
      options: ["Liquid", "Solid", "Gas", "Plasma"],
      correctIndex: 0,
      tags: ["physics", "states-of-matter"],
    },
    {
      text: "What type of energy does a moving car have?",
      options: ["Kinetic energy", "Potential energy", "Chemical energy", "Nuclear energy"],
      correctIndex: 0,
      tags: ["physics", "energy"],
    },
    {
      text: "What is the center of an atom called?",
      options: ["Nucleus", "Electron", "Proton", "Shell"],
      correctIndex: 0,
      tags: ["chemistry", "atomic-structure"],
    },
    {
      text: "Which blood cells are responsible for carrying oxygen?",
      options: ["Red blood cells", "White blood cells", "Platelets", "Plasma"],
      correctIndex: 0,
      tags: ["biology", "circulatory-system"],
    },
  ],
  3: [
    {
      text: "Which organelle is primarily responsible for producing ATP in eukaryotic cells?",
      options: ["Mitochondria", "Nucleus", "Ribosome", "Golgi apparatus"],
      correctIndex: 0,
      tags: ["biology", "cell-biology"],
      explanation: "Mitochondria are the 'powerhouses of the cell' - they generate most of the cell's ATP through cellular respiration.",
    },
    {
      text: "What is Newton's First Law of Motion also known as?",
      options: ["Law of Inertia", "Law of Acceleration", "Law of Action-Reaction", "Law of Gravity"],
      correctIndex: 0,
      tags: ["physics", "mechanics"],
    },
    {
      text: "What type of bond forms when electrons are shared between atoms?",
      options: ["Covalent bond", "Ionic bond", "Hydrogen bond", "Metallic bond"],
      correctIndex: 0,
      tags: ["chemistry", "bonding"],
    },
    {
      text: "If the frequency of a wave increases while its speed stays constant, what happens to its wavelength?",
      options: ["Decreases", "Increases", "Stays the same", "Becomes zero"],
      correctIndex: 0,
      tags: ["physics", "waves"],
      explanation: "Since v = fλ (velocity = frequency × wavelength), if v is constant and f increases, λ must decrease.",
    },
    {
      text: "What process converts glucose into energy in cells without using oxygen?",
      options: ["Anaerobic respiration", "Aerobic respiration", "Photosynthesis", "Fermentation"],
      correctIndex: 0,
      tags: ["biology", "cellular-respiration"],
    },
  ],
  4: [
    {
      text: "In chemistry, loss of electrons is called what?",
      options: ["Oxidation", "Reduction", "Neutralization", "Hydrolysis"],
      correctIndex: 0,
      tags: ["chemistry", "redox"],
      explanation: "OIL RIG: Oxidation Is Loss (of electrons), Reduction Is Gain (of electrons).",
    },
    {
      text: "What is the unit of electrical resistance?",
      options: ["Ohm", "Volt", "Ampere", "Watt"],
      correctIndex: 0,
      tags: ["physics", "electricity"],
    },
    {
      text: "Which particle in an atom has no electric charge?",
      options: ["Neutron", "Proton", "Electron", "Positron"],
      correctIndex: 0,
      tags: ["physics", "atomic-structure"],
    },
    {
      text: "What is the process by which plants lose water through their leaves?",
      options: ["Transpiration", "Evaporation", "Condensation", "Precipitation"],
      correctIndex: 0,
      tags: ["biology", "plant-physiology"],
    },
    {
      text: "What type of electromagnetic radiation has the shortest wavelength?",
      options: ["Gamma rays", "X-rays", "Ultraviolet", "Radio waves"],
      correctIndex: 0,
      tags: ["physics", "electromagnetic-spectrum"],
    },
  ],
  5: [
    {
      text: "According to the Heisenberg Uncertainty Principle, which pair of properties cannot be simultaneously measured with arbitrary precision?",
      options: ["Position and momentum", "Mass and velocity", "Energy and time", "Both A and C"],
      correctIndex: 3,
      tags: ["physics", "quantum-mechanics"],
    },
    {
      text: "What is the relationship between entropy and the spontaneity of a reaction at constant temperature and pressure?",
      options: [
        "ΔG = ΔH - TΔS",
        "ΔG = ΔH + TΔS",
        "ΔS = ΔH - TΔG",
        "ΔH = ΔG - TΔS",
      ],
      correctIndex: 0,
      tags: ["chemistry", "thermodynamics"],
    },
    {
      text: "In special relativity, what happens to the mass of an object as it approaches the speed of light?",
      options: [
        "Increases toward infinity",
        "Decreases toward zero",
        "Stays constant",
        "Oscillates",
      ],
      correctIndex: 0,
      tags: ["physics", "relativity"],
    },
    {
      text: "What is the name of the enzyme that unwinds DNA during replication?",
      options: ["Helicase", "DNA polymerase", "Ligase", "Primase"],
      correctIndex: 0,
      tags: ["biology", "molecular-biology"],
    },
    {
      text: "In quantum mechanics, what does the wave function (ψ) represent?",
      options: [
        "Probability amplitude",
        "Actual position",
        "Velocity",
        "Energy level",
      ],
      correctIndex: 0,
      tags: ["physics", "quantum-mechanics"],
    },
  ],
};

// ============================================================================
// Question Banks - General Knowledge
// ============================================================================

const GK_TEMPLATES: Record<Difficulty, QuestionTemplate[]> = {
  1: [
    {
      text: "What is the capital of France?",
      options: ["Paris", "Lyon", "Marseille", "Nice"],
      correctIndex: 0,
      tags: ["geography", "capitals"],
    },
    {
      text: "Which continent is Egypt in?",
      options: ["Africa", "Asia", "Europe", "South America"],
      correctIndex: 0,
      tags: ["geography", "continents"],
    },
    {
      text: "How many days are in a leap year?",
      options: ["366", "365", "364", "360"],
      correctIndex: 0,
      tags: ["general", "calendar"],
    },
    {
      text: "What is the largest ocean on Earth?",
      options: ["Pacific Ocean", "Atlantic Ocean", "Indian Ocean", "Arctic Ocean"],
      correctIndex: 0,
      tags: ["geography", "oceans"],
    },
    {
      text: "What colors make up the American flag?",
      options: ["Red, white, and blue", "Red and white", "Blue and white", "Red, blue, and yellow"],
      correctIndex: 0,
      tags: ["general", "flags"],
    },
    {
      text: "How many continents are there?",
      options: ["7", "5", "6", "8"],
      correctIndex: 0,
      tags: ["geography"],
    },
  ],
  2: [
    {
      text: "Who painted the Mona Lisa?",
      options: ["Leonardo da Vinci", "Michelangelo", "Raphael", "Botticelli"],
      correctIndex: 0,
      tags: ["art", "history"],
    },
    {
      text: "What is the longest river in the world?",
      options: ["Nile", "Amazon", "Mississippi", "Yangtze"],
      correctIndex: 0,
      tags: ["geography", "rivers"],
    },
    {
      text: "In what year did World War II end?",
      options: ["1945", "1944", "1946", "1943"],
      correctIndex: 0,
      tags: ["history", "wars"],
    },
    {
      text: "What is the currency of Japan?",
      options: ["Yen", "Won", "Yuan", "Ringgit"],
      correctIndex: 0,
      tags: ["economics", "currency"],
    },
    {
      text: "Who wrote 'Romeo and Juliet'?",
      options: ["William Shakespeare", "Charles Dickens", "Jane Austen", "Mark Twain"],
      correctIndex: 0,
      tags: ["literature", "authors"],
    },
  ],
  3: [
    {
      text: "Which period is most closely associated with the widespread use of steam power and factory production?",
      options: ["The Industrial Revolution", "The Renaissance", "The Cold War", "The Enlightenment"],
      correctIndex: 0,
      tags: ["history", "industrial-revolution"],
    },
    {
      text: "What ancient wonder was located in Alexandria, Egypt?",
      options: ["The Lighthouse (Pharos)", "The Colossus", "The Hanging Gardens", "The Temple of Artemis"],
      correctIndex: 0,
      tags: ["history", "ancient-wonders"],
    },
    {
      text: "Which treaty established the European Union?",
      options: ["Maastricht Treaty", "Treaty of Rome", "Lisbon Treaty", "Treaty of Paris"],
      correctIndex: 0,
      tags: ["politics", "european-union"],
    },
    {
      text: "What is the main language spoken in Brazil?",
      options: ["Portuguese", "Spanish", "English", "French"],
      correctIndex: 0,
      tags: ["geography", "languages"],
    },
    {
      text: "Who was the first person to walk on the moon?",
      options: ["Neil Armstrong", "Buzz Aldrin", "Yuri Gagarin", "John Glenn"],
      correctIndex: 0,
      tags: ["history", "space"],
    },
  ],
  4: [
    {
      text: "Which concept explains why prices tend to rise when demand increases and supply stays constant?",
      options: ["Supply and demand", "Inflation", "Opportunity cost", "Market equilibrium"],
      correctIndex: 0,
      tags: ["economics", "markets"],
    },
    {
      text: "What is the term for a government ruled by a small group of powerful people?",
      options: ["Oligarchy", "Democracy", "Monarchy", "Theocracy"],
      correctIndex: 0,
      tags: ["politics", "government-types"],
    },
    {
      text: "The Silk Road connected which two regions primarily?",
      options: ["Asia and Europe", "Africa and Asia", "Europe and Americas", "Africa and Europe"],
      correctIndex: 0,
      tags: ["history", "trade"],
    },
    {
      text: "What is GDP?",
      options: [
        "Gross Domestic Product",
        "General Development Program",
        "Government Debt Policy",
        "Global Distribution Protocol",
      ],
      correctIndex: 0,
      tags: ["economics", "terminology"],
    },
    {
      text: "Which empire was ruled by the Aztecs?",
      options: ["Mesoamerican", "Roman", "Persian", "Ottoman"],
      correctIndex: 0,
      tags: ["history", "civilizations"],
    },
  ],
  5: [
    {
      text: "In political theory, which idea describes distributing government authority across branches to prevent abuse?",
      options: ["Separation of powers", "Divine right of kings", "Isolationism", "Mercantilism"],
      correctIndex: 0,
      tags: ["politics", "political-theory"],
    },
    {
      text: "What economic theory advocates for minimal government intervention in markets?",
      options: ["Laissez-faire", "Keynesian economics", "Marxism", "Mercantilism"],
      correctIndex: 0,
      tags: ["economics", "economic-theory"],
    },
    {
      text: "The Treaty of Westphalia (1648) is significant for establishing what concept?",
      options: ["Modern nation-state sovereignty", "International trade routes", "Religious freedom", "Colonial territories"],
      correctIndex: 0,
      tags: ["history", "international-relations"],
    },
    {
      text: "What philosophical concept refers to the social agreement between citizens and government?",
      options: ["Social contract", "Natural law", "Divine mandate", "Categorical imperative"],
      correctIndex: 0,
      tags: ["philosophy", "political-philosophy"],
    },
    {
      text: "Which economic indicator measures the change in price of a basket of goods over time?",
      options: ["Consumer Price Index (CPI)", "GDP", "Unemployment rate", "Trade balance"],
      correctIndex: 0,
      tags: ["economics", "indicators"],
    },
  ],
};

// ============================================================================
// Question Banks - Programming
// ============================================================================

const PROGRAMMING_TEMPLATES: Record<Difficulty, QuestionTemplate[]> = {
  1: [
    {
      text: "Accessing an array element by index (e.g., arr[i]) is typically what time complexity?",
      options: ["O(1)", "O(n)", "O(log n)", "O(n²)"],
      correctIndex: 0,
      tags: ["data-structures", "complexity"],
    },
    {
      text: "What does HTML stand for?",
      options: ["HyperText Markup Language", "High Tech Modern Language", "Home Tool Markup Language", "Hyper Transfer Markup Language"],
      correctIndex: 0,
      tags: ["web", "html"],
    },
    {
      text: "Which symbol is commonly used for single-line comments in JavaScript?",
      options: ["//", "#", "/*", "--"],
      correctIndex: 0,
      tags: ["javascript", "syntax"],
    },
    {
      text: "What data type would you use to store 'true' or 'false'?",
      options: ["Boolean", "String", "Integer", "Float"],
      correctIndex: 0,
      tags: ["data-types", "basics"],
    },
    {
      text: "What does CPU stand for?",
      options: ["Central Processing Unit", "Computer Personal Unit", "Central Program Utility", "Computer Processing Unit"],
      correctIndex: 0,
      tags: ["hardware", "basics"],
    },
  ],
  2: [
    {
      text: "A simple loop that visits each element of an array once is typically what time complexity?",
      options: ["O(n)", "O(1)", "O(log n)", "O(n²)"],
      correctIndex: 0,
      tags: ["algorithms", "complexity"],
    },
    {
      text: "What does CSS stand for?",
      options: ["Cascading Style Sheets", "Computer Style Sheets", "Creative Style System", "Colorful Style Sheets"],
      correctIndex: 0,
      tags: ["web", "css"],
    },
    {
      text: "In most programming languages, what index does the first element of an array have?",
      options: ["0", "1", "-1", "Depends on the language"],
      correctIndex: 0,
      tags: ["data-structures", "arrays"],
    },
    {
      text: "What is the result of 5 % 2 (modulo operation)?",
      options: ["1", "2", "2.5", "0"],
      correctIndex: 0,
      tags: ["operators", "math"],
    },
    {
      text: "Which keyword is commonly used to define a function in Python?",
      options: ["def", "function", "func", "define"],
      correctIndex: 0,
      tags: ["python", "functions"],
    },
  ],
  3: [
    {
      text: "Which format is most commonly used for APIs to exchange structured data in JavaScript environments?",
      options: ["JSON", "XML", "YAML", "CSV"],
      correctIndex: 0,
      tags: ["web", "apis", "data-formats"],
    },
    {
      text: "What design pattern ensures a class has only one instance?",
      options: ["Singleton", "Factory", "Observer", "Decorator"],
      correctIndex: 0,
      tags: ["design-patterns"],
    },
    {
      text: "In Git, what command creates a new branch?",
      options: ["git branch", "git new", "git create", "git fork"],
      correctIndex: 0,
      tags: ["git", "version-control"],
    },
    {
      text: "What is the purpose of a constructor in OOP?",
      options: ["Initialize object state", "Destroy objects", "Define class methods", "Handle errors"],
      correctIndex: 0,
      tags: ["oop", "constructors"],
    },
    {
      text: "Which HTTP method is typically used to update an existing resource?",
      options: ["PUT", "GET", "POST", "DELETE"],
      correctIndex: 0,
      tags: ["web", "http"],
    },
  ],
  4: [
    {
      text: "Which data structure provides average O(1) lookup by key?",
      options: ["Hash map", "Array", "Binary tree", "Linked list"],
      correctIndex: 0,
      tags: ["data-structures", "complexity"],
    },
    {
      text: "What is the time complexity of binary search?",
      options: ["O(log n)", "O(n)", "O(1)", "O(n log n)"],
      correctIndex: 0,
      tags: ["algorithms", "searching"],
    },
    {
      text: "In database design, what does ACID stand for?",
      options: ["Atomicity, Consistency, Isolation, Durability", "Add, Create, Insert, Delete", "Async, Concurrent, Isolated, Distributed", "Always Consistent In Database"],
      correctIndex: 0,
      tags: ["databases", "transactions"],
    },
    {
      text: "What is the main purpose of an index in a database?",
      options: ["Speed up queries", "Store data", "Enforce constraints", "Create backups"],
      correctIndex: 0,
      tags: ["databases", "optimization"],
    },
    {
      text: "Which principle states that software entities should be open for extension but closed for modification?",
      options: ["Open/Closed Principle", "Single Responsibility", "Liskov Substitution", "Interface Segregation"],
      correctIndex: 0,
      tags: ["solid", "design-principles"],
    },
  ],
  5: [
    {
      text: "Two threads update shared state without proper locking and results become unpredictable. This bug is called what?",
      options: ["Race condition", "Memory leak", "Deadlock", "Stack overflow"],
      correctIndex: 0,
      tags: ["concurrency", "bugs"],
    },
    {
      text: "What is the time complexity of quicksort in the average case?",
      options: ["O(n log n)", "O(n²)", "O(n)", "O(log n)"],
      correctIndex: 0,
      tags: ["algorithms", "sorting"],
    },
    {
      text: "In distributed systems, what does the CAP theorem state?",
      options: [
        "You can only guarantee two of: Consistency, Availability, Partition tolerance",
        "Caching Always Pays off",
        "Consensus Achieves Performance",
        "Clusters Are Powerful",
      ],
      correctIndex: 0,
      tags: ["distributed-systems", "theory"],
    },
    {
      text: "What is memoization primarily used for?",
      options: ["Caching function results", "Memory allocation", "Thread synchronization", "Error handling"],
      correctIndex: 0,
      tags: ["optimization", "dynamic-programming"],
    },
    {
      text: "What problem does Dijkstra's algorithm solve?",
      options: ["Shortest path in weighted graphs", "Sorting arrays", "Finding minimum spanning tree", "Detecting cycles"],
      correctIndex: 0,
      tags: ["algorithms", "graphs"],
    },
    {
      text: "What is the difference between a mutex and a semaphore?",
      options: [
        "Mutex is binary, semaphore can have count > 1",
        "They are identical",
        "Semaphore is binary, mutex can have count > 1",
        "Mutex is for threads, semaphore is for processes",
      ],
      correctIndex: 0,
      tags: ["concurrency", "synchronization"],
    },
  ],
};

// ============================================================================
// Question Factory
// ============================================================================

const TRACK_TEMPLATES: Record<TrackName, Record<Difficulty, QuestionTemplate[]>> = {
  "General Knowledge": GK_TEMPLATES,
  "Science": SCIENCE_TEMPLATES,
  "Mathematics": MATH_TEMPLATES,
  "Programming": PROGRAMMING_TEMPLATES,
};

function resolveTemplate(template: QuestionTemplate): Omit<GenQuestion, "track" | "complexity"> {
  const params = template.paramGenerator ? template.paramGenerator() : {};
  
  const text = typeof template.text === "function" ? template.text(params) : template.text;
  
  let options: string[];
  let correctIndex: number;
  
  if (typeof template.options === "function") {
    options = template.options(params);
    // For dynamic options, we need to recalculate correctIndex
    if (typeof template.correctIndex === "function") {
      correctIndex = template.correctIndex(params);
    } else {
      correctIndex = template.correctIndex;
    }
  } else {
    const shuffled = shuffleWithAnswer(template.options, template.correctIndex as number);
    options = shuffled.options;
    correctIndex = shuffled.correctIndex;
  }
  
  const explanation = template.explanation
    ? (typeof template.explanation === "function" ? template.explanation(params) : template.explanation)
    : undefined;
  
  return {
    text,
    options: options.slice(0, 4),
    correctIndex,
    questionType: "mcq",
    tags: template.tags,
    explanation,
  };
}

export function makeQuestion(track: TrackName, complexity: Difficulty): GenQuestion {
  const templates = TRACK_TEMPLATES[track][complexity];
  if (!templates || templates.length === 0) {
    throw new Error(`No templates for ${track} at complexity ${complexity}`);
  }
  
  const template = pick(templates);
  const base = resolveTemplate(template);
  
  if (base.options.length < 4) {
    throw new Error(`Template produced insufficient options for ${track} c=${complexity}`);
  }
  
  return {
    track,
    complexity,
    ...base,
  };
}

export function fingerprint(q: GenQuestion): string {
  return `${q.track}|${q.complexity}|${q.text}|${q.options.join("||")}|${q.correctIndex}`;
}

export type { TrackName, Difficulty, GenQuestion };

// ============================================================================
// CLI & Main
// ============================================================================

function printUsage() {
  console.log(`
Question Generator - Generate trivia questions for learning platforms

Usage:
  npx tsx generateQuestionsJsonl.ts [options]

Options:
  --out <file>          Output file path (default: questions_generated.jsonl)
  --seed <string>       Seed for reproducible generation
  --tracks <csv>        Comma-separated tracks (default: all)
                        Options: "General Knowledge", "Science", "Mathematics", "Programming"
  --perBucket <n>       Questions per complexity bucket (default: 10)
  --levels <range>      Generate by level range, e.g., "1-100"
  --complexities <csv>  Filter complexities, e.g., "1,2,3,4,5"
  --printExample        Print an example question
  --help                Show this help message

Examples:
  # Generate 10 questions per complexity for all tracks
  npx tsx generateQuestionsJsonl.ts

  # Generate 50 math questions per complexity
  npx tsx generateQuestionsJsonl.ts --tracks Mathematics --perBucket 50

  # Generate questions for levels 1-20 only
  npx tsx generateQuestionsJsonl.ts --levels 1-20

  # Reproducible generation
  npx tsx generateQuestionsJsonl.ts --seed myseed123
`);
}

function main() {
  if (argBool("help")) {
    printUsage();
    process.exit(0);
  }

  const out = arg("out") ?? "questions_generated.jsonl";
  const seed = arg("seed");
  
  if (seed) {
    const seededRandom = createSeededRandom(seed);
    Math.random = seededRandom;
    console.log(`🌱 Using seed: ${seed}`);
  }

  const tracks = parseCsv<TrackName>(arg("tracks"), ["General Knowledge", "Science", "Mathematics", "Programming"]);
  const perBucket = Number(arg("perBucket") ?? "10");
  const levels = arg("levels");
  const complexitiesCsv = arg("complexities");

  const targetComplexities: Difficulty[] = complexitiesCsv
    ? parseCsv<string>(complexitiesCsv, ["1", "2", "3", "4", "5"]).map(Number) as Difficulty[]
    : [1, 2, 3, 4, 5];

  // Validate inputs
  for (const track of tracks) {
    if (!TRACK_TEMPLATES[track]) {
      console.error(`❌ Unknown track: ${track}`);
      process.exit(1);
    }
  }

  for (const c of targetComplexities) {
    if (c < 1 || c > 5) {
      console.error(`❌ Invalid complexity: ${c}. Must be 1-5.`);
      process.exit(1);
    }
  }

  const outPath = path.resolve(process.cwd(), out);
  const stream = fs.createWriteStream(outPath, { encoding: "utf8" });

  const seen = new Set<string>();
  let written = 0;
  let duplicatesSkipped = 0;
  const startTime = Date.now();

  console.log(`\n📝 Generating questions...`);
  console.log(`   Tracks: ${tracks.join(", ")}`);
  console.log(`   Complexities: ${targetComplexities.join(", ")}`);
  console.log(`   Per bucket: ${perBucket}`);
  if (levels) console.log(`   Levels: ${levels}`);
  console.log("");

  if (levels) {
    const [a, b] = levels.split("-").map(s => Number(s.trim()));
    const minL = clamp(a || 1, 1, 100);
    const maxL = clamp(b || 100, 1, 100);
    
    for (const track of tracks) {
      for (let level = minL; level <= maxL; level++) {
        const complexity = levelToComplexity(level);
        if (!targetComplexities.includes(complexity)) continue;
        
        for (let i = 0; i < perBucket; i++) {
          let attempts = 0;
          let q: GenQuestion | null = null;
          
          while (attempts < 50) {
            q = makeQuestion(track, complexity);
            q.level = level;
            const fp = fingerprint(q);
            
            if (!seen.has(fp)) {
              seen.add(fp);
              break;
            }
            
            duplicatesSkipped++;
            attempts++;
            q = null;
          }
          
          if (q) {
            stream.write(JSON.stringify(q) + "\n");
            written++;
          }
        }
      }
      process.stdout.write(`   ✓ ${track}: ${written} questions\r`);
    }
  } else {
    for (const track of tracks) {
      let trackCount = 0;
      
      for (const complexity of targetComplexities) {
        for (let i = 0; i < perBucket; i++) {
          let attempts = 0;
          let q: GenQuestion | null = null;
          
          while (attempts < 50) {
            q = makeQuestion(track, complexity);
            const fp = fingerprint(q);
            
            if (!seen.has(fp)) {
              seen.add(fp);
              break;
            }
            
            duplicatesSkipped++;
            attempts++;
            q = null;
          }
          
          if (q) {
            stream.write(JSON.stringify(q) + "\n");
            written++;
            trackCount++;
          }
        }
      }
      
      console.log(`   ✓ ${track}: ${trackCount} questions`);
    }
  }

  stream.end();
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log(`\n✅ Complete!`);
  console.log(`   Written: ${formatNumber(written)} questions`);
  console.log(`   Output: ${outPath}`);
  console.log(`   Time: ${elapsed}s`);
  
  if (duplicatesSkipped > 0) {
    console.log(`   ⚠️  Duplicates skipped: ${duplicatesSkipped}`);
  }

  if (argBool("printExample")) {
    console.log("\n📋 Example questions:");
    for (const track of tracks.slice(0, 2)) {
      const example = makeQuestion(track, 3);
      console.log(`\n[${track}] (Complexity ${example.complexity})`);
      console.log(`Q: ${example.text}`);
      example.options.forEach((opt, i) => {
        const marker = i === example.correctIndex ? "✓" : " ";
        console.log(`  ${marker} ${i + 1}. ${opt}`);
      });
      if (example.explanation) {
        console.log(`  💡 ${example.explanation}`);
      }
      if (example.tags) {
        console.log(`  🏷️  ${example.tags.join(", ")}`);
      }
    }
  }
}

if (require.main === module) {
  main();
}

