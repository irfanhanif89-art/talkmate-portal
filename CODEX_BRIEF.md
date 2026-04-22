# TalkMate Portal — Dashboard Enhancement Task

You are enhancing the TalkMate portal at src/app/(portal)/. Do NOT rebuild from scratch. Enhance what exists. Build must pass before commit.

## BRAND TOKENS
navy:#061322, navy2:#0A1E38, navy3:#0D1F35, blue:#1565C0, blue-light:#4A9FE8, orange:#E8622A, orange-dark:#C04A0F, green:#22C55E, amber:#F59E0B, red:#EF4444. Font: Outfit.

---

## CHANGE 1 — REVENUE PROOF STRIP

### Server component (dashboard/page.tsx):
Add these computed values passed to DashboardClient:
- `callsAnsweredToday`: count of calls where outcome !== 'Missed' AND date(created_at) = today (use .gte/.lte with today's midnight)
- `revenueRecoveredThisMonth`: query 'jobs' table for sum of job_value where business_id matches and created_at >= start of month. If jobs table doesn't exist or returns null, fallback to (totalMonth * 85) and set `revenueIsEstimate: true`
- `vsLastMonthPercent`: compute last month's call count, then ((thisMonth - lastMonth) / Math.max(lastMonth, 1)) * 100, rounded to integer

### Client component (dashboard-client.tsx):
Add `callsAnsweredToday`, `revenueRecoveredThisMonth`, `vsLastMonthPercent`, `revenueIsEstimate` to Props interface.

Add a `RevenueStrip` component rendered BETWEEN the welcome header and the stat cards:

```
Background: linear-gradient(135deg, rgba(21,101,192,0.15), rgba(232,98,42,0.1))
Border: 1px solid rgba(21,101,192,0.25)
Border-radius: 12px
Padding: 14px 18px
Display: flex, align-items: center, gap: 20px
Margin-bottom: 20px
```

Four data points in a flex row, each separated by a 1px rgba(255,255,255,0.08) vertical divider (height 32px):

1. Revenue recovered — value in #E8622A, fontSize 22, fontWeight 800. Format: `$${(revenueRecoveredThisMonth).toLocaleString()}${revenueIsEstimate ? ' est.' : ''}`. Label: 'Revenue recovered' 10px rgba(255,255,255,0.45).
2. Calls answered today — value in #4A9FE8, same size. Label: 'Answered today'.
3. Avg order lift — static '+23%' in #22C55E. Label: 'Avg order lift'.
4. Google rating — static '—'. Label: 'Google rating' with '(connect in Settings)' in 9px muted below.

Right side: flex-shrink 0. CTA tile:
- background rgba(232,98,42,0.15), border 1px solid rgba(232,98,42,0.3), border-radius 8px, padding 8px 14px, cursor pointer
- onClick: router.push('/analytics')
- Line 1: 'See full report' 11px fontWeight 600 color #E8622A
- Line 2: 'Analytics →' 10px rgba(255,255,255,0.4)

Empty state: when totalMonth === 0, replace the revenue value with:
- 'Your agent is live' white 13px fontWeight 600
- 'Make a test call to see your dashboard come alive →' rgba(255,255,255,0.45) 11px

---

## CHANGE 2 — STAT CARDS ENHANCEMENT

In dashboard-client.tsx, enhance the existing 4 stat cards. Add a context line below each value (fontSize 11, display block, marginTop 4px).

**Calls this month card:**
- If vsLastMonthPercent > 0: show `↑ ${vsLastMonthPercent}% vs last month` color #22C55E
- If vsLastMonthPercent < 0: show `↓ ${Math.abs(vsLastMonthPercent)}% vs last month` color #EF4444
- If vsLastMonthPercent === 0 OR totalMonth === 0: show 'No data from last month' color rgba(255,255,255,0.3)

**AI Resolution Rate card:**
- Color logic: >= 85 → #22C55E, 70-84 → #F59E0B, < 70 → #EF4444
- When totalMonth === 0: show '—' in rgba(255,255,255,0.3), title attr 'Will populate after your first call'
- Context: 'handled without transfer' rgba(255,255,255,0.35)

**Transferred card:**
- Context: 'escalated to you' rgba(255,255,255,0.35)

**Missed calls card:**
- If missedMonth === 0: value color #22C55E, context '100% answer rate 🎉' color #22C55E
- If missedMonth > 0: value color #EF4444, context `${missedMonth} call(s) not answered` color #EF4444

---

## CHANGE 3 — CONTEXTUAL UPSELL BANNER

Add a `UpsellBanner` component in dashboard-client.tsx, rendered between stat cards and the chart/calls grid.

Add to globals.css:
```css
@keyframes upsell-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
.upsell-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #E8622A;
  animation: upsell-pulse 2s ease-in-out infinite;
  flex-shrink: 0;
}
```

Banner design:
```
background: #0D1F35
border: 1px solid rgba(232,98,42,0.3)
border-radius: 11px
padding: 14px 16px
display: flex, align-items: center, gap: 12px
margin-bottom: 20px
```

Props needed: missedCallCount (already have as missedMonth), totalMonth (already have).
Hardcode: positiveCallPercent = 72 (label as 'platform avg').
weeklyPositiveCalls = Math.round(callsAnsweredToday * 5) || 3.

Dismiss logic:
```js
const [dismissed, setDismissed] = useState(false)
useEffect(() => {
  const t = localStorage.getItem('upsell_dismissed_at')
  if (t && Date.now() - parseInt(t) < 7 * 24 * 60 * 60 * 1000) setDismissed(true)
}, [])
if (dismissed) return null
```

Content logic (use first matching):
1. `missedMonth >= 1`: strong=`You missed ${missedMonth} call(s) this month — did that customer call a competitor?`, span=`Unlock SMS Follow-Ups to automatically reach out within 5 minutes of every missed call.`, cta=`Unlock SMS Follow-Ups — $39/mo →`, href=/billing
2. `totalMonth >= 50`: strong=`You handled ${totalMonth} calls this month. Outbound AI can proactively follow up every one.`, span=`Confirm jobs, chase quotes, and send reminders — automatically, while you sleep.`, cta=`Learn about Outbound AI — $79/mo →`, href=/billing
3. Default: strong=`Your agent is live and ready. Make your first test call.`, span=`Call your TalkMate number to see a call appear in your dashboard in real time.`, cta=`View your number →`, href=/settings

Structure:
```jsx
<div className="upsell-dot" />
<div style={{ flex: 1 }}>
  <span style={{ fontSize: 13, fontWeight: 600, color: 'white', display: 'block' }}>{strong}</span>
  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginTop: 3 }}>{span}</span>
</div>
<button onClick={() => router.push(href)} style={{ background: '#E8622A', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit,sans-serif', flexShrink: 0 }}>{cta}</button>
<span onClick={() => { localStorage.setItem('upsell_dismissed_at', Date.now().toString()); setDismissed(true) }} style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', cursor: 'pointer', marginLeft: 8, flexShrink: 0 }}>✕</span>
```

---

## CHANGE 4 — BILLING PAGE UPSELL CARDS

In src/app/(portal)/billing/page.tsx:

### Section header: replace the add-ons section heading with:
```jsx
<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
  <div style={{ flex: 1 }}>
    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'white', margin: '0 0 4px' }}>Grow your revenue with add-ons</h3>
    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>Each add-on pays for itself — most clients recover the cost within the first week.</p>
  </div>
  <div style={{ textAlign: 'right' as const }}>
    <div style={{ fontSize: 22, fontWeight: 800, color: '#E8622A' }}>14x</div>
    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>average add-on ROI</div>
  </div>
</div>
```

### Add-on card structure (apply to all 3 existing add-on cards):

Card wrapper: background #0A1E38, border 1px solid rgba(255,255,255,0.07), border-radius 14px, padding 20px, position relative, display flex, flexDirection column.

Top row: display flex, alignItems flex-start, justifyContent space-between, marginBottom 12px.
- Icon tile: width 34px, height 34px, borderRadius 8px, display flex, alignItems center, justifyContent center (colour-coded per feature)
- LOCKED badge: fontSize 8px, fontWeight 700, letterSpacing '0.1em', textTransform uppercase, background rgba(232,98,42,0.15), color #E8622A, borderRadius 4px, padding '3px 7px'

Feature name: fontSize 13, fontWeight 700, color white, marginBottom 10px

Data proof box: background rgba(255,255,255,0.04), borderRadius 7, padding '8px 10px', fontSize 12, color 'rgba(255,255,255,0.55)', marginBottom 12px, lineHeight 1.5

Feature list (4 items): each item: display flex, gap 8, alignItems flex-start, fontSize 12, color 'rgba(255,255,255,0.6)', marginBottom 6px. SVG checkmark: width 13, height 13, stroke #22C55E, viewBox '0 0 24 24', polyline points='20,6 9,17 4,12'.

Bottom bar: borderTop '1px solid rgba(255,255,255,0.06)', paddingTop 14, marginTop 'auto', display flex, justifyContent space-between, alignItems center.
- Price: fontSize 18, fontWeight 800, color #E8622A + '/mo' span fontSize 11 rgba(255,255,255,0.35) marginLeft 3
- CTA button (primary): background #E8622A, color white, border none, padding '10px 18px', borderRadius 8, fontSize 12, fontWeight 600, cursor pointer, fontFamily Outfit

The 3 cards:

**GOOGLE REVIEWS**
- Icon: star SVG (fill none, stroke #F59E0B), icon bg rgba(245,158,11,0.12)
- Data proof: `An estimated 72% of your calls end positively. That's roughly ${weeklyPositiveCalls} review requests you could have sent this week — automatically.` (bold weeklyPositiveCalls)
- weeklyPositiveCalls: compute in billing page as a state var, default 5
- Features: ['Automatic review requests after every positive call', 'Smart timing — sent when satisfaction is highest', 'Google & Facebook review collection', 'Review performance dashboard']
- Price: $49

**SMS FOLLOW-UPS**
- Icon: message-square SVG, icon bg rgba(74,159,232,0.12), stroke #4A9FE8
- Data proof: `You had ${missedCallCount} missed call(s) this month. Without follow-up, that caller likely went to a competitor within 5 minutes.` (bold missedCallCount)
- missedCallCount: fetch from Supabase in billing page (same pattern as dashboard page.tsx)
- Features: ['Auto-SMS within 5 min of every missed call', 'Customisable message templates', 'Two-way SMS conversation support', 'Missed call recovery tracking']
- Price: $39
- CTA: primary style

**OUTBOUND AI CALLS**
- Icon: phone SVG with arrow, icon bg rgba(232,98,42,0.12), stroke #E8622A
- Data proof: `Outbound AI can confirm every job, chase quotes, and follow up no-shows — while you sleep.`
- Features: ['Automated job confirmation calls', 'Quote follow-up sequences', 'No-show re-engagement', 'Full call transcripts logged']
- Price: $79
- CTA: secondary style — background rgba(21,101,192,0.2), color #4A9FE8, border '1px solid rgba(74,159,232,0.3)'

For billing page data: add a useEffect to fetch the current month's missed call count from Supabase. Use the same supabase client pattern as other pages.

---

## CHANGE 5 — EMPTY STATES

### Calls page (src/app/(portal)/calls/page.tsx or its client component):
When calls list is empty, replace the table/list with:
```jsx
<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center' }}>
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#E8622A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 15a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 4.23h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 11a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
  <h3 style={{ fontSize: 16, fontWeight: 600, color: 'white', margin: '0 0 8px' }}>Your agent is live and ready</h3>
  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: '0 0 20px', maxWidth: 360 }}>Make a test call to your TalkMate number to see your first call appear here.</p>
  <button onClick={copyNumber} style={{ background: '#E8622A', color: 'white', border: 'none', padding: '12px 24px', borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' }}>
    {copied ? 'Copied! ✓' : 'Copy your TalkMate number'}
  </button>
</div>
```

Add state: `const [copied, setCopied] = useState(false)`. Add function:
```js
async function copyNumber() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { data: b } = await supabase.from('businesses').select('phone').eq('owner_user_id', user.id).single()
  const num = b?.phone || '+61 1800 TALK'
  await navigator.clipboard.writeText(num)
  setCopied(true)
  setTimeout(() => setCopied(false), 2000)
}
```

### Analytics page empty state:
Find the chart areas in src/app/(portal)/analytics/page.tsx. When the chart data is all zeros (check if data.every(d => d.value === 0 || d.count === 0)), wrap the chart in a relative div and overlay:
```jsx
{allZero && (
  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(7,24,41,0.7)', borderRadius: 12 }}>
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 10, textAlign: 'center' }}>Call data will appear here after your first call.</p>
    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>Your agent is live — make a test call to get started.</p>
  </div>
)}
```

### Dashboard zero state:
In dashboard-client.tsx, when totalMonth === 0: show '—' instead of '0%' for aiResolutionRate display, and for transferred pct. Show muted color rgba(255,255,255,0.3) for these dashes.

---

## CHANGE 6 — CALLS PAGE ENHANCEMENT

Find the calls table/list component. Make these 3 changes:

### Revenue column:
Add 'REVENUE' column header. For each call row, try to find a job linked by call.id. Since the join may not exist yet, add this logic:
- If calls table has a `job_value` column: show it formatted as `$${call.job_value.toFixed(2)}` in #E8622A
- Else: query jobs table with `call_id = call.id` — if no jobs table exists, catch the error and show '—' for all
- Non-revenue calls show '—' in rgba(255,255,255,0.3)

### Inline transcript expand:
Add `expandedCallId` state: `const [expandedCallId, setExpandedCallId] = useState<string | null>(null)`

In each call row, add a chevron button at the far right:
```jsx
<button onClick={() => setExpandedCallId(expandedCallId === call.id ? null : call.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '4px 8px' }}>
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    {expandedCallId === call.id ? <polyline points="18,15 12,9 6,15"/> : <polyline points="6,9 12,15 18,9"/>}
  </svg>
</button>
```

After each call row (as a separate `<tr>` or equivalent), show transcript when expanded:
```jsx
{expandedCallId === call.id && (
  <tr/div with colSpan>
    <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, margin: '0 0 8px' }}>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, margin: '0 0 8px' }}>
        {call.transcript ? call.transcript.slice(0, 200) + (call.transcript.length > 200 ? '...' : '') : 'Transcript not available for this call.'}
      </p>
      {call.transcript && call.transcript.length > 200 && (
        <span style={{ fontSize: 12, color: '#4A9FE8', cursor: 'pointer' }}>View full transcript →</span>
      )}
    </div>
  </tr/div>
)}
```

### Badge colours (verify and apply):
Use this helper function if not already present:
```js
function outcomeBadge(outcome: string) {
  const o = (outcome || '').toLowerCase()
  if (o === 'missed' || !o) return { bg: 'rgba(239,68,68,0.12)', color: '#EF4444', label: 'Missed' }
  if (o.includes('transfer')) return { bg: 'rgba(245,158,11,0.12)', color: '#F59E0B', label: 'Transferred' }
  if (o === 'faq') return { bg: 'rgba(74,159,232,0.12)', color: '#4A9FE8', label: 'FAQ' }
  return { bg: 'rgba(34,197,94,0.12)', color: '#22C55E', label: 'Resolved' }
}
```
Apply to all outcome badges in the calls list.

---

## CHANGE 7 — SERVICES/CATALOG PAGE

Find the catalog page client component (src/app/(portal)/catalog/page.tsx).

### Last synced timestamp:
Add state: `const [lastSynced, setLastSynced] = useState<number | null>(null)`
On mount: `useEffect(() => { const t = localStorage.getItem('catalog_last_synced'); if (t) setLastSynced(parseInt(t)) }, [])`

After the Save & Sync button, add:
```jsx
{lastSynced && (
  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 8 }}>
    Last synced to AI: {timeAgo(new Date(lastSynced).toISOString())}
  </p>
)}
```
(Use existing timeAgo function or create one if not present)

On successful sync: `localStorage.setItem('catalog_last_synced', Date.now().toString()); setLastSynced(Date.now())`

### Sync success toast:
Add state: `const [syncToast, setSyncToast] = useState(false)`

After successful sync API call: `setSyncToast(true); setTimeout(() => setSyncToast(false), 3000)`

Add at the bottom of the JSX (before closing tag):
```jsx
{syncToast && (
  <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000, background: '#22C55E', color: 'white', borderRadius: 10, padding: '12px 20px', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit,sans-serif', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polyline points="20,6 9,17 4,12"/></svg>
    Changes synced to your AI agent
  </div>
)}
```

---

## FINAL STEPS
1. Run `npm run build` — fix any TypeScript errors
2. If build passes, run: `git add -A && git commit -m "Dashboard: revenue strip, enhanced stats, upsell banner, billing cards, empty states, calls enhancements, services toast" && git push`
3. Run: `openclaw system event --text "Done: TalkMate portal all 8 dashboard changes implemented and pushed" --mode now`
