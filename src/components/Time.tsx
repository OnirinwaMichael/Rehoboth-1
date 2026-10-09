import React from 'react';
import { fmtTime, useTimeFormat } from '../lib/timeFormat';

// Renders a date/time using the clinic's 12/24-hour setting and re-renders itself when the
// setting changes. Use 'HH:mm' / 'HH:mm:ss' in the pattern for the time part.
export const Time: React.FC<{ value: Date | string | number; pattern: string }> = ({ value, pattern }) => {
  useTimeFormat();
  return <>{fmtTime(value, pattern)}</>;
};
