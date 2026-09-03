import{n as e,t}from"./assets/chunk-XUoNDiD6.js";export{t as get,e as init};
if (typeof document !== 'undefined' && document.head) {
  try {
    for (const __mfWarmupPath of ["assets/chunk-XUoNDiD6.js","assets/chunk-3C9rGNnD.js","assets/chunk-DFaYLskp.js","assets/chunk-DsmEHcMa.js","assets/chunk-B7qeedMF.js"]) {
      const __mfWarmupLink = document.createElement('link');
      __mfWarmupLink.rel = 'modulepreload';
      __mfWarmupLink.crossOrigin = '';
      __mfWarmupLink.href = new URL(__mfWarmupPath, import.meta.url).href;
      document.head.appendChild(__mfWarmupLink);
    }
  } catch (__mfWarmupError) {}
}
