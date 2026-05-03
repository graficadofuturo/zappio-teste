import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export default async function handler(req, res) {
  try {
    const querySnapshot = await getDocs(collection(db, 'affiliate_offers'));
    const categories = new Set();
    categories.add('Todos');
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.category) {
        categories.add(data.category);
      }
    });

    return res.status(200).json({ ok: true, categories: Array.from(categories) });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
