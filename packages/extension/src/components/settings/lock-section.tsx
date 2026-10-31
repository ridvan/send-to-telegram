import {
  Copy01Icon,
  Key01Icon,
  SquareLock02Icon,
  SquareUnlock02Icon,
  Timer02Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useId, useState } from 'react';
import { toast } from 'sonner';

import { NewPasswordFields } from '@/components/password-fields';
import { PasswordInput } from '@/components/password-input';
import { SettingRow, SettingsSection } from '@/components/setting-row';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useLock } from '@/hooks/use-lock';
import {
  changePassword,
  lockNow,
  setAutoLock,
  turnOffLock,
  turnOnLock,
} from '@/lib/lock';
import {
  newPasswordProblem,
  passwordCopy,
  type PasswordProblem,
  submitted,
} from '@/lib/password';
import { type AutoLock, autoLockSchema } from '@/lib/vault';

const autoLocks = {
  quit: {
    label: 'On quit',
    description: 'When you quit the browser, or the extension updates.',
  },
  '15m': {
    label: '15 min',
    description: '15 minutes after you last use it, or when you quit.',
  },
  '1h': {
    label: '1 hour',
    description: 'An hour after you last use it, or when you quit.',
  },
} satisfies Record<AutoLock, { label: string; description: string }>;

type Dialogs = 'turn-on' | 'change' | 'turn-off';

