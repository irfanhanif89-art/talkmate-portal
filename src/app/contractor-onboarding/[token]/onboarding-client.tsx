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
            Email <a style={{ color: '#22D3EE' }} href="mailto:irfanhanif89@gmail.com">irfanhanif89@gmail.com</a>
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
              <h2 style={{ fontSize: 18, marginTop: 0 }}>TalkMate Sales Contractor Agreement, Version 2.0</h2>
              <p>Effective: {today}</p>
              <p>This Agreement is between TalkMate (the Company) and the Contractor named above.</p>
              <p><strong>1. Engagement.</strong> The Contractor is engaged on a non-exclusive basis to
              introduce TalkMate to prospective clients in Australia. The Contractor is not an
              employee of TalkMate and is responsible for their own tax obligations.</p>
              <p><strong>2. Approved sales script.</strong> The Contractor may only make
              representations contained in the current approved TalkMate sales script. Going outside
              the approved script is a material breach of this Agreement.</p>
              <p><strong>3. Commission.</strong> Commission is paid only on cleared sales, defined as
              a sale that has completed a 14 day clawback period without refund or cancellation.
              Commission amounts are set out in the schedule at the end of this Agreement.</p>
              <p><strong>4. ABN and withholding.</strong> Where the Contractor does not provide a
              valid ABN, TalkMate is required by Australian law to withhold 47 percent of all
              commission payments. The Contractor may provide an ABN at any time to remove this
              withholding from future payments.</p>
              <p><strong>5. Clawback.</strong> If a sale refunds or cancels within 14 days, the
              related commission is reversed. If the commission has already been paid, the
              Contractor must repay TalkMate within 14 days of notice.</p>
              <p><strong>6. Termination.</strong> Either party may terminate this Agreement on 14
              days written notice. TalkMate may terminate immediately for breach of clause 2.</p>
              <p><strong>7. Confidentiality.</strong> The Contractor agrees to keep all TalkMate
              client information, pricing, and operational details confidential.</p>
              <p><strong>8. Electronic signature.</strong> The parties agree this Agreement may be
              signed electronically. An electronic signature has the same legal effect as a
              handwritten signature under the Electronic Transactions Act 2001 (Qld).</p>
              <p><strong>9. Governing law.</strong> This Agreement is governed by the laws of
              Queensland, Australia.</p>
              <h3 style={{ fontSize: 15, marginBottom: 6 }}>Commission Schedule</h3>
              <CommissionTable />
              <p style={{ marginTop: 12 }}>I have read and understood the full TalkMate Sales Contractor Agreement.</p>
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
              the TalkMate Sales Contractor Agreement v2.0.
            </p>

            <div style={summaryBox}>
              <div style={{ marginBottom: 4 }}><strong>Contractor:</strong> {fullName}</div>
              <div style={{ marginBottom: 4 }}><strong>Agreement Version:</strong> 2.0</div>
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
                Agreement Version 2.0 dated {today}. I confirm this electronic signature has the same
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
            <h3 style={{ fontSize: 16, margin: '20px 0 6px' }}>Commission Schedule</h3>
            <CommissionTable />
            <p style={{ ...note, marginTop: 20 }}>
              Questions? Email <a style={{ color: '#22D3EE' }} href="mailto:irfanhanif89@gmail.com">irfanhanif89@gmail.com</a>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
