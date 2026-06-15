"use client";

import { useEffect, useId, useState } from "react";
import {
  getLocalSuggestions,
  rememberLocalSuggestion,
  type SuggestionCategory,
} from "@/input-ux/localInputPreferences";

type InputSuggestionListProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "list"
> & {
  category: SuggestionCategory;
  value: string;
  onValueChange: (value: string) => void;
};

export function InputSuggestionList({
  category,
  value,
  onValueChange,
  onBlur,
  ...inputProps
}: InputSuggestionListProps) {
  const generatedId = useId().replace(/:/g, "");
  const listId = `suggestions-${category}-${generatedId}`;
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSuggestions(getLocalSuggestions(category));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [category]);

  return (
    <>
      <input
        {...inputProps}
        value={value}
        list={listId}
        onChange={(event) => onValueChange(event.target.value)}
        onBlur={(event) => {
          setSuggestions(rememberLocalSuggestion(category, event.target.value));
          onBlur?.(event);
        }}
      />
      <datalist id={listId} data-suggestion-category={category}>
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
    </>
  );
}
