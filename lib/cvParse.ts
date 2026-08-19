// READ A CV AND SAY WHAT THE PERSON HAS DONE. PHASE 1: nothing reads the output.
//
// ── WHY A MODEL AND NOT A KEYWORD PARSER ─────────────────────────────────────
// A keyword scan cannot tell "five years on pastry" from "no pastry
// experience", and cannot tell that "CDP at The Ivy, 2019-2021" is a past role
// while "Sous Chef, present" is the current one. Both are the whole point. A
// model reads it correctly and costs pennies across 26 files.
//
// The vocabulary survives as the OUTPUT SCHEMA rather than the matcher: the
// model is told to return terms from our list and nothing else, so a match
// stays explainable — "because your CV mentions pastry, Michelin, brigade" —
// and no term reaches the database that the rest of the product cannot read.
//
// ── PDFs GO TO THE MODEL WHOLE. NO PDF LIBRARY. ──────────────────────────────
// A DEVIATION FROM THE BRIEF, WHICH SAID EXTRACT-THEN-SEND, and the reason is
// scanned CVs. Claude accepts a PDF as a document block and reads it directly,
// including one that is a PHOTOGRAPH of a page — which a text extractor
// returns nothing at all for. 16 of the 26 files are PDFs, and the brief's own
// worry was "if most come back empty the approach needs rethinking". Sending
// the file whole removes most of that risk instead of measuring it.
//
// DOCX has no such path, so it does need extracting: `mammoth`, chosen because
// it is the maintained standard for DOCX -> text, has no native dependencies,
// and ignores styling rather than emitting markup noise the model would have
// to wade through. 10 files.
//
// ── THE STATUSES ARE THE PRODUCT OF THIS PHASE ───────────────────────────────
// 'empty' vs 'failed' is the distinction that decides whether the next phase
// is worth building, so nothing here is allowed to blur it. A CV we could open
// and that had no readable content is 'empty' — a fact about the CV. 'failed'
// is a fact about US: a missing file, bytes we could not read, or a model
// response that did not fit the schema.

import Anthropic from '@anthropic-ai/sdk'
import { SKILL_TERMS, resolveSeniority } from './cvVocabulary'

export type CvParseStatus = 'ok' | 'empty' | 'unsupported' | 'failed'

export interface CvDerived {
  skills: string[]
  titles: string[]
  recentTitle: string | null
  /** ISO date the most recent role ENDED, or null. Null when the CV gives no
   *  dates, and null is a FACT rather than a gap to fill — see below. */
  recentEndDate: string | null
  /** Whether the most recent role is stated as current/ongoing. */
  recentIsCurrent: boolean
  seniorityRank: number | null
  /** Never removed. A CV is evidence of capability, not of intent. */
  inferred: true
}

export interface CvParseResult {
  status: CvParseStatus
  derived: CvDerived | null
  /** For the operator, never stored: why a failure failed. */
  note?: string
}

const MODEL = 'claude-opus-5'

/** File types we can read. Anything else is 'unsupported' — a real answer, not
 *  an error, and distinguishable from a file we tried and could not read. */
export function kindFor(path: string): 'pdf' | 'docx' | null {
  const ext = (path.split('.').pop() || '').toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx' || ext === 'doc') return 'docx'
  return null
}

const SYSTEM = `You read hospitality CVs and return structured data about them.

Return ONLY a JSON object. No preamble, no explanation, no markdown fences.

Schema:
{
  "roles": [
    {
      "title": "<the job title exactly as written on the CV>",
      "endDate": "<YYYY-MM or YYYY, or null if the CV gives no end date>",
      "isCurrent": <true if this role is described as current/present/ongoing>
    }
  ],
  "skills": ["<terms from the allowed list below, and ONLY from that list>"]
}

RULES THAT MATTER:

- "roles" must be ordered MOST RECENT FIRST. If the CV is in reverse order,
  reorder it. If dates are absent entirely, keep the CV's own order and set
  every endDate to null — do not invent or estimate dates.
- endDate is when the role ENDED. For a current role set isCurrent true and
  endDate null. Never use the date the CV was written or uploaded.
- Only include skills the CV gives POSITIVE evidence of. "No pastry
  experience", "keen to learn butchery" and "some exposure to fine dining" are
  NOT evidence. Omit them.
- Use ONLY these skill terms, copied exactly:
${SKILL_TERMS.join(', ')}
- If the document is not a CV, or contains no readable text at all, return
  {"roles": [], "skills": []}.`

