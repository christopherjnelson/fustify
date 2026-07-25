import { describe, expect, it } from 'vitest';
import { connectionStatusLabel } from './routeConnectionStatus';

describe('connectionStatusLabel', () => {
  it('keeps live, transitional, offline, and error states distinct', () => {
    expect(connectionStatusLabel('SUBSCRIBED')).toBe('Live');
    expect(connectionStatusLabel('CONNECTING')).toBe('Connecting…');
    expect(connectionStatusLabel('RETRYING')).toBe('Reconnecting…');
    expect(connectionStatusLabel('CLOSED')).toBe('Offline');
    expect(connectionStatusLabel('CHANNEL_ERROR')).toBe('Error');
  });
});
