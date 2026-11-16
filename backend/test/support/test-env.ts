// Environment for integration and e2e tests. Values are test-only.
const key = Buffer.alloc(32, 7).toString('base64');
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgres://two_cents:two_cents@localhost:5443/two_cents_test',
  JWT_SECRET: key,
  TOKEN_ENCRYPTION_KEY: key,
  IP_HASH_KEY: key,
  SMTP_URL: 'smtp://localhost:1025',
  MAIL_FROM: 'Two Cents <no-reply@test.local>',
  APP_LINK_BASE_URL: 'https://links.test',
  APPLE_BUNDLE_ID: 'app.twocents.test',
  APPLE_TEAM_ID: 'TEAMID',
  APPLE_KEY_ID: 'KEYID',
  GOOGLE_WEB_CLIENT_ID: 'web-client.apps.googleusercontent.com',
});
