import type { EffectHandler } from './types';
import { dropShadowHandler } from './dropShadow';
import { innerShadowHandler } from './innerShadow';

/** All registered effect handlers. Add new handlers here. */
export const effectHandlers: EffectHandler[] = [dropShadowHandler, innerShadowHandler];

/** Set of effect types we can currently convert. */
export const supportedEffectTypes = new Set(effectHandlers.map((h) => h.type));

/** Map from effect type to human-readable label. */
export const effectLabelMap = new Map(effectHandlers.map((h) => [h.type, h.label]));

export type { EffectHandler } from './types';
