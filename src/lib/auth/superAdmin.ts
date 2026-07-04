export function getSuperAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdminEmail(email?: string | null): boolean {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) return false;
  return getSuperAdminEmails().includes(normalized);
}

export function isSuperAdminProfile(profile?: { email?: string | null; role?: string | null } | null): boolean {
  if (!profile) return false;
  return profile.role === 'super_admin' || isSuperAdminEmail(profile.email);
}
