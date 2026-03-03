/**
 * API Delay Interceptor
 * 
 * Intercepts fetch() calls to /read-file and adds a configurable delay
 * to prevent overwhelming the TTS backend during chunk polling.
 */
(function () {
    'use strict';

    let delayMs = 500; // Default delay

    // Load config to get the custom delay value
    fetch('./config/config.json')
        .then(r => r.json())
        .then(cfg => {
            if (cfg.readaudioDelay) {
                delayMs = parseInt(cfg.readaudioDelay, 10) || 500;
            }
            console.log('[APIDelay] Configured delay:', delayMs, 'ms');
        })
        .catch(() => console.warn('[APIDelay] Could not load config, using default delay'));

    // Keep reference to original fetch
    const originalFetch = window.fetch;

    // Override fetch
    window.fetch = function (...args) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

        // Only delay /read-file requests
        if (url.includes('read-file')) {
            return new Promise(resolve => {
                setTimeout(() => resolve(originalFetch.apply(this, args)), delayMs);
            });
        }

        return originalFetch.apply(this, args);
    };

    console.log('[APIDelay] Fetch interceptor installed');
})();
