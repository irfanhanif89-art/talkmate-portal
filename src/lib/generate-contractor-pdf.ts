import { promises as fs } from 'fs'
import path from 'path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
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

// Server-side PDF generation. If the template file exists at
// /public/templates/contractor-agreement-template.pdf, the template is
// loaded and a signature page is appended. Otherwise a self-contained
// fallback PDF is generated so the signing flow does not fail when the
// template has not yet been uploaded (see DEPLOYMENT.md).
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
  const black = rgb(0.04, 0.07, 0.14)
  const grey = rgb(0.4, 0.43, 0.5)

  if (!usedTemplate) {
    // Build a minimal but legible self-contained agreement so the
    // signed PDF is meaningful even without the template upload.
    const page = pdfDoc.addPage([595.28, 841.89])
    const { width } = page.getSize()
    let y = 800

    const draw = (text: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
      const size = opts.size ?? 11
      const font = opts.bold ? helvBold : helv
      page.drawText(text, { x: 50, y, size, font, color: opts.color ?? black })
      y -= size + 6
    }

    draw('TalkMate Sales Contractor Agreement', { size: 18, bold: true })
    draw('Version 2.0', { size: 11, color: grey })
    y -= 10
    draw(`Agreement Date: ${fields.agreement_date}`, { bold: true })
    y -= 4
    draw('Parties', { size: 13, bold: true })
    draw(`Contractor: ${fields.contractor_first_name} ${fields.contractor_last_name}`)
    draw(`Email: ${fields.contractor_email}`)
    draw(`Phone: ${fields.contractor_phone}`)
    draw(`ABN: ${fields.contractor_abn}`)
    draw(`Bank BSB: ${fields.contractor_bsb}`)
    draw(`Bank Account: ${fields.contractor_account_number}`)
    y -= 6
    draw('Approved Sales Script', { size: 13, bold: true })
    draw(`Version: ${fields.script_version} (dated ${fields.script_date})`)
    y -= 6
    draw('Summary of Terms', { size: 13, bold: true })
    const terms = [
      'The Contractor is engaged on a non-exclusive basis to introduce',
      'TalkMate to prospective clients. Commission is paid only on cleared',
      'sales after the 14 day clawback period. The Contractor must only',
      'make representations contained in the current approved sales script.',
      'Where no valid ABN is provided, 47 percent withholding applies to',
      'commission payments as required by Australian law.',
      'This agreement is governed by the laws of Queensland, Australia.',
    ]
    for (const line of terms) draw(line)

    y -= 6
    draw('Commission Schedule', { size: 13, bold: true })
    draw('Starter Monthly: $299       Starter Annual: $373.75')
    draw('Growth Monthly:  $349       Growth Annual:  $473.75')
    draw('Pro Monthly:     $399       Pro Annual:     $598.75')

    // Footer
    page.drawText('TalkMate Sales Portal', {
      x: 50, y: 40, size: 9, font: helv, color: grey,
    })
    page.drawText(`Generated ${fields.signed_at_iso}`, {
      x: width - 220, y: 40, size: 9, font: helv, color: grey,
    })
  }

  // Always append a signature page so the executed copy is identifiable.
  const sigPage = pdfDoc.addPage([595.28, 841.89])
  const { width: sw } = sigPage.getSize()
  let sy = 780

  const sdraw = (text: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    const size = opts.size ?? 11
    const font = opts.bold ? helvBold : helv
    sigPage.drawText(text, { x: 50, y: sy, size, font, color: opts.color ?? black })
    sy -= size + 6
  }

  sdraw('Electronic Signature', { size: 18, bold: true })
  sy -= 6
  sdraw(`Electronically signed by ${fields.contractor_first_name} ${fields.contractor_last_name}`)
  sdraw(`on ${fields.agreement_date} at ${new Date(fields.signed_at_iso).toLocaleTimeString('en-AU', { timeZone: 'Australia/Brisbane' })} AEST`)
  sy -= 12

  // Embed the captured signature image, if provided. Sized to 200x60
  // (aspect locked to the source canvas, capped to that box).
  if (fields.signature_data_url && fields.signature_data_url.startsWith('data:image/png;base64,')) {
    try {
      const base64 = fields.signature_data_url.replace(/^data:image\/png;base64,/, '')
      const imgBytes = Buffer.from(base64, 'base64')
      const sigImage = await pdfDoc.embedPng(imgBytes)
      const maxW = 200
      const maxH = 60
      const ratio = Math.min(maxW / sigImage.width, maxH / sigImage.height)
      const drawW = sigImage.width * ratio
      const drawH = sigImage.height * ratio
      const boxX = 50
      const boxY = sy - drawH
      sigPage.drawImage(sigImage, { x: boxX, y: boxY, width: drawW, height: drawH })
      // Caption underneath the signature image
      const captionY = boxY - 14
      sigPage.drawText(`${fields.contractor_first_name} ${fields.contractor_last_name}`, {
        x: boxX, y: captionY, size: 10, font: helvBold, color: black,
      })
      sigPage.drawText(fields.agreement_date, {
        x: boxX, y: captionY - 14, size: 10, font: helv, color: black,
      })
      const methodLabel = fields.signature_method === 'typed' ? 'typed' : 'drawn'
      sigPage.drawText(`Signed electronically via TalkMate Sales Portal (${methodLabel})`, {
        x: boxX, y: captionY - 28, size: 8, font: helv, color: grey,
      })
      sy = captionY - 44
    } catch {
      // If embed fails (corrupt PNG, etc.) we still produce the PDF —
      // the textual acknowledgement below is sufficient for audit.
      sdraw('(Signature image could not be embedded; textual record below applies.)', { size: 9, color: grey })
    }
  }

  sdraw('By signing electronically the Contractor confirms:', { bold: true })
  sdraw('  - They have read and agree to be bound by this agreement.')
  sdraw('  - They acknowledge the current approved TalkMate sales script.')
  sdraw('  - The electronic signature has the same legal effect as a')
  sdraw('    handwritten signature under the Electronic Transactions')
  sdraw('    Act 2001 (Qld).')

  sy -= 10
  sdraw(`Contractor: ${fields.contractor_first_name} ${fields.contractor_last_name}`, { bold: true })
  sdraw(`Email:      ${fields.contractor_email}`)
  sdraw(`Phone:      ${fields.contractor_phone}`)
  sdraw(`ABN:        ${fields.contractor_abn}`)
  sdraw(`Script Ack: Version ${fields.script_version} dated ${fields.script_date}`)

  // Footer with IP
  sigPage.drawText(`Signed from IP: ${fields.signed_ip}  TalkMate Sales Portal`, {
    x: 50, y: 50, size: 9, font: helv, color: grey,
  })
  sigPage.drawText(`Signed at: ${fields.signed_at_iso}`, {
    x: 50, y: 36, size: 9, font: helv, color: grey,
  })
  sigPage.drawText('Page bound to template:', {
    x: sw - 240, y: 50, size: 9, font: helv, color: grey,
  })
  sigPage.drawText(usedTemplate ? 'TalkMate v2 template' : 'fallback inline copy', {
    x: sw - 240, y: 36, size: 9, font: helv, color: grey,
  })

  const bytes = await pdfDoc.save()
  return { pdf: bytes, usedTemplate }
}

export function formatAgreementDate(d: Date): string {
  return d.toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane',
  })
}
