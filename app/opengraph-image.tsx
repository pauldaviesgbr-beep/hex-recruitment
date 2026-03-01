import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Hex — Talent Recruitment'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #2d3748 0%, #1a202c 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Honeycomb Icon */}
        <svg width="80" height="80" viewBox="0 0 32 32">
          <polygon points="11,2.1 16.5,5.3 16.5,11.7 11,14.9 5.5,11.7 5.5,5.3" fill="none" stroke="#FFE500" strokeWidth="1.8" strokeLinejoin="round"/>
          <polygon points="21,2.1 26.5,5.3 26.5,11.7 21,14.9 15.5,11.7 15.5,5.3" fill="none" stroke="#FFE500" strokeWidth="1.8" strokeLinejoin="round"/>
          <polygon points="16,14.9 21.5,18.1 21.5,24.5 16,27.7 10.5,24.5 10.5,18.1" fill="none" stroke="#FFE500" strokeWidth="1.8" strokeLinejoin="round"/>
        </svg>

        <div
          style={{
            fontSize: 56,
            fontWeight: 900,
            color: '#ffffff',
            marginTop: 24,
            letterSpacing: '-1px',
          }}
        >
          HEX
        </div>
        <div
          style={{
            fontSize: 28,
            color: 'rgba(255, 255, 255, 0.7)',
            marginTop: 12,
          }}
        >
          Talent Recruitment
        </div>
        <div
          style={{
            display: 'flex',
            gap: 32,
            marginTop: 40,
            fontSize: 20,
            color: '#FFE500',
            fontWeight: 700,
          }}
        >
          <span>1,000+ Jobs</span>
          <span>•</span>
          <span>All UK Sectors</span>
          <span>•</span>
          <span>Free for Job Seekers</span>
        </div>
      </div>
    ),
    { ...size }
  )
}
