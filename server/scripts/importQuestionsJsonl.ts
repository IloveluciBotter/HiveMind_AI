#!/usr/bin/env node
/**
 * CLI script to import questions from JSONL file into the database
 * 
 * Usage: npx tsx server/scripts/importQuestionsJsonl.ts --file questions_leveled_21-100.jsonl [--failFast]
 */

import { createReadStream } from "fs";
import { createInterface } from "readline";
import { storage } from "../storage";
import { logger } from "../middleware/logger";

interface JsonlQuestion {
  id?: string;
  track: string;
  level?: number;
  difficulty?: number; // Legacy field name (maps to complexity)
  complexity?: number; // Preferred field name (1-5)
  // Accept multiple field names for question text
  question?: string;
  text?: string;
  prompt?: string;
  // Accept multiple field names for options
  options?: string[];
  choices?: string[];
  correctIndex: number;
  questionType?: "mcq" | "numeric" | "true_false"; // Optional, defaults to "mcq"
  explanation?: string;
  tags?: string[];
}

interface ImportStats {
  inserted: number;
  skipped: number;
  failed: number;
  errors: Array<{ line: number; error: string; stack?: string }>;
}

/**
 * Map track slug to track name (case-insensitive, handles underscores)
 * Returns a string, never null/undefined
 */
function mapTrackSlugToName(slug: string): string {
  const normalizedSlug = String(slug ?? "").trim().toLowerCase();
  
  const mapping: Record<string, string> = {
    "general_knowledge": "General Knowledge",
    "general-knowledge": "General Knowledge",
    "generalknowledge": "General Knowledge",
    "science": "Science",
    "math": "Mathematics",
    "mathematics": "Mathematics",
    "programming": "Programming",
    "code": "Programming",
    "coding": "Programming",
  };
  
  const normalized = normalizedSlug.replace(/[_-]/g, "_");
  return mapping[normalized] ?? normalizedSlug;
}

/**
 * Find track by name (case-insensitive)
 */
async function findTrackByName(trackName: string): Promise<{ id: string; name: string } | null> {
  const allTracks = await storage.getAllTracks();
  const normalizedName = trackName.toLowerCase().trim();
  
  const track = allTracks.find(t => t.name.toLowerCase().trim() === normalizedName);
  return track ? { id: track.id, name: track.name } : null;
}

/**
 * Check if question already exists (by text and trackId)
 */
async function questionExists(text: string, trackId: string): Promise<boolean> {
  const existingQuestions = await storage.getQuestionsByTrack(trackId);
  const normalizedText = text.trim().toLowerCase();
  
  return existingQuestions.some(q => q.text.trim().toLowerCase() === normalizedText);
}

/**
 * Extract question text from data (supports question/text/prompt)
 */
function extractQuestionText(data: any): string | null {
  return data.question || data.text || data.prompt || null;
}

/**
 * Extract options from data (supports options/choices)
 */
function extractOptions(data: any): string[] | null {
  if (Array.isArray(data.options) && data.options.length > 0) {
    return data.options;
  }
  if (Array.isArray(data.choices) && data.choices.length > 0) {
    return data.choices;
  }
  return null;
}

/**
 * Validate question data
 */
function validateQuestion(data: any): { valid: boolean; error?: string; questionText?: string; options?: string[] } {
  if (!data.track || typeof data.track !== "string") {
    return { valid: false, error: "Missing or invalid 'track' field" };
  }
  
  // Level is optional (used for level-based generation, not stored in DB)
  if (data.level !== undefined && (typeof data.level !== "number" || data.level < 1 || data.level > 100)) {
    return { valid: false, error: "Invalid 'level' (must be 1-100)" };
  }
  
  // Accept either 'difficulty' (legacy) or 'complexity' (preferred)
  const complexityValue = data.complexity ?? data.difficulty;
  if (typeof complexityValue !== "number" || complexityValue < 1 || complexityValue > 5) {
    return { valid: false, error: "Invalid 'complexity' or 'difficulty' (must be 1-5)" };
  }
  
  const questionText = extractQuestionText(data);
  if (!questionText || typeof questionText !== "string") {
    return { valid: false, error: "Missing or invalid 'question'/'text'/'prompt' field" };
  }
  
  const options = extractOptions(data);
  if (!options || options.length < 2) {
    return { valid: false, error: "Missing or invalid 'options'/'choices' array (must have at least 2 options)" };
  }
  
  if (typeof data.correctIndex !== "number" || data.correctIndex < 0 || data.correctIndex >= options.length) {
    return { valid: false, error: `Invalid 'correctIndex' (must be 0-${options.length - 1})` };
  }
  
  return { valid: true, questionText, options };
}

