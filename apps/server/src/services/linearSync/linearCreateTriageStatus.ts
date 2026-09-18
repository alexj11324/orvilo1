/**
 * Historical Linear imports keep existing workflow membership. Only live
 * inbound issues default to Team Triage (`untriaged` via TaskModel.create).
 */
export const linearCreateTriageStatus = (historicalImport: boolean) =>
  historicalImport ? ('accepted' as const) : undefined;
