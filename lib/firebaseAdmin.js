import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_SERVICE_ACCOUNT_BASE64 não configurada.");
  }

  try {
    // Check if it's base64 (common pattern in some AI Studio templates) or raw JSON
    if (raw.startsWith('{')) {
      return JSON.parse(raw);
    } else {
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
    }
  } catch (error) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY não é um JSON ou Base64 válido.");
  }
}

export function getAdminDb() {
  const apps = getApps();

  if (!apps.length) {
    try {
      const serviceAccount = getServiceAccount();
      initializeApp({
        credential: cert(serviceAccount)
      });
    } catch (error) {
      console.error("FIREBASE_ADMIN_INIT_ERROR", error);
      throw error;
    }
  }

  const databaseId = process.env.FIRESTORE_DATABASE_ID;

  if (databaseId && databaseId.trim()) {
    return getFirestore(databaseId.trim());
  }

  return getFirestore();
}
