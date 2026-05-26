import { generateContractorAgreementPdf, formatAgreementDate } from '../src/lib/generate-contractor-pdf.ts'
import { writeFileSync } from 'fs'
import path from 'path'
import { PDFDocument } from 'pdf-lib'

const outPath = path.join(process.env.USERPROFILE || 'C:/Users/info', 'Downloads', 'test-contract-out.pdf')

const result = await generateContractorAgreementPdf({
  contractor_first_name: 'Jordan',
  contractor_last_name: 'Smith',
  agreement_date: formatAgreementDate(new Date()),
  contractor_email: 'jordan@example.com',
  contractor_phone: '0412 345 678',
  contractor_abn: '83914571673',
  contractor_bsb: '062-000',
  contractor_account_number: '12345678',
  script_version: 'v3',
  script_date: '2026-05-20',
  signed_ip: '203.0.113.42',
  signed_at_iso: new Date().toISOString(),
  signature_method: 'drawn',
})

writeFileSync(outPath, result.pdf)
const doc = await PDFDocument.load(result.pdf)
console.log('PAGES:', doc.getPageCount())
console.log('SIZE_KB:', Math.round(result.pdf.length / 102.4) / 10)
console.log('USED_TEMPLATE:', result.usedTemplate)
console.log('OUT:', outPath)
