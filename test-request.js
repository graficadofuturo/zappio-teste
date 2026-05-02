fetch("http://localhost:3000/api/generate-copy", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ productUrl: "https://example.com/product" })
}).then(res => res.json()).then(console.log).catch(console.error);
