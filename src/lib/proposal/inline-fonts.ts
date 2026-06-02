// Inline the self-hosted Outfit fonts as base64 data URIs.
//
// The PDF renderer feeds HTML into Chromium via page.setContent(), which has NO
// base URL — so url("/fonts/outfit-latin.woff2") references CANNOT be fetched and
// the PDF would silently fall back to Arial. Replacing those url(...) references
// with self-contained data: URIs guarantees the branded font renders in the PDF.
//
// Only the PDF path needs this. The confirmation page (Task 12) is served by Next
// with a real origin, so its /fonts URLs resolve normally.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let cached: { latin: string; latinExt: string } | null = null

function loadFontDataUris(): { latin: string; latinExt: string } {
  if (cached) return cached
  const latin = readFileSync(join(process.cwd(), 'public/fonts/outfit-latin.woff2')).toString('base64')
  const latinExt = readFileSync(join(process.cwd(), 'public/fonts/outfit-latin-ext.woff2')).toString('base64')
  cached = {
    latin: `data:font/woff2;base64,${latin}`,
    latinExt: `data:font/woff2;base64,${latinExt}`,
  }
  return cached
}

// Replace every url("/fonts/outfit-latin*.woff2") in the HTML with an inline
// base64 data URI so headless Chromium can render the branded font.
export function inlineFonts(html: string): string {
  const { latin, latinExt } = loadFontDataUris()
  return html
    // latin-ext first so the longer path is matched before the substring "/fonts/outfit-latin"
    .replaceAll('url("/fonts/outfit-latin-ext.woff2")', `url("${latinExt}")`)
    .replaceAll('url("/fonts/outfit-latin.woff2")', `url("${latin}")`)
}
