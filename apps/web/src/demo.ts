// Demonstration only: never use this client-side function for real authorization.
export type DemoState = 'waiting' | 'confirmed';
export function confirmExample(state: DemoState): DemoState {
  return state === 'waiting' ? 'confirmed' : state;
}
