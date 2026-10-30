import { AssetTab } from './AssetTab';
import { FloorTab } from './FloorTab';
import { Preview } from './Preview';
import { SpriteTab } from './SpriteTab';
import { button, el } from './ui';
import { Workspace } from './Workspace';

// The asset maker page (asset-maker.html, dev server only). Three tabs edit three data files: sprites (pixel art),
// assets (what can be placed in a map) and floors. Save writes every changed file into src/data/; an open game
// tab reloads itself to show the change.

interface Tab {
  mount(list: HTMLElement, center: HTMLElement, props: HTMLElement): void;
  key?(e: KeyboardEvent): boolean;
}

const ws = new Workspace();
const preview = new Preview();
const floorTab = new FloorTab(ws, preview);
const tabs: Record<string, Tab> = {
  Sprites: new SpriteTab(ws, preview),
  Assets: new AssetTab(ws, preview, () => floorTab.current?.id ?? ''),
  Floors: floorTab,
};
let active = 'Sprites';

const list = el('aside', { class: 'list' });
const center = el('main', { class: 'center' });
const props = el('aside', { class: 'props' });
const tabBar = el('nav', {});
const status = el('span', { class: 'status' });
const saveButton = button('Save (Ctrl+S)', () => void save());

function showTab(name: string): void {
  active = name;
  tabBar.replaceChildren(...Object.keys(tabs).map((t) => button(t, () => showTab(t), { class: t === active ? 'on' : '' })));
  tabs[name].mount(list, center, props);
}

function updateStatus(): void {
  const dirty = [...ws.dirty];
  status.textContent = dirty.length ? `Not saved yet: ${dirty.join(', ')}` : 'Everything is saved.';
  status.className = dirty.length ? 'status warn' : 'status';
  saveButton.disabled = !dirty.length;
}

async function save(): Promise<void> {
  if (!ws.dirty.size) return;
  status.textContent = 'Saving…';
  try {
    await ws.save();
  } catch (e) {
    status.textContent = `Could not save: ${e instanceof Error ? e.message : e}`;
    status.className = 'status error';
  }
}

document.body.append(
  el('header', {}, el('h1', { text: 'Swimply asset maker' }), tabBar, saveButton, status, el('a', { href: '/', target: '_blank', text: 'open the game' })),
  el('div', { class: 'layout' }, list, center, props),
);
ws.onChange(updateStatus);
updateStatus();
showTab(active);
void preview.ready.then(() => showTab(active));

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    void save();
    return;
  }
  const t = e.target;
  if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
  if (tabs[active].key?.(e)) e.preventDefault();
});

// The browser asks before closing the page with unsaved work.
window.addEventListener('beforeunload', (e) => {
  if (ws.dirty.size) e.preventDefault();
});
