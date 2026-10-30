// Anything arrows can hit. Enemies and training dummies both implement this.
export interface Target {
  id: number;
  x: number;
  y: number;
  radius: number;
  alive: boolean;
}
