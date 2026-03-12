import type { EffectHandler } from './types';

const applySpread = (
  vector: VectorNode,
  spread: number,
  parent: BaseNode & ChildrenMixin,
  index: number
): VectorNode => {
  if (spread === 0) return vector;

  vector.strokes = [
    {
      type: 'SOLID',
      color: { r: 0, g: 0, b: 0 },
      opacity: 1
    }
  ];
  vector.strokeWeight = Math.abs(spread);
  vector.strokeAlign = spread > 0 ? 'OUTSIDE' : 'INSIDE';

  const strokeOutline = vector.outlineStroke();

  if (strokeOutline === null) {
    console.error('applySpread failed');
    vector.strokes = [];
    return vector;
  }

  strokeOutline.x = vector.absoluteTransform[0][2] - spread;
  strokeOutline.y = vector.absoluteTransform[1][2] - spread;

  const union =
    spread > 0
      ? figma.union([vector, strokeOutline], parent, index)
      : figma.subtract([vector, strokeOutline], parent, index);
  return figma.flatten([union], parent, index);
};

const applyDropShadowToVector = async (vectorNode: VectorNode, shadow: DropShadowEffect) => {
  const { color, offset, radius, blendMode } = shadow;

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

  vectorNode.fills = [fillPaint];
  vectorNode.strokes = [];

  vectorNode.x += offset.x;
  vectorNode.y += offset.y;

  vectorNode.blendMode = blendMode;

  const hasBoundRadius = !!shadow.boundVariables?.radius;

  if (radius > 0 || hasBoundRadius) {
    let blurEffect: BlurEffect = {
      type: 'LAYER_BLUR',
      blurType: 'NORMAL',
      radius,
      visible: true
    };

    if (hasBoundRadius) {
      const variable = await figma.variables.getVariableByIdAsync(shadow.boundVariables!.radius!.id);
      if (variable) {
        blurEffect = figma.variables.setBoundVariableForEffect(blurEffect, 'radius', variable) as BlurEffect;
      }
    }

    vectorNode.effects = [blurEffect];
  }
};

export const dropShadowHandler: EffectHandler<DropShadowEffect> = {
  type: 'DROP_SHADOW',
  label: 'Shadow',

  getEffects(node) {
    return node.effects.filter((e): e is DropShadowEffect => e.type === 'DROP_SHADOW' && e.visible);
  },

  async apply(vector, effect, parent, index) {
    const spread = effect.spread;
    if (spread !== undefined && spread !== 0) {
      vector = applySpread(vector, spread, parent, index);
    }

    await applyDropShadowToVector(vector, effect);
    return vector;
  }
};
