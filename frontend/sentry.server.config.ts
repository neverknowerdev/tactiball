// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://e67a94af0265881186ca7822aaf821d4@o4510025100754944.ingest.de.sentry.io/4510025102786640",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Environment configuration
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',

  // Integrations to capture console errors
  integrations: [
    Sentry.consoleIntegration({
      levels: ['error'],
    }),
  ],
});

// Intercept console.error and send to Sentry
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  // Call original console.error first
  originalConsoleError.apply(console, args);

  // Extract error object if present
  const errorArg = args.find(arg => arg instanceof Error);

  if (errorArg) {
    // If we have an Error object, capture it
    Sentry.captureException(errorArg, {
      tags: {
        source: 'console.error',
      },
      extra: {
        consoleArgs: args.filter(arg => !(arg instanceof Error)),
      },
    });
  } else {
    // Otherwise, capture as a message
    const message = args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');

    Sentry.captureMessage(message, {
      level: 'error',
      tags: {
        source: 'console.error',
      },
    });
  }
};
