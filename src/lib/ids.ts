import { randomUUID } from 'expo-crypto';

export function newId(): string {
  return randomUUID();
}

export const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
