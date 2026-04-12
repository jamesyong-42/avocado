/**
 * @vibecook/avocado-sdk — flagship entry.
 *
 * Re-exports the `core` session-management surface. Subpath entries cover
 * the other modules:
 *
 *   import { PTYSessionManager, TerminalServiceImpl } from '@vibecook/avocado-sdk';
 *   import * as types  from '@vibecook/avocado-sdk/types';
 *   import { LocalPTYSession }     from '@vibecook/avocado-sdk/node-pty';
 *   import { createUDSServer }     from '@vibecook/avocado-sdk/transport-ipc';
 *   import { PTYMeshBridge }       from '@vibecook/avocado-sdk/transport-truffle';
 *   import { AvocadoProvider }     from '@vibecook/avocado-sdk/react';
 */
export * from '#core';
export * from '#types';
