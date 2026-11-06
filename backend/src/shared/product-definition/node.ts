// Node-only entry: productRevision hashes with node:crypto, which must not
// reach the dashboard's browser bundle — the main barrel stays crypto-free.
export { productRevision } from "./revision.ts";
