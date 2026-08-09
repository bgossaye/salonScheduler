// apps/site/public/env.js
  window.ENV = {
    API_BASE: "https://rakie-backend.onrender.com",
    PING_PATH: "/ping",
    REVIEWS_PATH: "/api/google-reviews",  // <- add /api
    SERVICES_PATH: "/api/services",       // <- add /api
    WAKE_ON_LOAD: true,
    CACHE_TTL_MS: 5 * 60 * 1000,
    FORCE_LOCAL_SERVICES: false,
    FORCE_LOCAL_REVIEWS: false

  };
