// eventListeners.ts - Event listening utilities for dark pool operations
// Based on new_inmp.md specification

import { Program } from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';

// ===== Event Type Definitions =====

export interface UserLedgerInitializedEvent {
  user: PublicKey;
  timestamp: BN;
}

export interface UserLedgerDepositedEvent {
  user: PublicKey;
  balanceNonce: BN; // 16 bytes as BN
  encryptedBalances: number[][]; // 4 chunks of 32 bytes each
  timestamp: BN;
}

export interface UserLedgerWithdrawVerifiedSuccessEvent {
  user: PublicKey;
  balanceNonce: BN;
  encryptedBalances: number[][];
  timestamp: BN;
}

export interface UserLedgerWithdrawVerifiedFailedEvent {
  user: PublicKey;
  timestamp: BN;
}

export interface OrderSubmittedCheckSuccessEvent {
  orderId: BN;
  user: PublicKey;
  success: boolean;
  timestamp: BN;
  orderNonce: BN;
}

export interface OrderSubmittedCheckFailedEvent {
  orderId: BN;
  user: PublicKey;
  timestamp: BN;
}

export interface OrderSubmittedEvent {
  orderId: BN;
  user: PublicKey;
  timestamp: BN;
}

export interface MatchesFoundEvent {
  numMatches: number;
  match1: number[]; // Encrypted match data
  match2: number[]; // Encrypted match data
  nonce: BN;
  timestamp: BN;
}

export interface OrderBookInitializedEvent {
  timestamp: BN;
}

export interface MatchingTriggeredEvent {
  timestamp: BN;
}

// Union type of all events
export type DarkPoolEvent =
  | UserLedgerInitializedEvent
  | UserLedgerDepositedEvent
  | UserLedgerWithdrawVerifiedSuccessEvent
  | UserLedgerWithdrawVerifiedFailedEvent
  | OrderSubmittedCheckSuccessEvent
  | OrderSubmittedCheckFailedEvent
  | OrderSubmittedEvent
  | MatchesFoundEvent
  | OrderBookInitializedEvent
  | MatchingTriggeredEvent;

// Event name mapping
export type EventName =
  | 'userLedgerInitializedEvent'
  | 'userLedgerDepositedEvent'
  | 'userLedgerWithdrawVerifiedSuccessEvent'
  | 'userLedgerWithdrawVerifiedFailedEvent'
  | 'orderSubmittedCheckSuccessEvent'
  | 'orderSubmittedCheckFailedEvent'
  | 'orderSubmittedEvent'
  | 'matchesFoundEvent'
  | 'orderBookInitializedEvent'
  | 'matchingTriggeredEvent';

// ===== Event Listener Utilities =====

/**
 * Await a specific event with timeout
 * Based on new_inmp.md lines 722-749
 */
export async function awaitEvent<T = DarkPoolEvent>(
  program: Program,
  eventName: EventName,
  timeoutMs: number = 60000
): Promise<T> {
  let listenerId: number | undefined;
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    const event = await new Promise<T>((resolve, reject) => {
      // Set up event listener
      listenerId = program.addEventListener(eventName, (event: T) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve(event);
      });

      // Set up timeout
      timeoutId = setTimeout(() => {
        reject(new Error(`Event ${eventName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return event;
  } finally {
    // Clean up listener
    if (listenerId !== undefined) {
      await program.removeEventListener(listenerId);
    }
  }
}

/**
 * Race between success and failure events
 * Useful for order submission check
 */
export async function awaitOrderCheckResult(
  program: Program,
  timeoutMs: number = 60000
): Promise<{ success: boolean; event: OrderSubmittedCheckSuccessEvent | OrderSubmittedCheckFailedEvent }> {
  const successPromise = awaitEvent<OrderSubmittedCheckSuccessEvent>(
    program,
    'orderSubmittedCheckSuccessEvent',
    timeoutMs
  );
  const failurePromise = awaitEvent<OrderSubmittedCheckFailedEvent>(
    program,
    'orderSubmittedCheckFailedEvent',
    timeoutMs
  );

  try {
    const event = await Promise.race([
      successPromise.then(e => ({ success: true, event: e })),
      failurePromise.then(e => ({ success: false, event: e })),
    ]);
    return event as { success: boolean; event: OrderSubmittedCheckSuccessEvent | OrderSubmittedCheckFailedEvent };
  } catch (error) {
    throw new Error(`Order check event timeout: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Race between withdrawal verify success and failure events
 */
export async function awaitWithdrawVerifyResult(
  program: Program,
  timeoutMs: number = 60000
): Promise<{ success: boolean; event: UserLedgerWithdrawVerifiedSuccessEvent | UserLedgerWithdrawVerifiedFailedEvent }> {
  const successPromise = awaitEvent<UserLedgerWithdrawVerifiedSuccessEvent>(
    program,
    'userLedgerWithdrawVerifiedSuccessEvent',
    timeoutMs
  );
  const failurePromise = awaitEvent<UserLedgerWithdrawVerifiedFailedEvent>(
    program,
    'userLedgerWithdrawVerifiedFailedEvent',
    timeoutMs
  );

  try {
    const event = await Promise.race([
      successPromise.then(e => ({ success: true, event: e })),
      failurePromise.then(e => ({ success: false, event: e })),
    ]);
    return event as { success: boolean; event: UserLedgerWithdrawVerifiedSuccessEvent | UserLedgerWithdrawVerifiedFailedEvent };
  } catch (error) {
    throw new Error(`Withdraw verify event timeout: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create a promise-based event listener
 * Returns a promise that resolves when the event is received
 */
export function createEventPromise<T = DarkPoolEvent>(
  program: Program,
  eventName: EventName,
  timeoutMs?: number
): Promise<T> {
  return awaitEvent<T>(program, eventName, timeoutMs);
}

/**
 * Listen to multiple events simultaneously
 * Returns the first event that fires
 */
export async function awaitAnyEvent<T = DarkPoolEvent>(
  program: Program,
  eventNames: EventName[],
  timeoutMs: number = 60000
): Promise<{ eventName: EventName; event: T }> {
  const promises = eventNames.map(name =>
    awaitEvent<T>(program, name, timeoutMs).then(event => ({ eventName: name, event }))
  );

  try {
    return await Promise.race(promises);
  } catch (error) {
    throw new Error(`All events timed out: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Set up a persistent event listener with callback
 * Returns a function to remove the listener
 */
export function listenToEvent<T = DarkPoolEvent>(
  program: Program,
  eventName: EventName,
  callback: (event: T) => void
): () => Promise<void> {
  const listenerId = program.addEventListener(eventName, callback);
  
  return async () => {
    await program.removeEventListener(listenerId);
  };
}

/**
 * Helper to extract balance nonce from event
 * Per new_inmp.md line 844-845
 */
export function extractBalanceNonce(event: UserLedgerDepositedEvent | UserLedgerWithdrawVerifiedSuccessEvent): Uint8Array {
  return Uint8Array.from(event.balanceNonce.toArray('le', 16));
}

/**
 * Helper to check if event indicates success
 */
export function isSuccessEvent(event: DarkPoolEvent): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return 'success' in event ? (event as any).success === true : !('timestamp' in event && Object.keys(event).length <= 3);
}

