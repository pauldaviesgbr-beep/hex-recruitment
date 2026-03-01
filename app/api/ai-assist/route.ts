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
    } else {
      return NextResponse.json(
        { error: 'Invalid type. Use "summary" or "experience".' },
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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Anthropic API error:', errText)
      return NextResponse.json(
        { error: 'AI service temporarily unavailable' },
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
