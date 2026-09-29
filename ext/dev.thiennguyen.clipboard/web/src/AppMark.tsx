import { useState } from "react";
import { appIconUrl } from "./bridge";

/** Applications whose icon did not come — not installed any more, or a
 *  Lumi without the route. Asked once a page; every row after that goes
 *  straight to the name. */
const missing = new Set<string>();

/** Where a copy came from: the application's icon, its name on hover, or
 *  the name itself when there is no icon to show. */
export function AppMark({ app, name, withName = false }: { app: string | null; name: string | null; withName?: boolean }) {
  const [failed, setFailed] = useState(false);
  const label = name || app;
  if (!label) return null;
  const icon = app && !failed && !missing.has(app);
  if (!icon) return withName ? <>{label}</> : <span className="app">{label}</span>;
  return (
    <>
      <img
        className="app-icon"
        src={appIconUrl(app)}
        alt={withName ? "" : label}
        title={withName ? undefined : label}
        onError={() => {
          missing.add(app);
          setFailed(true);
        }}
      />
      {withName && label}
    </>
  );
}
