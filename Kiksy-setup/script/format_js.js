
const fs = require('fs');
const path = 'c:\\Users\\MCPL-L400\\Downloads\\prod\\Kiksy-setup\\script\\kiksy-component-gmr.js';
const content = fs.readFileSync(path, 'utf8');

// Simple beautify: add newlines after { and ;
// This isn't a perfect parser but helps with reading minified code.
let formatted = content.replace(/\{/g, '{\n').replace(/\}/g, '\n}').replace(/\;/g, ';\n');

// Indentation (simple)
const lines = formatted.split('\n');
let indent = 0;
const indented = lines.map(line => {
    line = line.trim();
    if (line.includes('}')) indent = Math.max(0, indent - 1);
    const tabs = '  '.repeat(indent);
    if (line.includes('{')) indent++;
    return tabs + line;
}).join('\n');

fs.writeFileSync('c:\\Users\\MCPL-L400\\Downloads\\prod\\Kiksy-setup\\script\\kiksy_formatted.js', indented);
console.log("Formatted file written.");
