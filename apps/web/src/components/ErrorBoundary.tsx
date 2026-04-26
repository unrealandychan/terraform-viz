'use client';
import React from 'react';
interface Props { children: React.ReactNode; fallback?: React.ReactNode; name?: string; }
interface State { hasError: boolean; error?: Error; }
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError(error: Error): State { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error(`[ErrorBoundary:${this.props.name}]`, error, info); }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{ padding: '1rem', color: '#ef4444', background: '#1a1a2e', borderRadius: 8, border: '1px solid #ef4444' }}>
          <strong>Something went wrong</strong>
          {this.state.error && <pre style={{ fontSize: 12, marginTop: 8, opacity: 0.7 }}>{this.state.error.message}</pre>}
          <button onClick={() => this.setState({ hasError: false })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}
