const fs = require('fs')
const path = require('path')

const origPath = path.join(__dirname, '_backup/app/dashboard/analytics/page.tsx')
const outPath = path.join(__dirname, 'app/dashboard/analytics/AnalyticsContent.tsx')

let lines = fs.readFileSync(origPath, 'utf8').split('\n')
console.log('Original lines:', lines.length)

const toDelete = new Set()

// Helper: count div opens/closes properly (accounting for self-closing <div ... />)
function countDivs(line) {
  const totalOpens = (line.match(/<div[\s>]/g) || []).length
  const selfClosing = (line.match(/<div[^>]*\/>/g) || []).length
  const opens = totalOpens - selfClosing
  const closes = (line.match(/<\/div>/g) || []).length
  return { opens, closes }
}

// ==========================================
// PHASE 1: Find and mark collapsible wrapper closings FIRST (on unmodified file)
// ==========================================
// Uses indentation-based pattern matching instead of depth tracking.
// Every collapsible section ends with two consecutive </div> tags:
//   </div>  at collapsibleInner indent  (innerClose)
//   </div>  at collapsibleContent indent (contentClose)
// We find these by matching indentation from the opening tags.

console.log('\n=== Finding collapsible wrapper closings ===')

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('styles.collapsibleContent') && !lines[i].trim().startsWith('//')) {
    const contentOpenLine = i
    const contentIndent = lines[i].search(/\S/)

    // The collapsibleInner should be the next line (or within 1-2 lines)
    let innerOpenLine = -1
    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
      if (lines[j].includes('styles.collapsibleInner') && !lines[j].includes('sectionCardInner')) {
        innerOpenLine = j
        break
      }
    }

    if (innerOpenLine < 0) {
      console.log('  WARNING: No collapsibleInner found after collapsibleContent at L' + (i+1))
      continue
    }

    const innerIndent = lines[innerOpenLine].search(/\S/)

    // Find the section boundary: next sectionCard opening or </main> or closing )} at parent level
    let boundary = lines.length
    for (let j = innerOpenLine + 3; j < lines.length; j++) {
      // Next sectionCard opening (with <div)
      if (lines[j].includes('styles.sectionCard}') && lines[j].trimStart().startsWith('<div')) {
        boundary = j
        break
      }
      if (lines[j].trim() === '</main>') {
        boundary = j
        break
      }
    }

    // Search backwards from boundary for </div> at contentIndent (contentClose)
    let contentCloseLine = -1
    for (let j = boundary - 1; j > innerOpenLine; j--) {
      if (lines[j].trim() === '</div>' && lines[j].search(/\S/) === contentIndent) {
        contentCloseLine = j
        break
      }
    }

    // Search backwards from contentCloseLine for </div> at innerIndent (innerClose)
    let innerCloseLine = -1
    if (contentCloseLine > 0) {
      for (let j = contentCloseLine - 1; j > innerOpenLine; j--) {
        if (lines[j].trim() === '</div>' && lines[j].search(/\S/) === innerIndent) {
          innerCloseLine = j
          break
        }
      }
    }

    if (innerCloseLine < 0 || contentCloseLine < 0) {
      console.log('  WARNING: Could not find closing divs for collapsible at L' + (i+1))
      console.log('    contentIndent=' + contentIndent + ' innerIndent=' + innerIndent + ' boundary=L' + (boundary+1))
      continue
    }

    // Mark all 4 lines for deletion (2 openings + 2 closings)
    toDelete.add(contentOpenLine)
    toDelete.add(innerOpenLine)
    toDelete.add(innerCloseLine)
    toDelete.add(contentCloseLine)

    console.log('  Collapsible at L' + (contentOpenLine+1) + ': open=' + (contentOpenLine+1) + ',' + (innerOpenLine+1) + ' close=' + (innerCloseLine+1) + ',' + (contentCloseLine+1))
  }
}

// ==========================================
// PHASE 2: Mark other collapse-related lines for deletion
// ==========================================
console.log('\n=== Marking collapse logic ===')

// renderChevron JSX calls
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('renderChevron(') && !lines[i].includes('const renderChevron')) {
    toDelete.add(i)
  }
}
console.log('  renderChevron calls: marked')

// SECTION_KEYS and DEFAULT_EXPANDED
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const SECTION_KEYS') || lines[i].includes('const DEFAULT_EXPANDED')) {
    toDelete.add(i)
  }
}

// collapsedSections state
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('collapsedSections') && lines[i].includes('useState')) {
    let j = i
    while (j < lines.length) {
      toDelete.add(j)
      if (lines[j].includes('))') && j > i) break
      j++
    }
    console.log('  collapsedSections state: L' + (i+1) + '-L' + (j+1))

    // The SECTION_KEYS.forEach line that's part of the default setup
    for (let k = i; k < Math.min(i + 15, lines.length); k++) {
      if (lines[k].includes('SECTION_KEYS.forEach')) {
        toDelete.add(k)
      }
    }
    break
  }
}

