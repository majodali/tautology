/**
 * FixtureStore — reads and writes test fixture JSON files.
 *
 * Fixtures are stored as individual JSON files: <fixtureId>.fixture.json
 */

import { readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { TestFixture } from '@tautology/core';

export class FixtureStore {
  private outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  /**
   * Save a fixture to disk.
   */
  save(fixture: TestFixture): void {
    mkdirSync(this.outputDir, { recursive: true });
    const filePath = join(this.outputDir, `${fixture.fixtureId}.fixture.json`);
    writeFileSync(filePath, JSON.stringify(fixture, null, 2), 'utf-8');
  }

  /**
   * Load a fixture by ID.
   */
  load(fixtureId: string): TestFixture | null {
    const filePath = join(this.outputDir, `${fixtureId}.fixture.json`);
    try {
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as TestFixture;
    } catch {
      return null;
    }
  }

  /**
   * List all fixture IDs.
   */
  list(): string[] {
    try {
      return readdirSync(this.outputDir)
        .filter(f => f.endsWith('.fixture.json'))
        .map(f => f.replace('.fixture.json', ''));
    } catch {
      return [];
    }
  }

  /**
   * Load all fixtures.
   */
  loadAll(): TestFixture[] {
    return this.list()
      .map(id => this.load(id))
      .filter((f): f is TestFixture => f !== null);
  }

  /**
   * Delete a fixture by ID.
   */
  delete(fixtureId: string): boolean {
    const filePath = join(this.outputDir, `${fixtureId}.fixture.json`);
    try {
      unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the number of stored fixtures.
   */
  get count(): number {
    return this.list().length;
  }
}
