'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { X } from 'lucide-react'
import { getNotice } from '@/lib/notice-codes'

// Dismissible amber banner. Reads ?notice=<code> from the URL and renders the
// matching message from src/lib/notice-codes.ts. Used to explain portal
// redirects/blocks instead of bouncing the user silently.
//
// useSearchParams must run under Suspense in the app router — the default
// export wraps the inner component so callers can drop <NoticeBanner /> in
// directly.

function NoticeBannerInner() {
  const params = useSearchParams()
  const notice = getNotice(params.get('notice'))
  const [dismissed, setDismissed] = useState(false)

  if (!notice || dismissed) return null

  return (
    <div
      role="status"
      className="mx-4 mt-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <div className="flex-1">
        <span>{notice.message}</span>
        {notice.actionLabel && notice.actionHref && (
          <Link
            href={notice.actionHref}
            className="ml-2 font-semibold underline underline-offset-2 hover:no-underline"
          >
            {notice.actionLabel}
          </Link>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded p-0.5 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-500/20"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export default function NoticeBanner() {
  return (
    <Suspense fallback={null}>
      <NoticeBannerInner />
    </Suspense>
  )
}
