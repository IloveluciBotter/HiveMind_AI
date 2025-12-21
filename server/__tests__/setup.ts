// Test setup file
// Ensures TEST_MODE is set for all tests
process.env.NODE_ENV = "test";
process.env.TEST_MODE = "true";

// Suppress console logs in tests unless DEBUG is set
if (!process.env.DEBUG) {
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    // Only log errors and warnings in tests
    if (args[0]?.includes?.("error") || args[0]?.includes?.("warn")) {
      originalLog(...args);
    }
  };
}

