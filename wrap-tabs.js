const fs = require('fs')
const path = require('path')

const filePath = path.join(__dirname, 'app/dashboard/analytics/AnalyticsContent.tsx')
let lines = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').split('\n')
console.log('Lines before:', lines.length)

// Tab assignments for each section
const TAB_MAP = {
  'Overview Cards': 'overview',
  'AI Insights Summary': 'overview',
  'Traffic Overview': 'traffic',
  'Application Activity': 'applications',
  'Conversion Funnel': 'applications',
  'Conversion Rate Over Time': 'traffic',
  'Source & Device Insights': 'traffic',
  'Salary Insights Section': 'jobs',
  'Candidate Demographics': 'market',
  'Best Time to Post': 'traffic',
  'Market Benchmarking': 'market',
  'Application Quality Score': 'applications',
  'Cost Per Hire': 'market',
  'Job Description Performance': 'jobs',
  'Retention Funnel': 'jobs',
  'Job Performance Table': 'jobs',
  'Top Converting Jobs': 'applications',
  'Recent Activity': 'overview',
}

// Find all top-level section comments in the JSX
// These are lines like:  {/* Section Name */}
// Find the LAST return ( followed by <main — skip the loading return
let returnLine = -1
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].trim() === 'return (' && lines[i+1] && lines[i+1].includes('<main')) {
    returnLine = i
    break
  }
}
console.log('Return at L' + (returnLine + 1))

// Find the container div (where sections are)
const containerLine = lines.findIndex((l, i) => i > returnLine && l.includes('styles.container'))

// Find all section comment lines within the return block
const sectionComments = []
for (let i = returnLine; i < lines.length; i++) {
  if (lines[i].trim() === '</main>') break
  const m = lines[i].match(/^\s+\{\/\*\s+(.+?)\s+\*\/\}$/)
  if (m) {
    const name = m[1]
    if (TAB_MAP[name]) {
      sectionComments.push({ line: i, name, tab: TAB_MAP[name] })
    }
  }
}

console.log('\nFound sections:')
sectionComments.forEach(s => console.log(`  L${s.line + 1}: ${s.name} → ${s.tab}`))

// Build the edits
// Strategy: for each section, determine its span and wrap it.
// A section spans from its comment to just before the next section's comment (or end of container).
// Special cases:
// 1. Overview Cards + AI Insights are adjacent and both 'overview' — group them
// 2. Traffic Overview + Application Activity are inside a twoColGridEqual wrapper — split it
// 3. Conditional sections ({condition && (...)} need the tab check prepended

const edits = [] // { type: 'insert-before'|'insert-after'|'replace'|'delete', line, text }

