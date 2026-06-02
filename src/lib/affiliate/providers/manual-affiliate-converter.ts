import { AffiliateLinkJob } from "../job-service.ts";

export class ManualAffiliateConverter {
  static convert(job: AffiliateLinkJob): { error_code: string; error_message: string } {
    return {
      error_code: "LOGIN_REQUIRED",
      error_message: "Fallback for manual conversion triggered."
    };
  }
}
