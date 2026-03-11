import strings from "./strings";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Effect types handled by this plugin (MVP: drop shadow only). */
const ALLOWED_EFFECT_TYPES: ReadonlyArray<string> = ["DROP_SHADOW"];

// ---------------------------------------------------------------------------
// Helpers – effect inspection
// ---------------------------------------------------------------------------

/** Checks whether a node carries at least one visible effect we can convert. */
function hasAllowedEffects(node: SceneNode): boolean {
  if (!("effects" in node)) return false;
  const { effects } = node as SceneNode & BlendMixin;
  return effects.some(
    (e: Effect) => ALLOWED_EFFECT_TYPES.includes(e.type) && e.visible !== false,
  );
}

/** Returns all visible drop-shadow effects on a node. */
function getDropShadows(
  node: SceneNode & { effects: ReadonlyArray<Effect> },
): DropShadowEffect[] {
  return node.effects.filter(
    (e): e is DropShadowEffect =>
      e.type === "DROP_SHADOW" && e.visible !== false,
  );
}

// ---------------------------------------------------------------------------
// Helpers – node conversion
// ---------------------------------------------------------------------------

/**
 * Converts a node to a simple VectorNode if it isn't one already.
 * Uses `figma.flatten` (union + flatten) which handles groups, boolean ops,
 * frames, and other complex node types.
 */
function convertToVector(
  node: SceneNode,
  parent: BaseNode & ChildrenMixin,
  index: number,
): VectorNode {
  if (node.type === "VECTOR") {
    // Already a vector – just make sure it sits at the right index.
    parent.insertChild(index, node);
    return node;
  }
  return figma.flatten([node], parent, index);
}

// ---------------------------------------------------------------------------
// Helpers – applying a shadow as a vector
// ---------------------------------------------------------------------------

/**
 * Turns a drop-shadow definition into visual properties on a vector node:
 *   • shadow color  → solid fill (with opacity from alpha channel)
 *   • shadow blur   → layer blur effect
 *   • shadow offset → position delta
 *   • blend mode    → node blend mode
 *
 * Bound variables are re-applied where the Figma API allows it
 * (color → fill paint, radius → blur effect).
 */
async function applyDropShadowToVector(
  vectorNode: VectorNode,
  shadow: DropShadowEffect,
): Promise<void> {
  const { color, offset, radius, blendMode } = shadow;

  // --- Fill ---------------------------------------------------------------
  let fillPaint: SolidPaint = {
    type: "SOLID",
    color: { r: color.r, g: color.g, b: color.b },
    opacity: color.a,
    visible: true,
  };

  if (shadow.boundVariables?.color) {
    const variable = await figma.variables.getVariableByIdAsync(
      shadow.boundVariables.color.id,
    );
    if (variable) {
      fillPaint = figma.variables.setBoundVariableForPaint(
        fillPaint,
        "color",
        variable,
      );
    }
  }

  vectorNode.fills = [fillPaint];
  vectorNode.strokes = [];

  // --- Position offset ----------------------------------------------------
  vectorNode.x += offset.x;
  vectorNode.y += offset.y;

  // --- Blend mode ---------------------------------------------------------
  vectorNode.blendMode = blendMode;

  // --- Layer blur ---------------------------------------------------------
  const hasBoundRadius = !!shadow.boundVariables?.radius;

  if (radius > 0 || hasBoundRadius) {
    let blurEffect: BlurEffect = {
      type: "LAYER_BLUR",
      blurType: "NORMAL",
      radius,
      visible: true,
    };

    if (hasBoundRadius) {
      const variable = await figma.variables.getVariableByIdAsync(
        shadow.boundVariables!.radius!.id,
      );
      if (variable) {
        blurEffect = figma.variables.setBoundVariableForEffect(
          blurEffect,
          "radius",
          variable,
        ) as BlurEffect;
      }
    }

    vectorNode.effects = [blurEffect];
  } else {
    vectorNode.effects = [];
  }
}

// ---------------------------------------------------------------------------
// Per-node processing
// ---------------------------------------------------------------------------

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
  if (!("effects" in node)) return null;

  const effectsNode = node as SceneNode & { effects: ReadonlyArray<Effect> };
  const dropShadows = getDropShadows(effectsNode);
  if (dropShadows.length === 0) return null;

  const parent = node.parent;
  if (!parent || !("children" in parent)) return null;

  const parentWithChildren = parent as BaseNode & ChildrenMixin;
  const nodeIndex = (
    parentWithChildren.children as ReadonlyArray<SceneNode>
  ).indexOf(node);

  // --- Create a shadow vector for each drop-shadow effect -----------------
  const shadowVectors: VectorNode[] = [];

  for (const shadow of dropShadows) {
    const clone = node.clone();

    // Convert to a flat vector placed just below the original.
    // Inserting at `nodeIndex` pushes the original (and earlier vectors)
    // one position up each time, so the first shadow ends up directly
    // beneath the original and the last shadow sits at the very back.
    const vector = convertToVector(clone, parentWithChildren, nodeIndex);

    await applyDropShadowToVector(vector, shadow);
    shadowVectors.push(vector);
  }

  // --- Strip converted shadows from the original --------------------------
  const remainingEffects = effectsNode.effects.filter(
    (e) => e.type !== "DROP_SHADOW" || e.visible === false,
  );
  (node as SceneNode & BlendMixin).effects = remainingEffects;

  // --- Group everything (original on top, shadows below) ------------------
  // After inserting shadow vectors the indices have shifted. Recalculate so
  // the new group sits in the same layer position as the original node.
  const groupIndex = (
    parentWithChildren.children as ReadonlyArray<SceneNode>
  ).indexOf(shadowVectors[shadowVectors.length - 1]);
  const group = figma.group(
    [node, ...shadowVectors],
    parentWithChildren,
    groupIndex,
  );
  group.name = node.name;

  return group;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.notify(strings.noSelection);
    figma.closePlugin();
    return;
  }

  let convertedCount = 0;
  const newSelection: SceneNode[] = [];

  // Iterate over a snapshot – the live selection array mutates as we regroup.
  for (const node of [...selection]) {
    if (!hasAllowedEffects(node)) {
      newSelection.push(node);
      continue;
    }

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
    figma.notify(strings.success);
  } else {
    figma.notify(strings.noEffects);
  }

  figma.closePlugin();
}

main();
