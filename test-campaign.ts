import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, deleteDoc, doc } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf8"));
const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app, config.firestoreDatabaseId);

async function test() {
  await signInWithEmailAndPassword(auth, "graficadfuturo@gmail.com", "password123").catch(e => {
    console.log("Login fail", e.message);
  });
  if (!auth.currentUser) {
    console.log("No user");
    return;
  }
  const user = auth.currentUser;
  try {
    const docRef = await addDoc(collection(db, "campaigns"), {
      user_id: user.uid,
      name: "Test campaign Name",
      instance_id: "test",
      target_group_id: "testGroup",
      message: "hello there",
      image_url: "",
      status: "draft",
      created_at: serverTimestamp(),
      updated_at: serverTimestamp()
    });
    console.log("SUCCESS CREATE", docRef.id);
    await deleteDoc(doc(db, "campaigns", docRef.id));
  } catch(e: any) {
    console.error("FAIL CREATE", e.message);
  }
}
test();
