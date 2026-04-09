/**
 * In-memory user repository — simulates a database.
 */

import type { User } from '../models/user.js';

const store = new Map<string, User>();

export function seedUsers(): void {
  store.clear();
  store.set('user-1', { id: 'user-1', name: 'Alice', email: 'alice@example.com', createdAt: '2024-01-15T10:00:00Z' });
  store.set('user-2', { id: 'user-2', name: 'Bob', email: 'bob@example.com', createdAt: '2024-02-20T14:30:00Z' });
}

export function findById(id: string): User | null {
  return store.get(id) ?? null;
}

export function save(user: User): User {
  store.set(user.id, user);
  return user;
}

export function deleteUser(id: string): boolean {
  return store.delete(id);
}
