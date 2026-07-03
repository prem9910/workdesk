// Vercel Serverless Function entry point
// This file is the entry point for Vercel Serverless Functions
// It imports the Express app from server/index.js and creates a handler for Vercel

const app = require('../server/index.js');

// Create a handler function for Vercel Serverless Functions
// This wraps the Express app to work with Vercel's serverless environment
module.exports = (req, res) => {
  // Remove the /api prefix from the path for the Express app
  req.url = req.url.replace(/^\/api/, '');
  return app(req, res);
};
