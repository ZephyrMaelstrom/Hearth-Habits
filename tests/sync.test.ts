import { describe, expect, it } from 'vitest';
import { friendlyError } from '../src/store/sync';

const err = (code: string, message = code) => Object.assign(new Error(message), { code });

describe('sync error messages', () => {
  it('turns common Firebase setup mistakes into plain instructions', () => {
    expect(friendlyError(err('auth/unauthorized-domain'))).toMatch(/Authorized domains/);
    expect(friendlyError(err('auth/operation-not-allowed'))).toMatch(/enable Google/);
    expect(friendlyError(err('permission-denied', 'Missing or insufficient permissions.'))).toMatch(/firestore\.rules/);
    expect(friendlyError(err('not-found', 'The database (default) does not exist for project hearth-habits'))).toMatch(/Create database/);
    expect(friendlyError(err('auth/network-request-failed'))).toMatch(/still saved on this device/);
  });

  it('passes anything else through unchanged', () => {
    expect(friendlyError(new Error('Something odd'))).toBe('Something odd');
  });
});
