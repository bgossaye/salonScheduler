// public/env.js
(function () {
  const host = window.location.hostname;

  //const isLocal =
  //  host === "localhost" ||
  //  host === "127.0.0.1" ||
  //  host === "0.0.0.0" ||
  //  host.endsWith(".local");


const isLocal =
  host === "localhost" ||
  host === "127.0.0.1" ||
  host === "0.0.0.0" ||
  host.endsWith(".local") ||
  host.startsWith("192.168.") ||
  host.startsWith("10.");

  window.__ENV = {
    // ✅ Local dev hits local server
    // ✅ Production hits Render
    // API_BASE: isLocal ? "http://localhost:5000" : "https://rakie-backend.onrender.com",
    API_BASE: isLocal ? `http://${host}:5000` : "https://rakie-backend.onrender.com",
    // Keep if you use it elsewhere
    BASENAME: "/booking",
  };
})();
