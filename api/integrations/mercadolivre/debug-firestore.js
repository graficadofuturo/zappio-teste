import { getAdminDb } from "../../_lib/firebase-admin.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  
  try {
    const db = getAdminDb();
    const testDoc = db.doc("debug/firestore_test");
    
    await testDoc.set({
      testWrite: true,
      timestamp: new Date().toISOString()
    });
    
    const snap = await testDoc.get();

    return res.status(200).json({
      ok: true,
      firestoreWrite: true,
      firestoreRead: snap.exists,
      testDocExists: snap.exists,
      databaseIdUsed: process.env.FIRESTORE_DATABASE_ID || "(default)",
      projectId: process.env.FIREBASE_SERVICE_ACCOUNT_KEY ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY).project_id : "unknown"
    });
  } catch (error) {
    return res.status(500).json({ 
      ok: false, 
      error: error.message,
      stack: error.stack,
      hasFirebaseServiceAccountKey: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
      hasFirestoreDatabaseId: !!process.env.FIRESTORE_DATABASE_ID
    });
  }
}
