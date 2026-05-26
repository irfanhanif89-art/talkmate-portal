import { promises as fs } from 'fs'
import path from 'path'
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import { isValidAbnFormat } from '@/lib/abn'

export interface ContractorAgreementFields {
  contractor_first_name: string
  contractor_last_name: string
  agreement_date: string
  contractor_email: string
  contractor_phone: string
  contractor_abn: string
  contractor_bsb: string
  contractor_account_number: string
  script_version: string
  script_date: string
  signed_ip: string
  signed_at_iso: string
  // Optional captured signature. PNG data URL captured client-side via
  // SignatureCapture. When supplied, the image is embedded on the
  // signature page. Method is recorded as text caption for audit.
  signature_data_url?: string
  signature_method?: 'drawn' | 'typed'
}

export interface GeneratePdfResult {
  pdf: Uint8Array
  usedTemplate: boolean
}

const TEMPLATE_REL_PATH = 'public/templates/contractor-agreement-template.pdf'

const PAGE_W = 595.28 // A4
const PAGE_H = 841.89
const MARGIN_X = 50
const MARGIN_TOP = 800
const MARGIN_BOTTOM = 60
const TEXT_WIDTH = PAGE_W - MARGIN_X * 2

const BODY_SIZE = 11
const BODY_LEADING = 14
const H1_SIZE = 18
const H2_SIZE = 14
const H3_SIZE = 12

const COLOR_BLACK = rgb(0.04, 0.07, 0.14)
const COLOR_GREY = rgb(0.4, 0.43, 0.5)
const COLOR_DARK_GREY = rgb(0.25, 0.28, 0.34)

// Server-side PDF generation. If the template file exists at
// /public/templates/contractor-agreement-template.pdf, the template is
// loaded and a signature page is appended. Otherwise a self-contained
// full v2.0 agreement is generated programmatically with all clauses
// and the contractor's details filled in.
export async function generateContractorAgreementPdf(
  fields: ContractorAgreementFields
): Promise<GeneratePdfResult> {
  // ABN is mandatory and must pass format + checksum validation. The
  // client and server routes enforce this earlier; this check is a
  // last-line guard so we never produce a PDF without a valid ABN.
  if (!fields.contractor_abn || !isValidAbnFormat(fields.contractor_abn)) {
    throw new Error('contractor_abn must be a valid 11-digit ABN')
  }

  const templatePath = path.join(process.cwd(), TEMPLATE_REL_PATH)
  let templateBytes: Uint8Array | null = null
  try {
    const buf = await fs.readFile(templatePath)
    templateBytes = new Uint8Array(buf)
  } catch {
    templateBytes = null
  }

  let pdfDoc: PDFDocument
  let usedTemplate = false

  if (templateBytes) {
    try {
      pdfDoc = await PDFDocument.load(templateBytes)
      usedTemplate = true
    } catch {
      pdfDoc = await PDFDocument.create()
    }
  } else {
    pdfDoc = await PDFDocument.create()
  }

  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const helvItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)

  if (!usedTemplate) {
    renderFullAgreement(pdfDoc, helv, helvBold, helvItalic, fields)
  }

  // Always append a signature page so the executed copy is identifiable
  // and the captured signature image lands somewhere even if the body
  // came from a template upload.
  await renderSignaturePage(pdfDoc, helv, helvBold, fields, usedTemplate)

  const bytes = await pdfDoc.save()
  return { pdf: bytes, usedTemplate }
}

export function formatAgreementDate(d: Date): string {
  return d.toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane',
  })
}

// ──────────────────────────────────────────────────────────────────────
// Paginated layout primitives
// ──────────────────────────────────────────────────────────────────────

interface Cursor {
  page: PDFPage
  y: number
}

function newPage(pdfDoc: PDFDocument): PDFPage {
  return pdfDoc.addPage([PAGE_W, PAGE_H])
}

function ensureSpace(pdfDoc: PDFDocument, cursor: Cursor, needed: number): Cursor {
  if (cursor.y - needed < MARGIN_BOTTOM) {
    const page = newPage(pdfDoc)
    return { page, y: MARGIN_TOP }
  }
  return cursor
}

// Wrap a single paragraph of plain text to TEXT_WIDTH using `font` at `size`.
function wrapLines(font: PDFFont, size: number, text: string, maxWidth = TEXT_WIDTH): string[] {
  // Strip soft hyphens and normalise whitespace. pdf-lib's standard fonts
  // cannot encode characters outside WinAnsi (e.g. smart quotes), so map
  // common ones to ASCII equivalents before measuring/drawing.
  const norm = text
    .replace(/’/g, "'")
    .replace(/‘/g, "'")
    .replace(/“/g, '"')
    .replace(/”/g, '"')
    .replace(/–|—/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!norm) return ['']

  const words = norm.split(' ')
  const out: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    const width = font.widthOfTextAtSize(next, size)
    if (width <= maxWidth) {
      line = next
    } else {
      if (line) out.push(line)
      // Hard break for single tokens longer than the page width — break
      // by character rather than overflow.
      if (font.widthOfTextAtSize(w, size) > maxWidth) {
        let chunk = ''
        for (const ch of w) {
          const trial = chunk + ch
          if (font.widthOfTextAtSize(trial, size) > maxWidth) {
            out.push(chunk)
            chunk = ch
          } else {
            chunk = trial
          }
        }
        if (chunk) line = chunk
        else line = ''
      } else {
        line = w
      }
    }
  }
  if (line) out.push(line)
  return out
}

