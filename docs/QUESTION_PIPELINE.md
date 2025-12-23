# Question Generation & Import Pipeline

This document describes the complete workflow for generating and importing questions into the HiveMind database.

## Overview

The question pipeline consists of three main tools:

1. **Generator** (`generateQuestionsJsonl.ts`) - Creates JSONL files with questions
2. **Importer** (`importQuestionsJsonl.ts`) - Imports JSONL files into the database
3. **Top-Up** (`topUpQuestions.ts`) - Analyzes DB distribution and generates questions to fill thin buckets

## Quick Start

### Generate Questions

```bash
# Generate 10 questions per complexity for all tracks
npm run gen:questions

# Generate 50 questions per complexity for Mathematics only
npm run gen:questions -- --tracks Mathematics --perBucket 50

# Generate questions for levels 1-20
npm run gen:questions -- --levels 1-20

# Generate with specific complexities
npm run gen:questions -- --complexities 1,2,3,4,5 --perBucket 25
```

### Import Questions

```bash
# Import from a JSONL file
npm run import:questions -- --file questions_generated.jsonl

# Import with fail-fast mode (stops on first error)
npm run import:questions -- --file questions_generated.jsonl --failFast
```

### Generate and Import in One Command

```bash
# Generate and immediately import
npm run gen-and-import
```

### Top Up Thin Buckets

```bash
# Analyze DB and generate questions for buckets with < 10 questions
npm run topup:questions

# Top up with minimum 20 questions per bucket
npm run topup:questions -- --minPerBucket 20

# Top up only specific tracks
npm run topup:questions -- --tracks "Mathematics,Science" --minPerBucket 15

# Custom output file
npm run topup:questions -- --out my_topup.jsonl
```

## Generator Details

### Output Format

The generator creates JSONL files where each line is a JSON object with:

```json
{
  "track": "Mathematics",
  "complexity": 3,
  "text": "What is 15 + 27?",
  "options": ["42", "41", "43", "40"],
  "correctIndex": 0,
  "questionType": "mcq",
  "level": 15,
  "tags": ["arithmetic", "addition"],
  "explanation": "15 + 27 = 42"
}
```

**Fields:**
- `track`: Track name ("General Knowledge", "Science", "Mathematics", "Programming")
- `complexity`: Difficulty level (1-5)
- `text`: Question text
- `options`: Array of answer options (typically 4)
- `correctIndex`: Index of correct answer (0-based)
- `questionType`: "mcq" (always "mcq" for generated questions)
- `level`: Optional level (1-100) for level-based generation
- `tags`: Optional array of tags
- `explanation`: Optional explanation text

### Generator Options

| Option | Description | Default |
|--------|-------------|---------|
| `--out <file>` | Output file path | `questions_generated.jsonl` |
| `--seed <string>` | Seed for reproducible generation | (random) |
| `--tracks <csv>` | Comma-separated tracks | All tracks |
| `--perBucket <n>` | Questions per complexity bucket | 10 |
| `--levels <range>` | Generate by level range (e.g., "1-100") | (by complexity) |
| `--complexities <csv>` | Filter complexities (e.g., "1,2,3,4,5") | All (1-5) |
| `--printExample` | Print example questions | false |
| `--help` | Show help message | - |

### Level-to-Complexity Mapping

When using `--levels`, complexity is automatically calculated:
- Levels 1-20 → Complexity 1
- Levels 21-40 → Complexity 2
- Levels 41-60 → Complexity 3
- Levels 61-80 → Complexity 4
- Levels 81-100 → Complexity 5

## Importer Details

### Supported Fields

The importer accepts both legacy and new field names:

**Track:**
- `track`: Track name or slug (e.g., "Mathematics", "math", "general_knowledge")

**Complexity/Difficulty:**
- `complexity`: Preferred field (1-5)
- `difficulty`: Legacy field (1-5) - maps to `complexity`

**Question Text:**
- `text`: Preferred field
- `question`: Alternative field
- `prompt`: Alternative field

**Options:**
- `options`: Preferred field (array of strings)
- `choices`: Alternative field (array of strings)

**Question Type:**
- `questionType`: Optional ("mcq" or "numeric") - defaults to "mcq"

**Other:**
- `level`: Optional (1-100) - used for level-based generation, not stored in DB
- `tags`: Optional - ignored (not stored in DB)
- `explanation`: Optional - ignored (not stored in DB)

### Import Process

1. **Validation**: Each line is validated for required fields
2. **Track Resolution**: Track name/slug is mapped to track ID
3. **Deduplication**: Questions with identical text in the same track are skipped
4. **Insertion**: Valid questions are inserted into the database

### Import Statistics

After import, you'll see:
- Total lines processed
- Questions inserted
- Questions skipped (duplicates)
- Questions failed (errors)

