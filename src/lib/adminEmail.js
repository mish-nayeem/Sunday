// The one address that opens the admin panel. Signing in with it lands on
// /admin; every other address is a customer. The database decides the same
// way (public.is_admin() checks the signed-in email), so changing it means
// changing both — see supabase/migrations/*_otp_login_single_admin.sql.
export const ADMIN_EMAIL = 'sundayclothin@gmail.com';

export function isAdminEmail(email) {
  return String(email || '').trim().toLowerCase() === ADMIN_EMAIL;
}
