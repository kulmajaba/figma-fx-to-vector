import { supportedEffectTypes } from './effects';

export type EffectType = Effect['type'];

export const isSupportedVisibleEffect = (e: Effect) => supportedEffectTypes.has(e.type) && e.visible;

export const hasSupportedEffects = (node: SceneNode) => {
  if (!('effects' in node)) return false;
  const { effects } = node;
  return effects.some((e: Effect) => isSupportedVisibleEffect(e));
};

export const hasSupportedEffectsDeep = (node: SceneNode): boolean => {
  if (hasSupportedEffects(node)) return true;
  if ('children' in node) {
    return node.children.some((child) => hasSupportedEffectsDeep(child));
  }
  return false;
};
