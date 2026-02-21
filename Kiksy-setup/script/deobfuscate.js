
const fs = require('fs');

// Paths
const sourcePath = 'c:\\Users\\MCPL-L400\\Downloads\\prod\\Kiksy-setup\\script\\kiksy_formatted.js';
const mapPath = 'c:\\Users\\MCPL-L400\\Downloads\\prod\\Kiksy-setup\\script\\strings_dump.txt';
const outPath = 'c:\\Users\\MCPL-L400\\Downloads\\prod\\Kiksy-setup\\script\\kiksy_deobfuscated.js';

// Read files
const source = fs.readFileSync(sourcePath, 'utf8');
const mapContent = fs.readFileSync(mapPath, 'utf8');

// Parse Map
const stringMap = new Map();
const lines = mapContent.split('\n');
for (const line of lines) {
    const parts = line.split('::');
    if (parts.length >= 2) {
        const keyStr = parts[0].trim(); // KEY_1234
        if (keyStr.startsWith('KEY_')) {
            const key = parseInt(keyStr.replace('KEY_', ''), 10);
            // Rejoin the rest in case the value contained '::'
            // The value might be a string literal, so we should escape quotes if we put it back in code
            let val = parts.slice(1).join('::').trim();
            // Simple escaping for the replacement
            val = val.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
            stringMap.set(key, val);
        }
    }
}

console.log(`Loaded ${stringMap.size} keys.`);

// Pattern to catch any function call like func(0x123) or func(123)
const regex = /([a-zA-Z$_][a-zA-Z0-9$_]*)\((0x[0-9a-fA-F]+|\d+)\)/g;

const deobfuscated = source.replace(regex, (match, funcName, code) => {
    let index;
    if (code.startsWith('0x')) {
        index = parseInt(code, 16);
    } else {
        index = parseInt(code, 10);
    }

    if (stringMap.has(index)) {
        return `'${stringMap.get(index)}'`; // Replace with string literal
    } else {
        // console.warn(`Skipping ${match} - index ${index} not found in map`);
        return match; // Keep original if not found
    }
});

fs.writeFileSync(outPath, deobfuscated);
console.log(`Deobfuscated file written to ${outPath}`);
