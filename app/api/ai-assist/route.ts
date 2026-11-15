import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { rateLimit } from '@/lib/rateLimit'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    // Auth check: only authenticated users can use AI assist
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit: max 10 requests per minute per IP
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    if (!rateLimit(`ai-assist:${ip}`, 10, 60000)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 503 }
      )
    }

    const body = await request.json()
    const { type, data } = body

    let systemPrompt = ''
    let userPrompt = ''

    if (type === 'summary') {
      systemPrompt = 'You are a professional CV writer. Write a compelling, concise professional summary (3-4 sentences) for a job seeker. Use first person. Be specific and results-oriented. Do not use generic filler. Return only the summary text, no quotes or labels.'
      userPrompt = `Write a professional summary for someone with this background:
Name: ${data.name || 'Not specified'}
Current/Target Role: ${data.jobTitle || 'Not specified'}
Sector: ${data.sector || 'Not specified'}
Years of Experience: ${data.yearsExperience || 'Not specified'}
Key Skills: ${(data.skills || []).join(', ') || 'Not specified'}
Location: ${data.location || 'Not specified'}
${data.additionalContext ? `Additional context: ${data.additionalContext}` : ''}`
    } else if (type === 'experience') {
      systemPrompt = 'You are a professional CV writer. Write 4-5 concise, impactful bullet points describing responsibilities and achievements for a work experience entry. Start each bullet with a strong action verb. Include quantifiable results where possible. Return only the bullet points, each on a new line starting with •. No headers or labels.'
      userPrompt = `Write CV bullet points for this role:
Job Title: ${data.jobTitle || 'Not specified'}
Company: ${data.company || 'Not specified'}
Key Duties: ${data.keyDuties || 'Not specified'}
Duration: ${data.duration || 'Not specified'}
${data.additionalContext ? `Additional context: ${data.additionalContext}` : ''}`
    } else if (type === 'job-ad' || type === 'job-ad-enhance') {
      const isEnhance = type === 'job-ad-enhance'

      systemPrompt = isEnhance
        ? `You are a UK recruitment copywriter. The user will give you rough notes about a job. Write a compelling, professional job advertisement with these sections: About the Role, Key Responsibilities, What We're Looking For, What We Offer. Be concise and engaging. Respond ONLY with a valid JSON object in this exact format, no markdown, no extra text: {"description": "full html formatted job ad here"}`
        // GENERATE returns the THREE FIELDS THE FORM ACTUALLY HAS, not the old
        // title/description/requirements/benefits shape.
        //
        // IT MUST NOT RETURN A TITLE. By the time this runs the employer has
        // already typed one, and overwriting it would be a small betrayal on
        // the screen where trust matters most — she asked for help with the
        // words, not with the decision she had already made. The title is fed
        // IN as context instead: a generator that knows the role is a sous chef
        // writes better copy than one inferring it from a sentence.
        //
        // Plain text, not HTML: these three land in <textarea>s she edits by
        // hand, and HTML tags in a textarea are noise she has to delete.
        : `You are a UK hospitality recruitment copywriter. The employer will give you one sentence about a role, plus the structured details they have already entered. Write the three parts of a job advert in PLAIN TEXT (no HTML, no markdown, no bullet characters).

Return ONLY a valid JSON object with exactly these three fields:
  dayToDay        — what the person will actually be doing day to day. 2-4 sentences, concrete and specific to this kitchen or venue.
  experienceNeeded — the experience and skills genuinely needed. 2-3 sentences. Do not invent qualifications the employer did not mention.
  whatWeOffer     — what the employer offers: pay, hours, progression, the team, anything stated. 2-3 sentences.

Rules:
- Do NOT return a title, a company name, or a salary figure the employer did not give you.
- Do NOT invent benefits, certifications or requirements. If the sentence is thin, write less rather than padding.
- Write in plain British English, second person about the candidate ("You'll be running…"). No bullet lists, no headings, no markdown fences.`

      if (isEnhance) {
        userPrompt = `Write a job ad from these notes:
Job Title: ${data.title || 'Not specified'}
Location: ${data.location || 'Not specified'}
Salary: ${data.salaryMin ? `£${data.salaryMin}${data.salaryMax ? ` - £${data.salaryMax}` : ''}${data.salaryPeriod ? ` per ${data.salaryPeriod}` : ''}` : 'Not specified'}
Employment Type: ${data.employmentType || 'Full-time'}
${data.description || ''}`
      } else {
        userPrompt = `The employer described the role in their own words:
"${data.sentence || data.bulletPoints || ''}"

Details they have already entered — treat these as facts, do not contradict or repeat them verbatim:
Job Title: ${data.title || 'Not specified'}
Company: ${data.company || 'Not specified'}
Location: ${data.location || 'Not specified'}
Pay: ${data.salaryMin ? `£${data.salaryMin}${data.salaryMax && data.salaryMax !== data.salaryMin ? ` - £${data.salaryMax}` : ''} per ${data.salaryPeriod || 'hour'}` : 'Not stated'}
Employment Type: ${data.employmentType || 'Not specified'}
Contract: ${data.contractType || 'Not specified'}
Category: ${data.category || 'Not specified'}
${data.companyDescription ? `About the company: ${data.companyDescription}` : ''}

Return the three fields as JSON.`
      }

      const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })

      if (!aiResponse.ok) {
        const errText = await aiResponse.text()
        console.error('Anthropic API error:', aiResponse.status, errText)
        return NextResponse.json({ error: `AI service error (${aiResponse.status}): ${errText}` }, { status: 502 })
      }

      const aiResult = await aiResponse.json()
      let rawText = aiResult.content?.[0]?.text || ''

      // Strip markdown fences (```json ... ```) that the model adds
      // despite being told not to
      rawText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()

      // Robust JSON extraction — try direct parse first, then regex fallback
      let jobAd: Record<string, string> | null = null
      try {
        jobAd = JSON.parse(rawText)
      } catch {
        const match = rawText.match(/\{[\s\S]*\}/)
        if (match) {
          try {
            jobAd = JSON.parse(match[0])
          } catch {
            // fall through to error below
          }
        }
      }

      if (!jobAd) {
        console.error('Failed to parse job-ad JSON:', rawText.slice(0, 500))
        return NextResponse.json({ error: 'AI returned invalid format' }, { status: 502 })
      }

      return NextResponse.json({ jobAd })
    } else if (type === 'offer-letter') {
      const sectorLabel = data.sector && data.sector !== 'general' ? ` in the ${data.sector} sector` : ''
      // AI can't see the system clock — pass today's date in UK long-form so
      // the letter header uses it instead of a hallucinated date.
      const todayUK = new Date().toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
      systemPrompt = `You are a UK employment law expert. Write a professional, formal offer letter from an employer to a candidate${sectorLabel}. Use proper business letter format. Include all the details and clauses provided. Include standard UK employment terms appropriate for the sector. Be concise but thorough. Return only the letter text — no markdown, no JSON, no commentary. Use the supplied "Letter Date" as the date at the top of the letter — never invent or guess a date.

CRITICAL — End the letter at "Yours sincerely," (with the comma) and STOP. Do NOT generate any of the following — they are appended programmatically with deterministic layout, and any AI-generated equivalent will produce duplicate or misaligned signature blocks:
- Signature lines (no underscores, no "_______")
- Signatory blocks ("Authorised Signatory", "On behalf of...", "Yours faithfully," followed by a name slot, etc.)
- A candidate acceptance section ("I, [name], confirm...", "Signed: ___ Date: ___", etc.)
- Any placeholder for a typed name, date, or company representative beneath the closing.

The letter ends with the word "sincerely," followed by a single newline. Nothing after that.`

      // Support both new (clausesList array) and legacy (clauses object) formats
      let allClauses: string[] = data.clausesList || []
      if (allClauses.length === 0 && data.clauses && typeof data.clauses === 'object') {
        const cl = data.clauses
        if (cl.probation) allClauses.push(`Probationary period: ${cl.probation}`)
        if (cl.noticePeriod) allClauses.push(`Notice period: ${cl.noticePeriod}`)
        if (cl.workingHours) allClauses.push(`Working hours: ${cl.workingHours}`)
        if (cl.holiday) allClauses.push(`Holiday entitlement: ${cl.holiday}`)
        if (cl.pension) allClauses.push('Employer pension scheme included')
        if (cl.dbsCheck) allClauses.push('Subject to satisfactory DBS check')
        if (cl.uniformProvided) allClauses.push('Uniform will be provided')
      }

      // Build the candidate's address block from whatever the profile has.
      // Any missing lines are simply dropped so we never render a stray
      // blank line or a "null" in the letter head.
      const candidateAddressLines = [
        data.candidateAddressLine1,
        data.candidateAddressLine2,
        data.candidateCity,
        data.candidatePostcode,
      ].filter((line: unknown): line is string => typeof line === 'string' && !!line.trim())

      const addressBlock = candidateAddressLines.length > 0
        ? candidateAddressLines.join('\n')
        : '[no address on file — use no address block at all, do not emit placeholders]'

      userPrompt = `Write a formal offer letter with these details:
Letter Date: ${todayUK}
Company: ${data.company || 'The Company'}
Candidate: ${data.candidateName || 'The Candidate'}
Candidate Address:
${addressBlock}
Job Title: ${data.jobTitle || 'The Role'}
Salary: ${data.salary || 'To be confirmed'}
Start Date: ${data.startDate || 'TBC'}
Contract Type: ${data.contractType || 'Full-time'}
Sector: ${data.sector || 'General'}
${allClauses.length > 0 ? `\nClauses to include:\n${allClauses.map((c: string) => `- ${c}`).join('\n')}` : ''}
${data.additionalTerms ? `\nAdditional terms: ${data.additionalTerms}` : ''}

Formatting rules:
- Use the supplied Candidate Address verbatim in the addressee block, one line per element, directly under the candidate's name.
- If the Candidate Address line above is the bracketed "[no address on file...]" note, omit the addressee address block entirely — do NOT invent placeholders like "[Address Line 1]" or "[City]".`

      const offerRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })

      if (!offerRes.ok) {
        const errText = await offerRes.text()
        return NextResponse.json({ error: `AI service error (${offerRes.status}): ${errText}` }, { status: 502 })
      }

      const offerResult = await offerRes.json()
      const text = offerResult.content?.[0]?.text || ''
      return NextResponse.json({ text })
    } else if (type === 'offer-summary') {
      // Cheap secondary call — given an offer letter body, return a one-line
      // summary + a handful of structured tags we can filter the /offers
      // archive by. Called once at send-time; result is persisted.
      const letter = String(data?.text || '').slice(0, 12000)
      if (!letter.trim()) return NextResponse.json({ summary: '', tags: [] })

      systemPrompt = `You are summarising UK employment offer letters for a recruiter's internal dashboard. Read the letter and respond with strict JSON only (no prose, no markdown fences):

{ "summary": "<one sentence, under 140 chars, covering: contract type, salary, notice period, probation, and any notable conditions>", "tags": ["<tag>", ...] }

Tag vocabulary (emit only those that truly apply):
- "full-time", "part-time", "temporary", "fixed-term", "zero-hours", "casual"
- "probation-3mo", "probation-6mo"
- "notice-1wk", "notice-1mo", "notice-3mo"
- "has-nda", "has-noncompete", "has-dbs", "has-uniform", "has-pension", "has-health-insurance"
- "right-to-work", "references-required"
- "remote-ok", "hybrid", "onsite"
- "garden-leave", "ip-assignment"
- "safeguarding", "occupational-health"

Pick only genuinely-present tags. If uncertain, omit. Return at most 8 tags.`

      userPrompt = letter

      const sumRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })

      if (!sumRes.ok) {
        const errText = await sumRes.text()
        return NextResponse.json({ error: `AI service error (${sumRes.status}): ${errText}` }, { status: 502 })
      }

      const sumResult = await sumRes.json()
      const raw = sumResult.content?.[0]?.text || ''
      // Tolerate occasional stray markdown even though we asked for JSON only.
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      try {
        const parsed = JSON.parse(cleaned)
        const summary = typeof parsed.summary === 'string' ? parsed.summary.slice(0, 200) : ''
        const tags = Array.isArray(parsed.tags)
          ? parsed.tags.filter((t: unknown): t is string => typeof t === 'string').slice(0, 8)
          : []
        return NextResponse.json({ summary, tags })
      } catch {
        // If the model returned non-JSON, hand back empty values rather than
        // failing the send — summary/tags are a nice-to-have, not critical.
        return NextResponse.json({ summary: '', tags: [] })
      }
    } else {
      return NextResponse.json(
        { error: 'Invalid type.' },
        { status: 400 }
      )
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Anthropic API error:', response.status, errText)
      return NextResponse.json(
        { error: `AI service error (${response.status}): ${errText}` },
        { status: 502 }
      )
    }

    const result = await response.json()
    const text = result.content?.[0]?.text || ''

    return NextResponse.json({ text })
  } catch (error) {
    console.error('AI assist error:', error)
    return NextResponse.json(
      { error: 'Failed to generate text' },
      { status: 500 }
    )
  }
}
