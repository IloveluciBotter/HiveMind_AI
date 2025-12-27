# Train Your AI - Educational AI Training Lab

## Overview
Train Your AI is an educational landing page and interactive demo that teaches users about AI training through a quiz-based experience. Users answer questions to "train" a virtual AI brain, demonstrating how data quality affects machine learning.

## Current State
- Complete single-page landing website with React + Vite + Tailwind CSS
- Interactive quiz demo with 30 questions across 3 categories (logic, math, general)
- Hive Mind system tracking collective training progress
- Style Credits and cosmetic unlocks system
- AI chat assistant that responds based on game state
- Full localStorage persistence

## Project Structure
```
/
├── index.html              # Main HTML entry point
├── package.json            # Node.js dependencies
├── vite.config.js          # Vite configuration (port 5000, allowed hosts)
├── tailwind.config.js      # Tailwind CSS configuration with custom colors
├── postcss.config.js       # PostCSS configuration
├── src/
│   ├── main.jsx           # React entry point
│   ├── index.css          # Global styles and Tailwind imports
│   ├── App.jsx            # Main app component
│   ├── hooks/
│   │   └── useGameState.js # State management with localStorage
│   ├── data/
│   │   ├── questions.js   # Question bank with categories
│   │   └── cosmetics.js   # Core styles and aura definitions
│   └── components/
│       ├── Header.jsx         # Sticky navigation header
│       ├── Hero.jsx           # Hero section with CTA
│       ├── Clarification.jsx  # Site vs App explanation
│       ├── HowItWorks.jsx     # 4-step training explanation
│       ├── InteractiveLab.jsx # Quiz demo component
│       ├── HiveMindCard.jsx   # Global brain stats display
│       ├── WhyEducational.jsx # Educational benefits
│       ├── TokenSection.jsx   # $BRAIN token info
│       ├── Cosmetics.jsx      # Style shop
│       ├── FAQ.jsx            # Accordion FAQ
│       ├── Footer.jsx         # Footer with disclaimer
│       └── AiChat.jsx         # Chat assistant
└── attached_assets/        # Attached files and assets
```

## Key Features

### Hive Mind System
- `globalBrain` object tracks collective intelligence
- XP increases with high scores (80%+), decreases with low scores (<50%)
- Stability metric affects rollback triggers
- Category-specific strength tracking (logic, math, general)

### User State
- Personal intelligence level
- Session statistics
- Style Credits for cosmetics
- Hive Mind contribution tracking

### Quiz System
- 5 questions per session (demo)
- Questions scale with user level
- Categories: logic, math, general knowledge
- Real-time feedback and AI state updates

## Development
- Run with `npm run dev`
- Server runs on port 5000
- Hot module replacement enabled
- All hosts allowed for Replit compatibility

## Recent Changes
- Initial build: Complete Train Your AI landing page with all features
- Added Hive Mind tracking system
- Implemented cosmetics shop with Style Credits
- Created AI chat with state-aware responses

## User Preferences
- Dark, futuristic learning lab theme
- Neon cyan, purple, and green accents
- Friendly, educational tone
- No placeholder text
