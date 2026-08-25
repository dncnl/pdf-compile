/**
 * mammoth ships a browser bundle with no type declarations. Only the two
 * members Stackly uses are declared here.
 */
declare module 'mammoth/mammoth.browser.js' {
  export interface MammothResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }

  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>;
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>;
}
