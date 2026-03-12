export const convertToVector = (node: SceneNode, parent: BaseNode & ChildrenMixin, index: number) => {
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
};
