import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function BookingHandoff() {
  const loc = useLocation();

  useEffect(() => {
    const suffix = loc.pathname.replace(/^\/booking/, "") + loc.search + loc.hash;
    const isLocalSite = ["localhost", "127.0.0.1"].includes(window.location.hostname);

    // The marketing site runs on :3000 and the booking app on :3001 in local testing.
    // Preserve the full path, query string (promo/service/token), and hash during handoff.
    const target = isLocalSite
      ? `${window.location.protocol}//${window.location.hostname}:3001/booking${suffix}`
      : `/booking${suffix}`;

    window.location.replace(target);
  }, [loc.pathname, loc.search, loc.hash]);

  return null;
}
