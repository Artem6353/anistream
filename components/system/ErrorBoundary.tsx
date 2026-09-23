'use client';

import { Component, type ReactNode } from 'react';

/** Локальный error boundary (A6.3): ошибка в блоке не роняет страницу. */
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="empty-state" style={{ padding: 20 }}>
          <h2>Блок «{this.props.label ?? 'контент'}» сломался</h2>
          <p>{this.state.error.message}</p>
          <button className="btn btn--outline btn--sm" onClick={() => this.setState({ error: null })}>
            Повторить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
