// Shared editor state (no classes) — exported bindings are live and can be mutated
export const selectedElements = [];
export const selectedCursors = [];

let rounding = 32;
export function getRounding() { return rounding; }
export function setRounding(v) { rounding = v; }
