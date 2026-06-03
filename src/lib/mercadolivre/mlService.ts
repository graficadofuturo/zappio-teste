import { getAdminFirestore, removeUndefinedDeep } from '../../api/firebaseAdmin.js';
import { normalizeMercadoLivreProductUrl } from '../../services/affiliateService.js';

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
    const db = getAdminFirestore();
    
    // Primary path used by UI
    const primaryPath = `users/${userId}/integrations/mercadolivre`;
    
    const expires_in = Number(data.expires_in || data.expiresIn) || 21600;
    const expiresAt = data.expiresAt ? new Date(data.expiresAt).getTime() : Date.now() + (expires_in * 1000);
    const token_expires_at = new Date(expiresAt).toISOString();

    const payload: any = {
        // Core fields (Integrations UI compatibility)
        marketplace: "mercadolivre",
        connected: true,
        status: "connected",
        uid: userId,
        mlUserId: (mlUser?.id || data?.user_id || data?.seller_id)?.toString() || null,
        nickname: mlUser?.nickname || null,
        email: mlUser?.email || null,
        firstName: mlUser?.first_name || null,
        lastName: mlUser?.last_name || null,
        
        // Token Aliases for compatibility
        accessToken: data.access_token || data.accessToken,
        access_token: data.access_token || data.accessToken,
        refreshToken: data.refresh_token || data.refreshToken,
        refresh_token: data.refresh_token || data.refreshToken,
        
        expiresIn: expires_in,
        expires_in: expires_in,
        expiresAt: token_expires_at,
        token_expires_at: token_expires_at,
        
        // Nested aliases
        tokens: {
            accessToken: data.access_token || data.accessToken,
            access_token: data.access_token || data.accessToken,
            refreshToken: data.refresh_token || data.refreshToken,
            refresh_token: data.refresh_token || data.refreshToken
        },
        auth: {
            accessToken: data.access_token || data.accessToken,
            access_token: data.access_token || data.accessToken,
            refreshToken: data.refresh_token || data.refreshToken,
            refresh_token: data.refresh_token || data.refreshToken
        },

        // Other metadata
        seller_id: (mlUser?.id || data?.user_id || data?.seller_id)?.toString() || null,
        site_id: mlUser?.site_id || null,
        permalink: mlUser?.permalink || null,
        scope: data.scope || null,
        connectedAt: new Date().toISOString(),
        connected_at: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    
    if (manualClientId && manualClientSecret) {
         payload.api_key = manualClientId;
         payload.api_secret = manualClientSecret;
    }

    const cleanedPayload = removeUndefinedDeep(payload);

    // Save to Primary Path
    await db.doc(primaryPath).set(cleanedPayload, { merge: true });
    console.log("[ML Service] Integration saved to primary path:", primaryPath);

    // Also save to ecommerce_keys for legacy support if needed
    const qs = await db.collection('ecommerce_keys')
        .where('user_id', '==', userId)
        .where('platform', 'in', ['mercadolivre', 'mercado_livre'])
        .limit(1)
        .get();

    if (!qs.empty) {
        await qs.docs[0].ref.update(cleanedPayload);
    } else {
        await db.collection('ecommerce_keys').add(cleanedPayload);
    }
    
    return true;
}

export async function debugMercadoLivreTokenLookup(uid: string) {
    const db = getAdminFirestore();
    const paths = [
        `users/${uid}/integrations/mercadolivre`,
        `integrations/${uid}/marketplaces/mercadolivre`,
        `mercadoLivreIntegrations/${uid}`
    ];

    const results = [];
    for (const path of paths) {
        const snap = await db.doc(path).get();
        if (snap.exists) {
            const data = snap.data() || {};
            results.push({
                path,
                exists: true,
                keys: Object.keys(data),
                hasAccessToken: Boolean(
                    data.accessToken ||
                    data.access_token ||
                    data.token ||
                    data.mlAccessToken ||
                    data.tokens?.access_token ||
                    data.tokens?.accessToken ||
                    data.auth?.access_token ||
                    data.auth?.accessToken
                ),
                hasRefreshToken: Boolean(
                    data.refreshToken ||
                    data.refresh_token ||
                    data.tokens?.refresh_token ||
                    data.tokens?.refreshToken ||
                    data.auth?.refresh_token ||
                    data.auth?.refreshToken
                ),
                status: data.status || data.connected || data.conected || 'N/A'
            });
        } else {
            results.push({ path, exists: false });
        }
    }

    // Also check ecommerce_keys
    const qs = await db.collection('ecommerce_keys')
        .where('user_id', '==', uid)
        .where('platform', 'in', ['mercadolivre', 'mercado_livre'])
        .get();

    for (const doc of qs.docs) {
        const data = doc.data();
        results.push({
            path: `ecommerce_keys/${doc.id}`,
            exists: true,
            keys: Object.keys(data),
            hasAccessToken: Boolean(
                data.accessToken ||
                data.access_token ||
                data.token ||
                data.mlAccessToken ||
                data.tokens?.access_token ||
                data.tokens?.accessToken ||
                data.auth?.access_token ||
                data.auth?.accessToken
            ),
            hasRefreshToken: Boolean(
                data.refreshToken ||
                data.refresh_token ||
                data.tokens?.refresh_token ||
                data.tokens?.refreshToken ||
                data.auth?.refresh_token ||
                data.auth?.refreshToken
            ),
            status: data.status || data.connected || data.conected || 'N/A'
        });
    }

    console.log("ML_DEBUG_TOKEN_LOOKUP_RESULTS", JSON.stringify({ uid, results }, null, 2));
    return results;
}

