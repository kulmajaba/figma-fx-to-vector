/**
 * Interface that every effect-to-vector handler must implement.
 *
 * Each handler is responsible for:
 *  1. Extracting its target effects from a node.
 *  2. Converting a vector clone to represent one effect instance.
 */
export interface EffectHandler<T extends Effect = Effect> {
  /** The Figma effect type this handler deals with. */
  readonly type: T['type'];

  /** Human-readable label used for naming generated nodes, e.g. "Shadow". */
  readonly label: string;

  /**
   * Where the generated node should be placed relative to the original.
   *  - `'below'` – behind the original (e.g. drop shadow)
   *  - `'above'` – in front of the original (e.g. inner shadow)
   */
  readonly placement: 'below' | 'above';

  /** Return all visible effects of this type on the node. */
  getEffects(node: SceneNode & { effects: ReadonlyArray<Effect> }): T[];

  /**
   * Build the effect node from a vector clone of the original.
   *
   * The handler may create additional geometry (extra clones, rectangles, masks)
   * and return any `SceneNode` — a single vector, a group, etc.
   *
   * @param vector  Flattened vector clone of the original node.
   * @param effect  The effect being converted.
   * @param parent  The parent container for any new nodes.
   * @param index   Insertion index inside `parent`.
   * @param originalNode  The live original node (for making additional clones).
   */
  apply(vector: VectorNode, effect: T, parent: BaseNode & ChildrenMixin, index: number): Promise<SceneNode>;
}
