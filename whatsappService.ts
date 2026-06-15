import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import Pino from 'pino';
import NodeCache from 'node-cache';
import fs from 'fs';
import path from 'path';

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
    
    // Preserve existing user_id if it exists to avoid breaking multi-user configurations
    let userId = 'default_user';
    try {
      const docRef = db.doc(`whatsapp_instances/${instanceId}`);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        userId = docSnap.data()?.user_id || 'default_user';
      }
    } catch (dbErr) {
      console.warn(`[WA-SERVICE] Could not retrieve existing user_id for ${instanceId}, falling back to default_user:`, dbErr);
    }

    await db.doc(`whatsapp_instances/${instanceId}`).set({
      ...data,
      user_id: userId
    }, { merge: true });
  } catch (e) {
    console.error("[WA-SERVICE] Failed to save status to Firestore:", e);
  }
}

// Helper to get auth directory path (uses /tmp on Vercel serverless)
function getAuthDir(instanceId: string) {
  if (process.env.VERCEL) {
    return `/tmp/baileys_auth_info_${instanceId}`;
  }
  return `baileys_auth_info_${instanceId}`;
}

// Helper: save session credentials directory to Firestore
async function saveSessionToFirestore(instanceId: string) {
  try {
    const authDir = getAuthDir(instanceId);
    if (!fs.existsSync(authDir)) return;

    const files = fs.readdirSync(authDir);
    const sessionData: Record<string, string> = {};

    for (const file of files) {
      const filePath = path.join(authDir, file);
      if (fs.statSync(filePath).isFile()) {
        const content = fs.readFileSync(filePath).toString('base64');
        const safeKey = Buffer.from(file).toString('base64url');
        sessionData[safeKey] = content;
      }
    }

    if (Object.keys(sessionData).length === 0) return;

    const { getAdminDb } = await import("./src/api/firebaseAdmin.js");
    const db = getAdminDb();
    await db.collection("whatsapp_sessions").doc(instanceId).set({
      files: sessionData,
      updatedAt: new Date().toISOString()
    });
    console.log(`[WA-SERVICE] Saved session files to Firestore for instance ${instanceId}`);
  } catch (e) {
    console.error("[WA-SERVICE] Failed to save session to Firestore:", e);
  }
}

// Helper: restore session credentials directory from Firestore
async function restoreSessionFromFirestore(instanceId: string) {
  try {
    const { getAdminDb } = await import("./src/api/firebaseAdmin.js");
    const db = getAdminDb();
    const doc = await db.collection("whatsapp_sessions").doc(instanceId).get();
    if (!doc.exists) {
      console.log(`[WA-SERVICE] No saved session in Firestore for instance ${instanceId}`);
      return false;
    }

    const data = doc.data();
    if (!data || !data.files) return false;

    const authDir = getAuthDir(instanceId);
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    const files = data.files;
    for (const safeKey of Object.keys(files)) {
      const filename = Buffer.from(safeKey, 'base64url').toString('utf-8');
      const base64Content = files[safeKey];
      const content = Buffer.from(base64Content, 'base64');
      const filePath = path.join(authDir, filename);
      fs.writeFileSync(filePath, content);
    }

    console.log(`[WA-SERVICE] Restored session files from Firestore for instance ${instanceId}`);
    return true;
  } catch (e) {
    console.error("[WA-SERVICE] Failed to restore session from Firestore:", e);
    return false;
  }
}

