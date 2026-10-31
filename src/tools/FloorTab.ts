import { Floor } from '../data/floors';
import { hex } from './files';
import { Preview } from './Preview';
import { button, checkbox, colorInput, el, ID_PATTERN, row, textInput, uniqueId } from './ui';
import { Workspace } from './Workspace';

// Edits floors.json: the kinds of ground a map is painted with. The asset tab's preview stands on the floor
// chosen here.
export class FloorTab {
  current: Floor | null;
  private list = el('div', {});
  private props = el('div', {});

  constructor(private ws: Workspace, private preview: Preview) {
    this.current = ws.floors[0] ?? null;
  }

  mount(list: HTMLElement, center: HTMLElement, props: HTMLElement): void {
    list.replaceChildren(this.list);
    center.replaceChildren(this.preview.host, el('p', { class: 'hint', text: 'Each tile picks one of the floor\'s colours by its position, so a floor is not one flat colour.' }));
    props.replaceChildren(this.props);
    this.refresh();
  }

  private refresh(): void {
    this.list.replaceChildren(
      el('h2', { text: 'Floors' }),
      ...this.ws.floors.map((f) => button(f.name, () => this.open(f), { class: f === this.current ? 'item on' : 'item' })),
      el('div', { class: 'bar' },
        button('New', () => this.create()),
        button('Delete', () => this.remove(), { disabled: !this.current }),
      ),
    );
    this.buildProps();
    this.show();
  }

  private show(): void {
    if (this.current) this.preview.show(null, this.current);
  }

  private edit(): void {
    this.ws.touch('floors');
    this.show();
  }

  private buildProps(): void {
    const f = this.current;
    if (!f) {
      this.props.replaceChildren(el('p', { class: 'hint', text: 'No floor yet. Press New.' }));
      return;
    }
    const used = this.ws.mapsUsingFloor(f.id);
    const colors = f.colors.map((c, i) => {
      const input = colorInput(hex(c), (v) => { f.colors[i] = parseInt(v.slice(1), 16); this.edit(); });
      return el('span', { class: 'chip' }, input, button('×', () => {
        if (f.colors.length > 1) f.colors.splice(i, 1);
        this.edit();
        this.buildProps();
      }, { title: 'remove this colour' }));
    });
    this.props.replaceChildren(
      el('h2', { text: 'Floor' }),
      row('id', textInput(f.id, (v) => this.rename(v))),
      used.length ? el('p', { class: 'hint', text: `Used in map${used.length > 1 ? 's' : ''}: ${used.join(', ')}. Its id is locked so those maps keep finding it.` }) : '',
      row('name', textInput(f.name, (v) => { f.name = v || f.id; this.edit(); this.refresh(); })),
      row('blocks walking', checkbox(f.blocks, (v) => { f.blocks = v; this.edit(); })),
      row('kills the player', checkbox(!!f.hurts, (v) => { f.hurts = v; this.edit(); })),
      el('p', { class: 'hint', text: 'Standing on it kills the player, unless they are dashing or teleporting (or in the short grace after). Enemies ignore it.' }),
      el('p', { class: 'hint', text: 'A blocking floor (water, a cliff) cannot be walked on or teleported onto. Arrows and teleports pass over it.' }),
      el('h3', { text: 'Colours' }),
      el('div', { class: 'chips' }, ...colors),
      el('div', { class: 'bar' }, button('Add colour', () => { f.colors.push(f.colors[f.colors.length - 1] ?? 0x1b1822); this.edit(); this.buildProps(); })),
    );
  }

  private open(f: Floor): void {
    this.current = f;
    this.refresh();
  }

  private taken = (id: string): boolean => this.ws.floors.some((f) => f.id === id);

  private create(): void {
    const id = uniqueId('floor', this.taken);
    const f: Floor = { id, name: id, colors: [...(this.current?.colors ?? [0x1b1822])], blocks: false, hurts: false };
    this.ws.floors.push(f);
    this.ws.touch('floors');
    this.open(f);
  }

  private remove(): void {
    const f = this.current;
    if (!f) return;
    const used = this.ws.mapsUsingFloor(f.id);
    if (used.length) return alert(`"${f.name}" is painted in ${used.join(', ')}, so it cannot be deleted.`);
    if (this.ws.floors.length === 1) return alert('The game needs at least one floor.');
    if (!confirm(`Delete the floor "${f.name}"? It is gone from the file once you save.`)) return;
    this.ws.floors.splice(this.ws.floors.indexOf(f), 1);
    this.ws.touch('floors');
    this.current = this.ws.floors[0] ?? null;
    this.refresh();
  }

  private rename(id: string): void {
    const f = this.current;
    if (!f || id === f.id) return;
    let problem = '';
    if (this.ws.mapsUsingFloor(f.id).length) problem = 'Maps use this id, so it cannot change here.';
    else if (!ID_PATTERN.test(id)) problem = 'An id can only use letters, digits, "-" and "_".';
    else if (this.taken(id)) problem = `There is already a floor called "${id}".`;
    if (problem) {
      alert(problem);
      return this.buildProps();
    }
    if (f.name === f.id) f.name = id;
    f.id = id;
    this.ws.touch('floors');
    this.refresh();
  }
}
