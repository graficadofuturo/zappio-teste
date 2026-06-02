import fetch from 'node-fetch';
async function run() {
  console.log("Triggering clear-and-recollect...");
  const res = await fetch('http://127.0.0.1:3000/api/offers/list?action=clear-and-recollect', { method: 'POST' });
  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Response:", text);
}
run();
