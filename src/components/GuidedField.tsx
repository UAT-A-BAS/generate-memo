"use client";

import { createContext, useContext, useMemo } from "react";

export type GuidedFieldIssue = {
  id: string;
  label: string;
  message: string;
};

type ValidationContextValue = {
  issues: Map<string, GuidedFieldIssue>;
  touchedFieldIds: Set<string>;
  showAll: boolean;
};

const ValidationContext = createContext<ValidationContextValue>({
  issues: new Map(),
  touchedFieldIds: new Set(),
  showAll: false,
});

export function GuidedFieldValidationProvider({
  issues,
  touchedFieldIds,
  showAll,
  children,
}: {
  issues: GuidedFieldIssue[];
  touchedFieldIds: Set<string>;
  showAll: boolean;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({
      issues: new Map(issues.map((issue) => [issue.id, issue])),
      touchedFieldIds,
      showAll,
    }),
    [issues, showAll, touchedFieldIds],
  );

  return (
    <ValidationContext.Provider value={value}>
      {children}
    </ValidationContext.Provider>
  );
}

export function GuidedField({
  label,
  children,
  required = false,
  fieldId,
  helper,
  asGroup = false,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  fieldId?: string;
  helper?: string;
  asGroup?: boolean;
  className?: string;
}) {
  const validation = useContext(ValidationContext);
  const issue = fieldId ? validation.issues.get(fieldId) : undefined;
  const showIssue = Boolean(
    issue &&
      fieldId &&
      (validation.showAll || validation.touchedFieldIds.has(fieldId)),
  );
  const Root = asGroup ? "div" : "label";

  return (
    <Root
      className={`grid content-start gap-1 text-[13px] font-semibold text-slate-700 ${className}`}
      data-field-id={fieldId}
      data-required-field={required ? "true" : undefined}
      data-field-invalid={showIssue ? "true" : undefined}
      aria-invalid={showIssue || undefined}
    >
      <span>
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      {children}
      {helper && !showIssue ? (
        <span className="text-xs font-normal leading-4 text-slate-500">{helper}</span>
      ) : null}
      {showIssue ? (
        <span className="text-xs font-semibold leading-4 text-rose-600" role="alert">
          {issue?.message}
        </span>
      ) : null}
    </Root>
  );
}
