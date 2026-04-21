import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  // Placeholder — real OCR/AI parsing to be added
  // In production: parse the file, extract items using AI, return structured data
  try {
    await request.formData() // consume the body
  } catch {
    // ignore parse errors for now
  }
  return NextResponse.json({
    success: true,
    items: [
      { name: 'Item 1', category: 'Services', price: '', description: 'Auto-detected from upload' },
      { name: 'Item 2', category: 'Services', price: '', description: 'Auto-detected from upload' },
      { name: 'Item 3', category: 'Services', price: '', description: 'Auto-detected from upload' },
    ]
  })
}
