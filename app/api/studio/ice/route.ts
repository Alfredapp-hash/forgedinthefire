import { NextResponse } from 'next/server'
import { studioIceFromEnv } from '@/lib/podcast/ice'

export const dynamic = 'force-dynamic'

/** Guest booth + admin peer both need ICE. TURN creds are used by the browser; they are not baked into the JS bundle. */
export async function GET() {
  return NextResponse.json(studioIceFromEnv())
}
