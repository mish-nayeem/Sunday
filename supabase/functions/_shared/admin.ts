// SUNDAY's admin check for edge functions: the caller's own token must belong
// to a user whose profiles.role is 'admin' (the same rule as public.is_admin()
// and the admin panel). The anon key alone is a valid JWT, so a token merely
// existing proves nothing.
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
}

export async function isAdminRequest(req: Request, client: SupabaseClient = serviceClient()): Promise<boolean> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return false
  const { data } = await client.auth.getUser(token)
  const id = data?.user?.id
  if (!id) return false
  const { data: profile } = await client.from('profiles').select('role').eq('id', id).maybeSingle()
  return profile?.role === 'admin'
}

// SUNDAY's order row in the shape these functions were written for (PAUSE's
// orders + order_items): lines come out of orders.items.
export function toPauseOrder(o: Record<string, any>) {
  const items = Array.isArray(o.items) ? o.items : []
  return {
    ...o,
    id: o.order_id,
    customer_name: o.full_name,
    customer_phone: o.mobile,
    customer_email: o.email,
    customer_address: [o.address, o.area].filter(Boolean).join(', '),
    customer_area: o.district,
    customer_note: o.notes,
    delivery_fee: o.delivery_charge,
    advance_amount: o.payment_method === 'bkash_advance' ? Number(o.delivery_charge) || 0 : 0,
    advance_trx_id: o.bkash_transaction_id,
    order_items: items.map((it: Record<string, any>) => ({
      product_id: it.product_id ?? it.productId,
      product_name: it.name ?? it.product_name,
      size: it.size,
      qty: Number(it.quantity ?? it.qty) || 0,
      price: Number(it.price) || 0,
    })),
  }
}