// Process sections in order
for (let idx = 0; idx < sectionComments.length; idx++) {
  const sec = sectionComments[idx]
  const nextSec = sectionComments[idx + 1]

  // Skip AI Insights — it's grouped with Overview Cards
  if (sec.name === 'AI Insights Summary') continue

  // Skip Traffic Overview and Application Activity — handled specially
  if (sec.name === 'Traffic Overview' || sec.name === 'Application Activity') continue

  const commentLine = sec.line

  // Check if the section comment is the same as a subsection of the twoColGrid
  // (Traffic Overview and Application Activity are handled separately)

  // Check if this is a conditional section
  // Look at the line before the comment or the line after
  const lineAfterComment = lines[commentLine + 1]
  const lineBefore = lines[commentLine - 1]

  // Check for combined Overview Cards + AI Insights
  if (sec.name === 'Overview Cards') {
    // Find AI Insights end
    const aiIdx = sectionComments.findIndex(s => s.name === 'AI Insights Summary')
    const aiSec = sectionComments[aiIdx]
    const nextAfterAi = sectionComments[aiIdx + 1]

    // AI Insights is conditional: {aiInsightsSummary && (...)}
    // Find the closing `)}` of AI Insights
    let aiEnd = -1
    for (let i = aiSec.line + 1; i < (nextAfterAi ? nextAfterAi.line : lines.length); i++) {
      if (lines[i].trim() === ')}' && lines[i].search(/\S/) === 8) {
        aiEnd = i
      }
    }

    edits.push({ type: 'insert-before', line: commentLine, text: "        {activeTab === 'overview' && (\n          <>" })
    edits.push({ type: 'insert-after', line: aiEnd, text: "          </>\n        )}" })
    console.log(`  Overview group: L${commentLine + 1} to L${aiEnd + 1}`)
    continue
  }

  // Determine if this is a conditional section (line before comment or line after comment starts with {something && ()
  let isConditional = false
  let condLine = -1

  // Check if the line BEFORE the comment has a conditional like `{condition && (`
  if (lineBefore && lineBefore.trim().match(/^\{.+&&\s*\($/)) {
    isConditional = true
    condLine = commentLine - 1
  }
  // Check if the line AFTER the comment has a conditional
  else if (lineAfterComment && lineAfterComment.trim().match(/^\{.+&&\s*\($/)) {
    isConditional = true
    condLine = commentLine + 1
  }

  if (isConditional) {
    // Prepend activeTab check to the existing conditional
    edits.push({ type: 'prefix', line: condLine, prefix: `activeTab === '${sec.tab}' && ` })
    console.log(`  ${sec.name}: prefix conditional at L${condLine + 1}`)
  } else {
    // Wrap the section: find the end
    // The end is the line before the next section's comment (accounting for blank lines)
    let sectionEnd = -1

    if (nextSec) {
      // Search backwards from next section's comment for the section end
      // Skip blank lines and find the last non-blank line
      for (let i = nextSec.line - 1; i > commentLine; i--) {
        if (lines[i].trim() !== '') {
          sectionEnd = i
          break
        }
      }
    } else {
      // Last section — find the container close
      // Search backwards from </main> for </div> (container close)
      const mainClose = lines.findIndex((l, i) => i > commentLine && l.trim() === '</main>')
      for (let i = mainClose - 1; i > commentLine; i--) {
        if (lines[i].trim() !== '') {
          sectionEnd = i
          break
        }
      }
    }

    // But we need to check: if the previous line before the comment is a conditional
    // wrapper like `{demographics && (`, we need to include it
    // Already handled by the conditional check above

    // Insert wrapper AFTER the comment so the comment stays at JSX container level
    edits.push({ type: 'insert-after', line: commentLine, text: `        {activeTab === '${sec.tab}' && (` })
    edits.push({ type: 'insert-after', line: sectionEnd, text: `        )}` })
    console.log(`  ${sec.name}: wrap L${commentLine + 1} to L${sectionEnd + 1}`)
  }
}

// Handle Traffic Overview + Application Activity (split twoColGridEqual)
const twoColComment = lines.findIndex((l, i) => i > returnLine && l.includes('{/* Traffic Overview + Application Activity'))
if (twoColComment >= 0) {
  const twoColOpen = twoColComment + 1 // <div className={styles.twoColGridEqual}...>

  const trafficSec = sectionComments.find(s => s.name === 'Traffic Overview')
  const appSec = sectionComments.find(s => s.name === 'Application Activity')

  // Find where Application Activity comment is — Traffic Overview ends just before it
  const trafficEnd = appSec.line - 1 // line before Application Activity comment
  // Find actual last non-blank line of Traffic Overview
  let trafficEndActual = trafficEnd
  while (trafficEndActual > trafficSec.line && lines[trafficEndActual].trim() === '') trafficEndActual--

  // Find where the twoColGridEqual closes — it's the </div> after Application Activity
  // Look for the next section after Application Activity
  const appNextSec = sectionComments.find(s => s.line > appSec.line && s.name !== 'Application Activity')
  let appEnd = -1
  for (let i = appNextSec.line - 1; i > appSec.line; i--) {
    if (lines[i].trim() !== '') {
      appEnd = i
      break
    }
  }

  // The twoColGridEqual close is likely the line at appEnd or appEnd-1
  // It's a </div> at the same indent as the twoColGridEqual open
  const gridIndent = lines[twoColOpen].search(/\S/)

  // Check if appEnd line is the grid close </div>
  let gridClose = -1
  for (let i = appEnd; i >= appSec.line; i--) {
    if (lines[i].trim() === '</div>' && lines[i].search(/\S/) === gridIndent) {
      gridClose = i
      break
    }
  }

  console.log(`  twoColGrid: comment L${twoColComment + 1}, open L${twoColOpen + 1}, close L${gridClose + 1}`)
  console.log(`  Traffic Overview: L${trafficSec.line + 1} to L${trafficEndActual + 1}`)
  console.log(`  Application Activity: L${appSec.line + 1} to L${appEnd + 1}`)

  // Delete the twoColGridEqual wrapper
  edits.push({ type: 'delete', line: twoColComment }) // comment
  edits.push({ type: 'delete', line: twoColOpen }) // opening div
  if (gridClose >= 0) edits.push({ type: 'delete', line: gridClose }) // closing div

  // Wrap Traffic Overview — insert after comment, not before
  edits.push({ type: 'insert-after', line: trafficSec.line, text: `        {activeTab === 'traffic' && (` })
  edits.push({ type: 'insert-after', line: trafficEndActual, text: `        )}` })

  // Wrap Application Activity (accounting for grid close deletion)
  // If gridClose === appEnd, then appEnd will be deleted and we need to adjust
  let appEndForWrap = appEnd
  if (gridClose === appEnd) {
    // The grid close IS the last line — find the line before it
    appEndForWrap = appEnd - 1
    while (appEndForWrap > appSec.line && lines[appEndForWrap].trim() === '') appEndForWrap--
  }

  // Insert after comment, not before
  edits.push({ type: 'insert-after', line: appSec.line, text: `        {activeTab === 'applications' && (` })
  edits.push({ type: 'insert-after', line: appEndForWrap, text: `        )}` })
}

// Handle Candidate Demographics empty state (special conditional)
const demoEmptyIdx = lines.findIndex((l, i) => i > returnLine && l.includes('!demographics && candidateProfiles'))
if (demoEmptyIdx >= 0) {
  edits.push({ type: 'prefix', line: demoEmptyIdx, prefix: `activeTab === 'market' && ` })
  console.log(`  Candidate Demographics (empty): prefix at L${demoEmptyIdx + 1}`)
}

// Sort edits by line number (bottom to top for application)
edits.sort((a, b) => b.line - a.line)

console.log('\n=== Applying', edits.length, 'edits ===')

for (const edit of edits) {
  if (edit.type === 'insert-before') {
    lines.splice(edit.line, 0, edit.text)
  } else if (edit.type === 'insert-after') {
    lines.splice(edit.line + 1, 0, edit.text)
  } else if (edit.type === 'delete') {
    lines.splice(edit.line, 1)
  } else if (edit.type === 'prefix') {
    const line = lines[edit.line]
    const idx = line.indexOf('{')
    if (idx >= 0) {
      lines[edit.line] = line.substring(0, idx + 1) + edit.prefix + line.substring(idx + 1)
    }
  }
}

console.log('Lines after:', lines.length)

fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
console.log('Saved.')
