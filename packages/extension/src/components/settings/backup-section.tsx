import { FileExportIcon, FileImportIcon } from '@hugeicons/core-free-icons';
import { useId, useRef, useState } from 'react';
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { useStore } from '@/hooks/use-store';
import {
  backupCopy,
  BackupError,
  backupFileName,
  type BackupProblem,
  createBackup,
  fullWithHistoryCopy,
  MAX_BACKUP_BYTES,
  type OpenedBackup,
  openBackup,
  previewRestore,
  type RestorePlan,
  restoreBackup,
} from '@/lib/backup';
import { formatFullDate, plural } from '@/lib/format';
import {
  newPasswordProblem,
  passwordCopy,
  type PasswordProblem,
  submitted,
} from '@/lib/password';
import { historyStore } from '@/lib/settings';
import { LockedError } from '@/lib/vault';

type Dialogs = 'back-up' | 'restore';

/** Says why, without logging the file or the password. */
function failed(action: string, cause: unknown) {
  if (cause instanceof LockedError || cause instanceof BackupError) {
    toast.error(cause.message);

    return;
  }

  console.error(
    `Could not ${action}`,
    cause instanceof Error ? cause.name : ''
  );
  toast.error(`Couldn’t ${action}. Try again.`);
}

export function BackupSection() {
  const [dialog, setDialog] = useState<Dialogs>();
  const close = () => setDialog(undefined);

  return (
    <SettingsSection
      id="backup"
      title="Backup"
      description="Saves your chats, with their bot tokens, settings and, if you like, history to a file encrypted with a password. Received messages and files aren’t included."
    >
      <SettingRow
        icon={{ icon: FileExportIcon, tone: 'blue' }}
        label="Back up to a file"
        description="For a new browser, another profile or after a reinstall."
        control={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialog('back-up')}
          >
            Back up
          </Button>
        }
      />
      <SettingRow
        icon={{ icon: FileImportIcon, tone: 'green' }}
        label="Restore from a file"
        description="Adds the backup’s chats and uses its settings."
        control={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialog('restore')}
          >
            Restore
          </Button>
        }
      />
      {dialog === 'back-up' ? <BackUpDialog onClose={close} /> : null}
      {dialog === 'restore' ? <RestoreDialog onClose={close} /> : null}
    </SettingsSection>
  );
}