export async function getMLAccessToken(userId: string, campaignId?: string): Promise<string | null> {
    const db = getAdminFirestore();
    const pathsChecked = [
        `users/${userId}/integrations/mercadolivre`,
        `integrations/${userId}/marketplaces/mercadolivre`,
        'ecommerce_keys collection'
    ];

    console.log("AFFILIATE_LINK_TOKEN_LOOKUP_START", { uid: userId, campaignId: campaignId || 'manual' });
    
    // 1. Check primary location (OAuth flow) - used by Integrations screen
    const mlPath = `users/${userId}/integrations/mercadolivre`;
    const mlDoc = await db.doc(mlPath).get();
    
    let tokenData: any = null;
    let ref: any = null;
    let isPathFormat = false;
    let docPathFound = null;

    if (mlDoc.exists) {
        tokenData = mlDoc.data();
        ref = mlDoc.ref;
        isPathFormat = true;
        docPathFound = mlPath;
    } else {
        // 2. Check fallback location (Legacy flow)
        const qs = await db.collection('ecommerce_keys')
            .where('user_id', '==', userId)
            .where('platform', 'in', ['mercadolivre', 'mercado_livre'])
            .limit(1)
            .get();
            
        if (!qs.empty) {
            tokenData = qs.docs[0].data();
            ref = qs.docs[0].ref;
            isPathFormat = false;
            docPathFound = `ecommerce_keys/${qs.docs[0].id}`;
        }
    }

    if (tokenData) {
        console.log("AFFILIATE_LINK_TOKEN_LOOKUP_DOC_FOUND", { 
            uid: userId, 
            path: docPathFound,
            keys: Object.keys(tokenData)
        });
    } else {
        console.warn("AFFILIATE_LINK_CONVERT_FAILED_NO_TOKEN_FOR_UID", {
            uid: userId,
            campaignId: campaignId || 'direct',
            pathsChecked: [mlPath, 'ecommerce_keys collection'],
            hasIntegrationDoc: false
        });
        return null;
    }
    
    // Normalize tokens
    let token = tokenData.accessToken || tokenData.access_token || tokenData.token || tokenData.mlAccessToken || 
                tokenData.tokens?.access_token || tokenData.tokens?.accessToken || 
                tokenData.auth?.access_token || tokenData.auth?.accessToken;

    let refreshToken = tokenData.refreshToken || tokenData.refresh_token || 
                      tokenData.tokens?.refresh_token || tokenData.tokens?.refreshToken || 
                      tokenData.auth?.refresh_token || tokenData.auth?.refreshToken;

    if (!token) {
        console.warn(
            "AFFILIATE_LINK_CONVERT_FAILED_NO_TOKEN_FOR_UID",
            JSON.stringify({
                uid: userId,
                campaignId: campaignId || 'direct',
                ownerUid: userId,
                pathsChecked,
                docsFound: [docPathFound],
                fieldsDetected: Object.keys(tokenData),
                hasIntegrationDoc: true,
                hasAccessToken: false,
                hasRefreshToken: !!refreshToken,
                integrationStatus: tokenData.status || tokenData.connected || tokenData.conected || 'N/A'
            }, null, 2)
        );
        return null;
    }

    console.log("AFFILIATE_LINK_TOKEN_FOUND", { uid: userId, campaignId: campaignId || 'N/A' });

    let expiresAt = 0;
    
    if (tokenData.expiresAt) {
        expiresAt = new Date(tokenData.expiresAt).getTime();
    } else if (tokenData.token_expires_at) {
        expiresAt = new Date(tokenData.token_expires_at).getTime();
    } else if (tokenData.expires_at) {
        expiresAt = new Date(tokenData.expires_at).getTime();
    }

    if (!token) {
        console.warn("AFFILIATE_LINK_CONVERT_FAILED_NO_TOKEN_FOR_UID", {
            uid: userId,
            campaignId: campaignId || 'N/A',
            integrationPath: mlPath,
            hasIntegration: true,
            hasAccessToken: false,
            hasRefreshToken: !!refreshToken
        });
        return null;
    }

    // Check if expired (with 10 min buffer)
    const now = Date.now();
    if (expiresAt < now + 600000 && refreshToken) {
        console.log("AFFILIATE_CONVERT_REFRESH_TOKEN_START", { uid: userId });
        
        const clientId = tokenData.api_key || process.env.ML_CLIENT_ID;
        const clientSecret = tokenData.api_secret || process.env.ML_CLIENT_SECRET;
        
        if (!clientId || !clientSecret) {
            console.warn("[ML] Missing credentials for token refresh");
            return token;
        }

        try {
            const refreshRes = await fetch('https://api.mercadolibre.com/oauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    client_id: clientId,
                    client_secret: clientSecret,
                    refresh_token: refreshToken
                }).toString()
            });

            if (refreshRes.ok) {
                const data: any = await refreshRes.json();
                token = data.access_token;
                refreshToken = data.refresh_token;
                const expires_in = Number(data.expires_in || 21600);
                const newExpDate = new Date(Date.now() + (expires_in * 1000));
                
                const updatePayload: any = {
                    accessToken: token,
                    access_token: token,
                    refreshToken: refreshToken,
                    refresh_token: refreshToken,
                    expiresAt: newExpDate.toISOString(),
                    token_expires_at: newExpDate.toISOString(),
                    expiresIn: expires_in,
                    expires_in: expires_in,
                    updatedAt: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    tokens: {
                        accessToken: token,
                        access_token: token,
                        refreshToken: refreshToken,
                        refresh_token: refreshToken
                    },
                    auth: {
                        accessToken: token,
                        access_token: token,
                        refreshToken: refreshToken,
                        refresh_token: refreshToken
                    }
                };
                
                // If it was found in a legacy path, we also update the primary path for future
                if (!isPathFormat) {
                    const primaryPath = `users/${userId}/integrations/mercadolivre`;
                    await db.doc(primaryPath).set(updatePayload, { merge: true }).catch(e => console.error("Error upgrading path during refresh:", e));
                }
                
                await ref.update(updatePayload);
                console.log("AFFILIATE_CONVERT_REFRESH_TOKEN_SUCCESS", { uid: userId });
            } else {
                console.error("[ML] Refresh token failed:", await refreshRes.text());
            }
        } catch (e) {
            console.error("[ML] Error refreshing token:", e);
        }
    }

    return token;
}