function drawParagraph(
  pdfDoc: PDFDocument,
  cursor: Cursor,
  text: string,
  opts: { font: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number; leadingExtra?: number } = { font: null as unknown as PDFFont },
): Cursor {
  const size = opts.size ?? BODY_SIZE
  const indent = opts.indent ?? 0
  const leading = (size <= BODY_SIZE ? BODY_LEADING : size + 4) + (opts.leadingExtra ?? 0)
  const lines = wrapLines(opts.font, size, text, TEXT_WIDTH - indent)

  let cur = cursor
  for (const line of lines) {
    cur = ensureSpace(pdfDoc, cur, leading)
    cur.page.drawText(line, {
      x: MARGIN_X + indent,
      y: cur.y,
      size,
      font: opts.font,
      color: opts.color ?? COLOR_BLACK,
    })
    cur = { page: cur.page, y: cur.y - leading }
  }
  return cur
}

function drawHeading(
  pdfDoc: PDFDocument,
  cursor: Cursor,
  text: string,
  opts: { font: PDFFont; size: number; topGap?: number; bottomGap?: number; color?: ReturnType<typeof rgb> },
): Cursor {
  const topGap = opts.topGap ?? 10
  const bottomGap = opts.bottomGap ?? 6
  // Reserve space for the heading + first line of body to keep widows
  // off the next page.
  const needed = topGap + opts.size + bottomGap + BODY_LEADING
  let cur = ensureSpace(pdfDoc, cursor, needed)
  cur = { page: cur.page, y: cur.y - topGap }
  cur.page.drawText(text, {
    x: MARGIN_X,
    y: cur.y,
    size: opts.size,
    font: opts.font,
    color: opts.color ?? COLOR_BLACK,
  })
  return { page: cur.page, y: cur.y - opts.size - bottomGap }
}

function drawBullet(
  pdfDoc: PDFDocument,
  cursor: Cursor,
  text: string,
  font: PDFFont,
): Cursor {
  const bulletIndent = 22
  // Draw bullet char then wrapped text indented past it
  const lines = wrapLines(font, BODY_SIZE, text, TEXT_WIDTH - bulletIndent)
  let cur = cursor
  for (let i = 0; i < lines.length; i++) {
    cur = ensureSpace(pdfDoc, cur, BODY_LEADING)
    if (i === 0) {
      cur.page.drawText('•', {
        x: MARGIN_X + 6,
        y: cur.y,
        size: BODY_SIZE,
        font,
        color: COLOR_BLACK,
      })
    }
    cur.page.drawText(lines[i], {
      x: MARGIN_X + bulletIndent,
      y: cur.y,
      size: BODY_SIZE,
      font,
      color: COLOR_BLACK,
    })
    cur = { page: cur.page, y: cur.y - BODY_LEADING }
  }
  return cur
}

function gap(cursor: Cursor, amount: number): Cursor {
  return { page: cursor.page, y: cursor.y - amount }
}

// ──────────────────────────────────────────────────────────────────────
// Commission table — drawn manually so column alignment is consistent.
// ──────────────────────────────────────────────────────────────────────

function drawCommissionTable(
  pdfDoc: PDFDocument,
  cursor: Cursor,
  font: PDFFont,
  fontBold: PDFFont,
): Cursor {
  const headers = ['Plan', 'Monthly Price', 'Annual Price', 'Monthly Comm.', 'Annual Comm.']
  const rows: string[][] = [
    ['Starter', '$299/mo', '$2,990 upfront', '$299', '$373.75'],
    ['Growth',  '$499/mo', '$4,990 upfront', '$349', '$473.75'],
    ['Pro',     '$799/mo', '$7,990 upfront', '$399', '$598.75'],
  ]
  const cols = [0, 95, 215, 320, 410]
  const rowH = 16
  const needed = rowH * (rows.length + 1) + 12

  let cur = ensureSpace(pdfDoc, cursor, needed)

  // Header
  for (let i = 0; i < headers.length; i++) {
    cur.page.drawText(headers[i], {
      x: MARGIN_X + cols[i],
      y: cur.y,
      size: 10,
      font: fontBold,
      color: COLOR_DARK_GREY,
    })
  }
  cur = { page: cur.page, y: cur.y - rowH }
  cur.page.drawLine({
    start: { x: MARGIN_X, y: cur.y + 6 },
    end:   { x: MARGIN_X + TEXT_WIDTH, y: cur.y + 6 },
    thickness: 0.5,
    color: COLOR_GREY,
  })

  // Data rows
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      cur.page.drawText(row[i], {
        x: MARGIN_X + cols[i],
        y: cur.y,
        size: 10,
        font: i === 0 ? fontBold : font,
        color: COLOR_BLACK,
      })
    }
    cur = { page: cur.page, y: cur.y - rowH }
  }
  return gap(cur, 6)
}

