import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

const DefaultFallback = ({ error }: { error: Error | null }) => (
  <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
    <h2 className="text-2xl font-semibold text-destructive mb-2">Something went wrong</h2>
    <p className="text-muted-foreground mb-4">
      {error?.message || 'An unexpected error occurred'}
    </p>
    <button
      onClick={() => window.location.reload()}
      type="button"
      className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
    >
      Reload page
    </button>
  </div>
);

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback || <DefaultFallback error={this.state.error} />;
    }

    return this.props.children;
  }
}
