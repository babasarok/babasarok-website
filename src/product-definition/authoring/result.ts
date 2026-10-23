export type CompileResult<T, TIssue> =
  { success: true; value: T } | { success: false; issues: TIssue[] };
