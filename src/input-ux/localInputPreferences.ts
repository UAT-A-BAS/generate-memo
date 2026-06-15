export const INPUT_PREFERENCES_STORAGE_KEY = "memo-generator:input-preferences-v1";

export type SuggestionCategory =
  | "projectNames"
  | "positions"
  | "recipientNames"
  | "activityOwners"
  | "contactNames"
  | "contactEmails"
  | "signerNames"
  | "signerTitles"
  | "scenarioSections"
  | "scenarioPics"
  | "accessLinks"
  | "initials";

type InputPreferences = {
  version: 1;
  suggestions: Partial<Record<SuggestionCategory, string[]>>;
  profile?: LocalInputProfile;
};

export type LocalInputProfile = {
  bureau: Bureau;
  recipients: Array<Omit<Recipient, "id">>;
  contacts: Array<Omit<ContactRow, "id">>;
  signers: Array<Omit<SignerRow, "id">>;
  ccRecipients: Array<Omit<Recipient, "id">>;
  initials: string;
  initialsBureau: Bureau;
};

const EMPTY_PREFERENCES: InputPreferences = {
  version: 1,
  suggestions: {},
};

function readPreferences(): InputPreferences {
  if (typeof window === "undefined") return EMPTY_PREFERENCES;

  try {
    const stored = window.localStorage.getItem(INPUT_PREFERENCES_STORAGE_KEY);
    if (!stored) return EMPTY_PREFERENCES;
    const parsed = JSON.parse(stored) as Partial<InputPreferences>;
    return {
      version: 1,
      suggestions:
        parsed.suggestions && typeof parsed.suggestions === "object"
          ? parsed.suggestions
          : {},
      profile: parsed.profile,
    };
  } catch {
    window.localStorage.removeItem(INPUT_PREFERENCES_STORAGE_KEY);
    return EMPTY_PREFERENCES;
  }
}

export function getLocalInputProfile() {
  return readPreferences().profile;
}

export function saveLocalInputProfile(draft: MemoDraft) {
  if (typeof window === "undefined") return;

  const preferences = readPreferences();
  const stripId = <T extends { id: string }>({ id, ...value }: T) => {
    void id;
    return value;
  };

  const profile: LocalInputProfile = {
    bureau: draft.metadata.bureau,
    recipients: draft.recipients.map(stripId),
    contacts: draft.contacts.map(stripId),
    signers: draft.signers.map(stripId),
    ccRecipients: draft.ccRecipients.map(stripId),
    initials: draft.initials,
    initialsBureau: draft.initialsBureau,
  };

  window.localStorage.setItem(
    INPUT_PREFERENCES_STORAGE_KEY,
    JSON.stringify({ ...preferences, profile } satisfies InputPreferences),
  );
}

export function getLocalSuggestions(category: SuggestionCategory) {
  return readPreferences().suggestions[category] ?? [];
}

export function rememberLocalSuggestion(category: SuggestionCategory, rawValue: string) {
  if (typeof window === "undefined") return [];

  const value = rawValue.trim();
  if (!value) return getLocalSuggestions(category);

  const preferences = readPreferences();
  const existing = preferences.suggestions[category] ?? [];
  const normalized = value.toLocaleLowerCase("id-ID");
  const suggestions = [
    value,
    ...existing.filter(
      (item) => item.trim().toLocaleLowerCase("id-ID") !== normalized,
    ),
  ].slice(0, 12);

  window.localStorage.setItem(
    INPUT_PREFERENCES_STORAGE_KEY,
    JSON.stringify({
      ...preferences,
      suggestions: {
        ...preferences.suggestions,
        [category]: suggestions,
      },
    } satisfies InputPreferences),
  );

  return suggestions;
}
import type {
  Bureau,
  ContactRow,
  MemoDraft,
  Recipient,
  SignerRow,
} from "@/types/memo";
