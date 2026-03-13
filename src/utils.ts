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

export const solidPaint: SolidPaint = {
  type: 'SOLID',
  color: { r: 0, g: 0, b: 0 },
  opacity: 1
};

export const buildFillPaintFromShadow = async (shadow: InnerShadowEffect | DropShadowEffect): Promise<SolidPaint> => {
  const { color } = shadow;

  let fillPaint: SolidPaint = {
    type: 'SOLID',
    color: { r: color.r, g: color.g, b: color.b },
    opacity: color.a
  };

  if (shadow.boundVariables?.color) {
    const variable = await figma.variables.getVariableByIdAsync(shadow.boundVariables.color.id);
    if (variable) {
      fillPaint = figma.variables.setBoundVariableForPaint(fillPaint, 'color', variable);
    }
  }

  return fillPaint;
};

export const convertToVector = (node: SceneNode, parent: BaseNode & ChildrenMixin, index: number) => {
  if ('outlineStroke' in node) {
    const strokeOutline = (node as SceneNode & GeometryMixin).outlineStroke();
    if (strokeOutline !== null) {
      // Union fill geometry + stroke outline, then flatten to a single vector.
      const union = figma.union([node, strokeOutline], parent, index);
      return figma.flatten([union], parent, index);
    }
  }

  return figma.flatten([figma.union([node], parent, index)], parent, index);
};
