
try {
    console.log("Starting extraction...");
    // _0x182ba9 = _0x182ba9 - (-0x2286 + 0x2055 * 0x1 + 0x365);
    // The offset is (-0x2286 + 0x2055 + 0x365) = 0x134 (Decimal 308)
    // Wait, -8774 + 8277 + 869 = 372.
    // Let's verify: -0x2286 = -8838. 0x2055 = 8277. 0x365 = 869.
    // -8838 + 8277 + 869 = 308.
    // So _0x182ba9 = input - 308.
    // So if input is 308, index is 0.

    // We can just rely on the array length.
    // Access _0x2c49().

    var arr = _0x2c49();
    console.log("Array length: " + arr.length);

    // The shifter (IIFE) rotates valid indexes to correct positions.
    // It uses _0x3574 with a large loop.
    // We can just try to access all keys that map to indices 0..length.
    // The keys are idx + 308.

    // But since the array IS rotated by the IIFE at runtime (it runs once),
    // and _0x3574 just does 'return array[index]',
    // we assume the array is now in the correct order for the KEYS the app uses.
    // NO. The IIFE rotates the array until a condition is met.
    // Once stable, _0x3574(key) returns array[key - 308].

    // So we can just dump the array content along with the *expected* key.

    var offset = 308;
    for (var i = 0; i < arr.length; i++) {
        var key = i + offset;
        // console.log("Key " + key + ": " + arr[i]);
        // Or strictly use the getter to be safe against further logic in getter.
        var val = _0x3574(key);
        console.log("KEY_" + key + "::" + val);
    }

} catch (e) {
    console.log("Error: " + e.message);
}
