'use server';

import { revalidatePath } from 'next/cache';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { requireAdminPermission, requireSuperAdmin } from '@/lib/auth/adminGuard';
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
  const admin = await requireAdminPermission('companies');
  const companyId = toStr(formData.get('companyId'));
  const rawStatus = toStr(formData.get('status'));
  const status = rawStatus === 'disabled' || rawStatus === 'suspended' ? rawStatus : 'active';
  if (!companyId) return;
  await adminDb.collection('companies').doc(companyId).update({ status, updatedAt: new Date().toISOString() });
  await writeAdminActivity({ uid: admin.session.uid, action: 'company_status_changed', targetType: 'company', targetId: companyId, detail: { status } });
  revalidatePath('/super-admin');
  revalidatePath('/super-admin/companies');
}

export async function updateCompanyPlan(formData: FormData) {
  const admin = await requireAdminPermission('companies');
  const companyId = toStr(formData.get('companyId'));
  const name = toStr(formData.get('planName')) as CompanyPlan['name'];
  const tenderLimit = toLimit(formData.get('tenderLimit'));
  const userLimit = toLimit(formData.get('userLimit'));
  const trialEndsAt = toStr(formData.get('trialEndsAt')) || null;
  if (!companyId || !name) return;
  const ref = adminDb.collection('companies').doc(companyId);
  await ref.update({
    'plan.name': name,
    'plan.tenderLimit': tenderLimit,
    'plan.userLimit': userLimit,
    'plan.trialEndsAt': trialEndsAt,
    'plan.billingStatus': name === 'trial' ? 'trialing' : 'active',
    updatedAt: new Date().toISOString()
  });
  revalidatePath('/super-admin');
  revalidatePath('/super-admin/companies');
}


async function writeAdminActivity(params: { uid: string; action: string; targetType: string; targetId: string; detail?: Record<string, unknown> }) {
  await adminDb.collection('adminActivityLogs').add({ ...params, createdAt: new Date().toISOString() }).catch(() => null);
}

export async function adjustCompanyCredits(formData: FormData) {
  const admin = await requireAdminPermission('companies');
  const companyId = toStr(formData.get('companyId'));
  const raw = Number(toStr(formData.get('amount')) || 0);
  const mode = toStr(formData.get('mode')) || 'delta';
  if (!companyId || !Number.isFinite(raw)) return;
  const ref = adminDb.collection('companies').doc(companyId);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const before = Number((snap.data() as any)?.plan?.analysisCreditsRemaining ?? (snap.data() as any)?.plan?.analysisCredits ?? 0);
    const after = Math.max(0, mode === 'set' ? raw : before + raw);
    tx.update(ref, {
      'plan.analysisCreditsRemaining': after,
      'plan.analysisCredits': after,
      updatedAt: new Date().toISOString()
    });
    const movement = ref.collection('creditMovements').doc();
    tx.set(movement, {
      operation: mode === 'set' ? 'admin_set' : 'admin_adjustment', amount: after - before,
      balanceBefore: before, balanceAfter: after, adminUid: admin.session.uid,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
  });
  await writeAdminActivity({ uid: admin.session.uid, action: 'company_credit_adjusted', targetType: 'company', targetId: companyId, detail: { amount: raw, mode } });
  revalidatePath('/super-admin/companies');
}

export async function deletePackage(formData: FormData) {
  const admin = await requireAdminPermission('packages');
  const id = toStr(formData.get('id'));
  if (!id || ['free','trial','starter','pro','enterprise'].includes(id)) return;
  const assigned = await adminDb.collection('companies').where('plan.name', '==', id).limit(1).get().catch(() => null);
  if (assigned && !assigned.empty) return;
  await adminDb.collection('packages').doc(id).delete();
  await writeAdminActivity({ uid: admin.session.uid, action: 'package_deleted', targetType: 'package', targetId: id });
  revalidatePath('/super-admin/packages');
}

export async function updateUserStatus(formData: FormData) {
  await requireAdminPermission('users');
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
  await requireAdminPermission('packages');
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
  await requireAdminPermission('packages');
  const id = toStr(formData.get('id'));
  const status = toStr(formData.get('status')) === 'disabled' ? 'disabled' : 'active';
  if (!id) return;
  await adminDb.collection('packages').doc(id).set({ status, updatedAt: new Date().toISOString() }, { merge: true });
  revalidatePath('/super-admin/packages');
}