// useEffect for localStorage
for (let i = 0; i < lines.length; i++) {
  if (toDelete.has(i)) continue
  if (lines[i].includes('useEffect')) {
    let isCollapseEffect = false
    for (let j = i; j < Math.min(i + 5, lines.length); j++) {
      if (lines[j].includes('localStorage') && (lines[j].includes('collapsed') || lines[j].includes('analytics_collapsed'))) {
        isCollapseEffect = true
        break
      }
    }
    if (isCollapseEffect) {
      // Track paren depth to find end
      let depth = 0, started = false
      for (let j = i; j < Math.min(i + 30, lines.length); j++) {
        for (const ch of lines[j]) {
          if (ch === '(') { depth++; started = true }
          if (ch === ')') depth--
        }
        toDelete.add(j)
        if (started && depth <= 0) {
          console.log('  localStorage useEffect: L' + (i+1) + '-L' + (j+1))
          break
        }
      }
    }
  }
}

// toggleSection callback
for (let i = 0; i < lines.length; i++) {
  if (toDelete.has(i)) continue
  if (lines[i].includes('const toggleSection') && lines[i].includes('useCallback')) {
    let depth = 0
    for (let j = i; j < Math.min(i + 20, lines.length); j++) {
      for (const ch of lines[j]) {
        if (ch === '{') depth++
        if (ch === '}') depth--
      }
      toDelete.add(j)
      if (depth <= 0 && j > i) {
        console.log('  toggleSection: L' + (i+1) + '-L' + (j+1))
        break
      }
    }
    break
  }
}

// allExpanded + toggleAllSections
for (let i = 0; i < lines.length; i++) {
  if (toDelete.has(i)) continue
  if (lines[i].includes('const allExpanded') && !lines[i].trim().startsWith('//')) {
    toDelete.add(i)
    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
      if (lines[j].includes('toggleAllSections') && lines[j].includes('useCallback')) {
        let depth = 0
        for (let k = j; k < Math.min(j + 20, lines.length); k++) {
          for (const ch of lines[k]) {
            if (ch === '{') depth++
            if (ch === '}') depth--
          }
          toDelete.add(k)
          if (depth <= 0 && k > j) {
            console.log('  allExpanded/toggleAll: L' + (i+1) + '-L' + (k+1))
            break
          }
        }
        break
      }
    }
    break
  }
}

// renderChevron function definition
for (let i = 0; i < lines.length; i++) {
  if (toDelete.has(i)) continue
  if (lines[i].includes('const renderChevron')) {
    let depth = 0, started = false
    for (let j = i; j < Math.min(i + 20, lines.length); j++) {
      for (const ch of lines[j]) {
        if (ch === '(') { depth++; started = true }
        if (ch === ')') depth--
      }
      toDelete.add(j)
      if (started && depth <= 0) {
        console.log('  renderChevron def: L' + (i+1) + '-L' + (j+1))
        break
      }
    }
    break
  }
}

// Collapse All button
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('collapseAllBtn') && !lines[i].trim().startsWith('//')) {
    let end = i
    while (end < lines.length && !lines[end].includes('</button>')) end++
    for (let k = i; k <= end; k++) toDelete.add(k)
    console.log('  Collapse All button: L' + (i+1) + '-L' + (end+1))
    break
  }
}

// ==========================================
// PHASE 3: In-place text replacements
// ==========================================

// Replace collapsibleHeader with simple flex div
for (let i = 0; i < lines.length; i++) {
  if (toDelete.has(i)) continue
  if (lines[i].includes('styles.collapsibleHeader') && lines[i].includes('onClick')) {
    const indent = lines[i].match(/^\s*/)[0]
    lines[i] = indent + "<div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>"
  }
}

// Remove sectionCardCollapsed conditionals
for (let i = 0; i < lines.length; i++) {
  if (toDelete.has(i)) continue
  if (lines[i].includes('sectionCardCollapsed')) {
    lines[i] = lines[i].replace(/\s*\$\{collapsedSections\.\w+\s*\?\s*styles\.sectionCardCollapsed\s*:\s*''\}/, '')
  }
}

// Change function name
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('export default function AnalyticsPage()')) {
    lines[i] = lines[i].replace('AnalyticsPage', 'AnalyticsContent')
    break
  }
}

// Add useSearchParams import
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("import { useRouter } from 'next/navigation'")) {
    lines[i] = "import { useRouter, useSearchParams } from 'next/navigation'"
    break
  }
}

// ==========================================
// PHASE 4: Apply deletions
// ==========================================
const sorted = [...toDelete].sort((a, b) => b - a)
for (const idx of sorted) {
  lines.splice(idx, 1)
}
console.log('\nDeleted', toDelete.size, 'lines. New length:', lines.length)

