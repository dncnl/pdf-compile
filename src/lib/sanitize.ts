/**
 * Scrub the DOM that docx-preview builds from an untrusted .docx before it is
 * rasterized.
 *
 * This is a DOM walk rather than a re-serialize-and-sanitize pass on purpose:
 * docx-preview reproduces Word's layout with a generated <style> block, and
 * round-tripping the markup through an HTML sanitizer mangles it. Walking the
 * tree removes the dangerous parts and leaves the layout exactly as rendered.
 *
 * The CSP already blocks script execution and every outbound request, so this
 * is the second layer, not the only one.
 */

const FORBIDDEN_TAGS = new Set([
  'SCRIPT',
  'IFRAME',
  'FRAME',
  'FRAMESET',
  'OBJECT',
  'EMBED',
  'APPLET',
  'LINK',
  'META',
  'BASE',
  'FORM',
  'INPUT',
  'BUTTON',
  'SELECT',
  'TEXTAREA',
  'AUDIO',
  'VIDEO',
]);

const URL_ATTRIBUTES = new Set(['src', 'href', 'xlink:href', 'poster', 'action', 'formaction', 'data']);

/** Only self-contained URLs are allowed; anything else could reach the network. */
function isSelfContainedUrl(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('#');
}

/** Strip @import rules and any url() that is not inline data. */
function scrubCss(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)(?!data:|blob:|#)[^)]*\1\s*\)/gi, 'none')
    .replace(/expression\s*\(/gi, 'void(');
}

export function sanitizeRenderedDocx(host: HTMLElement): void {
  for (const element of Array.from(host.querySelectorAll('*'))) {
    if (FORBIDDEN_TAGS.has(element.tagName)) {
      // <style> is deliberately absent from the forbidden list — it carries the
      // page layout — but its contents still get scrubbed below.
      element.remove();
      continue;
    }

    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();

      if (name.startsWith('on')) {
        element.removeAttribute(attr.name);
        continue;
      }
      if (URL_ATTRIBUTES.has(name) && !isSelfContainedUrl(attr.value)) {
        element.removeAttribute(attr.name);
        continue;
      }
      if (name === 'style') {
        const cleaned = scrubCss(attr.value);
        if (cleaned !== attr.value) element.setAttribute('style', cleaned);
      }
    }
  }

  for (const style of Array.from(host.querySelectorAll('style'))) {
    const cleaned = scrubCss(style.textContent ?? '');
    if (cleaned !== style.textContent) style.textContent = cleaned;
  }
}
