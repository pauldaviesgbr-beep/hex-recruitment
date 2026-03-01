import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#2d3748',
          borderRadius: 36,
        }}
      >
        <svg width="120" height="120" viewBox="0 0 32 32">
          <polygon points="11,2.1 16.5,5.3 16.5,11.7 11,14.9 5.5,11.7 5.5,5.3" fill="none" stroke="#FFE500" strokeWidth="1.8" strokeLinejoin="round"/>
          <polygon points="21,2.1 26.5,5.3 26.5,11.7 21,14.9 15.5,11.7 15.5,5.3" fill="none" stroke="#FFE500" strokeWidth="1.8" strokeLinejoin="round"/>
          <polygon points="16,14.9 21.5,18.1 21.5,24.5 16,27.7 10.5,24.5 10.5,18.1" fill="none" stroke="#FFE500" strokeWidth="1.8" strokeLinejoin="round"/>
        </svg>
      </div>
    ),
    { ...size }
  )
}