/** Saves the text as a file, with no permission: the browser downloads the link. */
function saveFile(text: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' })
  );

  const link = document.createElement('a');

  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked once the download has had time to start; at once, Firefox can miss it.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function BackUpDialog({ onClose }: { onClose: () => void }) {
  const formId = useId();
  const history = useStore(historyStore);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [problem, setProblem] = useState<PasswordProblem>();
  const [withHistory, setWithHistory] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const found = newPasswordProblem(password, confirmation);

    setProblem(found);

    if (found || busy) return;

    setBusy(true);

    try {
      const text = await createBackup(password, { history: withHistory });
      const name = backupFileName();

      setPassword('');
      setConfirmation('');
      saveFile(text, name);
      toast(`Saved ${name}`);
      onClose();
    } catch (cause) {
      if (cause instanceof BackupError) {
        toast.error(
          withHistory
            ? 'This backup would be too large to restore. Untick Include history, then try again.'
            : 'This backup would be too large to restore. Remove the chat background photo, then try again.'
        );
      } else {
        failed('back up', cause);
      }

      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Back up to a file</DialogTitle>
          <DialogDescription>
            The file holds your bot tokens, so it’s encrypted with a password
            you choose here. Received messages and files aren’t included.
          </DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={submitted(submit)}>
          <FieldGroup>
            <NewPasswordFields
              label="Backup password"
              description={`${passwordCopy.minimum} Without it the backup can’t be opened, and there’s no way to recover it.`}
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
            <Field
              orientation="horizontal"
              data-disabled={history.length === 0}
            >
              <Checkbox
                id={`${formId}-history`}
                checked={withHistory}
                onCheckedChange={setWithHistory}
                disabled={history.length === 0}
              />
              <FieldLabel htmlFor={`${formId}-history`}>
                {plural(history.length, {
                  one: 'Include history (# item)',
                  other: 'Include history (# items)',
                })}
              </FieldLabel>
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button type="submit" form={formId} disabled={busy}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            Save backup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Opened = { backup: OpenedBackup; plan: RestorePlan };

/** Also offered on the welcome page, where a new browser starts. */
export function RestoreDialog({ onClose }: { onClose: () => void }) {
  const [opened, setOpened] = useState<Opened>();

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        {opened ? (
          <RestoreSummary opened={opened} onClose={onClose} />
        ) : (
          <OpenBackup onOpened={setOpened} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Problems with the file show under it; a wrong password, under the password. */
const fileProblems = new Set<BackupProblem>([
  'too-large',
  'not-backup',
  'newer',
  'unreadable',
]);

function OpenBackup({ onOpened }: { onOpened: (opened: Opened) => void }) {
  const formId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<BackupProblem>();
  const [busy, setBusy] = useState(false);

  const fileProblem =
    problem && fileProblems.has(problem) ? problem : undefined;

  const wrongPassword = problem === 'wrong-password';

  async function submit() {
    if (!file || !password || busy) return;

    if (file.size > MAX_BACKUP_BYTES) {
      setProblem('too-large');

      return;
    }

    setBusy(true);

    try {
      const backup = await openBackup(await file.text(), password);
      const plan = await previewRestore(backup);

      setPassword('');
      onOpened({ backup, plan });
    } catch (cause) {
      if (cause instanceof BackupError) setProblem(cause.problem);
      else failed('open the backup', cause);

      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Restore from a file</DialogTitle>
        <DialogDescription>
          You’ll see what’s in the backup before anything changes.
        </DialogDescription>
      </DialogHeader>
      <form id={formId} onSubmit={submitted(submit)}>
        <FieldGroup>
          <Field data-invalid={fileProblem !== undefined}>
            <FieldLabel htmlFor={`${formId}-file`}>Backup file</FieldLabel>
            <div className="flex min-w-0 items-center gap-3">
              <Button
                id={`${formId}-file`}
                variant="outline"
                size="sm"
                aria-invalid={fileProblem !== undefined}
                onClick={() => fileInput.current?.click()}
              >
                {file ? 'Choose another file' : 'Choose file'}
              </Button>
              {file ? (
                <span className="min-w-0 truncate text-sm">{file.name}</span>
              ) : null}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              hidden
              tabIndex={-1}
              onChange={(event) => {
                const picked = event.target.files?.[0];

                // Cleared, so picking the same file again still counts.
                event.target.value = '';

                if (picked) {
                  setFile(picked);
                  setProblem(undefined);
                }
              }}
            />
            {fileProblem ? (
              <FieldError>{backupCopy[fileProblem]}</FieldError>
            ) : (
              <FieldDescription>
                The file Back up saved, named send-to-telegram-backup and a
                date.
              </FieldDescription>
            )}
          </Field>
          <Field data-invalid={wrongPassword}>
            <FieldLabel htmlFor={`${formId}-password`}>
              Backup password
            </FieldLabel>
            <PasswordInput
              id={`${formId}-password`}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setProblem(undefined);
              }}
              autoComplete="off"
              aria-invalid={wrongPassword}
            />
            {wrongPassword ? (
              <FieldError>{backupCopy['wrong-password']}</FieldError>
            ) : (
              <FieldDescription>
                The one you chose when you backed up, not the lock’s.
              </FieldDescription>
            )}
          </Field>
        </FieldGroup>
      </form>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button
          type="submit"
          form={formId}
          disabled={busy || !file || !password}
        >
          {busy ? <Spinner data-icon="inline-start" /> : null}
          Open backup
        </Button>
      </DialogFooter>
    </>
  );
}

function chatsLine({ added, kept }: RestorePlan): string {
  const adds = plural(added, { one: 'Adds # chat.', other: 'Adds # chats.' });

  const stays = plural(kept, {
    one: '# is already here and stays as it is.',
    other: '# are already here and stay as they are.',
  });

  if (added > 0 && kept > 0) return `${adds} ${stays}`;

  if (added > 0) return adds;

  if (kept > 0) {
    return plural(kept, {
      one: 'Its chat is already here and stays as it is.',
      other: 'All # chats are already here and stay as they are.',
    });
  }

  return 'The backup has no chats.';
}

function historyLine(backup: OpenedBackup, plan: RestorePlan): string {
  if (!backup.history) return 'History wasn’t included in this backup.';

  if (plan.historyAdded === 0) return 'Its history is already here.';

  return plural(plan.historyAdded, {
    one: 'Adds # history item to yours.',
    other: 'Adds # history items to yours.',
  });
}

function RestoreSummary({
  opened: { backup, plan },
  onClose,
}: {
  opened: Opened;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function restore() {
    setBusy(true);

    try {
      await restoreBackup(backup);
      toast('Restored your backup');
      onClose();
    } catch (cause) {
      if (
        cause instanceof BackupError &&
        cause.problem === 'full' &&
        backup.history
      ) {
        toast.error(fullWithHistoryCopy);
      } else {
        failed('restore the backup', cause);
      }

      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Restore this backup?</DialogTitle>
        <DialogDescription>
          {`Backed up ${formatFullDate(backup.createdAt)}.`}
        </DialogDescription>
      </DialogHeader>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-pretty">
        <li>{chatsLine(plan)}</li>
        <li>
          Replaces your settings here with the backup’s: messages, hashtags,
          history, appearance and privacy.
        </li>
        <li>{historyLine(backup, plan)}</li>
      </ul>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button disabled={busy} onClick={() => void restore()}>
          {busy ? <Spinner data-icon="inline-start" /> : null}
          Restore backup
        </Button>
      </DialogFooter>
    </>
  );
}
