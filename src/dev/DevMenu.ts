import { exportJson, importJson, isChanged, listSections, onConfigChange, resetAll, Section, setValue } from '../config/store';
import { exportSave, importSave, resetSave } from '../core/save';

// A DOM overlay built from the config registry: every section any system defines shows up here with no extra code.
// Scenes add their own buttons through setActions.

export interface DevAction {
  label: string;
  run: () => void;
}

const css = `
#dev-menu { position: fixed; top: 0; right: 0; width: 340px; max-width: 100vw; height: 100%; overflow-y: auto;
  background: rgba(14, 12, 20, 0.94); color: #d9d2e9; font: 12px/1.4 monospace; box-sizing: border-box;
  padding: 10px 12px 40px; border-left: 1px solid #3a3350; z-index: 10; }
#dev-menu.hidden { display: none; }
#dev-menu h1 { font-size: 14px; margin: 0 0 8px; color: #f2d7a6; display: flex; justify-content: space-between; }
#dev-menu h1 small { color: #8a83a0; font-weight: normal; }
#dev-menu details { border-top: 1px solid #2a2538; padding: 4px 0; }
#dev-menu details details { margin-left: 8px; border-top: 1px solid #1f1b2c; }
#dev-menu details.group > summary { color: #f2d7a6; }
#dev-menu summary { cursor: pointer; color: #c9b6ff; padding: 2px 0; text-transform: uppercase; letter-spacing: 1px; }
#dev-menu details details > summary { text-transform: none; letter-spacing: 0; }
#dev-menu .row { display: grid; grid-template-columns: 1fr 90px 56px 16px; gap: 4px; align-items: center; margin: 3px 0; }
#dev-menu .row.changed label { color: #f2d7a6; }
#dev-menu .row label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#dev-menu input[type=range] { width: 100%; accent-color: #c9b6ff; }
#dev-menu input[type=number] { width: 100%; box-sizing: border-box; background: #1d1929; color: #e9e3f5;
  border: 1px solid #3a3350; font: inherit; padding: 1px 3px; }
#dev-menu button { background: #2a2538; color: #e9e3f5; border: 1px solid #443c5c; font: inherit; padding: 3px 7px;
  cursor: pointer; margin: 2px 2px 2px 0; }
#dev-menu button:hover { background: #3a3350; }
#dev-menu .reset { visibility: hidden; padding: 0; margin: 0; border: none; background: none; color: #8a83a0; }
#dev-menu .row.changed .reset { visibility: visible; }
#dev-menu .bar { display: flex; flex-wrap: wrap; gap: 2px; margin-bottom: 6px; align-items: center; }
#dev-toggle { position: fixed; left: 8px; bottom: 8px; z-index: 11; background: rgba(42, 37, 56, 0.6); color: #c9b6ff;
  border: 1px solid #443c5c; font: 11px monospace; padding: 3px 6px; cursor: pointer; }
`;

const label = (key: string): string => key.replace(/([A-Z])/g, ' $1').toLowerCase();

export class DevMenu {
  private static inst: DevMenu | null = null;

  static get(): DevMenu {
    return (DevMenu.inst ??= new DevMenu());
  }

  private root = document.createElement('div');
  private actionBar = document.createElement('div');
  private body = document.createElement('div');
  private refreshers: (() => void)[] = [];

  private constructor() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    this.root.id = 'dev-menu';
    this.root.className = 'hidden';
    document.body.appendChild(this.root);

    const toggle = document.createElement('button');
    toggle.id = 'dev-toggle';
    toggle.textContent = 'DEV';
    toggle.addEventListener('click', () => this.toggle());
    document.body.appendChild(toggle);

