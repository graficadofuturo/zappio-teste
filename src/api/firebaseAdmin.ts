import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

let db: FirebaseFirestore.Firestore | null = null;

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

export async function getAdminDb() {
  if (db) return db;

  if (!admin.apps.length) {
    const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!key) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY not set");
    }

    try {
      const sa = JSON.parse(key);
      if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, "\n");
      
      const initOpts: any = { 
        credential: admin.credential.cert(sa) 
      };
      
      const pid = getProjectId();
      if (pid) initOpts.projectId = pid;
      
      admin.initializeApp(initOpts);
    } catch (error: any) {
      console.error("Failed to initialize Firebase Admin:", error);
      throw error;
    }
  }

  const databaseId = getDatabaseId();
  try {
    // If the DB version of firestore is already initialized for this app, 
    // getFirestore will return the same instance.
    const firestore = getFirestore(admin.apps[0], databaseId);
    
    // We only try to set settings if we are sure it's the first time 
    // but Firestore Admin SDK is a bit picky.
    // A safer way is to check if we've already tried to set it.
    try {
      firestore.settings({ ignoreUndefinedProperties: true });
    } catch (settingsError) {
      // Ignore "already initialized" errors
    }
    
    db = firestore;
  } catch (e) {
    console.error("Failed to get Firestore, falling back to default:", e);
    db = admin.firestore();
  }

  return db!;
}

export function initializeFirebaseAdmin() {
  // Synchronous-ish version if needed, but getAdminDb is preferred
  if (db && admin.apps.length > 0) return { db, admin };
  
  if (!admin.apps.length) {
    const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (key) {
      try {
        const sa = JSON.parse(key);
        if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, "\n");
        const initOpts: any = { credential: admin.credential.cert(sa) };
        const pid = getProjectId();
        if (pid) initOpts.projectId = pid;
        admin.initializeApp(initOpts);
      } catch(e) {}
    }
  }
  
  if (!db && admin.apps.length > 0) {
    const databaseId = getDatabaseId();
    try {
      const firestore = getFirestore(admin.apps[0], databaseId);
      try {
        firestore.settings({ ignoreUndefinedProperties: true });
      } catch(e) {}
      db = firestore;
    } catch(e) {
      db = admin.firestore();
    }
  }
  
  return { db: db || admin.firestore(), admin };
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
