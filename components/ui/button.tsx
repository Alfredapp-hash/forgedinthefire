import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Forged Light buttons.
 *
 * Buttons *brighten* on hover rather than scaling or jumping — the motion
 * language echoes the hero flame, which glows rather than moves.
 */
const base =
  'glass-btn relative overflow-hidden transition-[background-color,border-color,box-shadow,color] duration-[220ms] ease-calm ' +
  '[&>*]:relative [&>*]:z-[1] active:translate-y-0';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold ' +
    // Ice blue ring rather than forged blue, so focus stays visible on blue surfaces.
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8DEBFF] ' +
    'focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070A] ' +
    'disabled:pointer-events-none disabled:opacity-50 ' +
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary: solid forged blue, near-black ink.
        default:
          `${base} glass-btn-sweep-light text-[#061016] border border-[#53D6FF] ` +
          'bg-[#53D6FF] hover:bg-[#82E8FF] hover:border-[#82E8FF] ' +
          'shadow-[0_0_24px_rgba(83,214,255,0.12)] hover:shadow-[0_0_40px_rgba(83,214,255,0.15)]',
        // Secondary: transparent with a cyan rim that fills faintly on hover.
        secondary:
          `${base} text-[#F6FAFC] border border-[rgba(83,214,255,0.45)] bg-transparent ` +
          'hover:bg-[rgba(83,214,255,0.08)] hover:border-[rgba(83,214,255,0.7)] ' +
          'hover:shadow-[0_0_28px_rgba(83,214,255,0.10)]',
        outline:
          `${base} glass-btn-sweep-warm text-[#8DEBFF] border border-[rgba(83,214,255,0.45)] ` +
          'bg-[rgba(17,22,28,0.55)] backdrop-blur-md ' +
          'hover:bg-[rgba(83,214,255,0.08)] hover:text-[#F6FAFC] hover:border-[rgba(83,214,255,0.7)] ' +
          'hover:shadow-[0_0_28px_rgba(83,214,255,0.10)]',
        ghost:
          `${base} text-[#B8C4CF] border border-transparent bg-transparent ` +
          'hover:bg-[rgba(83,214,255,0.06)] hover:text-[#F6FAFC] hover:border-[rgba(83,214,255,0.25)]',
        link:
          'relative text-[#53D6FF] underline-offset-4 hover:underline hover:text-[#8DEBFF] shadow-none border-0 bg-transparent overflow-visible',
        /**
         * Destructive uses ice-blue ink on a dark surface — never a warm fill —
         * so nothing competes with the heart. Always pair with an explicit verb
         * ("Delete") — never colour alone.
         */
        destructive:
          `${base} text-[#8DEBFF] border border-[rgba(141,235,255,0.45)] bg-[rgba(141,235,255,0.07)] ` +
          'hover:bg-[rgba(141,235,255,0.14)] hover:border-[rgba(141,235,255,0.7)] hover:text-[#B6F3FF]',
        /**
         * Emergency: maximum prominence for crisis/help CTAs, achieved with
         * brightness and a breathing rim rather than alarm red.
         */
        emergency:
          `${base} glass-btn-sweep-light text-[#061016] border border-[#8DEBFF] font-bold ` +
          'bg-[#8DEBFF] hover:bg-[#B6F3FF] ' +
          'shadow-[0_0_0_1px_rgba(141,235,255,0.4),0_0_36px_rgba(141,235,255,0.15)] animate-glow-pulse hover:animate-none',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-lg px-3 text-sm',
        lg: 'h-12 rounded-lg px-6 text-base min-h-11',
        icon: 'h-10 w-10',
        'icon-sm': 'h-8 w-8',
        'icon-lg': 'h-12 w-12',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
