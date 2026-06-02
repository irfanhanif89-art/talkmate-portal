import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export const SALES_RESOURCES_BUCKET = 'sales-resources'

export interface StoredResource {
  file_path: string
  file_type: string
  file_name: string
}

// Streams a stored resource (PDF or HTML) back through OUR origin with the
// correct Content-Type so the browser renders it (Supabase Storage forces
// HTML to text/plain, so we cannot serve it directly via a signed URL).
//
// For HTML we add `Content-Security-Policy: sandbox`, which makes the browser
// treat the document as an opaque-origin sandbox: markup + CSS render, but
// scripts can't run and it has no access to the portal's cookies or session.
// PDFs are served inline without the sandbox header so the browser's PDF
// viewer works normally.
export async function streamStoredResource(
  admin: SupabaseClient,
  resource: StoredResource,
): Promise<NextResponse> {
  const { data, error } = await admin.storage
    .from(SALES_RESOURCES_BUCKET)
    .download(resource.file_path)

  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'File not found' }, { status: 404 })
  }

  const buffer = Buffer.from(await data.arrayBuffer())
  const isHtml = resource.file_type === 'text/html'
  const safeName = resource.file_name.replace(/[\r\n"]/g, '_')

  const headers: Record<string, string> = {
    'Content-Type': isHtml ? 'text/html; charset=utf-8' : 'application/pdf',
    'Content-Disposition': `inline; filename="${safeName}"`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  }
  if (isHtml) {
    // Opaque-origin sandbox: render the document but block scripts, forms,
    // popups and same-origin access. Defends against malicious uploaded HTML.
    headers['Content-Security-Policy'] = 'sandbox'
  }

  return new NextResponse(buffer, { status: 200, headers })
}
