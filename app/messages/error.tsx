'use client'

export default function MessagesError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{
      padding: '1.5rem',
      margin: '1rem',
      background: '#fff1f2',
      border: '2px solid #f87171',
      borderRadius: '8px',
      fontFamily: 'monospace',
      fontSize: '13px',
      wordBreak: 'break-word',
    }}>
      <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '0.75rem', color: '#dc2626' }}>
        [Messages Route] Runtime Error
      </div>
      <div style={{ marginBottom: '0.25rem' }}>
        <strong>Name:</strong> {error.name}
      </div>
      <div style={{ marginBottom: '0.25rem' }}>
        <strong>Message:</strong> {error.message}
      </div>
      {error.digest && (
        <div style={{ marginBottom: '0.5rem' }}>
          <strong>Digest:</strong> {error.digest}
        </div>
      )}
      <details open style={{ marginBottom: '0.75rem' }}>
        <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>Stack trace</summary>
        <pre style={{ whiteSpace: 'pre-wrap', margin: 0, color: '#7f1d1d', fontSize: '11px', overflowX: 'auto' }}>
          {error.stack}
        </pre>
      </details>
      <button
        onClick={reset}
        style={{
          padding: '0.4rem 1rem',
          background: '#dc2626',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '13px',
        }}
      >
        Retry
      </button>
    </div>
  )
}
