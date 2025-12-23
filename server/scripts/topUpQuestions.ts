#!/usr/bin/env node
/**
 * Top-up script: Generate questions to fill thin buckets in the database
 * 
 * Reads current DB distribution, identifies buckets with < minPerBucket questions,
 * generates questions to fill them, and outputs JSONL for import.
 * 
 * Usage: npx tsx server/scripts/topUpQuestions.ts [--minPerBucket 10] [--out topup.jsonl] [--tracks "Mathematics,Science"]
 */

import fs from "node:fs";
import path from "node:path";
import { db } from "../db";
import { questions, tracks } from "@shared/schema";
import { eq, sql, and } from "drizzle-orm";
import { makeQuestion, fingerprint, type TrackName, type Difficulty } from "./generateQuestionsJsonl";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

function parseCsv<T extends string>(v: string | undefined, fallback: T[] | null): T[] | null {
  if (!v) return fallback;
  return v.split(",").map(s => s.trim()).filter(Boolean) as T[];
}

interface BucketCount {
  trackName: string;
  trackId: string;
  complexity: number;
  count: number;
}

async function getCurrentDistribution(trackFilter: string[] | null): Promise<BucketCount[]> {
  const allTracks = await db.select().from(tracks);
  
  const trackFilterSet = trackFilter ? new Set(trackFilter.map(t => t.toLowerCase().trim())) : null;
  const filteredTracks = trackFilterSet
    ? allTracks.filter(t => trackFilterSet.has(t.name.toLowerCase().trim()))
    : allTracks;
  
  if (filteredTracks.length === 0) {
    throw new Error(`No tracks found matching filter: ${trackFilter?.join(", ") || "all"}`);
  }
  
  const results: BucketCount[] = [];
  
  for (const track of filteredTracks) {
    // Get counts per complexity for this track
    const counts = await db
      .select({
        complexity: questions.complexity,
        count: sql<number>`count(*)::int`,
      })
      .from(questions)
      .where(eq(questions.trackId, track.id))
      .groupBy(questions.complexity);
    
    for (const row of counts) {
      results.push({
        trackName: track.name,
        trackId: track.id,
        complexity: row.complexity,
        count: row.count,
      });
    }
    
    // Also include complexities that have 0 questions
    for (let c = 1; c <= 5; c++) {
      const exists = counts.some(r => r.complexity === c);
      if (!exists) {
        results.push({
          trackName: track.name,
          trackId: track.id,
          complexity: c,
          count: 0,
        });
      }
    }
  }
  
  return results;
}

async function main() {
  const minPerBucket = Number(arg("minPerBucket") ?? "10");
  const outFile = arg("out") ?? "topup.jsonl";
  const tracksCsv = arg("tracks");
  
  const trackFilter = parseCsv<string>(tracksCsv, null);
  
  console.log("🔍 Analyzing database distribution...");
  console.log(`   Min per bucket: ${minPerBucket}`);
  if (trackFilter) {
    console.log(`   Track filter: ${trackFilter.join(", ")}`);
  }
  console.log("");
  
  // Get current distribution
  const distribution = await getCurrentDistribution(trackFilter);
  
  // Find buckets that need questions
  const needsTopUp: BucketCount[] = [];
  for (const bucket of distribution) {
    if (bucket.count < minPerBucket) {
      needsTopUp.push(bucket);
    }
  }
  
  if (needsTopUp.length === 0) {
    console.log("✅ All buckets have at least ${minPerBucket} questions. No top-up needed.");
    process.exit(0);
  }
  
  console.log(`📊 Found ${needsTopUp.length} buckets needing top-up:`);
  for (const bucket of needsTopUp) {
    const needed = minPerBucket - bucket.count;
    console.log(`   ${bucket.trackName} (complexity ${bucket.complexity}): ${bucket.count} → need ${needed} more`);
  }
  console.log("");
  
  // Generate questions
  const outPath = path.resolve(process.cwd(), outFile);
  const stream = fs.createWriteStream(outPath, { encoding: "utf8" });
  
  const seen = new Set<string>();
  let written = 0;
  const startTime = Date.now();
  
  console.log("📝 Generating questions...");
  
  for (const bucket of needsTopUp) {
    const needed = minPerBucket - bucket.count;
    const trackName = bucket.trackName as TrackName;
    const complexity = bucket.complexity as Difficulty;
    
    // Validate track name matches generator expectations
    const validTracks: TrackName[] = ["General Knowledge", "Science", "Mathematics", "Programming"];
    if (!validTracks.includes(trackName)) {
      console.warn(`   ⚠️  Skipping ${trackName} (not a generator track)`);
      continue;
    }
    
    for (let i = 0; i < needed; i++) {
      let attempts = 0;
      let q = null;
      
      while (attempts < 50) {
        try {
          q = makeQuestion(trackName, complexity);
          const fp = fingerprint(q);
          
          if (!seen.has(fp)) {
            seen.add(fp);
            break;
          }
          
          attempts++;
          q = null;
        } catch (error: any) {
          console.error(`   ❌ Error generating question for ${trackName} c=${complexity}: ${error.message}`);
          attempts++;
          if (attempts >= 10) {
            console.error(`   ⚠️  Giving up on ${trackName} c=${complexity} after 10 errors`);
            break;
          }
        }
      }
      
      if (q) {
        stream.write(JSON.stringify(q) + "\n");
        written++;
      } else {
        console.warn(`   ⚠️  Failed to generate question ${i + 1}/${needed} for ${trackName} c=${complexity}`);
      }
    }
    
    console.log(`   ✓ ${trackName} (complexity ${complexity}): generated ${needed} questions`);
  }
  
  stream.end();
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log(`\n✅ Complete!`);
  console.log(`   Generated: ${written} questions`);
  console.log(`   Output: ${outPath}`);
  console.log(`   Time: ${elapsed}s`);
  console.log("");
  console.log("📥 To import, run:");
  console.log(`   npm run import:questions -- ${outFile}`);
  console.log("");
}

main().catch((err) => {
  console.error("❌ Top-up failed:", err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});

