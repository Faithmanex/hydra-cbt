// Vercel serverless entry — forwards all /api requests to the Express app
// Build must run first: `npm run build` creates server/dist and client/dist
let app;
try {
  // Try compiled server (production)
  app = require("../server/dist/index.js").default || require("../server/dist/index.js");
} catch (e) {
  // Fallback for local dev if dist not built yet (should not happen on Vercel)
  console.error("Failed to load server/dist/index.js, trying server/index.ts fallback", e);
  throw e;
}

module.exports = app;
module.exports.default = app;