export async function trashTender(formData: FormData) {
  const admin = await requireAdminPermission('tenders');
  const companyId = toStr(formData.get('companyId'));
  const tenderId = toStr(formData.get('tenderId'));
  if (!companyId || !tenderId) return;

  const ref = adminDb.collection('companies').doc(companyId).collection('tenders').doc(tenderId);
  const snap = await ref.get();
  if (!snap.exists) return;

  await ref.set({
    deletedAt: new Date().toISOString(),
    deletedBy: admin.session.uid,
    statusBeforeDelete: snap.data()?.status || 'draft',
    updatedAt: new Date().toISOString()
  }, { merge: true });

  revalidatePath('/super-admin/tenders');
  revalidatePath('/tenders');
}

export async function restoreTender(formData: FormData) {
  await requireAdminPermission('tenders');
  const companyId = toStr(formData.get('companyId'));
  const tenderId = toStr(formData.get('tenderId'));
  if (!companyId || !tenderId) return;

  const ref = adminDb.collection('companies').doc(companyId).collection('tenders').doc(tenderId);
  const snap = await ref.get();
  if (!snap.exists) return;

  const previousStatus = snap.data()?.statusBeforeDelete || 'draft';
  await ref.update({
    deletedAt: null,
    deletedBy: null,
    statusBeforeDelete: null,
    status: previousStatus,
    updatedAt: new Date().toISOString()
  });

  revalidatePath('/super-admin/tenders');
  revalidatePath('/tenders');
}

export async function permanentlyDeleteTender(formData: FormData) {
  await requireAdminPermission('tenders');
  const companyId = toStr(formData.get('companyId'));
  const tenderId = toStr(formData.get('tenderId'));
  if (!companyId || !tenderId) return;

  const ref = adminDb.collection('companies').doc(companyId).collection('tenders').doc(tenderId);
  const snap = await ref.get();
  if (!snap.exists || !snap.data()?.deletedAt) return;

  // Önce Storage dosyalarını temizle. Bucket aktif değilse Firestore temizliği devam eder.
  const { adminStorage } = await import('@/lib/firebase/admin');
  if (adminStorage) {
    await adminStorage.bucket().deleteFiles({
      prefix: `companies/${companyId}/tenders/${tenderId}/`
    }).catch((error) => console.error('İhale Storage temizliği başarısız:', error));
  }

  // recursiveDelete tüm alt koleksiyonları (documents, analysis, runs, items, activities) temizler.
  await adminDb.recursiveDelete(ref);

  revalidatePath('/super-admin/tenders');
  revalidatePath('/tenders');
}


export async function upsertAdminTeamMember(formData: FormData) {
  await requireAdminPermission('team');
  const email = toStr(formData.get('email')).toLowerCase();
  const displayName = toStr(formData.get('displayName')) || email.split('@')[0];
  const adminRole = toStr(formData.get('adminRole')) || 'platform_admin';
  const tempPassword = toStr(formData.get('tempPassword'));
  if (!email) return;
  let authUser;
  try { authUser = await adminAuth.getUserByEmail(email); }
  catch { authUser = await adminAuth.createUser({ email, displayName, password: tempPassword || Math.random().toString(36).slice(-10) + 'A1!' }); }
  await adminAuth.updateUser(authUser.uid, { disabled: false, displayName });
  await adminAuth.setCustomUserClaims(authUser.uid, { companyId: null, role: 'admin_team', adminRole });
  const now = new Date().toISOString();
  await adminDb.collection('users').doc(authUser.uid).set({ uid: authUser.uid, email, displayName, companyId: null, role: 'admin_team', adminRole, status: 'active', createdAt: now, updatedAt: now }, { merge: true });
  revalidatePath('/super-admin/team');
}

export async function updateAdminTeamMember(formData: FormData) {
  const current = await requireAdminPermission('team');
  const uid = toStr(formData.get('uid'));
  const action = toStr(formData.get('action'));
  const adminRole = toStr(formData.get('adminRole'));
  if (!uid || uid === current.session.uid) return;
  const ref = adminDb.collection('users').doc(uid);
  const snap = await ref.get(); if (!snap.exists) return;
  if (action === 'remove') {
    await adminAuth.setCustomUserClaims(uid, { companyId: null, role: null });
    await ref.set({ role: null, adminRole: null, status: 'disabled', updatedAt: new Date().toISOString() }, { merge: true });
    await adminAuth.updateUser(uid, { disabled: true });
  } else if (action === 'toggle') {
    const disabled = (snap.data() as any).status !== 'disabled';
    await ref.set({ status: disabled ? 'disabled' : 'active', updatedAt: new Date().toISOString() }, { merge: true });
    await adminAuth.updateUser(uid, { disabled });
  } else if (adminRole) {
    await ref.set({ role: 'admin_team', adminRole, updatedAt: new Date().toISOString() }, { merge: true });
    await adminAuth.setCustomUserClaims(uid, { companyId: null, role: 'admin_team', adminRole });
  }
  revalidatePath('/super-admin/team');
}
