import { dirname, join, sep } from 'path';
import { pathToFileURL } from 'url';

/**
 * pdfjs-dist v4 ships the legacy build as ESM only (`pdf.mjs`) — the old
 * `legacy/build/pdf.js` CommonJS entry is gone.
 *
 * This API compiles to CommonJS (tsconfig `module: commonjs`) and the Docker
 * runner is node:20-alpine, where `require()` of an ES module is not available.
 * So the import has to be a *real* dynamic import: written as `import()` in TS it
 * would be downlevelled to `require()` and blow up at runtime. The Function
 * constructor keeps it opaque to the compiler.
 *
 * The module is resolved through `require.resolve` (absolute path → file URL) so
 * it does not depend on the process CWD.
 */
const nativeImport = new Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<any>;

let cached: Promise<any> | null = null;

export function loadPdfJs(): Promise<any> {
  if (!cached) {
    const entry = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
    cached = nativeImport(pathToFileURL(entry).href).then((mod) => {
      // v4 rejects an empty workerSrc ("No GlobalWorkerOptions.workerSrc
      // specified") and every getDocument() would fall through to the heuristic
      // fallback. Point it at the worker that ships with the package instead.
      const worker = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
      mod.GlobalWorkerOptions.workerSrc = pathToFileURL(worker).href;
      return mod;
    });
  }
  return cached;
}

/**
 * Asset directory shipped inside pdfjs-dist.
 *
 * Must be a plain filesystem path, not a file:// URL — the Node factories feed
 * the value straight to `fs.promises.readFile` (see `node_utils_fetchData` in
 * pdf.mjs). The trailing separator matters: pdfjs concatenates the filename.
 */
function assetDir(name: string): string {
  const pkgRoot = dirname(dirname(dirname(require.resolve('pdfjs-dist/legacy/build/pdf.mjs'))));
  return join(pkgRoot, name) + sep;
}

/**
 * Options shared by every `getDocument()` call.
 *
 * - `isEvalSupported: false` — buffers here come from LINE/user uploads; this
 *   removes the eval path entirely (GHSA-wgrm-67xf-hhpq).
 * - `standardFontDataUrl` / `cMapUrl` — without them v4 warns and drops glyphs
 *   for non-embedded and CID-keyed fonts, which is most Thai official PDFs, so
 *   text extraction would silently return less than it should.
 */
export const PDFJS_SAFE_DOC_OPTIONS = {
  disableFontFace: true,
  useSystemFonts: false,
  isEvalSupported: false,
  get standardFontDataUrl() {
    return assetDir('standard_fonts');
  },
  get cMapUrl() {
    return assetDir('cmaps');
  },
  cMapPacked: true,
};
