// The Node calls vite.config.ts's dev-only plugins make, declared by hand
// rather than adding @types/node to a project whose own code runs only in
// a browser (Meeting Notes' arrangement).

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): unknown;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function writeFileSync(path: string, data: string): void;
}

declare module "node:path" {
  export function join(...paths: string[]): string;
}
