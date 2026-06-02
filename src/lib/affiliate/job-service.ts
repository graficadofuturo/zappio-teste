import { adminDb } from "./firebase-admin.ts";
import { MarketplaceDetector } from "./marketplace-detector.ts";
import { AffiliateLinkLogger } from "./logger.ts";
import { UrlValidator } from "./url-validator.ts";

export type AffiliateJobStatus = "pending" | "processing" | "success" | "failed" | "needs_manual_action";

export interface AffiliateLinkJob {
  id: string;
  userId: string;
  provider: string;
  originalUrl: string;
  affiliateUrl: string | null;
  status: AffiliateJobStatus;
  method: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class AffiliateLinkJobService {
  static async createJob(originalUrl: string, userId: string): Promise<AffiliateLinkJob | null> {
    if (!UrlValidator.isValid(originalUrl)) {
      throw new Error("Invalid URL");
    }

    const provider = MarketplaceDetector.detect(originalUrl);
    
    // Automatically flag unknowns as requiring manual action
    const status = provider === 'unknown' ? 'needs_manual_action' : 'pending';
    const errorCode = provider === 'unknown' ? 'UNKNOWN_PROVIDER' : null;

    const jobData = {
      userId,
      provider,
      originalUrl,
      status,
      errorCode,
      method: null,
      errorMessage: null,
      attempts: 0,
      affiliateUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await adminDb.collection("affiliate_link_jobs").add(jobData);

    if (status === 'needs_manual_action') {
      await AffiliateLinkLogger.log({
        jobId: docRef.id,
        userId: userId,
        provider,
        method: "auto",
        status: "needs_manual_action",
        errorCode: "UNKNOWN_PROVIDER",
        message: "Marketplace not detected, requires manual link insertion."
      });
    }

    return { id: docRef.id, ...jobData } as AffiliateLinkJob;
  }

  static async updateJobStatus(
    jobId: string, 
    userId: string,
    update: Partial<AffiliateLinkJob>, 
    logDetails?: { method: string, message?: string, raw_response?: string }
  ) {
    try {
      await adminDb.collection("affiliate_link_jobs").doc(jobId).update({
        ...update,
        updatedAt: new Date(),
      });
    } catch (e) {
      console.error(`Failed to update job ${jobId}:`, e);
      return;
    }

    if (logDetails) {
      await AffiliateLinkLogger.log({
        jobId: jobId,
        userId: userId,
        provider: update.provider || "-",
        method: logDetails.method,
        status: update.status || "updated",
        message: logDetails.message,
        errorCode: update.errorCode || undefined,
        errorMessage: update.errorMessage || undefined,
        rawResponsePreview: logDetails.raw_response
      });
    }
  }

  static async saveManualUrl(jobId: string, userId: string, affiliateUrl: string) {
    if (!UrlValidator.isValid(affiliateUrl)) {
      throw new Error("Invalid URL");
    }

    const jobDoc = await adminDb.collection("affiliate_link_jobs").doc(jobId).get();

    if (!jobDoc.exists) {
      throw new Error("Job not found");
    }

    await this.updateJobStatus(jobId, userId, {
      affiliateUrl: affiliateUrl,
      status: "success",
      method: "manual"
    }, {
      method: "manual",
      message: "User manually inserted affiliate URL."
    });
  }

  static async retryJob(jobId: string, userId: string) {
    const jobDoc = await adminDb.collection("affiliate_link_jobs").doc(jobId).get();

    if (!jobDoc.exists) {
      throw new Error("Job not found");
    }

    const job = jobDoc.data();

    if (job?.provider === "unknown") {
      throw new Error("Cannot auto-convert an unknown provider link.");
    }

    await this.updateJobStatus(jobId, userId, {
      status: "pending",
      errorCode: null,
      errorMessage: null
    }, {
      method: "auto",
      message: "Job queued for retry."
    });
  }
}
