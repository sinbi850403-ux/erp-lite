import { hasSessionAccessToken, shouldAttemptProfileLoad } from './auth/session-guards.js';

function assertEqual(name, actual, expected) {
  const pass = Object.is(actual, expected);
  const icon = pass ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${name}`);
  if (!pass) {
    console.log(`  expected: ${JSON.stringify(expected)}`);
    console.log(`  actual:   ${JSON.stringify(actual)}`);
  }
  return pass;
}

function runAuthGuardRegressionTests() {
  console.log('=== Auth Guard Regression Tests ===');

  const cases = [
    {
      name: 'ctrl+f5 race: user exists but access_token missing => skip profile bootstrap',
      actual: shouldAttemptProfileLoad({ uid: 'u-1' }, { user: { id: 'u-1' } }),
      expected: false,
    },
    {
      name: 'blank access_token => skip profile bootstrap',
      actual: shouldAttemptProfileLoad({ uid: 'u-1' }, { access_token: '   ' }),
      expected: false,
    },
    {
      name: 'valid access_token + uid => allow profile bootstrap',
      actual: shouldAttemptProfileLoad({ uid: 'u-1' }, { access_token: 'token-123' }),
      expected: true,
    },
    {
      name: 'missing uid => skip profile bootstrap',
      actual: shouldAttemptProfileLoad({}, { access_token: 'token-123' }),
      expected: false,
    },
    {
      name: 'access token helper returns false for undefined',
      actual: hasSessionAccessToken(undefined),
      expected: false,
    },
    {
      name: 'access token helper returns true for non-empty token',
      actual: hasSessionAccessToken({ access_token: 'abc' }),
      expected: true,
    },
  ];

  let passed = 0;
  for (const testCase of cases) {
    if (assertEqual(testCase.name, testCase.actual, testCase.expected)) {
      passed += 1;
    }
  }

  const allPassed = passed === cases.length;
  console.log(`\nResult: ${passed}/${cases.length} passed`);
  if (!allPassed) {
    process.exitCode = 1;
  }
  return allPassed;
}

runAuthGuardRegressionTests();

