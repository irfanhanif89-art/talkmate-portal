'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Activity, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight,
  Circle, Filter, MessageSquare, RefreshCcw,
} from 'lucide-react'

// Session 24 — Agent Health Monitor view.
// Pure UI component. State that needs to persist (resolving an alert)
// goes through a POST to /api/admin/agent-health/resolve which re-runs
// the page on success via router.refresh().
//
// Chrome: this view renders bare content. The persistent admin sidebar
// (src/components/admin/AdminSidebarLayout.tsx, wired in via
// (portal)/admin/layout.tsx) supplies the logo, navigation, user
// avatar, and logout button. Earlier revisions of this file rendered
// a standalone topbar that duplicated all of that — it's been
// removed; the Refresh button and the "X critical" badge are kept
// as page-level actions next to the h1.

interface BusinessRow {
  id: string
  name: string | null
  vapi_agent_id: string | null
  health_status: string | null
  health_issues_count: number | null
  last_health_check_at: string | null
}

interface SnapshotRow {
  id: string
  business_id: string
  vapi_assistant_id: string
  snapshot_at: string
  health_status: string
  health_issues: unknown
}

interface AlertRow {
  id: string
  business_id: string
  vapi_assistant_id: string
  alert_type: string
  severity: string
  title: string
  detail: string
  issue_code: string | null
  call_id: string | null
  resolved_at: string | null
  resolved_by: string | null
  telegram_sent: boolean
  created_at: string
}

interface ViolationRow {
  id: string
  call_id: string
  business_id: string
  pattern_code: string
  severity: string
  pattern_match: string
  context_snippet: string | null
  created_at: string
}

interface Issue {
  code: string
  severity: string
  message: string
  field: string
  expected: unknown
  actual: unknown
}

interface Props {
  businesses: BusinessRow[]
  latestSnapshot: SnapshotRow[]
  violations: ViolationRow[]
  alerts: AlertRow[]
  bizNameById: Record<string, string>
  lastChecked: string | null
}

type SeverityFilter = 'all' | 'critical' | 'warning'

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  healthy:  { label: 'Healthy',  color: '#22C55E', bg: 'rgba(34,197,94,0.14)' },
  warning:  { label: 'Warning',  color: '#F59E0B', bg: 'rgba(245,158,11,0.14)' },
  critical: { label: 'Critical', color: '#EF4444', bg: 'rgba(239,68,68,0.14)' },
  unknown:  { label: 'Unknown',  color: '#7BAED4', bg: 'rgba(123,174,212,0.14)' },
}

