import { config } from 'dotenv';
config();
import { getAdminDb } from './src/api/firebaseAdmin';
import { resolveAffiliateLinkForSending } from './src/services/affiliateService';

async function run() {
  const url = 'https://produto.mercadolivre.com.br/MLB-4967167410-garrafa-termica-1-litro-com-termmetro-led-para-chas-cafe-_JM';
  const uid = 'rVnNRTsKSHU2PMBq5q8L4FqUfwF2';
  
  process.env.REQUIRE_AFFILIATE_LINK_FOR_ML = 'true';
  
  try {
    const resUrl = await resolveAffiliateLinkForSending({
        uid,
        productUrl: url,
        marketplace: 'mercadolivre',
        offerId: 'test-offer-123'
    });
    console.log("FINAL URL:", resUrl);
  } catch(e: any) {
    console.error("ERROR:", e.message);
  }
}
run();
