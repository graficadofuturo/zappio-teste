import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import Pino from 'pino';
import NodeCache from 'node-cache';

// Mute known noisy libsignal/Baileys errors that are handled internally by retries
if (!(console as any).__libsignalSuppressed) {
  const originalConsoleError = console.error;
  console.error = function (...args: any[]) {
    const msg = typeof args[0] === 'string' ? args[0] : (args[0]?.message || '');
    if (
      msg.includes('Failed to decrypt message with any known session') ||
      msg.includes('Session error:Error: Bad MAC') ||
      msg.includes('Error: Bad MAC')
    ) {
      return;
    }
    originalConsoleError.apply(console, args);
  };
  (console as any).__libsignalSuppressed = true;
}

// Helper: save instance status to Firestore
async function saveStatusToFirestore(instanceId: string, data: Record<string, any>) {
  try {
    const { getAdminDb } = await import("./src/api/firebaseAdmin.js");
    const db = getAdminDb();
    await db.doc(`whatsapp_instances/${instanceId}`).set({
      ...data,
      user_id: 'default_user'
    }, { merge: true });
  } catch (e) {
    console.error("[WA-SERVICE] Failed to save status to Firestore:", e);
  }
}

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

// messageStore helps Baileys retrieve historical messages for retries, crucial for fixing decryption issues
const messageStore = new NodeCache({ stdTTL: 3600, maxKeys: 1000 });

export async function connectWhatsApp(instanceId: string) {
  try {
    if (instances.has(instanceId)) {
      return instanceStatus.get(instanceId);
    }

    instanceStatus.set(instanceId, { status: 'initializing', groups: [], contacts: [] });
    await saveStatusToFirestore(instanceId, {
      wa_status: 'initializing',
      wa_qr: null,
      wa_qr_updated_at: null,
    });

    // Ensure session directory exists or just let Baileys handle it
    const { state, saveCreds } = await useMultiFileAuthState(`baileys_auth_info_${instanceId}`);
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: false,
      getMessage: async (key) => {
        if (!key || !key.id) return undefined;
        const msg = messageStore.get(`${instanceId}_${key.id}`);
        if (msg) return (msg as any).message;
        
        return {
          conversation: "Mensagem protegida por criptografia de ponta a ponta."
        };
      },
      msgRetryCounterCache,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      defaultQueryTimeoutMs: 60000,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      retryRequestDelayMs: 5000,
      browser: ['Zappio', 'Chrome', '1.0.0'],
      logger: Pino({ level: 'silent' }) as any
    });

    instances.set(instanceId, sock);

    sock.ev.on('creds.update', saveCreds);

    // Store messages for potential retries
    sock.ev.on('messages.upsert', async (m) => {
        try {
            if (m && m.type === 'notify' && Array.isArray(m.messages)) {
                for (const msg of m.messages) {
                    if (msg && msg.key && msg.key.id) {
                        messageStore.set(`${instanceId}_${msg.key.id}`, msg);
                    }
                }
            }
        } catch (err) {
            console.error(`[Instance ${instanceId}] Error in messages.upsert:`, err);
        }
    });

    sock.ev.on('connection.update', async (update) => {
      if (!update) return;
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        console.log(`[Instance ${instanceId}] QR Code generated.`);
        const current = instanceStatus.get(instanceId) || { status: 'initializing' };
        instanceStatus.set(instanceId, { ...current, status: 'qrcode', qr });
        await saveStatusToFirestore(instanceId, {
          wa_status: 'qrcode',
          wa_qr: qr,
          wa_qr_updated_at: new Date().toISOString()
        });
      }

      if (connection === 'close') {
        const error = lastDisconnect?.error as any;
        const statusCode = error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        console.log(`[Instance ${instanceId}] Connection closed. Status: ${statusCode}. Reconnecting: ${shouldReconnect}`);
        
        instances.delete(instanceId);
        
        if (shouldReconnect) {
          const current = instanceStatus.get(instanceId) || { status: 'initializing' };
          instanceStatus.set(instanceId, { ...current, status: 'disconnected' });
          await saveStatusToFirestore(instanceId, { wa_status: 'disconnected', wa_qr: null, status: 'disconnected' });
          // Reconnect with a slight delay
          setTimeout(() => {
            connectWhatsApp(instanceId).catch(err => console.error(`[Instance ${instanceId}] Reconnect failed:`, err));
          }, 5000);
        } else {
          const current = instanceStatus.get(instanceId) || { status: 'initializing' };
          instanceStatus.set(instanceId, { ...current, status: 'disconnected' });
          await saveStatusToFirestore(instanceId, { wa_status: 'disconnected', wa_qr: null, status: 'disconnected' });
        }
      } else if (connection === 'open') {
        console.log(`[Instance ${instanceId}] Connected!`);
        const current = instanceStatus.get(instanceId) || { status: 'initializing' };
        instanceStatus.set(instanceId, { ...current, status: 'connected' });
        
        const phone = sock.user?.id ? sock.user.id.split(':')[0].split('@')[0] : '';
        await saveStatusToFirestore(instanceId, {
          wa_status: 'connected',
          wa_qr: null,
          status: 'connected',
          phone_number: phone
        });
        
        // Delay group fetch after connection to avoid immediate rate limit
        setTimeout(() => {
          fetchGroupsSafely(instanceId);
        }, 10000);
      }
    });

    sock.ev.on('groups.upsert', async (groups) => {
      try {
        const cur = instanceStatus.get(instanceId);
        if (cur && Array.isArray(groups)) {
          if (!cur.groups) cur.groups = [];
          for (const g of groups) {
            if (!g || !g.id) continue;
            if (!cur.groups.find(item => item && item.id === g.id)) {
              cur.groups.push(g);
            }
          }
        }
      } catch (e) {
        console.error(`[Instance ${instanceId}] Error in groups.upsert:`, e);
      }
    });

    sock.ev.on('contacts.upsert', async (contacts) => {
      try {
        const cur = instanceStatus.get(instanceId);
        if (cur && Array.isArray(contacts)) {
           if (!cur.contacts) cur.contacts = [];
           for (const c of contacts) {
              if (!c || !c.id || typeof c.id !== 'string' || c.id.endsWith('@g.us')) continue;
              // Check if contact already exists
              const contactExists = cur.contacts.some(item => item && typeof item === 'object' && item.id === c.id);
              if (!contactExists) {
                cur.contacts.push(c);
              }
           }
        }
      } catch (e) {
        console.error(`[Instance ${instanceId}] Error in contacts.upsert:`, e);
      }
    });

    return instanceStatus.get(instanceId);
  } catch (error: any) {
    console.error(`[Instance ${instanceId}] Connection initialization error:`, error);
    instanceStatus.set(instanceId, { status: 'error', groups: [], contacts: [] });
    await saveStatusToFirestore(instanceId, { wa_status: 'disconnected', wa_qr: null, status: 'disconnected' });
    return { status: 'error', error: error.message };
  }
}

