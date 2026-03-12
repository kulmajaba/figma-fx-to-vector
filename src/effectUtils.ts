export type EffectType = Effect['type'];

const SUPPORTED_EFFECT_TYPES: ReadonlyArray<EffectType> = ['DROP_SHADOW'];

export const isSupportedVisibleEffect = (e: Effect) => SUPPORTED_EFFECT_TYPES.includes(e.type) && e.visible;

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

export const getVisibleDropShadows = (node: SceneNode & { effects: ReadonlyArray<Effect> }): DropShadowEffect[] => {
  return node.effects.filter((e): e is DropShadowEffect => e.type === 'DROP_SHADOW' && e.visible);
};
