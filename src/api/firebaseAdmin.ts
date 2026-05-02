import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

let db: FirebaseFirestore.Firestore | null = null;
let initialized = false;

function getDatabaseId(): string {
  try {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.firestoreDatabaseId) return config.firestoreDatabaseId;
    }
  } catch (e) {}
  if (process.env.FIRESTORE_DATABASE_ID) return process.env.FIRESTORE_DATABASE_ID;
  return "(default)";
}

function getProjectId(): string {
  try {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.projectId) return config.projectId;
    }
  } catch (e) {}
  return "";
}

export function initializeFirebaseAdmin() {
  if (db && admin.apps.length > 0) return { db, admin };
  
  if (!initialized && !admin.apps.length) {
    const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (key) {
      try {
        const sa = JSON.parse(key);
        if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, "\n");
        const initOpts: any = { credential: admin.credential.cert(sa) };
        const pid = getProjectId();
        if (pid) initOpts.projectId = pid;
        admin.initializeApp(initOpts);
      } catch(e) {
        console.error("firebase sync initialization failed", e);
      }
    }
    initialized = true;
  }
  
  if (!db && admin.apps.length > 0) {
    const databaseId = getDatabaseId();
    try {
      db = getFirestore(admin.app(), databaseId);
      db.settings({ ignoreUndefinedProperties: true });
    } catch(e) {
      try {
        db = admin.firestore();
        db.settings({ databaseId, ignoreUndefinedProperties: true });
      } catch (err) {}
    }
  }
  
  return { db, admin };
}

export async function getAdminDb() {
  if (db) return db;

  if (!initialized) {
    const hasFirebaseServiceAccountKey = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    
    if (!admin.apps.length) {
      if (!hasFirebaseServiceAccountKey) {
        throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY not set");
      }

      let serviceAccount: any = null;
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string);
      } catch (error: any) {
        throw new Error("Invalid service account JSON");
      }

      try {
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
        }
        const initOpts: any = { credential: admin.credential.cert(serviceAccount) };
        const pid = getProjectId();
        if (pid) initOpts.projectId = pid;
        admin.initializeApp(initOpts);
      } catch (error: any) {
        throw new Error("Failed to initialize Firebase Admin");
      }
    }
    initialized = true;
  }

  const databaseId = getDatabaseId();
  
  try {
    db = getFirestore(admin.app(), databaseId);
  } catch (e) {
    db = admin.firestore();
    try {
      db.settings({ databaseId });
    } catch (err) {}
  }
  
  try {
     db.settings({ ignoreUndefinedProperties: true });
  } catch (e) {}

  return db;
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
