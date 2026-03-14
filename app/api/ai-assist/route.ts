import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
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
      const maxTokens = 1500
      const isEnhance = type === 'job-ad-enhance'

      systemPrompt = isEnhance
        ? `You are an expert UK hospitality recruitment copywriter. The employer has provided rough notes or bullet points about a job. Expand these into a full, compelling, professional UK job advertisement. Structure the output with clear sections covering: about the role, day-to-day responsibilities, requirements, and what the employer offers (salary, benefits, perks). Keep the tone warm, professional and appealing to UK job seekers. Return ONLY a valid JSON object with a single field: description (string, HTML formatted using <p>, <h3>, <ul> and <li> tags). No markdown fences, no extra text outside the JSON object.`
        : `You are an expert UK hospitality recruitment copywriter. Write a compelling, professional UK job advertisement for the hospitality sector. Return ONLY a valid JSON object with these fields: title (string), description (string, HTML formatted with <p> and <ul>/<li> tags), requirements (string, HTML formatted), benefits (string, HTML formatted or empty string). No markdown fences, no extra text outside the JSON object.`

      if (isEnhance) {
        userPrompt = `Enhance this job advertisement and return improved JSON:
Job Title: ${data.title || 'Not specified'}
Company: ${data.company || 'Not specified'}
Location: ${data.location || 'Not specified'}
Salary: ${data.salaryMin ? `£${data.salaryMin}${data.salaryMax ? ` - £${data.salaryMax}` : ''} per ${data.salaryPeriod || 'hour'}` : 'Competitive'}
Employment Type: ${data.employmentType || 'Full-time'}
Work Type: ${data.workLocationType || 'In person'}
Category: ${data.category || 'Not specified'}

Current Description:
${data.description || 'None provided'}

${data.companyDescription ? `Company Description: ${data.companyDescription}` : ''}`
      } else {
        userPrompt = `Write a job advertisement and return as JSON:
Job Title: ${data.title || 'Not specified'}
Company: ${data.company || 'Not specified'}
Location: ${data.location || 'Not specified'}
Salary: ${data.salaryMin ? `£${data.salaryMin}${data.salaryMax ? ` - £${data.salaryMax}` : ''} per ${data.salaryPeriod || 'hour'}` : 'Competitive'}
Employment Type: ${data.employmentType || 'Full-time'}
Work Type: ${data.workLocationType || 'In person'}
Category: ${data.category || 'Not specified'}

${data.bulletPoints ? `Key points to include:\n${data.bulletPoints}` : ''}
${data.companyDescription ? `About the company: ${data.companyDescription}` : ''}`
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
          max_tokens: maxTokens,
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
      const rawText = aiResult.content?.[0]?.text || ''

      try {
        const jobAd = JSON.parse(rawText)
        return NextResponse.json({ jobAd })
      } catch {
        console.error('Failed to parse job-ad JSON:', rawText)
        return NextResponse.json({ error: 'AI returned invalid format' }, { status: 502 })
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
        max_tokens: 512,
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
