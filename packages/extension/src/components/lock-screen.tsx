import { cva } from 'class-variance-authority';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { toast } from 'sonner';

import { AppMark } from '@/components/app-mark';
import { NewPasswordFields } from '@/components/password-fields';
import { PasswordInput } from '@/components/password-input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { InputGroup, InputGroupInput } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { useLock } from '@/hooks/use-lock';
import { loadLock, resetExtension, resetPassword, unlock } from '@/lib/lock';
import {
  newPasswordProblem,
  passwordCopy,
  type PasswordProblem,
  submitted,
} from '@/lib/password';
import { touchSession } from '@/lib/vault';

export type LockScreenSize = 'popup' | 'page';

/** How often an open page checks whether auto-lock has passed. */
const CHECK_EVERY = 30_000;

/** Clicks and keys count as using the extension, at most this often. */
const TOUCH_EVERY = 30_000;

/** Keeps an unlocked page unlocked while it's used, and locks it once auto-lock passes. */
function useAutoLock(active: boolean) {
  useEffect(() => {
    if (!active) return undefined;

    let touchedAt = 0;

    function touch() {
      if (Date.now() - touchedAt < TOUCH_EVERY) return;

      touchedAt = Date.now();
      void touchSession();
    }

    // Opening a page counts as a use too.
    touch();

    const timer = setInterval(() => void loadLock(), CHECK_EVERY);

    addEventListener('pointerdown', touch);
    addEventListener('keydown', touch);

    return () => {
      clearInterval(timer);
      removeEventListener('pointerdown', touch);
      removeEventListener('keydown', touch);
    };
  }, [active]);
}

/** Shows the lock screen instead of `children` while the extension is locked. */
export function LockGate({
  size,
  children,
}: {
  size: LockScreenSize;
  children: ReactNode;
}) {
  const { state } = useLock();

  useAutoLock(state === 'unlocked');

  return state === 'locked' ? <LockScreen size={size} /> : children;
}

// The content centers with `my-auto`, so a form taller than the screen
// scrolls instead of losing its top.
const screenVariants = cva('flex flex-col items-center', {
  variants: {
    size: {
      // The popup's own size, so unlocking doesn't resize it.
      popup: 'h-[540px] w-[360px] overflow-y-auto px-8 py-6',
      page: 'min-h-dvh px-6 py-10',
    },
  },
});

type Mode = 'password' | 'recovery';

function LockScreen({ size }: { size: LockScreenSize }) {
  const [mode, setMode] = useState<Mode>('password');

  return (
    <main className={screenVariants({ size })}>
      <div className="my-auto flex w-full max-w-xs flex-col items-center gap-6">
        {mode === 'password' ? (
          <>
            <AppMark size="lg" />
            <PasswordForm onForgot={() => setMode('recovery')} />
          </>
        ) : (
          <RecoveryForm onBack={() => setMode('password')} />
        )}
      </div>
    </main>
  );
}

function Heading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-center">
      <h1 className="text-base font-semibold text-balance">{title}</h1>
      <p className="text-sm text-pretty text-muted-foreground">{description}</p>
    </div>
  );
}

function PasswordForm({ onForgot }: { onForgot: () => void }) {
  const id = useId();
  const [password, setPassword] = useState('');
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!password || busy) return;

    setBusy(true);

    try {
      // On success the gate swaps this screen out.
      if (await unlock(password)) return;

      setWrong(true);
    } catch (cause) {
      console.error('Could not unlock', cause);
      toast.error('Couldn’t unlock. Try again.');
    }

    setBusy(false);
  }

  return (
    <>
      <Heading
        title="Send to Telegram is locked"
        description="Enter your password to see your chats and send."
      />
      <form className="flex w-full flex-col gap-4" onSubmit={submitted(submit)}>
        <Field data-invalid={wrong}>
          <FieldLabel htmlFor={id}>Password</FieldLabel>
          <PasswordInput
            id={id}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setWrong(false);
            }}
            autoComplete="current-password"
            aria-invalid={wrong}
            autoFocus
          />
          {wrong ? <FieldError>{passwordCopy.wrongPassword}</FieldError> : null}
        </Field>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? <Spinner data-icon="inline-start" /> : null}
          Unlock
        </Button>
      </form>
      <p className="text-sm">
        <Button variant="link" size="text" tone="muted" onClick={onForgot}>
          Forgot your password?
        </Button>
      </p>
    </>
  );
}

function RecoveryForm({ onBack }: { onBack: () => void }) {
  const codeId = useId();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [problem, setProblem] = useState<PasswordProblem>();
  const [busy, setBusy] = useState(false);

  async function submit() {
    const found = newPasswordProblem(password, confirmation);

    setProblem(found);

    if (found || busy) return;

    setBusy(true);

    try {
      // On success the gate swaps this screen out.
      if (await resetPassword(code, password)) return;

      setProblem('wrong');
    } catch (cause) {
      console.error('Could not set a new password', cause);
      toast.error('Couldn’t set your new password. Try again.');
    }

    setBusy(false);
  }

  return (
    <>
      <Heading
        title="Choose a new password"
        description="Enter the recovery code you saved when you turned on the lock."
      />
      <form className="flex w-full flex-col gap-4" onSubmit={submitted(submit)}>
        <FieldGroup>
          <Field data-invalid={problem === 'wrong'}>
            <FieldLabel htmlFor={codeId}>Recovery code</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id={codeId}
                value={code}
                onChange={(event) => {
                  setCode(event.target.value);
                  setProblem(undefined);
                }}
                placeholder="XXXX-XXXX-XXXX-…"
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="characters"
                aria-invalid={problem === 'wrong'}
                autoFocus
                code
              />
            </InputGroup>
            {problem === 'wrong' ? (
              <FieldError>
                That recovery code didn’t work. Check it and try again.
              </FieldError>
            ) : null}
          </Field>
          <NewPasswordFields
            label="New password"
            description={passwordCopy.minimum}
            password={password}
            confirmation={confirmation}
            problem={problem}
            onPasswordChange={(value) => {
              setPassword(value);
              setProblem(undefined);
            }}
            onConfirmationChange={(value) => {
              setConfirmation(value);
              setProblem(undefined);
            }}
          />
        </FieldGroup>
        <Button type="submit" size="lg" disabled={busy || !code}>
          {busy ? <Spinner data-icon="inline-start" /> : null}
          Save password and unlock
        </Button>
      </form>
      <div className="flex flex-col items-center gap-2 text-sm">
        <Button variant="link" size="text" tone="muted" onClick={onBack}>
          Back to password
        </Button>
        <ResetButton />
      </div>
    </>
  );
}

function ResetButton() {
  const [resetting, setResetting] = useState(false);

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="link" size="text" tone="muted" />}
      >
        Lost the code too? Reset Send to Telegram
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset Send to Telegram?</AlertDialogTitle>
          <AlertDialogDescription>
            Without the password or recovery code, your chats, settings and
            history can’t be read. Resetting removes them from this browser and
            turns off the lock. It can’t be undone. Messages in Telegram stay.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={resetting}
            onClick={async () => {
              setResetting(true);
              await resetExtension();
              location.reload();
            }}
          >
            Reset everything
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
