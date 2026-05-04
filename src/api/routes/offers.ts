import { Router } from "express";
import { getAdminDb } from "../firebaseAdmin.ts";
import { simplifyProductTitle, formatCurrency } from "../../lib/productUtils.ts";
import { collectAutomatedFromML, saveToOfferBank } from "../mlService.ts";

const router = Router();

router.all("/", async (req: any, res) => {
    const action = req.query.action || req.body?.action || 'list';
    
    try {
        const db = await getAdminDb();
        
        switch (action) {
            case "list": {
                const { category, marketplace = "mercadolivre", limit = 100 } = req.query;
                let query = db.collection("affiliate_offers").where("marketplace", "==", marketplace);
                
                if (category && category.toLowerCase() !== "todos") {
                    query = query.where("category", "==", category);
                }

                const snapshot = await query.orderBy("updated_at", "desc").limit(Number(limit)).get();
                const offers = snapshot.docs.map((doc: any) => {
                    const data = doc.data();
                    const priceFormatted = formatCurrency(data.product_price || data.price);
                    
                    return { 
                        id: doc.id, 
                        ...data,
                        displayPrice: priceFormatted,
                        displayTitle: data.titleShort || data.product_name || simplifyProductTitle(data.titleOriginal || data.title || "")
                    }
                });

                return res.json({ ok: true, count: offers.length, offers });
            }

            case "categories": {
                const snapshot = await db.collection("affiliate_offers").get();
                const categories = new Set<string>();
                categories.add("Todos");
                snapshot.forEach((doc: any) => {
                    const data = doc.data();
                    if (data.category) categories.add(data.category);
                });
                return res.json({ ok: true, categories: Array.from(categories) });
            }

            case "collect": {
                console.log("[Offers] Action: collect triggered");
                const queries = ["ofertas do dia", "smartphone", "smart tv", "notebook", "ferramentas"];
                const q = queries[Math.floor(Math.random() * queries.length)];
                
                const items = await collectAutomatedFromML(q, "Geral");
                let count = 0;
                
                if (items.length > 0) {
                    count = await saveToOfferBank(items);
                }
                
                return res.json({ ok: true, message: `${count} ofertas coletadas.`, totalSaved: count });
            }

            case "backfill": {
                const snapshot = await db.collection("affiliate_offers").get();
                let count = 0;
                const batch = db.batch();
                
                for (const doc of snapshot.docs) {
                    const data = doc.data();
                    const original = data.titleOriginal || data.product_name || data.title || "";
                    const currentShort = data.titleShort;
                    const newShort = simplifyProductTitle(original);

                    if (!currentShort || currentShort !== newShort) {
                        batch.update(doc.ref, {
                            titleShort: newShort,
                            product_name: newShort,
                            updated_at: new Date().toISOString()
                        });
                        count++;
                    }
                }
                
                if (count > 0) await batch.commit();
                return res.json({ ok: true, message: `${count} ofertas corrigidas.` });
            }

            default:
                return res.status(400).json({ ok: false, error: `Action ${action} not supported` });
        }
    } catch (error: any) {
        console.error(`OFFERS_ACTION_ERR_${action}`, error);
        return res.status(500).json({ ok: false, error: error.message });
    }
});

// Legacy routes redirected to the main handler for safety if needed
router.get("/list", (req, res) => { req.query.action = 'list'; (router as any).handle({ method: 'GET', url: '/', query: req.query }, req, res); });
router.get("/categories", (req, res) => { req.query.action = 'categories'; (router as any).handle({ method: 'GET', url: '/', query: req.query }, req, res); });
router.post("/mercadolivre/sync-daily", (req, res) => { req.query.action = 'collect'; (router as any).handle({ method: 'POST', url: '/', query: req.query }, req, res); });

export default router;
