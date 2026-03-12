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

  /** Return all visible effects of this type on the node. */
  getEffects(node: SceneNode & { effects: ReadonlyArray<Effect> }): T[];

  /**
   * Apply the effect to a vector node that was cloned from the original.
   * Handles fill, blur, position, spread, variable rebinding, etc.
   */
  apply(
    vector: VectorNode,
    effect: T,
    parent: BaseNode & ChildrenMixin,
    index: number,
  ): Promise<VectorNode>;
}
