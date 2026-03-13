import type { EffectHandler } from './types';
import { buildFillPaintFromShadow, convertToVector, solidPaint } from '../utils';

// FIXME: shadows for a frame of nodes will still fail, mask is not constructed correctly

const applySpread = (
  vector: VectorNode,
  spread: number,
  parent: BaseNode & ChildrenMixin,
  index: number
): VectorNode => {
  if (spread === 0) return vector;

  vector.strokes = [solidPaint];
  vector.strokeWeight = Math.abs(spread);
  vector.strokeAlign = spread > 0 ? 'INSIDE' : 'OUTSIDE';

  const strokeOutline = vector.outlineStroke();

  if (strokeOutline === null) {
    console.error('applySpread (inner shadow) failed');
    vector.strokes = [];
    return vector;
  }

  strokeOutline.x = vector.absoluteTransform[0][2] + (spread < 0 ? spread : 0);
  strokeOutline.y = vector.absoluteTransform[1][2] + (spread < 0 ? spread : 0);

  const result =
    spread > 0
      ? figma.subtract([vector, strokeOutline], parent, index)
      : figma.union([vector, strokeOutline], parent, index);
  return figma.flatten([result], parent, index);
};

const createPaddedFillRect = (
  node: SceneNode,
  padding: number,
  fillPaint: SolidPaint,
  parent: BaseNode & ChildrenMixin,
  index: number
): RectangleNode => {
  const rect = figma.createRectangle();
  rect.resize(node.width + padding * 2, node.height + padding * 2);
  rect.x = node.x - padding;
  rect.y = node.y - padding;
  rect.fills = [fillPaint];
  rect.strokes = [];
  parent.insertChild(index, rect);
  return rect;
};

export const innerShadowHandler: EffectHandler<InnerShadowEffect> = {
  type: 'INNER_SHADOW',
  label: 'Inner Shadow',
  placement: 'above',

  getEffects(node) {
    return node.effects.filter((e): e is InnerShadowEffect => e.type === 'INNER_SHADOW' && e.visible);
  },

  async apply(vector, effect, parent, index, originalNode) {
    const { offset, radius, blendMode } = effect;

    const fillPaint = await buildFillPaintFromShadow(effect);

    vector.x += offset.x;
    vector.y += offset.y;
    vector.fills = [solidPaint];
    vector.strokes = [];

    const spread = effect.spread;
    if (spread !== undefined && spread !== 0) {
      vector = applySpread(vector, spread, parent, index);
    }

    // Fill rectangle
    const padding = radius + Math.max(Math.abs(offset.x), Math.abs(offset.y)) + Math.abs(spread ?? 0);
    const fillRect = createPaddedFillRect(originalNode, padding, solidPaint, parent, index);

    // Mask layer
    const maskClone = originalNode.clone();
    maskClone.x = originalNode.absoluteTransform[0][2];
    maskClone.y = originalNode.absoluteTransform[1][2];
    const maskVector = convertToVector(maskClone, parent, index);

    maskVector.fills = [solidPaint];
    maskVector.strokes = [];
    maskVector.effects = [];
    maskVector.isMask = true;

    // Group all together to apply the original node shape as mask
    const maskedGroup = figma.group([maskVector, fillRect, vector], parent, index);

    // Create masked inner shadow from fill rectangle and shadow outline shape
    const subtraction = figma.subtract([fillRect, vector], maskedGroup);
    const flatSub = figma.flatten([subtraction]);

    flatSub.fills = [fillPaint];
    flatSub.blendMode = blendMode;

    // Apply layer blur if needed
    const hasBoundRadius = !!effect.boundVariables?.radius;
    if (radius > 0 || hasBoundRadius) {
      let blurEffect: BlurEffect = {
        type: 'LAYER_BLUR',
        blurType: 'NORMAL',
        radius,
        visible: true
      };

      if (hasBoundRadius) {
        const variable = await figma.variables.getVariableByIdAsync(effect.boundVariables!.radius!.id);
        if (variable) {
          blurEffect = figma.variables.setBoundVariableForEffect(blurEffect, 'radius', variable) as BlurEffect;
        }
      }

      flatSub.effects = [blurEffect];
    }

    return maskedGroup;
  }
};