    // Drop focus after clicking so Space (dash) doesn't re-click a button.
    this.root.addEventListener('click', (e) => {
      if (e.target instanceof HTMLButtonElement) e.target.blur();
    });
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.toggle(false);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === '`' && !(e.target instanceof HTMLInputElement)) this.toggle();
    });

    const title = document.createElement('h1');
    title.innerHTML = 'Dev menu <small>` to close</small>';
    this.actionBar.className = 'bar';
    const tools = document.createElement('div');
    tools.className = 'bar';
    tools.append(
      this.button('Export tweaks', () => this.download('swimply-tweaks.json', exportJson())),
      this.button('Import tweaks', () => this.pick((t) => importJson(t))),
      this.button('Reset all tweaks', () => confirm('Reset every tweak to its default?') && resetAll()),
    );
    const saveTools = document.createElement('div');
    saveTools.className = 'bar';
    saveTools.append(
      this.button('Export save', () => this.download('swimply-save.json', exportSave())),
      this.button('Import save', () => this.pick((t) => importSave(t))),
      this.button('Reset save', () => confirm('Erase the saved game?') && resetSave()),
    );
    this.root.append(title, this.actionBar, tools, saveTools, this.body);
    this.build();
    onConfigChange(() => this.refreshAll());
  }

  setActions(actions: DevAction[]): void {
    this.actionBar.replaceChildren(...actions.map((a) => this.button(a.label, a.run)));
  }

  get open(): boolean {
    return !this.root.classList.contains('hidden');
  }

  toggle(force?: boolean): void {
    const show = force ?? !this.open;
    this.root.classList.toggle('hidden', !show);
    if (show) this.refreshAll();
    else (document.activeElement as HTMLElement | null)?.blur();
  }

  // Sections defined after the menu was built (a system loaded later) appear after this.
  build(): void {
    this.body.replaceChildren();
    this.refreshers = [];
    const groups = new Map<string, Section[]>();
    for (const s of listSections()) (groups.get(s.group) ?? groups.set(s.group, []).get(s.group)!).push(s);
    for (const [name, list] of groups) {
      const g = document.createElement('details');
      g.className = 'group';
      g.innerHTML = `<summary>${name}</summary>`;
      for (const s of list) g.appendChild(this.section(s));
      this.body.appendChild(g);
    }
  }

  private section(s: Section): HTMLElement {
    const d = document.createElement('details');
    d.innerHTML = `<summary>${s.name}</summary>`;
    for (const key of Object.keys(s.defaults)) d.appendChild(this.row(s, key));
    return d;
  }

  private row(s: Section, key: string): HTMLElement {
    const meta = s.meta[key];
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('label');
    name.textContent = label(key);
    row.appendChild(name);

    const reset = document.createElement('button');
    reset.className = 'reset';
    reset.textContent = '↺';
    reset.title = 'Back to default';
    reset.addEventListener('click', () => setValue(s.name, key, s.defaults[key]));

    let sync: () => void;
    if (meta === 'bool') {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.addEventListener('change', () => setValue(s.name, key, box.checked));
      row.append(box, document.createElement('span'), reset);
      sync = () => (box.checked = s.values[key] as boolean);
    } else {
      const slider = document.createElement('input');
      slider.type = 'range';
      Object.assign(slider, { min: meta.min, max: meta.max, step: meta.step });
      const num = document.createElement('input');
      num.type = 'number';
      Object.assign(num, { min: meta.min, max: meta.max, step: meta.step });
      slider.addEventListener('input', () => setValue(s.name, key, Number(slider.value)));
      num.addEventListener('change', () => setValue(s.name, key, Number(num.value)));
      row.append(slider, num, reset);
      sync = () => {
        slider.value = String(s.values[key]);
        num.value = String(Math.round((s.values[key] as number) * 1000) / 1000);
      };
    }
    this.refreshers.push(() => {
      sync();
      row.classList.toggle('changed', isChanged(s.name, key));
    });
    return row;
  }

  private refreshAll(): void {
    if (this.open) this.refreshers.forEach((r) => r());
  }

  private button(text: string, run: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = text;
    b.addEventListener('click', run);
    return b;
  }

  private download(name: string, text: string): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  private pick(use: (text: string) => void): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        use(await f.text());
      } catch {
        alert('That file could not be read.');
      }
    };
    input.click();
  }
}
