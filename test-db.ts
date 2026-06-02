import { dbAdmin } from './src/lib/firebaseAdmin.ts';

async function run() {
  try {
    const sn = await dbAdmin.collection('whatsapp_instances').get();
    console.log(sn.size);
    sn.forEach(doc => console.log(doc.id, doc.data()));
  } catch (e) {
    console.error(e);
  }
}
run();
