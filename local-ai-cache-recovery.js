/* Narrow, one-time recovery for WebLLM's corrupted tensor-cache failures. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PocketwiseAICacheRecovery = factory();
})(typeof self !== 'undefined' ? self : globalThis, function() {
  'use strict';

  function errorText(error) {
    if (error && typeof error === 'object' && error.message) return String(error.message);
    return String(error || 'Unknown model-loading error');
  }

  function isCorruptTensorCacheError(error) {
    const message = errorText(error);
    // Match the reported error and closely related zero-length tensor-shard failures.
    return /tensor[\s_-]*cache/i.test(message) &&
      (/(?:record\s+range|range)[\s\S]{0,180}(?:exceeds|outside|beyond)[\s\S]{0,80}shard\s+size/i.test(message) ||
       /shard\s+size\s*[:=]?\s*0\b/i.test(message) ||
       /(?:empty|zero[- ]byte|0[- ]byte)[\s\S]{0,80}shard/i.test(message));
  }

  async function loadWithCacheRecovery(options) {
    const load = options && options.load;
    const clearCache = options && options.clearCache;
    if (typeof load !== 'function' || typeof clearCache !== 'function') {
      throw new TypeError('loadWithCacheRecovery requires load and clearCache functions.');
    }

    try {
      return await load();
    } catch (firstError) {
      if (!(options.isCorruptCacheError || isCorruptTensorCacheError)(firstError)) throw firstError;

      if (typeof options.onRecover === 'function') await options.onRecover(firstError);
      try {
        await clearCache();
      } catch (cleanupError) {
        throw new Error(
          `Aruvi detected a damaged local AI model cache but could not clear it automatically (${errorText(cleanupError)}). Tap “Remove”, then download Qwen2.5 again. Your Aruvi transactions were not changed.`
        );
      }

      try {
        return await load(); // Exactly one fresh attempt after the model-only cache is removed.
      } catch (retryError) {
        throw new Error(
          `Aruvi detected a damaged Qwen2.5 tensor cache, removed the model cache, and retried once. The retry still failed: ${errorText(retryError)}. Tap “Remove”, then download Qwen2.5 AI again on a stable Wi-Fi connection. Your Aruvi transactions were not changed.`
        );
      }
    }
  }

  return { isCorruptTensorCacheError, loadWithCacheRecovery };
});