// Helper: clear auth credentials directory
function clearAuthDir(instanceId: string) {
  const dir = getAuthDir(instanceId);
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`[Instance ${instanceId}] Cleared invalid/logged out credentials directory.`);
    }
  } catch (e) {
    console.error(`[Instance ${instanceId}] Failed to clear credentials directory:`, e);
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

    const authDir = getAuthDir(instanceId);
    if (!fs.existsSync(path.join(authDir, 'creds.json'))) {
      await restoreSessionFromFirestore(instanceId);
    }
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
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

    sock.ev.on('creds.update', async () => {
      await saveCreds();
      // Small delay to ensure files are written to disk before we upload them
      setTimeout(async () => {
        await saveSessionToFirestore(instanceId);
      }, 500);
    });

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
          clearAuthDir(instanceId);
          try {
            const { getAdminDb } = await import("./src/api/firebaseAdmin.js");
            const db = getAdminDb();
            await db.collection("whatsapp_sessions").doc(instanceId).delete();
          } catch (e) {}
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
  }
  const cur = instanceStatus.get(instanceId) || { status: 'disconnected' };
  instanceStatus.set(instanceId, { ...cur, status: 'disconnected' });
  await saveStatusToFirestore(instanceId, { wa_status: 'disconnected', wa_qr: null, status: 'disconnected' });
  clearAuthDir(instanceId);

  // Delete from Firestore sessions
  try {
    const { getAdminDb } = await import("./src/api/firebaseAdmin.js");
    const db = getAdminDb();
    await db.collection("whatsapp_sessions").doc(instanceId).delete();
    console.log(`[WA-SERVICE] Deleted session from Firestore for instance ${instanceId}`);
  } catch (e) {
    console.error("[WA-SERVICE] Failed to delete session from Firestore:", e);
  }
}

export async function loadExistingInstances() {
  try {
    const { getAdminDb } = await import("./src/api/firebaseAdmin.js");
    const db = getAdminDb();
    console.log('[Auto-Load] Fetching active instances from Firestore...');
    const snapshot = await db.collection('whatsapp_instances').get();
    
    const activeInstanceIds = new Set<string>();
    
    snapshot.forEach(doc => {
      activeInstanceIds.add(doc.id);
    });

    console.log(`[Auto-Load] Found ${activeInstanceIds.size} instances in Firestore.`);

    // 1. Reconnect only the active ones from Firestore
    for (const instanceId of activeInstanceIds) {
      console.log('[Auto-Load] Reconnecting instance:', instanceId);
      connectWhatsApp(instanceId).catch(err => console.error(`[Auto-Load] Failed to connect instance ${instanceId}:`, err));
    }

    // 2. Clean up any stale local auth folders that are NOT in Firestore
    const fs = await import('fs');
    const dirs = fs.readdirSync('.');
    const authDirs = dirs.filter(d => d.startsWith('baileys_auth_info_'));
    for (const dir of authDirs) {
      const instanceId = dir.replace('baileys_auth_info_', '');
      if (!activeInstanceIds.has(instanceId)) {
        console.log(`[Auto-Load] Cleaning up stale session directory on disk for deleted instance: ${instanceId}`);
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch (e) {
          console.error(`[Auto-Load] Failed to delete stale directory ${dir}:`, e);
        }
      }
    }
  } catch (error) {
    console.error("[Auto-Load] Error during instance auto-load:", error);
  }
}

// Helper: Find any connected fallback instance belonging to the same user or globally
async function findConnectedFallbackInstance(originalInstanceId: string): Promise<string | null> {
  try {
    const { getAdminDb } = await import("./src/api/firebaseAdmin.js");
    const db = getAdminDb();
    
    // Retrieve owner of original instance
    const origSnap = await db.collection("whatsapp_instances").doc(originalInstanceId).get();
    const originalUserId = origSnap.exists ? origSnap.data()?.user_id || 'default_user' : 'default_user';

    // Query connected instances for this user
    const connectedSnap = await db.collection("whatsapp_instances")
      .where("status", "==", "connected")
      .where("user_id", "==", originalUserId)
      .get();

    for (const doc of connectedSnap.docs) {
      if (doc.id === originalInstanceId) continue;
      // Check if session credentials exist in firestore
      const sessionDoc = await db.collection("whatsapp_sessions").doc(doc.id).get();
      if (sessionDoc.exists) {
        console.log(`[WA-SERVICE] Found connected fallback instance ${doc.id} for user ${originalUserId}`);
        return doc.id;
      }
    }

    // Secondary fallback: check any globally connected instance with active sessions
    const allConnectedSnap = await db.collection("whatsapp_instances")
      .where("status", "==", "connected")
      .get();

    for (const doc of allConnectedSnap.docs) {
      if (doc.id === originalInstanceId) continue;
      const sessionDoc = await db.collection("whatsapp_sessions").doc(doc.id).get();
      if (sessionDoc.exists) {
        console.log(`[WA-SERVICE] Found globally connected fallback instance ${doc.id}`);
        return doc.id;
      }
    }
  } catch (e) {
    console.error("[WA-SERVICE] Error finding connected fallback instance:", e);
  }
  return null;
}

