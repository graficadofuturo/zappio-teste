import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

let cachedDb: any = null;

export function getFirebaseAdminApp() {
  if ((getApps() || []).length > 0) {
    return getApp();
  }

  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!rawServiceAccount) {
    console.warn("[FirebaseAdmin] FIREBASE_SERVICE_ACCOUNT_KEY is not set. Initializing using default credentials (ADC)...");
    try {
      let projectId;
      try {
        const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
          projectId = config.projectId;
        }
      } catch (err: any) {
        console.warn("[FirebaseAdmin] Failed to read projectId from config file:", err.message);
      }
      
      return initializeApp({
        projectId: projectId || process.env.GOOGLE_CLOUD_PROJECT || undefined
      });
    } catch (e: any) {
      console.error("[FirebaseAdmin] Failed to initialize with default credentials:", e.message);
      throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY não configurada e falha ao inicializar com credenciais padrão: " + e.message);
    }
  }

  let serviceAccount;

  try {
    serviceAccount = JSON.parse(rawServiceAccount);
  } catch (error) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY não é um JSON válido");
  }

  if (!serviceAccount.project_id) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY sem project_id");
  }

  if (!serviceAccount.client_email) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY sem client_email");
  }

  if (!serviceAccount.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY sem private_key");
  }

  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

export function getAdminDb() {
  if (cachedDb) return cachedDb;

  const app = getFirebaseAdminApp();

  const databaseId = process.env.FIRESTORE_DATABASE_ID;

  if (
    databaseId &&
    databaseId !== "default" &&
    databaseId !== "Default" &&
    databaseId !== "(default)"
  ) {
    cachedDb = getFirestore(app, databaseId);
  } else {
    cachedDb = getFirestore(app);
  }

  return cachedDb;
}

export function getAdminFirestore() {
  return getAdminDb();
}

export function removeUndefinedDeep(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedDeep).filter((v) => v !== undefined);
  }
  if (obj !== null && typeof obj === 'object') {
    const res: any = {};
    for (const key of Object.keys(obj)) {
      const val = removeUndefinedDeep(obj[key]);
      if (val !== undefined) {
        res[key] = val;
      }
    }
    return res;
  }
  return obj;
}
