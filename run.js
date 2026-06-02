const fs = require('fs');
let code = fs.readFileSync('src/api/routes/mercadolivre.ts', 'utf8');

const injectionCode = `
    let affiliateCookie = null;
    let affiliateTag = null;
    try {
      console.log("ML_CALLBACK_EXTRACT_AFFILIATE_START", { uid: userId });
      const lbRes = await fetch("https://www.mercadolivre.com.br/afiliados/linkbuilder", {
        headers: {
          "Authorization": \`Bearer ${tokenData.access_token}\`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
        }
      });
      
      const setCookies = lbRes.headers.getSetCookie ? lbRes.headers.getSetCookie() : [];
      if (setCookies.length > 0) {
        affiliateCookie = setCookies.map(c => c.split(';')[0]).join('; ');
      } else {
        const rawCookie = lbRes.headers.get("set-cookie");
        if (rawCookie) affiliateCookie = rawCookie;
      }
      
      const html = await lbRes.text();
      const tagMatch1 = html.match(/"tag":"([^"]+)"/);
      const tagMatch2 = html.match(/tag=([a-zA-Z0-9_\\-]+)/);
      const tagMatch3 = html.match(/'tag'\\s*:\\sq('[^']+)'/);
      
      if (tagMatch1) affiliateTag = tagMatch1[1];
      else if (tagMatch2) affiliateTag = tagMatch2[1];
      else if (tagMatch3) affiliateTag = tagMatch3[1];
      
      console.log("ML_CALLBACK_EXTRACT_AFFILIATE_DONE", { hasCookie: !!affiliateCookie, tag: affiliateTag });
    } catch (err) {
      console.error("ML_CALLBACK_EXTRACT_AFFILIATE_ERROR", err);
    }
`\
code = code.replace('const data: any = {\n      marketplace: "mercadolivre",', injectionCode + '\n    const data: any = {\n      marketplace: "mercadolivre",');

const fieldsCode = `     affiliateCookie: affiliateCookie || null,
      affiliateTag: affiliateTag || null,
      affiliateCookieStatus: (affiliateCookie && affiliateTag) ? "active" : "pending",
`
code = code.replace('connectedAt: new Date().toISOString(),\n      updatedAt: new Date().toISOString()', fieldsCode + 'connectedAt: new Date().toISOString(),\n      updatedAt: new Date().toISOString()');

fs.writeFileSync('src/api/routes/mercadolivre.ts', code);
console.log("Done");