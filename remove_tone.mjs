import fs from 'fs';
const content = fs.readFileSync('src/pages/Campaigns.tsx', 'utf-8');
const lines = content.split('\n');
const start = lines.findIndex((l, i) => l.includes('<div className="grid grid-cols-1 md:grid-cols-2 gap-4">') && lines.slice(i, i+10).some(ll => ll.includes('Tom das Mensagens')));
if (start !== -1) {
    let end = start;
    let openDivs = 0;
    for (let i = start; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('<div')) {
           openDivs += (line.match(/<div/g) || []).length;
        }
        if (line.includes('</div')) {
           openDivs -= (line.match(/<\/div/g) || []).length;
        }
        if (openDivs === 0 && i !== start) {
            end = i;
            break;
        }
    }
    lines.splice(start, end - start + 1);
    fs.writeFileSync('src/pages/Campaigns.tsx', lines.join('\n'));
    console.log("Removed from line " + start + " to " + end);
} else {
    console.log("Not found.");
}
