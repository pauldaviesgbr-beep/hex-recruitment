// UK Postcode lookup using postcodes.io API (free, no API key required)
// + Ideal Postcodes for individual street addresses (API key required)

export interface StreetAddress {
  line1: string
  line2: string
  city: string
  county: string
  postcode: string
}

export interface PostcodeResult {
  postcode: string
  addressLine1: string
  addressLine2: string
  city: string
  county: string
  country: string
  latitude: number
  longitude: number
}

export interface PostcodeAPIResponse {
  status: number
  result: {
    postcode: string
    quality: number
    eastings: number
    northings: number
    country: string
    nhs_ha: string
    longitude: number
    latitude: number
    european_electoral_region: string
    primary_care_trust: string
    region: string
    lsoa: string
    msoa: string
    incode: string
    outcode: string
    parliamentary_constituency: string
    admin_district: string
    parish: string
    admin_county: string | null
    admin_ward: string
    ced: string | null
    ccg: string
    nuts: string
    codes: {
      admin_district: string
      admin_county: string
      admin_ward: string
      parish: string
      parliamentary_constituency: string
      ccg: string
      ccg_id: string
      ced: string
      nuts: string
    }
  } | null
}

// Normalize UK postcode format (uppercase, proper spacing)
export function normalizePostcode(postcode: string): string {
  // Remove all spaces and convert to uppercase
  const clean = postcode.replace(/\s+/g, '').toUpperCase()

  // UK postcodes have the format: outcode (2-4 chars) + incode (3 chars)
  // Insert space before the last 3 characters
  if (clean.length >= 5 && clean.length <= 7) {
    return clean.slice(0, -3) + ' ' + clean.slice(-3)
  }

  return clean
}

// Validate UK postcode format
export function isValidPostcodeFormat(postcode: string): boolean {
  // UK postcode regex pattern
  const postcodeRegex = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i
  return postcodeRegex.test(postcode.trim())
}

// Lookup postcode using postcodes.io API
export async function lookupPostcode(postcode: string): Promise<PostcodeResult | null> {
  const normalized = normalizePostcode(postcode)

  if (!isValidPostcodeFormat(normalized)) {
    return null
  }

  try {
    const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(normalized)}`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      return null
    }

    const data: PostcodeAPIResponse = await response.json()

    if (data.status !== 200 || !data.result) {
      return null
    }

    const result = data.result

    // Build address from available data
    // NOTE: postcodes.io is a FREE API that only provides AREA-level data
    // It does NOT have street addresses (no thoroughfare, line_1, building_number, etc.)
    // Those fields are only available from paid APIs like Ideal Postcodes or Loqate
    // We populate city, county, and postcode - user must enter their street address manually

    const city = result.admin_district || result.region || ''
    const county = result.admin_county || result.region || ''
    const addressLine2 = result.parish && result.parish !== result.admin_district ? result.parish : ''

    return {
      postcode: result.postcode,
      addressLine1: '', // Street address NOT available from postcodes.io - user must enter manually
      addressLine2: addressLine2,
      city: city,
      county: county,
      country: result.country || 'England',
      latitude: result.latitude,
      longitude: result.longitude,
    }
  } catch (error) {
    console.error('[PostcodeLookup] Error:', error)
    return null
  }
}

// Autocomplete postcode suggestions
export async function autocompletePostcode(partial: string): Promise<string[]> {
  const clean = partial.replace(/\s+/g, '').toUpperCase()

  if (clean.length < 2) {
    return []
  }

  try {
    const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}/autocomplete`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      return []
    }

    const data = await response.json()

    if (data.status !== 200 || !data.result) {
      return []
    }

    return data.result.slice(0, 8) // Max 8 suggestions
  } catch (error) {
    console.error('[PostcodeAutocomplete] Error:', error)
    return []
  }
}

// Lookup individual street addresses via Ideal Postcodes (server-side proxy)
export async function lookupAddresses(postcode: string): Promise<StreetAddress[]> {
  const normalized = normalizePostcode(postcode)
  if (!isValidPostcodeFormat(normalized)) {
    return []
  }

  try {
    const url = `/api/address-lookup?postcode=${encodeURIComponent(normalized)}`
    const response = await fetch(url)

    if (!response.ok) {
      return []
    }

    const data = await response.json()
    return data.addresses || []
  } catch (error) {
    console.error('[AddressLookup] Error:', error)
    return []
  }
}
