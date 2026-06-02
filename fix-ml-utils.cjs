const fs = require('fs');
let code = fs.readFileSync('api/_lib/ml-utils.js', 'utf8');

code = code.replace(/csrfToken = \.val\(\);/g, `csrfToken = $('input[name="_csrf"]').val();`);
code = code.replace(/csrfToken = \$\\\'?input\\[name="_csrf"\\]\\\'?\')\.val\(\);/g, `csrfToken = $('input[name="_csrf"]').val();`);

code = code.replace(/csrfToken = \.attr\('content'\) \|\| '';/g, `csrfToken = $('meta[name="csrf-token"]').attr('content') || '';`);
code = code.replace(/csrfToken = \$\\\'?meta\\[name="csrf-token"\\]\\\'?\')\.attr\('content'\) \|\| '';/g, `csrfToken = $('meta[name="csrf-token"]').attr('content') || '';a);

fs.writeFileSync('api/_lib/ml-utils.js', code);
console.log('Fixed parens!');