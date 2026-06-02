import { auth, db } from "../../../lib/firebase";
import { collection, addDoc, updateDoc, doc, getDoc, getDocs, query, where, orderBy, serverTimestamp } from "firebase/firestore";
import { MarketplaceDetector } from "../../../lib/affiliate/marketplace-detector";
import { UrlValidator } from "../../../lib/affiliate/url-validator";

export async function createAffiliateLinkJob(originalUrl: string) {
  try {
    if (!UrlValidator.isValid(originalUrl)) {
      throw new Error("Invalid URL");
    }
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("Not authenticated");
    const userId = currentUser.uid;

    const provider = MarketplaceDetector.detect(originalUrl);
    const status = provider === "unknown" ? "needs_manual_action" : "pending";
    const errorCode = provider === "unknown" ? "UNKNOWN_PROVIDER" : null;

    const jobData = {
      userId,
      provider,
      originalUrl,
      affiliateUrl: null,
      status,
      method: null,
      errorCode,
      errorMessage: null,
      attempts: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, "affiliate_link_jobs"), jobData);

    if (status === "needs_manual_action") {
      await addDoc(collection(db, "affiliate_link_conversion_logs"), {
        jobId: docRef.id,
        userId,
        provider,
        method: "auto",
        status: "needs_manual_action",
        errorCode: "UNKNOWN_PROVIDER",
        message: "Marketplace not detected, requires manual link insertion.",
        createdAt: serverTimestamp(),
      });
    }

    return { success: true, job: { id: docRef.id, ...jobData } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function retryAffiliateLinkJob(jobId: string) {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("Not authenticated");
    
    const jobRef = doc(db, "affiliate_link_jobs", jobId);
    const jobSnap = await getDoc(jobRef);
    if (!jobSnap.exists() || jobSnap.data().userId !== currentUser.uid) {
      throw new Error("Job not found");
    }

    if (jobSnap.data().provider === "unknown") {
      throw new Error("Cannot auto-convert an unknown provider link.");
    }

    await updateDoc(jobRef, {
      status: "pending",
      errorCode: null,
      errorMessage: null,
      updatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, "affiliate_link_conversion_logs"), {
      jobId,
      userId: currentUser.uid,
      provider: jobSnap.data().provider,
      method: "auto",
      status: "pending",
      message: "Job queued for retry.",
      createdAt: serverTimestamp(),
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function saveManualAffiliateUrl(jobId: string, affiliateUrl: string) {
  try {
    if (!UrlValidator.isValid(affiliateUrl)) {
      throw new Error("Invalid URL");
    }
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("Not authenticated");

    const jobRef = doc(db, "affiliate_link_jobs", jobId);
    const jobSnap = await getDoc(jobRef);
    if (!jobSnap.exists() || jobSnap.data().userId !== currentUser.uid) {
      throw new Error("Job not found");
    }

    await updateDoc(jobRef, {
      affiliateUrl,
      status: "success",
      method: "manual",
      updatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, "affiliate_link_conversion_logs"), {
      jobId,
      userId: currentUser.uid,
      provider: jobSnap.data().provider,
      method: "manual",
      status: "success",
      message: "User manually inserted affiliate URL.",
      createdAt: serverTimestamp(),
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function listAffiliateLinkJobs() {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("Not authenticated");
    
    const q = query(
      collection(db, "affiliate_link_jobs"),
      where("userId", "==", currentUser.uid)
      // orderBy("createdAt", "desc") // May require index, dropping for now, UI should sort or we just order client side
    );
    const snap = await getDocs(q);
    const jobs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a: any, b: any) => {
        const timeA = a.createdAt?.toMillis() || 0;
        const timeB = b.createdAt?.toMillis() || 0;
        return timeB - timeA;
    });
    
    return { success: true, jobs };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getAffiliateLinkJob(jobId: string) {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("Not authenticated");

    const jobRef = doc(db, "affiliate_link_jobs", jobId);
    const snap = await getDoc(jobRef);
    if (!snap.exists() || snap.data().userId !== currentUser.uid) {
      throw new Error("Job not found");
    }
    
    return { success: true, job: { id: snap.id, ...snap.data() } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
