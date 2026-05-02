import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys';
async function run() {
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info_test');
  const sock = makeWASocket({ auth: state, printQRInTerminal: true });
  sock.ev.on('connection.update', (update) => {
    console.log('Update:', update);
  });
}
run().catch(console.error);
