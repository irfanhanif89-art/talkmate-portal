import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24)
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Check if already a partner
    const { data: existing } = await supabase
      .from('partners')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (existing) return NextResponse.json({ error: 'Already a partner' }, { status: 409 })

    // Get business name to generate slug
    const { data: biz } = await supabase
      .from('businesses')
      .select('name')
      .eq('owner_user_id', user.id)
      .single()

    const baseName = biz?.name || user.email?.split('@')[0] || 'partner'
    let slug = slugify(baseName)

    // Ensure slug is unique
    const { data: slugExists } = await supabase
      .from('partners')
      .select('id')
      .eq('referral_slug', slug)
      .single()

    if (slugExists) {
      slug = slug + Math.floor(Math.random() * 9000 + 1000).toString()
    }

    const referralLink = `https://talkmate.com.au/ref/${slug}`

    const { data: partner, error } = await supabase
      .from('partners')
      .insert({
        user_id: user.id,
        referral_slug: slug,
        referral_link: referralLink,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ partner })
  } catch (err) {
    console.error('Partner register error:', err)
    return NextResponse.json({ error: 'Failed to register partner' }, { status: 500 })
  }
}