## Top-Up Script Details

The top-up script:

1. **Analyzes** current database distribution (tracks × complexities)
2. **Identifies** buckets with fewer than `minPerBucket` questions
3. **Generates** questions to fill each bucket to `minPerBucket`
4. **Outputs** JSONL file for import
5. **Prints** import command

### Top-Up Options

| Option | Description | Default |
|--------|-------------|---------|
| `--minPerBucket <n>` | Minimum questions per bucket | 10 |
| `--out <file>` | Output file path | `topup.jsonl` |
| `--tracks <csv>` | Filter by tracks | All tracks |

### Example Workflow

```bash
# 1. Check current distribution
docker compose exec postgres psql -U postgres -d hivemind -c "
  select t.name as track, q.complexity, count(*) as n
  from questions q join tracks t on t.id=q.track_id
  group by t.name, q.complexity
  order by t.name, q.complexity;"

# 2. Generate top-up for thin buckets
npm run topup:questions -- --minPerBucket 20

# 3. Import the generated questions
npm run import:questions -- topup.jsonl

# 4. Verify distribution again
docker compose exec postgres psql -U postgres -d hivemind -c "
  select t.name as track, q.complexity, count(*) as n
  from questions q join tracks t on t.id=q.track_id
  group by t.name, q.complexity
  order by t.name, q.complexity;"
```

## Database Schema

Questions are stored in the `questions` table:

- `id`: UUID (auto-generated)
- `track_id`: Foreign key to `tracks` table
- `text`: Question text
- `options`: JSONB array of answer options
- `correct_index`: Index of correct answer (0-based)
- `complexity`: Integer (1-5)
- `question_type`: "mcq" or "numeric"
- `is_benchmark`: Boolean (default: false)
- `numeric_answer`: Text (for numeric questions)
- `numeric_tolerance`: Numeric (for numeric questions)
- `numeric_unit`: Text (for numeric questions)
- `created_at`: Timestamp

## Best Practices

1. **Generate in Batches**: Generate questions in manageable batches (e.g., 100-500 at a time)
2. **Verify Before Import**: Check generated JSONL files before importing
3. **Use Top-Up Regularly**: Run top-up script periodically to maintain question distribution
4. **Track Distribution**: Monitor question distribution across tracks and complexities
5. **Seed for Reproducibility**: Use `--seed` when you need reproducible generation

## Troubleshooting

### Generator Issues

**"No templates for X at complexity Y"**
- The generator doesn't have templates for that track/complexity combination
- Check available tracks: "General Knowledge", "Science", "Mathematics", "Programming"
- Complexities must be 1-5

**Too many duplicates**
- The generator tries to avoid duplicates but may hit limits
- Try generating smaller batches or use `--seed` for different results

### Importer Issues

**"Track not found"**
- Track name doesn't match database tracks
- Check available tracks in database: `SELECT name FROM tracks;`
- Use exact track names: "General Knowledge", "Science", "Mathematics", "Programming"

**"Invalid complexity/difficulty"**
- Must be integer 1-5
- Check JSONL file for invalid values

**"Missing or invalid options"**
- Options must be an array with at least 2 elements
- Check JSONL file format

### Top-Up Issues

**"No tracks found matching filter"**
- Track names in filter don't match database
- Use exact track names from database

**"Skipping X (not a generator track)"**
- Track exists in DB but generator doesn't support it
- Only "General Knowledge", "Science", "Mathematics", "Programming" are supported

## Examples

### Generate Questions for All Tracks

```bash
npm run gen:questions -- --perBucket 25 --out questions_all.jsonl
npm run import:questions -- --file questions_all.jsonl
```

### Generate High-Difficulty Questions

```bash
npm run gen:questions -- --complexities 4,5 --perBucket 50 --out questions_hard.jsonl
npm run import:questions -- --file questions_hard.jsonl
```

### Top Up Specific Tracks

```bash
npm run topup:questions -- --tracks "Mathematics,Science" --minPerBucket 30 --out math_science_topup.jsonl
npm run import:questions -- --file math_science_topup.jsonl
```

### Reproducible Generation

```bash
npm run gen:questions -- --seed myseed123 --perBucket 100 --out questions_seeded.jsonl
npm run import:questions -- --file questions_seeded.jsonl
```

## Integration with Production

In production (Docker), you can run these scripts inside the container:

```bash
# Generate questions
docker compose exec app npm run gen:questions -- --out questions_prod.jsonl

# Import questions
docker compose exec app npm run import:questions -- --file questions_prod.jsonl

# Top up
docker compose exec app npm run topup:questions -- --minPerBucket 20
```

Note: The production container may not have source files. In that case:
1. Generate questions locally
2. Copy JSONL file to server
3. Run import in container or use a maintenance container with dev dependencies

