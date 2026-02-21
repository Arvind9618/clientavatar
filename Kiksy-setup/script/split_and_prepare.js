
const fs = require('fs');
const path = 'c:\\Users\\MCPL-L400\\Downloads\\prod\\Kiksy-setup\\script\\temp_header.js';
const content = fs.readFileSync(path, 'utf8');

// Split at "class AvatarComponent" to separate the obfuscation header from the component logic.
const parts = content.split('class AvatarComponent');
if (parts.length < 2) {
    console.error("Could not find 'class AvatarComponent' split point. Dumping partial content to check.");
    console.log(content.substring(0, 500));
}

const safeHeader = parts[0];

const extractionLogic = `
try {
    console.log('---START_EXTRACTION---');
    var arr = _0x2c49();
    console.log('Array size: ' + arr.length);
    var offset = 308;
    for (var i = 0; i < arr.length; i++) {
        var key = i + offset;
        try {
            var val = _0x3574(key);
            // Replace newlines to keep one line per entry
            val = val.replace(/\\n/g, '\\\\n').replace(/\\r/g, '');
            console.log('KEY_' + key + '::' + val);
        } catch(e) {
            console.log('KEY_' + key + '::ERROR');
        }
    }
    console.log('---END_EXTRACTION---');
} catch (e) {
    console.error('Runtime Error:', e.message);
}
`;

fs.writeFileSync('c:\\Users\\MCPL-L400\\Downloads\\prod\\Kiksy-setup\\script\\safe_run.js', safeHeader + "\n" + extractionLogic);
console.log("safe_run.js created.");
