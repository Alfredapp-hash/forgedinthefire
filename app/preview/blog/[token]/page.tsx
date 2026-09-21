import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { contentFromDb } from '@/lib/content-db'
import { BlockRenderer } from '@/src/components/blog/BlockRenderer'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Draft preview',
}

function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export default async function BlogPreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = adminDb()
  if (!supabase) notFound()
  const { data } = await supabase.from('content').select('*').eq('preview_token', token).maybeSingle()
  if (!data) notFound()
  const post = contentFromDb(data)

  return (
    <div className="min-h-screen bg-[#05070A] text-[#F6FAFC]">
      <div className="border-b border-[#27313B] bg-[#11161C] px-4 py-3 text-xs text-[#8DEBFF]">
        Unpublished preview · not indexed · do not share beyond staff review
      </div>
      <article className="container mx-auto max-w-3xl px-4 py-12">
        <p className="text-xs uppercase tracking-widest text-[#53D6FF] mb-3">{post.status}</p>
        <h1 className="font-serif text-4xl font-bold mb-6">{post.title}</h1>
        {post.excerpt ? <p className="text-lg text-[#B8C4CF] mb-8">{post.excerpt}</p> : null}
        <div className="space-y-6">
          {post.blocks.map((block, i) => (
            <BlockRenderer key={`${block.type}-${i}`} block={block} />
          ))}
        </div>
      </article>
    </div>
  )
}
