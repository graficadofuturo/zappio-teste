import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
async function run() {
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info_test');
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`Using wa version v${version.join('.')}, isLatest: ${isLatest}`);
  const sock = makeWASocket({ auth: state, version, printQRInTerminal: true });
  sock.ev.on('connection.update', (update) => {
    console.log('Update:', update);
  });
}
run().catch(console.error);
