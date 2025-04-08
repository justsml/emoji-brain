# Product Context

This file provides a high-level overview of the project and the expected product that will be created. Initially based on project-context.md and all other available project-related information in the working directory.

2025-04-03 01:47:10 - Initial Memory Bank creation

## Project Goal

Building a beautiful Emoji Explorer web application with a responsive grid layout that adapts seamlessly across all device sizes, featuring a robust search bar with interactive drop-down filters.

## Key Features

* Responsive grid layout (3-9 columns)
* Interactive search with filters
* Light/dark mode support
* Selection system with persistent state
* Export functionality (plain text, HTML, CSS, ZIP)
* Keyboard navigation and screen reader compatibility
* Micro-interactions

## Overall Architecture

* Astro as the base framework
* React for interactive components
* TypeScript for type safety
* Tailwind CSS for styling
* shadcn-ui for UI components
* Bun as the JavaScript runtime and package manager
* Local storage for persistent state

## Component Structure

1. Layout Components
   - Main layout with theme toggle
   - Responsive grid container

2. Feature Components
   - Search bar with filters
   - Emoji grid with responsive layout
   - Emoji card component
   - Category filter component
   - Selection management
   - Export functionality

3. Data Management
   - Emoji metadata generation
   - Search and filter logic
   - Selection state management

---
*Updates will be appended as footnotes:*
[2025-04-03 01:47:10] - Initial creation from project-context.md