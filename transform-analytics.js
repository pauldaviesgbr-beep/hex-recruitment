const fs = require('fs')
const path = require('path')

const filePath = path.join(__dirname, 'app/dashboard/analytics/AnalyticsContent.tsx')
let lines = fs.readFileSync(filePath, 'utf8').split('\n')

// The correct base depth for sectionCards inside the container is 1.
// Each sectionCard should open FROM depth 1 to depth 2.
// We need to find all sectionCard openings and ensure they start at depth 1.
// If depth > 1 before a sectionCard, add </div> tags.
// If depth < 1 before a sectionCard, we have extra </div> tags that need removing.

const BASE_DEPTH = 1 // container div is the only parent div

// Phase 1: Identify all section card opening lines and their current depth
let depth = 0
const issues = [] // { lineIdx, currentDepth, neededClosingDivs }

// Start from the return statement
const returnLine = lines.findIndex(l => l.trim() === 'return (' && lines.indexOf(l) > 2640)
console.log('Return at line', returnLine + 1)

for (let i = returnLine; i < lines.length; i++) {
  const line = lines[i]
  if (line.trim() === '</main>') break
  if (line.trim().startsWith('//')) continue

  // Check BEFORE processing opens/closes on this line
  if (line.includes('styles.sectionCard}') && !line.includes('sectionCardInner') &&
      (line.match(/<div[\s>]/g) || []).length > 0) {
    if (depth !== BASE_DEPTH) {
      issues.push({
        lineIdx: i,
        currentDepth: depth,
        delta: depth - BASE_DEPTH,
        text: line.trim().substring(0, 80)
      })
    }
  }

  const opens = (line.match(/<div[\s>]/g) || []).length
  const closes = (line.match(/<\/div>/g) || []).length
  depth += opens - closes
}

console.log('\nSection card depth issues:')
issues.forEach(issue => {
  console.log(`  L${issue.lineIdx + 1}: depth=${issue.currentDepth} (need ${BASE_DEPTH}), delta=${issue.delta > 0 ? '+' : ''}${issue.delta}`)
})
console.log('Final depth before </main>:', depth, '(should be', BASE_DEPTH, ')')

if (depth !== BASE_DEPTH) {
  console.log(`\nAlso need to fix final depth: ${depth} -> ${BASE_DEPTH}`)
}

// Phase 2: Apply fixes
// For sections where depth > BASE_DEPTH, insert </div> tags BEFORE the sectionCard
// For sections where depth < BASE_DEPTH, we have extra </div> tags to find and remove (more complex)

// Process from bottom to top to preserve line numbers
const fixesDesc = [...issues].reverse()

for (const issue of fixesDesc) {
  if (issue.delta > 0) {
    // Need to add </div> tags before this line
    const closingDivs = []
    for (let d = 0; d < issue.delta; d++) {
      closingDivs.push('        </div>')
    }
    lines.splice(issue.lineIdx, 0, ...closingDivs)
    console.log(`Added ${issue.delta} </div> before L${issue.lineIdx + 1}`)
  } else if (issue.delta < 0) {
    // Need to remove -delta closing div tags before this line
    // Find the nearest </div> lines above and remove them
    let removed = 0
    const toRemove = -issue.delta
    for (let j = issue.lineIdx - 1; j >= 0 && removed < toRemove; j--) {
      if (lines[j].trim() === '</div>') {
        lines.splice(j, 1)
        removed++
        console.log(`Removed extra </div> at L${j + 1}`)
      }
    }
  }
}

// Fix final depth - add any needed closing divs before the container close
const containerCloseIdx = lines.findIndex((l, idx) =>
  idx > 4400 && l.trim() === '</div>' && lines[idx + 1] && lines[idx + 1].trim() === '</main>'
)

if (containerCloseIdx >= 0) {
  // Re-check depth at this point
  depth = 0
  for (let i = returnLine; i < containerCloseIdx; i++) {
    if (lines[i].trim().startsWith('//')) continue
    const opens = (lines[i].match(/<div[\s>]/g) || []).length
    const closes = (lines[i].match(/<\/div>/g) || []).length
    depth += opens - closes
  }
  console.log(`\nDepth before container close: ${depth} (should be ${BASE_DEPTH})`)
  if (depth > BASE_DEPTH) {
    const excess = depth - BASE_DEPTH
    const closings = []
    for (let d = 0; d < excess; d++) closings.push('        </div>')
    lines.splice(containerCloseIdx, 0, ...closings)
    console.log(`Added ${excess} </div> before container close`)
  }
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
console.log('\nFix complete!')

// Final verification
depth = 0
const verifyLines = fs.readFileSync(filePath, 'utf8').split('\n')
for (let i = returnLine; i < verifyLines.length; i++) {
  if (verifyLines[i].trim() === '</main>') {
    console.log('Depth before </main>:', depth, depth === 0 ? 'OK' : 'STILL WRONG')
    break
  }
  if (verifyLines[i].trim().startsWith('//')) continue
  const opens = (verifyLines[i].match(/<div[\s>]/g) || []).length
  const closes = (verifyLines[i].match(/<\/div>/g) || []).length
  depth += opens - closes
}
