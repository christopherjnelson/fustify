import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../multiplayer/database.types';
import { fetchUsernameOptions, type UsernameOptions } from './profileApi';
import { profileDisplayNameSchema } from './profileModel';

export type UsernameAvailability =
  'unchecked' | 'checking' | 'available' | 'unavailable' | 'error';

export function UsernameField({
  client,
  value,
  onChange,
  onAvailabilityChange,
  autoFocus = false,
}: {
  client: SupabaseClient<Database>;
  value: string;
  onChange: Dispatch<SetStateAction<string>> | ((value: string) => void);
  onAvailabilityChange?: (availability: UsernameAvailability) => void;
  autoFocus?: boolean;
}) {
  const [options, setOptions] = useState<UsernameOptions | null>(null);
  const [availability, setAvailability] =
    useState<UsernameAvailability>('unchecked');
  const requestId = useRef(0);

  useEffect(() => {
    onAvailabilityChange?.(availability);
  }, [availability, onAvailabilityChange]);

  useEffect(() => {
    const parsed = profileDisplayNameSchema.safeParse(value);
    const nextRequestId = ++requestId.current;
    const statusTimer = window.setTimeout(() => {
      if (requestId.current !== nextRequestId) return;
      setOptions(null);
      setAvailability(parsed.success ? 'checking' : 'unchecked');
    }, 0);
    if (!parsed.success) {
      return () => window.clearTimeout(statusTimer);
    }
    const requestTimer = window.setTimeout(() => {
      void fetchUsernameOptions(client, parsed.data)
        .then((result) => {
          if (requestId.current !== nextRequestId) return;
          setOptions(result);
          setAvailability(result.available ? 'available' : 'unavailable');
        })
        .catch(() => {
          if (requestId.current !== nextRequestId) return;
          setOptions(null);
          setAvailability('error');
        });
    }, 300);
    return () => {
      window.clearTimeout(statusTimer);
      window.clearTimeout(requestTimer);
    };
  }, [client, value]);

  return (
    <div className="auth-username-field">
      <label className="auth-field">
        <span>Username</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={40}
          autoComplete="nickname"
          required
          autoFocus={autoFocus}
          aria-describedby="username-availability"
        />
      </label>
      <div
        id="username-availability"
        className={`auth-username-status auth-username-status-${availability}`}
        aria-live="polite"
      >
        {availability === 'checking' && 'Checking availability…'}
        {availability === 'available' && 'Username available.'}
        {availability === 'unavailable' && 'That username is already taken.'}
        {availability === 'error' &&
          'Availability could not be checked. It will be checked when you save.'}
      </div>
      {availability === 'unavailable' &&
        options &&
        options.suggestions.length > 0 && (
          <div className="auth-username-suggestions">
            <span>Try:</span>
            {options.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onChange(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
    </div>
  );
}
