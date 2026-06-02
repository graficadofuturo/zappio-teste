import { collectAutomated } from './api/_lib/ml-utils.js';
(async () => {
    const res = await collectAutomated('Tênis Mormaii Urban');
    console.log('Result length:', res.length);
    console.log(JSON.stringify(res.slice(0, 2), null, 2));
})();
