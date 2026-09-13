// Runs once before each test file. A couple of modules read process.env at
// require-time (e.g. JWT_SECRET, various *_EXPIRES_MINUTES knobs), so these
// need to exist before anything under test gets imported.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-for-production';
process.env.NODE_ENV = 'test';