export async function convertMercadoLivreAffiliateLink(originalUrl: string, userId: string, campaignId?: string): Promise<string | null> {
    console.log("AFFILIATE_CONVERT_START", { userId, originalUrl, campaignId });
    
    const token = await getMLAccessToken(userId, campaignId);
    if (!token) {
        // Logging is handled inside getMLAccessToken
        return null;
    }

    try {
        const res = await fetch('https://api.mercadolibre.com/affiliates/link_conversion', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                source_urls: [originalUrl]
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error("AFFILIATE_LINK_CONVERT_API_ERROR", errText);
            return null;
        }

        const data: any = await res.json();
        let affiliateLink: string | null = null;

        if (Array.isArray(data) && data.length > 0) {
            const result = data[0];
            affiliateLink = typeof result === 'string' ? result : (result.affiliate_url || result.converted_url || result.link);
        } else if (data.affiliate_url || data.converted_url) {
            affiliateLink = data.affiliate_url || data.converted_url;
        }

        if (affiliateLink) {
            console.log("AFFILIATE_CONVERT_SUCCESS", { affiliateLink });
            return affiliateLink;
        }

        console.warn("AFFILIATE_LINK_CONVERT_FAILED_EMPTY_RESPONSE", data);
        return null;
    } catch (error) {
        console.error("AFFILIATE_LINK_CONVERT_FAILED_EXCEPTION", error);
        return null;
    }
}

export async function syncMLProducts(integrationId: string) {
    const db = getAdminFirestore();
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
                client_id: clientId || '',
                client_secret: clientSecret || '',
                refresh_token: intg.refresh_token
            }).toString()
        });
        
        if (refreshRes.ok) {
            const data: any = await refreshRes.json();
            token = data.access_token;
            await docRef.update({
                access_token: token,
                refresh_token: data.refresh_token,
                updated_at: new Date().toISOString()
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
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
        await docRef.update({ 
           sync_count: 0, 
           last_synced_at: new Date().toISOString(),
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
        
        if (Array.isArray(itemsData)) {
            for (const itemObj of itemsData) {
                if (!itemObj || itemObj.code !== 200 || !itemObj.body) continue;
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
                    product_link: normalizeMercadoLivreProductUrl(item.permalink),
                    product_affiliate_link: '', 
                    product_status: item.status,
                    last_synced_at: new Date().toISOString()
                };
                
                batch.set(productRef, removeUndefinedDeep(productData), { merge: true });
                syncCount++;
            }
        }
    }
    
    await batch.commit();
    await docRef.update({ 
       sync_count: syncCount, 
       last_synced_at: new Date().toISOString(),
       status: 'connected'
    });
    
    return syncCount;
}

function calculateDiscount(oldPrice: number | null, newPrice: number) {
    if (!oldPrice || oldPrice <= newPrice) return null;
    return `${Math.round(((oldPrice - newPrice) / oldPrice) * 100)}%`;
}
