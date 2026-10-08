import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { cn } from '@autoparts/utils';

const baseField =
  'w-full rounded-input border border-input bg-card px-3 py-2 text-sm text-foreground ' +
  'placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  'dark:placeholder:text-muted-foreground';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { error?: string }>(
  ({ className, error, ...props }, ref) => (
    <>
      <input ref={ref} className={cn(baseField, error && 'border-danger', className)} {...props} />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </>
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string }>(
  ({ className, error, ...props }, ref) => (
    <>
      <textarea ref={ref} rows={4} className={cn(baseField, error && 'border-danger', className)} {...props} />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </>
  ),
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { error?: string }>(
  ({ className, error, children, ...props }, ref) => (
    <>
      <select ref={ref} className={cn(baseField, 'pr-8', error && 'border-danger', className)} {...props}>
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </>
  ),
);
Select.displayName = 'Select';

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string }>(
  ({ className, label, id, ...props }, ref) => (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className={cn('h-4 w-4 rounded border-input text-primary focus:ring-primary/30', className)}
        {...props}
      />
      {label}
    </label>
  ),
);
Checkbox.displayName = 'Checkbox';

export const Switch = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) => (
  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-card shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
    {label}
  </label>
);
