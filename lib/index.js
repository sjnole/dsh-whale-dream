// Integrated host services. Source and license details are retained in THIRD_PARTY_NOTICES.md.
import * as dream from './dream-host.js';
import * as info from './info/index.js';
import * as startup from './startup/host.mjs';
export const name = 'dsh-whale-dream';
export const inject = [...new Set([...dream.inject, ...info.inject, ...startup.inject])];
export function apply(ctx, config) { startup.apply(ctx); dream.apply(ctx); return info.apply(ctx, config); }
