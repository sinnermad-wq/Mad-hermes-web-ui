import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; message?: string; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{
          padding: '2rem', textAlign: 'center', fontFamily: 'monospace',
          color: '#c00', background: '#fee', minHeight: '100vh', display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
        }}>
          <strong>💥 App crashed</strong>
          <small style={{ color: '#666' }}>{this.state.message}</small>
          <button onClick={() => window.location.reload()} style={{ marginTop: '0.5rem', padding: '0.4rem 1rem', cursor: 'pointer' }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}