export default function AgentHealthView(props: Props) {
  const router = useRouter()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [violationFilter, setViolationFilter] = useState<SeverityFilter>('all')
  const [showResolved, setShowResolved] = useState(false)
  const [resolving, setResolving] = useState<string | null>(null)

  const snapshotByBiz = useMemo(() => {
    const map = new Map<string, SnapshotRow>()
    for (const s of props.latestSnapshot) map.set(s.business_id, s)
    return map
  }, [props.latestSnapshot])

  const filteredViolations = useMemo(() => {
    if (violationFilter === 'all') return props.violations
    return props.violations.filter(v => v.severity === violationFilter)
  }, [props.violations, violationFilter])

  const visibleAlerts = useMemo(() => {
    return showResolved ? props.alerts : props.alerts.filter(a => !a.resolved_at)
  }, [props.alerts, showResolved])

  const openCriticalCount = useMemo(
    () => props.alerts.filter(a => !a.resolved_at && a.severity === 'critical').length,
    [props.alerts],
  )

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function resolveAlert(alertId: string) {
    setResolving(alertId)
    try {
      const res = await fetch('/api/admin/agent-health/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_id: alertId }),
      })
      if (res.ok) router.refresh()
    } finally {
      setResolving(null)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', color: '#F2F6FB', fontFamily: 'Outfit, sans-serif' }}>
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 64px' }}>
        <div style={{
          marginBottom: 28,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap' as const,
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>
              Agent Health Monitor
            </h1>
            <p style={{ fontSize: 14, color: '#7BAED4', marginTop: 6, marginBottom: 0 }}>
              Live configuration status and speech pattern detection across all active agents.
            </p>
            <p style={{ fontSize: 12, color: '#5A88B5', marginTop: 4 }}>
              Last checked {formatAgo(props.lastChecked)}
            </p>
          </div>
          {/* Page-level actions: kept here (not in a topbar) so they sit
              next to the heading and the sidebar continues to own all
              cross-page chrome. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {openCriticalCount > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 999,
                background: 'rgba(239,68,68,0.18)', color: '#EF4444',
                fontSize: 12, fontWeight: 700,
              }}>
                <AlertTriangle size={12} /> {openCriticalCount} critical
              </span>
            )}
            <button
              onClick={() => router.refresh()}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 12px',
                background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                color: '#C8D8EA', borderRadius: 8,
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
                fontFamily: 'Outfit, sans-serif',
              }}
            >
              <RefreshCcw size={13} /> Refresh
            </button>
          </div>
        </div>

        {/* ───── Section 1 — Health Status Cards ─────────────────── */}
        <section style={{ marginBottom: 40 }}>
          <SectionHeading icon={<Activity size={16} />} label="Health status by business" />
          {props.businesses.length === 0 ? (
            <EmptyState text="No active businesses with a Vapi agent." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
              {props.businesses.map(biz => {
                const status = biz.health_status ?? 'unknown'
                const style = STATUS_STYLES[status] ?? STATUS_STYLES.unknown
                const snapshot = snapshotByBiz.get(biz.id)
                const issues = parseIssues(snapshot?.health_issues)
                const isOpen = expanded.has(biz.id)
                return (
                  <div
                    key={biz.id}
                    style={{
                      background: '#0B1F3A', border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 12, padding: 16,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {biz.name ?? 'Unknown'}
                        </div>
                        <div style={{ fontSize: 11, color: '#5A88B5', marginTop: 4 }}>
                          Checked {formatAgo(biz.last_health_check_at)}
                        </div>
                      </div>
                      <span style={{
                        flexShrink: 0, padding: '4px 10px', borderRadius: 999,
                        background: style.bg, color: style.color,
                        fontSize: 11, fontWeight: 700,
                      }}>
                        {style.label}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                      <span style={{ fontSize: 11, color: '#7BAED4' }}>
                        {biz.health_issues_count ?? 0} issue{(biz.health_issues_count ?? 0) === 1 ? '' : 's'}
                      </span>
                      {issues.length > 0 && (
                        <button
                          onClick={() => toggleExpand(biz.id)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '4px 8px', borderRadius: 6,
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                            color: '#C8D8EA', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            fontFamily: 'Outfit, sans-serif',
                          }}
                        >
                          {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                          {isOpen ? 'Hide details' : 'Show details'}
                        </button>
                      )}
                    </div>

                    {isOpen && issues.length > 0 && (
                      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {issues.map((issue, i) => (
                          <div
                            key={`${issue.code}-${i}`}
                            style={{
                              padding: '8px 10px', borderRadius: 8,
                              background: issue.severity === 'critical' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.06)',
                              border: `1px solid ${issue.severity === 'critical' ? 'rgba(239,68,68,0.22)' : 'rgba(245,158,11,0.22)'}`,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                                background: issue.severity === 'critical' ? '#EF4444' : '#F59E0B',
                                color: '#0A1E38', letterSpacing: '0.05em', textTransform: 'uppercase',
                              }}>
                                {issue.severity}
                              </span>
                              <span style={{ fontSize: 10, color: '#5A88B5', fontFamily: 'monospace' }}>{issue.code}</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#E2EAF5', lineHeight: 1.4 }}>{issue.message}</div>
                            <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 4, fontFamily: 'monospace' }}>
                              {issue.field}
                            </div>
                            <div style={{ fontSize: 11, color: '#5A88B5', marginTop: 2 }}>
                              Expected: <code style={{ color: '#22C55E' }}>{formatVal(issue.expected)}</code>
                              <br />
                              Actual: <code style={{ color: '#EF4444' }}>{formatVal(issue.actual)}</code>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ───── Section 2 — Recent Transcript Violations ────────── */}
        <section style={{ marginBottom: 40 }}>
          <SectionHeading icon={<MessageSquare size={16} />} label="Recent transcript violations" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Filter size={12} color="#7BAED4" />
            {(['all', 'critical', 'warning'] as SeverityFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setViolationFilter(f)}
                style={{
                  padding: '4px 10px', borderRadius: 999,
                  background: violationFilter === f ? '#E8622A' : 'rgba(255,255,255,0.04)',
                  color: violationFilter === f ? 'white' : '#C8D8EA',
                  border: violationFilter === f ? 'none' : '1px solid rgba(255,255,255,0.08)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'Outfit, sans-serif', textTransform: 'capitalize',
                }}
              >
                {f}
              </button>
            ))}
          </div>
          {filteredViolations.length === 0 ? (
            <EmptyState text="No speech pattern violations in the last 7 days." />
          ) : (
            <div style={{ overflowX: 'auto', background: '#0B1F3A', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <Th>Time</Th>
                    <Th>Business</Th>
                    <Th>Pattern</Th>
                    <Th>Matched</Th>
                    <Th>Context</Th>
                    <Th>Severity</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredViolations.map(v => (
                    <tr key={v.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      <Td>{formatAgo(v.created_at)}</Td>
                      <Td>{props.bizNameById[v.business_id] ?? 'Unknown'}</Td>
                      <Td><code style={{ fontSize: 11, color: '#7BAED4' }}>{v.pattern_code}</code></Td>
                      <Td><code style={{ fontSize: 11, color: '#FBBF24' }}>{v.pattern_match}</code></Td>
                      <Td><span style={{ fontSize: 11, color: '#C8D8EA' }}>{v.context_snippet ?? '—'}</span></Td>
                      <Td>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                          background: v.severity === 'critical' ? '#EF4444' : '#F59E0B',
                          color: '#0A1E38', letterSpacing: '0.05em', textTransform: 'uppercase',
                        }}>
                          {v.severity}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ───── Section 3 — Open Health Alerts ───────────────────── */}
        <section style={{ marginBottom: 40 }}>
          <SectionHeading icon={<AlertTriangle size={16} />} label="Health alerts" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#C8D8EA', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showResolved}
                onChange={(e) => setShowResolved(e.target.checked)}
              />
              Show resolved
            </label>
          </div>
          {visibleAlerts.length === 0 ? (
            <EmptyState text="No open health alerts." />
          ) : (
            <div style={{ overflowX: 'auto', background: '#0B1F3A', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <Th>Time</Th>
                    <Th>Business</Th>
                    <Th>Type</Th>
                    <Th>Severity</Th>
                    <Th>Title</Th>
                    <Th>Detail</Th>
                    <Th>Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAlerts.map(a => (
                    <tr key={a.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', opacity: a.resolved_at ? 0.6 : 1 }}>
                      <Td>{formatAgo(a.created_at)}</Td>
                      <Td>{props.bizNameById[a.business_id] ?? 'Unknown'}</Td>
                      <Td><code style={{ fontSize: 11, color: '#7BAED4' }}>{a.alert_type}</code></Td>
                      <Td>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                          background: a.severity === 'critical' ? '#EF4444' : '#F59E0B',
                          color: '#0A1E38', letterSpacing: '0.05em', textTransform: 'uppercase',
                        }}>
                          {a.severity}
                        </span>
                      </Td>
                      <Td><span style={{ fontSize: 12 }}>{a.title}</span></Td>
                      <Td><pre style={{ margin: 0, fontFamily: 'inherit', fontSize: 11, color: '#C8D8EA', whiteSpace: 'pre-wrap' }}>{a.detail}</pre></Td>
                      <Td>
                        {a.resolved_at ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#22C55E' }}>
                            <CheckCircle2 size={12} /> Resolved
                          </span>
                        ) : (
                          <button
                            onClick={() => resolveAlert(a.id)}
                            disabled={resolving === a.id}
                            style={{
                              padding: '4px 10px', borderRadius: 6,
                              background: '#E8622A', color: 'white',
                              border: 'none', fontSize: 11, fontWeight: 600,
                              cursor: resolving === a.id ? 'wait' : 'pointer',
                              fontFamily: 'Outfit, sans-serif',
                              opacity: resolving === a.id ? 0.6 : 1,
                            }}
                          >
                            {resolving === a.id ? 'Resolving…' : 'Mark resolved'}
                          </button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

// ─── small UI helpers ──────────────────────────────────────────────

function SectionHeading({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <h2 style={{
      fontSize: 13, fontWeight: 700, color: '#C8D8EA',
      textTransform: 'uppercase', letterSpacing: '0.08em',
      display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 14px 0',
    }}>
      {icon} {label}
    </h2>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      padding: '32px 18px', borderRadius: 12,
      background: '#0B1F3A', border: '1px dashed rgba(255,255,255,0.08)',
      color: '#7BAED4', fontSize: 13, textAlign: 'center' as const,
    }}>
      <Circle size={14} style={{ marginRight: 8, verticalAlign: 'middle' }} />
      {text}
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      textAlign: 'left' as const, padding: '10px 14px',
      fontSize: 10, fontWeight: 700, color: '#7BAED4',
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>{children}</th>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td style={{ padding: '10px 14px', fontSize: 12, color: '#E2EAF5', verticalAlign: 'top' as const }}>
      {children}
    </td>
  )
}

function parseIssues(raw: unknown): Issue[] {
  if (!Array.isArray(raw)) return []
  return raw.map(r => {
    const o = (r && typeof r === 'object') ? r as Record<string, unknown> : {}
    return {
      code: String(o.code ?? ''),
      severity: String(o.severity ?? 'warning'),
      message: String(o.message ?? ''),
      field: String(o.field ?? ''),
      expected: o.expected,
      actual: o.actual,
    }
  })
}

function formatVal(value: unknown): string {
  if (value === null || value === undefined) return String(value)
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) } catch { return String(value) }
}

function formatAgo(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 'never'
  const diffMs = Date.now() - t
  if (diffMs < 0) return 'just now'
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}
