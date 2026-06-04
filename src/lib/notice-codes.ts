// Notice codes for the portal "you were redirected/blocked, here's why" banner.
// When a server component must redirect() because a prerequisite isn't met,
// append ?notice=<code> to the destination and the NoticeBanner renders the
// matching message. Keep codes short and stable — they appear in URLs.
//
// See SYSTEM_MAP "Known Gaps" — show a user-facing message on EVERY portal
// redirect or block. Render the param; never set it and ignore it.

export type NoticeCode = {
  message: string
  actionLabel?: string
  actionHref?: string
}

export const NOTICE_CODES: Record<string, NoticeCode> = {
  needs_reply_email: {
    message: 'Add a reply-to email on your profile before sending proposals.',
    actionLabel: 'Go to Profile',
    actionHref: '/sales/profile',
  },
  needs_kb_entries: {
    message: 'Add at least 5 knowledge base entries before going live.',
    actionLabel: 'Open Train TalkMate',
    actionHref: '/train',
  },
  plan_required_growth: {
    message: 'This feature is available on Growth and Pro plans.',
    actionLabel: 'View plans',
    actionHref: '/settings/billing',
  },
  chatbot_requires_growth: {
    message: 'The website chatbot is available on Growth and Pro plans.',
    actionLabel: 'View plans',
    actionHref: '/settings/billing',
  },
  golive_gate: {
    message: "Your agent isn't ready to go live yet. Complete the go-live checklist first.",
    actionLabel: 'View checklist',
    actionHref: '/settings',
  },
}

export function getNotice(code: string | null | undefined): NoticeCode | null {
  if (!code) return null
  return NOTICE_CODES[code] ?? null
}
