import t from './strings';

type EffectType = Effect['type'];

// MVP: drop shadow only
const ALLOWED_EFFECT_TYPES: ReadonlyArray<EffectType> = ['DROP_SHADOW'];

const EFFECT_NAME_SUFFIX: Partial<Record<EffectType, string>> = {
  DROP_SHADOW: 'Shadow'
};

function hasAllowedEffects(node: SceneNode): boolean {
  if (!('effects' in node)) return false;
  const { effects } = node;
  return effects.some((e: Effect) => ALLOWED_EFFECT_TYPES.includes(e.type) && e.visible);
}

function getVisibleDropShadows(node: SceneNode & { effects: ReadonlyArray<Effect> }): DropShadowEffect[] {
  return node.effects.filter((e): e is DropShadowEffect => e.type === 'DROP_SHADOW' && e.visible);
}

function convertToVector(node: SceneNode, parent: BaseNode & ChildrenMixin, index: number): VectorNode {
  if ('outlineStroke' in node) {
    // SHould return null if no strokes are present but there might be a bug here
    const strokeOutline = (node as SceneNode & GeometryMixin).outlineStroke();
    if (strokeOutline !== null) {
      // Union fill geometry + stroke outline, then flatten to a single vector.
      const union = figma.union([node, strokeOutline], parent, index);
      return figma.flatten([union], parent, index);
    }
  }

  return figma.flatten([figma.union([node], parent, index)], parent, index);
}

function applySpread(vector: VectorNode, spread: number, parent: BaseNode & ChildrenMixin, index: number): VectorNode {
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

  // outlineStroke clones the node but the position may be off,
  // fix by using absoluteTransform
  strokeOutline.x = vector.absoluteTransform[0][2];
  strokeOutline.y = vector.absoluteTransform[1][2];

  const union =
    spread > 0
      ? figma.union([vector, strokeOutline], parent, index)
      : figma.subtract([vector, strokeOutline], parent, index);
  return figma.flatten([union], parent, index);
}

async function applyDropShadowToVector(vectorNode: VectorNode, shadow: DropShadowEffect): Promise<void> {
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
  } else {
    vectorNode.effects = [];
  }
}

/**
 * Processes a single node:
 *  1. Extracts visible drop-shadow effects.
 *  2. For each shadow, clones the node, flattens it to a vector, and applies
 *     the shadow as fill + blur + position offset.
 *  3. Removes the converted shadows from the original node.
 *  4. Groups the original with the generated shadow vectors.
 *
 * Returns the wrapping GroupNode on success, or `null` when there is nothing
 * to convert.
 */
async function processNode(node: SceneNode): Promise<GroupNode | null> {
  if (!('effects' in node)) return null;

  const effectsNode = node as SceneNode & { effects: ReadonlyArray<Effect> };
  const dropShadows = getVisibleDropShadows(effectsNode);
  if (dropShadows.length === 0) return null;

  const parent = node.parent;
  if (!parent) return null;

  const parentWithChildren = parent as BaseNode & ChildrenMixin;
  const nodeIndex = (parentWithChildren.children as ReadonlyArray<SceneNode>).indexOf(node);

  const shadowVectors: VectorNode[] = [];
  for (const shadow of dropShadows) {
    const clone = node.clone();
    // The new clone is at this point parented to figma.currentPage
    // so the position needs to be set according to the original's absolute transform
    clone.x = node.absoluteTransform[0][2];
    clone.y = node.absoluteTransform[1][2];

    let vector = convertToVector(clone, parentWithChildren, nodeIndex);

    // Emulate spread by expanding the vector outline.
    const spread = shadow.spread;
    if (spread !== undefined && spread !== 0) {
      vector = applySpread(vector, spread, parentWithChildren, nodeIndex);
    }

    await applyDropShadowToVector(vector, shadow);
    vector.name = `${node.name} (${EFFECT_NAME_SUFFIX[shadow.type]})`;
    shadowVectors.push(vector);
  }

  // Strip converted effects from the original node
  const remainingEffects = effectsNode.effects.filter((e) => e.type !== 'DROP_SHADOW' || e.visible === false);
  node.effects = remainingEffects;

  // Group result in place
  const groupIndex = (parentWithChildren.children as ReadonlyArray<SceneNode>).indexOf(
    shadowVectors[shadowVectors.length - 1]
  );
  const group = figma.group([node, ...shadowVectors], parentWithChildren, groupIndex);
  group.name = node.name;

  return group;
}

async function main(): Promise<void> {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.notify(t('noSelection'));
    figma.closePlugin();
    return;
  }

  let availableToConvertCount = 0;
  let convertedCount = 0;

  const newSelection: SceneNode[] = [];

  for (const node of [...selection]) {
    if (!hasAllowedEffects(node)) {
      newSelection.push(node);
      continue;
    }

    availableToConvertCount++;

    try {
      const group = await processNode(node);
      if (group) {
        convertedCount++;
        newSelection.push(group);
      } else {
        newSelection.push(node);
      }
    } catch (err) {
      console.error(`Error processing node "${node.name}":`, err);
      newSelection.push(node);
    }
  }

  figma.currentPage.selection = newSelection;

  if (convertedCount > 0) {
    figma.notify(t('partialSuccess', { converted: convertedCount, available: availableToConvertCount }));
  } else if (availableToConvertCount === 0) {
    figma.notify(t('noEffects'));
  } else {
    figma.notify(t('error'));
  }

  figma.closePlugin();
}

main();
