// Vercel Serverless Function entry point
// This file is the entry point for Vercel Serverless Functions
// It imports the Express app from server/index.js and exports it for Vercel

const app = require('../server/index.js');

// Export the Express app for Vercel Serverless Functions
module.exports = app;