export function LockSection() {
  const { state, autoLock } = useLock();
  const [dialog, setDialog] = useState<Dialogs>();
  const close = () => setDialog(undefined);

  return (
    <SettingsSection
      id="lock"
      title="Password lock"
      description="Encrypts your chats, history and received messages in this browser."
    >
      {state === 'off' ? (
        <SettingRow
          icon={{ icon: SquareLock02Icon, tone: 'green' }}
          label="Lock with a password"
          description="Asks for it each time the browser starts or the extension updates, before anything can be sent or read."
          control={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialog('turn-on')}
            >
              Set password
            </Button>
          }
        />
      ) : (
        <>
          <SettingRow
            icon={{ icon: SquareLock02Icon, tone: 'green' }}
            label="Lock is on"
            description="Chats, history and received messages are encrypted."
            control={
              <Button
                variant="outline"
                size="sm"
                onClick={() => void lockNow()}
              >
                Lock now
              </Button>
            }
          />
          <SettingRow
            icon={{ icon: Timer02Icon, tone: 'blue' }}
            label="Lock automatically"
            wide
            description={autoLocks[autoLock ?? 'quit'].description}
            control={
              <ToggleGroup
                variant="segmented"
                size="sm"
                aria-label="Lock automatically"
                value={[autoLock ?? 'quit']}
                onValueChange={([next]) => {
                  const parsed = autoLockSchema.safeParse(next);

                  if (parsed.success) void setAutoLock(parsed.data);
                }}
              >
                {autoLockSchema.options.map((option) => (
                  <ToggleGroupItem key={option} value={option}>
                    {autoLocks[option].label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            }
          />
          <SettingRow
            icon={{ icon: Key01Icon, tone: 'violet' }}
            label="Password"
            control={
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialog('change')}
              >
                Change password
              </Button>
            }
          />
          <SettingRow
            icon={{ icon: SquareUnlock02Icon, tone: 'red' }}
            label="Turn off the lock"
            description="Stores everything unencrypted again."
            control={
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialog('turn-off')}
              >
                Turn off
              </Button>
            }
          />
        </>
      )}
      {dialog === 'turn-on' ? <TurnOnDialog onClose={close} /> : null}
      {dialog === 'change' ? <ChangeDialog onClose={close} /> : null}
      {dialog === 'turn-off' ? <TurnOffDialog onClose={close} /> : null}
    </SettingsSection>
  );
}

function TurnOnDialog({ onClose }: { onClose: () => void }) {
  const formId = useId();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [problem, setProblem] = useState<PasswordProblem>();
  const [busy, setBusy] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string>();
  const [saved, setSaved] = useState(false);

  async function submit() {
    const found = newPasswordProblem(password, confirmation);

    setProblem(found);

    if (found || busy) return;

    setBusy(true);

    try {
      setRecoveryCode(await turnOnLock(password));
    } catch (cause) {
      console.error('Could not turn on the lock', cause);
      toast.error('Couldn’t turn on the lock. Try again.');
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      // The code is shown only once; it closes from Done, after it's saved.
      onOpenChange={(open) => (open || recoveryCode ? undefined : onClose())}
      disablePointerDismissal={recoveryCode !== undefined}
    >
      <DialogContent showCloseButton={!recoveryCode}>
        {recoveryCode ? (
          <>
            <DialogHeader>
              <DialogTitle>Save your recovery code</DialogTitle>
              <DialogDescription>
                If you forget your password, this code is the only way back in.
                Keep it somewhere safe, such as a password manager. It won’t be
                shown again.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-start gap-2 rounded-lg border bg-muted/50 py-2 pr-2 pl-3">
              {/* Two rows of four groups, read and typed a group at a time. */}
              <code
                aria-label="Recovery code"
                className="grid flex-1 grid-cols-4 gap-x-3 gap-y-1 py-0.5 font-mono text-sm tracking-wide select-all"
              >
                {recoveryCode.split('-').map((group, index) => (
                  <span key={index}>{group}</span>
                ))}
              </code>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Copy recovery code"
                onClick={() =>
                  void navigator.clipboard.writeText(recoveryCode).then(
                    () => toast('Copied recovery code'),
                    () =>
                      toast.error(
                        'Couldn’t copy. Select the code and copy it yourself.'
                      )
                  )
                }
              >
                <HugeiconsIcon icon={Copy01Icon} strokeWidth={1.8} />
              </Button>
            </div>
            <Field orientation="horizontal">
              <Checkbox
                id={`${formId}-saved`}
                checked={saved}
                onCheckedChange={setSaved}
              />
              <FieldLabel htmlFor={`${formId}-saved`}>
                I saved my recovery code
              </FieldLabel>
            </Field>
            <DialogFooter>
              <Button disabled={!saved} onClick={onClose}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Set a password</DialogTitle>
              <DialogDescription>
                Your chats, history and received messages are encrypted with it.
                Telegram and the relay never see it.
              </DialogDescription>
            </DialogHeader>
            <form id={formId} onSubmit={submitted(submit)}>
              <FieldGroup>
                <NewPasswordFields
                  label="Password"
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
                  autoFocus
                />
              </FieldGroup>
            </form>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit" form={formId} disabled={busy}>
                {busy ? <Spinner data-icon="inline-start" /> : null}
                Turn on lock
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChangeDialog({ onClose }: { onClose: () => void }) {
  const formId = useId();
  const [current, setCurrent] = useState('');
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
      if (await changePassword(current, password)) {
        toast('Changed your password');
        onClose();

        return;
      }

      setProblem('wrong');
    } catch (cause) {
      console.error('Could not change the password', cause);
      toast.error('Couldn’t change your password. Try again.');
    }

    setBusy(false);
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Your recovery code stays the same.
          </DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={submitted(submit)}>
          <FieldGroup>
            <Field data-invalid={problem === 'wrong'}>
              <FieldLabel htmlFor={`${formId}-current`}>
                Current password
              </FieldLabel>
              <PasswordInput
                id={`${formId}-current`}
                value={current}
                onChange={(event) => {
                  setCurrent(event.target.value);
                  setProblem(undefined);
                }}
                autoComplete="current-password"
                aria-invalid={problem === 'wrong'}
                autoFocus
              />
              {problem === 'wrong' ? (
                <FieldError>{passwordCopy.wrongPassword}</FieldError>
              ) : null}
            </Field>
            <NewPasswordFields
              label="New password"
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
        </form>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button type="submit" form={formId} disabled={busy || !current}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            Change password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TurnOffDialog({ onClose }: { onClose: () => void }) {
  const formId = useId();
  const [password, setPassword] = useState('');
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;

    setBusy(true);

    try {
      if (await turnOffLock(password)) {
        toast('Turned off the lock');
        onClose();

        return;
      }

      setWrong(true);
    } catch (cause) {
      // The vault remembers the turn-off, so it finishes at the next unlock.
      console.error('Could not turn off the lock', cause);
      toast.error('Couldn’t turn off the lock. Try again.');
    }

    setBusy(false);
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Turn off the lock?</DialogTitle>
          <DialogDescription>
            Your chats, history and received messages are stored unencrypted
            again. Anyone who can open this browser can read them.
          </DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={submitted(submit)}>
          <Field data-invalid={wrong}>
            <FieldLabel htmlFor={`${formId}-password`}>Password</FieldLabel>
            <PasswordInput
              id={`${formId}-password`}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setWrong(false);
              }}
              autoComplete="current-password"
              aria-invalid={wrong}
              autoFocus
            />
            {wrong ? (
              <FieldError>{passwordCopy.wrongPassword}</FieldError>
            ) : null}
          </Field>
        </form>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            type="submit"
            form={formId}
            variant="destructive"
            disabled={busy || !password}
          >
            {busy ? <Spinner data-icon="inline-start" /> : null}
            Turn off lock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
