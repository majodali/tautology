/**
 * User service — orchestrates user operations using the repository and email service.
 */

import type { User } from '../models/user.js';
import * as userRepo from '../repositories/user-repository.js';
import * as emailService from '../services/email-service.js';

export function getUser(userId: string): User {
  const user = userRepo.findById(userId);
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }
  return user;
}

export function createUser(id: string, name: string, email: string): User {
  // Check for existing user
  const existing = userRepo.findById(id);
  if (existing) {
    throw new Error(`User already exists: ${id}`);
  }

  const user: User = {
    id,
    name,
    email,
    createdAt: new Date().toISOString(),
  };

  const saved = userRepo.save(user);
  emailService.sendWelcomeEmail(email, name);
  return saved;
}

export function updateUser(userId: string, updates: { name?: string; email?: string }): User {
  const user = userRepo.findById(userId);
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  const updated: User = {
    ...user,
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.email !== undefined ? { email: updates.email } : {}),
  };

  const saved = userRepo.save(updated);

  if (updates.email && updates.email !== user.email) {
    emailService.sendNotification(updates.email, 'Your email has been updated');
  }

  return saved;
}
