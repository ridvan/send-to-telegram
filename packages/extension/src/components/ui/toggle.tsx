import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';

const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-1 rounded-lg text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow] outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-pressed:bg-muted data-[state=on]:bg-muted dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline: 'border border-input bg-transparent hover:bg-muted',
        // Options in a sunken track; the chosen one is raised. Pair with
        // ToggleGroup's segmented variant, which draws the track.
        segmented:
          'rounded-md bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-xs dark:aria-pressed:bg-input/60',
        // A hashtag; chosen, it takes the message bubble's colors.
        chip: 'border border-input bg-transparent hover:bg-transparent not-aria-pressed:hover:bg-muted aria-pressed:border-bubble-accent/30 aria-pressed:bg-bubble aria-pressed:text-bubble-accent',
        // An on/off icon beside a field; on, it takes the brand color.
        accent:
          'bg-transparent text-muted-foreground aria-pressed:bg-transparent aria-pressed:text-brand aria-pressed:hover:bg-muted',
        // A picture to pick, such as an avatar; chosen, it gets a ring.
        swatch:
          'rounded-full bg-transparent p-0.5 hover:bg-transparent aria-pressed:bg-transparent aria-pressed:ring-2 aria-pressed:ring-primary',
        // A wider picture to pick, such as a chat background.
        tile: 'rounded-xl bg-transparent p-0.5 hover:bg-transparent aria-pressed:bg-transparent aria-pressed:ring-2 aria-pressed:ring-primary',
      },
      size: {
        default:
          'h-8 min-w-8 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        sm: "h-7 min-w-7 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        icon: 'size-8',
        lg: 'h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        // An emoji to pick, drawn at the size it reads as a picture.
        glyph: 'size-9 text-xl leading-none',
        // Fits the avatar inside, whatever its size.
        fit: 'size-auto',
      },
    },
    compoundVariants: [
      { variant: 'segmented', className: 'rounded-md' },
      { variant: 'chip', className: 'rounded-full' },
      { variant: 'swatch', className: 'rounded-full' },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Toggle({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
