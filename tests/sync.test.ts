import { describe, expect, it } from 'vitest';
import { friendlyError } from '../src/store/sync';

const err = (code: string, message = code) => Object.assign(new Error(message), { code });

describe('sync error messages', () => {
  it('turns common Firebase setup mistakes into plain instructions', () => {
    expect(friendlyError(err('auth/unauthorized-domain'))).toMatch(/Authorized domains/);
    expect(friendlyError(err('auth/operation-not-allowed'))).toMatch(/Sign-in method → Google → Enable/);
    expect(friendlyError(err('permission-denied', 'Missing or insufficient permissions.'))).toMatch(/firestore\.rules/);
    expect(friendlyError(err('not-found', 'The database (default) does not exist for project hearth-habits'))).toMatch(/named \(default\)/);
    expect(friendlyError(err('unavailable', 'Failed to get document because the client is offline.'))).toMatch(/still saved on this device/);
  });

  it('treats an unfinished Authentication setup as a sign-in problem, not a database one', () => {
    const m = friendlyError(err('auth/configuration-not-found', 'Firebase: Error (auth/configuration-not-found).'));
    expect(m).toMatch(/Authentication/);
    expect(m).not.toMatch(/Firestore/);
    expect(m).toMatch(/\[auth\/configuration-not-found\]$/);
  });

  it('passes anything else through unchanged', () => {
    expect(friendlyError(new Error('Something odd'))).toBe('Something odd');
  });
});