export async function sendMessage(instanceId: string, to: string, message: string, image_url?: string) {
  if (!instanceId || !to) {
    throw new Error(`Parâmetros de destino inválidos: instanceId=${instanceId}, to=${to}`);
  }

  let resolvedInstanceId = instanceId;
  let sock = instances.get(resolvedInstanceId);
  
  // If not in memory, check if credentials exist and auto-reconnect
  if (!sock || typeof sock.sendMessage !== 'function') {
    console.log(`[WA-SERVICE] Instance ${resolvedInstanceId} not found in memory. Checking if credentials exist...`);
    const { getAdminDb } = await import("./src/api/firebaseAdmin.js");
    const db = getAdminDb();
    const sessionDoc = await db.collection("whatsapp_sessions").doc(resolvedInstanceId).get();
    const localCredsExists = fs.existsSync(path.join(getAuthDir(resolvedInstanceId), 'creds.json'));

    if (sessionDoc.exists || localCredsExists) {
      console.log(`[WA-SERVICE] Credentials exist. Initiating on-the-fly auto-reconnect for ${resolvedInstanceId}...`);
      await connectWhatsApp(resolvedInstanceId);

      // Poll until connected or error/qrcode
      let attempts = 0;
      const maxAttempts = 30; // 15 seconds
      while (attempts < maxAttempts) {
        const status = instanceStatus.get(resolvedInstanceId);
        if (status && status.status === 'connected') {
          console.log(`[WA-SERVICE] Auto-reconnect succeeded for ${resolvedInstanceId}`);
          break;
        }
        if (status && (status.status === 'error' || status.status === 'qrcode' || status.status === 'disconnected')) {
          break; // Stop waiting if it fails, so we can try fallback
        }
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }

      sock = instances.get(resolvedInstanceId);
    }
  }

  // Fallback: If instance is still not connected or ready, try alternative connected instances
  const currentStatus = instanceStatus.get(resolvedInstanceId)?.status;
  if (!sock || typeof sock.sendMessage !== 'function' || currentStatus !== 'connected' || !sock.user) {
    console.log(`[WA-SERVICE] Instance ${resolvedInstanceId} is disconnected/unavailable. Searching for fallback...`);
    const fallbackId = await findConnectedFallbackInstance(resolvedInstanceId);
    if (fallbackId) {
      console.log(`[WA-SERVICE] Falling back to connected instance ${fallbackId}`);
      resolvedInstanceId = fallbackId;
      sock = instances.get(resolvedInstanceId);

      // Reconnect fallback if not in memory
      if (!sock || typeof sock.sendMessage !== 'function') {
        await connectWhatsApp(resolvedInstanceId);
        let attempts = 0;
        const maxAttempts = 30;
        while (attempts < maxAttempts) {
          const status = instanceStatus.get(resolvedInstanceId);
          if (status && status.status === 'connected') break;
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
        sock = instances.get(resolvedInstanceId);
      }
    }
  }
  
  // Basic check for Baileys internal state readiness
  if (!sock || typeof sock.sendMessage !== 'function' || !sock.user) {
    throw new Error('Instância de WhatsApp não conectada ou inválida. Por favor, acesse a página "Instâncias" para conectar seu WhatsApp.');
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


