import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';
import Link from 'next/link';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const cls = (variant: Variant, size: Size, extra?: string) =>
  ['btn', `btn--${variant}`, `btn--${size}`, extra].filter(Boolean).join(' ');

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size; href: string }) {
  return <a className={cls(variant, size, className)} {...rest} />;
}

export function ButtonNextLink({
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={cls(variant, size, className)} {...rest} />;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={cls(variant, size, className)} {...rest} />;
}
