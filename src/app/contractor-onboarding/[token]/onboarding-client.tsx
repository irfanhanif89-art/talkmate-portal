'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SignatureCapture, { type SignatureMethod } from '@/components/contractor/SignatureCapture'
import { isValidAbnFormat, normaliseAbn } from '@/lib/abn'

type ContractorPayload = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  abn: string | null
  bank_bsb: string | null
  bank_account_number: string | null
  status: string
}

type ActiveScript = {
  id: string
  version: string
  title: string
  content: string
  activated_at: string | null
}

type LoadOk = {
  ok: true
  contractor: ContractorPayload
  active_script: ActiveScript | null
}

type LoadErr = {
  ok: false
  error: string
  code: 'missing' | 'invalid' | 'expired' | 'already_signed' | 'terminated' | string
  contractor?: { first_name?: string; email?: string }
}

const COMMISSION_ROWS = [
  { plan: 'Starter', monthly: '$299', annual: '$373.75' },
  { plan: 'Growth', monthly: '$349', annual: '$473.75' },
  { plan: 'Pro', monthly: '$399', annual: '$598.75' },
]

// Inline page-level styles so this public page does not depend on the
// portal's component library. Same Outfit font is loaded by the root layout.
const wrap: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(180deg, #061322 0%, #0A1E38 100%)',
  color: 'white',
  fontFamily: 'Outfit, sans-serif',
  padding: '32px 16px',
}
const card: React.CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  background: '#0A1E38',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: 28,
  boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
}
const heading: React.CSSProperties = { fontSize: 28, fontWeight: 700, margin: '0 0 4px' }
const sub: React.CSSProperties = { color: 'rgba(255,255,255,0.7)', margin: '0 0 24px' }
const label: React.CSSProperties = {
  display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 6, fontWeight: 600,
}
const input: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  background: '#061322', border: '1px solid rgba(255,255,255,0.12)',
  color: 'white', fontFamily: 'inherit', fontSize: 15,
}
const inputReadOnly: React.CSSProperties = { ...input, opacity: 0.6, cursor: 'not-allowed' }
const button: React.CSSProperties = {
  background: '#22D3EE', color: '#061322', border: 'none', padding: '12px 20px',
  borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer',
}
const buttonDisabled: React.CSSProperties = { ...button, background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', cursor: 'not-allowed' }
const buttonGhost: React.CSSProperties = {
  background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.2)',
  padding: '12px 20px', borderRadius: 10, fontWeight: 600, fontSize: 15, cursor: 'pointer',
}
const note: React.CSSProperties = {
  fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 6, lineHeight: 1.5,
}
const checkboxRow: React.CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12,
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, marginBottom: 10,
  background: 'rgba(255,255,255,0.03)',
}
const errorBox: React.CSSProperties = {
  background: 'rgba(248, 113, 113, 0.12)', border: '1px solid rgba(248, 113, 113, 0.4)',
  color: '#fecaca', padding: 12, borderRadius: 10, fontSize: 14, marginBottom: 12,
}
const summaryBox: React.CSSProperties = {
  background: 'rgba(34, 211, 238, 0.08)', border: '1px solid rgba(34, 211, 238, 0.3)',
  borderRadius: 10, padding: 16, marginBottom: 16,
}

const formatToday = (): string => {
  return new Date().toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane',
  })
}

