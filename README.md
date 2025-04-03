# Emoji Explorer

A beautiful web application for browsing, searching, and exporting emojis with a responsive grid layout.

## Features

- **Responsive Grid Layout**: Adapts seamlessly from 3 columns on mobile to 9 columns on desktop
- **Advanced Search**: Filter emojis by name, category, or tags
- **Category Filtering**: Quick access to emojis by category
- **Selection System**: Save your favorite emojis with persistent state
- **Export Options**: Export selected emojis as plain text, HTML, CSS, or ZIP
- **Dark Mode Support**: Automatic system preference detection for light/dark mode
- **Keyboard Navigation**: Full keyboard support for accessibility
- **Screen Reader Compatible**: Accessible to all users

## Technology Stack

- **Framework**: Astro with React islands
- **UI Components**: shadcn/ui for a polished interface
- **Styling**: Tailwind CSS
- **Language**: TypeScript
- **Data**: Static JSON for emoji metadata
- **State Management**: React hooks and localStorage for persistence

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Testing

This project includes both unit tests and end-to-end tests. See [TESTING.md](TESTING.md) for details.

```bash
# Run unit tests
npm test

# Run E2E tests
npm run test:e2e

# Run all tests
npm run test:all
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
