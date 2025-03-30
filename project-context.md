# Emoji Explorer Project Context

## Project Overview

Building a beautiful Emoji Explorer web application with a responsive grid layout that adapts seamlessly across all device sizes, featuring a robust search bar with interactive drop-down filters.

## Technical Requirements

- Use all images in `public/emojis` folder
- Implement a responsive grid layout (3-9 columns)
- Utilize shadcn-ui components
- Implement smooth animations
- Use static JSON index file(s) for data
- Support light/dark mode
- Create a selection system with persistent state
- Add export functionality (plain text, HTML, CSS, ZIP)
- Ensure keyboard navigation and screen reader compatibility
- Include micro-interactions
- Use TypeScript & React
- Use Tailwind CSS for styling
- Use `bun` instead of node/npm for all package and script operations
- Commit changes after every feature, include complete discussion.

## Project Architecture

- Astro as the base framework
- React for interactive components
- TypeScript for type safety
- Tailwind CSS for styling
- shadcn-ui for UI components
- Bun as the JavaScript runtime and package manager
- Local storage for persistent state

## Component Structure

1. **Layout Components**
   - Main layout with theme toggle
   - Responsive grid container

2. **Feature Components**
   - Search bar with filters
   - Emoji grid with responsive layout
   - Emoji card component
   - Category filter component
   - Selection management
   - Export functionality

3. **Data Management**
   - Emoji metadata generation
   - Search and filter logic
   - Selection state management

## Development Phases

1. Project setup and dependency installation
2. Data preparation and indexing
3. Core UI components development
4. Feature implementation
5. Accessibility enhancements
6. Testing and refinement
