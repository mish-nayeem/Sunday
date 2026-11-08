import { supabase } from './supabaseClient.js'
import { isAdminEmail } from '@/lib/adminEmail'

// Admin → Customers → Accounts: everyone who signed in on the site. A
// profile is made for each new sign-in (auth trigger); the admin can read
// them all. "On mailing list" = the email is in newsletter_subscribers.
export async function fetchCustomerAccounts() {
  const [{ data: profiles, error }, { data: subs }] = await Promise.all([
    supabase.from('profiles').select('id,email,created_at').order('created_at', { ascending: false }),
    supabase.from('newsletter_subscribers').select('email'),
  ])
  if (error) {
    console.error('[Admin] profiles failed:', error.message)
    return { accounts: [], error: "Couldn't load accounts." }
  }
  const subscribed = new Set((subs || []).map((s) => String(s.email || '').trim().toLowerCase()))
  const accounts = (profiles || [])
    .filter((p) => p.email && !isAdminEmail(p.email))
    .map((p) => ({
      user_id: p.id,
      email: p.email,
      joined_at: p.created_at,
      subscribed: subscribed.has(p.email.trim().toLowerCase()),
    }))
  return { accounts, error: null }
}
