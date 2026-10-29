import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';

const kbdVariants = cva('', {
  variants: {
    variant: {
      default: '',
      // Sits on a primary button, so it takes the button's colors.
      button:
        'bg-primary-foreground/15 text-primary-foreground/75 dark:bg-primary-foreground/10',
    },
  },
});

function Kbd({
  className,
  variant,
  ...props
}: React.ComponentProps<'kbd'> & VariantProps<typeof kbdVariants>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=tooltip-content]:text-background dark:in-data-[slot=tooltip-content]:bg-background/10 [&_svg:not([class*='size-'])]:size-3",
        kbdVariants({ variant }),
        className
      )}
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn('inline-flex items-center gap-1', className)}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