function CommissionTable() {
  return (
    <div style={{ overflowX: 'auto', marginTop: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
            <th style={{ padding: '8px 6px' }}>Plan</th>
            <th style={{ padding: '8px 6px' }}>Monthly</th>
            <th style={{ padding: '8px 6px' }}>Annual</th>
          </tr>
        </thead>
        <tbody>
          {COMMISSION_ROWS.map(row => (
            <tr key={row.plan} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <td style={{ padding: '8px 6px', fontWeight: 600 }}>{row.plan}</td>
              <td style={{ padding: '8px 6px' }}>{row.monthly}</td>
              <td style={{ padding: '8px 6px' }}>{row.annual}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ContractorOnboardingClient({ token }: { token: string }) {
  const [load, setLoad] = useState<LoadOk | LoadErr | null>(null)
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [agreementScrolled, setAgreementScrolled] = useState(false)
  const [phone, setPhone] = useState('')
  const [abn, setAbn] = useState('')
  const [bsb, setBsb] = useState('')
  const [acct, setAcct] = useState('')
  const [agreeAgreement, setAgreeAgreement] = useState(false)
  const [agreeScript, setAgreeScript] = useState(false)
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [signatureMethod, setSignatureMethod] = useState<SignatureMethod>('drawn')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const agreementBoxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/contractor-onboarding/${token}`, { cache: 'no-store' })
      .then(async r => {
        const json = (await r.json()) as LoadOk | LoadErr
        if (!cancelled) {
          setLoad(json)
          if (json.ok) {
            setPhone(json.contractor.phone ?? '')
            setAbn(json.contractor.abn ?? '')
            setBsb(json.contractor.bank_bsb ?? '')
            setAcct(json.contractor.bank_account_number ?? '')
          }
        }
      })
      .catch(() => {
        if (!cancelled) setLoad({ ok: false, error: 'Unable to load this invite', code: 'invalid' })
      })
    return () => { cancelled = true }
  }, [token])

  const fullName = useMemo(() => {
    if (load?.ok) return `${load.contractor.first_name} ${load.contractor.last_name}`
    return ''
  }, [load])

  const today = useMemo(() => formatToday(), [])
  const scriptVersion = load?.ok ? load.active_script?.version ?? 'unversioned' : ''
  const scriptDate = load?.ok && load.active_script?.activated_at
    ? new Date(load.active_script.activated_at).toLocaleDateString('en-AU')
    : today

  const onAgreementScroll = useCallback(() => {
    const el = agreementBoxRef.current
    if (!el) return
    const near = el.scrollTop + el.clientHeight >= el.scrollHeight - 20
    if (near) setAgreementScrolled(true)
  }, [])

  const submitDetails = useCallback(async () => {
    if (!isValidAbnFormat(abn)) {
      setSubmitError('Please enter your 11-digit ABN. Contractors must have a valid ABN to engage with TalkMate.')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/contractor-onboarding/${token}/save-details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone || null,
          abn: normaliseAbn(abn),
          bank_bsb: bsb || null,
          bank_account_number: acct || null,
        }),
      })
      const json = await res.json()
      if (!json.ok) {
        setSubmitError(json.error || 'Could not save your details')
      } else {
        setStep(4)
      }
    } catch {
      setSubmitError('Could not save your details')
    } finally {
      setSubmitting(false)
    }
  }, [token, phone, abn, bsb, acct])

  const submitSign = useCallback(async () => {
    if (!signatureDataUrl) {
      setSubmitError('Please sign the agreement before continuing.')
      return
    }
    if (!isValidAbnFormat(abn)) {
      setSubmitError('Please enter your 11-digit ABN. Contractors must have a valid ABN to engage with TalkMate.')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/contractor-onboarding/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature_consent: true,
          signature_data_url: signatureDataUrl,
          signature_method: signatureMethod,
          signature_timestamp: new Date().toISOString(),
          abn: normaliseAbn(abn),
          bank_bsb: bsb || null,
          bank_account_number: acct || null,
        }),
      })
      const json = await res.json()
      if (!json.ok) {
        setSubmitError(json.error || 'Could not record your signature')
      } else {
        setStep(5)
      }
    } catch {
      setSubmitError('Could not record your signature')
    } finally {
      setSubmitting(false)
    }
  }, [token, abn, bsb, acct, signatureDataUrl, signatureMethod])

  if (!load) {
    return (
      <div style={wrap}>
        <div style={card}>
          <p style={sub}>Loading your invite...</p>
        </div>
      </div>
    )
  }

  if (!load.ok) {
    return (
      <div style={wrap}>
        <div style={card}>
          <h1 style={heading}>
            {load.code === 'expired' && 'This invite link has expired'}
            {load.code === 'already_signed' && 'You have already signed'}
            {load.code === 'terminated' && 'This contractor account is closed'}
            {(load.code === 'invalid' || load.code === 'missing') && 'Invite not found'}
          </h1>
          <p style={sub}>
            {load.code === 'expired' && 'Please contact TalkMate to request a new invite.'}
            {load.code === 'already_signed' && 'Check your email for your signed copy of the agreement.'}
            {load.code === 'terminated' && 'Please contact TalkMate if you believe this is an error.'}
            {(load.code === 'invalid' || load.code === 'missing') && 'Please double-check the link from your invite email.'}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.7)' }}>
            Email <a style={{ color: '#22D3EE' }} href="mailto:hello@talkmate.com.au">hello@talkmate.com.au</a>
          </p>
        </div>
      </div>
    )
  }

  const c = load.contractor
  const abnValid = isValidAbnFormat(abn)

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ marginBottom: 18, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
          Step {step} of 5
        </div>

        {step === 1 && (
          <>
            <h1 style={heading}>Welcome, {c.first_name}.</h1>
            <p style={sub}>
              You have been invited to join TalkMate as a Sales Contractor. We need a few minutes to
              review and sign your contractor agreement.
            </p>
            <div style={summaryBox}>
              <div style={{ marginBottom: 6 }}><strong>Name:</strong> {fullName}</div>
              <div><strong>Email:</strong> {c.email}</div>
            </div>
            <button style={button} onClick={() => setStep(2)}>Review My Agreement</button>
          </>
        )}

        {step === 2 && (
          <>
            <h1 style={heading}>Review Agreement</h1>
            <p style={sub}>Please read the full agreement. Scroll to the bottom before continuing.</p>
            <div
              ref={agreementBoxRef}
              onScroll={onAgreementScroll}
              style={{
                height: 360, overflowY: 'auto', padding: 16,
                background: '#061322', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10, lineHeight: 1.6, fontSize: 14,
              }}
            >
              <h2 style={{ fontSize: 18, marginTop: 0 }}>TalkMate Sales Contractor Agreement</h2>
              <p style={{ margin: '0 0 4px', color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Miami, QLD 4220 | talkmate.com.au</p>
              <p>Effective: {today}</p>
              <p>This Sales Contractor Agreement (<strong>Agreement</strong>) is entered into between:</p>
              <p><strong>Principal:</strong> TalkMate (ABN: TBC), trading as TalkMate, Miami QLD 4220</p>
              <p><strong>Contractor:</strong> {fullName}</p>

              <h3 style={{ fontSize: 15, margin: '16px 0 6px' }}>1. Appointment and Nature of Engagement</h3>
              <p>1.1 TalkMate appoints the Contractor as a non-exclusive independent sales contractor to promote and sell TalkMate&apos;s AI receptionist subscription plans to prospective clients in Australia.</p>
              <p>1.2 The Contractor is engaged as an independent contractor, not as an employee, partner, agent, or joint venturer of TalkMate. Nothing in this Agreement creates an employment relationship. The Contractor has no authority to bind TalkMate contractually or make representations on TalkMate&apos;s behalf beyond what is expressly authorised in this Agreement.</p>
              <p>1.3 The Contractor acknowledges and agrees that:</p>
              <ul style={{ paddingLeft: 18, margin: '4px 0 8px' }}>
                <li>They are free to perform work for other businesses and clients simultaneously, provided this does not conflict with their obligations under this Agreement.</li>
                <li>They are responsible for their own tax obligations including income tax, GST (if registered), and superannuation. TalkMate will not withhold PAYG from commission payments.</li>
                <li>They are not entitled to paid leave, annual leave, personal leave, public holiday pay, redundancy pay, or any other employment entitlement under the Fair Work Act 2009 (Cth) or any applicable Modern Award.</li>
                <li>They must obtain their own professional indemnity and public liability insurance where appropriate.</li>
                <li>They are responsible for providing their own equipment, phone, and internet connection to perform the Services.</li>
              </ul>

              <h3 style={{ fontSize: 15, margin: '16px 0 6px' }}>2. Scope of Services</h3>
              <p>2.1 The Contractor agrees to perform the following services (<strong>Services</strong>):</p>
              <ul style={{ paddingLeft: 18, margin: '4px 0 8px' }}>
                <li>Conduct outbound cold calls to prospective small business clients in Australia using approved TalkMate scripts and sales materials.</li>
                <li>Present and promote TalkMate&apos;s AI receptionist plans accurately and in accordance with the approved pitch provided by TalkMate.</li>
                <li>Qualify prospects and guide them through the sales process to the point of sign-up via the TalkMate portal.</li>
                <li>Maintain accurate records of leads contacted, outcomes, and pipeline status within the TalkMate Sales HQ CRM.</li>
                <li>Conduct follow-up communications with prospects as directed by TalkMate.</li>
                <li>Represent TalkMate professionally and ethically at all times.</li>
              </ul>
              <p>2.2 The Contractor must not make any representations, promises, or guarantees about TalkMate&apos;s product, features, or capabilities that are not contained in the current version of TalkMate&apos;s approved sales script. Any misrepresentation made by the Contractor to a client is a material breach of this Agreement.</p>
              <p>2.3 TalkMate will maintain version-controlled copies of all approved sales scripts. At the commencement of engagement and upon any material update to the approved script, the Contractor must acknowledge in writing (including by email or via the TalkMate portal) that they have read and understood the current approved script. The Contractor&apos;s liability under clause 5 is limited to representations made beyond the scope of the approved script version in force at the time of the relevant sale.</p>
              <p>2.4 The Contractor consents to TalkMate monitoring, recording, and reviewing their sales calls and communications for quality assurance and compliance purposes. The Contractor acknowledges that call recordings may be used as evidence in any dispute, clawback assessment, or compliance investigation under this Agreement.</p>

              <h3 style={{ fontSize: 15, margin: '16px 0 6px' }}>3. Commission Structure and Payment</h3>
              <p>3.1 TalkMate will pay the Contractor a commission for each Qualified Sale. Commission rates vary depending on the plan sold and whether the client pays on a monthly or annual basis:</p>
              <div style={{ overflowX: 'auto', margin: '8px 0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)' }}>
                      <th style={{ padding: '6px 4px', textAlign: 'left' }}>Plan</th>
                      <th style={{ padding: '6px 4px', textAlign: 'left' }}>Monthly Price</th>
                      <th style={{ padding: '6px 4px', textAlign: 'left' }}>Annual Price</th>
                      <th style={{ padding: '6px 4px', textAlign: 'left' }}>Monthly Comm.</th>
                      <th style={{ padding: '6px 4px', textAlign: 'left' }}>Annual Comm.</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      <td style={{ padding: '6px 4px', fontWeight: 600 }}>Starter</td>
                      <td style={{ padding: '6px 4px' }}>/mo</td>
                      <td style={{ padding: '6px 4px' }}>,990 upfront</td>
                      <td style={{ padding: '6px 4px' }}></td>
                      <td style={{ padding: '6px 4px' }}>.75</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      <td style={{ padding: '6px 4px', fontWeight: 600 }}>Growth</td>
                      <td style={{ padding: '6px 4px' }}>/mo</td>
                      <td style={{ padding: '6px 4px' }}>,990 upfront</td>
                      <td style={{ padding: '6px 4px' }}></td>
                      <td style={{ padding: '6px 4px' }}>.75</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '6px 4px', fontWeight: 600 }}>Pro</td>
                      <td style={{ padding: '6px 4px' }}>/mo</td>
                      <td style={{ padding: '6px 4px' }}>,990 upfront</td>
                      <td style={{ padding: '6px 4px' }}></td>
                      <td style={{ padding: '6px 4px' }}>.75</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>3.2 Annual plan commission is calculated as the base monthly commission for the relevant plan plus 2.5% of the total annual amount paid by the client.</p>
              <p>3.3 A Qualified Sale means a sale where: the client has successfully signed up to a TalkMate plan via the portal; the client&apos;s payment has been received and cleared by TalkMate; the client has not cancelled or requested a refund within the 14-day money-back guarantee period; and the sale was not made through misrepresentation, false promise, or unethical conduct by the Contractor.</p>
              <p>3.4 Commission will be paid within 14 days after the expiry of the client&apos;s 14-day money-back guarantee period, provided the sale qualifies under clause 3.3.</p>
              <p>3.5 Commission payments will be made by bank transfer to the account nominated by the Contractor. The Contractor must provide valid banking details prior to the first payment.</p>
              <p>3.6 <strong>ABN and Tax Withholding.</strong> The Contractor must provide a valid Australian Business Number (ABN) prior to receiving any commission payment. If the Contractor fails to provide a valid ABN, TalkMate is required by law to withhold 47% of each commission payment and remit that amount to the Australian Taxation Office. TalkMate accepts no liability for any tax consequences arising from the Contractor&apos;s failure to provide a valid ABN.</p>
              <p>3.7 TalkMate reserves the right to adjust the commission structure by providing 30 days written notice to the Contractor. Sales made prior to the effective date of any change will be paid at the rate applicable at the time of sale.</p>
              <p>3.8 <strong>Acquisition.</strong> In the event TalkMate is acquired by or merges with another entity during the term of this Agreement, TalkMate will use reasonable endeavours to ensure that commission obligations for Qualified Sales made prior to the acquisition date are honoured by the acquiring entity. TalkMate will provide the Contractor with written notice of any such acquisition within 14 days of completion.</p>

              <h3 style={{ fontSize: 15, margin: '16px 0 6px' }}>4. Clawback of Commission</h3>
              <p>4.1 Commission is subject to clawback (recovery by TalkMate) in the following circumstances:</p>
              <ul style={{ paddingLeft: 18, margin: '4px 0 8px' }}>
                <li>The client cancels their subscription or requests a refund within the 14-day money-back guarantee period.</li>
                <li>The sale is found to have been made through misrepresentation, false promises, or unethical conduct by the Contractor, as evidenced by call recordings, client complaints, written communications, or other reasonable evidence.</li>
                <li>The client&apos;s payment is charged back, reversed, or found to be fraudulent.</li>
                <li>The client cancels within 14 days citing a reason attributable to information or promises made by the Contractor that were not contained in the approved sales script in force at the time of the sale.</li>
              </ul>
              <p>4.2 If commission has already been paid at the time a clawback event occurs, TalkMate may deduct the clawback amount from future commission payments owing to the Contractor. If no future commissions are owing, TalkMate may invoice the Contractor for the clawback amount, which must be repaid within 14 days of invoice.</p>
              <p>4.3 TalkMate will notify the Contractor in writing of any clawback event and provide reasonable evidence of the basis for the clawback. The Contractor has 7 days from receipt of the clawback notice to dispute the clawback in writing. Any unresolved dispute will be handled under clause 11.</p>

              <h3 style={{ fontSize: 15, margin: '16px 0 6px' }}>5. Approved Sales Conduct and Compliance</h3>
              <p>5.1 The Contractor must at all times comply with:</p>
              <ul style={{ paddingLeft: 18, margin: '4px 0 8px' }}>
                <li>The Australian Consumer Law (Schedule 2 of the Competition and Consumer Act 2010 (Cth)) including prohibitions on misleading or deceptive conduct, false representations, and unconscionable conduct.</li>
                <li>The Spam Act 2003 (Cth) and the Do Not Call Register Act 2006 (Cth) when conducting outbound calls and communications.</li>
                <li>The Privacy Act 1988 (Cth) in relation to any personal information collected from or about prospects.</li>
                <li>TalkMate&apos;s approved scripts, pitch guidelines, and sales materials as updated from time to time and acknowledged by the Contractor under clause 2.3.</li>
              </ul>
              <p>5.2 The Contractor must not:</p>
              <ul style={{ paddingLeft: 18, margin: '4px 0 8px' }}>
                <li>Promise features, integrations, timelines, or capabilities not currently offered by TalkMate.</li>
                <li>Offer discounts, extended trials, free plans, or modified pricing without prior written approval from TalkMate.</li>
                <li>Represent themselves as an employee of TalkMate.</li>
                <li>Use TalkMate&apos;s brand, logo, or name in any marketing material without prior written approval.</li>
                <li>Contact individuals or businesses listed on the Do Not Call Register without lawful basis.</li>
              </ul>
              <p>5.3 In the event a client complaint or refund request is received by TalkMate that relates to conduct or representations made by the Contractor, TalkMate may investigate using available evidence including call recordings and written communications, and take such action as it deems appropriate including suspending commission payments, terminating this Agreement, and seeking recovery of losses under clause 10.</p>

              <h3 style={{ fontSize: 15, margin: '16px 0 6px' }}>6. Systems Access and Intellectual Property</h3>
              <p>6.1 TalkMate will provide the Contractor with access to the following systems for the purpose of performing the Services: TalkMate Sales HQ portal and CRM; approved lead packs as allocated by TalkMate; version-controlled sales scripts, pitch decks, and approved marketing materials.</p>
              <p>6.2 All systems, platforms, tools, lead data, client data, scripts, materials, and intellectual property provided by TalkMate remain the sole property of TalkMate at all times. The Contractor acquires no ownership interest in any TalkMate intellectual property.</p>
              <p>6.3 The Contractor must: use TalkMate systems only for the purpose of performing the Services under this Agreement; not download, copy, share, or distribute lead lists, client data, or TalkMate materials to any third party; not use TalkMate&apos;s systems, data, or materials for any purpose outside of this Agreement; and immediately notify TalkMate of any suspected unauthorised access to TalkMate systems.</p>
              <p>6.4 Upon termination of this Agreement for any reason, the Contractor must immediately cease using all TalkMate systems and return or destroy all TalkMate materials in their possession. TalkMate will revoke all system access within 24 hours of termination.</p>

              <h3 style={{ fontSize: 15, margin: '16px 0 6px' }}>7. Confidentiality</h3>
              <p>7.1 The Contractor acknowledges that in the course of performing the Services they will have access to confidential information of TalkMate including but not limited to: client lists, prospect lists, and lead data; pricing structures, commission arrangements, and business strategy; sales scripts, pitch materials, and conversion processes; technology, systems, and platform details; business plans, financial information, and commercial arrangements.</p>
              <p>7.2 The Contractor must not at any time, whether during or after the term of this Agreement, disclose or use any confidential information of TalkMate for any purpose other than performing the Services, without the prior written consent of TalkMate.</p>
              <p>7.3 The obligations of confidentiality in this clause survive termination of this Agreement for a period of two (2) years.</p>

              <h3 style={{ fontSize: 15, margin: '16px 0 6px' }}>8. Non-Solicitation</h3>
              <p>8.1 During the term of this Agreement and for a period of twelve (12) months following termination, the Contractor must not, anywhere in Australia:</p>
              <ul style={{ paddingLeft: 18, margin: '4px 0 8px' }}>
                <li>Directly or indirectly solicit, approach, or contact any client or prospect introduced to the Contractor through TalkMate for the purpose of selling competing products or services.</li>
                <li>Encourage or assist any TalkMate client to cancel their subscription or transition to a competing service.</li>
                <li>Use TalkMate&apos;s lead data or client information to benefit any competing business.</li>
                <li>Directly or indirectly solicit, recruit, or engage any employee, contractor, or team member of TalkMate to leave TalkMate or to work for any competing business or venture.</li>
              </ul>
              <p>8.2 The Contractor acknowledges that the non-solicitation obligations in this clause are reasonable in the circumstances, are geographically limited to Australia, and are necessary to protect TalkMate&apos;s legitimate business interests.</p>
              <p>8.3 If any court of competent jurisdiction finds any part of this clause to be unenforceable, the parties agree that the clause should be read down to the minimum extent necessary to make it enforceable.</p>

              <h3 style={{ fontSize: 15, margin: '16px 0 6px' }}>9. Term and Termination</h3>
              <p>9.1 This Agreement commences on the Effective Date and continues on an ongoing basis until terminated in accordance with this clause.</p>
              <p>9.2 Either party may terminate this Agreement without cause by providing fourteen (14) days written notice to the other party.</p>
              <p>9.3 TalkMate may terminate this Agreement immediately and without notice if the Contractor: commits a material breach of this Agreement including misrepresentation to clients; engages in conduct that is dishonest, fraudulent, or likely to bring TalkMate into disrepute; violates any applicable law including the Australian Consumer Law, Privacy Act, or Spam Act; discloses confidential information in breach of clause 7; solicits TalkMate clients or personnel in breach of clause 8; or fails to provide a valid ABN after being given 7 days written notice to do so.</p>
              <p>9.4 Upon termination: the Contractor&apos;s access to all TalkMate systems will be revoked within 24 hours; commission will be paid for Qualified Sales completed prior to the termination date, subject to the clawback provisions in clause 4; no commission will be payable for leads in the pipeline that have not resulted in a Qualified Sale prior to termination; and all confidentiality and non-solicitation obligations survive termination.</p>

              <h3 style={{ fontSize: 15, margin: '16px 0 6px' }}>10. Liability and Indemnity</h3>
              <p>10.1 The Contractor indemnifies and holds harmless TalkMate, its officers, employees, and agents against any loss, damage, cost, or liability (including legal costs) arising from: any misrepresentation, false statement, or unauthorised promise made by the Contractor to a prospect or client; any breach by the Contractor of this Agreement, applicable law, or regulatory requirement; or any claim by a client arising from the Contractor&apos;s conduct during the sales process.</p>
              <p>10.2 TalkMate&apos;s total liability to the Contractor under or in connection with this Agreement is limited to the total commission paid to the Contractor in the three (3) months preceding the event giving rise to the claim.</p>
              <p>10.3 Neither party is liable to the other for indirect, consequential, or loss of profits damages.</p>
              <p>10.4 TalkMate&apos;s liability under clause 10.1 does not extend to misrepresentations made by the Contractor that fall within the scope of the approved sales script in force at the time of the relevant sale. Where a client complaint arises from content contained in TalkMate&apos;s approved script, TalkMate accepts responsibility for that content.</p>

              <h3 style={{ fontSize: 15, margin: '16px 0 6px' }}>11. Dispute Resolution</h3>
              <p>11.1 If a dispute arises in connection with this Agreement, the party raising the dispute must notify the other party in writing, setting out the nature of the dispute and the outcome sought.</p>
              <p>11.2 Within 14 days of a dispute notice being received, both parties must attempt in good faith to resolve the dispute through direct written negotiation.</p>
              <p>11.3 If the dispute is not resolved within 14 days, either party may refer the dispute to the Queensland Civil and Administrative Tribunal (QCAT) for disputes with a value of ,000 or less, or to a court of competent jurisdiction for disputes exceeding ,000.</p>
              <p>11.4 QCAT proceedings may be initiated by either party without the requirement for mediation or any other pre-litigation step beyond the 14-day negotiation window in clause 11.2.</p>
              <p>11.5 This Agreement is governed by the laws of Queensland, Australia. The parties submit to the non-exclusive jurisdiction of the courts and tribunals of Queensland.</p>
              <p>11.6 Nothing in this clause prevents either party from seeking urgent injunctive or declaratory relief from a court of competent jurisdiction where necessary to protect confidential information, intellectual property, or other time-sensitive interests.</p>

              <h3 style={{ fontSize: 15, margin: '16px 0 6px' }}>12. General Provisions</h3>
              <p>12.1 <strong>Entire Agreement.</strong> This Agreement constitutes the entire agreement between the parties in relation to its subject matter and supersedes all prior representations, negotiations, and understandings.</p>
              <p>12.2 <strong>Variation.</strong> This Agreement may only be varied by written agreement signed by both parties, except that TalkMate may vary the commission structure on thirty (30) days written notice under clause 3.7.</p>
              <p>12.3 <strong>Waiver.</strong> A failure or delay by either party to exercise a right under this Agreement does not operate as a waiver of that right.</p>
              <p>12.4 <strong>Severability.</strong> If any provision of this Agreement is found to be invalid or unenforceable, the remaining provisions continue in full force and effect.</p>
              <p>12.5 <strong>Notices.</strong> Notices under this Agreement may be given by email to the email addresses provided by each party at the time of engagement. A notice sent by email is taken to be received at the time of transmission unless the sender receives a delivery failure notification.</p>
              <p>12.6 <strong>Electronic Execution.</strong> The parties agree that this Agreement will be executed electronically via the TalkMate Sales Portal. An electronic signature applied through the TalkMate portal has the same legal effect as a handwritten signature under the Electronic Transactions Act 2001 (Qld). A PDF copy of the executed agreement will be automatically emailed to the Contractor&apos;s nominated email address upon execution.</p>
              <p>12.7 <strong>Counterparts.</strong> This Agreement may be executed in counterparts, each of which is an original and all of which together constitute one instrument.</p>

              <h3 style={{ fontSize: 15, margin: '16px 0 6px' }}>Schedule 1: Commission Rates</h3>
              <CommissionTable />

              <p style={{ marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                TalkMate | Miami QLD 4220 | talkmate.com.au | Version 2.0
              </p>
              <p style={{ marginTop: 8 }}>I have read and understood the full TalkMate Sales Contractor Agreement Version 2.0.</p>
            </div>
            <p style={note}>
              {agreementScrolled ? 'Thanks - you can continue.' : 'Scroll to the bottom of the agreement to continue.'}
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button style={buttonGhost} onClick={() => setStep(1)}>Back</button>
              <button
                style={agreementScrolled ? button : buttonDisabled}
                disabled={!agreementScrolled}
                onClick={() => setStep(3)}
              >Continue to Sign</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1 style={heading}>Your Details</h1>
            <p style={sub}>We have pre-filled what we know. Add your ABN and bank details if you have them.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={label}>First Name</label>
                <input style={inputReadOnly} value={c.first_name} readOnly />
              </div>
              <div>
                <label style={label}>Last Name</label>
                <input style={inputReadOnly} value={c.last_name} readOnly />
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={label}>Email</label>
              <input style={inputReadOnly} value={c.email} readOnly />
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={label}>Phone</label>
              <input style={input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="04xx xxx xxx" />
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={label}>ABN (required)</label>
              <input
                style={input}
                value={abn}
                onChange={e => setAbn(e.target.value)}
                placeholder="11 digit ABN"
                required
                inputMode="numeric"
                maxLength={14}
              />
              {abn.trim().length > 0 && !isValidAbnFormat(abn) && (
                <p style={{ ...note, color: '#fca5a5' }}>
                  Please enter your 11-digit ABN. Contractors must have a valid ABN to engage with TalkMate.
                </p>
              )}
              {abn.trim().length === 0 && (
                <p style={note}>
                  Contractors must have a valid 11-digit ABN to engage with TalkMate.
                </p>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginTop: 12 }}>
              <div>
                <label style={label}>Bank BSB</label>
                <input style={input} value={bsb} onChange={e => setBsb(e.target.value)} placeholder="000-000" />
              </div>
              <div>
                <label style={label}>Account Number</label>
                <input style={input} value={acct} onChange={e => setAcct(e.target.value)} placeholder="Account number" />
              </div>
            </div>
            <p style={note}>Bank details are required before your first commission payment but optional at this stage.</p>

            {submitError && <div style={{ ...errorBox, marginTop: 12 }}>{submitError}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button style={buttonGhost} onClick={() => setStep(2)}>Back</button>
              <button
                style={submitting || !abnValid ? buttonDisabled : button}
                disabled={submitting || !abnValid}
                onClick={submitDetails}
              >
                {submitting ? 'Saving...' : 'Continue'}
              </button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h1 style={heading}>Sign the Agreement</h1>
            <p style={sub}>
              By signing below you confirm you have read and agree to all terms of
              the TalkMate Sales Contractor Agreement v2.1.
            </p>

            <div style={summaryBox}>
              <div style={{ marginBottom: 4 }}><strong>Contractor:</strong> {fullName}</div>
              <div style={{ marginBottom: 4 }}><strong>Agreement Version:</strong> 2.1</div>
              <div style={{ marginBottom: 4 }}><strong>Date:</strong> {today}</div>
              <div><strong>Script Version:</strong> {scriptVersion} (dated {scriptDate})</div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <SignatureCapture
                signerName={fullName}
                onSignatureChange={setSignatureDataUrl}
                onMethodChange={setSignatureMethod}
              />
            </div>

            <label style={checkboxRow}>
              <input type="checkbox" checked={agreeAgreement} onChange={e => setAgreeAgreement(e.target.checked)} style={{ marginTop: 4 }} />
              <span style={{ fontSize: 14, lineHeight: 1.5 }}>
                I, <strong>{fullName}</strong>, agree to be legally bound by the TalkMate Sales Contractor
                Agreement Version 2.1 dated {today}. I confirm this electronic signature has the same
                legal effect as my handwritten signature under the Electronic Transactions Act 2001 (Qld).
              </span>
            </label>

            <label style={checkboxRow}>
              <input type="checkbox" checked={agreeScript} onChange={e => setAgreeScript(e.target.checked)} style={{ marginTop: 4 }} />
              <span style={{ fontSize: 14, lineHeight: 1.5 }}>
                I confirm I have read and understood the current approved TalkMate sales script
                (Version {scriptVersion}, dated {scriptDate}) and I acknowledge that I am only authorised
                to make representations contained within that script.
              </span>
            </label>

            {submitError && <div style={{ ...errorBox, marginTop: 12 }}>{submitError}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button style={buttonGhost} onClick={() => setStep(3)}>Back</button>
              <button
                style={
                  submitting
                    || !signatureDataUrl
                    || !agreeAgreement
                    || !agreeScript
                    || !abnValid
                    ? buttonDisabled
                    : button
                }
                disabled={
                  submitting
                  || !signatureDataUrl
                  || !agreeAgreement
                  || !agreeScript
                  || !abnValid
                }
                onClick={submitSign}
              >
                {submitting ? 'Generating your signed agreement...' : 'Sign and Complete'}
              </button>
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <h1 style={heading}>You're all signed up.</h1>
            <p style={sub}>
              Your signed agreement has been emailed to <strong>{c.email}</strong>. Welcome to the
              TalkMate sales team.
            </p>

            <div style={summaryBox}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Next: sign in to Sales HQ</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>
                We&apos;ve emailed your portal access details to <strong>{c.email}</strong>. Check
                spam if you don&apos;t see it within a few minutes. You can also open the portal
                directly below — use <strong>Magic Link</strong> on the sign-in page if you haven&apos;t
                set a password yet, or <strong>Forgot password</strong> if you need to reset one.
              </div>
            </div>

            <a
              href={`/login?next=${encodeURIComponent('/sales/dashboard')}`}
              style={{ ...button, textDecoration: 'none', display: 'inline-block', textAlign: 'center' }}
            >
              Open Sales HQ →
            </a>

            <h3 style={{ fontSize: 16, margin: '24px 0 6px' }}>Commission Schedule</h3>
            <CommissionTable />
            <p style={{ ...note, marginTop: 20 }}>
              Questions? Email <a style={{ color: '#22D3EE' }} href="mailto:hello@talkmate.com.au">hello@talkmate.com.au</a>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
