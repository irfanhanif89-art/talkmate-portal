import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Commands' }

interface CommandExample {
  text: string
  description?: string
}

interface CommandCategory {
  icon: string
  title: string
  commands: CommandExample[]
}

const CATEGORIES: CommandCategory[] = [
  {
    icon: '📞',
    title: 'Calls',
    commands: [
      { text: 'How many calls today?', description: 'Summary of today\'s calls with missed count' },
      { text: 'Any missed calls?', description: 'Calls that hung up or didn\'t connect' },
      { text: 'Show recent calls', description: 'Last 10 calls across all outcomes' },
      { text: 'Call summary', description: 'Today\'s call overview' },
      { text: 'What did I miss?', description: 'Last 24 hours — calls, jobs, quotes summary' },
      { text: 'Catch me up', description: 'Same as above' },
    ],
  },
  {
    icon: '🔧',
    title: 'Jobs and Dispatch',
    commands: [
      { text: 'Show today\'s jobs', description: 'Jobs created today' },
      { text: 'List pending jobs', description: 'Jobs waiting to be dispatched' },
      { text: 'All jobs', description: 'Last 10 jobs regardless of date' },
      { text: 'Any bookings?', description: 'Pending scheduled bookings' },
      { text: 'Assign JOB-0042 to Dave', description: 'Dispatch a job to a driver by name' },
      { text: 'JOB-0042 is done', description: 'Mark a job as complete' },
      { text: 'Mark job 42 complete', description: 'Same as above — number is normalised' },
    ],
  },
  {
    icon: '📊',
    title: 'Quotes',
    commands: [
      { text: 'Any quotes today?', description: 'Quotes received today with route and price' },
      { text: 'Show recent quotes', description: 'Same as above' },
      { text: 'What quotes came in?', description: 'Today\'s quote list' },
      { text: 'All quotes', description: 'Last 10 quotes on file' },
    ],
  },
  {
    icon: '⭐',
    title: 'VIP',
    commands: [
      { text: 'Is 0412 345 678 a VIP?', description: 'Check if a caller is on the VIP list' },
      { text: 'Check 0412345678', description: 'Same lookup, any number format' },
      { text: 'Who is 0412345678?', description: 'Returns name, company, and notes if VIP' },
    ],
  },
  {
    icon: '⚙️',
    title: 'Agent Control',
    commands: [
      { text: 'We\'re busy for 2 hours', description: 'Sets wait time — agent tells callers' },
      { text: 'Wait time is 45 minutes', description: 'Set a specific wait time' },
      { text: 'Flat out for the next hour', description: 'Natural language wait time' },
      { text: 'Stop taking jobs', description: 'Agent stops accepting new jobs immediately' },
      { text: 'We\'re closed', description: 'Same as above' },
      { text: 'Back online', description: 'Resume accepting jobs' },
      { text: 'Open for business', description: 'Same as above' },
      { text: 'Pause agent for 1 hour', description: 'Pauses agent — auto-resumes after the time' },
      { text: 'Stop agent for 30 minutes', description: 'Temporary pause with auto-resume' },
      { text: 'Close on Sunday', description: 'Marks Sunday as closed in your schedule' },
      { text: 'We are closed Saturday', description: 'Marks Saturday as closed' },
      { text: 'Open on Sunday', description: 'Re-opens Sunday in your schedule' },
      { text: 'Re-open Saturday', description: 'Marks Saturday as open again' },
    ],
  },
  {
    icon: '🚛',
    title: 'Drivers',
    commands: [
      { text: 'Who is available?', description: 'Lists active drivers and their current status' },
      { text: 'Driver status', description: 'Same as above' },
      { text: 'Which drivers are on?', description: 'Active drivers on file' },
      { text: 'Who is working?', description: 'Same as above' },
    ],
  },
]

export default function CommandsPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#061322',
      padding: '32px 24px',
      fontFamily: 'Outfit, sans-serif',
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <h1 style={{
            fontSize: 26,
            fontWeight: 700,
            color: 'white',
            margin: 0,
            marginBottom: 8,
          }}>
            Commands
          </h1>
          <p style={{
            fontSize: 15,
            color: '#7BAED4',
            margin: 0,
            lineHeight: 1.5,
          }}>
            Send any of these phrases to your Telegram bot in plain English.
            You don&apos;t need to match exactly — just say what you mean.
          </p>
        </div>

        {/* Categories */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {CATEGORIES.map(category => (
            <div
              key={category.title}
              style={{
                background: '#0A1E38',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 14,
                overflow: 'hidden',
              }}
            >
              {/* Category header */}
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <span style={{ fontSize: 18 }}>{category.icon}</span>
                <span style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: 'white',
                  letterSpacing: 0.2,
                }}>
                  {category.title}
                </span>
              </div>

              {/* Command list */}
              <div style={{ padding: '8px 0' }}>
                {category.commands.map((cmd, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 16,
                      padding: '10px 20px',
                      borderBottom: i < category.commands.length - 1
                        ? '1px solid rgba(255,255,255,0.04)'
                        : 'none',
                    }}
                  >
                    <code style={{
                      fontSize: 13,
                      fontFamily: 'monospace',
                      color: '#C8D8EA',
                      background: 'rgba(255,255,255,0.05)',
                      padding: '3px 8px',
                      borderRadius: 6,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}>
                      {cmd.text}
                    </code>
                    {cmd.description && (
                      <span style={{
                        fontSize: 13,
                        color: '#4A7FBB',
                        lineHeight: 1.4,
                      }}>
                        {cmd.description}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <p style={{
          fontSize: 13,
          color: '#4A7FBB',
          marginTop: 28,
          textAlign: 'center',
          lineHeight: 1.6,
        }}>
          Commands are processed by AI — variations and typos are fine.
          Job numbers are normalised automatically (e.g. &quot;job 42&quot; → JOB-0042).
        </p>
      </div>
    </div>
  )
}
