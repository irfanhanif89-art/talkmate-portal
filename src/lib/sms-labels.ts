// Session 19 — plain English SMS type labels.
//
// Maps the system-level sms_type values written by /lib/sms.ts onto
// reassuring, customer-facing labels. CLIENT-FACING UI MUST USE
// getSmsLabel() — raw type names (especially the intelligence/recovery
// ones) should never reach the client portal.

export const SMS_TYPE_LABELS: Record<string, string> = {
  // Session 15 booking / scheduler SMS
  booking_confirmation:       'Booking confirmation',
  booking_reminder_24h:       'Booking reminder',
  booking_reminder_2h:        'Booking reminder',
  booking_cancellation:       'Cancellation notice',
  waitlist_offer:             'Waitlist update',
  waitlist_claimed:           'Waitlist update',
  waitlist_expired:           'Waitlist update',
  callback_reminder:          'Callback reminder',
  vip_missed_call:            'VIP missed call alert',
  // Session 18 Call Intelligence
  call_intelligence_alert:    'Quality alert',
  dropped_call_recovery:      'Missed call follow-up',
  early_hangup_recovery:      'Missed call follow-up',
  missed_lead_recovery:       'Missed call follow-up',
  // Catch-all
  other:                      'Message',
}

export function getSmsLabel(smsType: string | null | undefined): string {
  if (!smsType) return 'Message'
  return SMS_TYPE_LABELS[smsType] ?? 'Message'
}

// SMS types that should never appear in client-facing UI. These are
// internal admin/owner-facing system notifications.
export const ADMIN_ONLY_SMS_TYPES: ReadonlySet<string> = new Set([
  'call_intelligence_alert',
])

// Coarse-grained filter buckets shown to clients on /sms-activity. Maps
// a UI-friendly bucket name onto the underlying sms_type values that
// should match.
export const SMS_FILTER_BUCKETS: Record<string, ReadonlySet<string>> = {
  'Booking confirmations': new Set(['booking_confirmation']),
  'Reminders':             new Set(['booking_reminder_24h', 'booking_reminder_2h', 'callback_reminder']),
  'Missed call follow-ups': new Set(['dropped_call_recovery', 'early_hangup_recovery', 'missed_lead_recovery']),
  'Waitlist':              new Set(['waitlist_offer', 'waitlist_claimed', 'waitlist_expired']),
  'Cancellations':         new Set(['booking_cancellation']),
}

// AU phone formatting: +61412345678 -> 0412 345 678
export function formatAuPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/[^0-9+]/g, '')
  let local = digits
  if (digits.startsWith('+61')) local = '0' + digits.slice(3)
  else if (digits.startsWith('61') && digits.length >= 11) local = '0' + digits.slice(2)
  if (local.length === 10 && local.startsWith('0')) {
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`
  }
  return phone
}

// Status presentation. Client UI never shows "Failed".
export function clientSmsStatus(status: string | null | undefined): { label: string; color: string } {
  switch (status) {
    case 'sent':     return { label: 'Delivered', color: '#22C55E' }
    case 'queued':   return { label: 'Pending',   color: 'rgba(255,255,255,0.45)' }
    case 'failed':   return { label: 'Pending',   color: 'rgba(255,255,255,0.45)' }
    case 'rejected': return { label: 'Pending',   color: 'rgba(255,255,255,0.45)' }
    default:         return { label: 'Sent',      color: 'rgba(255,255,255,0.55)' }
  }
}

export function adminSmsStatus(status: string | null | undefined): { label: string; color: string } {
  switch (status) {
    case 'sent':     return { label: 'Delivered', color: '#22C55E' }
    case 'queued':   return { label: 'Queued',    color: '#F59E0B' }
    case 'failed':   return { label: 'Failed',    color: '#EF4444' }
    case 'rejected': return { label: 'Rejected',  color: '#EF4444' }
    default:         return { label: status ?? 'Unknown', color: 'rgba(255,255,255,0.55)' }
  }
}
