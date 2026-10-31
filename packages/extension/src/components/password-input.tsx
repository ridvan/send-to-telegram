import { ViewIcon, ViewOffIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { type ComponentProps, useState } from 'react';

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';

/** A password field with a button that shows what was typed. */
export function PasswordInput(
  props: Omit<ComponentProps<typeof InputGroupInput>, 'type'>
) {
  const [shown, setShown] = useState(false);

  return (
    <InputGroup>
      <InputGroupInput
        type={shown ? 'text' : 'password'}
        spellCheck={false}
        autoCapitalize="off"
        {...props}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          onClick={() => setShown(!shown)}
        >
          <HugeiconsIcon
            icon={shown ? ViewOffIcon : ViewIcon}
            strokeWidth={1.8}
          />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