/**
 * Import questions from JSONL file
 */
async function importQuestions(filePath: string, failFast: boolean = false): Promise<void> {
  const stats: ImportStats = {
    inserted: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  
  // Track name to ID cache
  const trackCache = new Map<string, string>();
  
  // Load all tracks into cache
  const allTracks = await storage.getAllTracks();
  for (const track of allTracks) {
    trackCache.set(track.name.toLowerCase().trim(), track.id);
  }
  
  console.log(`Starting import from: ${filePath}`);
  console.log(`Found ${allTracks.length} existing tracks in database`);
  if (allTracks.length > 0) {
    console.log(`Available tracks: ${allTracks.map(t => t.name).join(", ")}`);
  }
  
  const fileStream = createReadStream(filePath, { encoding: "utf-8" });
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });
  
  let lineNumber = 0;
  let jsonParseError = false;
  
  for await (const line of rl) {
    lineNumber++;
    const trimmedLine = line.trim();
    
    // Skip empty lines
    if (!trimmedLine) {
      continue;
    }
    
    jsonParseError = false;
    let data: JsonlQuestion;
    
    try {
      // Parse JSON - this is the only place we label as "JSON parse error"
      data = JSON.parse(trimmedLine);
    } catch (error: any) {
      jsonParseError = true;
      stats.failed++;
      const errMsg = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : undefined;
      stats.errors.push({ 
        line: lineNumber, 
        error: `JSON parse error: ${errMsg}`,
        stack: errStack,
      });
      
      if (failFast) {
        console.error(`\n❌ Fail-fast enabled. Stopping at line ${lineNumber}`);
        console.error(`Error: ${errMsg}`);
        if (errStack) {
          console.error(`Stack:\n${errStack}`);
        }
        throw error;
      }
      continue;
    }
    
    try {
      // Validate
      const validation = validateQuestion(data);
      if (!validation.valid) {
        stats.failed++;
        const errorMsg = String(validation.error ?? "Validation failed");
        stats.errors.push({ 
          line: lineNumber, 
          error: `Validation error: ${errorMsg}`,
        });
        
        if (failFast) {
          console.error(`\n❌ Fail-fast enabled. Stopping at line ${lineNumber}`);
          console.error(`Validation error: ${errorMsg}`);
          throw new Error(errorMsg);
        }
        continue;
      }
      
      // Extract validated fields
      const questionText = validation.questionText!;
      const options = validation.options!;
      
      // Resolve track - use safe string conversion
      const trackSlug = String(data.track ?? "").trim();
      const trackName = mapTrackSlugToName(trackSlug);
      const normalizedTrackName = String(trackName ?? "").toLowerCase().trim();
      let trackId = trackCache.get(normalizedTrackName);
      
      if (!trackId) {
        // Try to find by name (case-insensitive)
        const foundTrack = await findTrackByName(trackName);
        if (!foundTrack) {
          // Also try finding by original slug (in case track name matches slug)
          const foundBySlug = await findTrackByName(trackSlug);
          if (foundBySlug) {
            trackId = foundBySlug.id;
            trackCache.set(normalizedTrackName, trackId);
            trackCache.set(String(trackSlug ?? "").toLowerCase().trim(), trackId);
          } else {
            stats.failed++;
            const availableTracks = allTracks.map(t => `"${String(t.name ?? "")}"`).join(", ");
            const errorMsg = `Track not found: "${trackSlug}" (mapped to "${trackName}"). Available tracks: ${availableTracks || "none"}`;
            stats.errors.push({
              line: lineNumber,
              error: `Validation error: ${errorMsg}`,
            });
            
            if (failFast) {
              console.error(`\n❌ Fail-fast enabled. Stopping at line ${lineNumber}`);
              console.error(`Error: ${errorMsg}`);
              throw new Error(errorMsg);
            }
            continue;
          }
        } else {
          trackId = foundTrack.id;
          trackCache.set(normalizedTrackName, trackId);
        }
      }
      
      // Check for duplicates
      const exists = await questionExists(questionText, trackId);
      if (exists) {
        stats.skipped++;
        if (stats.skipped % 50 === 0) {
          console.log(`  Progress: ${lineNumber} lines processed, ${stats.inserted} inserted, ${stats.skipped} skipped`);
        }
        continue;
      }
      
      // Convert to DB format
      // options is JSONB in DB, so pass array directly (not JSON.stringify)
      const complexityValue = data.complexity ?? data.difficulty ?? 1;
      const questionTypeValue = (data.questionType === "numeric" ? "numeric" : "mcq") as "mcq" | "numeric";
      
      const dbQuestion = {
        trackId: String(trackId ?? ""),
        text: String(questionText ?? ""),
        options: Array.isArray(options) ? options : [],
        correctIndex: typeof data.correctIndex === "number" ? data.correctIndex : 0,
        complexity: typeof complexityValue === "number" ? complexityValue : 1,
        questionType: questionTypeValue,
        isBenchmark: false,
        numericAnswer: null,
        numericTolerance: null,
        numericUnit: null,
      };
      
      // Insert
      await storage.createQuestion(dbQuestion);
      stats.inserted++;
      
      // Log progress every 50 inserts
      if (stats.inserted % 50 === 0) {
        console.log(`  Progress: ${lineNumber} lines processed, ${stats.inserted} inserted, ${stats.skipped} skipped`);
      }
      
    } catch (error: any) {
      stats.failed++;
      const errMsg = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : undefined;
      const errorLabel = jsonParseError ? "JSON parse error" : "Insert error";
      stats.errors.push({ 
        line: lineNumber, 
        error: `${errorLabel}: ${errMsg}`,
        stack: errStack,
      });
      
      if (failFast) {
        console.error(`\n❌ Fail-fast enabled. Stopping at line ${lineNumber}`);
        console.error(`Error: ${errMsg}`);
        if (errStack) {
          console.error(`Stack:\n${errStack}`);
        }
        throw error;
      }
    }
  }
  
  // Print final summary
  console.log("\n" + "=".repeat(60));
  console.log("Import Summary");
  console.log("=".repeat(60));
  console.log(`Total lines processed: ${lineNumber}`);
  console.log(`✅ Inserted: ${stats.inserted}`);
  console.log(`⏭️  Skipped (duplicates): ${stats.skipped}`);
  console.log(`❌ Failed: ${stats.failed}`);
  
  if (stats.errors.length > 0) {
    console.log("\nErrors:");
    // Print first 5 errors with stack traces, then up to 20 total
    const errorsToShow = stats.errors.slice(0, 20);
    errorsToShow.forEach(({ line, error, stack }, index) => {
      console.log(`  Line ${line}: ${error}`);
      // Print stack for first 5 errors
      if (index < 5 && stack) {
        console.log(`    Stack: ${stack.split("\n").slice(0, 3).join("\n    ")}`);
      }
    });
    if (stats.errors.length > 20) {
      console.log(`  ... and ${stats.errors.length - 20} more errors`);
    }
  }
  
  console.log("=".repeat(60));
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf("--file");
  const failFast = args.includes("--failFast");
  
  // Support both --file <path> and positional argument
  let filePath: string | undefined;
  if (fileIndex !== -1 && fileIndex < args.length - 1) {
    filePath = args[fileIndex + 1];
  } else if (args.length > 0 && !args[0].startsWith("--")) {
    // Positional argument (for npm script compatibility)
    filePath = args[0];
  }
  
  if (!filePath) {
    console.error("Usage: npx tsx server/scripts/importQuestionsJsonl.ts [--file] <path-to-jsonl> [--failFast]");
    console.error("   or: npm run import:questions -- <path-to-jsonl>");
    process.exit(1);
  }
  
  if (failFast) {
    console.log("⚠️  Fail-fast mode enabled. Script will stop on first error.");
  }
  
  try {
    await importQuestions(filePath, failFast);
    process.exit(0);
  } catch (error: any) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Fatal error:", errMsg);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Execute main function
main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});


