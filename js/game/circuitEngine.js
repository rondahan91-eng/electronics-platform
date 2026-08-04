// ==========================================================================
// circuitEngine.js - פותר מעגלים כללי: עץ טורי/מקבילי מקונן, DC ו-AC.
// כל עלה הוא רכיב (נגד / קבל / סליל). צמתי-אב הם 'series' או 'parallel'.
// ==========================================================================
import { Complex, csum, cparallel } from './complex.js';

let uid = 0;
export function nextId() { return 'c' + (++uid); }

export function R(value, maxPower, label) {
  return { id: nextId(), kind: 'r', type: 'r', value, maxPower, label };
}
export function Cap(value, maxPower, label) {
  return { id: nextId(), kind: 'c', type: 'c', value, maxPower, label };
}
export function Ind(value, maxPower, label) {
  return { id: nextId(), kind: 'l', type: 'l', value, maxPower, label };
}
export function Series(...children) { return { id: nextId(), type: 'series', children }; }
export function Parallel(...children) { return { id: nextId(), type: 'parallel', children }; }

function leafImpedance(node, omega) {
  if (node.kind === 'r') return new Complex(node.value, 0);
  if (node.kind === 'c') return new Complex(0, -1 / (omega * node.value));
  if (node.kind === 'l') return new Complex(0, omega * node.value);
  throw new Error('unknown leaf kind ' + node.kind);
}

function computeImpedance(node, omega) {
  if (node.type === 'r' || node.type === 'c' || node.type === 'l') {
    node._Z = leafImpedance(node, omega);
    return node._Z;
  }
  const childZ = node.children.map(ch => computeImpedance(ch, omega));
  node._Z = node.type === 'series' ? csum(childZ) : cparallel(childZ);
  return node._Z;
}

function distribute(node, currentIn, vTop) {
  node.current = currentIn;
  node.voltageDrop = currentIn.mul(node._Z);
  node.vTop = vTop;
  node.vBottom = vTop.sub(node.voltageDrop);

  if (node.type === 'series') {
    let v = vTop;
    for (const child of node.children) {
      distribute(child, currentIn, v);
      v = child.vBottom;
    }
  } else if (node.type === 'parallel') {
    const vAcross = node.voltageDrop;
    for (const child of node.children) {
      const childCurrent = vAcross.div(child._Z);
      distribute(child, childCurrent, vTop);
    }
  }
}

/**
 * פותר מעגל שלם.
 * @param {object} root - עץ הרכיבים (leaf/series/parallel)
 * @param {number} vSource - מתח המקור (Vdc, או Veff עבור AC)
 * @param {number} freqHz - תדר (Hz). 0/undefined עבור מעגלי DC טהורים.
 */
export function solveCircuit(root, vSource, freqHz = 0) {
  const omega = freqHz ? 2 * Math.PI * freqHz : 0;
  computeImpedance(root, omega || 1); // omega=1 dummy אם DC טהור (אין קבלים/סלילים בעץ DC)
  const Vs = new Complex(vSource, 0);
  const Ztotal = root._Z;
  const Itotal = Vs.div(Ztotal);
  distribute(root, Itotal, Vs);
  return { Ztotal, Itotal, root };
}

/** אוסף את כל העלים (רכיבים) מתוך העץ, בסדר עומק. */
export function collectLeaves(node, out = []) {
  if (node.type === 'r' || node.type === 'c' || node.type === 'l') { out.push(node); return out; }
  node.children.forEach(ch => collectLeaves(ch, out));
  return out;
}

/** הספק אמיתי המתפזר ברכיב נתון (רלוונטי בעיקר לנגדים). */
export function powerOnLeaf(node) {
  if (node.kind !== 'r') return 0;
  const Imag = node.current.abs();
  return Imag * Imag * node.value;
}

export function findNode(root, id) {
  if (root.id === id) return root;
  if (!root.children) return null;
  for (const ch of root.children) {
    const found = findNode(ch, id);
    if (found) return found;
  }
  return null;
}
