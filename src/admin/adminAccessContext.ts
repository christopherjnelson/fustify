import { createContext, useContext } from 'react';
import type { AdminAccessState } from './adminAccessState';

export interface AdminAccessContextValue {
  state: AdminAccessState;
  retry(): void;
}

export const AdminAccessContext = createContext<AdminAccessContextValue | null>(
  null,
);

export function useAdminAccess() {
  const value = useContext(AdminAccessContext);
  if (!value) {
    throw new Error('AdminAccessProvider is required for admin consumers.');
  }
  return value;
}
