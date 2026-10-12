import type { BetaStore } from "./store";
// Both local SQLite fixtures and deployed PostgreSQL use the same behavior/DTO contract.
export type BetaPersistence = {
  [K in keyof BetaStore]: BetaStore[K] extends (...args: infer A) => infer R
    ? K extends "hash" ? (...args: A) => R : (...args: A) => R | Promise<R> : BetaStore[K]
};
