import { adminDb } from "./firebase-admin.js";

export interface LogEntry {
  jobId: string;
  userId: string;
  provider: string;
  method: string;
  status: string;
  message?: string;
  errorCode?: string;
  errorMessage?: string;
  rawResponsePreview?: string;
}

export class AffiliateLinkLogger {
  static async log(entry: LogEntry): Promise<void> {
    try {
      await adminDb.collection("affiliate_link_conversion_logs").add({
        ...entry,
        createdAt: new Date(),
      });
    } catch (e) {
      console.error("Exception while logging affiliate conversion:", e);
    }
  }
}
