import { AffiliateLinkJob, AffiliateLinkJobService } from "./job-service.js";
import { PlaywrightAffiliateConverter } from "./providers/playwright-affiliate-converter.js";
import { ManualAffiliateConverter } from "./providers/manual-affiliate-converter.js";
import { UrlValidator } from "./url-validator.js";

export class AffiliateLinkConverter {
  static async processJob(job: AffiliateLinkJob) {
    if (job.status !== "pending" && job.status !== "failed") {
      return; // Only process pending or failed jobs
    }

    const { id: jobId, userId, provider } = job;
    const mode = process.env.AFFILIATE_CONVERTER_MODE || "playwright";

    await AffiliateLinkJobService.updateJobStatus(jobId, userId, {
      status: "processing",
      attempts: job.attempts + 1
    }, { method: mode, message: "Started processing job." });

    let result: { affiliateUrl?: string, error_code?: string, error_message?: string };

    if (mode === "playwright" && provider !== "unknown") {
      result = await PlaywrightAffiliateConverter.convert(job);
    } else {
      result = ManualAffiliateConverter.convert(job);
    }

    if (result.affiliateUrl && UrlValidator.isAffiliateUrl(result.affiliateUrl, provider)) {
      await AffiliateLinkJobService.updateJobStatus(jobId, userId, {
        affiliateUrl: result.affiliateUrl,
        status: "success",
        method: mode,
        errorCode: null,
        errorMessage: null
      }, {
        method: mode,
        message: "Successfully generated affiliate link.",
        raw_response: result.affiliateUrl
      });
    } else {
      // Failed to generate
      const needsManual = [
        "LOGIN_REQUIRED", 
        "CAPTCHA_DETECTED", 
        "TWO_FACTOR_REQUIRED", 
        "SESSION_EXPIRED", 
        "SELECTOR_NOT_FOUND",
        "UNKNOWN_PROVIDER",
        "MISSING_LINK_BUILDER_URL"
      ].includes(result.error_code || "");

      const newStatus = needsManual ? "needs_manual_action" : "failed";

      await AffiliateLinkJobService.updateJobStatus(jobId, userId, {
        status: newStatus,
        method: mode,
        errorCode: result.error_code || "UNKNOWN_ERROR",
        errorMessage: result.error_message || "Failed without specific error."
      }, {
        method: mode,
        message: result.error_message || "Job execution failed.",
      });
    }
  }
}
