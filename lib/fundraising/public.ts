import type { FundraisingGift } from '@/lib/fundraising/types'

export function publicGift(g: Pick<FundraisingGift, 'id' | 'amount_cents' | 'is_anonymous' | 'donor_display_name' | 'message' | 'honor_of' | 'memory_of' | 'is_recurring' | 'received_at' | 'fundraiser_id'>) {
  return {
    id: g.id,
    amount_cents: g.amount_cents,
    is_anonymous: g.is_anonymous,
    donor_display_name: g.is_anonymous ? null : g.donor_display_name,
    message: g.message,
    honor_of: g.honor_of,
    memory_of: g.memory_of,
    is_recurring: g.is_recurring,
    received_at: g.received_at,
    fundraiser_id: g.fundraiser_id,
  }
}
