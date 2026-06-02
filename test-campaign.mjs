import { getAdminDb } from "./src/api/firebaseAdmin.ts";
import { getNextProductForCampaign } from "./src/api/campaignService.ts";

async function run() {
  const db = await getAdminDb();
  console.log("Got DB");
  const prod = await getNextProductForCampaign(db, "fake_campaign", "Todos", "mercadolivre");
  console.log("Product:", prod ? prod.product_id : "No product found");
}

run().catch(console.error);
