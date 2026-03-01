import { NextResponse } from 'next/server'

const POSTCODE_REGEX = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const postcode = searchParams.get('postcode')?.trim()

  if (!postcode || !POSTCODE_REGEX.test(postcode)) {
    return NextResponse.json({ addresses: [], error: 'Invalid postcode' }, { status: 400 })
  }

  const apiKey = process.env.IDEAL_POSTCODES_KEY
  if (!apiKey) {
    // No API key configured — return empty so component falls back to manual entry
    return NextResponse.json({ addresses: [] })
  }

  try {
    const encoded = encodeURIComponent(postcode.replace(/\s+/g, '').toUpperCase())
    const url = `https://api.ideal-postcodes.co.uk/v1/postcodes/${encoded}?api_key=${apiKey}`

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[AddressLookup] API error:', response.status, errorData)
      return NextResponse.json({ addresses: [] })
    }

    const data = await response.json()

    if (data.code !== 2000 || !data.result || !Array.isArray(data.result)) {
      return NextResponse.json({ addresses: [] })
    }

    // Map to simplified address objects
    const addresses = data.result.map((addr: any) => ({
      line1: [addr.line_1, addr.line_2].filter(Boolean).join(', '),
      line2: addr.line_3 || '',
      city: addr.post_town || '',
      county: addr.county || '',
      postcode: addr.postcode || postcode,
    }))

    return NextResponse.json({ addresses })
  } catch (err) {
    console.error('[AddressLookup] Fetch error:', err)
    return NextResponse.json({ addresses: [] })
  }
}
