import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const glassBase =
  'glass-btn relative overflow-hidden transition-[transform,box-shadow] duration-[220ms] ' +
  'hover:-translate-y-0.5 active:scale-[0.97] active:translate-y-0 ' +
  '[&>*]:relative [&>*]:z-[1]';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forge-600/55 ' +
    'focus-visible:ring-offset-2 focus-visible:ring-offset-[#241B18] ' +
    'disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 disabled:active:scale-100 ' +
    '[&_svg]:pointer-events-none [&_svg:not([class*=\'size-\'])]:size-4 shrink-0 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          `${glassBase} glass-btn-sweep-light text-[#F6F0E8] border border-white/20 ` +
          'bg-gradient-to-br from-[rgba(30,107,115,0.94)] to-[rgba(15,79,87,0.98)] ' +
          'shadow-[0_1px_0_rgba(255,255,255,0.14)_inset,0_1px_2px_rgba(0,0,0,0.38),0_4px_24px_rgba(30,107,115,0.35)] ' +
          'hover:shadow-[0_1px_0_rgba(255,255,255,0.22)_inset,0_2px_4px_rgba(0,0,0,0.42),0_8px_32px_rgba(76,154,163,0.42)]',
        destructive:
          `${glassBase} glass-btn-sweep-light text-white border border-white/18 ` +
          'bg-gradient-to-br from-[rgba(193,18,31,0.94)] to-[rgba(157,2,8,0.98)] ' +
          'shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_1px_2px_rgba(0,0,0,0.35),0_4px_20px_rgba(193,18,31,0.35)] ' +
          'hover:shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_8px_28px_rgba(217,4,41,0.42)]',
        outline:
          `${glassBase} glass-btn-sweep-warm text-[#C8A46B] border border-[#8B5E3C]/38 ` +
          'bg-gradient-to-b from-[rgba(58,42,36,0.62)] to-[rgba(36,27,24,0.78)] backdrop-blur-md ' +
          'shadow-[0_1px_0_rgba(255,255,255,0.09)_inset,0_1px_2px_rgba(0,0,0,0.28),0_4px_20px_rgba(139,94,60,0.14)] ' +
          'hover:border-[#8B5E3C]/55 hover:shadow-[0_1px_0_rgba(255,255,255,0.14)_inset,0_8px_28px_rgba(139,94,60,0.22)]',
        secondary:
          `${glassBase} glass-btn-sweep-light text-[#F6F0E8] border border-white/15 ` +
          'bg-gradient-to-br from-[rgba(76,154,163,0.88)] to-[rgba(30,107,115,0.95)] ' +
          'shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_4px_20px_rgba(30,107,115,0.28)] ' +
          'hover:shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_8px_28px_rgba(76,154,163,0.38)]',
        ghost:
          `${glassBase} glass-btn-sweep-light text-[#F6F0E8] border border-white/22 ` +
          'bg-white/[0.06] backdrop-blur-sm ' +
          'shadow-[0_1px_0_rgba(255,255,255,0.11)_inset,0_2px_14px_rgba(0,0,0,0.24)] ' +
          'hover:border-white/35 hover:bg-white/[0.10] ' +
          'hover:shadow-[0_1px_0_rgba(255,255,255,0.16)_inset,0_4px_22px_rgba(0,0,0,0.32)]',
        link:
          'relative text-[#4C9AA3] underline-offset-4 hover:underline shadow-none border-0 bg-transparent ' +
          'hover:translate-y-0 active:scale-100 overflow-visible',
        emergency:
          `${glassBase} glass-btn-sweep-light text-white border border-white/20 font-semibold ` +
          'bg-gradient-to-br from-[rgba(193,18,31,0.96)] to-[rgba(157,2,8,0.98)] ' +
          'shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_4px_20px_rgba(193,18,31,0.4)] animate-pulse hover:animate-none',
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