// ──────────────────────────────────────────────────────────────────────
// Full v2.0 agreement renderer
// ──────────────────────────────────────────────────────────────────────

function renderFullAgreement(
  pdfDoc: PDFDocument,
  helv: PDFFont,
  helvBold: PDFFont,
  helvItalic: PDFFont,
  f: ContractorAgreementFields,
) {
  const fullName = `${f.contractor_first_name} ${f.contractor_last_name}`.trim()
  const cover = newPage(pdfDoc)
  let c: Cursor = { page: cover, y: MARGIN_TOP }

  // Cover
  c.page.drawText('TalkMate', { x: MARGIN_X, y: c.y, size: 24, font: helvBold, color: COLOR_BLACK })
  c = { page: c.page, y: c.y - 30 }
  c.page.drawText('Sales Contractor Agreement', { x: MARGIN_X, y: c.y, size: H1_SIZE, font: helvBold, color: COLOR_BLACK })
  c = { page: c.page, y: c.y - 22 }
  c.page.drawText('Version 2.0', { x: MARGIN_X, y: c.y, size: 11, font: helv, color: COLOR_GREY })
  c = { page: c.page, y: c.y - 14 }
  c.page.drawText('Miami, QLD 4220 | talkmate.com.au', { x: MARGIN_X, y: c.y, size: 10, font: helv, color: COLOR_GREY })
  c = gap(c, 22)

  c = drawParagraph(pdfDoc, c, 'This Sales Contractor Agreement (Agreement) is entered into between:', { font: helv })
  c = gap(c, 6)
  c = drawParagraph(pdfDoc, c, `Principal: TalkMate (ABN: TBC), trading as TalkMate, Miami QLD 4220 (TalkMate).`, { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, `Contractor: ${fullName} (Contractor).`, { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, `Effective Date: ${f.agreement_date}.`, { font: helvBold })

  // Section 1
  c = drawHeading(pdfDoc, c, '1. Appointment and Nature of Engagement', { font: helvBold, size: H2_SIZE, topGap: 18 })
  c = drawParagraph(pdfDoc, c, "1.1 TalkMate appoints the Contractor as a non-exclusive independent sales contractor to promote and sell TalkMate's AI receptionist subscription plans to prospective clients in Australia.", { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, "1.2 The Contractor is engaged as an independent contractor, not as an employee, partner, agent, or joint venturer of TalkMate. Nothing in this Agreement creates an employment relationship. The Contractor has no authority to bind TalkMate contractually or make representations on TalkMate's behalf beyond what is expressly authorised in this Agreement.", { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '1.3 The Contractor acknowledges and agrees that:', { font: helv })
  c = drawBullet(pdfDoc, c, 'They are free to perform work for other businesses and clients simultaneously, provided this does not conflict with their obligations under this Agreement.', helv)
  c = drawBullet(pdfDoc, c, 'They are responsible for their own tax obligations including income tax, GST (if registered), and superannuation. TalkMate will not withhold PAYG from commission payments.', helv)
  c = drawBullet(pdfDoc, c, 'They are not entitled to paid leave, annual leave, personal leave, public holiday pay, redundancy pay, or any other employment entitlement under the Fair Work Act 2009 (Cth) or any applicable Modern Award.', helv)
  c = drawBullet(pdfDoc, c, 'They must obtain their own professional indemnity and public liability insurance where appropriate.', helv)
  c = drawBullet(pdfDoc, c, 'They are responsible for providing their own equipment, phone, and internet connection to perform the Services.', helv)

  // Section 2
  c = drawHeading(pdfDoc, c, '2. Scope of Services', { font: helvBold, size: H2_SIZE, topGap: 14 })
  c = drawParagraph(pdfDoc, c, '2.1 The Contractor agrees to perform the following services (Services):', { font: helv })
  c = drawBullet(pdfDoc, c, 'Conduct outbound cold calls to prospective small business clients in Australia using approved TalkMate scripts and sales materials.', helv)
  c = drawBullet(pdfDoc, c, "Present and promote TalkMate's AI receptionist plans accurately and in accordance with the approved pitch provided by TalkMate.", helv)
  c = drawBullet(pdfDoc, c, 'Qualify prospects and guide them through the sales process to the point of sign-up via the TalkMate portal.', helv)
  c = drawBullet(pdfDoc, c, 'Maintain accurate records of leads contacted, outcomes, and pipeline status within the TalkMate Sales HQ CRM.', helv)
  c = drawBullet(pdfDoc, c, 'Conduct follow-up communications with prospects as directed by TalkMate.', helv)
  c = drawBullet(pdfDoc, c, 'Represent TalkMate professionally and ethically at all times.', helv)
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, "2.2 The Contractor must not make any representations, promises, or guarantees about TalkMate's product, features, or capabilities that are not contained in the current version of TalkMate's approved sales script. Any misrepresentation made by the Contractor to a client is a material breach of this Agreement.", { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, "2.3 TalkMate will maintain version-controlled copies of all approved sales scripts. At the commencement of engagement and upon any material update to the approved script, the Contractor must acknowledge in writing (including by email or via the TalkMate portal) that they have read and understood the current approved script. The Contractor's liability under clause 5 is limited to representations made beyond the scope of the approved script version in force at the time of the relevant sale.", { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '2.4 The Contractor consents to TalkMate monitoring, recording, and reviewing their sales calls and communications for quality assurance and compliance purposes. The Contractor acknowledges that call recordings may be used as evidence in any dispute, clawback assessment, or compliance investigation under this Agreement.', { font: helv })

  // Section 3
  c = drawHeading(pdfDoc, c, '3. Commission Structure and Payment', { font: helvBold, size: H2_SIZE, topGap: 14 })
  c = drawParagraph(pdfDoc, c, '3.1 TalkMate will pay the Contractor a commission for each Qualified Sale. Commission rates vary depending on the plan sold and whether the client pays on a monthly or annual basis, as set out in the table below.', { font: helv })
  c = gap(c, 6)
  c = drawCommissionTable(pdfDoc, c, helv, helvBold)
  c = drawParagraph(pdfDoc, c, '3.2 Annual plan commission is calculated as the base monthly commission for the relevant plan plus 2.5% of the total annual amount paid by the client.', { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '3.3 A Qualified Sale means a sale where:', { font: helv })
  c = drawBullet(pdfDoc, c, 'The client has successfully signed up to a TalkMate plan via the portal.', helv)
  c = drawBullet(pdfDoc, c, "The client's payment has been received and cleared by TalkMate.", helv)
  c = drawBullet(pdfDoc, c, 'The client has not cancelled or requested a refund within the 14-day money-back guarantee period.', helv)
  c = drawBullet(pdfDoc, c, 'The sale was not made through misrepresentation, false promise, or unethical conduct by the Contractor.', helv)
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, "3.4 Commission will be paid within 14 days after the expiry of the client's 14-day money-back guarantee period, provided the sale qualifies under clause 3.3.", { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '3.5 Commission payments will be made by bank transfer to the account nominated by the Contractor. The Contractor must provide valid banking details prior to the first payment.', { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '3.6 ABN and Tax Withholding. The Contractor must provide a valid Australian Business Number (ABN) prior to receiving any commission payment. If the Contractor fails to provide a valid ABN, TalkMate is required by law under the Tax Laws Amendment (Improving Small Business Outcomes) Act and ATO no-ABN withholding rules to withhold 47% of each commission payment and remit that amount to the Australian Taxation Office. TalkMate accepts no liability for any tax consequences arising from the Contractor\'s failure to provide a valid ABN.', { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '3.7 TalkMate reserves the right to adjust the commission structure by providing 30 days written notice to the Contractor. Sales made prior to the effective date of any change will be paid at the rate applicable at the time of sale.', { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '3.8 Acquisition. In the event TalkMate is acquired by or merges with another entity during the term of this Agreement, TalkMate will use reasonable endeavours to ensure that commission obligations for Qualified Sales made prior to the acquisition date are honoured by the acquiring entity. TalkMate will provide the Contractor with written notice of any such acquisition within 14 days of completion.', { font: helv })

  // Section 4
  c = drawHeading(pdfDoc, c, '4. Clawback of Commission', { font: helvBold, size: H2_SIZE, topGap: 14 })
  c = drawParagraph(pdfDoc, c, '4.1 Commission is subject to clawback (recovery by TalkMate) in the following circumstances:', { font: helv })
  c = drawBullet(pdfDoc, c, 'The client cancels their subscription or requests a refund within the 14-day money-back guarantee period.', helv)
  c = drawBullet(pdfDoc, c, 'The sale is found to have been made through misrepresentation, false promises, or unethical conduct by the Contractor, as evidenced by call recordings, client complaints, written communications, or other reasonable evidence.', helv)
  c = drawBullet(pdfDoc, c, "The client's payment is charged back, reversed, or found to be fraudulent.", helv)
  c = drawBullet(pdfDoc, c, 'The client cancels within 14 days citing a reason attributable to information or promises made by the Contractor that were not contained in the approved sales script in force at the time of the sale.', helv)
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '4.2 If commission has already been paid at the time a clawback event occurs, TalkMate may deduct the clawback amount from future commission payments owing to the Contractor. If no future commissions are owing, TalkMate may invoice the Contractor for the clawback amount, which must be repaid within 14 days of invoice.', { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '4.3 TalkMate will notify the Contractor in writing of any clawback event and provide reasonable evidence of the basis for the clawback. The Contractor has 7 days from receipt of the clawback notice to dispute the clawback in writing. Any unresolved dispute will be handled under clause 11.', { font: helv })

  // Section 5
  c = drawHeading(pdfDoc, c, '5. Approved Sales Conduct and Compliance', { font: helvBold, size: H2_SIZE, topGap: 14 })
  c = drawParagraph(pdfDoc, c, '5.1 The Contractor must at all times comply with:', { font: helv })
  c = drawBullet(pdfDoc, c, 'The Australian Consumer Law (Schedule 2 of the Competition and Consumer Act 2010 (Cth)) including prohibitions on misleading or deceptive conduct, false representations, and unconscionable conduct.', helv)
  c = drawBullet(pdfDoc, c, 'The Spam Act 2003 (Cth) and the Do Not Call Register Act 2006 (Cth) when conducting outbound calls and communications.', helv)
  c = drawBullet(pdfDoc, c, 'The Privacy Act 1988 (Cth) in relation to any personal information collected from or about prospects.', helv)
  c = drawBullet(pdfDoc, c, "TalkMate's approved scripts, pitch guidelines, and sales materials as updated from time to time and acknowledged by the Contractor under clause 2.3.", helv)
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '5.2 The Contractor must not:', { font: helv })
  c = drawBullet(pdfDoc, c, 'Promise features, integrations, timelines, or capabilities not currently offered by TalkMate.', helv)
  c = drawBullet(pdfDoc, c, 'Offer discounts, extended trials, free plans, or modified pricing without prior written approval from TalkMate.', helv)
  c = drawBullet(pdfDoc, c, 'Represent themselves as an employee of TalkMate.', helv)
  c = drawBullet(pdfDoc, c, "Use TalkMate's brand, logo, or name in any marketing material without prior written approval.", helv)
  c = drawBullet(pdfDoc, c, 'Contact individuals or businesses listed on the Do Not Call Register without lawful basis.', helv)
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '5.3 In the event a client complaint or refund request is received by TalkMate that relates to conduct or representations made by the Contractor, TalkMate may investigate using available evidence including call recordings and written communications, and take such action as it deems appropriate including suspending commission payments, terminating this Agreement, and seeking recovery of losses under clause 10.', { font: helv })

  // Section 6
  c = drawHeading(pdfDoc, c, '6. Systems Access and Intellectual Property', { font: helvBold, size: H2_SIZE, topGap: 14 })
  c = drawParagraph(pdfDoc, c, '6.1 TalkMate will provide the Contractor with access to the following systems for the purpose of performing the Services:', { font: helv })
  c = drawBullet(pdfDoc, c, 'TalkMate Sales HQ portal and CRM.', helv)
  c = drawBullet(pdfDoc, c, 'Approved lead packs as allocated by TalkMate.', helv)
  c = drawBullet(pdfDoc, c, 'Version-controlled sales scripts, pitch decks, and approved marketing materials.', helv)
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '6.2 All systems, platforms, tools, lead data, client data, scripts, materials, and intellectual property provided by TalkMate remain the sole property of TalkMate at all times. The Contractor acquires no ownership interest in any TalkMate intellectual property.', { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '6.3 The Contractor must:', { font: helv })
  c = drawBullet(pdfDoc, c, 'Use TalkMate systems only for the purpose of performing the Services under this Agreement.', helv)
  c = drawBullet(pdfDoc, c, 'Not download, copy, share, or distribute lead lists, client data, or TalkMate materials to any third party.', helv)
  c = drawBullet(pdfDoc, c, "Not use TalkMate's systems, data, or materials for any purpose outside of this Agreement.", helv)
  c = drawBullet(pdfDoc, c, 'Immediately notify TalkMate of any suspected unauthorised access to TalkMate systems.', helv)
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '6.4 Upon termination of this Agreement for any reason, the Contractor must immediately cease using all TalkMate systems and return or destroy all TalkMate materials in their possession. TalkMate will revoke all system access within 24 hours of termination.', { font: helv })

  // Section 7
  c = drawHeading(pdfDoc, c, '7. Confidentiality', { font: helvBold, size: H2_SIZE, topGap: 14 })
  c = drawParagraph(pdfDoc, c, '7.1 The Contractor acknowledges that in the course of performing the Services they will have access to confidential information of TalkMate including but not limited to:', { font: helv })
  c = drawBullet(pdfDoc, c, 'Client lists, prospect lists, and lead data.', helv)
  c = drawBullet(pdfDoc, c, 'Pricing structures, commission arrangements, and business strategy.', helv)
  c = drawBullet(pdfDoc, c, 'Sales scripts, pitch materials, and conversion processes.', helv)
  c = drawBullet(pdfDoc, c, 'Technology, systems, and platform details.', helv)
  c = drawBullet(pdfDoc, c, 'Business plans, financial information, and commercial arrangements.', helv)
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '7.2 The Contractor must not at any time, whether during or after the term of this Agreement, disclose or use any confidential information of TalkMate for any purpose other than performing the Services, without the prior written consent of TalkMate.', { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '7.3 The obligations of confidentiality in this clause survive termination of this Agreement for a period of two (2) years.', { font: helv })

  // Section 8
  c = drawHeading(pdfDoc, c, '8. Non-Solicitation', { font: helvBold, size: H2_SIZE, topGap: 14 })
  c = drawParagraph(pdfDoc, c, '8.1 During the term of this Agreement and for a period of twelve (12) months following termination, the Contractor must not, anywhere in Australia:', { font: helv })
  c = drawBullet(pdfDoc, c, 'Directly or indirectly solicit, approach, or contact any client or prospect introduced to the Contractor through TalkMate for the purpose of selling competing products or services.', helv)
  c = drawBullet(pdfDoc, c, 'Encourage or assist any TalkMate client to cancel their subscription or transition to a competing service.', helv)
  c = drawBullet(pdfDoc, c, "Use TalkMate's lead data or client information to benefit any competing business.", helv)
  c = drawBullet(pdfDoc, c, 'Directly or indirectly solicit, recruit, or engage any employee, contractor, or team member of TalkMate to leave TalkMate or to work for any competing business or venture.', helv)
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, "8.2 The Contractor acknowledges that the non-solicitation obligations in this clause are reasonable in the circumstances, are geographically limited to Australia, and are necessary to protect TalkMate's legitimate business interests.", { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '8.3 If any court of competent jurisdiction finds any part of this clause to be unenforceable, the parties agree that the clause should be read down to the minimum extent necessary to make it enforceable.', { font: helv })

  // Section 9
  c = drawHeading(pdfDoc, c, '9. Term and Termination', { font: helvBold, size: H2_SIZE, topGap: 14 })
  c = drawParagraph(pdfDoc, c, '9.1 This Agreement commences on the Effective Date and continues on an ongoing basis until terminated in accordance with this clause.', { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '9.2 Either party may terminate this Agreement without cause by providing fourteen (14) days written notice to the other party.', { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '9.3 TalkMate may terminate this Agreement immediately and without notice if the Contractor:', { font: helv })
  c = drawBullet(pdfDoc, c, 'Commits a material breach of this Agreement including misrepresentation to clients.', helv)
  c = drawBullet(pdfDoc, c, 'Engages in conduct that is dishonest, fraudulent, or likely to bring TalkMate into disrepute.', helv)
  c = drawBullet(pdfDoc, c, 'Violates any applicable law including the Australian Consumer Law, Privacy Act, or Spam Act.', helv)
  c = drawBullet(pdfDoc, c, 'Discloses confidential information in breach of clause 7.', helv)
  c = drawBullet(pdfDoc, c, 'Solicits TalkMate clients or personnel in breach of clause 8.', helv)
  c = drawBullet(pdfDoc, c, 'Fails to provide a valid ABN after being given 7 days written notice to do so.', helv)
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '9.4 Upon termination:', { font: helv })
  c = drawBullet(pdfDoc, c, "The Contractor's access to all TalkMate systems will be revoked within 24 hours.", helv)
  c = drawBullet(pdfDoc, c, 'Commission will be paid for Qualified Sales completed prior to the termination date, subject to the clawback provisions in clause 4.', helv)
  c = drawBullet(pdfDoc, c, 'No commission will be payable for leads in the pipeline that have not resulted in a Qualified Sale prior to termination.', helv)
  c = drawBullet(pdfDoc, c, 'All confidentiality and non-solicitation obligations survive termination.', helv)

  // Section 10
  c = drawHeading(pdfDoc, c, '10. Liability and Indemnity', { font: helvBold, size: H2_SIZE, topGap: 14 })
  c = drawParagraph(pdfDoc, c, '10.1 The Contractor indemnifies and holds harmless TalkMate, its officers, employees, and agents against any loss, damage, cost, or liability (including legal costs) arising from:', { font: helv })
  c = drawBullet(pdfDoc, c, 'Any misrepresentation, false statement, or unauthorised promise made by the Contractor to a prospect or client.', helv)
  c = drawBullet(pdfDoc, c, 'Any breach by the Contractor of this Agreement, applicable law, or regulatory requirement.', helv)
  c = drawBullet(pdfDoc, c, "Any claim by a client arising from the Contractor's conduct during the sales process.", helv)
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, "10.2 TalkMate's total liability to the Contractor under or in connection with this Agreement is limited to the total commission paid to the Contractor in the three (3) months preceding the event giving rise to the claim.", { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '10.3 Neither party is liable to the other for indirect, consequential, or loss of profits damages.', { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, "10.4 TalkMate's liability under clause 10.1 does not extend to misrepresentations made by the Contractor that fall within the scope of the approved sales script in force at the time of the relevant sale. Where a client complaint arises from content contained in TalkMate's approved script, TalkMate accepts responsibility for that content.", { font: helv })

  // Section 11
  c = drawHeading(pdfDoc, c, '11. Dispute Resolution', { font: helvBold, size: H2_SIZE, topGap: 14 })
  c = drawParagraph(pdfDoc, c, '11.1 If a dispute arises in connection with this Agreement, the party raising the dispute must notify the other party in writing, setting out the nature of the dispute and the outcome sought (Dispute Notice).', { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '11.2 Within 14 days of a Dispute Notice being received, both parties must attempt in good faith to resolve the dispute through direct written negotiation. Most disputes are expected to be resolved at this stage.', { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '11.3 If the dispute is not resolved within 14 days of the Dispute Notice, either party may refer the dispute to the Queensland Civil and Administrative Tribunal (QCAT) for disputes with a value of $25,000 or less, or to a court of competent jurisdiction for disputes exceeding $25,000.', { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '11.4 QCAT proceedings may be initiated by either party without the requirement for mediation or any other pre-litigation step beyond the 14-day negotiation window in clause 11.2.', { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '11.5 This Agreement is governed by the laws of Queensland, Australia. The parties submit to the non-exclusive jurisdiction of the courts and tribunals of Queensland.', { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '11.6 Nothing in this clause prevents either party from seeking urgent injunctive or declaratory relief from a court of competent jurisdiction where necessary to protect confidential information, intellectual property, or other time-sensitive interests.', { font: helv })

  // Section 12
  c = drawHeading(pdfDoc, c, '12. General Provisions', { font: helvBold, size: H2_SIZE, topGap: 14 })
  c = drawParagraph(pdfDoc, c, '12.1 Entire Agreement. This Agreement constitutes the entire agreement between the parties in relation to its subject matter and supersedes all prior representations, negotiations, and understandings.', { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '12.2 Variation. This Agreement may only be varied by written agreement signed by both parties, except that TalkMate may vary the commission structure on thirty (30) days written notice under clause 3.7.', { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '12.3 Waiver. A failure or delay by either party to exercise a right under this Agreement does not operate as a waiver of that right.', { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '12.4 Severability. If any provision of this Agreement is found to be invalid or unenforceable, the remaining provisions continue in full force and effect.', { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '12.5 Notices. Notices under this Agreement may be given by email to the email addresses provided by each party at the time of engagement. A notice sent by email is taken to be received at the time of transmission unless the sender receives a delivery failure notification.', { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '12.6 Electronic Execution. The parties agree that this Agreement will be executed electronically via the TalkMate Sales Portal using a compliant electronic signature mechanism. An electronic signature applied through the TalkMate portal has the same legal effect as a handwritten signature under the Electronic Transactions Act 2001 (Qld). A PDF copy of the executed agreement will be automatically emailed to the Contractor\'s nominated email address upon execution.', { font: helv })
  c = gap(c, 4)
  c = drawParagraph(pdfDoc, c, '12.7 Counterparts. This Agreement may be executed in counterparts, each of which is an original and all of which together constitute one instrument.', { font: helv })

  // Schedule 1 — Contractor Details (filled in)
  c = drawHeading(pdfDoc, c, 'Schedule 1: Contractor Details', { font: helvBold, size: H2_SIZE, topGap: 18 })
  c = drawParagraph(pdfDoc, c, 'The following fields are populated from the Contractor\'s TalkMate Sales Portal profile at the time of agreement generation and electronic execution.', { font: helvItalic, color: COLOR_DARK_GREY })
  c = gap(c, 6)
  const detailRows: Array<[string, string]> = [
    ['First Name', f.contractor_first_name],
    ['Last Name', f.contractor_last_name],
    ['Email Address', f.contractor_email],
    ['Phone Number', f.contractor_phone || '—'],
    ['ABN', f.contractor_abn],
    ['Bank BSB', f.contractor_bsb || 'To be provided'],
    ['Bank Account Number', f.contractor_account_number || 'To be provided'],
    ['Agreement Date', f.agreement_date],
  ]
  for (const [label, value] of detailRows) {
    c = ensureSpace(pdfDoc, c, BODY_LEADING)
    c.page.drawText(label, { x: MARGIN_X, y: c.y, size: BODY_SIZE, font: helvBold, color: COLOR_BLACK })
    c.page.drawText(value, { x: MARGIN_X + 180, y: c.y, size: BODY_SIZE, font: helv, color: COLOR_BLACK })
    c = { page: c.page, y: c.y - BODY_LEADING }
  }

  // Schedule 2 — Script Acknowledgement
  c = drawHeading(pdfDoc, c, 'Schedule 2: Approved Script Acknowledgement', { font: helvBold, size: H2_SIZE, topGap: 18 })
  c = drawParagraph(pdfDoc, c, 'The Contractor must sign this acknowledgement at commencement and upon each material update to the approved TalkMate sales script. A digital acknowledgement via the TalkMate portal satisfies this requirement.', { font: helvItalic, color: COLOR_DARK_GREY })
  c = gap(c, 6)
  c = drawParagraph(pdfDoc, c, `I, ${fullName}, confirm that I have read and understood the current version of the TalkMate approved sales script (Version: ${f.script_version}, dated ${f.script_date}). I understand that I am only authorised to make representations to prospects that are contained within this script. I understand that representations made beyond the scope of this script may result in clawback of commission and termination of my engagement.`, { font: helv })
}

// ──────────────────────────────────────────────────────────────────────
// Signature page — always appended, with captured signature image
// ──────────────────────────────────────────────────────────────────────

async function renderSignaturePage(
  pdfDoc: PDFDocument,
  helv: PDFFont,
  helvBold: PDFFont,
  f: ContractorAgreementFields,
  usedTemplate: boolean,
) {
  const sigPage = newPage(pdfDoc)
  const fullName = `${f.contractor_first_name} ${f.contractor_last_name}`.trim()
  let sy = MARGIN_TOP

  const sdraw = (text: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    const size = opts.size ?? 11
    const font = opts.bold ? helvBold : helv
    sigPage.drawText(text, { x: MARGIN_X, y: sy, size, font, color: opts.color ?? COLOR_BLACK })
    sy -= size + 6
  }

  sdraw('Execution', { size: H1_SIZE, bold: true })
  sy -= 4
  sdraw('By signing below, the parties confirm they have read, understood, and agree to be bound by all', { color: COLOR_DARK_GREY })
  sdraw('terms of this Agreement including the commission structure in Schedule 1, the clawback provisions', { color: COLOR_DARK_GREY })
  sdraw('in clause 4, the call recording consent in clause 2.4, and the non-solicitation obligations in clause 8.', { color: COLOR_DARK_GREY })
  sy -= 14

  // Principal signature block
  sdraw('Signed for and on behalf of TalkMate:', { bold: true, size: H3_SIZE })
  sdraw('Name: Irfan Hanif')
  sdraw('Title: Authorised Signatory / TalkMate')
  sdraw(`Date: ${f.agreement_date}`)
  sy -= 18

  // Contractor signature block
  sdraw('Signed by the Contractor:', { bold: true, size: H3_SIZE })
  sdraw(`${fullName}`)

  // Signature box
  const boxY = sy - 70
  const boxX = MARGIN_X
  const boxW = 260
  const boxH = 68
  sigPage.drawRectangle({
    x: boxX, y: boxY, width: boxW, height: boxH,
    borderColor: COLOR_GREY, borderWidth: 0.5,
    color: rgb(1, 1, 1),
  })

  // Embed the captured signature image inside the box, if provided.
  if (f.signature_data_url && f.signature_data_url.startsWith('data:image/png;base64,')) {
    try {
      const base64 = f.signature_data_url.replace(/^data:image\/png;base64,/, '')
      const imgBytes = Buffer.from(base64, 'base64')
      const sigImage = await pdfDoc.embedPng(imgBytes)
      const maxW = boxW - 20
      const maxH = boxH - 12
      const ratio = Math.min(maxW / sigImage.width, maxH / sigImage.height)
      const drawW = sigImage.width * ratio
      const drawH = sigImage.height * ratio
      sigPage.drawImage(sigImage, {
        x: boxX + (boxW - drawW) / 2,
        y: boxY + (boxH - drawH) / 2,
        width: drawW,
        height: drawH,
      })
    } catch {
      // If embed fails (corrupt PNG, etc.) the box stays empty — the
      // textual audit record below still captures the signing event.
    }
  }

  // Caption directly under the signature box.
  const captionY = boxY - 14
  sigPage.drawText(fullName, { x: boxX, y: captionY, size: 10, font: helvBold, color: COLOR_BLACK })
  sigPage.drawText(`Date: ${f.agreement_date}`, { x: boxX, y: captionY - 14, size: 10, font: helv, color: COLOR_BLACK })
  const methodLabel = f.signature_method === 'typed' ? 'typed' : 'drawn'
  sigPage.drawText(`Signed electronically via TalkMate Sales Portal (${methodLabel}).`, {
    x: boxX, y: captionY - 28, size: 8, font: helv, color: COLOR_GREY,
  })
  sigPage.drawText('Electronic signature has the same legal effect as a handwritten signature under the', {
    x: boxX, y: captionY - 40, size: 8, font: helv, color: COLOR_GREY,
  })
  sigPage.drawText('Electronic Transactions Act 2001 (Qld).', {
    x: boxX, y: captionY - 50, size: 8, font: helv, color: COLOR_GREY,
  })

  // Audit footer
  sigPage.drawText(`Signed from IP: ${f.signed_ip}`, {
    x: MARGIN_X, y: 50, size: 9, font: helv, color: COLOR_GREY,
  })
  sigPage.drawText(`Signed at: ${f.signed_at_iso}`, {
    x: MARGIN_X, y: 36, size: 9, font: helv, color: COLOR_GREY,
  })
  sigPage.drawText(usedTemplate ? 'Body: uploaded template' : 'Body: full v2.0 programmatic copy', {
    x: PAGE_W - MARGIN_X - 220, y: 50, size: 9, font: helv, color: COLOR_GREY,
  })
  sigPage.drawText('TalkMate Sales Portal | talkmate.com.au', {
    x: PAGE_W - MARGIN_X - 220, y: 36, size: 9, font: helv, color: COLOR_GREY,
  })
}
