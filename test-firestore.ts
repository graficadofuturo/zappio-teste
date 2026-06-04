import "dotenv/config";
import { getAdminFirestore, removeUndefinedDeep } from "./src/api/firebaseAdmin.js";

async function run() {
  try {
    const db = getAdminFirestore();
    const docRef = db.doc("test/connection");
    
    let data: any = {
      marketplace: "mercadolivre",
      provider: "mercadolivre",
      connected: true,
      accessToken: "mock_token",
      refreshToken: null,
      tokenType: "bearer",
      expiresIn: null,
      expiresAt: null,
      mlUserId: String(undefined),
      nickname: null,
      email: null,
      firstName: null,
      lastName: null,
      scope: null,
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await docRef.set(data);
    console.log("Write OK raw");
    
    const snap = await docRef.get();
    console.log("Read OK", snap.data());
  } catch(e) {
    console.error("Error", e);
  }
}
run();
