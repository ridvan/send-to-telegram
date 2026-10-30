import * as React from 'react';
import { Avatar as AvatarPrimitive } from '@base-ui/react/avatar';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';

function Avatar({
  className,
  size = 'default',
  ...props
}: AvatarPrimitive.Root.Props & {
  size?: 'default' | 'sm' | 'lg' | 'xl';
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        'group/avatar relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 data-[size=xl]:size-20 dark:after:mix-blend-lighten',
        className
      )}
      {...props}
    />
  );
}

function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn(
        'aspect-square size-full rounded-full object-cover',
        className
      )}
      {...props}
    />
  );
}

const avatarFallbackVariants = cva(
  'flex size-full items-center justify-center rounded-full text-sm group-data-[size=sm]/avatar:text-xs group-data-[size=xl]/avatar:text-2xl',
  {
    variants: {
      // An emoji stands in for the initials, drawn larger to read as a picture,
      // on a faint wash of the tone so the chat keeps its color.
      glyph: {
        initials: '',
        emoji:
          'text-lg leading-none group-data-[size=lg]/avatar:text-2xl group-data-[size=sm]/avatar:text-sm group-data-[size=xl]/avatar:text-5xl',
      },
      // Telegram colors chats it has no photo for; `tone` does the same.
      tone: {
        none: 'bg-muted text-muted-foreground',
        red: 'bg-linear-to-b from-tint-red to-tint-red-to font-semibold text-tint-foreground',
        orange:
          'bg-linear-to-b from-tint-orange to-tint-orange-to font-semibold text-tint-foreground',
        violet:
          'bg-linear-to-b from-tint-violet to-tint-violet-to font-semibold text-tint-foreground',
        green:
          'bg-linear-to-b from-tint-green to-tint-green-to font-semibold text-tint-foreground',
        cyan: 'bg-linear-to-b from-tint-cyan to-tint-cyan-to font-semibold text-tint-foreground',
        blue: 'bg-linear-to-b from-tint-blue to-tint-blue-to font-semibold text-tint-foreground',
        pink: 'bg-linear-to-b from-tint-pink to-tint-pink-to font-semibold text-tint-foreground',
      },
    },
    compoundVariants: [
      {
        glyph: 'emoji',
        tone: 'red',
        className: 'from-tint-red/30 to-tint-red-to/30',
      },
      {
        glyph: 'emoji',
        tone: 'orange',
        className: 'from-tint-orange/30 to-tint-orange-to/30',
      },
      {
        glyph: 'emoji',
        tone: 'violet',
        className: 'from-tint-violet/30 to-tint-violet-to/30',
      },
      {
        glyph: 'emoji',
        tone: 'green',
        className: 'from-tint-green/30 to-tint-green-to/30',
      },
      {
        glyph: 'emoji',
        tone: 'cyan',
        className: 'from-tint-cyan/30 to-tint-cyan-to/30',
      },
      {
        glyph: 'emoji',
        tone: 'blue',
        className: 'from-tint-blue/30 to-tint-blue-to/30',
      },
      {
        glyph: 'emoji',
        tone: 'pink',
        className: 'from-tint-pink/30 to-tint-pink-to/30',
      },
    ],
    defaultVariants: {
      tone: 'none',
      glyph: 'initials',
    },
  }
);

function AvatarFallback({
  className,
  tone,
  glyph,
  ...props
}: AvatarPrimitive.Fallback.Props &
  VariantProps<typeof avatarFallbackVariants>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(avatarFallbackVariants({ tone, glyph }), className)}
      {...props}
    />
  );
}

function AvatarBadge({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        'absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground bg-blend-color ring-2 ring-background select-none',
        'group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden',
        'group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2',
        'group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2',
        className
      )}
      {...props}
    />
  );
}

function AvatarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        'group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background',
        className
      )}
      {...props}
    />
  );
}

function AvatarGroupCount({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        'relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3',
        className
      )}
      {...props}
    />
  );
}

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  avatarFallbackVariants,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
};
