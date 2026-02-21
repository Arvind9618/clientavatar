
const fs = require('fs');
const path = 'c:\\Users\\MCPL-L400\\Downloads\\prod\\Kiksy-setup\\script\\kiksy-component-gmr.js';
const content = fs.readFileSync(path, 'utf8');

const keywords = ['0x568', '0x68b', '0x787', '0x8d3', '.json', 'FaceMesh', 'Rhubarb', 'viseme'];

console.log("Searching in file size: " + content.length);

keywords.forEach(kw => {
    let index = content.indexOf(kw);
    while (index !== -1) {
        const start = Math.max(0, index - 50);
        const end = Math.min(content.length, index + 50 + kw.length);
        const snippet = content.substring(start, end).replace(/\r\n/g, ' ').replace(/\n/g, ' ');
        console.log(`MATCH [${kw}]: ...${snippet}...`);

        index = content.indexOf(kw, index + 1);
    }
});
