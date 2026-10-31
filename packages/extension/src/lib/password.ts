/** What the password lock's forms check and say about passwords. */

import type { FormEvent } from 'react';

import { MIN_PASSWORD_LENGTH } from './vault.ts';

const minimum = `At least ${MIN_PASSWORD_LENGTH} characters.`;

export const passwordCopy = {
  wrongPassword: 'That password didn’t work. Check it and try again.',
  tooShort: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  mismatch: 'The passwords don’t match. Type the same one in both fields.',
  minimum,
  rule: `${minimum} Without it or your recovery code, nothing here can be read.`,
};

/** A form's submit handler that runs `handler` instead of reloading the page. */
export function submitted(handler: () => Promise<void>) {
  return (event: FormEvent) => {
    event.preventDefault();
    void handler();
  };
}

/** Why a new password can't be used, or undefined when it can. */
export function newPasswordProblem(password: string, confirmation: string) {
  if (password.length < MIN_PASSWORD_LENGTH) return 'too-short';

  if (password !== confirmation) return 'mismatch';

  return undefined;
}

export type PasswordProblem = ReturnType<typeof newPasswordProblem> | 'wrong';
