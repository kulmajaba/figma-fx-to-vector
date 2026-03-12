import {
  getVisibleDropShadows,
  hasSupportedEffects,
  hasSupportedEffectsDeep,
  isSupportedVisibleEffect
} from './effectUtils';
import t, { effectNameSuffix } from './strings';
import { convertToVector } from './vectorUtils';

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

  // outlineStroke clones the node but the position may be off,
  // fix by using absoluteTransform and offset by spread
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

/**
 * Processes a single node:
 *  1. Extracts visible drop-shadow effects.
 *  2. For each shadow, clones the node (or a snapshot if provided), flattens
 *     it to a vector, and applies the shadow as fill + blur + position offset.
 *  3. Removes the converted shadows from the original node.
 *  4. Groups the original with the generated shadow vectors.
 *
 * @param node     The live node whose effects will be stripped.
 * @param snapshot Optional clone taken before children were processed.
 *                 When provided, shadow vectors are derived from this snapshot
 *                 so that child-level conversions don't pollute the parent shape.
 *
 * Returns the wrapping `GroupNode` on success, or `null` when there is nothing
 * to convert.
 */
const processNode = async (node: SceneNode, snapshot?: SceneNode): Promise<GroupNode | null> => {
  if (!('effects' in node)) return null;

  const effectsNode = node as SceneNode & { effects: ReadonlyArray<Effect> };
  const dropShadows = getVisibleDropShadows(effectsNode);
  if (dropShadows.length === 0) return null;

  const parent = node.parent;
  if (!parent) return null;

  const nodeIndex = parent.children.indexOf(node);

  const cloneSource = snapshot ?? node;

  const shadowVectors: VectorNode[] = [];
  for (const shadow of dropShadows) {
    const clone = cloneSource.clone();
    // The new clone is at this point parented to figma.currentPage
    // so the position needs to be set according to the original's absolute transform
    clone.x = node.absoluteTransform[0][2];
    clone.y = node.absoluteTransform[1][2];

    let vector = convertToVector(clone, parent, nodeIndex);

    const spread = shadow.spread;
    if (spread !== undefined && spread !== 0) {
      vector = applySpread(vector, spread, parent, nodeIndex);
    }

    await applyDropShadowToVector(vector, shadow);
    vector.name = `${node.name} (${effectNameSuffix[shadow.type]})`;
    shadowVectors.push(vector);
  }

  if (snapshot) snapshot.remove();

  // Strip converted effects from the original node
  const remainingEffects = effectsNode.effects.filter((e) => !isSupportedVisibleEffect(e));
  node.effects = remainingEffects;

  // Group result in place
  const groupIndex = parent.children.indexOf(shadowVectors[shadowVectors.length - 1]);
  const group = figma.group([node, ...shadowVectors], parent, groupIndex);
  group.name = node.name;

  return group;
};

const processNodeDeep = async (
  node: SceneNode
): Promise<{ result: SceneNode; converted: number; available: number }> => {
  let converted = 0;
  let available = 0;

  const hasEffects = hasSupportedEffects(node);
  let snapshot = undefined;

  if ('children' in node) {
    // Snapshot the node before child processing if it has supported effects
    hasEffects && (snapshot = node.clone());

    const children = node.children;
    for (const child of children) {
      const childResult = await processNodeDeep(child);
      converted += childResult.converted;
      available += childResult.available;
    }
  }

  if (hasEffects) {
    available++;
    try {
      const group = await processNode(node, snapshot);
      if (group) {
        converted++;
        return { result: group, converted, available };
      }
    } catch (err) {
      console.error(`Error processing node "${node.name}":`, err);
      snapshot !== undefined && snapshot.remove();
    }
  }

  return { result: node, converted, available };
};

const main = async () => {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.notify(t('noSelection'));
    figma.closePlugin();
    return;
  }

  let totalConverted = 0;
  let totalAvailable = 0;
  const newSelection: SceneNode[] = [];

  for (const node of [...selection]) {
    if (!hasSupportedEffectsDeep(node)) {
      newSelection.push(node);
      continue;
    }

    const { result, converted, available } = await processNodeDeep(node);
    totalConverted += converted;
    totalAvailable += available;
    newSelection.push(result);
  }

  figma.currentPage.selection = newSelection;

  if (totalConverted > 0) {
    figma.notify(t('success', { converted: totalConverted, available: totalAvailable }));
  } else if (totalAvailable === 0) {
    figma.notify(t('noEffects'));
  } else {
    figma.notify(t('error'));
  }

  figma.closePlugin();
};

main();
