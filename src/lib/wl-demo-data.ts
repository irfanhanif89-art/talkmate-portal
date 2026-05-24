// Static demo data for the Proxima white-label partner portal preview
// at /wl-preview/proxima/demo. No database reads — every value here is
// hardcoded so the demo cannot leak production data and cannot break if
// the schema changes. When TalkMate ships a real partner portal, replace
// this module with a query against the production tables.

export interface DemoClient {
  id: string
  name: string
  industry: string
  location: string
  plan: 'starter' | 'growth' | 'pro'
  monthlyPrice: number
  royaltyAmount: number  // 25% of monthly price
  status: 'live' | 'setup'
  agentName: string
  callsThisMonth: number
  bookingsThisMonth: number
  avgScore: number
  lastCallAt: string
}

export interface DemoCall {
  id: string
  clientName: string
  callerName: string
  duration: string
  outcome: string
  score: number
  time: string
}

export const PROXIMA_DEMO: {
  partnerName: string
  tagline: string
  clients: DemoClient[]
  recentCalls: DemoCall[]
} = {
  partnerName: 'Proxima Agent',
  tagline: 'Your AI receptionist network',

  clients: [
    {
      id: '1',
      name: 'Gold Coast Towing',
      industry: 'Towing',
      location: 'Gold Coast, QLD',
      plan: 'growth',
      monthlyPrice: 499,
      royaltyAmount: 124.75,
      status: 'live',
      agentName: 'Kai',
      callsThisMonth: 184,
      bookingsThisMonth: 47,
      avgScore: 8.4,
      lastCallAt: '12 min ago',
    },
    {
      id: '2',
      name: 'Brisbane Plumbing Co',
      industry: 'Trades',
      location: 'Brisbane, QLD',
      plan: 'pro',
      monthlyPrice: 799,
      royaltyAmount: 199.75,
      status: 'live',
      agentName: 'Riley',
      callsThisMonth: 231,
      bookingsThisMonth: 89,
      avgScore: 9.1,
      lastCallAt: '3 min ago',
    },
    {
      id: '3',
      name: 'Sunshine Coast Dental',
      industry: 'Healthcare',
      location: 'Sunshine Coast, QLD',
      plan: 'growth',
      monthlyPrice: 499,
      royaltyAmount: 124.75,
      status: 'live',
      agentName: 'Morgan',
      callsThisMonth: 156,
      bookingsThisMonth: 62,
      avgScore: 9.3,
      lastCallAt: '28 min ago',
    },
    {
      id: '4',
      name: 'Northside Real Estate',
      industry: 'Real Estate',
      location: 'Brisbane North, QLD',
      plan: 'starter',
      monthlyPrice: 299,
      royaltyAmount: 74.75,
      status: 'setup',
      agentName: 'Alex',
      callsThisMonth: 0,
      bookingsThisMonth: 0,
      avgScore: 0,
      lastCallAt: 'Setting up',
    },
  ],

  recentCalls: [
    {
      id: '1',
      clientName: 'Brisbane Plumbing Co',
      callerName: 'Sarah M.',
      duration: '2m 14s',
      outcome: 'Booked',
      score: 9,
      time: '3 min ago',
    },
    {
      id: '2',
      clientName: 'Gold Coast Towing',
      callerName: 'James R.',
      duration: '1m 48s',
      outcome: 'Booked',
      score: 8,
      time: '12 min ago',
    },
    {
      id: '3',
      clientName: 'Sunshine Coast Dental',
      callerName: 'Emma T.',
      duration: '3m 02s',
      outcome: 'Booked',
      score: 10,
      time: '28 min ago',
    },
    {
      id: '4',
      clientName: 'Gold Coast Towing',
      callerName: 'Unknown',
      duration: '0m 45s',
      outcome: 'Missed',
      score: 3,
      time: '41 min ago',
    },
    {
      id: '5',
      clientName: 'Brisbane Plumbing Co',
      callerName: 'David K.',
      duration: '4m 17s',
      outcome: 'Booked',
      score: 9,
      time: '1h ago',
    },
  ],
}

// totalRoyalty / totalMRR INCLUDE setup-status clients so Monique sees the full
// network potential ($524/mo) rather than only live-and-paying agents ($449.25).
// When TalkMate ships a real partner portal, gate this on status === 'live'.
export function getProximaDemoStats(clients: DemoClient[]) {
  const liveClients = clients.filter(c => c.status === 'live')
  return {
    totalAgents: clients.length,
    liveAgents: liveClients.length,
    totalMRR: clients.reduce((sum, c) => sum + c.monthlyPrice, 0),
    totalRoyalty: clients.reduce((sum, c) => sum + c.royaltyAmount, 0),
    totalCallsThisMonth: clients.reduce((sum, c) => sum + c.callsThisMonth, 0),
    totalBookingsThisMonth: clients.reduce((sum, c) => sum + c.bookingsThisMonth, 0),
    avgScore: liveClients.length
      ? Math.round(liveClients.reduce((sum, c) => sum + c.avgScore, 0) / liveClients.length * 10) / 10
      : 0,
  }
}
