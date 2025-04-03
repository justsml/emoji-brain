import '@testing-library/jest-dom';
import { expect, afterEach, vi, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { JSDOM } from 'jsdom';

// Set up a DOM environment
beforeAll(() => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/',
  });
  
  global.window = dom.window as any;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
});

// Extend Vitest's expect method with methods from react-testing-library
expect.extend(matchers as any);

// Clean up after each test case (e.g. clearing jsdom)
afterEach(() => {
  cleanup();
});

// Mock the localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock the CustomEvent
class CustomEventMock extends Event {
  detail: any;
  constructor(type: string, options?: CustomEventInit) {
    super(type, options);
    this.detail = options?.detail;
  }
}

window.CustomEvent = CustomEventMock as any;

// Mock the URL.createObjectURL and URL.revokeObjectURL
window.URL.createObjectURL = vi.fn(() => 'mock-url');
window.URL.revokeObjectURL = vi.fn();