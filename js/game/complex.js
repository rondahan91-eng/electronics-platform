// מספרים מרוכבים - נדרשים לחישובי עכבה (Z) במעגלי זרם חילופין.
export class Complex {
  constructor(re = 0, im = 0) { this.re = re; this.im = im; }

  static from(x) { return x instanceof Complex ? x : new Complex(x, 0); }

  add(o) { o = Complex.from(o); return new Complex(this.re + o.re, this.im + o.im); }
  sub(o) { o = Complex.from(o); return new Complex(this.re - o.re, this.im - o.im); }
  mul(o) {
    o = Complex.from(o);
    return new Complex(this.re * o.re - this.im * o.im, this.re * o.im + this.im * o.re);
  }
  div(o) {
    o = Complex.from(o);
    const d = o.re * o.re + o.im * o.im;
    if (d === 0) return new Complex(Infinity, Infinity);
    return new Complex(
      (this.re * o.re + this.im * o.im) / d,
      (this.im * o.re - this.re * o.im) / d
    );
  }
  reciprocal() { return new Complex(1, 0).div(this); }
  abs() { return Math.hypot(this.re, this.im); }
  phaseDeg() { return Math.atan2(this.im, this.re) * (180 / Math.PI); }
}

export function csum(list) {
  return list.reduce((acc, c) => acc.add(c), new Complex(0, 0));
}

export function cparallel(list) {
  // 1 / sum(1/Zi)
  const sumRecip = csum(list.map(z => z.reciprocal()));
  return sumRecip.reciprocal();
}
