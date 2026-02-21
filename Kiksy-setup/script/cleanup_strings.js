
const fs = require('fs');
const path = 'c:\\Users\\MCPL-L400\\Downloads\\prod\\Kiksy-setup\\script\\kiksy_deobfuscated.js';

let content = fs.readFileSync(path, 'utf8');

// Replace 'str' + 'ing' with 'string'
// We loop until no more replacements are made to handle multiple concatenations like 'a' + 'b' + 'c'
let previousContent;
do {
    previousContent = content;
    // content = content.replace(/' \+ '/g, ''); // Simple join
    // Better regex to handle spacing and quotes
    content = content.replace(/'\s*\+\s*'/g, '');
    content = content.replace(/"\s*\+\s*"/g, '');
} while (content !== previousContent);

fs.writeFileSync(path, content);
console.log('Strings cleaned up.');
