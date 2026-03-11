'use client'

export default function MessagesError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{ padding: '20px', color: 'red' }}>
      <h2>Messages Error</h2>
      <pre style={{ fontSize: '12px', whiteSpace: 'pre-wrap' }}>{error?.message}</pre>
      <pre style={{ fontSize: '10px', whiteSpace: 'pre-wrap' }}>{error?.stack}</pre>
      {error?.digest && (
        <pre style={{ fontSize: '10px', whiteSpace: 'pre-wrap' }}>digest: {error.digest}</pre>
      )}
      <button onClick={reset}>Try again</button>
    </div>
  )
}
