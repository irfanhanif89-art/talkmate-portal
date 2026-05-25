// Sessions 36-37 — temporary placeholder for the v1 Dispatch UI.
// The v1 schema (drivers, dispatch_jobs, vehicles, driver_shifts,
// driver_availability) was replaced in migration 048. The new
// driver-app-ready Dispatch Centre lands in Phase 4. Until then this
// placeholder prevents 500s for owners who navigate to /dispatch/*.

export function DispatchUpgradingPlaceholder({ section }: { section: string }) {
  return (
    <div style={{
      maxWidth: 720,
      margin: '64px auto',
      padding: '32px 24px',
      fontFamily: 'Outfit, sans-serif',
      color: '#F2F6FB',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.1em',
        color: '#E8622A',
        textTransform: 'uppercase',
      }}>
        Upgrading
      </div>
      <h1 style={{
        margin: '12px 0 0',
        fontSize: 28,
        fontWeight: 700,
        letterSpacing: '-0.5px',
      }}>
        {section} is being upgraded
      </h1>
      <p style={{
        marginTop: 14,
        fontSize: 16,
        lineHeight: 1.6,
        color: '#94a3b8',
      }}>
        We are rolling out the new TalkMate Dispatch Centre — live map, driver app, push-to-driver job offers, on-site photo capture, and customer SMS touchpoints. The new view will land shortly. If you need to manage drivers right now, contact <a href="mailto:hello@talkmate.com.au" style={{ color: '#1565C0' }}>hello@talkmate.com.au</a>.
      </p>
      <p style={{
        marginTop: 24,
        fontSize: 13,
        color: '#64748b',
      }}>
        Drivers can already sign in at the dedicated driver app at <strong>/driver/login</strong> once invited.
      </p>
    </div>
  )
}
