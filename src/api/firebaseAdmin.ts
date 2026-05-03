import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import fs from 'fs';
import path from 'path';

let app: App | null = null;
let db: Firestore | null = null;

function getDatabaseId(): string {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.firestoreDatabaseId) return config.firestoreDatabaseId;
    }
  } catch (e) {
    console.error("Error reading firebase-applet-config.json for databaseId", e);
  }
  return process.env.FIRESTORE_DATABASE_ID || "(default)";
}

function getProjectId(): string {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.projectId) return config.projectId;
    }
  } catch (e) {
    console.error("Error reading firebase-applet-config.json for projectId", e);
  }
  return "";
}

export function getAdminFirestore(): Firestore {
  if (db) return db;

  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const databaseId = getDatabaseId();

  if (!serviceAccountRaw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY ausente");
  }

  const serviceAccount = JSON.parse(serviceAccountRaw);
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }

  const apps = getApps();
  if (!apps.length) {
    app = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id || getProjectId(),
    });
  } else {
    app = apps[0];
  }

  db = getFirestore(app!, databaseId);
  return db;
}

// Backward compatibility
export async function getAdminDb() {
  return getAdminFirestore();
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
