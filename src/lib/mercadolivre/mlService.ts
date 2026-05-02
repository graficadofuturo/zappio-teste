import fetch from 'node-fetch';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

export async function getMLAuthUrl(origin: string, state: string, redirectUri: string) {
    const clientId = process.env.ML_CLIENT_ID;
    if (!clientId) throw new Error("ML_CLIENT_ID not configured");
    return `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
}

export async function getMercadoLivreUser(accessToken: string) {
    const userRes = await fetch('https://api.mercadolibre.com/users/me', {
       headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!userRes.ok) {
        throw new Error(`Failed to fetch ML user: ${await userRes.text()}`);
    }
    return await userRes.json();
}

export async function exchangeCodeForToken(code: string, userId: string, redirectUri: string) {
    const clientId = process.env.ML_CLIENT_ID;
    const clientSecret = process.env.ML_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("ML credentials not configured");

    const res = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: redirectUri
        }).toString()
    });
    
    console.log("[ML OAuth Token Exchange] Status:", res.status);
    
    if (!res.ok) {
        const err = await res.text();
        console.error(`[ML OAuth Token Exchange] Failed payload:`, { redirectUri, clientId, hasSecret: !!clientSecret });
        throw new Error(`Failed to exchange code: ${err}`);
    }

    const data: any = await res.json();
    
    let mlUser = {} as any;
    try {
        mlUser = await getMercadoLivreUser(data.access_token);
    } catch (e) {
        console.warn("[ML OAuth] Error fetching user:", e);
    }

    return await saveMLIntegration(userId, data, mlUser);
}

export async function saveMLIntegration(userId: string, data: any, mlUser: any, manualClientId?: string, manualClientSecret?: string) {
    if (!admin.apps.length) {
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
            try {
                const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount)
                });
            } catch (e) {
                console.error('[MLService] Invalid FIREBASE_SERVICE_ACCOUNT_KEY JSON format:', e);
            }
        } else {
             throw new Error("Firebase Admin not initialized and FIREBASE_SERVICE_ACCOUNT_KEY not set");
        }
    }
    const db = getFirestore();
    
    // Check if integration already exists
    let existingDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    const qs = await db.collection('ecommerce_keys')
        .where('user_id', '==', userId)
        .where('platform', '==', 'mercadolivre')
        .limit(1)
        .get();

    if (!qs.empty) {
        existingDoc = qs.docs[0];
    } else {
        const qs2 = await db.collection('ecommerce_keys')
            .where('user_id', '==', userId)
            .where('platform', '==', 'mercado_livre')
            .limit(1)
            .get();
        if (!qs2.empty) existingDoc = qs2.docs[0];
    }

    const token_expires_at = data.expires_in ? new Date(Date.now() + (data.expires_in * 1000)) : admin.firestore.FieldValue.serverTimestamp();

    const payload: any = {
        user_id: userId,
        platform: 'mercadolivre',
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        seller_id: mlUser.id?.toString() || data.user_id?.toString() || data.seller_id,
        account_name: mlUser.nickname || '',
        site_id: mlUser.site_id || '',
        permalink: mlUser.permalink || '',
        expires_in: data.expires_in,
        token_expires_at: token_expires_at,
        scope: data.scope,
        status: 'connected',
        connected_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
    };
    
    if (manualClientId && manualClientSecret) {
         payload.api_key = manualClientId;
         payload.api_secret = manualClientSecret;
    }

    if (existingDoc) {
        await existingDoc.ref.update(payload);
    } else {
        await db.collection('ecommerce_keys').add(payload);
    }
    return true;
}

export async function syncMLProducts(integrationId: string) {
    if (!admin.apps.length) {
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
            try {
                const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount)
                });
            } catch (e) {
                console.error('[MLService] Invalid FIREBASE_SERVICE_ACCOUNT_KEY JSON format:', e);
            }
        } else {
             throw new Error("Firebase Admin not initialized and FIREBASE_SERVICE_ACCOUNT_KEY not set");
        }
    }
    const db = getFirestore();
    const docRef = db.collection('ecommerce_keys').doc(integrationId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) throw new Error("Integration not found");
    const intg = docSnap.data() as any;
    
    if (intg.platform !== 'mercadolivre' && intg.platform !== 'mercado_livre') throw new Error("Not a ML integration");
    
    let token = intg.access_token;
    const sellerId = intg.seller_id || intg.ml_user_id;
    
    // For advanced mode without token but with seller id
    if (!token && sellerId) {
        // Fetch public items
        return syncPublicMLProducts(intg, docRef, db);
    }

    // Attempt to fetch user profile to check validity
    let userRes = await fetch('https://api.mercadolibre.com/users/me', {
       headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!userRes.ok && intg.refresh_token && (intg.api_key || process.env.ML_CLIENT_ID)) {
        // Refresh token
        const clientId = intg.api_key || process.env.ML_CLIENT_ID;
        const clientSecret = intg.api_secret || process.env.ML_CLIENT_SECRET;
        
        const refreshRes = await fetch('https://api.mercadolibre.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: intg.refresh_token
            }).toString()
        });
        
        if (refreshRes.ok) {
            const data: any = await refreshRes.json();
            token = data.access_token;
            await docRef.update({
                access_token: token,
                refresh_token: data.refresh_token,
                updated_at: admin.firestore.FieldValue.serverTimestamp()
            });
            userRes = await fetch('https://api.mercadolibre.com/users/me', { headers: { Authorization: `Bearer ${token}` } });
        } else {
            await docRef.update({ status: 'token_expired' });
            throw new Error("Token expirado, reconecte o Mercado Livre.");
        }
    } else if (!userRes.ok) {
         await docRef.update({ status: 'error' });
         throw new Error("Erro de autenticação com Mercado Livre.");
    }

    const userData: any = await userRes.json();
    const authenticatedSellerId = userData.id;

    // Fetch items
    const searchRes = await fetch(`https://api.mercadolibre.com/users/${authenticatedSellerId}/items/search`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!searchRes.ok) throw new Error("Failed to fetch ML items format");
    
    const searchData: any = await searchRes.json();
    const itemIds = searchData.results || [];
    
    return await fetchAndSaveItemsDetails(itemIds, intg.user_id, integrationId, token, docRef, db);
}

