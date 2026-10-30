import { bow, player } from '../config/character';

// The character's effective stats. Systems read these, never the raw config, so the permanent baseline from the
// upgrade tree (a later phase) is added in exactly one place: here.
export const stats = {
  moveSpeed: (): number => player.moveSpeed,
  fireRate: (): number => bow.fireRate,
  arrows: (): number => Math.round(bow.arrowsPerShot),
  pierce: (): number => Math.round(bow.pierce),
  range: (): number => bow.arrowRange,
  damage: (): number => bow.damage,
  arrowSize: (): number => 1,
};
