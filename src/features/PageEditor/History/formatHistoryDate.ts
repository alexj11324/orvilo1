import { ABSOLUTE_DATE_TIME_FORMAT } from '@orvilo/utils/time';
import dayjs from 'dayjs';

export const formatHistoryAbsoluteTime = (savedAt: string) =>
  dayjs(savedAt).format(ABSOLUTE_DATE_TIME_FORMAT);

export const formatHistoryRowTime = (savedAt: string) => dayjs(savedAt).format('h:mm A');
