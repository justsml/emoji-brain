# Testing in Emoji Explorer

This project uses two main testing frameworks:

1. **Vitest** for unit testing
2. **Playwright** for end-to-end (E2E) testing

## Unit Testing with Vitest

Unit tests are located alongside the components they test, with a `.test.tsx` extension.

### Running Unit Tests

```bash
# Run all unit tests
npm test

# Run unit tests in watch mode
npm run test:watch

# Run unit tests with UI
npm run test:ui

# Run unit tests with coverage
npm run test:coverage
```

## E2E Testing with Playwright

E2E tests are located in the `tests` directory.

### Running E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui
```

## Running All Tests

To run both unit tests and E2E tests:

```bash
npm run test:all
```

## Test Structure

### Unit Tests

- `src/components/*.test.tsx` - Tests for React components

### E2E Tests

- `tests/*.spec.ts` - E2E tests for application flows

## Configuration Files

- `vitest.config.ts` - Configuration for Vitest
- `playwright.config.ts` - Configuration for Playwright
- `tests/setup.ts` - Setup file for Vitest tests

## Current Status

Some unit tests are currently skipped due to issues with the testing environment. We're working on fixing these issues.

The E2E tests are functional and test the main application flows.