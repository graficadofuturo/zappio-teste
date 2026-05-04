import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

let cachedDb = null;

export function getAdminDb() {
  if (cachedDb) return cachedDb;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!raw) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_KEY");
  }

  let serviceAccount;

  try {
    serviceAccount = JSON.parse(raw);
  } catch (error) {
    throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_KEY JSON");
  }

  if (!serviceAccount.project_id) {
    throw new Error("Service account missing project_id");
  }

  if (!serviceAccount.client_email) {
    throw new Error("Service account missing client_email");
  }

  if (!serviceAccount.private_key) {
    throw new Error("Service account missing private_key");
  }

  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
  }

  const databaseId = process.env.FIRESTORE_DATABASE_ID;

  if (
    databaseId &&
    databaseId !== "(default)" &&
    databaseId !== "default" &&
    databaseId !== "Default"
  ) {
    cachedDb = getFirestore(databaseId);
  } else {
    cachedDb = getFirestore();
  }

  return cachedDb;
}
