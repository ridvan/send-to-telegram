import { useId } from 'react';

import { PasswordInput } from '@/components/password-input';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { passwordCopy, type PasswordProblem } from '@/lib/password';

/** A new password typed twice, with what's wrong with it under the field it's in. */
export function NewPasswordFields({
  label,
  description = passwordCopy.rule,
  password,
  confirmation,
  problem,
  onPasswordChange,
  onConfirmationChange,
  autoFocus = false,
}: {
  label: string;
  description?: string;
  password: string;
  confirmation: string;
  problem: PasswordProblem;
  onPasswordChange: (value: string) => void;
  onConfirmationChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  const id = useId();

  return (
    <>
      <Field data-invalid={problem === 'too-short'}>
        <FieldLabel htmlFor={`${id}-new`}>{label}</FieldLabel>
        <PasswordInput
          id={`${id}-new`}
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          autoComplete="new-password"
          aria-invalid={problem === 'too-short'}
          autoFocus={autoFocus}
        />
        {problem === 'too-short' ? (
          <FieldError>{passwordCopy.tooShort}</FieldError>
        ) : (
          <FieldDescription>{description}</FieldDescription>
        )}
      </Field>
      <Field data-invalid={problem === 'mismatch'}>
        <FieldLabel htmlFor={`${id}-confirm`}>Type it again</FieldLabel>
        <PasswordInput
          id={`${id}-confirm`}
          value={confirmation}
          onChange={(event) => onConfirmationChange(event.target.value)}
          autoComplete="new-password"
          aria-invalid={problem === 'mismatch'}
        />
        {problem === 'mismatch' ? (
          <FieldError>{passwordCopy.mismatch}</FieldError>
        ) : null}
      </Field>
    </>
  );
}
