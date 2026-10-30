export class Pool<T extends { active: boolean }> {
  readonly items: T[] = [];

  constructor(private create: () => T) {}

  // Where the last free item was found: scanning resumes there, so grabbing many at once stays cheap.
  private cursor = 0;

  obtain(): T {
    const n = this.items.length;
    for (let k = 0; k < n; k++) {
      const i = (this.cursor + k) % n;
      const item = this.items[i];
      if (!item.active) {
        this.cursor = i + 1;
        return item;
      }
    }
    const item = this.create();
    this.items.push(item);
    this.cursor = 0;
    return item;
  }

  get activeCount(): number {
    let n = 0;
    for (const item of this.items) if (item.active) n++;
    return n;
  }
}
