// "The latest value" for callbacks that are created once and called later (editor extensions, undo selection,
// awareness listeners). Written in a layout effect, read only when a callback runs; never read during render.
// A plain object rather than a React ref, so a reader of it can be handed to a factory while rendering.
export class Latest<T> {
  constructor(private value: T) {}

  get(): T {
    return this.value;
  }

  set(value: T): void {
    this.value = value;
  }
}
