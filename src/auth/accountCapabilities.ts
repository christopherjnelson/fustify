export type AccountCapabilities = {
  canCustomizeProfile: boolean;
  canReact: boolean;
  canChat: boolean;
};

const GUEST_CAPABILITIES: AccountCapabilities = {
  canCustomizeProfile: false,
  canReact: false,
  canChat: false,
};

const REGISTERED_CAPABILITIES: AccountCapabilities = {
  canCustomizeProfile: true,
  canReact: true,
  canChat: true,
};

export function accountCapabilities(isAnonymous: boolean): AccountCapabilities {
  return isAnonymous ? GUEST_CAPABILITIES : REGISTERED_CAPABILITIES;
}

/**
 * This model controls presentation only. Future chat writes must repeat the
 * registered-user check in a trusted server-side boundary.
 */
export function canPresentRegisteredAccountActions(isAnonymous: boolean) {
  return accountCapabilities(isAnonymous);
}
