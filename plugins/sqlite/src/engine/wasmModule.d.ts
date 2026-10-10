// A .wasm file imported by the worker: the build bundles its bytes with esbuild's binary loader, so nothing is fetched.
declare module "*.wasm" {
  const bytes: Uint8Array<ArrayBuffer>;
  export default bytes;
}
