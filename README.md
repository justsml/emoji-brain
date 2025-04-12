# Emoji Explorer

Demo/educational project for emoji browsing, searching, and exporting.

A simple Astro app for browsing, searching, and exporting emojis. Built with React, Shadcn and Tailwind CSS.

A beautiful web application for browsing, searching, and exporting emojis with a responsive grid layout.

## Features

- **Self-hostable**: Manage your private, artisinal emoji collection 🍺
- **Responsive Grid Layout**: Adapts seamlessly from 3 columns on mobile to 9 columns on desktop
- [**Instant Serverless Search**:](`scripts/create-pagefind-index.ts`) Filter emojis by name, category, or tags (0% Algolia)
- **Category Filtering**: Quick access to emojis by category
- **Selection System**: Save your favorite emojis with persistent state
- **Export Options**: Export selected emojis as plain text, HTML, CSS, or ZIP
- **Dark Mode Support**: Automatic system preference detection for light/dark mode
- **Keyboard Navigation**: Full keyboard support for accessibility
- **Screen Reader Compatible**: Accessible to all users
- [ ] Slack import/export script generator
- [ ] Discord import/export script generator
- [ ] Custom emoji support
- [ ] Upload custom emojis
- [ ] AI Emoji Remixer? Local?
- [ ] URL based state (bitwise encoding? base64? what does excalidraw do?)
- [ ] AuthN/Z?


## Technology Stack

- **Framework**: Astro with React islands
- **UI Components**: shadcn/ui for a polished interface
- **Backend**: None (static site)
- **Hosting**: CDN (e.g., Vercel, Netlify)
- **Search**: Client-side search with Fuse.js
- **Styling**: Tailwind CSS
- **Language**: TypeScript
- **Data**: Static JSON for emoji metadata
- **State Management**: RTK, and localStorage for persistence

## Getting Started

```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Build for production
bun run build

# Preview production build
bun run preview
```

## Testing

This project includes both unit tests and end-to-end tests. See [TESTING.md](TESTING.md) for details.

```bash
# Run unit tests
bun test

# Run E2E tests
bun run test:e2e

# Run all tests
bun run test:all
```

## Project Structure

- `src/components/` - React components
- `src/pages/` - Astro pages
- `src/layouts/` - Layout components
- `src/styles/` - Global styles
- `src/types/` - TypeScript type definitions
- `src/lib/` - Utility functions
- `src/data/` - Data files
- `public/emojis/` - Emoji image files
- `tests/` - Test setup and configuration
- `tests/` - E2E tests
