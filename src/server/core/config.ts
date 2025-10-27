import { config } from 'dotenv';
config();

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const DISPATCH_DEBUG_SPEED = parseNumber(process.env.DISPATCH_DEBUG_SPEED, 0);
