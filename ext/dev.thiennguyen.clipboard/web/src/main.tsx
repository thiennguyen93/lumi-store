import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./panel.css";

// `pnpm dev` has no Lumi behind it: the mock answers the bridge with a
// history of its own. `import.meta.env.DEV` is a constant `false` in
// `pnpm build`, so the branch — and the mock module with it — is not in
// the bundle the store ships.
if (import.meta.env.DEV) {
  await import("./dev/mock");
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
