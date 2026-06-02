import { getFirestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';

function test() {
    const databaseId = "my-db";
    const db = getFirestore(undefined, databaseId);
    db.settings({ databaseId });
}
