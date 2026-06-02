import { adminDb } from './firebase-admin';
import { MarketplaceDetector } from './marketplace-detector';
import { convertURLWithFirestoreCredentials } from './ml-affiliate-service';

export interface ResolveAffiliateInput {
  originalUrl: string;
  provider: string;
  userId: string;
  jobId?: string;
  campaignId?: string;
}

export interface ResolveAffiliateResult {
  originalUrl: string;
  finalUrl: string;
  source: "affiliate" | "manual" | "blocked";
  canSend: boolean;
  reason: string;
}

export async function resolveAffiliateLinkForSending({
  originalUrl,
  provider,
  userId,
  jobId,
  campaignId
}: ResolveAffiliateInput): Promise<ResolveAffiliateResult> {

  if (!originalUrl) {
    return {
      originalUrl,
      finalUrl: "",
      source: "blocked",
      canSend: false,
      reason: "Link original vazio."
    };
  }

  // Allow fallback in development if explicitly allowed
  const allowFallback = process.env.ALLOW_ORIGINAL_LINK_FALLBACK === "true";

  // Check if it already looks like an affiliate URL
  if (provider === 'mercadolivre' && (originalUrl.includes('/sec/') || originalUrl.includes('afiliados'))) {
    return { originalUrl, finalUrl: originalUrl, source: "affiliate", canSend: true, reason: "Already an affiliate link" };
  }
  if (provider === 'amazon' && originalUrl.includes('amzn.to')) {
    return { originalUrl, finalUrl: originalUrl, source: "affiliate", canSend: true, reason: "Already an affiliate link" };
  }
  if (provider === 'shopee' && originalUrl.includes('shope.ee')) {
    return { originalUrl, finalUrl: originalUrl, source: "affiliate", canSend: true, reason: "Already an affiliate link" };
  }

  try {
    // Buscar no Firestore o job correspondente em affiliate_link_jobs
    const jobsRef = adminDb.collection('affiliate_link_jobs');
    let query = jobsRef
      .where('userId', '==', userId)
      .where('originalUrl', '==', originalUrl)
      .where('provider', '==', provider)
      .where('status', '==', 'success');
      
    const snapshot = await query.get();

    let bestJob: any = null;
    
    // Check if we found a match with affiliateUrl
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (data.affiliateUrl) {
        bestJob = data;
        break;
      }
    }

    if (bestJob && bestJob.affiliateUrl) {
      return {
        originalUrl,
        finalUrl: bestJob.affiliateUrl,
        source: bestJob.method === 'manual' ? 'manual' : 'affiliate',
        canSend: true,
        reason: "Link afiliado resolvido com sucesso."
      };
    }

    // ON-THE-FLY CONVERSION FOR MERCADO LIVRE
    if (provider === 'mercadolivre') {
      try {
        console.log(`[AffiliateResolver] Converting Mercado Livre link on-the-fly for user ${userId}: ${originalUrl}`);
        const convertResult = await convertURLWithFirestoreCredentials(originalUrl, userId, adminDb);
        if (convertResult.ok && convertResult.affiliateUrl && convertResult.method !== 'fallback') {
          // Cache successful result in affiliate_link_jobs
          await jobsRef.add({
            userId,
            originalUrl,
            provider,
            affiliateUrl: convertResult.affiliateUrl,
            status: 'success',
            method: convertResult.method,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });

          return {
            originalUrl,
            finalUrl: convertResult.affiliateUrl,
            source: "affiliate",
            canSend: true,
            reason: "Link afiliado convertido sob demanda."
          };
        } else {
          console.warn(`[AffiliateResolver] ML on-the-fly conversion returned fallback or failed:`, convertResult);
        }
      } catch (err: any) {
        console.error(`[AffiliateResolver] Error during ML on-the-fly conversion:`, err);
      }
    }

    // ON-THE-FLY CONVERSION FOR SHOPEE
    if (provider === 'shopee') {
      try {
        console.log(`[AffiliateResolver] Converting Shopee link on-the-fly for user ${userId}: ${originalUrl}`);
        // Fetch local generate-affiliate endpoint
        const baseUrl = process.env.VITE_APP_URL || process.env.APP_URL || 'http://localhost:3000';
        const response = await fetch(`${baseUrl}/api/shopee/generate-affiliate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, productUrl: originalUrl })
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.ok && result.affiliate_link && !result.affiliate_link.includes(originalUrl)) {
            // Cache in affiliate_link_jobs
            await jobsRef.add({
              userId,
              originalUrl,
              provider,
              affiliateUrl: result.affiliate_link,
              status: 'success',
              method: 'api',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });

            return {
              originalUrl,
              finalUrl: result.affiliate_link,
              source: "affiliate",
              canSend: true,
              reason: "Link afiliado da Shopee convertido sob demanda."
            };
          }
        }
      } catch (err: any) {
        console.error(`[AffiliateResolver] Error during Shopee on-the-fly conversion:`, err);
      }
    }

    if (allowFallback) {
      return {
         originalUrl,
         finalUrl: originalUrl,
         source: "blocked",
         canSend: true,
         reason: "AVISO: Usando link original por causa do ALLOW_ORIGINAL_LINK_FALLBACK=true"
      };
    }
    
    return {
      originalUrl,
      finalUrl: originalUrl,
      source: "blocked",
      canSend: false,
      reason: "Este produto ainda não possui link afiliado convertido. Gere ou cole o link afiliado antes de disparar."
    };

  } catch (error: any) {
    console.error("Erro ao buscar affiliate link em affiliate_link_jobs:", error);
    return {
      originalUrl,
      finalUrl: originalUrl,
      source: "blocked",
      canSend: allowFallback,
      reason: "Erro ao buscar do banco de dados: " + error.message
    };
  }
}

export function replaceOriginalLinksWithAffiliateLinks(message: string, resolvedLinks: ResolveAffiliateResult[]): string {
    let finalMessage = message;
    
    // Sort resolved links by length descending to prevent partial matches of similar URLs
    const sortedLinks = [...resolvedLinks].sort((a, b) => b.originalUrl.length - a.originalUrl.length);

    for (const link of sortedLinks) {
        if (link.canSend && link.finalUrl !== link.originalUrl) {
            // Replace globally in the message
            finalMessage = finalMessage.split(link.originalUrl).join(link.finalUrl);
        }
    }
    
    return finalMessage;
}

export async function resolveCampaignMessageBeforeSending(campaign: any, userId: string): Promise<{
    canSend: boolean;
    finalMessage: string;
    reasons: string[];
}> {
    const rawMessage = campaign.message || '';
    if (!rawMessage || typeof rawMessage !== 'string') {
        return { canSend: true, finalMessage: rawMessage, reasons: [] };
    }

    const { canSend, resolvedLinks, reasons } = await validateCampaignLinksBeforeSending(rawMessage, userId, campaign.id);
    
    if (!canSend) {
        return { canSend: false, finalMessage: rawMessage, reasons };
    }

    const finalMessage = replaceOriginalLinksWithAffiliateLinks(rawMessage, resolvedLinks);
    
    return { canSend: true, finalMessage, reasons };
}

export async function validateCampaignLinksBeforeSending(message: string, userId: string, campaignId?: string): Promise<{
    canSend: boolean;
    resolvedLinks: ResolveAffiliateResult[];
    reasons: string[];
}> {
    if (!message || typeof message !== 'string') {
        return { canSend: true, resolvedLinks: [], reasons: [] };
    }

    // Regex to find all http/https links
    const urlRegex = /https?:\/\/[^\s]+/g;
    const matches = message.match(urlRegex) || [];
    
    // Deduplicate links
    const uniqueLinks = [...new Set(matches)];
    
    const resolvedLinks: ResolveAffiliateResult[] = [];
    let canSend = true;
    const reasons: string[] = [];

    for (const url of uniqueLinks) {
        const provider = MarketplaceDetector.detect(url);
        
        // Only validate if it's a known marketplace
        if (provider !== 'unknown') {
            const result = await resolveAffiliateLinkForSending({
                originalUrl: url,
                provider,
                userId,
                campaignId
            });
            
            resolvedLinks.push(result);
            
            if (!result.canSend) {
                canSend = false;
                reasons.push(`O link ${url} não pode ser enviado: ${result.reason}`);
            }
        } else {
            // Unrecognized links (e.g. google.com) pass through
            resolvedLinks.push({
                originalUrl: url,
                finalUrl: url,
                source: "manual",
                canSend: true,
                reason: "Not a marketplace link"
            });
        }
    }
    
    return { canSend, resolvedLinks, reasons };
}

