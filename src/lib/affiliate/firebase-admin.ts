import { getAdminDb } from '../../api/firebaseAdmin.js';
import { getAuth } from 'firebase-admin/auth';

let adminDb: any = null;
let auth: any = null;

try {
  adminDb = getAdminDb();
  auth = getAuth();
} catch (e: any) {
  console.error('[Firebase Admin Affiliate] Initialization failed:', e.message);
}

export { adminDb, auth };
