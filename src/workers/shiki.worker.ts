// src/workers/shiki.worker.ts
import { createHighlighterCore } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'

let highlighter: any = null;
let isInitError = false;
let messageQueue: any[] = [];

async function init() {
  try {
    // We import dynamically from shiki/langs and shiki/wasm
    highlighter = await createHighlighterCore({
      themes: [
        import('shiki/themes/vitesse-dark.mjs')
      ],
      langs: [
        import('shiki/langs/typescript.mjs'),
        import('shiki/langs/python.mjs'),
        import('shiki/langs/rust.mjs'),
        import('shiki/langs/javascript.mjs'),
        import('shiki/langs/json.mjs'),
        import('shiki/langs/bash.mjs'),
        import('shiki/langs/cpp.mjs'),
        import('shiki/langs/go.mjs'),
        import('shiki/langs/html.mjs'),
        import('shiki/langs/css.mjs'),
        import('shiki/langs/sql.mjs'),
        import('shiki/langs/yaml.mjs'),
        import('shiki/langs/markdown.mjs'),
        import('shiki/langs/java.mjs')
      ],
      engine: createOnigurumaEngine(import('shiki/wasm'))
    });
    
    // Process queued messages
    for (const msg of messageQueue) {
      processMessage(msg);
    }
    messageQueue = [];
    postMessage({ type: 'READY' });
  } catch (error) {
    console.error("Shiki worker init error:", error);
    isInitError = true;
    for (const msg of messageQueue) {
      fallbackProcess(msg);
    }
    messageQueue = [];
    postMessage({ type: 'ERROR', error });
  }
}

function fallbackProcess(data: any) {
  const { id, code } = data;
  const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  postMessage({ id, html: `<pre><code>${escapeHtml(code)}</code></pre>` });
}

function processMessage(data: any) {
  if (isInitError || !highlighter) {
    fallbackProcess(data);
    return;
  }
  const { id, code, lang } = data;
  try {
    const loadedLangs = highlighter.getLoadedLanguages();
    const targetLang = loadedLangs.includes(lang) ? lang : 'typescript';
    const html = highlighter.codeToHtml(code, { lang: targetLang, theme: 'vitesse-dark' });
    postMessage({ id, html });
  } catch (err) {
    fallbackProcess(data);
  }
}

self.onmessage = async (e) => {
  if (!highlighter && !isInitError) {
    messageQueue.push(e.data);
    return;
  }
  processMessage(e.data);
};

init();
