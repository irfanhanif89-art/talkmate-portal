// HTML -> A4 PDF bytes. Uses @sparticuz/chromium on serverless (Vercel) and a
// local Chrome when running on a dev machine. Keep this the ONLY place that
// knows about the browser engine so it can be swapped if Vercel limits bite.
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

export async function renderHtmlToPdf(html: string): Promise<Uint8Array> {
  const isServerless = !!process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL === '1'
  const browser = await puppeteer.launch(
    isServerless
      ? {
          args: chromium.args,
          executablePath: await chromium.executablePath(),
          headless: true,
        }
      : {
          channel: 'chrome',
          headless: true,
        },
  )
  try {
    const page = await browser.newPage()
    // puppeteer-core's setContent type excludes 'networkidle0' (valid only on
    // goto/navigation). Use 'load', which fires once inline HTML + its resources
    // are loaded — sufficient for our self-contained templates.
    await page.setContent(html, { waitUntil: 'load' })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    return pdf
  } finally {
    await browser.close()
  }
}
