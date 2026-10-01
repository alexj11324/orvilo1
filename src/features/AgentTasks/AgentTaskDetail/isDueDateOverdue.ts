const pad = (value: number) => String(value).padStart(2, '0');

/** Calendar-date compare. A due date is overdue only after that local day has ended. */
export const isDueDateOverdue = (dueDate: string, now = new Date()): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return false;
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return dueDate < today;
};
