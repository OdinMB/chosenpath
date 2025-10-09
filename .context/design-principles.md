# Design Principles for Interactive Fiction Game

## I. Core Design Philosophy

- [ ] **Narrative Immersion:** Create an environment that draws players into the story and maintains atmospheric engagement.
- [ ] **Player Agency:** Ensure choices feel meaningful and interface supports quick decision-making during gameplay.
- [ ] **Performance First:** Prioritize fast load times and responsive interactions, especially for real-time multiplayer sessions.
- [ ] **Elegant Simplicity:** Keep the interface clean and uncluttered to focus attention on story content and choices.
- [ ] **Visual Hierarchy:** Guide player attention naturally from story text to choices to game state information.
- [ ] **Consistency:** Maintain uniform design patterns across game, library, and configuration interfaces.
- [ ] **Accessibility (WCAG AA):** Ensure readable text, sufficient contrast, keyboard navigation, and screen reader support.
- [ ] **Mobile-Responsive:** Design for seamless experience across desktop, tablet, and mobile devices.

## II. Design System Foundation

### Color Palette (Established in tailwind.config.js)

- **Primary (Black):** `#000000` - Main brand color with opacity scale
- **Secondary (Dark Blue):** `#1E4999` - Interactive elements and links
- **Tertiary (Red):** `#FF6B6B` - Warnings, errors, critical choices
- **Accent (Green):** `#01A29D` - Success states, positive feedback, CTAs
- **Neutrals:** Using primary color with opacity variations (50-900)
- **Semantic Colors:**
  - Success: Accent green
  - Error: Tertiary red
  - Info: Secondary blue
  - Warning: Custom amber/yellow as needed

### Typography (Established)

- **Display Font:** Lora (serif) - Story content, immersive narrative text
- **UI Font:** Montserrat (sans-serif) - Interface elements, controls, navigation
- **Font Weights:** 400 (regular), 500-600 (medium), 700-800 (bold)
- **Line Height:** 1.5-1.7 for optimal readability of story text

### Spacing System

- **Base Unit:** 4px (Tailwind default)
- **Scale:** 0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 56, 64
- **Consistent application** across padding, margins, and gaps

### Component Library (Existing)

- **ColoredBox:** Base component with left border accent system
- **ImageCard:** Base card element with integrated image
- **PrimaryButton:** Main action button with ColoredBox foundation
- **Modal:** Overlay dialogs with image header support
- **Icons:** Centralized icon system in Icons.tsx
- **Tooltip:** Floating UI-based contextual help
- **LoadingSpinner:** Consistent loading states
- **Input/TextArea/Select:** Form controls with consistent styling
- **Tabs:** Navigation between content sections

## III. Layout & Visual Hierarchy

### Game Layout Structure

- **GameLayout:** Two-column responsive layout with story content and player sidebar
- **Mobile Adaptation:** Single column with collapsible player panel
- **Story Display:** Scrollable content area with sticky beat navigation
- **Player Panel:** Fixed sidebar showing all players, stats, and game state

### Visual Hierarchy Patterns

- **Primary Focus:** Story narrative text (Lora font, larger size)
- **Secondary Focus:** Choice buttons (ColoredBox with hover states)
- **Tertiary Focus:** Player information, stats, game metadata
- **White Space:** Generous padding around story beats and choices
- **Card-Based Design:** ColoredBox components for clear content separation

### Responsive Breakpoints

- **Mobile:** < 640px (single column, collapsible panels)
- **Tablet:** 640px - 1024px (adaptive two-column)
- **Desktop:** > 1024px (full two-column layout)

## IV. Interaction Design & Animations

### Established Animations (from tailwind.config.js)

- **fadeIn:** 0.3s ease-in-out for content appearance
- **pulse:** 2s/4s cubic-bezier for loading states
- **sparkle:** 4s ease infinite for special effects
- **ColoredBox hover:** Transform translateX(1) on hover with border color change

### Interaction Patterns

- **Hover States:** ColoredBox components shift right with color intensification
- **Focus States:** Ring-2 ring-accent with 50% opacity (accessibility)
- **Loading States:** Consistent LoadingSpinner component with message display
- **Transitions:** 300ms duration for all state changes
- **Keyboard Navigation:** Full support with visible focus indicators

## V. Game-Specific Interface Patterns

### Story Display

- **Beat Navigation:** Horizontal dot navigation for story progression
- **Choice Presentation:** ColoredBox buttons with clear hover states
- **Character Cards:** Visual representation with stats and abilities
- **Risk Visualization:** Previous choice outcomes with animated segments
- **Interlude Screens:** Atmospheric transitions between story beats

### Player Management

- **Player Codes:** Copy-to-clipboard functionality for game sharing
- **Character Selection:** Grid layout with visual character cards
- **Stats Display:** Clear presentation of health, gold, experience
- **Turn Indicators:** Visual feedback for active player turn

### Template Library

- **Template Cards:** Image preview with metadata overlay
- **Category Grid:** Tile-based navigation for template categories
- **Carousel Display:** Smooth horizontal scrolling for featured content
- **Configuration Flow:** Step-by-step wizard with progress indicators

### Admin Interface

- **Data Tables:** SortableTable component with filtering and pagination
- **Form Layouts:** Consistent field grouping with validation feedback
- **Bulk Actions:** Checkbox selection with contextual action toolbar
- **Status Badges:** Color-coded indicators for content states

## VI. CSS & Styling Architecture

### Current Implementation

- **Utility-First:** Tailwind CSS with custom configuration
- **Component Patterns:** ColoredBox base with compositional approach
- **Custom Properties:** CSS variables for dynamic theming potential
- **PostCSS:** Autoprefixer for browser compatibility
- **Font Loading:** Self-hosted WOFF2 fonts with font-display: swap

### Best Practices

- **Tailwind Classes:** Use semantic color names (primary, secondary, accent)
- **Component Composition:** Build complex components from simple primitives
- **Responsive Utilities:** Mobile-first approach with sm:, md:, lg: breakpoints
- **Custom Utilities:** Defined in index.css @layer utilities

## VII. Accessibility Standards

- **Text Contrast:** Minimum 4.5:1 for normal text, 3:1 for large text
- **Focus Indicators:** Visible focus rings on all interactive elements
- **Keyboard Navigation:** Full keyboard support for all interactions
- **Screen Reader Support:** Semantic HTML with appropriate ARIA labels
- **Motion Preferences:** Respect prefers-reduced-motion settings
- **Touch Targets:** Minimum 44x44px for mobile touch targets

## VIII. Performance Guidelines

- **Image Optimization:** Lazy loading for story images, WebP format preferred
- **Code Splitting:** Route-based splitting for faster initial loads
- **Font Strategy:** Preload critical fonts, use font-display: swap
- **Animation Performance:** Use transform/opacity for animations
- **Bundle Size:** Monitor and minimize JavaScript bundle size

## IX. Development Workflow

- **Component Documentation:** Each component should have clear prop types
- **Visual Regression Testing:** Consider Playwright for UI testing
- **Design Tokens:** Centralize in tailwind.config.js
- **Style Guide Compliance:** Follow established patterns in ui.mdc
- **Responsive Testing:** Test on multiple viewport sizes
- **Accessibility Testing:** Use automated tools and manual testing
