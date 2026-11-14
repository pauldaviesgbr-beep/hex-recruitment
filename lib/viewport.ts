// IS THE SCREEN WIDE ENOUGH FOR A SPLIT PANE, ASKED AT THE MOMENT IT MATTERS.
//
// Four list pages (city, sector, saved, recommended) pick the first job for the
// laptop's right-hand pane. On a phone the same selection opens the job as a
// full-screen modal — so picking it there buried the page under a job nobody
// tapped (design review S06.1, 14 Nov 2026).
//
// Each page already kept an `isMobile` state, and gated on it. That state is
// set in an effect after the first render, so when the board is already in the
// shared jobs context (arriving from /jobs), the auto-select effect ran in the
// same commit and read the initial `false`. Reading the width here instead
// cannot be stale: it is the window, now.
//
// 768 matches the pages' own breakpoint (window.innerWidth < 768 = phone).
export function isSplitPaneWidth(): boolean {
  return typeof window !== 'undefined' && window.innerWidth >= 768
}
