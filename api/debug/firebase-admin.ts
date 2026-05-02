import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
    let serviceAccountJsonValid = false;
    let hasProjectId = false;
    let hasClientEmail = false;
    let hasPrivateKey = false;
    let privateKeyLooksValid = false;

    const keyString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const hasServiceAccountKey = Boolean(keyString);

    if (hasServiceAccountKey) {
        try {
            const serviceAccount = JSON.parse(keyString as string);
            serviceAccountJsonValid = true;
            hasProjectId = Boolean(serviceAccount.project_id);
            hasClientEmail = Boolean(serviceAccount.client_email);
            hasPrivateKey = Boolean(serviceAccount.private_key);
            
            if (hasPrivateKey) {
                const pk = serviceAccount.private_key;
                privateKeyLooksValid = pk.includes("BEGIN PRIVATE KEY") && pk.includes("END PRIVATE KEY");
            }
        } catch (e) {
            // JSON parser failed
        }
    }

    res.status(200).json({
      hasServiceAccountKey,
      serviceAccountJsonValid,
      hasProjectId,
      hasClientEmail,
      hasPrivateKey,
      privateKeyLooksValid
    });
}
