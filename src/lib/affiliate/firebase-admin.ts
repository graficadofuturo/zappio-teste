import { initializeApp, applicationDefault, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';

let firebaseConfig: any = {};
try {
  const cwdPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cwdPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(cwdPath, 'utf8'));
  }
} catch (err: any) {
  console.warn('[Firebase Admin Config] Could not load config:', err.message);
}

let adminDb: any = null;
let auth: any = null;

let credential: any = null;

if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    }
    credential = cert(serviceAccount);
  } catch (e) {
    console.error('[Firebase Admin] Invalid FIREBASE_SERVICE_ACCOUNT_KEY JSON format:', e);
  }
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.VERCEL) {
  try {
    credential = applicationDefault();
  } catch (e: any) {
    console.warn('[Firebase Admin] Could not load application default credentials:', e.message);
  }
}

if (credential) {
  if (!(getApps() || []).length) {
    initializeApp({
      credential,
      projectId: firebaseConfig.projectId || 'zappio-2a8af',
    });
  }

  const dbId = (firebaseConfig as any).firestoreDatabaseId;
  adminDb = getFirestore(getApps()[0], dbId && dbId !== '(default)' ? dbId : undefined);
  auth = getAuth();
} else {
  console.warn('[Firebase Admin] WARNING: Firebase credentials not configured. Firebase Admin features will be disabled until FIREBASE_SERVICE_ACCOUNT_KEY is configured in your .env file.');
}

export { adminDb, auth };
