// Vercel Serverless Function entry point
// This file is the entry point for Vercel Serverless Functions

const app = require('../server/index.js');

// Export the Express app wrapped for Vercel Serverless Functions
// Vercel expects a function that handles (req, res)
module.exports = (req, res) => {
  // Remove /api prefix from URL before passing to Express
  const originalUrl = req.url;
  req.url = originalUrl.replace(/^\/api/, '');

  // Also update the path for Express router to work correctly
  if (req.url === '') req.url = '/';

  return app(req, res);
};
