export type EffectType = Effect['type'];

const SUPPORTED_EFFECT_TYPES: ReadonlyArray<EffectType> = ['DROP_SHADOW'];

export const isSupportedVisibleEffect = (e: Effect) => SUPPORTED_EFFECT_TYPES.includes(e.type) && e.visible;

export function hasSupportedEffects(node: SceneNode): boolean {
  if (!('effects' in node)) return false;
  const { effects } = node;
  return effects.some((e: Effect) => isSupportedVisibleEffect(e));
}

export function hasSupportedEffectsDeep(node: SceneNode): boolean {
  if (hasSupportedEffects(node)) return true;
  if ('children' in node) {
    return node.children.some((child) => hasSupportedEffectsDeep(child as SceneNode));
  }
  return false;
}

export function getVisibleDropShadows(node: SceneNode & { effects: ReadonlyArray<Effect> }): DropShadowEffect[] {
  return node.effects.filter((e): e is DropShadowEffect => e.type === 'DROP_SHADOW' && e.visible);
}
