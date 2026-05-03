import { collection, query, where, getDocs, limit, orderBy, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export async function getNextProductForCampaign(campaignId, category, marketplace, userId) {
  // 1. Get history of sent products for this campaign
  const historyRef = collection(db, 'campaign_product_history');
  const historyQuery = query(historyRef, where('campaign_id', '==', campaignId));
  const historySnapshot = await getDocs(historyQuery);
  const sentProductIds = historySnapshot.docs.map(doc => doc.data().product_id);

  // 2. Fetch active offers with filters
  let constraints = [
    where('status', 'in', ['active', 'affiliate_ready']),
    orderBy('updated_at', 'desc')
  ];

  if (category && category !== 'Todos') {
    constraints.push(where('category', '==', category));
  }

  if (marketplace && marketplace !== 'all') {
    constraints.push(where('marketplace', '==', marketplace));
  }

  const offersQuery = query(collection(db, 'affiliate_offers'), ...constraints);
  const offersSnapshot = await getDocs(offersQuery);
  const offers = offersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  // 3. Filter out already sent products
  const availableOffers = offers.filter(offer => !sentProductIds.includes(offer.id));

  if (availableOffers.length === 0) {
    return null; // All products sent
  }

  // 4. Return the first one (most recent update)
  return availableOffers[0];
}

export async function recordProductSent(campaignId, productId, userId) {
  await addDoc(collection(db, 'campaign_product_history'), {
    campaign_id: campaignId,
    product_id: productId,
    user_id: userId,
    sent_at: serverTimestamp()
  });
}