async function syncPublicMLProducts(intg: any, docRef: any, db: any) {
    const sellerId = intg.seller_id || intg.ml_user_id;
     const searchRes = await fetch(`https://api.mercadolibre.com/sites/MLB/search?seller_id=${sellerId}`);
     if (!searchRes.ok) throw new Error("Failed to fetch public ML items");
     const searchData: any = await searchRes.json();
     const items = searchData.results || [];
     const itemIds = items.map((i:any) => i.id);
     return await fetchAndSaveItemsDetails(itemIds, intg.user_id, docRef.id, undefined, docRef, db);
}

async function fetchAndSaveItemsDetails(itemIds: string[], userId: string, integrationId: string, token: string | undefined, docRef: any, db: any) {
    if (itemIds.length === 0) {
        await docRef.update({ 
           sync_count: 0, 
           last_synced_at: admin.firestore.FieldValue.serverTimestamp(),
           status: 'connected'
        });
        return 0;
    }

    const chunks = [];
    for (let i = 0; i < itemIds.length; i += 20) {
        chunks.push(itemIds.slice(i, i + 20));
    }
    
    let syncCount = 0;
    const batch = db.batch();
    
    for (const chunk of chunks) {
        const ids = chunk.join(',');
        const headers: any = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        
        const itemsRes = await fetch(`https://api.mercadolibre.com/items?ids=${ids}`, { headers });
        if (!itemsRes.ok) continue;
        
        const itemsData: any = await itemsRes.json();
        
        for (const itemObj of itemsData) {
            if (itemObj.code !== 200) continue;
            const item = itemObj.body;
            
            const productRef = db.collection('products').doc(`${integrationId}_${item.id}`);
            
            const productData = {
                user_id: userId,
                integration_id: integrationId,
                platform: 'mercadolivre',
                external_product_id: item.id,
                product_title: item.title,
                product_price: item.price,
                product_old_price: item.original_price || null,
                product_discount: calculateDiscount(item.original_price, item.price),
                product_image: item.thumbnail ? item.thumbnail.replace('-I.jpg', '-O.jpg') : null,
                product_link: item.permalink,
                product_affiliate_link: '', // to be filled by user
                product_status: item.status,
                last_synced_at: admin.firestore.FieldValue.serverTimestamp()
            };
            
            batch.set(productRef, productData, { merge: true });
            syncCount++;
        }
    }
    
    await batch.commit();
    await docRef.update({ 
       sync_count: syncCount, 
       last_synced_at: admin.firestore.FieldValue.serverTimestamp(),
       status: 'connected'
    });
    
    return syncCount;
}

function calculateDiscount(oldPrice: number | null, newPrice: number) {
    if (!oldPrice || oldPrice <= newPrice) return null;
    return `${Math.round(((oldPrice - newPrice) / oldPrice) * 100)}%`;
}