/** Ask the model. Returns the raw parsed JSON or throws. */
async function askModel(
  client: Anthropic,
  content: Anthropic.MessageParam['content'],
): Promise<{ roles: { title: string; endDate: string | null; isCurrent: boolean }[]; skills: string[] }> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text).join('').trim()

  // PARSE DEFENSIVELY. The brief is explicit: a response that does not fit the
  // schema is 'failed', never a guess. The only tolerance is stripping a
  // markdown fence, because that is a formatting habit rather than a different
  // answer — anything beyond that and we do not know what we have.
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const parsed = JSON.parse(cleaned)
  if (!parsed || typeof parsed !== 'object') throw new Error('response was not an object')
  if (!Array.isArray(parsed.roles) || !Array.isArray(parsed.skills)) {
    throw new Error('response missing roles[] or skills[]')
  }
  return parsed
}

/** Turn the model's answer into what we store, dropping anything off-vocabulary. */
function toDerived(raw: { roles: any[]; skills: any[] }): CvDerived | null {
  const allowed = new Set(SKILL_TERMS)
  // THE MODEL IS TOLD TO STAY IN VOCABULARY AND IS NOT TRUSTED TO. A term that
  // slipped through would be a category nothing else in the product knows, and
  // the explainability argument dies the moment one appears.
  const skills = Array.from(new Set(
    raw.skills.filter((s: unknown): s is string => typeof s === 'string')
      .map(s => s.trim().toLowerCase())
      .filter(s => allowed.has(s)),
  ))

  const roles = raw.roles
    .filter((r: any) => r && typeof r.title === 'string' && r.title.trim())
    .map((r: any) => ({
      title: String(r.title).trim(),
      endDate: typeof r.endDate === 'string' && r.endDate.trim() ? r.endDate.trim() : null,
      isCurrent: r.isCurrent === true,
    }))

  if (!roles.length && !skills.length) return null   // genuinely nothing -> 'empty'

  // Canonical titles, deduped, order preserved (most recent first).
  const titles = Array.from(new Set(
    roles.map(r => resolveSeniority(r.title)?.title).filter((t): t is string => !!t),
  ))

  const first = roles[0] ?? null
  const recentRole = first ? resolveSeniority(first.title) : null

  // SENIORITY IS THE HIGHEST REACHED, not the most recent. A head chef now
  // running a small kitchen as sous is still a head chef in capability, and
  // the rank exists to describe what they CAN do. Which of the two the scorer
  // should lean on is a phase 3 question; both are stored so it stays open.
  const ranks = roles.map(r => resolveSeniority(r.title)?.rank)
    .filter((n): n is number => typeof n === 'number')
  const seniorityRank = ranks.length ? Math.max(...ranks) : null

  return {
    skills,
    titles,
    recentTitle: recentRole?.title ?? (first ? first.title : null),
    // RECENCY IS THE ROLE'S END DATE, never the upload date. A CV uploaded last
    // month can describe a job that ended two years ago, and a null here is a
    // fact — the CV gave no dates — not a gap to fill with today.
    recentEndDate: first?.endDate ?? null,
    recentIsCurrent: first?.isCurrent ?? false,
    seniorityRank,
    inferred: true,
  }
}

/**
 * Parse one CV. NEVER THROWS — every failure is a status, because this runs
 * across 26 real people's rows in a loop and one unreadable file must not stop
 * the other 25.
 */
export async function parseCv(
  fileBytes: Uint8Array,
  storagePath: string,
  client: Anthropic,
): Promise<CvParseResult> {
  const kind = kindFor(storagePath)
  if (!kind) return { status: 'unsupported', derived: null, note: `no reader for ${storagePath.split('.').pop()}` }

  try {
    let content: Anthropic.MessageParam['content']

    if (kind === 'pdf') {
      content = [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(fileBytes).toString('base64') },
        },
        { type: 'text', text: 'Extract the roles and skills from this CV.' },
      ]
    } else {
      const mammoth = await import('mammoth')
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(fileBytes) })
      const text = (value || '').trim()
      // A DOCX that yields nothing is 'empty' — the file opened fine and had no
      // words in it. That is not a failure of ours.
      if (text.length < 40) return { status: 'empty', derived: null, note: `${text.length} chars extracted` }
      content = [{ type: 'text', text: `Extract the roles and skills from this CV.\n\n${text.slice(0, 60000)}` }]
    }

    const raw = await askModel(client, content)
    const derived = toDerived(raw)
    if (!derived) return { status: 'empty', derived: null, note: 'model found no roles or skills' }
    return { status: 'ok', derived }
  } catch (err) {
    return { status: 'failed', derived: null, note: err instanceof Error ? err.message : String(err) }
  }
}
