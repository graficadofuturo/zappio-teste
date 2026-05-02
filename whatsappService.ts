import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import Pino from 'pino';

// A simple in-memory store for our instances state
export const instances = new Map<string, any>();
export const instanceStatus = new Map<string, { 
  status: string, 
  qr?: string,
  groups?: any[],
  contacts?: any[]
}>();

export async function connectWhatsApp(instanceId: string) {
  if (instances.has(instanceId)) {
    return instanceStatus.get(instanceId);
  }

  instanceStatus.set(instanceId, { status: 'initializing', groups: [], contacts: [] });

  const { state, saveCreds } = await useMultiFileAuthState(`baileys_auth_info_${instanceId}`);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  
  const sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
    logger: Pino({ level: 'silent' }) as any
  });

  instances.set(instanceId, sock);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log(`[Instance ${instanceId}] QR Code generated.`);
      const current = instanceStatus.get(instanceId) || { status: 'initializing' };
      instanceStatus.set(instanceId, { ...current, status: 'qrcode', qr });
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(`[Instance ${instanceId}] Connection closed, reconnecting:`, shouldReconnect);
      
      instances.delete(instanceId);
      
      if (shouldReconnect) {
        connectWhatsApp(instanceId); // Auto reconnect
      } else {
        const current = instanceStatus.get(instanceId) || { status: 'initializing' };
        instanceStatus.set(instanceId, { ...current, status: 'disconnected' });
      }
    } else if (connection === 'open') {
      console.log(`[Instance ${instanceId}] Connected!`);
      const current = instanceStatus.get(instanceId) || { status: 'initializing' };
      instanceStatus.set(instanceId, { ...current, status: 'connected' });
      
      try {
        const groups = await sock.groupFetchAllParticipating();
        const cur = instanceStatus.get(instanceId);
        if (cur) {
          cur.groups = Object.values(groups);
          console.log(`[Instance ${instanceId}] Fetched ${cur.groups.length} groups.`);
        }
      } catch (e) {
        console.error(`[Instance ${instanceId}] Error fetching groups:`, e);
      }
    }
  });

  sock.ev.on('contacts.upsert', async (contacts) => {
    console.log(`[Instance ${instanceId}] Received ${contacts.length} contacts.`);
    const cur = instanceStatus.get(instanceId);
    if (cur) {
       if (!cur.contacts) cur.contacts = [];
       for (const c of contacts) {
          if (!c.id || c.id.endsWith('@g.us')) continue;
          cur.contacts.push(c);
       }
    }
  });

  return instanceStatus.get(instanceId);
}

export async function disconnectWhatsApp(instanceId: string) {
  const sock = instances.get(instanceId);
  if (sock) {
    sock.logout();
    instances.delete(instanceId);
    const cur = instanceStatus.get(instanceId) || { status: 'disconnected' };
    instanceStatus.set(instanceId, { ...cur, status: 'disconnected' });
  }
}

export async function loadExistingInstances() {
  const fs = await import('fs');
  const dirs = fs.readdirSync('.');
  const authDirs = dirs.filter(d => d.startsWith('baileys_auth_info_'));
  for (const dir of authDirs) {
    const instanceId = dir.replace('baileys_auth_info_', '');
    console.log('[Auto-Load] Reconnecting instance:', instanceId);
    connectWhatsApp(instanceId).catch(console.error);
  }
}

export async function sendMessage(instanceId: string, to: string, message: string, image_url?: string) {
  const sock = instances.get(instanceId);
  if (!sock) {
    throw new Error('Instância de WhatsApp não conectada. Por favor, acesse a página "Instâncias" para conectar seu WhatsApp via QR Code antes de enviar mensagens.');
  }
  
  let jid = to;
  if (!jid.includes('@')) {
    jid = jid.replace(/[^0-9]/g, '');
    if (!jid.endsWith('@s.whatsapp.net')) {
        jid = jid + '@s.whatsapp.net';
    }
  }

  if (image_url) {
      await sock.sendMessage(jid, { image: { url: image_url }, caption: message });
  } else {
      await sock.sendMessage(jid, { text: message });
  }
}


