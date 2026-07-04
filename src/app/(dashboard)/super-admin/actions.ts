'use server';

import { revalidatePath } from 'next/cache';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { requireSuperAdmin } from '@/lib/auth/adminGuard';
import type { CompanyPlan } from '@/types';

function toStr(v: FormDataEntryValue | null) {
  return String(v || '').trim();
}

function toLimit(v: FormDataEntryValue | null): number | null {
  const raw = toStr(v);
  if (!raw || raw.toLowerCase() === 'sinirsiz' || raw.toLowerCase() === 'sınırsız') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function updateCompanyStatus(formData: FormData) {
  await requireSuperAdmin();
  const companyId = toStr(formData.get('companyId'));
  const status = toStr(formData.get('status')) === 'disabled' ? 'disabled' : 'active';
  if (!companyId) return;
  await adminDb.collection('companies').doc(companyId).set({ status, updatedAt: new Date().toISOString() }, { merge: true });
  revalidatePath('/super-admin');
  revalidatePath('/super-admin/companies');
}

export async function updateCompanyPlan(formData: FormData) {
  await requireSuperAdmin();
  const companyId = toStr(formData.get('companyId'));
  const name = toStr(formData.get('planName')) as CompanyPlan['name'];
  const tenderLimit = toLimit(formData.get('tenderLimit'));
  const userLimit = toLimit(formData.get('userLimit'));
  if (!companyId || !name) return;
  await adminDb.collection('companies').doc(companyId).set({ plan: { name, tenderLimit, userLimit }, updatedAt: new Date().toISOString() }, { merge: true });
  revalidatePath('/super-admin');
  revalidatePath('/super-admin/companies');
}

export async function updateUserStatus(formData: FormData) {
  await requireSuperAdmin();
  const uid = toStr(formData.get('uid'));
  const status = toStr(formData.get('status')) === 'disabled' ? 'disabled' : 'active';
  if (!uid) return;
  const userRef = adminDb.collection('users').doc(uid);
  const snap = await userRef.get();
  const user = snap.data() as any;
  await userRef.set({ status, updatedAt: new Date().toISOString() }, { merge: true });
  if (user?.companyId) {
    await adminDb.collection('companies').doc(user.companyId).collection('members').doc(uid).set({ status }, { merge: true }).catch(() => null);
  }
  await adminAuth.updateUser(uid, { disabled: status === 'disabled' }).catch(() => null);
  revalidatePath('/super-admin/users');
}

export async function createPackage(formData: FormData) {
  await requireSuperAdmin();
  const name = toStr(formData.get('name')).toLowerCase();
  const label = toStr(formData.get('label')) || name;
  const tenderLimit = toLimit(formData.get('tenderLimit'));
  const userLimit = toLimit(formData.get('userLimit'));
  const monthlyPrice = Number(toStr(formData.get('monthlyPrice')) || 0);
  if (!name) return;
  await adminDb.collection('packages').doc(name).set({
    id: name,
    name,
    label,
    tenderLimit,
    userLimit,
    monthlyPrice: Number.isFinite(monthlyPrice) ? monthlyPrice : 0,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }, { merge: true });
  revalidatePath('/super-admin/packages');
}

export async function updatePackageStatus(formData: FormData) {
  await requireSuperAdmin();
  const id = toStr(formData.get('id'));
  const status = toStr(formData.get('status')) === 'disabled' ? 'disabled' : 'active';
  if (!id) return;
  await adminDb.collection('packages').doc(id).set({ status, updatedAt: new Date().toISOString() }, { merge: true });
  revalidatePath('/super-admin/packages');
}