// Clean remaining collapsedSections references
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i] && lines[i].includes('collapsedSections') && !lines[i].trim().startsWith('//')) {
    lines.splice(i, 1)
  }
}

// Clean excessive blank lines
for (let i = lines.length - 1; i >= 2; i--) {
  if (lines[i] && lines[i-1] && lines[i-2] &&
      lines[i].trim() === '' && lines[i-1].trim() === '' && lines[i-2].trim() === '') {
    lines.splice(i, 1)
  }
}

// ==========================================
// PHASE 5: Add types, constants, state, tab bar
// ==========================================
const dateRangeIdx = lines.findIndex(l => l && l.startsWith("type DateRange = "))
if (dateRangeIdx >= 0) {
  lines.splice(dateRangeIdx + 1, 0,
    "type AnalyticsTab = 'overview' | 'traffic' | 'applications' | 'jobs' | 'market'",
    "",
    "const TABS: { key: AnalyticsTab; label: string; icon: string }[] = [",
    "  { key: 'overview', label: 'Overview', icon: '\\u{1F4CA}' },",
    "  { key: 'traffic', label: 'Traffic & Sources', icon: '\\u{1F310}' },",
    "  { key: 'applications', label: 'Applications', icon: '\\u{1F4CB}' },",
    "  { key: 'jobs', label: 'Jobs', icon: '\\u{1F4BC}' },",
    "  { key: 'market', label: 'Market & Candidates', icon: '\\u{1F465}' },",
    "]"
  )
}

const routerIdx = lines.findIndex(l => l && l.trim() === 'const router = useRouter()')
if (routerIdx >= 0) {
  lines.splice(routerIdx + 1, 0,
    "  const searchParams = useSearchParams()",
    "",
    "  const initialTab = (searchParams.get('tab') as AnalyticsTab) || 'overview'",
    "  const [activeTab, setActiveTabState] = useState<AnalyticsTab>(",
    "    TABS.some(t => t.key === initialTab) ? initialTab : 'overview'",
    "  )",
    "  const setActiveTab = useCallback((tab: AnalyticsTab) => {",
    "    setActiveTabState(tab)",
    "    const url = tab === 'overview' ? '/dashboard/analytics' : `/dashboard/analytics?tab=${tab}`",
    "    router.replace(url, { scroll: false })",
    "  }, [router])"
  )
}

// Add tab bar after pageHeader
let returnIdx = -1
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i] && lines[i].trim() === 'return (' && lines[i+1] && lines[i+1].includes('<main')) {
    returnIdx = i
    break
  }
}

let pageHeaderClose = -1
for (let i = returnIdx; i < lines.length; i++) {
  if (lines[i] && lines[i].includes('styles.pageHeader')) {
    let d = 0
    for (let j = i; j < lines.length; j++) {
      const { opens, closes } = countDivs(lines[j])
      d += opens - closes
      if (d <= 0) {
        pageHeaderClose = j
        break
      }
    }
    break
  }
}

if (pageHeaderClose >= 0) {
  lines.splice(pageHeaderClose + 1, 0,
    "",
    "        {/* Tab Bar */}",
    "        <div className={styles.tabBar}>",
    "          {TABS.map(tab => (",
    "            <button",
    "              key={tab.key}",
    "              className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}",
    "              onClick={() => setActiveTab(tab.key)}",
    "            >",
    "              <span className={styles.tabIcon}>{tab.icon}</span>",
    "              {tab.label}",
    "            </button>",
    "          ))}",
    "        </div>"
  )
}

// ==========================================
// PHASE 6: Verify div depth
// ==========================================
returnIdx = -1
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i] && lines[i].trim() === 'return (' && lines[i+1] && lines[i+1].includes('<main')) {
    returnIdx = i
    break
  }
}

let depth = 0
for (let i = returnIdx; i < lines.length; i++) {
  if (!lines[i]) continue
  if (lines[i].trim().startsWith('//')) continue
  const { opens, closes } = countDivs(lines[i])
  depth += opens - closes
  if (lines[i].trim() === '</main>') {
    console.log('\nDiv depth at </main>:', depth, depth === 0 ? 'OK' : 'WRONG')
    break
  }
}

// Check for remaining collapse references
let remaining = 0
for (let i = 0; i < lines.length; i++) {
  if (!lines[i] || lines[i].trim().startsWith('//')) continue
  if (lines[i].includes('collapsible') || lines[i].includes('collapsedSections') ||
      lines[i].includes('renderChevron') || lines[i].includes('toggleSection') ||
      lines[i].includes('SECTION_KEYS') || (lines[i].includes('allExpanded') && !lines[i].includes('$'))) {
    console.log('Remaining: L' + (i+1) + ': ' + lines[i].trim().substring(0, 60))
    remaining++
  }
}
if (remaining === 0) console.log('No remaining collapse references!')

fs.writeFileSync(outPath, lines.join('\n'), 'utf8')
console.log('\nSaved. Final length:', lines.length)
