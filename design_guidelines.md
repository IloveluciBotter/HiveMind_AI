# Design Guidelines: Train Your AI Game

## Design Approach

**Reference-Based with Gaming Elements**
Drawing inspiration from gamified learning apps (Duolingo, Habitica) combined with modern dark interfaces (Linear, Discord). The design should feel playful yet sophisticated, with clear feedback systems and rewarding progression indicators.

**Core Principles:**
- Gamification-first: Make progress feel tangible and rewarding
- Clarity over decoration: Every element serves gameplay understanding
- Personality through restraint: Let emojis and messaging carry character, keep UI clean

---

## Typography

**Font Stack:**
- Primary: 'Inter' or 'DM Sans' from Google Fonts - clean, modern sans-serif
- Fallback: system-ui, -apple-system, sans-serif

**Hierarchy:**
- App Title: 2.5rem (40px), bold (700)
- Screen Headings: 1.75rem (28px), semibold (600)
- Stats Labels: 0.875rem (14px), medium (500), uppercase, letter-spacing: 0.05em
- Stat Values: 1.5rem (24px), bold (700)
- Question Text: 1.25rem (20px), medium (500)
- Body/Captions: 1rem (16px), regular (400)
- Small Text: 0.875rem (14px), regular (400)

---

## Layout System

**Spacing Units (Tailwind-equivalent):**
Primary spacing set: 4, 6, 8, 12, 16, 24 (in px: 16, 24, 32, 48, 64, 96)

**Container:**
- Max-width: 560px (between specified 480-600px)
- Padding: 32px desktop, 24px mobile
- Centered with auto margins

**Card Structure:**
- Border-radius: 16px (rounded-2xl)
- Box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4) - prominent shadow for dark theme
- Inner padding: 48px desktop, 32px mobile

---

## Component Library

### Home Screen Components

**AI Avatar Display:**
- Large emoji size: 80px (use font-size, not image)
- Container: circular background (120px diameter), subtle gradient or solid fill
- Caption below: small text, muted opacity (0.7)
- Spacing: 48px margin below avatar area

**Stats Grid:**
- 2x2 grid layout on desktop, stack on mobile
- Each stat card: 16px padding, subtle border (1px, opacity 0.1)
- Stat label above value, centered text
- 12px gap between cards

**Scoring Rules Section:**
- Light background panel (slightly lighter than main card)
- 16px padding, 8px border-radius
- Bullet points with icon indicators (✓ for good, → for neutral, ✗ for bad)

**Primary CTA Button:**
- Full-width or prominent centered
- Height: 56px
- Font-size: 1.125rem (18px), semibold
- Border-radius: 12px
- Gradient background or solid with glow effect on hover

### Training Screen Components

**Progress Header:**
- Sticky or fixed at top of card
- Progress bar: full-width, 6px height, rounded ends
- Question counter: bold, larger text
- 24px spacing below header

**Question Card:**
- Clear visual separation from options
- Minimum height to prevent layout shift
- 32px padding
- Subtle background differentiation

**Answer Options:**
- Full-width buttons, stacked vertically
- Height: 64px minimum for touch targets
- 12px gap between options
- Border: 2px solid, changes on hover/selected
- Border-radius: 8px
- Left-aligned text with 16px padding
- Hover state: slight scale (1.02) and border brightness increase
- Selected/locked state: distinct visual (filled background)

**Score Tracker:**
- Top-right corner position or below progress
- Small, unobtrusive but visible
- 8px padding, subtle border

### Result Screen Components

**Results Header:**
- Large, celebratory or neutral based on outcome
- 48px spacing below

**Score Display:**
- Large percentage: 3rem (48px), extra bold
- "X / 10 Correct" below in smaller text
- Circular progress ring (optional visual flourish)

**Before/After Stats Comparison:**
- Side-by-side layout with arrow between
- Each stat: previous value → new value
- Use subtle color coding (growth/decline/same)
- 24px spacing between stat rows

**Outcome Message:**
- Prominent card or banner
- Icon/emoji reflecting outcome
- Message text: 1.125rem, centered
- Background tint based on result (subtle)

**Action Buttons:**
- Two-button layout: secondary style + primary style
- Stack on mobile, side-by-side on desktop
- 12px gap between buttons
- Each button: 48px height

---

## Visual Treatment

**Dark Theme Palette (structure only, no specific colors to be defined):**
- Page background: Very dark
- Card background: Dark but lighter than page
- Text: High contrast light
- Muted text: Medium opacity
- Borders: Low opacity light
- Button backgrounds: Will be defined separately
- Success/neutral/warning states: Will be defined separately

**Borders & Dividers:**
- Use sparingly, 1px width
- Low opacity (0.1-0.15) for subtle separation
- Border-radius on all interactive elements (minimum 8px)

---

## Interaction Design

**State Transitions:**
- Fade-in/out between screens: 200ms ease-in-out
- Button hover: 150ms transition on all properties
- Answer lock: 100ms scale down effect

**Feedback:**
- Button clicks: slight scale down (0.98)
- Progress updates: smooth width transition (300ms)
- No distracting animations between questions - instant transitions

**Micro-interactions:**
- Selected answer: immediate visual feedback
- Stat updates on result screen: count-up animation (500ms) optional
- Level-up celebration: brief scale pulse on new level badge

---

## Responsive Behavior

**Breakpoint:**
- Mobile: < 640px
- Desktop: ≥ 640px

**Mobile Adjustments:**
- Reduce font sizes by 10-15%
- Stack all horizontal layouts vertically
- Reduce container padding to 24px
- Full-width buttons
- Smaller avatar (64px)

**Touch Targets:**
- Minimum 48px height for all interactive elements
- Adequate spacing (12px minimum) between tappable items

---

## Accessibility

- Maintain 4.5:1 contrast ratio minimum for all text
- Focus states: 2px outline, high-contrast color, 2px offset
- Use semantic HTML elements throughout
- Ensure all interactive elements have focus states
- Labels for all stats and data points

---

## Images

**No Hero Image Required**

This is a functional game interface, not a marketing page. Visual interest comes from:
- Emoji-based AI avatar (rendered as text/font, not image)
- Clean typography and spacing
- Stat displays and progress indicators
- Game state feedback

If decorative elements are desired:
- Subtle gradient overlays on card backgrounds
- Abstract geometric patterns in page background (very subtle, low opacity)
- These should enhance, not distract from gameplay