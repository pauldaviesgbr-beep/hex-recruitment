'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  label?: string
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div style={{
        padding: '1.5rem',
        margin: '1rem',
        background: '#fff1f2',
        border: '2px solid #f87171',
        borderRadius: '8px',
        fontFamily: 'monospace',
        fontSize: '13px',
        overflowX: 'auto',
        wordBreak: 'break-word',
      }}>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '0.5rem', color: '#dc2626' }}>
          {this.props.label ? `[${this.props.label}] ` : ''}Runtime Error
        </div>
        <div style={{ marginBottom: '0.25rem' }}>
          <strong>Name:</strong> {error.name}
        </div>
        <div style={{ marginBottom: '0.5rem' }}>
          <strong>Message:</strong> {error.message}
        </div>
        <details open>
          <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>Stack trace</summary>
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0, color: '#7f1d1d', fontSize: '11px' }}>
            {error.stack}
          </pre>
        </details>
      </div>
    )
  }
}
