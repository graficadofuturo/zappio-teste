import fs from 'fs';
let code = fs.readFileSync('api/_lib/ml-utils.js', 'utf8');
code = code.replace(/const csrfToken = .val\(\) \|\| '';/, "const csrfToken = 6863('input[name='_csrf']').val() || '';");
fs.writeFileSync('api/_lib/ml-utils.js', code);