export async function disconnectWhatsApp(instanceId: string) {
  const sock = instances.get(instanceId);
  if (sock) {
    try {
      await sock.logout();
    } catch (e) {}
    instances.delete(instanceId);
    const cur = instanceStatus.get(instanceId) || { status: 'disconnected' };
    instanceStatus.set(instanceId, { ...cur, status: 'disconnected' });
    await saveStatusToFirestore(instanceId, { wa_status: 'disconnected', wa_qr: null, status: 'disconnected' });
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
  if (!instanceId || !to) {
    throw new Error(`Parâmetros de destino inválidos: instanceId=${instanceId}, to=${to}`);
  }

  const sock = instances.get(instanceId);
  if (!sock || typeof sock.sendMessage !== 'function') {
    throw new Error('Instância de WhatsApp não conectada ou inválida. Por favor, acesse a página "Instâncias" para conectar seu WhatsApp.');
  }
  
  // Basic check for Baileys internal state readiness
  if (!sock.user) {
    console.warn(`[WhatsAppService] Instance ${instanceId} has no "user" info yet. Send might fail.`);
  }

  try {
    let jid = to;
    if (typeof jid !== 'string') {
        throw new Error(`JID inválido (não é string): ${JSON.stringify(jid)}`);
    }

    if (!sock.user && !jid.includes('@g.us')) {
        console.warn(`[WhatsAppService] Instance ${instanceId} has no "user" info. Send to ${jid} might fail or throw.`);
        // Force a check if it's really initialized
        if (typeof (sock as any).user === 'undefined') {
            console.error(`[WhatsAppService] CRITICAL: sock.user is undefined for instance ${instanceId}`);
        }
    }

    // Normalize JID
    jid = jid.trim();
    if (jid.includes('@g.us')) {
        // Already a group
    } else if (jid.includes('@s.whatsapp.net')) {
        // Already a contact
    } else {
        // Pure number or something else
        jid = jid.replace(/[^0-9]/g, '');
        jid = jid + '@s.whatsapp.net';
    }

    // Ensure we don't send [object Object] by accident (double check)
    let finalPayloadText = typeof message === 'string' ? message : String(message);

    if (image_url) {
        await sock.sendMessage(jid, { image: { url: image_url }, caption: finalPayloadText });
    } else {
        await sock.sendMessage(jid, { text: finalPayloadText });
    }
  } catch (err: any) {
    console.error(`[WhatsAppService] Failed to send message to ${to}:`, err);
    throw err;
  }
}


