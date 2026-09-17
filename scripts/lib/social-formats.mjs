// HOW MUCH OF THE FRAME EACH PLATFORM COVERS WITH ITS OWN UI.
//
// ONE COPY, imported by both generators. It was one copy in
// make-social-video.mjs and zero copies in make-social-card.mjs, which is how
// the still cards came to place every word of type underneath TikTok's caption
// and button column — measured 11 Sept 2026, at 78–96% of the frame height
// against a UI that starts at 70%.
//
// A SECOND COPY DOES NOT STAY A COPY, so these numbers do not get retyped into
// a second file. If a platform changes its chrome, it changes here and both
// generators follow.
//
// The share is measured FROM THE BOTTOM. Text sits above it, never in it.

export const BOTTOM_SAFE = {
  // LinkedIn's feed lays almost nothing over the image.
  linkedin: 0.06,
  // Instagram's 4:5 FEED image is not overlaid at all — the caption sits below
  // the picture rather than on it. This is the only format with no reservation,
  // and it is why the branded footer can sit on the bottom edge there.
  instagram_feed: 0,
  // Instagram Stories and Reels: reply bar, handle, and any sticker.
  instagram_story: 0.20,
  // TikTok: caption, username and the right-hand button column. The deepest of
  // the four, and the reason a card laid out for Instagram is unreadable here.
  tiktok: 0.30,
}

/** Pixels of reserved space at the bottom of a frame, for a named platform. */
export function bottomSafePx(platform, height) {
  const share = BOTTOM_SAFE[platform]
  if (share === undefined) {
    throw new Error(`unknown platform "${platform}" — known: ${Object.keys(BOTTOM_SAFE).join(', ')}`)
  }
  return Math.round(height * share)
}
