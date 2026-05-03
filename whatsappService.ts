import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import Pino from 'pino';
import NodeCache from 'node-cache';

// A simple in-memory store for our instances state
export const instances = new Map<string, any>();
export const instanceStatus = new Map<string, { 
  status: string, 
  qr?: string,
  groups?: any[],
  contacts?: any[],
  lastGroupFetch?: number
}>();

// Helper to fetch groups safely
export async function fetchGroupsSafely(instanceId: string, force = false) {
  const sock = instances.get(instanceId);
  const status = instanceStatus.get(instanceId);
  
  if (!sock || !status || status.status !== 'connected') return;

  const now = Date.now();
  const MIN_INTERVAL = 5 * 60 * 1000; // 5 minutes

  if (!force && status.lastGroupFetch && (now - status.lastGroupFetch < MIN_INTERVAL)) {
    console.log(`[Instance ${instanceId}] Skipping group fetch, too soon (last fetch was ${Math.round((now - status.lastGroupFetch) / 1000)}s ago)`);
    return;
  }

  try {
    console.log(`[Instance ${instanceId}] Fetching groups...`);
    const groups = await sock.groupFetchAllParticipating();
    status.groups = Object.values(groups);
    status.lastGroupFetch = Date.now();
    console.log(`[Instance ${instanceId}] Fetched ${status.groups.length} groups.`);
  } catch (e: any) {
    if (e?.message?.includes('rate-overlimit')) {
      console.warn(`[Instance ${instanceId}] Rate overlimit for group fetching. Waiting before next attempt.`);
      // Set the last fetch to now even if failed with rate limit to prevent immediate retry
      status.lastGroupFetch = Date.now(); 
    } else {
      console.error(`[Instance ${instanceId}] Error fetching groups:`, e);
    }
  }
}

// msgRetryCounterCache helps avoid "Bad MAC" errors by keeping track of retry attempts
const msgRetryCounterCache = new NodeCache();

export async function connectWhatsApp(instanceId: string) {
  try {
    if (instances.has(instanceId)) {
      return instanceStatus.get(instanceId);
    }

    instanceStatus.set(instanceId, { status: 'initializing', groups: [], contacts: [] });

    // Ensure session directory exists or just let Baileys handle it
    const { state, saveCreds } = await useMultiFileAuthState(`baileys_auth_info_${instanceId}`);
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: false,
      getMessage: async (key) => ({
        conversation: "Mensagem protegida por criptografia de ponta a ponta."
      }),
      msgRetryCounterCache,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      defaultQueryTimeoutMs: 60000,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      browser: ['Zappio', 'Chrome', '1.0.0'],
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
        const error = lastDisconnect?.error as any;
        const statusCode = error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        console.log(`[Instance ${instanceId}] Connection closed. Status: ${statusCode}. Reconnecting: ${shouldReconnect}`);
        
        instances.delete(instanceId);
        
        if (shouldReconnect) {
          // Reconnect with a slight delay
          setTimeout(() => {
            connectWhatsApp(instanceId).catch(err => console.error(`[Instance ${instanceId}] Reconnect failed:`, err));
          }, 5000);
        } else {
          const current = instanceStatus.get(instanceId) || { status: 'initializing' };
          instanceStatus.set(instanceId, { ...current, status: 'disconnected' });
        }
      } else if (connection === 'open') {
        console.log(`[Instance ${instanceId}] Connected!`);
        const current = instanceStatus.get(instanceId) || { status: 'initializing' };
        instanceStatus.set(instanceId, { ...current, status: 'connected' });
        
        // Delay group fetch after connection to avoid immediate rate limit
        setTimeout(() => {
          fetchGroupsSafely(instanceId);
        }, 10000);
      }
    });

    sock.ev.on('contacts.upsert', async (contacts) => {
      const cur = instanceStatus.get(instanceId);
      if (cur) {
         if (!cur.contacts) cur.contacts = [];
         for (const c of contacts) {
            if (!c.id || c.id.endsWith('@g.us')) continue;
            // Check if contact already exists
            if (!cur.contacts.find(item => item.id === c.id)) {
              cur.contacts.push(c);
            }
         }
      }
    });

    return instanceStatus.get(instanceId);
  } catch (error: any) {
    console.error(`[Instance ${instanceId}] Connection initialization error:`, error);
    instanceStatus.set(instanceId, { status: 'error', groups: [], contacts: [] });
    return { status: 'error', error: error.message };
  }
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


