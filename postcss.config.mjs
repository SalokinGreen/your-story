// During test runs we avoid loading PostCSS plugins (they may be missing in test
// environments). Vitest sets NODE_ENV=test, so return an empty plugin set there.
const isTest = process.env.NODE_ENV === "test";

const config = isTest
  ? { plugins: {} }
  : {
      // Tailwind CSS v4 requires @tailwindcss/postcss plugin
      plugins: {
        "@tailwindcss/postcss": {},
      },
    };

export default config;
