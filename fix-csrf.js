
const fs = require('fs');
let code = fs.readFileSync('src/services/affiliateService.ts', 'utf8');
const searchStr = 'const csrfToken = .val() as string || '';';
const replStr = 'const csrfToken = .attr('content') || .val() as string || '';';
code = code.replace(searchStr, replStr);
fs.writeFileSync('src/services/affiliateService.ts', code);
