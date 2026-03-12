import { effectHandlers, effectLabelMap } from './effects';
import { hasSupportedEffects, hasSupportedEffectsDeep, isSupportedVisibleEffect } from './effectUtils';
import { convertToVector } from './vectorUtils';
import t from './strings';

/**
 * @param node Live node that will be mutated
 * @param snapshot Optional snapshot of the node before its childrens' effects are converted
 * @returns Resulting group or undefined if there is nothing to convert
 */
const processNode = async (node: SceneNode, snapshot?: SceneNode): Promise<GroupNode | undefined> => {
  if (!('effects' in node)) return undefined;

  const effectsNode = node as SceneNode & { effects: ReadonlyArray<Effect> };

  const parent = node.parent;
  if (!parent) return undefined;

  const nodeIndex = parent.children.indexOf(node);
  const cloneSource = snapshot ?? node;

  const generatedVectors: VectorNode[] = [];

  // Run every registered handler against this node's effects.
  for (const handler of effectHandlers) {
    const effects = handler.getEffects(effectsNode);

    // TODO: Optimize by hoisting some stuff
    for (const effect of effects) {
      const clone = cloneSource.clone();
      clone.x = node.absoluteTransform[0][2];
      clone.y = node.absoluteTransform[1][2];

      let vector = convertToVector(clone, parent, nodeIndex);
      vector = await handler.apply(vector, effect, parent, nodeIndex);
      vector.name = `${node.name} (${effectLabelMap.get(effect.type) ?? effect.type})`;
      generatedVectors.push(vector);
    }
  }

  if (snapshot) snapshot.remove();

  if (generatedVectors.length === 0) {
    return undefined;
  }

  // Strip converted effects from the original node
  const remainingEffects = effectsNode.effects.filter((e) => !isSupportedVisibleEffect(e));
  node.effects = remainingEffects;

  // Group result in place
  const groupIndex = parent.children.indexOf(generatedVectors[generatedVectors.length - 1]);
  const group = figma.group([node, ...generatedVectors], parent, groupIndex);
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
